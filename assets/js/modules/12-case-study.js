// Module 12: case study, a lithography process (NIST 6.6.1).
//
// The handbook's data file is not reproduced here. Every figure uses a seeded
// simulation with the handbook's design (30 cassettes × 3 wafers × 5 sites), its
// overall mean and its variance components, plus a fixed site pattern like the one
// in the real data (Top reads high, Center reads low).

import { Chart, el, dataTable } from '../chart.js';
import { rng, mean, sd, sum, min, max, quantile, subgroups, xbarS, imr, movingRanges, normCdf, normPdf, fmt, fmtRate } from '../stats.js';
import { segmented, readouts, legend, bindRange, $ } from '../ui.js';

/* ---------- the simulated dataset ---------- */

const SITES = ['Top', 'Lef', 'Cen', 'Rgt', 'Bot'];
const SITE_NAMES = { Top: 'Top', Lef: 'Left', Cen: 'Center', Rgt: 'Right', Bot: 'Bottom' };
// fixed offsets that sum to zero
const SITE_EFFECT = [0.40, 0.00, -0.35, 0.05, -0.10];
// the handbook's variance components from its nested random-effects ANOVA
const HB = { c: 0.2645, w: 0.0500, s: 0.1755 };
const MU = 2.53;
const SEED = 1483;
const NC = 30, NW = 3, NS = 5, PER_LOT = NW * NS, N = NC * PER_LOT;
const NOMINAL = 0.0027;

function simulate(seed) {
  const R = rng(seed);
  // the site component includes the fixed pattern; random noise makes up the rest
  const patternVar = sum(SITE_EFFECT.map((e) => e * e)) / (NS - 1);
  const sdC = Math.sqrt(HB.c), sdW = Math.sqrt(HB.w), sdE = Math.sqrt(HB.s - patternVar);
  const rows = [];
  for (let c = 1; c <= NC; c++) {
    const C = R.normal(0, sdC);
    for (let w = 1; w <= NW; w++) {
      const W = R.normal(0, sdW);
      for (let k = 0; k < NS; k++) {
        rows.push({ c, w, k, site: SITES[k], seq: rows.length + 1, y: MU + C + W + SITE_EFFECT[k] + R.normal(0, sdE) });
      }
    }
  }
  return rows;
}

/** Balanced nested ANOVA: cassette, wafer within cassette, site within wafer. */
function nestedAnova(y) {
  const gm = mean(y);
  const cm = subgroups(y, PER_LOT).map(mean);
  const wm = subgroups(y, NS).map(mean);
  const ssC = PER_LOT * sum(cm.map((m) => (m - gm) ** 2));
  const ssW = NS * sum(wm.map((m, j) => (m - cm[Math.floor(j / NW)]) ** 2));
  const ssS = sum(y.map((v, i) => (v - wm[Math.floor(i / NS)]) ** 2));
  const df = [NC - 1, NC * (NW - 1), NC * NW * (NS - 1)];
  const ms = [ssC / df[0], ssW / df[1], ssS / df[2]];
  return { gm, df, ss: [ssC, ssW, ssS], ms, vc: [(ms[0] - ms[1]) / PER_LOT, (ms[1] - ms[2]) / NS, ms[2]] };
}

const ROWS = simulate(SEED);
const Y = ROWS.map((r) => r.y);
const LOTS = subgroups(Y, PER_LOT);
const LOT_MEANS = LOTS.map(mean);
const ANOVA = nestedAnova(Y);

const idx = (c, w, k) => (c - 1) * PER_LOT + (w - 1) * NS + k; // 0-based reading index
const where = (r) => `cassette ${r.c}, wafer ${r.w}, ${SITE_NAMES[r.site]}`;
const pct = (v, d = 0) => `${fmt(100 * v, d)}%`;

/** Shade every second cassette. `per` is the number of plotted points per cassette, x starting at 1. */
function lotBands(per) {
  const out = [];
  for (let c = 2; c <= NC; c += 2) out.push({ type: 'xband', x0: (c - 1) * per + 0.5, x1: c * per + 0.5, cls: 'band' });
  return out;
}

/** Control lines with labels such as "UCL 2.88" or "UCL: LL 4.25". */
function limitLines(lim, { d = 2, tag = '', cls = 'limit', center = true, lower = true } = {}) {
  const out = [{ type: 'hline', y: lim.ucl, cls, label: `UCL${tag} ${fmt(lim.ucl, d)}` }];
  if (center) out.push({ type: 'hline', y: lim.cl, cls: 'center', label: `CL ${fmt(lim.cl, d)}` });
  if (lower && lim.lcl > 0) out.push({ type: 'hline', y: lim.lcl, cls, label: `LCL${tag} ${fmt(lim.lcl, d)}` });
  return out;
}

const outside = (v, lim) => v > lim.ucl || (lim.lcl > 0 && v < lim.lcl);
const sideNote = (v, lim, tag = '') => (v > lim.ucl ? `Above the UCL${tag}` : lim.lcl > 0 && v < lim.lcl ? `Below the LCL${tag}` : undefined);

function domainOf(values, extra = [], padFrac = 0.06) {
  const lo = Math.min(...values, ...extra), hi = Math.max(...values, ...extra);
  const p = (hi - lo) * padFrac || 0.1;
  return [lo - p, hi + p];
}

/* ---------- Fig 12.1: wafer map (die grid and site averages) ---------- */
{
  const g = $('#wafer-dies');
  if (g) {
    const cx = 170, cy = 170, r0 = 140, size = 21, step = 25;
    for (let i = -6; i <= 6; i++) {
      for (let j = -6; j <= 6; j++) {
        const x0 = cx + i * step - size / 2, y0 = cy + j * step - size / 2;
        const far = Math.max(...[[x0, y0], [x0 + size, y0], [x0, y0 + size], [x0 + size, y0 + size]].map(([x, y]) => Math.hypot(x - cx, y - cy)));
        if (far < r0 - 6) el('rect', { class: 'dg-zone', x: x0, y: y0, width: size, height: size, rx: 2.5 }, g);
      }
    }
  }
  SITES.forEach((s, k) => {
    const t = $(`#wm-${s.toLowerCase()}`);
    if (t) t.textContent = `avg ${fmt(mean(ROWS.filter((r) => r.k === k).map((r) => r.y)), 2)}`;
  });
  dataTable($('#litho-table'), [
    { label: 'Sequence', key: 'seq' },
    { label: 'Cassette', key: 'c' },
    { label: 'Wafer', key: 'w' },
    { label: 'Site', key: 'site', num: false },
    { label: 'Line width', key: 'y', fmt: (v) => fmt(v, 4) },
  ], ROWS);
}

/* ---------- Fig 12.2: run plot in measurement order ---------- */
{
  const chart = new Chart($('#run-chart'), { height: 300 });
  const meansBox = $('#run-means');
  let site = 'all';
  const dom = domainOf(Y, [], 0.04);
  const meanSegs = [];
  LOT_MEANS.forEach((m, i) => meanSegs.push([i * PER_LOT + 0.5, m], [(i + 1) * PER_LOT + 0.5, m], null));
  const siteMeans = SITES.map((s, k) => mean(ROWS.filter((r) => r.k === k).map((r) => r.y)));
  const all = ROWS.map((r) => [r.seq, r.y]);

  function draw() {
    const hl = site === 'all' ? -1 : SITES.indexOf(site);
    const mine = hl < 0 ? all : ROWS.filter((r) => r.k === hl).map((r) => [r.seq, r.y]);
    const rest = hl < 0 ? [] : ROWS.filter((r) => r.k !== hl).map((r) => [r.seq, r.y]);
    chart.update({
      x: { domain: [0.5, N + 0.5], label: 'Measurement order' },
      y: { domain: dom, label: 'Line width' },
      aria: `Run plot of all 450 simulated line widths in measurement order${hl < 0 ? '' : `, with the ${SITE_NAMES[site]} site highlighted`}`,
      layers: [
        ...lotBands(PER_LOT),
        { type: 'line', points: all, cls: 'data-thin', hidden: hl >= 0 },
        { type: 'dots', points: rest, cls: 'dot-muted', r: 2.2 },
        { type: 'dots', points: mine, cls: hl < 0 ? 'dot' : 'dot-alt', r: hl < 0 ? 2.6 : 3.2 },
        { type: 'line', points: meanSegs, cls: 'alt2', hidden: !meansBox.checked },
      ],
      hover: {
        xs: all.map((p) => p[0]),
        mark: (i) => all[i],
        render: (i) => {
          const r = ROWS[i];
          return {
            title: `Reading ${r.seq}: ${where(r)}`,
            rows: [
              { label: 'line width', value: fmt(r.y, 3) },
              { label: `cassette ${r.c} mean`, value: fmt(LOT_MEANS[r.c - 1], 3), key: 'alt2' },
            ],
          };
        },
      },
    });
    legend($('#run-legend'), [
      { label: hl < 0 ? 'Line width' : `${SITE_NAMES[site]} site`, swatch: 'dot', color: hl < 0 ? 'data' : 'alt' },
      ...(hl < 0 ? [] : [{ label: 'Other sites', swatch: 'dot', color: 'muted' }]),
      ...(meansBox.checked ? [{ label: 'Cassette mean', swatch: 'line', color: 'alt2' }] : []),
    ]);
    const lo = Math.min(...siteMeans), hi = Math.max(...siteMeans);
    readouts($('#run-readouts'), [
      { label: 'Mean', value: fmt(mean(Y), 2), sub: 'Handbook 2.53' },
      { label: 'Standard deviation', value: fmt(sd(Y), 2), sub: 'Handbook 0.69' },
      { label: 'Median', value: fmt(quantile(Y, 0.5), 2), sub: 'Handbook 2.45' },
      { label: 'Smallest to largest', value: `${fmt(min(Y), 2)} to ${fmt(max(Y), 2)}`, sub: 'Handbook 0.75 to 5.17' },
      hl < 0
        ? { label: 'Site means', value: `${fmt(lo, 2)} to ${fmt(hi, 2)}`, sub: 'Center lowest, Top highest' }
        : { label: `${SITE_NAMES[site]} site mean`, value: fmt(siteMeans[hl], 2), sub: `${siteMeans[hl] >= mean(Y) ? '+' : ''}${fmt(siteMeans[hl] - mean(Y), 2)} from the overall mean` },
    ]);
  }
  segmented('run-site', (v) => { site = v; draw(); });
  meansBox.addEventListener('change', draw);
  draw();
}

/* ---------- Fig 12.3: box plots by cassette, site and wafer ---------- */

function boxStats(v) {
  const q1 = quantile(v, 0.25), med = quantile(v, 0.5), q3 = quantile(v, 0.75), iqr = q3 - q1;
  const lo = q1 - 1.5 * iqr, hi = q3 + 1.5 * iqr;
  const inside = v.filter((x) => x >= lo && x <= hi);
  return { q1, med, q3, lo: min(inside), hi: max(inside), out: v.filter((x) => x < lo || x > hi), n: v.length };
}

function boxLayers(stats) {
  return [
    {
      type: 'custom',
      draw(g, sx, sy) {
        const unit = Math.abs(sx(2) - sx(1));
        const w = Math.max(4, Math.min(40, unit * 0.62));
        stats.forEach((b, i) => {
          const x = sx(i + 1);
          el('line', { class: 'k-ink', x1: x, x2: x, y1: sy(b.hi), y2: sy(b.q3) }, g);
          el('line', { class: 'k-ink', x1: x, x2: x, y1: sy(b.q1), y2: sy(b.lo) }, g);
          el('line', { class: 'k-ink', x1: x - w / 4, x2: x + w / 4, y1: sy(b.hi), y2: sy(b.hi) }, g);
          el('line', { class: 'k-ink', x1: x - w / 4, x2: x + w / 4, y1: sy(b.lo), y2: sy(b.lo) }, g);
          el('rect', { class: 'k-area-strong', x: x - w / 2, y: sy(b.q3), width: w, height: Math.max(1, sy(b.q1) - sy(b.q3)), rx: 2 }, g);
          el('line', { class: 'k-curve', x1: x - w / 2, x2: x + w / 2, y1: sy(b.med), y2: sy(b.med) }, g);
        });
      },
    },
    { type: 'dots', points: stats.flatMap((b, i) => b.out.map((v) => [i + 1, v])), cls: 'dot-hollow', r: 2.6 },
  ];
}

function boxHover(stats, name) {
  return {
    xs: stats.map((_, i) => i + 1),
    mark: (i) => [i + 1, stats[i].med],
    render: (i) => {
      const b = stats[i];
      return {
        title: name(i),
        rows: [
          { label: 'median', value: fmt(b.med, 2) },
          { label: 'middle half', value: `${fmt(b.q1, 2)} to ${fmt(b.q3, 2)}`, key: 'none' },
          { label: b.out.length === 1 ? 'outlier' : 'outliers', value: String(b.out.length), key: 'none' },
        ],
      };
    },
  };
}

{
  const margin = { top: 18, right: 14, bottom: 40, left: 50 };
  const casChart = new Chart($('#box-cas'), { height: 280, margin });
  const otherChart = new Chart($('#box-other'), { height: 280, margin });
  const dom = domainOf(Y, [], 0.04);
  const byCas = LOTS.map(boxStats);
  const bySite = SITES.map((_, k) => boxStats(ROWS.filter((r) => r.k === k).map((r) => r.y)));
  const byWafer = [1, 2, 3].map((w) => boxStats(ROWS.filter((r) => r.w === w).map((r) => r.y)));
  const gm = mean(Y);

  casChart.update({
    x: { domain: [0.5, NC + 0.5], label: 'Cassette', ticks: [1, 5, 10, 15, 20, 25, 30] },
    y: { domain: dom, label: 'Line width' },
    aria: 'Box plots of the simulated line widths for each of the 30 cassettes',
    layers: [{ type: 'hline', y: gm, cls: 'center' }, ...boxLayers(byCas)],
    hover: boxHover(byCas, (i) => `Cassette ${i + 1}`),
  });

  function drawOther(by) {
    const site = by === 'site';
    const stats = site ? bySite : byWafer;
    otherChart.update({
      x: { domain: [0.5, stats.length + 0.5], label: site ? 'Site' : 'Wafer within cassette', ticks: stats.map((_, i) => i + 1), format: (v) => (site ? SITES[v - 1] : `W${v}`) },
      y: { domain: dom, label: 'Line width' },
      aria: site ? 'Box plots of line width for each of the five sites' : 'Box plots of line width for wafer positions 1, 2 and 3',
      layers: [{ type: 'hline', y: gm, cls: 'center' }, ...boxLayers(stats)],
      hover: boxHover(stats, (i) => (site ? `${SITE_NAMES[SITES[i]]} site` : `Wafer ${i + 1} of each cassette`)),
    });
  }
  const span = (stats) => {
    const meds = stats.map((b) => b.med);
    return { value: `${fmt(Math.min(...meds), 2)} to ${fmt(Math.max(...meds), 2)}`, sub: `A spread of ${fmt(Math.max(...meds) - Math.min(...meds), 2)}` };
  };
  readouts($('#box-readouts'), [
    { label: 'Cassette medians', ...span(byCas) },
    { label: 'Site medians', ...span(bySite) },
    { label: 'Wafer medians', ...span(byWafer) },
  ]);
  segmented('box-by', drawOther);
  drawOther('site');
}

/* ---------- naive Shewhart charts for each subgrouping ---------- */

function naiveCharts(values, mode) {
  if (mode === 'site') {
    const r = imr(values);
    return { per: PER_LOT, means: values, lim: r.x, spread: r.mrs, spreadLim: r.mr, spreadLabel: 'Moving range', spreadX0: 2, unit: 'Reading' };
  }
  const n = mode === 'wafer' ? NS : PER_LOT;
  const r = xbarS(subgroups(values, n));
  return { per: mode === 'wafer' ? NW : 1, means: r.xbars, lim: r.x, spread: r.sds, spreadLim: r.s, spreadLabel: 's', spreadX0: 1, unit: mode === 'wafer' ? 'Wafer' : 'Cassette' };
}

function pointTitle(mode, i) {
  if (mode === 'site') return `Reading ${i + 1}: ${where(ROWS[i])}`;
  if (mode === 'wafer') return `Cassette ${Math.floor(i / NW) + 1}, wafer ${(i % NW) + 1}`;
  return `Cassette ${i + 1}`;
}

/* ---------- Fig 12.4: the naive X̄–s chart ---------- */
{
  const meanChart = new Chart($('#naive-mean'), { height: 250 });
  const spreadChart = new Chart($('#naive-spread'), { height: 170 });
  const NAMES = { site: 'Individuals (n = 1)', wafer: 'Wafer subgroups (n = 5)', cassette: 'Cassette subgroups (n = 15)' };

  function draw(mode) {
    const C = naiveCharts(Y, mode);
    const big = mode === 'site';
    const pts = C.means.map((v, i) => [i + 1, v, outside(v, C.lim)]);
    meanChart.update({
      x: { domain: [0.5, pts.length + 0.5], label: C.unit },
      y: { domain: domainOf(C.means, [C.lim.ucl, C.lim.lcl]), label: big ? 'Line width' : 'Mean line width' },
      aria: `${NAMES[mode]}: chart of ${big ? 'individual readings' : 'subgroup means'} with limits from within-subgroup variation`,
      layers: [
        ...lotBands(C.per),
        ...limitLines(C.lim),
        { type: 'line', points: pts, cls: 'data-thin' },
        { type: 'dots', points: pts, cls: (p) => (p[2] ? 'signal' : 'dot'), r: (p) => (big ? (p[2] ? 3.2 : 2.2) : p[2] ? 4.2 : 3) },
      ],
      hover: {
        xs: pts.map((p) => p[0]),
        mark: (i) => pts[i],
        render: (i) => ({ title: pointTitle(mode, i), rows: [{ label: big ? 'line width' : 'mean', value: fmt(pts[i][1], 3) }], note: sideNote(pts[i][1], C.lim) }),
      },
    });
    const sp = C.spread.map((v, i) => [i + C.spreadX0, v, outside(v, C.spreadLim)]);
    spreadChart.update({
      x: { domain: [0.5, pts.length + 0.5], label: C.unit },
      y: { domain: [0, Math.max(...C.spread, C.spreadLim.ucl) * 1.08], label: C.spreadLabel },
      aria: `${C.spreadLabel} chart for ${NAMES[mode].toLowerCase()}`,
      layers: [
        ...lotBands(C.per),
        ...limitLines(C.spreadLim, { d: 3 }),
        { type: 'line', points: sp, cls: 'data-thin' },
        { type: 'dots', points: sp, cls: (p) => (p[2] ? 'signal' : 'dot'), r: (p) => (big ? (p[2] ? 3.2 : 2) : p[2] ? 4.2 : 2.8) },
      ],
      hover: {
        xs: sp.map((p) => p[0]),
        mark: (i) => sp[i],
        render: (i) => ({
          title: mode === 'site' ? `Readings ${i + 1} to ${i + 2}` : pointTitle(mode, i),
          rows: [{ label: C.spreadLabel === 's' ? 's' : 'moving range', value: fmt(sp[i][1], 3) }],
          note: sideNote(sp[i][1], C.spreadLim),
        }),
      },
    });
    const k = pts.filter((p) => p[2]).length;
    const ks = sp.filter((p) => p[2]).length;
    readouts($('#naive-readouts'), [
      { label: 'Points plotted', value: String(pts.length) },
      { label: 'Beyond the limits', value: `${k} (${pct(k / pts.length)})`, state: k > 3 * NOMINAL * pts.length + 1 ? 'signal' : 'good' },
      { label: 'Expected if the limits fit', value: fmt(NOMINAL * pts.length, 1), sub: '0.27% of points' },
      { label: `${C.spreadLabel === 's' ? 's' : 'Moving range'} chart signals`, value: String(ks), state: ks ? 'signal' : 'good' },
    ]);
  }
  legend($('#naive-legend'), [
    { label: 'Plotted statistic', swatch: 'line', color: 'data' },
    { label: 'Beyond the limits', swatch: 'dot', color: 'signal' },
    { label: 'Control limits', swatch: 'dash', color: 'ink' },
  ]);
  const seg = segmented('naive-sub', draw);
  draw(seg.value);
}

/* ---------- ANOVA readouts ---------- */
{
  const tot = sum(ANOVA.vc);
  const host = $('#an-readouts');
  if (host) {
    readouts(host, [
      { label: 'Simulated cassette', value: fmt(ANOVA.vc[0], 4), sub: `${pct(ANOVA.vc[0] / tot)} of the total` },
      { label: 'Simulated wafer', value: fmt(ANOVA.vc[1], 4), sub: `${pct(ANOVA.vc[1] / tot)} of the total` },
      { label: 'Simulated site', value: fmt(ANOVA.vc[2], 4), sub: `${pct(ANOVA.vc[2] / tot)} of the total` },
      { label: 'Simulated mean squares', value: ANOVA.ms.map((v) => fmt(v, 3)).join(' · '), sub: 'Cassette · wafer · site' },
    ]);
  }
}

/* ---------- Fig 12.5: variance component explorer ---------- */

// Transitions between neighbouring readings in the 450-reading sequence.
const T_SITE = NC * NW * (NS - 1); // within a wafer: 360
const T_WAFER = NC * (NW - 1); // to the next wafer in the same cassette: 60
const T_CAS = NC - 1; // to the next cassette: 29
// E[s²] of the 15 readings in a cassette = σ²_S + K_W σ²_W, with K_W = (15 − 3·5²/15)/14 = 5/7
const K_W = (PER_LOT - (NW * NS * NS) / PER_LOT) / (PER_LOT - 1);

/**
 * Expected half-width of the naive limits and the true standard deviation of the
 * plotted points, for each subgrouping, under the random-effects model.
 */
function expected(vc, mode) {
  const { c, w, s } = vc;
  if (mode === 'site') {
    // MR-bar / 1.128 averages sqrt(v/2) over the transitions, where v is the variance of each difference
    const sig = (T_SITE * Math.sqrt(s) + T_WAFER * Math.sqrt(w + s) + T_CAS * Math.sqrt(c + w + s)) / (T_SITE + T_WAFER + T_CAS);
    return { half: 3 * sig, spread: Math.sqrt(c + w + s), n: N };
  }
  if (mode === 'wafer') return { half: 3 * Math.sqrt(s / NS), spread: Math.sqrt(c + w + s / NS), n: NC * NW };
  return { half: 3 * Math.sqrt((s + K_W * w) / PER_LOT), spread: Math.sqrt(c + w / NW + s / PER_LOT), n: NC };
}
const alarmRate = (e) => 2 * normCdf(-e.half / e.spread);

function advice(vc) {
  const pWafer = alarmRate(expected(vc, 'wafer'));
  if (pWafer < 2 * NOMINAL) {
    return {
      title: 'Site-to-site variation dominates', pill: ['A standard chart fits', 'ok'],
      desc: 'Cassettes and wafers add little beyond the spread inside each wafer, so the within-wafer s is a fair yardstick for wafer means. False alarms stay close to the nominal 0.27%.',
      act: 'Use a standard X̄–s chart with wafers as subgroups.',
    };
  }
  if (vc.c >= vc.w) {
    return {
      title: 'Lot-to-lot variation dominates', pill: ['Within-subgroup limits are too tight', 'signal'],
      desc: 'Whole cassettes run high or low as part of normal running. Limits built from the spread inside a wafer or a cassette leave that variation out, so the chart flags ordinary lots.',
      act: 'Chart lot means against limits from lot-to-lot variation (LL), add an s chart for spread within lots, and keep individuals and moving range charts for the site readings.',
    };
  }
  return {
    title: 'Wafer-to-wafer variation dominates', pill: ['Within-subgroup limits are too tight', 'signal'],
    desc: 'Wafers in the same cassette differ by more than the spread across their sites can explain, and cassettes add comparatively little.',
    act: 'Chart wafer means as individuals, with limits from the moving ranges of wafer means, and add an s chart for spread within wafers.',
  };
}

{
  const chart = new Chart($('#vc-chart'), { height: 280, margin: { top: 18, right: 76, bottom: 40, left: 50 } });
  const dist = new Chart($('#vc-dist'), { height: 280, margin: { top: 18, right: 12, bottom: 40, left: 12 } });
  const share = new Chart($('#vc-share'), { margin: { top: 4, right: 2, bottom: 4, left: 2 } });
  let mode = 'wafer';
  let seed = 7;
  let Z = null;

  function makeZ() {
    const R = rng(seed);
    Z = {
      c: Array.from({ length: NC }, () => R.normal()),
      w: Array.from({ length: NC * NW }, () => R.normal()),
      s: Array.from({ length: N }, () => R.normal()),
    };
  }
  // the same random draws are rescaled as the sliders move, so the picture changes smoothly
  function sample(vc) {
    const out = new Array(N);
    for (let i = 0; i < N; i++) out[i] = MU + Math.sqrt(vc.c) * Z.c[Math.floor(i / PER_LOT)] + Math.sqrt(vc.w) * Z.w[Math.floor(i / NS)] + Math.sqrt(vc.s) * Z.s[i];
    return out;
  }

  const fmt4 = (v) => fmt(v, 4);
  const sliders = {
    c: bindRange('vc-c', () => draw(), { format: fmt4, call: false }),
    w: bindRange('vc-w', () => draw(), { format: fmt4, call: false }),
    s: bindRange('vc-s', () => draw(), { format: fmt4, call: false }),
  };

  function draw() {
    if (!Z) return;
    const vc = { c: sliders.c.value, w: sliders.w.value, s: sliders.s.value };
    const tot = vc.c + vc.w + vc.s;
    const y = sample(vc);
    const C = naiveCharts(y, mode);
    const big = mode === 'site';
    const pts = C.means.map((v, i) => [i + 1, v, outside(v, C.lim)]);
    const e = expected(vc, mode);
    const p = alarmRate(e);

    // a y-range that only moves in steps of 0.5, so the axis does not jitter while dragging
    const raw = domainOf(C.means, [C.lim.ucl, C.lim.lcl, MU - 3 * e.spread, MU + 3 * e.spread], 0.02);
    const dom = [Math.floor(raw[0] * 2) / 2, Math.ceil(raw[1] * 2) / 2];

    chart.update({
      x: { domain: [0.5, pts.length + 0.5], label: C.unit },
      y: { domain: dom, label: big ? 'Line width' : 'Mean line width' },
      aria: 'Simulated naive control chart for the chosen variance components and subgroup',
      layers: [
        ...lotBands(C.per),
        ...limitLines(C.lim),
        { type: 'line', points: pts, cls: 'data-thin' },
        { type: 'dots', points: pts, cls: (q) => (q[2] ? 'signal' : 'dot'), r: (q) => (big ? (q[2] ? 3 : 2) : q[2] ? 4 : 2.8) },
      ],
      hover: {
        xs: pts.map((q) => q[0]),
        mark: (i) => pts[i],
        render: (i) => ({ title: pointTitle(mode, i), rows: [{ label: big ? 'line width' : 'mean', value: fmt(pts[i][1], 3) }], note: sideNote(pts[i][1], C.lim) }),
      },
    });

    // sideways density of the plotted statistic, tails beyond the naive limits in red
    const curve = [];
    const steps = 160;
    for (let j = 0; j <= steps; j++) {
      const yy = dom[0] + ((dom[1] - dom[0]) * j) / steps;
      curve.push([normPdf(yy, C.lim.cl, e.spread), yy]);
    }
    const band = (lo, hi) => {
      const seg = curve.filter((q) => q[1] >= lo && q[1] <= hi);
      return { points: seg, lower: seg.map((q) => [0, q[1]]) };
    };
    const mid = band(C.lim.lcl, C.lim.ucl), top = band(C.lim.ucl, dom[1]), bot = band(dom[0], C.lim.lcl);
    const peak = normPdf(0, 0, e.spread);
    dist.update({
      x: { domain: [0, peak * 1.12], axis: false, label: 'Where points fall' },
      y: { domain: dom, axis: false, grid: false },
      aria: 'Distribution of the plotted points drawn sideways, with the share beyond the limits shaded',
      layers: [
        { type: 'area', ...mid, cls: 'area' },
        { type: 'area', ...top, cls: 'area-signal' },
        { type: 'area', ...bot, cls: 'area-signal' },
        { type: 'hline', y: C.lim.ucl, cls: 'limit' },
        { type: 'hline', y: C.lim.cl, cls: 'center' },
        { type: 'hline', y: C.lim.lcl, cls: 'limit' },
        { type: 'line', points: curve, cls: 'curve' },
      ],
    });

    const shares = [vc.c / tot, vc.w / tot, vc.s / tot];
    share.update({
      height: 48,
      x: { domain: [0, 1], axis: false, grid: false },
      y: { domain: [0, 1], axis: false, grid: false },
      aria: `Shares of total variance: cassette ${pct(shares[0])}, wafer ${pct(shares[1])}, site ${pct(shares[2])}`,
      layers: [{
        type: 'custom',
        draw(g, sx, sy) {
          let x0 = 0;
          ['k-bar', 'k-bar-alt', 'k-bar-muted'].forEach((cls, i) => {
            const x1 = x0 + shares[i];
            const w = sx(x1) - sx(x0) - (i < 2 ? 2 : 0);
            if (w > 0.5) el('rect', { class: cls, x: sx(x0), y: sy(0.8), width: w, height: sy(0.2) - sy(0.8), rx: 3 }, g);
            x0 = x1;
          });
        },
      }],
    });
    legend($('#vc-legend'), [
      { label: `Cassette ${pct(shares[0])}`, swatch: 'box', color: 'data' },
      { label: `Wafer ${pct(shares[1])}`, swatch: 'box', color: 'alt' },
      { label: `Site ${pct(shares[2])}`, swatch: 'box', color: 'muted' },
    ]);

    readouts($('#vc-readouts'), [
      { label: 'Naive limits', value: `±${fmt(e.half, 3)}`, sub: big ? 'From moving ranges' : `From s within each ${mode}` },
      { label: 'Spread of plotted points', value: `σ ${fmt(e.spread, 3)}`, sub: `Limits sit at ±${fmt(e.half / e.spread, 2)}σ` },
      { label: 'False alarms per point', value: fmtRate(p), sub: '0.27% when the limits fit', state: p > 3 * NOMINAL ? 'signal' : 'good' },
      { label: 'Expected in this study', value: `${fmt(p * e.n, 1)} of ${e.n}`, sub: 'points outside the limits' },
    ]);

    const a = advice(vc);
    const panel = $('#vc-panel');
    const h = panel.querySelector('h4');
    h.replaceChildren(document.createTextNode(a.title));
    const pl = document.createElement('span');
    pl.className = `pill ${a.pill[1]}`;
    pl.textContent = a.pill[0];
    h.append(pl);
    panel.querySelector('.desc').textContent = a.desc;
    panel.querySelector('.do').textContent = a.act;
  }

  segmented('vc-sub', (v) => { mode = v; draw(); });
  $('#vc-reset').addEventListener('click', () => {
    sliders.c.value = HB.c; sliders.w.value = HB.w; sliders.s.value = HB.s;
    draw();
  });
  $('#vc-new').addEventListener('click', () => { seed += 1; makeZ(); draw(); });
  makeZ();
  draw();
}

/* ---------- Fig 12.6: the recommended chart set ---------- */
{
  const meanChart = new Chart($('#set-mean'), { height: 250 });
  const sdChart = new Chart($('#set-sd'), { height: 170 });
  const siteChart = new Chart($('#set-site-chart'), { height: 210 });
  // Phase I limits from the unaltered data; planted problems are judged against them
  const WITHIN = xbarS(LOTS);
  const LL = imr(LOT_MEANS);
  const SITE = imr(Y);
  let limits = 'll', fault = 'none', view = 'ind';

  const FAULTS = {
    none: {
      title: 'No planted problem', apply: () => {},
      desc: 'These are the simulated lots exactly as generated, so every chart sees only common-cause variation. With LL limits the lot chart and the s chart are quiet. The individuals chart still flags readings in lots that sit high or low, and five of the six moving-range signals fall on the first reading of a new cassette, where the jump includes the lot-to-lot difference.',
      act: 'Leave the process alone and keep plotting.',
    },
    lot: {
      title: 'Lot 24 shifted up by 1.9', lot: 24, from: idx(24, 1, 0), to: idx(25, 1, 0),
      apply: (y) => { for (let i = idx(24, 1, 0); i < idx(25, 1, 0); i++) y[i] += 1.9; },
      desc: 'Every reading in lot 24 is 1.9 higher than generated, as if the whole lot had run with a wrong exposure or develop setting. The lot chart signals above UCL: LL, and the s chart stays quiet because the readings in the lot moved together.',
      act: 'Look for causes the whole lot shared: its recipe, scanner, reticle, resist batch and measurement run.',
    },
    wafer: {
      title: 'Wafer 2 of lot 17 reads 1.4 high', lot: 17, from: idx(17, 2, 0), to: idx(17, 3, 0),
      apply: (y) => { for (let i = idx(17, 2, 0); i < idx(17, 3, 0); i++) y[i] += 1.4; },
      desc: 'All five readings on one wafer are 1.4 higher than generated, while the other two wafers in the lot are unchanged. The s chart signals for lot 17 because the lot now holds two groups of readings. The lot mean moves too little to cross the LL limits.',
      act: 'Find the wafer that differs, then check its slot in the cassette, its coat and bake, and its rework history.',
    },
    reading: {
      title: 'One reading in lot 9 is 2.0 high', lot: 9, from: idx(9, 3, 3), to: idx(9, 3, 3) + 1,
      apply: (y) => { y[idx(9, 3, 3)] += 2.0; },
      desc: 'One reading (lot 9, wafer 3, Right site) is 2.0 higher than generated, as a measurement error or a defect at that site could produce. The moving range chart flags the jumps into and out of it, the individuals chart flags the reading itself, and the extra spread pushes lot 9 over its s limit.',
      act: 'Re-measure that site before touching the process, then inspect it for a defect.',
    },
  };

  function draw() {
    const F = FAULTS[fault];
    const y = [...Y];
    F.apply(y);
    const lots = subgroups(y, PER_LOT);
    const lm = lots.map(mean), ls = lots.map(sd);
    const active = limits === 'within' ? WITHIN.x : LL.x;
    const activeTag = limits === 'within' ? '' : ': LL';
    const lotMark = F.lot ? [{ type: 'xband', x0: F.lot - 0.5, x1: F.lot + 0.5, cls: 'band-signal' }] : [];

    // lot means
    const mp = lm.map((v, i) => [i + 1, v, outside(v, active)]);
    const lines = limits === 'within'
      ? limitLines(WITHIN.x)
      : limits === 'll'
        ? limitLines(LL.x, { tag: ': LL' })
        : [...limitLines(LL.x, { tag: ': LL' }), ...limitLines(WITHIN.x, { cls: 'limit-soft', center: false })];
    meanChart.update({
      x: { domain: [0.5, NC + 0.5], label: 'Lot (cassette)', ticks: [1, 5, 10, 15, 20, 25, 30] },
      y: { domain: domainOf(lm, [LL.x.ucl, LL.x.lcl]), label: 'Lot mean line width' },
      aria: `Lot means chart with ${limits === 'within' ? 'within-lot' : limits === 'll' ? 'lot-to-lot' : 'both sets of'} limits`,
      layers: [
        ...lotMark,
        ...lines,
        { type: 'line', points: mp, cls: 'data' },
        { type: 'dots', points: mp, cls: (p) => (p[2] ? 'signal' : 'dot'), r: (p) => (p[2] ? 4.5 : 3.2) },
      ],
      hover: {
        xs: mp.map((p) => p[0]),
        mark: (i) => mp[i],
        render: (i) => ({
          title: `Lot ${i + 1}`,
          rows: [{ label: 'lot mean', value: fmt(lm[i], 3) }],
          note: sideNote(lm[i], active, activeTag),
        }),
      },
    });

    // lot standard deviations
    const sp = ls.map((v, i) => [i + 1, v, outside(v, WITHIN.s)]);
    sdChart.update({
      x: { domain: [0.5, NC + 0.5], label: 'Lot (cassette)', ticks: [1, 5, 10, 15, 20, 25, 30] },
      y: { domain: [0, Math.max(...ls, WITHIN.s.ucl) * 1.1], label: 's within lot' },
      aria: 'Standard deviation chart of the 15 readings in each lot',
      layers: [
        ...lotMark,
        ...limitLines(WITHIN.s, { d: 3 }),
        { type: 'line', points: sp, cls: 'data' },
        { type: 'dots', points: sp, cls: (p) => (p[2] ? 'signal' : 'dot'), r: (p) => (p[2] ? 4.5 : 3) },
      ],
      hover: {
        xs: sp.map((p) => p[0]),
        mark: (i) => sp[i],
        render: (i) => ({ title: `Lot ${i + 1}`, rows: [{ label: 's', value: fmt(ls[i], 3) }], note: sideNote(ls[i], WITHIN.s) }),
      },
    });

    // site-level individuals or moving ranges
    const ind = view === 'ind';
    const vals = ind ? y : movingRanges(y);
    const lim = ind ? SITE.x : SITE.mr;
    const x0 = ind ? 1 : 2;
    const pts = vals.map((v, i) => [i + x0, v, outside(v, lim)]);
    const siteMark = fault === 'reading'
      ? [{ type: 'vline', x: F.from + 1, cls: 'shift', label: 'Planted' }]
      : F.lot ? [{ type: 'xband', x0: F.from + 0.5, x1: F.to + 0.5, cls: 'band-signal' }] : [];
    siteChart.update({
      x: { domain: [0.5, N + 0.5], label: 'Measurement order' },
      y: { domain: ind ? domainOf(vals, [lim.ucl, lim.lcl], 0.04) : [0, Math.max(...vals, lim.ucl) * 1.08], label: ind ? 'Line width' : 'Moving range' },
      aria: ind ? 'Individuals chart of all 450 site readings' : 'Moving range chart of consecutive site readings',
      layers: [
        ...lotBands(PER_LOT),
        ...siteMark,
        ...limitLines(lim, { d: ind ? 2 : 3 }),
        { type: 'line', points: pts, cls: 'data-thin' },
        { type: 'dots', points: pts, cls: (p) => (p[2] ? 'signal' : 'dot'), r: (p) => (p[2] ? 3.2 : 2) },
      ],
      hover: {
        xs: pts.map((p) => p[0]),
        mark: (i) => pts[i],
        render: (i) => {
          const r = ROWS[pts[i][0] - 1];
          return {
            title: ind ? `Reading ${r.seq}: ${where(r)}` : `Readings ${r.seq - 1} to ${r.seq}`,
            rows: [{ label: ind ? 'line width' : 'moving range', value: fmt(pts[i][1], 3) }],
            note: sideNote(pts[i][1], lim),
          };
        },
      },
    });

    const nMean = mp.filter((p) => p[2]).length;
    const nS = sp.filter((p) => p[2]).length;
    const nI = y.filter((v) => outside(v, SITE.x)).length;
    const nMR = movingRanges(y).filter((v) => outside(v, SITE.mr)).length;
    readouts($('#set-readouts'), [
      { label: 'Lot means outside', value: String(nMean), sub: limits === 'within' ? 'Within-lot limits' : 'LL limits', state: nMean ? 'signal' : 'good' },
      { label: 'Lot s above UCL', value: String(nS), state: nS ? 'signal' : 'good' },
      { label: 'Individuals outside', value: String(nI), sub: 'of 450 readings', state: nI ? 'signal' : 'good' },
      { label: 'Moving ranges above UCL', value: String(nMR), sub: 'of 449', state: nMR ? 'signal' : 'good' },
    ]);
    legend($('#set-legend'), [
      { label: 'Plotted statistic', swatch: 'line', color: 'data' },
      { label: 'Beyond the limits', swatch: 'dot', color: 'signal' },
      { label: limits === 'within' ? 'Within-lot limits' : 'LL limits on the lot chart', swatch: 'dash', color: 'ink' },
      ...(limits === 'both' ? [{ label: 'Within-lot limits', swatch: 'dash', color: 'muted' }] : []),
      ...(fault === 'none' ? [] : [{ label: 'Planted problem', swatch: 'box', color: 'signal' }]),
    ]);
    const panel = $('#set-panel');
    panel.querySelector('h4').textContent = F.title;
    panel.querySelector('.desc').textContent = F.desc;
    panel.querySelector('.do').textContent = F.act;
  }

  segmented('set-limits', (v) => { limits = v; draw(); });
  segmented('set-fault', (v) => { fault = v; draw(); });
  segmented('set-view', (v) => { view = v; draw(); });
  draw();
}
