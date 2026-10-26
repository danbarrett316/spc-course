// Module 10: multivariate control charts.

import { Chart } from '../chart.js';
import { rng, mean, fmt, fmtRate, chi2Inv, chi2Cdf, fInv, normCdf, normPdf } from '../stats.js';
import { bindRange, segmented, readouts, legend, $ } from '../ui.js';

// <pure> Computation only. Everything between the pure markers runs without a DOM.

/* ---------- 2×2 matrix helpers ---------- */

/** Inverse of a 2×2 matrix. */
const inv2 = (A) => {
  const d = A[0][0] * A[1][1] - A[0][1] * A[1][0];
  return [[A[1][1] / d, -A[0][1] / d], [-A[1][0] / d, A[0][0] / d]];
};

/** The quadratic form v'Av for a 2-vector v. */
const quad2 = (v, A) => v[0] * (A[0][0] * v[0] + A[0][1] * v[1]) + v[1] * (A[1][0] * v[0] + A[1][1] * v[1]);

/** Sample mean vector and covariance matrix (divisor n − 1) of rows [[x, y], …]. */
function meanCov(rows) {
  const n = rows.length;
  const m = [mean(rows.map((r) => r[0])), mean(rows.map((r) => r[1]))];
  const S = [[0, 0], [0, 0]];
  for (const r of rows) {
    for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) S[a][b] += ((r[a] - m[a]) * (r[b] - m[b])) / (n - 1);
  }
  return { m, S };
}

/** Eigenvalues (largest first) and unit eigenvectors of a symmetric 2×2 matrix. */
function eig2(A) {
  const a = A[0][0], b = A[0][1], d = A[1][1];
  const h = Math.sqrt(((a - d) / 2) ** 2 + b * b);
  const l1 = (a + d) / 2 + h, l2 = (a + d) / 2 - h;
  let v1 = Math.abs(b) > 1e-12 ? [l1 - d, b] : a >= d ? [1, 0] : [0, 1];
  const len = Math.hypot(v1[0], v1[1]);
  v1 = [v1[0] / len, v1[1] / len];
  if (v1[0] < 0) v1 = [-v1[0], -v1[1]];
  return { values: [l1, l2], vectors: [v1, [v1[1], -v1[0]]] };
}

/** Points on the ellipse z'R⁻¹z = c for standardized variables with correlation rho. */
function ellipseZ(rho, c, k = 120) {
  const { values, vectors: [u, v] } = eig2([[1, rho], [rho, 1]]);
  const a = Math.sqrt(c * values[0]), b = Math.sqrt(c * values[1]);
  return Array.from({ length: k + 1 }, (_, i) => {
    const t = (2 * Math.PI * i) / k;
    return [a * Math.cos(t) * u[0] + b * Math.sin(t) * v[0], a * Math.cos(t) * u[1] + b * Math.sin(t) * v[1]];
  });
}

/** T² of a standardized pair (z1, z2) when the correlation is rho. */
const t2z = (z1, z2, rho) => (z1 * z1 - 2 * rho * z1 * z2 + z2 * z2) / (1 - rho * rho);

/** False-alarm rate of two separate ±L·σ charts on standardized variables with correlation rho. */
function rectAlpha(rho, L = 3) {
  const s = Math.sqrt(1 - rho * rho), N = 400, h = (2 * L) / N;
  let acc = 0;
  for (let i = 0; i <= N; i++) {
    const z = -L + i * h;
    const w = i === 0 || i === N ? 1 : i % 2 ? 4 : 2;
    acc += w * normPdf(z) * (normCdf((L - rho * z) / s) - normCdf((-L - rho * z) / s));
  }
  return 1 - (acc * h) / 3;
}

/** Upper tail of a noncentral chi-square with k degrees of freedom and noncentrality nc. */
function ncChi2Sf(x, k, nc) {
  const half = nc / 2;
  let w = Math.exp(-half), s = 0;
  for (let j = 0; j < 400; j++) {
    if (j > 0) w *= half / j;
    s += w * (1 - chi2Cdf(x, k + 2 * j));
    if (j > half + 12 && w < 1e-15) break;
  }
  return s;
}

/* ---------- tablets: weight (mg) and thickness (mm), positively correlated ---------- */

const TAB = { mu: [250, 4.0], sd: [2.0, 0.04], rho: 0.8 };

/** k subgroups of n tablets; from subgroup `at` on, weight rises and thickness falls by d σ each. */
function tabletSubgroups(seed, shifted, { k = 50, n = 4, at = 36, d = 0.6 } = {}) {
  const R = rng(seed);
  const c = Math.sqrt(1 - TAB.rho ** 2);
  const groups = [];
  for (let j = 1; j <= k; j++) {
    const s = shifted && j >= at ? d : 0;
    const g = [];
    for (let i = 0; i < n; i++) {
      const e1 = R.normal(), e2 = R.normal();
      const z1 = e1 + s, z2 = TAB.rho * e1 + c * e2 - s;
      g.push([TAB.mu[0] + TAB.sd[0] * z1, TAB.mu[1] + TAB.sd[1] * z2]);
    }
    groups.push(g);
  }
  return groups;
}

/** Phase I estimates from the first k1 subgroups, then T² and X̄ values for every subgroup. */
function tsqAnalysis(groups, k1 = 25) {
  const n = groups[0].length;
  const stats = groups.map(meanCov);
  const base = stats.slice(0, k1);
  const grand = [mean(base.map((s) => s.m[0])), mean(base.map((s) => s.m[1]))];
  const Sp = [[0, 0], [0, 0]];
  for (const s of base) for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) Sp[a][b] += s.S[a][b] / base.length;
  const Si = inv2(Sp);
  const t2 = stats.map((s) => n * quad2([s.m[0] - grand[0], s.m[1] - grand[1]], Si));
  const se = [Math.sqrt(Sp[0][0] / n), Math.sqrt(Sp[1][1] / n)];
  return { xbar: stats.map((s) => s.m), t2, grand, Sp, se };
}

/** Handbook 6.5.4.3.1 and 6.5.4.3.2: UCLs for subgroup averages in Phase I and Phase II. */
function tsqLimits(k, n, p, alpha, a = 0) {
  const F1 = fInv(1 - alpha, p, k * n - k - p + 1);
  const ucl1 = ((k * n * p - k * p - n * p + p) / (k * n - k - p + 1)) * F1;
  const df2 = (k - a) * n - k + a - p + 1;
  const ucl2 = ((p * (k - a + 1) * (n - 1)) / df2) * fInv(1 - alpha, p, df2);
  return { ucl1, ucl2, F1 };
}

/* ---------- principal components of two standardized measurements ---------- */

/** n standardized tablets; from observation `at` on, the mean moves d units along PC1 or PC2. */
function pcaData(seed, rho, shift, { n = 60, at = 41, d = 1.5 } = {}) {
  const R = rng(seed);
  const c = Math.sqrt(1 - rho * rho), k = d / Math.SQRT2;
  const dir = shift === 'pc1' ? [k, k] : shift === 'pc2' ? [k, -k] : [0, 0];
  return Array.from({ length: n }, (_, i) => {
    const e1 = R.normal(), e2 = R.normal();
    const s = i + 1 >= at ? dir : [0, 0];
    return [e1 + s[0], rho * e1 + c * e2 + s[1]];
  });
}

/** Standardize with the first n1 points, then principal factors (component score / √eigenvalue). */
function pcaAnalysis(pts, n1 = 40) {
  const { m, S } = meanCov(pts.slice(0, n1));
  const sd = [Math.sqrt(S[0][0]), Math.sqrt(S[1][1])];
  const r = S[0][1] / (sd[0] * sd[1]);
  const { values, vectors } = eig2([[1, r], [r, 1]]);
  const z = pts.map((p) => [(p[0] - m[0]) / sd[0], (p[1] - m[1]) / sd[1]]);
  const factors = z.map((v) => vectors.map((u, k) => (u[0] * v[0] + u[1] * v[1]) / Math.sqrt(values[k])));
  return { r, values, vectors, z, factors };
}

/* ---------- MEWMA ---------- */

// Upper limits h giving an in-control ARL of 200 for a bivariate MEWMA that uses the exact
// covariance of Z_i (λ = 0.05, 0.10, …, 1.00). Found by simulation for this course:
// 200,000 runs per λ, Z_0 = 0. At λ = 1 the chart is the T² chart and h = χ²(0.995; 2) = 10.60.
const MEWMA_H = [7.70, 8.79, 9.36, 9.71, 9.95, 10.12, 10.25, 10.34, 10.41, 10.46, 10.50, 10.52, 10.55, 10.57, 10.59, 10.60, 10.60, 10.60, 10.60, 10.60];
const mewmaH = (lam) => MEWMA_H[Math.min(19, Math.max(0, Math.round(lam * 20) - 1))];

/** Standardized, uncorrelated pairs; from observation `at` on, the mean sits at statistical distance d. */
function mewmaData(seed, d, { n = 80, at = 41 } = {}) {
  const R = rng(seed);
  return Array.from({ length: n }, (_, i) => [R.normal() + (i + 1 >= at ? d : 0), R.normal()]);
}

/** MEWMA statistics T²_i = Z_i' Σ_Zi⁻¹ Z_i with Σ_Zi = λ/(2−λ)[1 − (1−λ)^{2i}] Σ, here Σ = I. */
function mewmaStats(xs, lam) {
  let z1 = 0, z2 = 0, f = 1;
  return xs.map(([a, b]) => {
    z1 = lam * a + (1 - lam) * z1;
    z2 = lam * b + (1 - lam) * z2;
    f *= (1 - lam) ** 2;
    return (z1 * z1 + z2 * z2) / ((lam / (2 - lam)) * (1 - f));
  });
}

/** Average run length of the MEWMA when the shift is present from the start (simulated). */
function mewmaArl(lam, d, h, runs = 3000, seed = 7) {
  const R = rng(seed);
  let total = 0;
  for (let r = 0; r < runs; r++) {
    let z1 = 0, z2 = 0, f = 1, i = 0;
    for (;;) {
      i++;
      z1 = lam * (R.normal() + d) + (1 - lam) * z1;
      z2 = lam * R.normal() + (1 - lam) * z2;
      f *= (1 - lam) ** 2;
      if ((z1 * z1 + z2 * z2) / ((lam / (2 - lam)) * (1 - f)) > h || i >= 5000) break;
    }
    total += i;
  }
  return total / runs;
}

// </pure>

/** Re-run `fn` when the host's width changes (for charts whose domain depends on their shape). */
function onWidth(host, fn) {
  let w = host.clientWidth, raf = 0;
  new ResizeObserver(() => {
    if (host.clientWidth === w) return;
    w = host.clientWidth;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(fn);
  }).observe(host);
}

/** Margins and an x half-range that keep one unit on x as long as one unit on y. */
function squareFrame(host, { maxH = 440, ratio = 0.66, yHalf = 4.4 } = {}) {
  const W = host.clientWidth || 640;
  const narrow = W < 520;
  const margin = { top: 20, right: narrow ? 14 : 22, bottom: 44, left: narrow ? 50 : 58 };
  const H = Math.round(Math.min(maxH, Math.max(280, W * ratio)));
  const iw = W - margin.left - margin.right, ih = H - margin.top - margin.bottom;
  return { H, margin, xHalf: (yHalf * iw) / ih, yHalf };
}

const verdict = (sig) => (sig ? 'Signal' : 'No signal');

/* ---------- Fig 10.1: the rectangle and the ellipse ---------- */
{
  const host = $('#ell-chart');
  const chart = new Chart(host, { height: 380 });
  const N = 250;
  const R0 = rng(41);
  const E = Array.from({ length: N }, () => [R0.normal(), R0.normal()]);
  let rho = TAB.rho;
  let pt = [1.8, -1.8];
  const toX = (z) => TAB.mu[0] + TAB.sd[0] * z;
  const toY = (z) => TAB.mu[1] + TAB.sd[1] * z;

  function draw() {
    const fr = squareFrame(host);
    const alpha = rectAlpha(rho);
    const ucl = chi2Inv(1 - alpha, 2);
    const c = Math.sqrt(1 - rho * rho);
    const cloud = E.map(([e1, e2]) => [toX(e1), toY(rho * e1 + c * e2)]);
    const ell = ellipseZ(rho, ucl).map(([a, b]) => [toX(a), toY(b)]);
    const { values, vectors: [u] } = eig2([[1, rho], [rho, 1]]);
    const tip = [toX(Math.sqrt(ucl * values[0]) * u[0]), toY(Math.sqrt(ucl * values[0]) * u[1])];
    const t2 = t2z(pt[0], pt[1], rho);
    const boxSig = Math.abs(pt[0]) > 3 || Math.abs(pt[1]) > 3;
    const t2Sig = t2 > ucl;

    chart.update({
      height: fr.H,
      margin: fr.margin,
      x: { domain: [toX(-fr.xHalf), toX(fr.xHalf)], label: 'Tablet weight (mg)' },
      y: { domain: [toY(-fr.yHalf), toY(fr.yHalf)], label: 'Thickness (mm)' },
      aria: `Scatter of ${N} in-control tablets, weight against thickness with correlation ${fmt(rho, 2)}, the rectangle of two separate three-sigma charts, the T² ellipse, and a draggable test tablet`,
      layers: [
        { type: 'path', cls: 'ellipse', d: (sx, sy) => ell.map((p, i) => `${i ? 'L' : 'M'}${sx(p[0]).toFixed(1)},${sy(p[1]).toFixed(1)}`).join('') + 'Z' },
        { type: 'path', cls: 'box', d: (sx, sy) => `M${sx(toX(-3))},${sy(toY(-3))}H${sx(toX(3))}V${sy(toY(3))}H${sx(toX(-3))}Z` },
        { type: 'dots', points: cloud, cls: 'dot', r: 2.3 },
        { type: 'text', x: toX(-3), y: toY(3), dx: 4, dy: -7, text: (host.clientWidth || 640) < 520 ? 'Separate charts' : 'Two separate charts, ±3σ each', cls: 'label' },
        { type: 'text', x: tip[0], y: tip[1], dx: 8, dy: 4, text: 'T² limit', cls: 'label-strong' },
        {
          type: 'handle', axis: 'xy', x: toX(pt[0]), y: toY(pt[1]), r: 7,
          aria: 'Test tablet. Use the arrow keys to move it.',
          step: TAB.sd[0] / 10, stepY: TAB.sd[1] / 10,
          onDrag: (x, y) => { pt = [(x - TAB.mu[0]) / TAB.sd[0], (y - TAB.mu[1]) / TAB.sd[1]]; draw(); },
        },
      ],
    });

    readouts($('#ell-readouts'), [
      { label: 'Weight', value: `${fmt(toX(pt[0]), 1)} mg`, sub: `z₁ = ${fmt(pt[0], 2)}` },
      { label: 'Thickness', value: `${fmt(toY(pt[1]), 3)} mm`, sub: `z₂ = ${fmt(pt[1], 2)}` },
      { label: 'T² of this tablet', value: fmt(t2, 1), sub: `Limit ${fmt(ucl, 2)}` },
      { label: 'Two separate charts', value: verdict(boxSig), state: boxSig ? 'signal' : 'good' },
      { label: 'T² chart', value: verdict(t2Sig), state: t2Sig ? 'signal' : 'good' },
      { label: 'False-alarm rate', value: fmtRate(alpha), sub: 'Same for both methods' },
    ]);
  }

  legend($('#ell-legend'), [
    { label: 'In-control tablets', swatch: 'dot', color: 'data' },
    { label: 'Limits of two separate charts', swatch: 'dash', color: 'ink' },
    { label: 'T² limit at the same false-alarm rate', swatch: 'line', color: 'alt' },
    { label: 'Test tablet (drag it)', swatch: 'dot', color: 'signal' },
  ]);
  bindRange('ell-rho', (v) => { rho = v; draw(); }, { format: (v) => v.toFixed(2) });
  $('#ell-reset').addEventListener('click', () => { pt = [1.8, -1.8]; draw(); });
  onWidth(host, draw);
}

/* ---------- Fig 10.2: a T² chart beside two X̄ charts ---------- */
{
  const small = { height: 170, margin: { top: 14, right: 66, bottom: 34, left: 54 } };
  const cw = new Chart($('#tsq-w'), small);
  const ct = new Chart($('#tsq-t'), small);
  const c2 = new Chart($('#tsq-chart'), { height: 250, margin: { top: 18, right: 76, bottom: 42, left: 54 } });
  const K1 = 25, K = 50, NS = 4, AT = 36, ALPHA = 0.0027;
  const { ucl1, ucl2 } = tsqLimits(K1, NS, 2, ALPHA);
  const shiftBox = $('#tsq-shift');
  let seed = 10;
  const xs = Array.from({ length: K }, (_, i) => i + 1);

  function uniChart(chart, vals, cl, se, label, dec, shifted) {
    const ucl = cl + 3 * se, lcl = cl - 3 * se;
    const pts = vals.map((v, i) => [i + 1, v, v > ucl || v < lcl]);
    const lo = Math.min(lcl - se, ...vals), hi = Math.max(ucl + se, ...vals);
    chart.update({
      x: { domain: [0.5, K + 0.5], label: 'Subgroup', ticks: 5 },
      y: { domain: [lo, hi], label, ticks: 3, format: (v) => fmt(v, dec) },
      aria: `X-bar chart of ${label} for ${K} subgroups of ${NS} tablets`,
      layers: [
        { type: 'hline', y: ucl, cls: 'limit', label: `UCL ${fmt(ucl, dec)}` },
        { type: 'hline', y: cl, cls: 'center' },
        { type: 'hline', y: lcl, cls: 'limit', label: `LCL ${fmt(lcl, dec)}` },
        { type: 'vline', x: K1 + 0.5, cls: 'marker' },
        shifted ? { type: 'vline', x: AT - 0.5, cls: 'shift' } : null,
        { type: 'line', points: pts, cls: 'data-thin' },
        { type: 'dots', points: pts, cls: (p) => (p[2] ? 'signal' : 'dot'), r: (p) => (p[2] ? 4.5 : 2.6) },
      ],
      hover: {
        xs, mark: (i) => pts[i],
        render: (i) => ({ title: `Subgroup ${i + 1}`, rows: [{ label, value: fmt(vals[i], dec + 1) }], note: pts[i][2] ? 'Beyond a three-sigma limit' : undefined }),
      },
    });
    return pts.filter((p, i) => i >= K1 && p[2]).length;
  }

  function draw() {
    const shifted = shiftBox.checked;
    const A = tsqAnalysis(tabletSubgroups(seed, shifted, { k: K, n: NS, at: AT }), K1);
    const sigW = uniChart(cw, A.xbar.map((v) => v[0]), A.grand[0], A.se[0], 'Mean weight (mg)', 1, shifted);
    const sigT = uniChart(ct, A.xbar.map((v) => v[1]), A.grand[1], A.se[1], 'Mean thickness (mm)', 3, shifted);
    const lim = (i) => (i < K1 ? ucl1 : ucl2);
    const pts = A.t2.map((v, i) => [i + 1, v, v > lim(i)]);
    const sigP1 = pts.filter((p, i) => i < K1 && p[2]).length;
    const sigP2 = pts.filter((p, i) => i >= K1 && p[2]).length;
    const yMax = Math.max(ucl2 * 1.35, ...A.t2) * 1.08;
    c2.update({
      x: { domain: [0.5, K + 0.5], label: 'Subgroup' },
      y: { domain: [0, yMax], label: 'T²' },
      aria: `Hotelling T² chart for ${K} subgroups with a Phase I limit of ${fmt(ucl1, 2)} and a Phase II limit of ${fmt(ucl2, 2)}`,
      layers: [
        { type: 'xband', x0: 0.5, x1: K1 + 0.5, cls: 'band' },
        { type: 'line', points: [[0.5, ucl1], [K1 + 0.5, ucl1]], cls: 'limit' },
        { type: 'line', points: [[K1 + 0.5, ucl2], [K + 0.5, ucl2]], cls: 'limit' },
        { type: 'text', x: 1, y: ucl1, dy: -6, text: `Phase I UCL ${fmt(ucl1, 2)}`, cls: 'hlabel' },
        { type: 'text', x: K + 0.5, y: ucl2, dx: 8, text: `UCL ${fmt(ucl2, 2)}`, cls: 'hlabel', baseline: 'middle' },
        { type: 'text', x: 1, y: yMax, dy: 14, text: 'Phase I: set the limits', cls: 'label' },
        { type: 'text', x: K1 + 1, y: yMax, dy: 14, text: 'Phase II: monitor', cls: 'label' },
        { type: 'vline', x: K1 + 0.5, cls: 'marker' },
        shifted ? { type: 'vline', x: AT - 0.5, cls: 'shift', label: 'Heavier and thinner', labelY: yMax * 0.8, anchor: 'end' } : null,
        { type: 'line', points: pts, cls: 'data' },
        { type: 'dots', points: pts, cls: (p) => (p[2] ? 'signal' : 'dot'), r: (p) => (p[2] ? 4.5 : 3) },
      ],
      hover: {
        xs, mark: (i) => pts[i],
        render: (i) => ({
          title: `Subgroup ${i + 1} (${i < K1 ? 'Phase I' : 'Phase II'})`,
          rows: [
            { label: 'T²', value: fmt(A.t2[i], 2) },
            { label: 'mean weight, mg', value: fmt(A.xbar[i][0], 2), key: 'none' },
            { label: 'mean thickness, mm', value: fmt(A.xbar[i][1], 4), key: 'none' },
          ],
          note: pts[i][2] ? `Above the ${i < K1 ? 'Phase I' : 'Phase II'} UCL` : undefined,
        }),
      },
    });
    readouts($('#tsq-readouts'), [
      { label: 'Weight chart, Phase II', value: `${sigW} signal${sigW === 1 ? '' : 's'}`, state: sigW ? 'signal' : undefined },
      { label: 'Thickness chart, Phase II', value: `${sigT} signal${sigT === 1 ? '' : 's'}`, state: sigT ? 'signal' : undefined },
      { label: 'T² chart, Phase II', value: `${sigP2} signal${sigP2 === 1 ? '' : 's'}`, state: sigP2 ? 'signal' : undefined, sub: sigP1 ? `Plus ${sigP1} in Phase I` : 'Phase I is clean' },
      { label: 'Sample correlation', value: fmt(A.Sp[0][1] / Math.sqrt(A.Sp[0][0] * A.Sp[1][1]), 2), sub: 'Pooled within subgroups' },
    ]);
  }

  legend($('#tsq-legend'), [
    { label: 'Subgroup statistic', swatch: 'line', color: 'data' },
    { label: 'Control limits (α = 0.0027)', swatch: 'dash', color: 'ink' },
    { label: 'Signal', swatch: 'dot', color: 'signal' },
    { label: 'Phase I subgroups', swatch: 'box', color: 'muted' },
  ]);
  shiftBox.addEventListener('change', draw);
  $('#tsq-new').addEventListener('click', () => { seed += 1; draw(); });
  draw();
}

/* ---------- Fig 10.3: principal components ---------- */
{
  const host = $('#pca-scatter');
  const sc = new Chart(host, { height: 320 });
  const bars = new Chart($('#pca-bars'), { height: 320, margin: { top: 20, right: 16, bottom: 44, left: 46 } });
  const scores = new Chart($('#pca-scores'), { height: 250 });
  const N = 60, N1 = 40, AT = 41;
  let rho = 0.8, shift = 'pc2', seed = 6;

  function draw() {
    const A = pcaAnalysis(pcaData(seed, rho, shift, { n: N, at: AT }), N1);
    const lim = 3;
    const sig = A.factors.map((f) => [Math.abs(f[0]) > lim, Math.abs(f[1]) > lim]);
    const yHalf = Math.max(3.2, ...A.z.map((p) => Math.abs(p[1]))) * 1.08;
    const fr = squareFrame(host, { maxH: 360, ratio: 0.7, yHalf });
    const axes = A.vectors.map((u) => {
      const len = 0.92 * Math.min(yHalf / Math.max(Math.abs(u[1]), 1e-9), fr.xHalf / Math.max(Math.abs(u[0]), 1e-9));
      return [[-len * u[0], -len * u[1]], [len * u[0], len * u[1]]];
    });
    sc.update({
      height: fr.H,
      margin: fr.margin,
      x: { domain: [-fr.xHalf, fr.xHalf], label: 'Weight, standardized' },
      y: { domain: [-fr.yHalf, fr.yHalf], label: 'Thickness, standardized' },
      aria: `Scatter of standardized weight and thickness with the two principal component axes; sample correlation ${fmt(A.r, 2)}`,
      layers: [
        { type: 'line', points: axes[0], cls: 'ink' },
        { type: 'line', points: axes[1], cls: 'ink dashed' },
        { type: 'dots', points: A.z.slice(0, N1), cls: 'dot-muted', r: 3 },
        { type: 'dots', points: A.z.slice(N1).map((p, i) => [...p, sig[N1 + i][0] || sig[N1 + i][1]]), cls: (p) => (p[2] ? 'signal' : 'dot'), r: (p) => (p[2] ? 4.5 : 3.2) },
        { type: 'text', x: axes[0][1][0], y: axes[0][1][1], dx: 6, dy: -4, text: 'PC1', cls: 'label-strong' },
        { type: 'text', x: axes[1][1][0], y: axes[1][1][1], dx: 6, dy: 4, text: 'PC2', cls: 'label-strong' },
      ],
    });

    const share = A.values.map((v) => (100 * v) / 2);
    bars.update({
      height: fr.H,
      x: { domain: [0.4, 2.6], ticks: [1, 2], format: (v) => `PC${v}`, label: 'Component' },
      y: { domain: [0, 108], label: '% of variance', ticks: [0, 25, 50, 75, 100] },
      aria: `Bar chart: PC1 explains ${fmt(share[0], 0)} percent of the variance and PC2 ${fmt(share[1], 0)} percent`,
      layers: [
        { type: 'bars', bars: [{ x0: 0.7, x1: 1.3, y: share[0] }, { x0: 1.7, x1: 2.3, y: share[1], cls: 'bar-alt' }] },
        { type: 'text', x: 1, y: share[0], dy: -7, text: `${fmt(share[0], 0)}%`, cls: 'label-strong', anchor: 'middle' },
        { type: 'text', x: 2, y: share[1], dy: -7, text: `${fmt(share[1], 0)}%`, cls: 'label-strong', anchor: 'middle' },
      ],
    });

    const f1 = A.factors.map((f, i) => [i + 1, f[0], sig[i][0]]);
    const f2 = A.factors.map((f, i) => [i + 1, f[1], sig[i][1]]);
    const all = A.factors.flat();
    scores.update({
      x: { domain: [0.5, N + 0.5], label: 'Tablet' },
      y: { domain: [Math.min(-4.2, ...all) - 0.3, Math.max(4.2, ...all) + 0.3], label: 'Principal factor' },
      aria: 'Principal factor chart: scores on PC1 and PC2 for each tablet with limits at plus and minus 3',
      layers: [
        { type: 'xband', x0: 0.5, x1: N1 + 0.5, cls: 'band' },
        { type: 'hline', y: 3, cls: 'limit', label: 'UCL 3' },
        { type: 'hline', y: 0, cls: 'center' },
        { type: 'hline', y: -3, cls: 'limit', label: 'LCL −3' },
        shift !== 'none' ? { type: 'vline', x: AT - 0.5, cls: 'shift', label: shift === 'pc1' ? 'Shift along PC1' : 'Shift along PC2', anchor: 'end' } : null,
        { type: 'line', points: f1, cls: 'data' },
        { type: 'line', points: f2, cls: 'alt' },
        { type: 'dots', points: f1, cls: (p) => (p[2] ? 'signal' : 'dot'), r: (p) => (p[2] ? 4.5 : 2.6) },
        { type: 'dots', points: f2, cls: (p) => (p[2] ? 'signal' : 'dot-alt'), r: (p) => (p[2] ? 4.5 : 2.6) },
      ],
      hover: {
        xs: f1.map((p) => p[0]), mark: (i) => (Math.abs(f2[i][1]) > Math.abs(f1[i][1]) ? f2[i] : f1[i]),
        render: (i) => ({
          title: `Tablet ${i + 1}${i < N1 ? ' (baseline)' : ''}`,
          rows: [{ label: 'PC1 factor', value: fmt(f1[i][1], 2) }, { label: 'PC2 factor', value: fmt(f2[i][1], 2), key: 'alt' }],
          note: f1[i][2] || f2[i][2] ? `Beyond ±3 on ${f1[i][2] && f2[i][2] ? 'both components' : f1[i][2] ? 'PC1' : 'PC2'}` : undefined,
        }),
      },
    });

    const n1 = sig.slice(N1).filter((s) => s[0]).length, n2 = sig.slice(N1).filter((s) => s[1]).length;
    readouts($('#pca-readouts'), [
      { label: 'Sample correlation r', value: fmt(A.r, 2), sub: 'From the 40 baseline tablets' },
      { label: 'Eigenvalues', value: `${fmt(A.values[0], 2)} and ${fmt(A.values[1], 2)}`, sub: 'They sum to 2, the number of variables' },
      { label: 'PC1 chart, last 20', value: `${n1} signal${n1 === 1 ? '' : 's'}`, state: n1 ? 'signal' : undefined },
      { label: 'PC2 chart, last 20', value: `${n2} signal${n2 === 1 ? '' : 's'}`, state: n2 ? 'signal' : undefined },
    ]);
  }

  legend($('#pca-legend'), [
    { label: 'Baseline tablets (first 40)', swatch: 'dot', color: 'muted' },
    { label: 'Component axes', swatch: 'line', color: 'ink' },
    { label: 'New tablets', swatch: 'dot', color: 'data' },
    { label: 'PC1 factor', swatch: 'line', color: 'data' },
    { label: 'PC2 factor', swatch: 'line', color: 'alt' },
    { label: 'Signal', swatch: 'dot', color: 'signal' },
  ]);
  shift = segmented('pca-shift', (v) => { shift = v; draw(); }).value;
  bindRange('pca-rho', (v) => { rho = v; draw(); }, { format: (v) => v.toFixed(2) });
  $('#pca-new').addEventListener('click', () => { seed += 1; draw(); });
  onWidth(host, draw);
}

/* ---------- Fig 10.4: MEWMA against T² ---------- */
{
  const cT = new Chart($('#mew-t2'), { height: 200 });
  const cM = new Chart($('#mew-chart'), { height: 220 });
  const N = 80, AT = 41;
  const H_T2 = chi2Inv(0.995, 2);
  let lam = 0.1, d = 1, seed = 1;

  function chartSpec(vals, h, label, aria, cls) {
    const pts = vals.map((v, i) => [i + 1, v, v > h]);
    const first = pts.findIndex((p, i) => i >= AT - 1 && p[2]);
    const run = first >= 0 ? first + 2 - AT : null;
    return {
      spec: {
        x: { domain: [0.5, N + 0.5], label: 'Observation' },
        y: { domain: [0, Math.max(h * 1.35, ...vals) * 1.05], label },
        aria,
        layers: [
          { type: 'hline', y: h, cls: 'limit', label: `UCL ${fmt(h, 2)}` },
          { type: 'vline', x: AT - 0.5, cls: 'shift', label: `Mean shifts by a distance of ${fmt(d, d < 1 ? 1 : 0)}` },
          { type: 'line', points: pts, cls },
          { type: 'dots', points: pts, cls: (p) => (p[2] ? 'signal' : cls === 'alt' ? 'dot-alt' : 'dot'), r: (p) => (p[2] ? 4.5 : 2.4) },
          run ? { type: 'annot', x: first + 1, y: vals[first], text: `Signal on shifted observation ${run}`, dx: 14, dy: -14, anchor: 'end', cls: 'label-signal' } : null,
        ],
        hover: {
          xs: pts.map((p) => p[0]), mark: (i) => pts[i],
          render: (i) => ({ title: `Observation ${i + 1}`, rows: [{ label, value: fmt(vals[i], 2), key: cls === 'alt' ? 'alt' : 'data' }], note: pts[i][2] ? 'Above the UCL' : undefined }),
        },
      },
      run,
      before: pts.filter((p, i) => i < AT - 1 && p[2]).length,
    };
  }

  function draw() {
    const xs = mewmaData(seed, d, { n: N, at: AT });
    const h = mewmaH(lam);
    const t2 = xs.map(([a, b]) => a * a + b * b);
    const T = chartSpec(t2, H_T2, 'T²', 'T² chart of individual observations with a shift at observation 41', 'data');
    const M = chartSpec(mewmaStats(xs, lam), h, 'MEWMA T²', `MEWMA chart with lambda ${fmt(lam, 2)}`, 'alt');
    cT.update(T.spec);
    cM.update(M.spec);
    const arlT = 1 / ncChi2Sf(H_T2, 2, d * d);
    const arlM = mewmaArl(lam, d, h);
    const runText = (r) => (r ? String(r) : `Over ${N - AT + 1}`);
    const before = (r) => (r.before ? `${r.before} false alarm${r.before === 1 ? '' : 's'} before the shift` : 'No false alarms before the shift');
    readouts($('#mew-readouts'), [
      { label: 'T² run length, this run', value: runText(T.run), sub: before(T) },
      { label: 'MEWMA run length, this run', value: runText(M.run), sub: before(M) },
      { label: 'T² average run length', value: fmt(arlT, 1), sub: 'Exact, shift present from the start' },
      { label: 'MEWMA average run length', value: fmt(arlM, 1), sub: 'Simulated, 3,000 runs', state: arlM < arlT ? 'good' : undefined },
      { label: 'MEWMA limit h', value: fmt(h, 2), sub: 'In-control ARL 200 for both charts' },
    ]);
  }

  legend($('#mew-legend'), [
    { label: 'T² of each observation', swatch: 'line', color: 'data' },
    { label: 'MEWMA statistic', swatch: 'line', color: 'alt' },
    { label: 'Upper control limit', swatch: 'dash', color: 'ink' },
    { label: 'Signal', swatch: 'dot', color: 'signal' },
  ]);
  d = Number(segmented('mew-shift', (v) => { d = Number(v); draw(); }).value);
  $('#mew-new').addEventListener('click', () => { seed += 1; draw(); });
  bindRange('mew-lambda', (v) => { lam = v; draw(); }, { format: (v) => v.toFixed(2) });
}
