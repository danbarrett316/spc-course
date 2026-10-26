// Module 8: process capability.

import { Chart, el } from '../chart.js';
import { rng, mean, sd, quantile, histogram, normPdf, normCdf, normInv, fmt, fmtRate } from '../stats.js';
import { bindRange, segmented, readouts, legend, setTex, $ } from '../ui.js';

/* ---------- shared helpers ---------- */

/** Upper tail P(X > x) for X ~ N(mu, s), accurate far into the tail. */
const upper = (x, mu, s) => normCdf(-(x - mu) / s);

/** Every capability index for a normal process with mean mu and standard deviation s. */
function indices(mu, s, lsl, usl, target) {
  const cp = (usl - lsl) / (6 * s);
  const cpu = (usl - mu) / (3 * s);
  const cpl = (mu - lsl) / (3 * s);
  const k = Math.abs((usl + lsl) / 2 - mu) / ((usl - lsl) / 2);
  const cpm = (usl - lsl) / (6 * Math.sqrt(s * s + (mu - target) ** 2));
  return { cp, cpu, cpl, cpk: Math.min(cpu, cpl), k, cpm, below: normCdf(lsl, mu, s), above: upper(usl, mu, s) };
}

/** A defect rate as %, ppm or ppb, with a floor for values too small to matter. */
const rate = (p) => (p * 1e9 < 1 ? 'under 1 ppb' : fmtRate(p));

/** Points along a function from a to b. */
function curve(f, a, b, steps = 120) {
  const pts = [];
  for (let i = 0; i <= steps; i++) { const x = a + ((b - a) * i) / steps; pts.push([x, f(x)]); }
  return pts;
}

/** A dimension bracket: a horizontal line with end ticks and a centered label. */
function bracket(g, sx, x0, x1, y, lineCls, labelCls, text) {
  const a = sx(Math.min(x0, x1)), b = sx(Math.max(x0, x1));
  el('line', { class: lineCls, x1: a, x2: b, y1: y, y2: y }, g);
  el('line', { class: lineCls, x1: a, x2: a, y1: y - 4, y2: y + 4 }, g);
  el('line', { class: lineCls, x1: b, x2: b, y1: y - 4, y2: y + 4 }, g);
  const t = el('text', { class: labelCls, x: (a + b) / 2, y: y - 6, 'text-anchor': 'middle' }, g);
  t.textContent = text;
}

/**
 * chart.js refocuses the first handle in a chart after a keyboard move. When a chart has
 * two handles, put focus back on the one the reader was moving.
 */
function keepHandleFocus(host) {
  const a = document.activeElement;
  if (!a || !host.contains(a) || !a.classList?.contains('k-handle')) return;
  const label = a.getAttribute('aria-label');
  requestAnimationFrame(() => requestAnimationFrame(() => {
    [...host.querySelectorAll('.k-handle')].find((h) => h.getAttribute('aria-label') === label)?.focus();
  }));
}

/** Normal probability plot: Filliben order-statistic medians, least-squares line, correlation. */
function probPlot(values) {
  const s = [...values].sort((a, b) => a - b);
  const n = s.length;
  const z = s.map((_, i) => normInv(i === 0 ? 1 - 0.5 ** (1 / n) : i === n - 1 ? 0.5 ** (1 / n) : (i + 1 - 0.3175) / (n + 0.365)));
  const mz = mean(z), my = mean(s);
  let sxy = 0, szz = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (z[i] - mz) * (s[i] - my); szz += (z[i] - mz) ** 2; syy += (s[i] - my) ** 2; }
  const slope = sxy / szz;
  return { pts: z.map((q, i) => [q, s[i]]), slope, intercept: my - slope * mz, r: sxy / Math.sqrt(szz * syy) };
}

function skewness(xs) {
  const m = mean(xs);
  const m2 = mean(xs.map((x) => (x - m) ** 2)), m3 = mean(xs.map((x) => (x - m) ** 3));
  return m3 / m2 ** 1.5;
}

/** Histogram bars over [lo, hi] in bins of width w, as a chart layer plus the bins. */
function histBars(values, lo, hi, w) {
  const bins = histogram(values, lo, hi, Math.round((hi - lo) / w));
  return { bins, layer: { type: 'bars', bars: bins.map((b) => ({ x0: b.x0, x1: b.x1, y: b.count })), cls: 'bar' } };
}

/**
 * A right-skewed process with fixed mean M and standard deviation S: a shifted lognormal
 * X = a + b·exp(σl·Z). Skewness g sets σl through g = (w + 2)√(w − 1), w = exp(σl²).
 */
function skewedProcess(g, M = 10, S = 1) {
  if (g < 0.005) {
    return {
      normal: true, draw: (R) => R.normal(M, S), pdf: (x) => normPdf(x, M, S),
      below: (x) => normCdf(x, M, S), above: (x) => upper(x, M, S), q: (p) => M + S * normInv(p),
    };
  }
  const skewOf = (s) => { const w = Math.exp(s * s); return (w + 2) * Math.sqrt(w - 1); };
  let lo = 0, hi = 1.5;
  for (let i = 0; i < 80; i++) { const mid = (lo + hi) / 2; if (skewOf(mid) < g) lo = mid; else hi = mid; }
  const sl = (lo + hi) / 2, w = Math.exp(sl * sl);
  const b = S / Math.sqrt((w - 1) * w), a = M - b * Math.exp((sl * sl) / 2);
  const zOf = (x) => Math.log((x - a) / b) / sl;
  return {
    normal: false, a, b, sl,
    draw: (R) => a + b * Math.exp(sl * R.normal()),
    pdf: (x) => (x <= a ? 0 : normPdf(zOf(x)) / (sl * (x - a))),
    below: (x) => (x <= a ? 0 : normCdf(zOf(x))),
    above: (x) => (x <= a ? 1 : normCdf(-zOf(x))),
    q: (p) => a + b * Math.exp(sl * normInv(p)),
  };
}

/* ---------- Box-Cox ---------- */

const boxcox = (x, lam) => (Math.abs(lam) < 1e-9 ? Math.log(x) : (x ** lam - 1) / lam);

/** Box-Cox log-likelihood (handbook 6.5.2) for positive data. */
function boxcoxLlf(xs, lam, sumLog) {
  const n = xs.length;
  const t = xs.map((x) => boxcox(x, lam));
  const m = mean(t);
  let v = 0;
  for (const u of t) v += (u - m) ** 2;
  return (-n / 2) * Math.log(v / n) + (lam - 1) * sumLog;
}

/** The λ in [−5, 5] that maximizes the likelihood: a coarse grid, then a fine one. */
function boxcoxLambda(xs) {
  const sumLog = xs.reduce((s, x) => s + Math.log(x), 0);
  let best = 1, bestV = -Infinity;
  for (let lam = -5; lam <= 5.0001; lam += 0.1) { const v = boxcoxLlf(xs, lam, sumLog); if (v > bestV) { bestV = v; best = lam; } }
  const c = best;
  for (let lam = c - 0.1; lam <= c + 0.1; lam += 0.005) { const v = boxcoxLlf(xs, lam, sumLog); if (v > bestV) { bestV = v; best = lam; } }
  return Math.max(-5, Math.min(5, best));
}

/* ---------- Fig 8.1: capability explorer ---------- */
{
  const host = $('#cap-chart');
  const chart = new Chart(host, { height: 310, margin: { top: 30, right: 24, bottom: 42, left: 24 } });
  const T = 500, X0 = 488, X1 = 512;
  let lsl = 496, usl = 504, mu = 500, s = 1;
  const round1 = (v) => Math.round(v * 10) / 10;

  const meanIn = bindRange('cap-mean', (v) => { mu = v; draw(); }, { format: (v) => `${fmt(v, 1)} mL`, call: false });
  const sigIn = bindRange('cap-sigma', (v) => { s = v; draw(); }, { format: (v) => `${fmt(v, 2)} mL`, call: false });

  function draw() {
    const I = indices(mu, s, lsl, usl, T);
    const peak = normPdf(mu, mu, s);
    const f = (x) => normPdf(x, mu, s);
    chart.update({
      x: { domain: [X0, X1], label: 'Fill volume, mL', ticks: 8 },
      y: { domain: [0, peak * 1.48], axis: false, grid: false },
      aria: `Normal curve of fill volumes with mean ${fmt(mu, 1)} and sigma ${fmt(s, 2)}, specification limits ${fmt(lsl, 1)} and ${fmt(usl, 1)}. Cp ${fmt(I.cp, 2)}, Cpk ${fmt(I.cpk, 2)}.`,
      layers: [
        { type: 'area', points: curve(f, Math.max(X0, lsl), Math.min(X1, usl)), base: 0, cls: 'area' },
        { type: 'area', points: curve(f, X0, lsl, 60), base: 0, cls: 'area-signal' },
        { type: 'area', points: curve(f, usl, X1, 60), base: 0, cls: 'area-signal' },
        { type: 'line', points: curve(f, X0, X1, 240), cls: 'data' },
        { type: 'vline', x: T, cls: 'target', bottom: 0, top: peak * 1.05, label: 'Target', labelY: peak * 0.08 },
        { type: 'vline', x: mu, cls: 'marker', bottom: 0, top: peak },
        {
          type: 'custom', clip: false, draw(g, sx, sy) {
            bracket(g, sx, lsl, usl, sy(peak * 1.33), 'k-bracket-spec', 'k-hlabel k-spec-label', `USL − LSL = ${fmt(usl - lsl, 1)}`);
            bracket(g, sx, mu - 3 * s, mu + 3 * s, sy(peak * 1.14), 'k-bracket-data', 'k-hlabel k-data-label', `6σ = ${fmt(6 * s, 1)}`);
          },
        },
        {
          type: 'handle', x: lsl, axis: 'x', label: `LSL ${fmt(lsl, 1)}`, aria: 'Lower specification limit', step: 0.1,
          onDrag: (x) => { keepHandleFocus(host); lsl = Math.max(X0 + 1, Math.min(usl - 1, round1(x))); draw(); },
        },
        {
          type: 'handle', x: usl, axis: 'x', label: `USL ${fmt(usl, 1)}`, aria: 'Upper specification limit', step: 0.1,
          onDrag: (x) => { keepHandleFocus(host); usl = Math.min(X1 - 1, Math.max(lsl + 1, round1(x))); draw(); },
        },
      ],
    });
    const st = (v) => (v < 1 ? 'signal' : v >= 1.33 ? 'good' : undefined);
    readouts($('#cap-readouts'), [
      { label: 'Cp', value: fmt(I.cp, 2), sub: 'Spec width ÷ 6σ', state: st(I.cp) },
      { label: 'Cpk', value: fmt(I.cpk, 2), sub: `Smaller of ${fmt(I.cpu, 2)} and ${fmt(I.cpl, 2)}`, state: st(I.cpk) },
      { label: 'Cpm', value: fmt(I.cpm, 2), sub: 'Charges for distance from 500', state: st(I.cpm) },
      { label: 'Below LSL', value: rate(I.below), state: I.below > 0.001 ? 'signal' : undefined },
      { label: 'Above USL', value: rate(I.above), state: I.above > 0.001 ? 'signal' : undefined },
    ]);
  }

  legend($('#cap-legend'), [
    { label: 'Fill volumes (normal model)', swatch: 'line', color: 'data' },
    { label: 'Outside the specification', swatch: 'box', color: 'signal' },
    { label: 'Specification limits (drag them)', swatch: 'line', color: 'spec' },
    { label: 'Target 500 mL', swatch: 'dash', color: 'spec' },
  ]);
  $('#cap-reset').addEventListener('click', () => {
    lsl = 496; usl = 504; mu = 500; s = 1;
    meanIn.value = 500; sigIn.value = 1;
    draw();
  });
  draw();
}

/* ---------- Fig 8.2: same Cp, different Cpk ---------- */
{
  const LSL = 8, USL = 20, T = 14;
  const dist = new Chart($('#ctr-dist'), { height: 270, margin: { top: 20, right: 16, bottom: 42, left: 16 } });
  const idx = new Chart($('#ctr-index'), { height: 270, margin: { top: 20, right: 52, bottom: 42, left: 40 } });
  let mu = 16, s = 2;

  const meanIn = bindRange('ctr-mean', (v) => { mu = v; draw(); }, { format: (v) => fmt(v, 1), call: false });
  const sig = segmented('ctr-sigma', (v) => { s = Number(v); draw(); });
  $('#ctr-handbook').addEventListener('click', () => { mu = 16; s = 2; meanIn.value = 16; sig.set('2', false); draw(); });

  function draw() {
    const I = indices(mu, s, LSL, USL, T);
    const f = (x) => normPdf(x, mu, s);
    const yTop = 0.52;
    const peak = f(mu);
    dist.update({
      x: { domain: [2, 26], label: 'Measurement', ticks: [2, 8, 14, 20, 26] },
      y: { domain: [0, yTop], axis: false, grid: false },
      aria: `Process with mean ${fmt(mu, 1)} and sigma ${fmt(s, 1)} inside specification 8 to 20`,
      layers: [
        { type: 'area', points: curve(f, LSL, USL), base: 0, cls: 'area' },
        { type: 'area', points: curve(f, 2, LSL, 60), base: 0, cls: 'area-signal' },
        { type: 'area', points: curve(f, USL, 26, 60), base: 0, cls: 'area-signal' },
        { type: 'line', points: curve(f, 2, 26, 240), cls: 'data' },
        { type: 'vline', x: LSL, cls: 'spec', label: 'LSL', labelY: 0.02, anchor: 'end' },
        { type: 'vline', x: USL, cls: 'spec', label: 'USL', labelY: 0.02, anchor: 'start' },
        { type: 'vline', x: T, cls: 'target', label: 'm = T', labelY: 0.02, anchor: 'start' },
        { type: 'vline', x: mu, cls: 'marker', bottom: 0, top: peak },
        {
          type: 'custom', clip: false, draw(g, sx, sy) {
            const half = mu >= T ? [T, USL] : [LSL, T];
            bracket(g, sx, half[0], half[1], sy(0.49), 'k-bracket-spec', 'k-hlabel k-spec-label', '(USL − LSL)/2 = 6');
            if (Math.abs(mu - T) >= 0.05) bracket(g, sx, T, mu, sy(Math.min(peak + 0.035, 0.435)), 'k-bracket-data', 'k-hlabel k-data-label', `|m − μ| = ${fmt(Math.abs(mu - T), 1)}`);
          },
        },
      ],
    });

    const grid = [];
    for (let i = 0; i <= 120; i++) grid.push(LSL + i * 0.1);
    const at = grid.map((x) => indices(x, s, LSL, USL, T));
    const cpTop = (USL - LSL) / (6 * s);
    idx.update({
      x: { domain: [LSL, USL], label: 'Process mean', ticks: [8, 11, 14, 17, 20] },
      y: { domain: [0, cpTop * 1.18], label: 'Index' },
      aria: 'Cp, Cpk and Cpm as the process mean moves across the specification',
      layers: [
        { type: 'hline', y: 1, cls: 'limit-soft', label: '1.00' },
        { type: 'vline', x: mu, cls: 'marker' },
        { type: 'line', points: grid.map((x, i) => [x, at[i].cp]), cls: 'ink' },
        { type: 'line', points: grid.map((x, i) => [x, at[i].cpm]), cls: 'alt' },
        { type: 'line', points: grid.map((x, i) => [x, at[i].cpk]), cls: 'data' },
        { type: 'dots', points: [[mu, I.cp]], cls: 'dot-ink', r: 4 },
        { type: 'dots', points: [[mu, I.cpm]], cls: 'dot-alt', r: 4 },
        { type: 'dots', points: [[mu, I.cpk]], cls: 'dot', r: 4.5 },
      ],
      hover: {
        xs: grid, mark: (i) => [grid[i], at[i].cpk],
        render: (i) => ({
          title: `Mean ${fmt(grid[i], 1)}`,
          rows: [
            { label: 'Cp', value: fmt(at[i].cp, 3), key: 'ink' },
            { label: 'Cpk', value: fmt(at[i].cpk, 3) },
            { label: 'Cpm', value: fmt(at[i].cpm, 3), key: 'alt' },
          ],
        }),
      },
    });

    setTex($('#ctr-eq'), `C_{pk} = C_p(1-k) = ${fmt(I.cp, 2)} \\times (1 - ${fmt(I.k, 3)}) = ${fmt(I.cpk, 3)}`);
    readouts($('#ctr-readouts'), [
      { label: 'Cp', value: fmt(I.cp, 3) },
      { label: 'k', value: fmt(I.k, 3), sub: `${fmt(Math.abs(mu - T), 1)} ÷ 6` },
      { label: 'Cpu', value: fmt(I.cpu, 3) },
      { label: 'Cpl', value: fmt(I.cpl, 3) },
      { label: 'Cpk', value: fmt(I.cpk, 3), state: I.cpk < 1 ? 'signal' : I.cpk >= 1.33 ? 'good' : undefined },
      { label: 'Cpm', value: fmt(I.cpm, 3) },
    ]);
  }

  legend($('#ctr-legend'), [
    { label: 'Process', swatch: 'line', color: 'data' },
    { label: 'Out of spec', swatch: 'box', color: 'signal' },
    { label: 'Cp', swatch: 'line', color: 'ink' },
    { label: 'Cpk', swatch: 'line', color: 'data' },
    { label: 'Cpm', swatch: 'line', color: 'alt' },
  ]);
  draw();
}

/* ---------- Fig 8.3: sampling distribution of the estimated Cpk ---------- */
{
  const chart = new Chart($('#smp-chart'), { height: 270, margin: { top: 22, right: 24, bottom: 42, left: 48 } });
  const MU = 10, SIG = 1, LSL = 6, USL = 14, TRUE = 4 / 3, STUDIES = 400;
  const LO = 0.4, HI = 2.6, W = 0.04;
  let seed = 1, n = 30;

  const halfWidth = (c, m) => normInv(0.975) * Math.sqrt(1 / (9 * m) + (c * c) / (2 * (m - 1)));

  function draw() {
    const R = rng(seed * 1009 + n);
    const est = [];
    let below = 0, cover = 0;
    for (let j = 0; j < STUDIES; j++) {
      const xs = Array.from({ length: n }, () => R.normal(MU, SIG));
      const m = mean(xs), s = sd(xs);
      const c = Math.min(USL - m, m - LSL) / (3 * s);
      est.push(c);
      if (c < 1) below++;
      if (Math.abs(c - TRUE) <= halfWidth(c, n)) cover++;
    }
    const clamped = est.map((v) => Math.min(HI - 1e-9, Math.max(LO, v)));
    const bins = histogram(clamped, LO, HI, Math.round((HI - LO) / W));
    const hw = halfWidth(TRUE, n);
    const top = Math.max(...bins.map((b) => b.count));
    const centers = bins.map((b) => (b.x0 + b.x1) / 2);
    chart.update({
      x: { domain: [LO, HI], label: 'Estimated Cpk', ticks: [0.5, 1, 1.5, 2, 2.5] },
      y: { domain: [0, top * 1.18], label: 'Studies' },
      aria: `Histogram of estimated Cpk from ${STUDIES} studies of ${n} parts each; true Cpk 1.33`,
      layers: [
        { type: 'xband', x0: TRUE - hw, x1: TRUE + hw, cls: 'band' },
        { type: 'bars', bars: bins.map((b) => ({ x0: b.x0, x1: b.x1, y: b.count, cls: (b.x0 + b.x1) / 2 < 1 ? 'bar-signal' : 'bar' })) },
        { type: 'vline', x: 1, cls: 'limit-soft', label: '1.00', anchor: 'end' },
        { type: 'vline', x: TRUE, cls: 'marker', label: 'True Cpk 1.33' },
      ],
      hover: {
        xs: centers, mark: (i) => [centers[i], bins[i].count],
        render: (i) => ({ title: `Estimate ${fmt(bins[i].x0, 2)} to ${fmt(bins[i].x1, 2)}`, rows: [{ label: 'studies', value: String(bins[i].count) }] }),
      },
    });
    readouts($('#smp-readouts'), [
      { label: 'Middle 95% of estimates', value: `${fmt(quantile(est, 0.025), 2)} to ${fmt(quantile(est, 0.975), 2)}`, sub: `From ${STUDIES} simulated studies` },
      { label: 'Formula interval at 1.33', value: `±${fmt(hw, 2)}`, sub: `${fmt(TRUE - hw, 2)} to ${fmt(TRUE + hw, 2)}` },
      { label: 'Studies below 1.00', value: `${fmt((100 * below) / STUDIES, 1)}%`, sub: `${below} of ${STUDIES} call the process incapable`, state: below ? 'signal' : 'good' },
      { label: 'Intervals that cover 1.33', value: `${fmt((100 * cover) / STUDIES, 0)}%`, sub: 'Each study’s own 95% interval' },
    ]);
  }

  legend($('#smp-legend'), [
    { label: 'Estimated Cpk, one per study', swatch: 'box', color: 'data' },
    { label: 'Estimates below 1.00', swatch: 'box', color: 'signal' },
    { label: 'Approximate 95% interval around 1.33', swatch: 'box', color: 'muted' },
  ]);
  bindRange('smp-n', (v) => { n = v; draw(); }, { format: (v) => String(v) });
  $('#smp-new').addEventListener('click', () => { seed += 1; draw(); });
}

/* ---------- Fig 8.4: what normal and non-normal data look like ---------- */
{
  const hist = new Chart($('#nrm-hist'), { height: 260, margin: { top: 20, right: 16, bottom: 42, left: 40 } });
  const pp = new Chart($('#nrm-pp'), { height: 260, margin: { top: 20, right: 16, bottom: 42, left: 44 } });
  const N = 100, CUTOFF = 0.987;
  const skewed = skewedProcess(1.5);
  const SHAPES = {
    normal: {
      name: 'Normal', gen: (R) => R.normal(10, 1),
      desc: 'The points hug the line from end to end. The few at each end wander a little, which is expected in a sample of 100.',
      act: 'Use the normal-theory indices.',
    },
    skew: {
      name: 'Right-skewed', gen: (R) => skewed.draw(R),
      desc: 'The plot curves upward at the right end. The largest values are larger than a normal curve would produce, and the smallest are not as small.',
      act: 'Transform the data or use percentile-based indices before quoting how much product exceeds the USL.',
    },
    heavy: {
      // Student's t with 4 degrees of freedom, scaled to standard deviation 1
      name: 'Heavy tails', gen: (R) => { const z = R.normal(); let c = 0; for (let i = 0; i < 4; i++) c += R.normal() ** 2; return 10 + z / Math.sqrt(c / 4) / Math.SQRT2; },
      desc: 'The plot steepens at both ends into an S-shape. Extreme values on both sides turn up more often than the normal model allows.',
      act: 'Normal theory will understate the fraction outside both limits. Use percentile-based indices, and check whether occasional special causes create the extremes.',
    },
    short: {
      name: 'Short tails', gen: (R) => 10 + (R.uniform() - 0.5) * Math.sqrt(12),
      desc: 'The plot flattens at both ends. The values stop short of where a normal curve would put them, as they do for a uniform spread.',
      act: 'Normal theory overstates the fraction outside the limits, so the indices are conservative. A flat-topped shape can also mean parts are being sorted or the process adjusted.',
    },
    mix: {
      name: 'Two streams', gen: (R) => R.normal(R.uniform() < 0.5 ? 9.1 : 10.9, 0.436),
      desc: 'The plot has a flat step in the middle and the histogram has two humps. Two populations, such as two machines or two mold cavities, are mixed together.',
      act: 'Separate the streams and study each one on its own. An index for the mixture describes neither.',
    },
  };
  let shape = 'normal', seed = 1; // seed 1 gives a typical-looking sample for every shape

  function draw() {
    const S = SHAPES[shape];
    const R = rng(seed * 31 + Object.keys(SHAPES).indexOf(shape));
    const xs = Array.from({ length: N }, () => S.gen(R));
    const m = mean(xs), s = sd(xs);
    const lo = Math.min(6, Math.floor(Math.min(...xs) * 4) / 4), hi = Math.max(14, Math.ceil(Math.max(...xs) * 4) / 4);
    const { bins, layer } = histBars(xs, lo, hi, 0.25);
    const top = Math.max(...bins.map((b) => b.count), N * 0.25 * normPdf(m, m, s));
    const centers = bins.map((b) => (b.x0 + b.x1) / 2);
    hist.update({
      x: { domain: [lo, hi], label: 'Value', ticks: 5 },
      y: { domain: [0, top * 1.12], label: 'Count' },
      aria: `Histogram of 100 values from a ${S.name.toLowerCase()} process with the matching normal curve`,
      layers: [
        layer,
        { type: 'line', points: curve((x) => N * 0.25 * normPdf(x, m, s), lo, hi, 160), cls: 'curve' },
      ],
      hover: {
        xs: centers, mark: (i) => [centers[i], bins[i].count],
        render: (i) => ({ title: `${fmt(bins[i].x0, 2)} to ${fmt(bins[i].x1, 2)}`, rows: [{ label: 'values', value: String(bins[i].count) }] }),
      },
    });

    const P = probPlot(xs);
    const ys = P.pts.map((p) => p[1]);
    const zr = [-3, 3];
    pp.update({
      x: { domain: [-3, 3], label: 'Normal quantile (z)', ticks: [-3, -2, -1, 0, 1, 2, 3] },
      y: { domain: [Math.min(...ys) - 0.3, Math.max(...ys) + 0.3], label: 'Value' },
      aria: `Normal probability plot for the ${S.name.toLowerCase()} sample; correlation ${fmt(P.r, 3)}`,
      layers: [
        { type: 'line', points: zr.map((z) => [z, P.intercept + P.slope * z]), cls: 'ink' },
        { type: 'dots', points: P.pts, cls: 'dot', r: 2.8 },
      ],
      hover: {
        points: P.pts,
        render: (i) => ({ title: `Rank ${i + 1} of ${N}`, rows: [{ label: 'value', value: fmt(P.pts[i][1], 2) }, { label: 'expected z', value: fmt(P.pts[i][0], 2), key: 'ink' }] }),
      },
    });

    readouts($('#nrm-readouts'), [
      { label: 'Plot correlation r', value: fmt(P.r, 3), sub: `5% cutoff for n = 100: ${CUTOFF}`, state: P.r >= CUTOFF ? 'good' : 'signal' },
      { label: 'Sample skewness', value: fmt(skewness(xs), 2), sub: 'Zero for a symmetric shape' },
      { label: 'Mean and s', value: `${fmt(m, 2)}, ${fmt(s, 2)}`, sub: 'Every shape has 10 and 1' },
    ]);
    const panel = $('#nrm-panel');
    panel.querySelector('h4').textContent = S.name;
    panel.querySelector('.desc').textContent = S.desc;
    panel.querySelector('.do').textContent = S.act;
  }

  legend($('#nrm-legend'), [
    { label: 'Sample of 100', swatch: 'box', color: 'data' },
    { label: 'Normal curve with the same mean and s', swatch: 'line', color: 'ink' },
    { label: 'Reference line on the probability plot', swatch: 'line', color: 'ink' },
  ]);
  segmented('nrm-shape', (v) => { shape = v; draw(); });
  $('#nrm-new').addEventListener('click', () => { seed += 1; draw(); });
  draw();
}

/* ---------- Fig 8.5: capability for skewed data ---------- */
{
  const hist = new Chart($('#skw-hist'), { height: 270, margin: { top: 20, right: 16, bottom: 42, left: 40 } });
  const pp = new Chart($('#skw-pp'), { height: 270, margin: { top: 20, right: 78, bottom: 42, left: 48 } });
  const LSL = 6, USL = 14, N = 1000, W = 0.25;
  let g = 0.8, view = 'raw', seed = 2;

  function draw() {
    const proc = skewedProcess(g);
    const R = rng(seed * 101 + Math.round(g * 100));
    const xs = Array.from({ length: N }, () => proc.draw(R));

    // normal theory
    const m = mean(xs), s = sd(xs);
    const cpk = Math.min(USL - m, m - LSL) / (3 * s);
    const predN = normCdf(LSL, m, s) + upper(USL, m, s);
    // percentiles
    const med = quantile(xs, 0.5), pLo = quantile(xs, 0.00135), pHi = quantile(xs, 0.99865);
    const cnpk = Math.min(USL - med, med - LSL) / ((pHi - pLo) / 2);
    const pm = proc.q(0.5);
    const cnpkTrue = Math.min(USL - pm, pm - LSL) / ((proc.q(0.99865) - proc.q(0.00135)) / 2);
    // Box-Cox: transform the data and the limits with the same λ
    const lam = boxcoxLambda(xs);
    const t = xs.map((x) => boxcox(x, lam));
    const tm = mean(t), ts = sd(t), tl = boxcox(LSL, lam), tu = boxcox(USL, lam);
    const cpkBC = Math.min(tu - tm, tm - tl) / (3 * ts);
    const predBC = normCdf(tl, tm, ts) + upper(tu, tm, ts);
    // the truth, known because we simulated the process
    const actual = proc.below(LSL) + proc.above(USL);

    const lo = 5, hi = Math.max(16.5, Math.ceil(Math.max(...xs) * 4) / 4 + 0.25);
    const { bins, layer } = histBars(xs, lo, hi, W);
    const truePts = curve((x) => N * W * proc.pdf(x), lo, hi, 300);
    const top = Math.max(...bins.map((b) => b.count), ...truePts.map((p) => p[1]));
    const centers = bins.map((b) => (b.x0 + b.x1) / 2);
    hist.update({
      x: { domain: [lo, hi], label: 'Coating thickness, µm', ticks: 6 },
      y: { domain: [0, top * 1.12], label: 'Count' },
      aria: `Histogram of 1000 coating thicknesses with skewness ${fmt(g, 2)}, the fitted normal curve and the true distribution`,
      layers: [
        layer,
        { type: 'line', points: curve((x) => N * W * normPdf(x, m, s), lo, hi, 200), cls: 'curve' },
        { type: 'line', points: truePts, cls: 'true-curve' },
        { type: 'vline', x: LSL, cls: 'spec', label: 'LSL 6', anchor: 'start' },
        { type: 'vline', x: USL, cls: 'spec', label: 'USL 14', anchor: 'start' },
      ],
      hover: {
        xs: centers, mark: (i) => [centers[i], bins[i].count],
        render: (i) => ({ title: `${fmt(bins[i].x0, 2)} to ${fmt(bins[i].x1, 2)} µm`, rows: [{ label: 'parts', value: String(bins[i].count) }] }),
      },
    });

    // Box-Cox values are shown in standard deviations of the transformed data, so the
    // limits read directly as 3·Cpl and 3·Cpu on the new scale.
    const bc = view === 'bc';
    const vals = bc ? t.map((u) => (u - tm) / ts) : xs;
    const P = probPlot(vals);
    const limLo = bc ? (tl - tm) / ts : LSL, limHi = bc ? (tu - tm) / ts : USL;
    const ys = P.pts.map((p) => p[1]);
    const yLo = Math.min(limLo, ...ys), yHi = Math.max(limHi, ...ys);
    const padY = (yHi - yLo) * 0.06;
    pp.update({
      x: { domain: [-3.5, 3.5], label: 'Normal quantile (z)', ticks: [-3, -2, -1, 0, 1, 2, 3] },
      y: { domain: [yLo - padY, yHi + padY], label: bc ? `σ units after Box-Cox, λ = ${fmt(lam, 2)}` : 'µm', ticks: 5 },
      aria: `Normal probability plot of the ${bc ? 'Box-Cox transformed' : 'raw'} thicknesses; correlation ${fmt(P.r, 3)}`,
      layers: [
        { type: 'hline', y: limLo, cls: 'spec', label: bc ? `LSL ${fmt(limLo, 2)}σ` : 'LSL 6' },
        { type: 'hline', y: limHi, cls: 'spec', label: bc ? `USL +${fmt(limHi, 2)}σ` : 'USL 14' },
        { type: 'line', points: [-3.5, 3.5].map((z) => [z, P.intercept + P.slope * z]), cls: 'ink' },
        { type: 'dots', points: P.pts, cls: (p) => (p[1] > limHi || p[1] < limLo ? 'signal' : 'dot'), r: (p) => (p[1] > limHi || p[1] < limLo ? 3.6 : 2.2) },
      ],
      hover: {
        points: P.pts,
        render: (i) => ({
          title: `Rank ${i + 1} of ${N}`,
          rows: [{ label: bc ? 'σ, transformed' : 'µm', value: fmt(P.pts[i][1], 2) }, { label: 'expected z', value: fmt(P.pts[i][0], 2), key: 'ink' }],
          note: P.pts[i][1] > limHi || P.pts[i][1] < limLo ? 'Outside the specification' : undefined,
        }),
      },
    });

    readouts($('#skw-readouts'), [
      { label: 'Normal-theory Cpk', value: fmt(cpk, 2), sub: `Predicts ${rate(predN)} outside` },
      { label: 'Percentile Cnpk', value: fmt(cnpk, 2), sub: `${fmt(cnpkTrue, 2)} with unlimited data` },
      { label: 'Box-Cox Cpk', value: fmt(cpkBC, 2), sub: `λ = ${fmt(lam, 2)}, predicts ${rate(predBC)}` },
      { label: 'Actually outside', value: rate(actual), sub: 'Known here because the process is simulated', state: actual > 3 * predN ? 'signal' : undefined },
    ]);
  }

  legend($('#skw-legend'), [
    { label: 'Sample of 1,000', swatch: 'box', color: 'data' },
    { label: 'Normal curve from x̄ and s', swatch: 'line', color: 'ink' },
    { label: 'True distribution of the process', swatch: 'dash', color: 'alt' },
    { label: 'Specification limits', swatch: 'line', color: 'spec' },
  ]);
  bindRange('skw-g', (v) => { g = v; draw(); }, { format: (v) => fmt(v, 2), call: false });
  segmented('skw-view', (v) => { view = v; draw(); });
  $('#skw-new').addEventListener('click', () => { seed += 1; draw(); });
  draw();
}
