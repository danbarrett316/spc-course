// Module 7: EWMA charts.

import { Chart, el, dataTable } from '../chart.js';
import { rng, ewma, mean, sd, shewhartArl, fmt, fmtInt } from '../stats.js';
import { bindRange, segmented, readouts, legend, $ } from '../ui.js';

// The handbook's EWMA example (NIST 6.3.2.4).
const Y = [52.0, 47.0, 53.0, 49.3, 50.1, 47.0, 51.0, 50.1, 51.2, 50.5, 49.6, 47.6, 49.9, 51.3, 47.8, 51.2, 52.6, 52.4, 53.6, 52.1];
const T0 = 50, S0 = 2.0539, K = 3;
const N = Y.length;

function fmtArl(v) {
  if (!Number.isFinite(v)) return '∞';
  if (v >= 100) return fmtInt(Math.round(v));
  return fmt(v, v >= 10 ? 1 : 2);
}

/** A share as a percentage, with tiny values shown as a bound. */
const pct = (p) => (p < 0.0001 ? 'under 0.01%' : `${fmt(100 * p, p >= 0.1 ? 0 : p >= 0.01 ? 1 : 2)}%`);

/** Redraw at most once per animation frame while a slider is dragged. */
function throttle(fn) {
  let pending = false;
  return () => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; fn(); });
  };
}

/* ---------- Fig 7.1: the weights behind an EWMA ---------- */
{
  const chart = new Chart($('#wt-chart'), { height: 260, margin: { top: 16, right: 20, bottom: 42, left: 54 } });
  const M = 20;
  let lam = 0.3, cmp = 'shewhart';

  function draw() {
    const w = Array.from({ length: M }, (_, i) => lam * (1 - lam) ** i); // i = age, 0 is the latest
    const cw = (i) => (cmp === 'shewhart' ? (i === 0 ? 1 : 0) : i < 5 ? 0.2 : 0);
    const outline = cmp === 'shewhart'
      ? [[-M + 0.5, 0], [-0.5, 0], [-0.5, 1], [0.5, 1]]
      : [[-M + 0.5, 0], [-4.5, 0], [-4.5, 0.2], [0.5, 0.2]];
    const top = Math.max(lam, cmp === 'shewhart' ? 1 : 0.2) * 1.12;
    chart.update({
      x: { domain: [-M + 0.5, 0.5], label: 'Observations before the latest', ticks: [-15, -10, -5, 0], format: (v) => (v === 0 ? 'Latest' : `−${-v}`) },
      y: { domain: [0, top], label: 'Weight' },
      aria: `Weights the EWMA with lambda ${fmt(lam, 2)} gives to the last 20 observations, compared with ${cmp === 'shewhart' ? 'a Shewhart chart' : 'a 5-point moving average'}`,
      layers: [
        { type: 'area', points: outline, base: 0, cls: 'area-alt' },
        { type: 'bars', bars: w.map((v, i) => ({ x0: -i - 0.5, x1: -i + 0.5, y: v })), cls: 'bar' },
        { type: 'line', points: outline, cls: 'alt' },
      ],
      hover: {
        xs: w.map((_, i) => -i), mark: (i) => [-i, w[i]],
        render: (i) => ({
          title: i === 0 ? 'Latest observation' : `${i} before the latest`,
          rows: [{ label: 'EWMA weight', value: fmt(w[i], 3) }, { label: cmp === 'shewhart' ? 'Shewhart weight' : 'moving-average weight', value: fmt(cw(i), 3), key: 'alt' }],
        }),
      },
    });
    const half = lam >= 1 ? 1 : Math.ceil(Math.log(0.5) / Math.log(1 - lam) - 1e-9);
    readouts($('#wt-readouts'), [
      { label: 'Weight on the latest point', value: `${fmt(100 * lam, 0)}%` },
      { label: 'Weight on the last 5 points', value: `${fmt(100 * (1 - (1 - lam) ** 5), 0)}%` },
      { label: 'Half the weight sits in the last', value: `${half} point${half === 1 ? '' : 's'}` },
      { label: 'Weight older than 20 points', value: pct((1 - lam) ** M), sub: 'including the starting value' },
    ]);
    legend($('#wt-legend'), [
      { label: `EWMA, λ = ${fmt(lam, 2)}`, swatch: 'box', color: 'data' },
      { label: cmp === 'shewhart' ? 'Shewhart chart' : '5-point moving average', swatch: 'line', color: 'alt' },
    ]);
  }

  lam = bindRange('wt-lambda', (v) => { lam = v; draw(); }, { format: (v) => fmt(v, 2), call: false }).value;
  cmp = segmented('wt-compare', (v) => { cmp = v; draw(); }).value;
  draw();
}

/* ---------- Fig 7.2: the handbook example ---------- */
{
  const chart = new Chart($('#ex-chart'), { height: 300 });
  let lam = 0.3, mode = 'asym';

  function draw() {
    const r = ewma(Y, T0, S0, lam, K, mode === 'asym');
    const zPts = r.z.map((v, i) => [i + 1, v]);
    const yPts = Y.map((v, i) => [i + 1, v]);
    const all = [...Y, ...r.ucl, ...r.lcl];
    const lo = Math.min(...all), hi = Math.max(...all);
    const out = r.signals.filter(Boolean).length;
    const layers = [{ type: 'hline', y: T0, cls: 'center', label: 'CL 50' }];
    if (mode === 'asym') {
      layers.push(
        { type: 'hline', y: r.ucl[0], cls: 'limit', label: `UCL ${fmt(r.ucl[0], 2)}` },
        { type: 'hline', y: r.lcl[0], cls: 'limit', label: `LCL ${fmt(r.lcl[0], 2)}` },
      );
    } else {
      // exact limits change every period, so draw them as steps
      const step = (arr) => arr.map((v, i) => [i + 0.5, v]);
      layers.push(
        { type: 'line', points: step(r.ucl), step: true, stepEnd: N + 0.5, cls: 'ink dashed' },
        { type: 'line', points: step(r.lcl), step: true, stepEnd: N + 0.5, cls: 'ink dashed' },
        { type: 'text', x: N + 0.5, y: r.ucl[N - 1], dx: 8, text: `UCL ${fmt(r.ucl[N - 1], 2)}`, cls: 'hlabel', baseline: 'middle' },
        { type: 'text', x: N + 0.5, y: r.lcl[N - 1], dx: 8, text: `LCL ${fmt(r.lcl[N - 1], 2)}`, cls: 'hlabel', baseline: 'middle' },
      );
    }
    layers.push(
      { type: 'dots', points: yPts, cls: 'dot-muted', r: 3.2 },
      { type: 'line', points: [[0, T0], ...zPts], cls: 'data' },
      { type: 'dots', points: zPts, cls: (p, i) => (r.signals[i] ? 'signal' : 'dot'), r: (p, i) => (r.signals[i] ? 4.5 : 3.2) },
    );
    chart.update({
      x: { domain: [-0.5, N + 0.5], label: 'Period', ticks: [0, 5, 10, 15, 20] },
      y: { domain: [Math.min(lo, 46.5) - 0.3, Math.max(hi, 53.5) + 0.3], label: 'Value' },
      aria: `EWMA chart of the handbook example with lambda ${fmt(lam, 2)} and ${mode === 'asym' ? 'asymptotic' : 'exact'} limits`,
      layers,
      hover: {
        xs: zPts.map((p) => p[0]), mark: (i) => zPts[i],
        render: (i) => ({
          title: `Period ${i + 1}`,
          rows: [
            { label: 'observation', value: fmt(Y[i], 1), key: 'ink' },
            { label: 'EWMA', value: fmt(r.z[i], 2) },
            { label: 'limits', value: `${fmt(r.lcl[i], 2)} to ${fmt(r.ucl[i], 2)}`, key: 'none' },
          ],
          note: r.signals[i] ? 'EWMA outside its limits' : undefined,
        }),
      },
    });
    const f = Math.sqrt(lam / (2 - lam));
    readouts($('#ex-readouts'), [
      { label: 'Control limits', value: `${fmt(r.lcl[N - 1], 2)} to ${fmt(r.ucl[N - 1], 2)}`, sub: mode === 'asym' ? 'asymptotic' : `exact; ${fmt(r.lcl[0], 2)} to ${fmt(r.ucl[0], 2)} at period 1` },
      { label: 'Standard deviation of the EWMA', value: fmt(S0 * f, 4), sub: `${fmt(100 * f, 0)}% of s = 2.0539` },
      { label: 'Latest EWMA', value: fmt(r.z[N - 1], 2), sub: 'period 20' },
      { label: 'EWMA points outside', value: String(out), state: out ? 'signal' : 'good', sub: out ? 'out of control' : 'in control' },
    ]);
    const rows = [{ t: 0, y: null, z: T0, lcl: null, ucl: null }, ...Y.map((y, i) => ({ t: i + 1, y, z: r.z[i], lcl: r.lcl[i], ucl: r.ucl[i], _cls: r.signals[i] ? 'is-signal' : '' }))];
    dataTable($('#ex-table'), [
      { label: 'Period', key: 't' },
      { label: 'Observation', key: 'y', fmt: (v) => fmt(v, 1) },
      { label: `EWMA (λ = ${fmt(lam, 2)})`, key: 'z', fmt: (v) => fmt(v, 2) },
      { label: 'LCL', key: 'lcl', fmt: (v) => fmt(v, 4) },
      { label: 'UCL', key: 'ucl', fmt: (v) => fmt(v, 4) },
    ], rows);
  }

  legend($('#ex-legend'), [
    { label: 'Observation', swatch: 'dot', color: 'muted' },
    { label: 'EWMA', swatch: 'line', color: 'data' },
    { label: 'Control limits for the EWMA', swatch: 'dash', color: 'ink' },
  ]);
  lam = bindRange('ex-lambda', (v) => { lam = v; draw(); }, { format: (v) => fmt(v, 2), call: false }).value;
  mode = segmented('ex-limits', (v) => { mode = v; draw(); }).value;
  draw();
}

/* ---------- Fig 7.3: a detection race, simulated ---------- */
{
  const chart = new Chart($('#race7-chart'), { height: 290 });
  const RUNS = 300, CAP = 5000;
  const SHIFTS = Array.from({ length: 13 }, (_, i) => i * 0.25);
  const fine = Array.from({ length: 61 }, (_, i) => i * 0.05);
  const lg = (v) => Math.log10(Math.min(Math.max(v, 1), 1e5));
  let lam = 0.2, L = 3, shift = 1, seed = 1;

  /** Zero-state run lengths of an EWMA with asymptotic limits, standardized data. */
  function simulate(delta) {
    const w = L * Math.sqrt(lam / (2 - lam));
    const lens = new Array(RUNS);
    let capped = 0;
    for (let r = 0; r < RUNS; r++) {
      // run r reuses the same random stream at every shift, so the curve is smooth
      const R = rng(seed * 7919 + r);
      let z = 0, t = 0, hit = false;
      while (t < CAP) {
        t++;
        z = lam * (R.normal(0, 1) + delta) + (1 - lam) * z;
        if (z > w || z < -w) { hit = true; break; }
      }
      if (!hit) capped++;
      lens[r] = t;
    }
    return { arl: mean(lens), se: sd(lens) / Math.sqrt(RUNS), capped };
  }

  function draw() {
    const res = SHIFTS.map(simulate);
    const shewFine = fine.map((d) => [d, lg(shewhartArl(d, 3))]);
    const pts = SHIFTS.map((d, i) => [d, lg(res[i].arl)]);
    const sel = SHIFTS.indexOf(shift);
    chart.update({
      x: { domain: [0, 3], label: 'Shift in the mean (σ)', ticks: [0, 0.5, 1, 1.5, 2, 2.5, 3], format: (v) => fmt(v, v % 1 ? 1 : 0) },
      y: { domain: [0, 4.25], label: 'ARL, log scale', ticks: [0, 1, 2, 3, 4], format: (v) => fmtInt(10 ** v) },
      aria: 'Simulated average run length of the EWMA chart against the exact run length of a 3-sigma Shewhart chart, on a logarithmic scale',
      layers: [
        { type: 'vline', x: shift, cls: 'marker' },
        { type: 'line', points: shewFine, cls: 'ink' },
        {
          type: 'custom',
          draw(g, sx, sy) {
            res.forEach((o, i) => {
              const a = lg(Math.max(1, o.arl - 2 * o.se)), b = lg(o.arl + 2 * o.se);
              el('line', { class: 'k-data', x1: sx(SHIFTS[i]), x2: sx(SHIFTS[i]), y1: sy(a), y2: sy(b) }, g);
            });
          },
        },
        { type: 'line', points: pts, cls: 'data' },
        { type: 'dots', points: pts, cls: (p, i) => (i === sel ? 'dot-ink' : 'dot'), r: (p, i) => (i === sel ? 5 : 3.2) },
      ],
      hover: {
        xs: SHIFTS, mark: (i) => pts[i],
        render: (i) => ({
          title: `Shift of ${fmt(SHIFTS[i], 2)}σ`,
          rows: [
            { label: 'EWMA, simulated', value: `${res[i].capped ? '≥ ' : ''}${fmtArl(res[i].arl)} ± ${fmt(2 * res[i].se, res[i].arl >= 100 ? 0 : 1)}` },
            { label: 'Shewhart, exact', value: fmtArl(shewhartArl(SHIFTS[i], 3)), key: 'ink' },
          ],
        }),
      },
    });
    const o = res[sel], o0 = res[0];
    const sh = shewhartArl(shift, 3);
    const ewmaWins = shift > 0 && o.arl < sh;
    readouts($('#race7-readouts'), [
      { label: `EWMA at ${fmt(shift, 2)}σ`, value: `${o.capped ? '≥ ' : ''}${fmtArl(o.arl)}`, sub: `± ${fmt(2 * o.se, o.arl >= 100 ? 0 : 1)}, ${RUNS} simulated runs`, state: ewmaWins ? 'good' : undefined },
      { label: `Shewhart at ${fmt(shift, 2)}σ`, value: fmtArl(sh), sub: 'exact, 3σ limits', state: shift > 0 && !ewmaWins ? 'good' : undefined },
      { label: 'EWMA in control', value: `${o0.capped ? '≥ ' : ''}${fmtArl(o0.arl)}`, sub: o0.capped ? `${o0.capped} runs passed ${fmtInt(CAP)} samples` : `± ${fmt(2 * o0.se, 0)}` },
      { label: 'Shewhart in control', value: fmtArl(shewhartArl(0, 3)), sub: 'exact' },
    ]);
  }

  legend($('#race7-legend'), [
    { label: 'EWMA, simulated, with ±2 standard errors', swatch: 'line', color: 'data' },
    { label: 'Shewhart individuals chart, 3σ, exact', swatch: 'line', color: 'ink' },
  ]);
  const redraw = throttle(draw);
  lam = bindRange('race7-lambda', (v) => { lam = v; redraw(); }, { format: (v) => fmt(v, 2), call: false }).value;
  L = bindRange('race7-k', (v) => { L = v; redraw(); }, { format: (v) => fmt(v, 3), call: false }).value;
  shift = bindRange('race7-shift', (v) => { shift = v; redraw(); }, { format: (v) => `${fmt(v, 2)}σ`, call: false }).value;
  $('#race7-new').addEventListener('click', () => { seed += 1; draw(); });
  draw();
}

/* ---------- Fig 7.4: the EWMA as a one-step forecast ---------- */
{
  const chart = new Chart($('#fc-chart'), { height: 270 });
  const sse = (l) => { let f = T0, s = 0; for (const y of Y) { s += (y - f) ** 2; f = l * y + (1 - l) * f; } return s; };
  const grid = Array.from({ length: 20 }, (_, i) => +(0.05 * (i + 1)).toFixed(2));
  const best = grid.reduce((a, b) => (sse(b) < sse(a) ? b : a));
  let lam = 0.3;

  function draw() {
    const fc = [];
    let prev = T0;
    for (const y of Y) { fc.push(prev); prev = lam * y + (1 - lam) * prev; }
    fc.push(prev); // the forecast for period 21
    const fPts = fc.map((v, i) => [i + 1, v]);
    const yPts = Y.map((v, i) => [i + 1, v]);
    const e = sse(lam);
    chart.update({
      x: { domain: [0.5, N + 1.5], label: 'Period', ticks: [1, 5, 10, 15, 20] },
      y: { domain: [46, 54.5], label: 'Value' },
      aria: `Observations and their one-step EWMA forecasts with lambda ${fmt(lam, 2)}`,
      layers: [
        { type: 'hline', y: T0, cls: 'center', label: 'Target 50' },
        {
          type: 'custom',
          draw(g, sx, sy) {
            Y.forEach((y, i) => el('line', { class: 'k-faint', x1: sx(i + 1), x2: sx(i + 1), y1: sy(y), y2: sy(fc[i]) }, g));
          },
        },
        { type: 'line', points: yPts, cls: 'data-thin' },
        { type: 'dots', points: yPts, cls: 'dot', r: 3.2 },
        { type: 'line', points: fPts, cls: 'alt' },
        { type: 'dots', points: fPts, cls: 'dot-alt', r: (p, i) => (i === N ? 5 : 2.6) },
      ],
      hover: {
        xs: fPts.map((p) => p[0]), mark: (i) => (i < N ? yPts[i] : fPts[i]),
        render: (i) => (i < N
          ? { title: `Period ${i + 1}`, rows: [{ label: 'observation', value: fmt(Y[i], 1) }, { label: 'forecast', value: fmt(fc[i], 2), key: 'alt' }, { label: 'error', value: fmt(Y[i] - fc[i], 2), key: 'none' }] }
          : { title: 'Period 21', rows: [{ label: 'forecast', value: fmt(fc[i], 2), key: 'alt' }] }),
      },
    });
    readouts($('#fc-readouts'), [
      { label: 'Sum of squared errors', value: fmt(e, 1), sub: `λ = ${fmt(lam, 2)}`, state: Math.abs(lam - best) < 1e-9 ? 'good' : undefined },
      { label: 'Typical forecast error', value: fmt(Math.sqrt(e / N), 2), sub: 'root mean square; s = 2.05' },
      { label: 'Best λ for these data', value: fmt(best, 2), sub: `sum of squares ${fmt(sse(best), 1)}` },
      { label: 'Forecast for period 21', value: fmt(fc[N], 2) },
    ]);
  }

  legend($('#fc-legend'), [
    { label: 'Observation', swatch: 'line', color: 'data' },
    { label: 'Forecast (EWMA through the period before)', swatch: 'line', color: 'alt' },
    { label: 'Forecast error', swatch: 'line', color: 'muted' },
  ]);
  lam = bindRange('fc-lambda', (v) => { lam = v; draw(); }, { format: (v) => fmt(v, 2), call: false }).value;
  draw();
}
