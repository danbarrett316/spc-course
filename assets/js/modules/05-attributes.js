// Module 5: charts for defects and defectives.

import { Chart, el, dataTable } from '../chart.js';
import { rng, mean, sum, min, max, poissonPmf, normPdf, fmt, fmtInt } from '../stats.js';
import { bindRange, segmented, readouts, legend, $ } from '../ui.js';

const ALPHA = 0.00135; // nominal false-alarm probability in each tail of a 3σ chart

// Handbook 6.3.3.1: defects on 25 successive wafers (100 chips each).
const WAFER_DEFECTS = [16, 14, 28, 16, 12, 20, 10, 12, 10, 17, 19, 17, 14, 16, 15, 13, 14, 16, 11, 20, 11, 19, 16, 31, 13];
// Handbook 6.3.3.2: fraction of 50 chips with a misregistration, 30 wafers.
const MISREG = [0.24, 0.30, 0.16, 0.20, 0.08, 0.14, 0.32, 0.18, 0.28, 0.20, 0.10, 0.12, 0.34, 0.24, 0.44,
  0.16, 0.20, 0.10, 0.26, 0.22, 0.40, 0.36, 0.48, 0.30, 0.18, 0.24, 0.14, 0.26, 0.18, 0.12];

/** Whole numbers print without decimals, everything else with `d`. */
const num = (v, d = 2) => (Math.abs(v - Math.round(v)) < 1e-9 ? fmt(v, 0) : fmt(v, d));

/** A probability as a percentage with two significant figures. */
function pct(p) {
  if (p === null || p === undefined) return 'None';
  if (p === 0) return '0%';
  const v = p * 100;
  if (v < 0.0001) return '< 0.0001%';
  return `${Number(v.toPrecision(2)).toString()}%`;
}

/** How an actual tail probability compares with the nominal 0.135%. */
function versusNominal(p) {
  if (p === null || p === undefined) return 'No lower limit';
  const r = p / ALPHA;
  if (r >= 1.05) return `${fmt(r, 1)} × the nominal 0.135%`;
  if (r > 0.95) return 'Close to the nominal 0.135%';
  if (r >= 0.4) return `${fmt(r * 100, 0)}% of the nominal 0.135%`;
  return `About 1/${fmtInt(1 / r)} of the nominal 0.135%`;
}

/** Poisson probabilities 0..K, far enough into the tail that the rest is negligible. */
function poissonTable(lam) {
  const K = Math.ceil(lam + 12 * Math.sqrt(lam) + 15);
  return Array.from({ length: K + 1 }, (_, k) => poissonPmf(k, lam));
}

const TRANSFORMS = {
  root: (k) => 2 * Math.sqrt(k),
  anscombe: (k) => 2 * Math.sqrt(k + 3 / 8),
  ft: (k) => Math.sqrt(k) + Math.sqrt(k + 1),
};

/**
 * Which counts signal for a Poisson mean `lam` under a limit method.
 * Returns { lo, hi }: counts <= lo signal low (lo = -1 means no lower limit),
 * counts >= hi signal high.
 */
function signalCounts(method, lam, pm) {
  if (method === 'sigma') {
    const s = Math.sqrt(lam);
    return { lo: Math.max(-1, Math.ceil(lam - 3 * s) - 1), hi: Math.floor(lam + 3 * s) + 1 };
  }
  if (method === 'prob') {
    // smallest hi with P(X >= hi) <= ALPHA, largest lo with P(X <= lo) <= ALPHA
    let tail = 1, hi = 0;
    while (tail > ALPHA && hi < pm.length) { tail -= pm[hi]; hi++; }
    let cum = 0, lo = -1;
    while (cum + pm[lo + 1] <= ALPHA) { cum += pm[lo + 1]; lo++; }
    return { lo, hi };
  }
  // transformed counts y = f(c) are charted at their mean ± 3
  const f = TRANSFORMS[method];
  const E = pm.reduce((s, p, k) => s + p * f(k), 0);
  let lo = -1;
  while (f(lo + 1) < E - 3) lo++;
  let hi = 0;
  while (f(hi) <= E + 3) hi++;
  return { lo, hi };
}

/** Exact false-alarm probabilities in each tail (lower is null when there is no lower limit). */
function tailRates(lim, pm) {
  let up = 0;
  for (let k = pm.length - 1; k >= lim.hi; k--) up += pm[k];
  let lo = null;
  if (lim.lo >= 0) { lo = 0; for (let k = 0; k <= lim.lo; k++) lo += pm[k]; }
  return { up, lo };
}

/* ---------- Fig 5.1: defects and defectives on one wafer ---------- */
{
  const host = $('#wafer-map');
  const curve = new Chart($('#wafer-curve'), { height: 290, margin: { top: 18, right: 24, bottom: 42, left: 46 } });
  const C0 = 150, RAD = 140, PITCH = 26, DIE = 22, LMAX = 1.5;
  const dies = [];
  for (let i = -6; i < 6; i++) {
    for (let j = -6; j < 6; j++) {
      const x = C0 + i * PITCH + (PITCH - DIE) / 2, y = C0 + j * PITCH + (PITCH - DIE) / 2;
      const corners = [[x, y], [x + DIE, y], [x, y + DIE], [x + DIE, y + DIE]];
      if (corners.every(([a, b]) => Math.hypot(a - C0, b - C0) <= RAD - 5)) dies.push({ x, y });
    }
  }
  const N = dies.length;
  const svg = el('svg', { viewBox: '0 0 300 300', role: 'img' }, host);
  let seed = 7, lam = 0.3, arrivals = [];

  // Each chip gets a Poisson process of defects in "rate time": a defect with arrival
  // time t is present when t <= λ. Raising λ adds defects without moving the old ones,
  // and the count on each chip is exactly Poisson(λ).
  function newWafer() {
    const R = rng(seed);
    arrivals = dies.map(() => {
      const list = [];
      let t = -Math.log(1 - R.uniform());
      while (t <= LMAX) {
        list.push({ t, u: R.uniform(), v: R.uniform() });
        t += -Math.log(1 - R.uniform());
      }
      return list;
    });
  }

  function draw() {
    const hits = arrivals.map((list) => list.filter((a) => a.t <= lam));
    const c = sum(hits.map((h) => h.length));
    const np = hits.filter((h) => h.length > 0).length;
    const multi = hits.filter((h) => h.length > 1).length;

    svg.replaceChildren();
    el('path', { class: 'wf-disc', d: 'M116.77,286 A140,140 0 1 1 183.23,286 Z' }, svg);
    dies.forEach((d, i) => {
      el('rect', { class: `wf-die${hits[i].length ? ' is-defective' : ''}`, x: d.x, y: d.y, width: DIE, height: DIE, rx: 2.5 }, svg);
    });
    dies.forEach((d, i) => {
      for (const h of hits[i]) el('circle', { class: 'wf-defect', cx: d.x + 4 + h.u * (DIE - 8), cy: d.y + 4 + h.v * (DIE - 8), r: 2.3 }, svg);
    });
    svg.setAttribute('aria-label', `Wafer map with ${N} chips, ${c} defects and ${np} defective chips`);

    const grid = Array.from({ length: 31 }, (_, i) => i * 0.05);
    const cPer = c / N, pFrac = np / N;
    curve.update({
      x: { domain: [0, LMAX], label: 'Average defects per chip', ticks: 6 },
      y: { domain: [0, Math.max(1.6, cPer + 0.1)], label: 'Per chip' },
      aria: 'Expected defects per chip rise in a straight line with the defect rate, while the expected fraction of defective chips bends toward 1',
      layers: [
        { type: 'hline', y: 1, cls: 'limit-soft' },
        { type: 'text', x: LMAX, y: 1, dy: 14, text: 'All defective', cls: 'label', anchor: 'end' },
        { type: 'line', points: grid.map((x) => [x, x]), cls: 'data' },
        { type: 'line', points: grid.map((x) => [x, 1 - Math.exp(-x)]), cls: 'alt' },
        { type: 'vline', x: lam, cls: 'marker' },
        { type: 'dots', points: [[lam, cPer], [lam, pFrac]], cls: (p, i) => (i ? 'dot-alt' : 'dot'), r: 5 },
      ],
      hover: {
        xs: grid,
        mark: (i) => [grid[i], grid[i]],
        render: (i) => ({
          title: `${fmt(grid[i], 2)} defects per chip on average`,
          rows: [
            { label: 'expected defects per chip', value: fmt(grid[i], 2) },
            { label: 'expected fraction defective', value: fmt(1 - Math.exp(-grid[i]), 2), key: 'alt' },
          ],
        }),
      },
    });

    readouts($('#wafer-readouts'), [
      { label: 'Chips inspected, n', value: String(N) },
      { label: 'Defects, c', value: String(c), sub: `${fmt(cPer, 2)} per chip` },
      { label: 'Defective chips, np', value: String(np), sub: `Fraction defective ${fmt(pFrac, 2)}` },
      { label: 'Chips with two or more', value: String(multi), sub: c > np ? `np misses ${c - np} of the ${c} defects` : 'np and c agree' },
    ]);
  }

  legend($('#wafer-legend'), [
    { label: 'Defect', swatch: 'dot', color: 'data' },
    { label: 'Defective chip', swatch: 'box', color: 'alt' },
    { label: 'Expected defects per chip', swatch: 'line', color: 'data' },
    { label: 'Expected fraction defective', swatch: 'line', color: 'alt' },
  ]);
  bindRange('wafer-rate', (v) => { lam = v; if (arrivals.length) draw(); }, { format: (v) => fmt(v, 2) });
  $('#wafer-new').addEventListener('click', () => { seed += 1; newWafer(); draw(); });
  newWafer();
  draw();
}

/* ---------- Fig 5.2: the handbook c chart ---------- */
{
  const chart = new Chart($('#c-plot'), { height: 290 });
  const drop = $('#c-drop');
  const DROP = 23; // wafer 24

  function draw() {
    const used = WAFER_DEFECTS.map((_, i) => !(drop.checked && i === DROP));
    const kept = WAFER_DEFECTS.filter((_, i) => used[i]);
    const cbar = mean(kept), s = Math.sqrt(cbar);
    const ucl = cbar + 3 * s, lclRaw = cbar - 3 * s, lcl = Math.max(0, lclRaw);
    const status = WAFER_DEFECTS.map((v, i) => {
      if (!used[i]) return 'excluded';
      if (v > ucl + 1e-9) return 'above';
      if (v < lcl - 1e-9) return 'below';
      if (Math.abs(v - ucl) < 1e-9) return 'on';
      return 'in';
    });
    const pts = WAFER_DEFECTS.map((v, i) => [i + 1, v, status[i]]);
    const signals = status.filter((x) => x === 'above' || x === 'below').length;
    const layers = [
      { type: 'hline', y: ucl, cls: 'limit', label: `UCL ${num(ucl)}` },
      { type: 'hline', y: cbar, cls: 'center', label: `c̄ ${num(cbar, 2)}` },
      { type: 'hline', y: lcl, cls: 'limit', label: `LCL ${num(lcl)}` },
      { type: 'line', points: pts, cls: 'data-thin' },
      {
        type: 'dots', points: pts,
        cls: (p) => (p[2] === 'excluded' ? 'dot-muted' : p[2] === 'above' || p[2] === 'below' ? 'signal' : 'dot'),
        r: (p) => (p[2] === 'above' || p[2] === 'below' ? 4.8 : 3.2),
      },
    ];
    if (status[2] === 'on') layers.push({ type: 'annot', x: 3, y: 28, text: 'On the UCL', dx: 18, dy: -14 });
    if (drop.checked) layers.push({ type: 'annot', x: 24, y: 31, text: 'Excluded', dx: 18, dy: -6, anchor: 'end' });
    const NOTE = {
      above: 'Above the UCL: out of control',
      below: 'Below the LCL: out of control',
      on: 'Exactly on the UCL, so not beyond it',
      excluded: 'Excluded from the limits',
    };
    chart.update({
      x: { domain: [0.5, 25.5], label: 'Wafer', ticks: [1, 5, 10, 15, 20, 25] },
      y: { domain: [0, 34], label: 'Defects per wafer' },
      aria: `c chart of defects on 25 wafers with center line ${num(cbar)} and limits ${num(lcl)} and ${num(ucl)}`,
      layers,
      hover: {
        xs: pts.map((p) => p[0]),
        mark: (i) => pts[i],
        render: (i) => ({ title: `Wafer ${i + 1}`, rows: [{ label: 'defects', value: String(WAFER_DEFECTS[i]) }], note: NOTE[status[i]] }),
      },
    });
    readouts($('#c-readouts'), [
      { label: 'Center line, c̄', value: num(cbar, 3), sub: `${sum(kept)} defects on ${kept.length} wafers` },
      { label: 'UCL', value: num(ucl), sub: `c̄ + 3 × ${num(s, 3)}` },
      { label: 'LCL', value: num(lcl), sub: lclRaw < 0 ? 'Negative, so set to zero' : `c̄ − 3 × ${num(s, 3)}` },
      { label: 'Wafers beyond the limits', value: String(signals), sub: signals ? `Wafer ${pts.filter((p) => p[2] === 'above' || p[2] === 'below').map((p) => p[0]).join(', ')}` : 'None', state: signals ? 'signal' : 'good' },
    ]);
    const LABEL = { above: 'Above UCL', below: 'Below LCL', on: 'On the UCL', excluded: 'Excluded', in: '' };
    dataTable($('#c-table'), [
      { label: 'Wafer', key: 'w' },
      { label: 'Defects', key: 'c' },
      { label: 'Status', key: 's', num: false },
    ], WAFER_DEFECTS.map((c, i) => ({ w: i + 1, c, s: LABEL[status[i]], _cls: status[i] === 'above' || status[i] === 'below' ? 'is-signal' : '' })));
  }

  legend($('#c-legend'), [
    { label: 'Defects per wafer', swatch: 'line', color: 'data' },
    { label: 'Control limits', swatch: 'dash', color: 'ink' },
    { label: 'Out of control', swatch: 'dot', color: 'signal' },
    { label: 'Excluded wafer', swatch: 'dot', color: 'muted' },
  ]);
  drop.addEventListener('change', draw);
  draw();
}

/* ---------- Fig 5.3: the handbook p chart, as np, and with unequal sample sizes ---------- */
{
  const chart = new Chart($('#p-plot'), { height: 300 });
  const N = 50;
  const newBtn = $('#p-new');
  let view = 'p', seed = 21;

  function draw() {
    const vary = view === 'pvar';
    const R = rng(seed);
    const n = MISREG.map(() => (vary ? R.int(20, 100) : N));
    const D = MISREG.map((p, i) => Math.round(p * n[i]));
    const pbar = sum(D) / sum(n);
    const isNp = view === 'np';
    const y = isNp ? D : D.map((d, i) => d / n[i]);
    const cl = isNp ? N * pbar : pbar;
    const sig = n.map((k) => (isNp ? Math.sqrt(k * pbar * (1 - pbar)) : Math.sqrt((pbar * (1 - pbar)) / k)));
    const ucl = sig.map((s) => cl + 3 * s);
    const lclRaw = sig.map((s) => cl - 3 * s);
    const lcl = lclRaw.map((v) => Math.max(0, v));
    const flag = y.map((v, i) => (v > ucl[i] ? 'above' : v < lcl[i] ? 'below' : ''));
    const pts = y.map((v, i) => [i + 1, v, flag[i]]);
    const d = isNp ? 2 : 3;

    const layers = [];
    if (vary) {
      const stepPts = (arr) => arr.map((v, i) => [i + 0.5, v]);
      layers.push(
        { type: 'line', points: stepPts(ucl), step: true, stepEnd: 30.5, cls: 'ink dashed' },
        { type: 'line', points: stepPts(lcl), step: true, stepEnd: 30.5, cls: 'ink dashed' },
        { type: 'hline', y: cl, cls: 'center', label: `CL ${fmt(cl, 3)}` },
        { type: 'text', x: 30.5, y: ucl[29], dx: 8, text: 'UCL', cls: 'hlabel', baseline: 'middle' },
        { type: 'text', x: 30.5, y: lcl[29], dx: 8, text: 'LCL', cls: 'hlabel', baseline: 'middle' },
      );
    } else {
      layers.push(
        { type: 'hline', y: ucl[0], cls: 'limit', label: `UCL ${fmt(ucl[0], d)}` },
        { type: 'hline', y: cl, cls: 'center', label: `CL ${fmt(cl, d)}` },
        { type: 'hline', y: lcl[0], cls: 'limit', label: `LCL ${fmt(lcl[0], d)}` },
      );
    }
    layers.push(
      { type: 'line', points: pts, cls: 'data-thin' },
      { type: 'dots', points: pts, cls: (p) => (p[2] ? 'signal' : 'dot'), r: (p) => (p[2] ? 4.8 : 3.2) },
    );
    chart.update({
      x: { domain: [0.5, 30.5], label: 'Wafer', ticks: [1, 5, 10, 15, 20, 25, 30] },
      y: isNp ? { domain: [0, 28], label: 'Chips with misregistration', ticks: [0, 5, 10, 15, 20, 25] } : { domain: [0, 0.56], label: 'Fraction with misregistration', ticks: [0, 0.1, 0.2, 0.3, 0.4, 0.5] },
      aria: isNp ? 'np chart of misregistered chips per wafer' : vary ? 'p chart with stepped limits for unequal sample sizes' : 'p chart of the fraction of misregistered chips per wafer',
      layers,
      hover: {
        xs: pts.map((p) => p[0]),
        mark: (i) => pts[i],
        render: (i) => ({
          title: `Wafer ${i + 1}`,
          rows: [
            { label: isNp ? 'chips misregistered' : 'fraction', value: isNp ? String(D[i]) : fmt(y[i], 3) },
            ...(vary ? [{ label: 'chips measured', value: String(n[i]), key: 'none' }] : []),
            { label: 'limits', value: `${fmt(lcl[i], d)} to ${fmt(ucl[i], d)}`, key: 'ink' },
          ],
          note: flag[i] === 'above' ? 'Above the UCL: out of control' : flag[i] === 'below' ? 'Below the LCL: out of control' : undefined,
        }),
      },
    });

    const beyond = pts.filter((p) => p[2]).map((p) => p[0]);
    const zeroed = lclRaw.filter((v) => v < 0).length;
    readouts($('#p-readouts'), [
      { label: 'Center line', value: fmt(cl, isNp ? 2 : 4), sub: `${fmtInt(sum(D))} of ${fmtInt(sum(n))} chips misregistered` },
      vary
        ? { label: 'UCL', value: `${fmt(min(ucl), 2)} to ${fmt(max(ucl), 2)}`, sub: 'Narrowest for the largest wafers' }
        : { label: 'UCL', value: fmt(ucl[0], d), sub: `CL + 3 × ${fmt(sig[0], 4)}` },
      vary
        ? { label: 'LCL', value: `${fmt(min(lcl), 2)} to ${fmt(max(lcl), 2)}`, sub: zeroed ? `Set to zero on ${zeroed} wafer${zeroed > 1 ? 's' : ''}` : 'Positive on every wafer' }
        : { label: 'LCL', value: fmt(lcl[0], d), sub: lclRaw[0] < 0 ? 'Negative, so set to zero' : `CL − 3 × ${fmt(sig[0], 4)}` },
      { label: 'Wafers beyond the limits', value: String(beyond.length), sub: beyond.length ? `Wafer ${beyond.join(', ')}` : 'None', state: beyond.length ? 'signal' : 'good' },
    ]);
    dataTable($('#p-table'), [
      { label: 'Wafer', key: 'w' },
      { label: 'Chips measured', key: 'n' },
      { label: 'Misregistered', key: 'D' },
      { label: 'Fraction', key: 'p', fmt: (v) => fmt(v, 3) },
    ], MISREG.map((_, i) => ({ w: i + 1, n: n[i], D: D[i], p: D[i] / n[i], _cls: flag[i] ? 'is-signal' : '' })));
    newBtn.disabled = !vary;
  }

  legend($('#p-legend'), [
    { label: 'Wafer value', swatch: 'line', color: 'data' },
    { label: 'Control limits', swatch: 'dash', color: 'ink' },
    { label: 'Out of control', swatch: 'dot', color: 'signal' },
  ]);
  segmented('p-view', (v) => { view = v; draw(); });
  newBtn.addEventListener('click', () => { seed += 1; draw(); });
  draw();
}

/* ---------- Fig 5.4: exact Poisson tails against 3σ limits ---------- */
{
  const chart = new Chart($('#tail-chart'), { height: 300 });
  const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
  const sup = (v) => String(v).replace('-', '⁻').replace(/\d/g, (c) => SUP[c]);
  const FLOOR = -8;
  let lam = 10, scale = 'lin';

  function draw() {
    const s = Math.sqrt(lam);
    const ucl = lam + 3 * s, lcl = lam - 3 * s;
    const pm = poissonTable(lam);
    const lim = signalCounts('sigma', lam, pm);
    const rates = tailRates(lim, pm);
    const kmax = Math.ceil(Math.max(12, lam + 5.5 * s));
    const ks = Array.from({ length: kmax + 1 }, (_, k) => k);
    const log = scale === 'log';
    const Y = (p) => (log ? Math.max(FLOOR, Math.log10(Math.max(p, 1e-300))) : p);
    const base = log ? FLOOR : 0;
    const out = (k) => k >= lim.hi || k <= lim.lo;
    const xmin = Math.min(-0.7, lam - 3.6 * s);
    const curve = [];
    for (let x = xmin; x <= kmax + 0.7; x += 0.1) {
      const dens = normPdf(x, lam, s);
      curve.push([x, log ? (dens > 1e-8 ? Math.log10(dens) : null) : dens]);
    }
    const peak = max(pm.slice(0, kmax + 1));
    const layers = [
      { type: 'bars', bars: ks.map((k) => ({ x0: k - 0.5, x1: k + 0.5, y0: base, y: Y(pm[k]), cls: out(k) ? 'bar-signal' : 'bar' })) },
      { type: 'line', points: curve, cls: 'curve' },
      { type: 'vline', x: ucl, cls: 'marker', label: `UCL ${fmt(ucl, 2)}`, anchor: 'start' },
    ];
    if (lcl > 0) layers.push({ type: 'vline', x: lcl, cls: 'marker', label: `LCL ${fmt(lcl, 2)}`, anchor: 'start' });
    else layers.push({ type: 'vline', x: 0, cls: 'marker', label: 'No LCL', anchor: 'start' });
    chart.update({
      x: { domain: [xmin, kmax + 0.7], label: 'Defects in one sample' },
      y: log
        ? { domain: [FLOOR, 0.45], label: 'Probability (log scale)', ticks: [-8, -6, -4, -2, 0], format: (v) => (v === 0 ? '1' : `10${sup(v)}`) }
        : { domain: [0, peak * 1.15], label: 'Probability' },
      aria: `Poisson probabilities for a mean of ${fmt(lam, 1)} with three-sigma limits at ${fmt(lcl, 2)} and ${fmt(ucl, 2)}`,
      margin: { right: 24 },
      layers,
      hover: {
        xs: ks,
        mark: (i) => [ks[i], Y(pm[i])],
        render: (i) => ({
          title: `${i} defect${i === 1 ? '' : 's'}`,
          rows: [
            { label: 'probability', value: pct(pm[i]) },
            { label: 'samples per occurrence', value: pm[i] > 0 ? `1 in ${fmtInt(1 / pm[i])}` : 'never', key: 'none' },
          ],
          note: i >= lim.hi ? 'Beyond the UCL: a false alarm' : i <= lim.lo ? 'Below the LCL: a false alarm' : undefined,
        }),
      },
    });
    const total = rates.up + (rates.lo ?? 0);
    readouts($('#tail-readouts'), [
      { label: 'Three-sigma limits', value: `${fmt(Math.max(0, lcl), 2)} to ${fmt(ucl, 2)}`, sub: lcl <= 0 ? `The LCL formula gives ${fmt(lcl, 2)}` : `c̄ ± 3 × ${fmt(s, 2)}` },
      { label: 'False alarms below', value: lcl > 0 ? pct(rates.lo) : 'None possible', sub: lcl > 0 ? versusNominal(rates.lo) : 'No lower limit', state: lcl > 0 && rates.lo / ALPHA > 0.5 ? undefined : 'signal' },
      { label: 'False alarms above', value: pct(rates.up), sub: versusNominal(rates.up), state: rates.up / ALPHA > 1.5 ? 'signal' : undefined },
      { label: 'Average run length in control', value: fmtInt(1 / total), sub: 'Normal theory promises 370' },
    ]);
  }

  legend($('#tail-legend'), [
    { label: 'Poisson probability', swatch: 'box', color: 'data' },
    { label: 'Beyond a three-sigma limit', swatch: 'box', color: 'signal' },
    { label: 'Normal approximation', swatch: 'line', color: 'ink' },
    { label: 'Three-sigma limits', swatch: 'dash', color: 'ink' },
  ]);
  scale = segmented('tail-scale', (v) => { scale = v; draw(); }).value;
  bindRange('tail-mean', (v) => { lam = v; draw(); }, { format: (v) => fmt(v, 1) });
}

/* ---------- Fig 5.5: four ways to set limits, across the mean ---------- */
{
  const chart = new Chart($('#lim-chart'), { height: 310 });
  const LAMS = Array.from({ length: 291 }, (_, i) => 1 + i / 10);
  const METHODS = ['sigma', 'root', 'anscombe', 'ft', 'prob'];
  const NAMES = { sigma: 'Three-sigma limits', root: 'Square root, 2√c', anscombe: 'Anscombe, 2√(c + 3/8)', ft: 'Freeman–Tukey, √c + √(c + 1)', prob: 'Probability limits' };
  const HANDBOOK = 16;
  const tables = LAMS.map(poissonTable);
  const res = {};
  for (const m of METHODS) res[m] = LAMS.map((lam, i) => tailRates(signalCounts(m, lam, tables[i]), tables[i]));
  const hbTable = poissonTable(HANDBOOK);
  let method = 'sigma';
  const L10 = (p) => (p === null || p <= 0 ? null : Math.log10(p));
  const PCT = { '-5': '0.001%', '-4': '0.01%', '-3': '0.1%', '-2': '1%', '-1': '10%' };

  function draw() {
    const r = res[method];
    const up = LAMS.map((x, i) => [x, L10(r[i].up)]);
    const lo = LAMS.map((x, i) => [x, L10(r[i].lo)]);
    const firstLo = LAMS.find((_, i) => r[i].lo !== null);
    const layers = [];
    if (firstLo > LAMS[0]) {
      layers.push({ type: 'xband', x0: LAMS[0], x1: firstLo - 0.05, cls: 'band' });
      layers.push({ type: 'text', x: LAMS[0] + 0.3, y: -4.75, text: 'No lower limit', cls: 'label' });
    }
    layers.push({ type: 'hline', y: Math.log10(ALPHA), cls: 'center', label: '0.135%' });
    layers.push({ type: 'vline', x: HANDBOOK, cls: 'marker', label: 'Wafers, c̄ = 16', labelY: -1.12 });
    if (method !== 'sigma') {
      const s = res.sigma;
      layers.push({ type: 'line', points: LAMS.map((x, i) => [x, L10(s[i].up)]), cls: 'faint' });
      layers.push({ type: 'line', points: LAMS.map((x, i) => [x, L10(s[i].lo)]), cls: 'faint' });
    }
    layers.push({ type: 'line', points: lo, cls: 'alt' });
    layers.push({ type: 'line', points: up, cls: 'data' });
    chart.update({
      x: { domain: [1, 30], label: 'Mean count per sample', ticks: [1, 5, 10, 15, 20, 25, 30] },
      y: { domain: [-5, -0.85], label: 'Chance per tail (log scale)', ticks: [-5, -4, -3, -2, -1], format: (v) => PCT[String(v)] ?? '' },
      aria: `${NAMES[method]}: actual false-alarm probability above and below the limits for mean counts from 1 to 30`,
      margin: { left: 58 },
      layers,
      hover: {
        xs: LAMS,
        mark: (i) => up[i],
        render: (i) => ({
          title: `Mean ${fmt(LAMS[i], 1)} defects`,
          rows: [
            { label: 'above the UCL', value: pct(r[i].up) },
            { label: 'below the LCL', value: r[i].lo === null ? 'no limit' : pct(r[i].lo), key: 'alt' },
          ],
        }),
      },
    });
    const lim = signalCounts(method, HANDBOOK, hbTable);
    const hb = tailRates(lim, hbTable);
    const flagged = WAFER_DEFECTS.map((c, i) => [i + 1, c]).filter(([, c]) => c >= lim.hi || c <= lim.lo);
    readouts($('#lim-readouts'), [
      { label: 'Counts that do not signal, c̄ = 16', value: `${lim.lo + 1} to ${lim.hi - 1}`, sub: flagged.length ? `Handbook wafer ${flagged.map(([w, c]) => `${w} (${c})`).join(', ')} signals` : 'No handbook wafer signals' },
      { label: 'Above the UCL at c̄ = 16', value: pct(hb.up), sub: versusNominal(hb.up) },
      { label: 'Below the LCL at c̄ = 16', value: hb.lo === null ? 'None' : pct(hb.lo), sub: versusNominal(hb.lo) },
      { label: 'Lower limit exists for means above', value: `about ${fmt(firstLo - 0.1, 1)}` },
    ]);
    legend($('#lim-legend'), [
      { label: 'Upper tail', swatch: 'line', color: 'data' },
      { label: 'Lower tail', swatch: 'line', color: 'alt' },
      ...(method === 'sigma' ? [] : [{ label: 'Three-sigma limits, for comparison', swatch: 'line', color: 'muted' }]),
      { label: 'Nominal 0.135% per tail', swatch: 'line', color: 'ink' },
      { label: 'No lower limit', swatch: 'box', color: 'muted' },
    ]);
  }

  segmented('lim-method', (v) => { method = v; draw(); });
  draw();
}
