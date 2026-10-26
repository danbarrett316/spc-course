// Module 6: CUSUM charts.

import { Chart, el, dataTable } from '../chart.js';
import { rng, cusum, cusumArl, shewhartArl, fmt, fmtInt } from '../stats.js';
import { bindRange, readouts, legend, $ } from '../ui.js';

// The handbook's CUSUM example (NIST 6.3.2.3): 20 subgroup averages, n = 4.
const XBAR = [324.925, 324.675, 324.725, 324.350, 325.350, 325.225, 324.125, 324.525, 325.225, 324.600,
  324.625, 325.150, 328.325, 327.250, 327.825, 328.500, 326.675, 327.775, 326.875, 328.350];
const MU0 = 325;
const SE = 1.27 / Math.sqrt(4); // σ of a subgroup average, 0.635
const HB = { k: 0.3175, h: 4.1959 }; // the example's chosen k and h, in data units
const G = XBAR.length;
const EX = cusum(XBAR, MU0, HB.k, HB.h);
const CUM = [0, ...EX.cum]; // cumulative sum, with the starting value S_0 = 0 at group 0

/** ARL of a two-sided CUSUM (upper and lower sums together), standardized k and h. */
const cusumArl2 = (d, k, h, states) => 1 / (1 / cusumArl(d, k, h, states) + 1 / cusumArl(-d, k, h, states));

/** Run lengths read best with three significant figures. */
function fmtArl(v) {
  if (!Number.isFinite(v) || v > 1e6) return 'over 1,000,000';
  if (v >= 100) return fmtInt(Math.round(v));
  return fmt(v, v >= 10 ? 1 : 2);
}

/* ---------- Fig 6.1: the same shift on an X̄ chart and a CUSUM ---------- */
{
  const top = new Chart($('#race-xbar'), { height: 210 });
  const bot = new Chart($('#race-cusum'), { height: 230 });
  const N = 60, K = 0.5, H = 5; // CUSUM design in σ_x̄ units
  const UCL = MU0 + 3 * SE, LCL = MU0 - 3 * SE;
  let seed = 16, shift = 1, start = 20;

  function draw() {
    const R = rng(seed);
    const xs = Array.from({ length: N }, (_, i) => MU0 + SE * (R.normal(0, 1) + (i + 1 >= start ? shift : 0)));
    const cs = cusum(xs, MU0, K * SE, H * SE);
    const xSig = xs.map((x) => x > UCL || x < LCL);
    const cSig = cs.signals;
    const from = shift > 0 ? start - 1 : 0;
    const first = (sig) => { for (let i = from; i < N; i++) if (sig[i]) return i; return -1; };
    const fx = first(xSig), fc = first(cSig);

    const pts = xs.map((x, i) => [i + 1, x]);
    const hiPts = cs.hi.map((v, i) => [i + 1, v]);
    const loPts = cs.lo.map((v, i) => [i + 1, -v]);
    const xAxis = { domain: [0.5, N + 0.5], label: 'Sample', ticks: [1, 10, 20, 30, 40, 50, 60] };
    const shiftLine = shift > 0 ? [{ type: 'vline', x: start - 0.5, cls: 'shift', label: `Mean shifts +${fmt(shift, 2)}σ` }] : [];

    top.update({
      x: xAxis,
      y: { domain: [Math.min(LCL, ...xs) - 0.25, Math.max(UCL, ...xs) + 0.75], label: 'Subgroup average' },
      aria: 'Shewhart chart of 60 subgroup averages with 3-sigma control limits',
      layers: [
        { type: 'hline', y: MU0, cls: 'center', label: 'CL 325' },
        { type: 'hline', y: UCL, cls: 'limit', label: `UCL ${fmt(UCL, 2)}` },
        { type: 'hline', y: LCL, cls: 'limit', label: `LCL ${fmt(LCL, 2)}` },
        ...shiftLine,
        { type: 'line', points: pts, cls: 'data-thin' },
        { type: 'dots', points: pts, cls: (p, i) => (xSig[i] ? 'signal' : 'dot'), r: (p, i) => (xSig[i] ? 4.5 : 2.8) },
      ],
      hover: {
        xs: pts.map((p) => p[0]), mark: (i) => pts[i],
        render: (i) => ({ title: `Sample ${i + 1}`, rows: [{ label: 'subgroup average', value: fmt(xs[i], 3) }], note: xSig[i] ? 'Beyond a 3σ limit' : undefined }),
      },
    });

    const h = H * SE;
    const yHi = Math.max(h, ...cs.hi) * 1.1, yLo = Math.max(h, ...cs.lo) * 1.1;
    bot.update({
      x: xAxis,
      y: { domain: [-yLo, yHi], label: 'CUSUM' },
      aria: 'Two-sided tabular CUSUM of the same averages, upper sum above zero and lower sum drawn below zero, with decision interval h',
      layers: [
        { type: 'hline', y: 0, cls: 'center' },
        { type: 'hline', y: h, cls: 'limit', label: `h ${fmt(h, 2)}` },
        { type: 'hline', y: -h, cls: 'limit', label: `−h` },
        ...shiftLine.map((l) => ({ ...l, label: undefined })),
        { type: 'area', points: hiPts, base: 0, cls: 'area' },
        { type: 'area', points: loPts, base: 0, cls: 'area-alt' },
        { type: 'line', points: hiPts, cls: 'data' },
        { type: 'line', points: loPts, cls: 'alt' },
        { type: 'dots', points: loPts, cls: (p, i) => (cs.lo[i] > h ? 'signal' : 'dot-alt'), r: (p, i) => (cs.lo[i] > h ? 4.5 : 2.4) },
        { type: 'dots', points: hiPts, cls: (p, i) => (cs.hi[i] > h ? 'signal' : 'dot'), r: (p, i) => (cs.hi[i] > h ? 4.5 : 2.4) },
      ],
      hover: {
        xs: pts.map((p) => p[0]),
        mark: (i) => (cs.lo[i] > cs.hi[i] ? loPts[i] : hiPts[i]),
        render: (i) => ({
          title: `Sample ${i + 1}`,
          rows: [{ label: 'upper sum', value: fmt(cs.hi[i], 2) }, { label: 'lower sum', value: fmt(cs.lo[i], 2), key: 'alt' }],
          note: cs.hi[i] > h ? 'Upper sum above h: the mean has moved up' : cs.lo[i] > h ? 'Lower sum above h: the mean has moved down' : undefined,
        }),
      },
    });

    const winner = shift > 0 && (fx >= 0 || fc >= 0)
      ? (fc >= 0 && (fx < 0 || fc < fx) ? 'c' : fx >= 0 && (fc < 0 || fx < fc) ? 'x' : null)
      : null;
    const item = (name, f, who) => {
      if (f < 0) return { label: name, value: 'No signal', sub: shift > 0 ? `in ${N - start + 1} samples after the shift` : `in ${N} samples` };
      if (shift === 0) return { label: name, value: `Sample ${f + 1}`, sub: 'A false alarm', state: 'signal' };
      const lag = f + 2 - start;
      return { label: name, value: `Sample ${f + 1}`, sub: `${lag} sample${lag === 1 ? '' : 's'} after the shift`, state: winner === who ? 'good' : undefined };
    };
    readouts($('#race-readouts'), [
      item('Shewhart, first signal', fx, 'x'),
      item('CUSUM, first signal', fc, 'c'),
      { label: 'Shewhart, average delay', value: fmtArl(shewhartArl(shift, 3)), sub: shift > 0 ? 'ARL at this shift' : 'In-control ARL' },
      { label: 'CUSUM, average delay', value: fmtArl(cusumArl2(shift, K, H, 80)), sub: shift > 0 ? 'ARL at this shift' : 'In-control ARL' },
    ]);
  }

  legend($('#race-legend'), [
    { label: 'Subgroup average', swatch: 'line', color: 'data' },
    { label: 'Upper sum (upward shifts)', swatch: 'box', color: 'data' },
    { label: 'Lower sum, drawn below zero', swatch: 'box', color: 'alt' },
    { label: '3σ limits and ±h', swatch: 'dash', color: 'ink' },
    { label: 'Signal', swatch: 'dot', color: 'signal' },
  ]);
  // read the sliders, so a form state restored by the browser matches the chart
  shift = bindRange('race-shift', (v) => { shift = v; draw(); }, { format: (v) => `${fmt(v, 2)}σ`, call: false }).value;
  start = bindRange('race-start', (v) => { start = v; draw(); }, { format: (v) => `sample ${v}`, call: false }).value;
  $('#race-new').addEventListener('click', () => { seed += 1; draw(); });
  draw();
}

/* ---------- Fig 6.2: the slope of the cumulative sum is the mean ---------- */
{
  const chart = new Chart($('#slope-chart'), { height: 290 });
  const dev = XBAR.map((x) => x - MU0);
  let f = 13, l = 20;

  function draw() {
    const a = f - 1, b = l;
    const rise = CUM[b] - CUM[a];
    const slope = rise / (b - a);
    const sumPts = CUM.map((v, i) => [i, v]);
    chart.update({
      x: { domain: [-0.5, G + 0.5], label: 'Group', ticks: [0, 5, 10, 15, 20] },
      y: { domain: [-4, 21], label: 'Sum of deviations from 325' },
      aria: 'Cumulative sum of the handbook subgroup averages with the chosen stretch and its slope',
      layers: [
        { type: 'xband', x0: a, x1: b, cls: 'band-accent' },
        { type: 'hline', y: 0, cls: 'center' },
        // each bar is the step the line takes from group i − 1 to group i
        { type: 'bars', bars: dev.map((d, i) => ({ x0: i + 0.12, x1: i + 0.88, y: d })), cls: 'bar-muted' },
        { type: 'line', points: sumPts, cls: 'data' },
        { type: 'dots', points: sumPts, cls: (p, i) => (i === 0 ? 'dot-hollow' : 'dot'), r: 3.2 },
        { type: 'line', points: [[a, CUM[a]], [b, CUM[b]]], cls: 'ink dashed' },
        { type: 'dots', points: [[a, CUM[a]], [b, CUM[b]]], cls: 'dot-ink', r: 5 },
        { type: 'text', x: (a + b) / 2, y: (CUM[a] + CUM[b]) / 2, dx: 10, dy: 16, text: `slope ${fmt(slope, 2)}`, cls: 'label-strong' },
      ],
      hover: {
        xs: sumPts.map((p) => p[0]), mark: (i) => sumPts[i],
        render: (i) => (i === 0
          ? { title: 'Start', rows: [{ label: 'sum', value: '0.00' }] }
          : { title: `Group ${i}`, rows: [{ label: 'group mean', value: fmt(XBAR[i - 1], 3), key: 'none' }, { label: 'deviation from 325', value: fmt(dev[i - 1], 3), key: 'ink' }, { label: 'cumulative sum', value: fmt(CUM[i], 2) }] }),
      },
    });
    readouts($('#slope-readouts'), [
      { label: 'Stretch', value: f === l ? `Group ${f}` : `Groups ${f}–${l}`, sub: `${l - f + 1} group${l === f ? '' : 's'}` },
      { label: 'Rise of the sum', value: fmt(rise + 1e-9, 2) },
      { label: 'Slope', value: fmt(slope, 3), sub: 'average deviation from 325' },
      { label: 'Estimated mean', value: fmt(MU0 + slope, 2), sub: 'target 325' },
    ]);
  }

  const fIn = bindRange('slope-from', (v) => { f = v; if (l < f) { l = f; lIn.value = l; } draw(); }, { call: false });
  const lIn = bindRange('slope-to', (v) => { l = v; if (f > l) { f = l; fIn.value = f; } draw(); }, { call: false });
  f = Math.min(fIn.value, lIn.value); l = Math.max(fIn.value, lIn.value);
  draw();
}

/* ---------- Fig 6.3: the V-mask ---------- */
{
  const chart = new Chart($('#vmask-chart'), { height: 320, margin: { top: 16, right: 18, bottom: 42, left: 54 } });
  const { k, h } = HB;
  const d = h / k; // lead distance, in groups
  let m = G;
  let slider = null;

  function outside(at) {
    const res = [];
    for (let i = 0; i < at; i++) {
      const upper = CUM[at] + h + k * (at - i), lower = CUM[at] - h - k * (at - i);
      if (CUM[i] > upper) res.push({ i, side: 'above' });
      else if (CUM[i] < lower) res.push({ i, side: 'below' });
    }
    return res;
  }

  function place(at) {
    m = Math.max(1, Math.min(G, at));
    if (slider) slider.value = m;
    draw();
  }

  function draw() {
    const out = outside(m);
    const outSet = new Set(out.map((o) => o.i));
    const pts = CUM.map((v, i) => [i, v]);
    const S = CUM[m];
    chart.update({
      x: { domain: [-0.5, 34.5], label: 'Group', ticks: [0, 5, 10, 15, 20] },
      y: { domain: [-8, 24], label: 'Cumulative sum' },
      aria: `V-mask with its origin on group ${m} of the handbook cumulative sum; ${out.length} earlier points lie outside the arms`,
      layers: [
        { type: 'hline', y: 0, cls: 'center' },
        {
          type: 'path', cls: 'vmask',
          d: (sx, sy) => {
            const xv = m + d, x0 = -1;
            return `M${sx(x0)},${sy(S + k * (xv - x0))}L${sx(xv)},${sy(S)}L${sx(x0)},${sy(S - k * (xv - x0))}`;
          },
        },
        {
          type: 'custom',
          draw(g, sx, sy) {
            el('line', { class: 'k-marker', x1: sx(m), x2: sx(m + d), y1: sy(S), y2: sy(S) }, g);
            const t1 = el('text', { class: 'k-label', x: sx(m + d / 2), y: sy(S) - 7, 'text-anchor': 'middle' }, g);
            t1.textContent = `d = ${fmt(d, 1)}`;
            el('line', { class: 'k-marker', x1: sx(m), x2: sx(m), y1: sy(S), y2: sy(S - h) }, g);
            const t2 = el('text', { class: 'k-label', x: sx(m) + 7, y: sy(S - h / 2), 'dominant-baseline': 'middle' }, g);
            t2.textContent = `h = ${fmt(h, 2)}`;
          },
        },
        { type: 'line', points: pts.slice(0, m + 1), cls: 'data' },
        { type: 'line', points: pts.slice(m), cls: 'faint' },
        {
          type: 'dots', points: pts,
          cls: (p, i) => (outSet.has(i) ? 'signal' : i > m ? 'dot-muted' : i === 0 ? 'dot-hollow' : 'dot'),
          r: (p, i) => (outSet.has(i) ? 4.5 : 3),
        },
        { type: 'dots', points: [[m, S]], cls: 'dot-ink', r: 5.5 },
      ],
      hover: {
        xs: pts.map((p) => p[0]), mark: (i) => pts[i],
        onClick: (i) => { if (i >= 1) place(i); },
        render: (i) => ({
          title: i === 0 ? 'Start' : `Group ${i}`,
          rows: [{ label: 'cumulative sum', value: fmt(CUM[i], 2) }],
          note: outSet.has(i) ? `Outside the ${out.find((o) => o.i === i).side === 'below' ? 'lower' : 'upper'} arm` : i >= 1 && i !== m ? 'Click to move the mask here' : undefined,
        }),
      },
    });

    const vSignal = out.length > 0;
    const tSignal = EX.hi[m - 1] > h || EX.lo[m - 1] > h;
    const list = out.map((o) => (o.i === 0 ? 'start' : String(o.i)));
    readouts($('#vmask-readouts'), [
      { label: 'Mask origin', value: `Group ${m}`, sub: `vertex ${fmt(d, 1)} groups ahead` },
      {
        label: 'Earlier points outside the arms', value: String(out.length),
        sub: out.length ? (list.length > 4 ? `${list.slice(0, 2).join(', ')} … ${list.at(-1)}` : list.join(', ')) : 'All inside', state: out.length ? 'signal' : 'good',
      },
      { label: 'Tabular sums at this group', value: `${fmt(EX.hi[m - 1], 2)} / ${fmt(EX.lo[m - 1], 2)}`, sub: `upper / lower, against h = ${fmt(h, 4)}` },
      { label: 'Verdict', value: vSignal ? 'Out of control' : 'In control', sub: vSignal === tSignal ? 'Mask and table agree' : 'Mask and table disagree', state: vSignal ? 'signal' : 'good' },
    ]);
  }

  legend($('#vmask-legend'), [
    { label: 'Cumulative sum of deviations from 325', swatch: 'line', color: 'data' },
    { label: 'V-mask', swatch: 'box', color: 'signal' },
    { label: 'Mask origin', swatch: 'dot', color: 'ink' },
    { label: 'Outside an arm', swatch: 'dot', color: 'signal' },
  ]);
  slider = bindRange('vmask-at', (v) => place(v), { format: (v) => `group ${v}`, call: false });
  m = slider.value;
  draw();
}

/* ---------- Fig 6.4: the tabular CUSUM of the handbook example ---------- */
{
  const chart = new Chart($('#tab-chart'), { height: 290 });
  let k = HB.k, h = HB.h;
  const kOut = $('output[for="tab-k"]'), hOut = $('output[for="tab-h"]');

  function draw() {
    const r = cusum(XBAR, MU0, k, h);
    const f = r.firstSignal;
    const hiPts = r.hi.map((v, i) => [i + 1, v]);
    const loPts = r.lo.map((v, i) => [i + 1, -v]);
    const top = Math.max(h, ...r.hi) * 1.08, bottom = Math.max(h, ...r.lo) * 1.15;
    kOut.textContent = `${fmt(k / SE, 2)}σ = ${fmt(k, 4)}`;
    hOut.textContent = `${fmt(h / SE, 2)}σ = ${fmt(h, 4)}`;
    chart.update({
      x: { domain: [0.5, G + 0.5], label: 'Group', ticks: [1, 5, 10, 15, 20] },
      y: { domain: [-bottom, top], label: 'CUSUM' },
      aria: 'Tabular CUSUM of the handbook example: upper sum above zero, lower sum drawn below zero, and the decision interval h',
      layers: [
        { type: 'hline', y: 0, cls: 'center' },
        { type: 'hline', y: h, cls: 'limit', label: `h ${fmt(h, 2)}` },
        { type: 'hline', y: -h, cls: 'limit', label: '−h' },
        { type: 'area', points: hiPts, base: 0, cls: 'area' },
        { type: 'area', points: loPts, base: 0, cls: 'area-alt' },
        { type: 'line', points: hiPts, cls: 'data' },
        { type: 'line', points: loPts, cls: 'alt' },
        { type: 'dots', points: loPts, cls: (p, i) => (r.lo[i] > h ? 'signal' : 'dot-alt'), r: (p, i) => (r.lo[i] > h ? 4.5 : 3) },
        { type: 'dots', points: hiPts, cls: (p, i) => (r.hi[i] > h ? 'signal' : 'dot'), r: (p, i) => (r.hi[i] > h ? 4.5 : 3) },
        ...(f >= 0 ? [{ type: 'annot', x: f + 1, y: r.hi[f] > h ? r.hi[f] : -r.lo[f], text: `First signal, group ${f + 1}`, dx: -16, dy: -24, anchor: 'end' }] : []),
      ],
      hover: {
        xs: hiPts.map((p) => p[0]),
        mark: (i) => (r.lo[i] > r.hi[i] ? loPts[i] : hiPts[i]),
        render: (i) => ({
          title: `Group ${i + 1}`,
          rows: [
            { label: 'group mean', value: fmt(XBAR[i], 3), key: 'none' },
            { label: 'upper sum', value: fmt(r.hi[i], 2) },
            { label: 'lower sum', value: fmt(r.lo[i], 2), key: 'alt' },
          ],
          note: r.hi[i] > h ? 'Upper sum above h' : r.lo[i] > h ? 'Lower sum above h' : undefined,
        }),
      },
    });

    readouts($('#tab-readouts'), [
      f >= 0
        ? { label: 'First signal', value: `Group ${f + 1}`, sub: r.hi[f] > h ? `upper sum ${fmt(r.hi[f], 2)} > h` : `lower sum ${fmt(r.lo[f], 2)} > h`, state: 'signal' }
        : { label: 'First signal', value: 'None', sub: 'in 20 groups', state: 'good' },
      { label: 'Groups out of control', value: String(r.signals.filter(Boolean).length), sub: 'of 20' },
      { label: 'In-control ARL', value: fmtArl(cusumArl(0, k / SE, h / SE)), sub: 'one sum, samples per false alarm' },
      { label: 'ARL for a 1σ shift', value: fmtArl(cusumArl(1, k / SE, h / SE)), sub: 'one sum, samples to detect' },
    ]);

    const rows = XBAR.map((x, i) => ({ g: i + 1, x, i, _cls: r.signals[i] ? 'is-signal' : '' }));
    const f2 = (v) => fmt(v, 2);
    dataTable($('#tab-table'), [
      { label: 'Group', key: 'g' },
      { label: 'Group mean', key: 'x', fmt: (v) => fmt(v, 3) },
      { label: 'Mean − 325', get: (o) => o.x - MU0, fmt: f2 },
      { label: 'Mean − 325 − k', get: (o) => o.x - MU0 - k, fmt: f2 },
      { label: 'Upper sum', get: (o) => r.hi[o.i], fmt: (v, o) => `${f2(v)}${r.hi[o.i] > h ? ' *' : ''}` },
      { label: '325 − k − mean', get: (o) => MU0 - k - o.x, fmt: f2 },
      { label: 'Lower sum', get: (o) => r.lo[o.i], fmt: (v, o) => `${f2(v)}${r.lo[o.i] > h ? ' *' : ''}` },
      { label: 'Cumulative sum', get: (o) => r.cum[o.i], fmt: f2 },
    ], rows);
  }

  legend($('#tab-legend'), [
    { label: 'Upper sum', swatch: 'line', color: 'data' },
    { label: 'Lower sum, drawn below zero', swatch: 'line', color: 'alt' },
    { label: '±h', swatch: 'dash', color: 'ink' },
    { label: 'Signal', swatch: 'dot', color: 'signal' },
  ]);
  const kIn = bindRange('tab-k', (v) => { k = v * SE; draw(); }, { call: false });
  const hIn = bindRange('tab-h', (v) => { h = v * SE; draw(); }, { call: false });
  $('#tab-reset').addEventListener('click', () => {
    k = HB.k; h = HB.h;
    kIn.value = k / SE; hIn.value = h / SE;
    draw();
  });
  // the sliders open near the handbook's values; use the exact ones unless the browser restored others
  if (kIn.value !== 0.5 || Math.abs(hIn.value - 6.6) > 1e-9) { k = kIn.value * SE; h = hIn.value * SE; }
  draw();
}

/* ---------- Fig 6.5: average run length, CUSUM against Shewhart ---------- */
{
  const chart = new Chart($('#arl-chart'), { height: 300 });
  const deltas = Array.from({ length: 41 }, (_, i) => +(i * 0.1).toFixed(1));
  const shew = deltas.map((d) => shewhartArl(d, 3));
  const lg = (v) => Math.log10(Math.min(Math.max(v, 1), 1e5));
  let k = 0.5, h = 4, two = false;

  function draw() {
    const cu = deltas.map((d) => (two ? cusumArl2(d, k, h, 80) : cusumArl(d, k, h, 80)));
    // break-even: beyond the last shift where the CUSUM is at least as fast, Shewhart wins
    let last = -1;
    for (let i = 1; i < deltas.length; i++) if (cu[i] <= shew[i]) last = i;
    let cross = null;
    if (last >= 1 && last < deltas.length - 1) {
      const d0 = lg(cu[last]) - lg(shew[last]), d1 = lg(cu[last + 1]) - lg(shew[last + 1]);
      cross = deltas[last] + 0.1 * (-d0 / (d1 - d0));
    }
    const cuPts = deltas.map((d, i) => [d, lg(cu[i])]);
    const shPts = deltas.map((d, i) => [d, lg(shew[i])]);
    chart.update({
      x: { domain: [0, 4], label: 'Shift in the mean, in standard errors', ticks: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4], format: (v) => fmt(v, v % 1 ? 1 : 0) },
      y: { domain: [0, 4.25], label: 'ARL, log scale', ticks: [0, 1, 2, 3, 4], format: (v) => fmtInt(10 ** v) },
      aria: 'Average run length against shift size for the CUSUM and a 3-sigma Shewhart chart, on a logarithmic scale',
      layers: [
        ...(cross !== null ? [{ type: 'vline', x: cross, cls: 'marker', label: `Break-even ${fmt(cross, 1)}σ` }] : []),
        { type: 'line', points: shPts, cls: 'ink' },
        { type: 'line', points: cuPts, cls: 'data' },
        { type: 'dots', points: [0, 10, 20, 30].map((i) => cuPts[i]), cls: 'dot', r: 3.5 },
        { type: 'dots', points: [0, 10, 20, 30].map((i) => shPts[i]), cls: 'dot-ink', r: 3.5 },
      ],
      hover: {
        xs: deltas, mark: (i) => cuPts[i],
        render: (i) => ({
          title: `Shift of ${fmt(deltas[i], 1)}σ`,
          rows: [{ label: two ? 'CUSUM, two-sided' : 'CUSUM, one sum', value: fmtArl(cu[i]) }, { label: 'Shewhart, 3σ', value: fmtArl(shew[i]), key: 'ink' }],
        }),
      },
    });
    const at = (d) => deltas.indexOf(d);
    readouts($('#arl-readouts'), [
      {
        label: 'In control: CUSUM vs Shewhart', value: `${fmtArl(cu[0])} vs ${fmtArl(shew[0])}`,
        sub: cu[0] < shew[0] / 1.5 ? `CUSUM false alarms ${fmt(shew[0] / cu[0], 1)}× as often` : 'higher means fewer false alarms',
        state: cu[0] < shew[0] / 1.5 ? 'signal' : undefined,
      },
      { label: '0.5σ shift', value: `${fmtArl(cu[at(0.5)])} vs ${fmtArl(shew[at(0.5)])}`, sub: 'lower means faster detection' },
      { label: '1σ shift', value: `${fmtArl(cu[at(1)])} vs ${fmtArl(shew[at(1)])}` },
      { label: 'Break-even shift', value: cross !== null ? `${fmt(cross, 2)}σ` : last === deltas.length - 1 ? 'Above 4σ' : 'None', sub: cross !== null ? 'Shewhart is faster above this' : last === deltas.length - 1 ? 'the CUSUM is faster everywhere shown' : 'Shewhart is faster at every shift' },
    ]);
  }

  legend($('#arl-legend'), [
    { label: 'CUSUM', swatch: 'line', color: 'data' },
    { label: 'Shewhart chart, 3σ limits', swatch: 'line', color: 'ink' },
  ]);
  k = bindRange('arl-k', (v) => { k = v; draw(); }, { format: (v) => `${fmt(v, 2)}σ`, call: false }).value;
  h = bindRange('arl-h', (v) => { h = v; draw(); }, { format: (v) => `${fmt(v, 1)}σ`, call: false }).value;
  $('#arl-two').addEventListener('change', (e) => { two = e.target.checked; draw(); });
  two = $('#arl-two').checked;
  draw();
}
