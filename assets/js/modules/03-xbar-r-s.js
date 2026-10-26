// Module 3: X̄ and R or s charts.

import { Chart, dataTable } from '../chart.js';
import { rng, mean, sd, range, histogram, normPdf, normCdf, lgamma, spcConstants, shewhartArl, fmt, fmtInt, fmtRate } from '../stats.js';
import { bindRange, segmented, readouts, legend, $ } from '../ui.js';

/* ---------- Fig 3.1: why chart averages ---------- */
{
  const MU = 25, SIG = 0.010;
  const dist = new Chart($('#avg-dist'), { height: 270, margin: { top: 26, right: 18, bottom: 40, left: 18 } });
  const bars = new Chart($('#avg-bars'), { height: 270, margin: { top: 26, right: 14, bottom: 40, left: 44 } });
  const X0 = MU - 4.5 * SIG, X1 = MU + 5.5 * SIG;
  // fixed height so the curves visibly grow taller as n increases
  const YMAX = normPdf(0, 0, SIG / Math.sqrt(10)) * 1.2;
  const chance = (k, d) => 1 / shewhartArl(d * Math.sqrt(k));
  let n = 4, shift = 1;

  const curve = (mu, s) => {
    const pts = [];
    for (let i = 0; i <= 320; i++) { const x = X0 + ((X1 - X0) * i) / 320; pts.push([x, normPdf(x, mu, s)]); }
    return pts;
  };

  function draw() {
    const se = SIG / Math.sqrt(n);
    const ucl = MU + 3 * se, lcl = MU - 3 * se;
    const mu1 = MU + shift * SIG;
    const single = curve(MU, SIG), avg = curve(MU, se), moved = curve(mu1, se);
    const tail = [[ucl, normPdf(ucl, mu1, se)], ...moved.filter(([x]) => x > ucl)];
    const layers = [
      { type: 'area', points: single, base: 0, cls: 'area-muted' },
      { type: 'line', points: single, cls: 'faint' },
      { type: 'area', points: avg, base: 0, cls: 'area' },
      { type: 'line', points: avg, cls: 'data' },
    ];
    if (shift > 0) {
      layers.push(
        { type: 'area', points: tail, base: 0, cls: 'area-signal' },
        { type: 'line', points: moved, cls: 'data dashed' },
      );
    }
    layers.push(
      { type: 'vline', x: MU, cls: 'center' },
      { type: 'vline', x: lcl, cls: 'limit', label: `LCL ${fmt(lcl, 3)}`, anchor: 'end' },
      { type: 'vline', x: ucl, cls: 'limit', label: `UCL ${fmt(ucl, 3)}`, anchor: 'start' },
    );
    dist.update({
      x: { domain: [X0, X1], label: 'Diameter (mm)', ticks: [24.96, 24.98, 25, 25.02, 25.04], format: (v) => v.toFixed(2) },
      y: { domain: [0, YMAX], axis: false, grid: false },
      aria: `Distribution of single shaft diameters and of averages of ${n}, with control limits and the averages after a ${fmt(shift, 2)} sigma shift`,
      layers,
    });

    const ps = Array.from({ length: 10 }, (_, i) => chance(i + 1, shift) * 100);
    const top = Math.max(1, ...ps) * 1.2;
    bars.update({
      x: { domain: [0.4, 10.6], ticks: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], label: 'Subgroup size n' },
      y: { domain: [0, top], label: 'Chance the next subgroup signals (%)', ticks: 4 },
      aria: 'Bar chart of the chance that the next subgroup signals, for subgroup sizes 1 to 10',
      layers: [
        { type: 'bars', bars: ps.map((p, i) => ({ x0: i + 0.62, x1: i + 1.38, y: p, cls: i + 1 === n ? 'bar' : 'bar-muted' })) },
        { type: 'text', x: n, y: ps[n - 1], dy: -7, anchor: 'middle', text: fmtRate(ps[n - 1] / 100), cls: 'label-strong' },
      ],
      hover: {
        xs: ps.map((_, i) => i + 1),
        mark: (i) => [i + 1, ps[i]],
        render: (i) => ({
          title: i === 0 ? 'Single values' : `Subgroups of ${i + 1}`,
          rows: [
            { label: 'chance of a signal', value: fmtRate(ps[i] / 100) },
            { label: 'subgroups to a signal, on average', value: fmt(100 / ps[i], 1), key: 'none' },
          ],
        }),
      },
    });

    const p = ps[n - 1] / 100;
    readouts($('#avg-readouts'), [
      { label: 'σ of the averages, σ/√n', value: `${fmt(se, 4)} mm`, sub: `Single shafts: ${fmt(SIG, 3)} mm` },
      { label: 'Control limits', value: `${fmt(lcl, 3)} to ${fmt(ucl, 3)}`, sub: 'mm, at 25.000 ± 3σ/√n' },
      { label: 'Chance the next subgroup signals', value: fmtRate(p), sub: shift > 0 ? `After a ${fmt(shift, 2)}σ shift` : 'The false-alarm rate' },
      { label: 'Subgroups to a signal, on average', value: fmt(1 / p, 1), sub: shift > 0 ? 'Out-of-control ARL' : 'In-control ARL' },
    ]);
  }

  legend($('#avg-legend'), [
    { label: 'Single shafts', swatch: 'box', color: 'muted' },
    { label: 'Subgroup averages', swatch: 'line', color: 'data' },
    { label: 'Averages after the shift', swatch: 'dash', color: 'data' },
    { label: 'Chance of a signal', swatch: 'box', color: 'signal' },
    { label: 'Control limits', swatch: 'dash', color: 'ink' },
  ]);
  bindRange('avg-n', (v) => { n = v; draw(); }, { call: false });
  bindRange('avg-shift', (v) => { shift = v; draw(); }, { call: false, format: (v) => (v === 0 ? 'none' : `${v.toFixed(2)}σ (${(v * SIG).toFixed(4)} mm)`) });
  n = Number($('#avg-n').value);
  shift = Number($('#avg-shift').value);
  draw();
}

/* ---------- Fig 3.2: rational subgroups and stratification ---------- */
{
  const T = 30, BASE = 15, SHIFT_AT = 21, M1 = 501, M2 = 499, SIG = 0.5, SHIFT = 1;
  const chart = new Chart($('#heads-chart'), { height: 300 });
  const shiftBox = $('#heads-shift');
  const K4 = spcConstants(4);
  // the same bottles in both views: four per head at every sample
  const R = rng(2);
  const Z1 = Array.from({ length: T }, () => Array.from({ length: 4 }, () => R.normal()));
  const Z2 = Array.from({ length: T }, () => Array.from({ length: 4 }, () => R.normal()));
  let mode = 'mixed';

  function draw() {
    const on = shiftBox.checked;
    const h1 = Z1.map((z, t) => z.map((v) => M1 + (on && t + 1 >= SHIFT_AT ? SHIFT : 0) + SIG * v));
    const h2 = Z2.map((z) => z.map((v) => M2 + SIG * v));
    const layers = [];
    let rbar, w, inC = 0, beyond = 0, total = 0, ys = [], hover;

    if (mode === 'mixed') {
      const groups = h1.map((a, t) => [a[0], a[1], h2[t][0], h2[t][1]]);
      const xb = groups.map(mean), rg = groups.map(range);
      const cl = mean(xb.slice(0, BASE));
      rbar = mean(rg.slice(0, BASE));
      w = K4.A2 * rbar;
      const flag = xb.map((v) => v > cl + w || v < cl - w);
      const pts = xb.map((v, t) => [t + 1, v]);
      xb.forEach((v, t) => { total++; if (Math.abs(v - cl) < w / 3) inC++; if (flag[t]) beyond++; });
      ys = [...xb, cl - w, cl + w];
      layers.push(
        { type: 'zones', cl, sigma: w / 3 },
        { type: 'hline', y: cl + w, cls: 'limit', label: `UCL ${fmt(cl + w, 1)}` },
        { type: 'hline', y: cl, cls: 'center', label: `CL ${fmt(cl, 1)}` },
        { type: 'hline', y: cl - w, cls: 'limit', label: `LCL ${fmt(cl - w, 1)}` },
        { type: 'line', points: pts, cls: 'data' },
        { type: 'dots', points: pts, cls: (p, i) => (flag[i] ? 'signal' : 'dot') },
      );
      hover = {
        xs: pts.map((p) => p[0]), mark: (i) => pts[i],
        render: (i) => ({
          title: `Sample ${i + 1}: two bottles from each head`,
          rows: [{ label: 'average, mL', value: fmt(xb[i], 2) }, { label: 'range, mL', value: fmt(rg[i], 2), key: 'none' }],
          note: flag[i] ? 'Beyond a control limit' : undefined,
        }),
      };
    } else {
      const xb1 = h1.map(mean), xb2 = h2.map(mean);
      const r1 = h1.map(range), r2 = h2.map(range);
      rbar = mean([...r1.slice(0, BASE), ...r2.slice(0, BASE)]);
      w = K4.A2 * rbar;
      const c1 = mean(xb1.slice(0, BASE)), c2 = mean(xb2.slice(0, BASE));
      const f1 = xb1.map((v) => Math.abs(v - c1) > w), f2 = xb2.map((v) => Math.abs(v - c2) > w);
      const p1 = xb1.map((v, t) => [t + 1, v]), p2 = xb2.map((v, t) => [t + 1, v]);
      [[xb1, c1, f1], [xb2, c2, f2]].forEach(([xs, c, f]) => xs.forEach((v, t) => { total++; if (Math.abs(v - c) < w / 3) inC++; if (f[t]) beyond++; }));
      ys = [...xb1, ...xb2, c1 + w, c2 - w];
      for (const [c, label, above] of [[c1, 'Head 1', true], [c2, 'Head 2', false]]) {
        layers.push(
          { type: 'band', y0: c - w, y1: c + w, cls: 'band' },
          { type: 'hline', y: c + w, cls: 'limit', label: `UCL ${fmt(c + w, 1)}` },
          { type: 'hline', y: c, cls: 'center', label: `CL ${fmt(c, 1)}` },
          { type: 'hline', y: c - w, cls: 'limit', label: `LCL ${fmt(c - w, 1)}` },
          { type: 'text', x: 0.8, y: above ? c + w : c - w, dy: above ? -6 : 14, text: label, cls: 'label' },
        );
      }
      layers.push(
        { type: 'line', points: p1, cls: 'data' },
        { type: 'line', points: p2, cls: 'alt' },
        { type: 'dots', points: p1, cls: (p, i) => (f1[i] ? 'signal' : 'dot') },
        { type: 'dots', points: p2, cls: (p, i) => (f2[i] ? 'signal' : 'dot-alt') },
      );
      hover = {
        xs: p1.map((p) => p[0]), mark: (i) => p1[i],
        render: (i) => ({
          title: `Sample ${i + 1}: four bottles from each head`,
          rows: [
            { label: 'head 1 average, mL', value: fmt(xb1[i], 2) },
            { label: 'head 2 average, mL', value: fmt(xb2[i], 2), key: 'alt' },
          ],
          note: [f1[i] ? 'Head 1 beyond its limits' : '', f2[i] ? 'Head 2 beyond its limits' : ''].filter(Boolean).join(' · ') || undefined,
        }),
      };
    }
    layers.push({ type: 'vline', x: BASE + 0.5, cls: 'marker', label: 'Limits frozen', anchor: 'end' });
    if (on) layers.push({ type: 'vline', x: SHIFT_AT - 0.5, cls: 'shift', label: 'Head 1 +1 mL', anchor: 'start' });

    chart.update({
      x: { domain: [0.5, T + 0.5], label: 'Sample' },
      y: { domain: [Math.min(496.6, ...ys) - 0.2, Math.max(503.4, ...ys) + 0.2], label: 'Average fill (mL)' },
      aria: mode === 'mixed'
        ? 'X-bar chart of subgroups that mix both filling heads: wide limits with every point close to the center line'
        : 'X-bar charts of subgroups taken within each filling head: two narrow lanes, one per head',
      layers,
      hover,
    });
    legend($('#heads-legend'), mode === 'mixed'
      ? [
        { label: 'Average of two bottles from each head', swatch: 'line', color: 'data' },
        { label: 'Control limits', swatch: 'dash', color: 'ink' },
        { label: 'Beyond a limit', swatch: 'dot', color: 'signal' },
      ]
      : [
        { label: 'Head 1 average', swatch: 'line', color: 'data' },
        { label: 'Head 2 average', swatch: 'line', color: 'alt' },
        { label: 'Control limits for each head', swatch: 'dash', color: 'ink' },
        { label: 'Beyond a limit', swatch: 'dot', color: 'signal' },
      ]);
    readouts($('#heads-readouts'), [
      { label: 'σ estimated by R̄/d₂', value: `${fmt(rbar / K4.d2, 2)} mL`, sub: `True bottle-to-bottle σ: ${fmt(SIG, 2)} mL` },
      { label: 'Distance from CL to each limit', value: `${fmt(w, 2)} mL`, sub: 'A₂R̄ with n = 4' },
      { label: 'Averages in the middle third', value: `${fmt((100 * inC) / total, 0)}%`, sub: 'About 68% for rational subgroups' },
      { label: 'Points beyond the limits', value: `${beyond} of ${total}`, state: beyond ? 'signal' : 'good' },
    ]);
  }

  segmented('heads-mode', (v) => { mode = v; draw(); });
  shiftBox.addEventListener('change', draw);
  mode = $('#heads-mode [aria-pressed="true"]')?.dataset.value ?? 'mixed';
  draw();
}

/* ---------- Fig 3.3: where d2 and c4 come from ---------- */
{
  const hist = new Chart($('#d2-hist'), { height: 270, margin: { top: 26, right: 16, bottom: 40, left: 44 } });
  const trace = new Chart($('#d2-trace'), { height: 270, margin: { top: 26, right: 74, bottom: 40, left: 46 } });
  const MAX = 50000, BINS = 52;
  let n = 5, stat = 'r';
  let R, vals, trail, total, nextMark;

  // Exact densities of R/σ and s/σ for samples of n standard normal values.
  function rangePdf(w, k) {
    if (w <= 0) return k === 2 ? 1 / Math.sqrt(Math.PI) : 0;
    let s = 0;
    const h = 0.02;
    for (let x = -7; x <= 7; x += h) s += normPdf(x) * normPdf(x + w) * (normCdf(x + w) - normCdf(x)) ** (k - 2);
    return k * (k - 1) * s * h;
  }
  function sPdf(u, k) {
    if (u <= 0) return 0;
    const df = k - 1, v = df * u * u;
    return Math.exp((df / 2 - 1) * Math.log(v) - v / 2 - (df / 2) * Math.log(2) - lgamma(df / 2)) * 2 * df * u;
  }
  const pdfCache = new Map();
  function pdfCurve() {
    const key = `${stat}${n}`;
    if (!pdfCache.has(key)) {
      const [lo, hi] = domainX();
      const pts = [];
      for (let i = 0; i <= 160; i++) {
        const x = lo + ((hi - lo) * i) / 160;
        pts.push([x, stat === 'r' ? rangePdf(x, n) : sPdf(x, n)]);
      }
      pdfCache.set(key, pts);
    }
    return pdfCache.get(key);
  }
  const domainX = () => (stat === 'r' ? [0, 6.5] : [0, 2.6]);
  const target = () => { const K = spcConstants(n); return stat === 'r' ? { v: K.d2, sdv: K.d3, name: 'd₂' } : { v: K.c4, sdv: Math.sqrt(1 - K.c4 ** 2), name: 'c₄' }; };

  function drawOne() {
    const xs = Array.from({ length: n }, () => R.normal());
    const v = stat === 'r' ? range(xs) : sd(xs);
    vals.push(v);
    total += v;
    const k = vals.length;
    if (k >= nextMark) {
      trail.push([Math.log10(k), total / k, k]);
      nextMark = Math.max(k + 1, Math.ceil(k * 1.04));
    }
  }
  function add(count) {
    const stop = Math.min(MAX, vals.length + count);
    while (vals.length < stop) drawOne();
    const k = vals.length;
    if (trail[trail.length - 1][2] !== k) trail.push([Math.log10(k), total / k, k]);
  }
  function reset() {
    R = rng(1000 + 10 * n + (stat === 's' ? 1 : 0));
    vals = []; trail = []; total = 0; nextMark = 1;
    add(1000);
  }

  function draw() {
    const T = target();
    const N = vals.length, avg = total / N;
    const [lo, hi] = domainX();
    const bins = histogram(vals, lo, hi, BINS);
    const bw = (hi - lo) / BINS;
    const dens = bins.map((b) => ({ x0: b.x0, x1: b.x1, y: b.count / (N * bw) }));
    const pdf = pdfCurve();
    const ymax = Math.max(...dens.map((d) => d.y), ...pdf.map((p) => p[1])) * 1.22;
    const sym = stat === 'r' ? 'R/σ' : 's/σ';
    hist.update({
      x: { domain: [lo, hi], label: stat === 'r' ? 'Range of the draw, in units of σ' : 'Standard deviation of the draw, in units of σ', ticks: 6 },
      y: { domain: [0, ymax], axis: false, grid: false },
      aria: `Histogram of ${fmtInt(N)} simulated values of ${sym} for samples of ${n}, with the exact density and the constant ${T.name}`,
      layers: [
        { type: 'bars', bars: dens, cls: 'bar' },
        { type: 'line', points: pdf, cls: 'curve' },
        { type: 'vline', x: T.v, cls: 'marker', label: `${T.name} = ${fmt(T.v, 3)}`, anchor: 'end' },
        { type: 'vline', x: avg, cls: 'data', label: `average ${fmt(avg, 3)}`, anchor: 'start', labelY: ymax * 0.9 },
      ],
    });

    const xmax = Math.log10(MAX);
    const band = [], bandLo = [];
    for (let i = 0; i <= 80; i++) {
      const lx = (xmax * i) / 80, k = 10 ** lx;
      band.push([lx, T.v + (2 * T.sdv) / Math.sqrt(k)]);
      bandLo.push([lx, T.v - (2 * T.sdv) / Math.sqrt(k)]);
    }
    const last = trail[trail.length - 1];
    trace.update({
      x: { domain: [0, xmax], ticks: [0, 1, 2, 3, 4], format: (v) => fmtInt(10 ** v), label: 'Draws (log scale)' },
      y: { domain: [Math.max(0, T.v - 2.6 * T.sdv), T.v + 2.6 * T.sdv], label: `Running average of ${sym}` },
      aria: `Running average of ${sym} against the number of draws, converging to ${T.name}`,
      layers: [
        { type: 'area', points: band, lower: bandLo, cls: 'area-muted' },
        { type: 'hline', y: T.v, cls: 'center', label: `${T.name} ${fmt(T.v, 3)}` },
        { type: 'line', points: trail, cls: 'data' },
        { type: 'dots', points: [last], cls: 'dot', r: 4 },
      ],
      hover: {
        xs: trail.map((p) => p[0]), mark: (i) => trail[i],
        render: (i) => ({
          title: `After ${fmtInt(trail[i][2])} draw${trail[i][2] === 1 ? '' : 's'}`,
          rows: [{ label: 'running average', value: fmt(trail[i][1], 4) }, { label: T.name, value: fmt(T.v, 4), key: 'ink' }],
        }),
      },
    });

    readouts($('#d2-readouts'), [
      { label: 'Draws so far', value: fmtInt(N), sub: N >= MAX ? 'The maximum for this figure' : `${n} values per draw` },
      { label: `Average ${sym}`, value: fmt(avg, 4) },
      { label: `Table value of ${T.name}`, value: fmt(T.v, 4), sub: `For n = ${n}` },
      { label: 'Difference', value: fmt(avg - T.v, 4), sub: 'Shrinks like 1/√draws' },
    ]);
    $('#d2-more').disabled = N >= MAX;
  }

  legend($('#d2-legend'), [
    { label: 'Simulated draws', swatch: 'box', color: 'data' },
    { label: 'Exact distribution', swatch: 'line', color: 'ink' },
    { label: 'Running average', swatch: 'line', color: 'data' },
    { label: 'Table constant', swatch: 'dash', color: 'ink' },
    { label: 'Two standard errors', swatch: 'box', color: 'muted' },
  ]);
  bindRange('d2-n', (v) => { n = v; reset(); draw(); }, { call: false });
  segmented('d2-stat', (v) => { stat = v; reset(); draw(); });
  $('#d2-more').addEventListener('click', () => { add(1000); draw(); });
  $('#d2-reset').addEventListener('click', () => { reset(); draw(); });
  n = Number($('#d2-n').value);
  stat = $('#d2-stat [aria-pressed="true"]')?.dataset.value ?? 'r';
  reset();
  draw();
}

/* ---------- Fig 3.4: build an X̄ chart with R or s ---------- */
{
  const MU = 25, SIG = 0.010, NB = 25, NT = 40, CHANGE_AT = 31, SHIFT = 0.012, SPREAD = 2;
  const margin = { top: 18, right: 84, bottom: 30, left: 60 };
  const cx = new Chart($('#build-x'), { height: 250, margin });
  const cv = new Chart($('#build-v'), { height: 190, margin: { ...margin, bottom: 42 } });
  let n = 5, kind = 'r', change = 'none', seed = 24, Z = [];
  const gen = () => {
    const R = rng(seed);
    Z = Array.from({ length: NT }, () => Array.from({ length: 10 }, () => R.normal()));
  };
  const CHANGE_TEXT = { mean: 'Mean +0.012 mm', spread: 'Spread doubles' };

  function draw() {
    const K = spcConstants(n);
    const groups = Z.map((z, i) => {
      const after = i + 1 >= CHANGE_AT;
      const mu = MU + (after && change === 'mean' ? SHIFT : 0);
      const s = SIG * (after && change === 'spread' ? SPREAD : 1);
      return z.slice(0, n).map((v) => mu + s * v);
    });
    const xb = groups.map(mean);
    const sp = groups.map(kind === 'r' ? range : sd);
    const xbb = mean(xb.slice(0, NB)), vbar = mean(sp.slice(0, NB));
    const A = kind === 'r' ? K.A2 : K.A3;
    const sigmaHat = vbar / (kind === 'r' ? K.d2 : K.c4);
    const xl = { cl: xbb, ucl: xbb + A * vbar, lcl: xbb - A * vbar };
    const vl = { cl: vbar, ucl: (kind === 'r' ? K.D4 : K.B4) * vbar, lcl: (kind === 'r' ? K.D3 : K.B3) * vbar };
    const xf = xb.map((v) => v > xl.ucl || v < xl.lcl);
    const vf = sp.map((v) => v > vl.ucl || (vl.lcl > 0 && v < vl.lcl));
    const xp = xb.map((v, i) => [i + 1, v]), vp = sp.map((v, i) => [i + 1, v]);
    const name = kind === 'r' ? 'R' : 's';
    const bar = kind === 'r' ? 'R̄' : 's̄';

    const marks = (withLabels) => {
      const out = [
        { type: 'xband', x0: 0.5, x1: NB + 0.5, cls: 'band' },
        { type: 'vline', x: NB + 0.5, cls: 'marker', label: withLabels ? 'Limits from 1–25' : undefined, anchor: 'end' },
      ];
      if (change !== 'none') out.push({ type: 'vline', x: CHANGE_AT - 0.5, cls: 'shift', label: withLabels ? CHANGE_TEXT[change] : undefined, anchor: 'start' });
      return out;
    };
    const tip = (i) => ({
      title: `Subgroup ${i + 1}${i + 1 > NB ? '' : ' (sets the limits)'}`,
      rows: [
        { label: 'average, mm', value: fmt(xb[i], 4) },
        { label: `${kind === 'r' ? 'range' : 'std dev'}, mm`, value: fmt(sp[i], 4), key: 'alt' },
      ],
      note: [xf[i] ? 'X̄ beyond a limit' : '', vf[i] ? `${name} beyond a limit` : ''].filter(Boolean).join(' · ') || undefined,
    });

    const xlo = Math.min(MU - 0.03, ...xb, xl.lcl), xhi = Math.max(MU + 0.03, ...xb, xl.ucl);
    cx.update({
      x: { domain: [0.5, NT + 0.5], ticks: [1, 5, 10, 15, 20, 25, 30, 35, 40] },
      y: { domain: [xlo - 0.002, xhi + 0.002], label: 'Subgroup average (mm)', ticks: 4, format: (v) => v.toFixed(2) },
      aria: `X-bar chart of ${NT} subgroups of ${n} shaft diameters`,
      layers: [
        ...marks(true),
        { type: 'hline', y: xl.ucl, cls: 'limit', label: `UCL ${fmt(xl.ucl, 3)}` },
        { type: 'hline', y: xl.cl, cls: 'center', label: `CL ${fmt(xl.cl, 3)}` },
        { type: 'hline', y: xl.lcl, cls: 'limit', label: `LCL ${fmt(xl.lcl, 3)}` },
        { type: 'line', points: xp, cls: 'data-thin' },
        { type: 'dots', points: xp, cls: (p, i) => (xf[i] ? 'signal' : 'dot'), r: (p, i) => (xf[i] ? 4.5 : 3.2) },
      ],
      hover: { xs: xp.map((p) => p[0]), mark: (i) => xp[i], render: tip },
    });
    const vhi = Math.max(vl.ucl, ...sp) * 1.12;
    const vLayers = [
      ...marks(false),
      { type: 'hline', y: vl.ucl, cls: 'limit', label: `UCL ${fmt(vl.ucl, 4)}` },
      { type: 'hline', y: vl.cl, cls: 'center', label: `CL ${fmt(vl.cl, 4)}` },
    ];
    if (vl.lcl > 0) vLayers.push({ type: 'hline', y: vl.lcl, cls: 'limit', label: `LCL ${fmt(vl.lcl, 4)}` });
    vLayers.push(
      { type: 'line', points: vp, cls: 'alt' },
      { type: 'dots', points: vp, cls: (p, i) => (vf[i] ? 'signal' : 'dot-alt'), r: (p, i) => (vf[i] ? 4.5 : 3.2) },
    );
    cv.update({
      x: { domain: [0.5, NT + 0.5], ticks: [1, 5, 10, 15, 20, 25, 30, 35, 40], label: 'Subgroup (one per hour)' },
      y: { domain: [0, vhi], label: kind === 'r' ? 'Subgroup range (mm)' : 'Subgroup std dev (mm)', ticks: 3 },
      aria: `${kind === 'r' ? 'Range' : 'Standard deviation'} chart of the same subgroups`,
      layers: vLayers,
      hover: { xs: vp.map((p) => p[0]), mark: (i) => vp[i], render: tip },
    });

    legend($('#build-legend'), [
      { label: 'Subgroup average', swatch: 'line', color: 'data' },
      { label: kind === 'r' ? 'Subgroup range' : 'Subgroup standard deviation', swatch: 'line', color: 'alt' },
      { label: 'Control limits', swatch: 'dash', color: 'ink' },
      { label: 'Beyond a limit', swatch: 'dot', color: 'signal' },
      { label: 'Subgroups that set the limits', swatch: 'box', color: 'muted' },
    ]);

    let first = -1, where = '';
    for (let i = NB; i < NT; i++) {
      if (xf[i] || vf[i]) { first = i; where = vf[i] && xf[i] ? `Both charts` : vf[i] ? `${name} chart` : 'X̄ chart'; break; }
    }
    const into = first >= 0 && change !== 'none' ? first + 2 - CHANGE_AT : null;
    readouts($('#build-readouts'), [
      { label: 'X̄ chart limits (mm)', value: `${fmt(xl.lcl, 3)} to ${fmt(xl.ucl, 3)}`, sub: `CL ${fmt(xl.cl, 4)}, A${kind === 'r' ? '₂' : '₃'} = ${fmt(A, 3)}` },
      { label: `${bar}, average ${kind === 'r' ? 'range' : 'std dev'}`, value: `${fmt(vbar, 4)} mm`, sub: `From subgroups 1 to ${NB}` },
      { label: `σ̂ = ${bar}/${kind === 'r' ? 'd₂' : 'c₄'}`, value: `${fmt(sigmaHat, 4)} mm`, sub: `True σ is ${fmt(SIG, 4)} mm` },
      { label: `${name} chart limits (mm)`, value: `${vl.lcl > 0 ? fmt(vl.lcl, 4) : '0'} to ${fmt(vl.ucl, 4)}`, sub: kind === 'r' ? `D₃ = ${fmt(K.D3, 3)}, D₄ = ${fmt(K.D4, 3)}` : `B₃ = ${fmt(K.B3, 3)}, B₄ = ${fmt(K.B4, 3)}` },
      first >= 0
        ? { label: `First signal after subgroup ${NB}`, value: `Subgroup ${first + 1}`, sub: into !== null && into >= 1 ? `${where}, ${into} subgroup${into === 1 ? '' : 's'} into the change` : where, state: 'signal' }
        : { label: `First signal after subgroup ${NB}`, value: 'None', sub: change === 'none' ? 'As expected with no change' : 'The change went unnoticed', state: change === 'none' ? 'good' : undefined },
    ]);

    const rows = [];
    for (let k = 2; k <= 10; k++) rows.push({ ...spcConstants(k), _cls: k === n ? 'is-hi' : '' });
    const f3 = (v) => fmt(v, 3), f4 = (v) => fmt(v, 4);
    dataTable($('#build-table'), [
      { label: 'n', key: 'n' },
      { label: 'd₂', key: 'd2', fmt: f4 }, { label: 'd₃', key: 'd3', fmt: f4 }, { label: 'c₄', key: 'c4', fmt: f4 },
      { label: 'A₂', key: 'A2', fmt: f3 }, { label: 'D₃', key: 'D3', fmt: f3 }, { label: 'D₄', key: 'D4', fmt: f3 },
      { label: 'A₃', key: 'A3', fmt: f3 }, { label: 'B₃', key: 'B3', fmt: f3 }, { label: 'B₄', key: 'B4', fmt: f3 },
    ], rows);
  }

  bindRange('build-n', (v) => { n = v; draw(); }, { call: false });
  segmented('build-kind', (v) => { kind = v; draw(); });
  segmented('build-change', (v) => { change = v; draw(); });
  $('#build-new').addEventListener('click', () => { seed += 1; gen(); draw(); });
  n = Number($('#build-n').value);
  kind = $('#build-kind [aria-pressed="true"]')?.dataset.value ?? 'r';
  change = $('#build-change [aria-pressed="true"]')?.dataset.value ?? 'none';
  gen();
  draw();
}
