// Module 11: time series and forecasting.

import { Chart, dataTable } from '../chart.js';
import { rng, mean, sd, imr, chi2Cdf, fmt, fmtInt } from '../stats.js';
import { bindRange, segmented, readouts, legend, $ } from '../ui.js';

// <pure> Computation only. Everything between the pure markers runs without a DOM.

/* ---------- handbook datasets ---------- */

// 6.4.3.1: twelve observations used to choose the smoothing constant.
const SMOOTH_Y = [71, 70, 69, 68, 64, 65, 72, 78, 75, 75, 75, 70];
// 6.4.3.2 and 6.4.3.4: a series with a trend.
const TREND_Y = [6.4, 5.6, 7.8, 8.8, 11, 11.6, 16.7, 15.3, 21.6, 22.4];
// 6.4.3.6: quarterly sales, 1990–1995.
const SALES = [362, 385, 432, 341, 382, 409, 498, 387, 473, 513, 582, 474, 544, 582, 681, 557, 628, 707, 773, 592, 627, 725, 854, 661];
// 6.4.4.9: Box and Jenkins series F, 70 consecutive yields from a batch chemical process.
const SERIES_F = [47, 64, 23, 71, 38, 64, 55, 41, 59, 48, 71, 35, 57, 40, 58, 44, 80, 55, 37, 74, 51, 57, 50, 60, 45, 57, 50, 45, 25, 59, 50, 71, 56, 74, 50, 58, 45, 54, 36, 54, 48, 55, 45, 57, 50, 62, 44, 64, 43, 52, 38, 59, 55, 41, 53, 49, 34, 35, 54, 45, 68, 38, 50, 60, 39, 59, 40, 57, 54, 23];

/* ---------- smoothing ---------- */

/**
 * Single exponential smoothing in the handbook's form (6.4.3.1): S_2 = y_1 and
 * S_t = α y_{t−1} + (1 − α) S_{t−1}. With 0-based arrays, S[t] is the forecast of y[t];
 * S[n] is the forecast for the next period. MSE uses the n − 1 one-step errors.
 */
function singleSmooth(y, a) {
  const n = y.length;
  const S = [null, y[0]];
  for (let t = 2; t <= n; t++) S.push(a * y[t - 1] + (1 - a) * S[t - 1]);
  let sse = 0;
  for (let t = 1; t < n; t++) sse += (y[t] - S[t]) ** 2;
  return { S, sse, mse: sse / (n - 1) };
}

/** Trailing moving average of N values used as a forecast: F[t] = mean(y[t−N] … y[t−1]), t = N … n. */
function maForecast(y, N) {
  const n = y.length;
  const F = new Array(n + 1).fill(null);
  for (let t = N; t <= n; t++) F[t] = mean(y.slice(t - N, t));
  let sse = 0;
  for (let t = N; t < n; t++) sse += (y[t] - F[t]) ** 2;
  return { F, mse: sse / (n - N) };
}

/** Centered moving average (6.4.2.2). Even N averages the two neighbouring N-term averages. */
function maCentered(y, N) {
  const n = y.length;
  const C = new Array(n).fill(null);
  if (N % 2) {
    const h = (N - 1) / 2;
    for (let t = h; t < n - h; t++) C[t] = mean(y.slice(t - h, t + h + 1));
  } else {
    const h = N / 2;
    for (let t = h; t < n - h; t++) C[t] = (mean(y.slice(t - h, t + h)) + mean(y.slice(t - h + 1, t + h + 1))) / 2;
  }
  return C;
}

/** MSE of single smoothing for α = 0.01 … 1.00, with the minimum. */
function mseCurve(y) {
  const pts = [];
  for (let k = 1; k <= 100; k++) pts.push([k / 100, singleSmooth(y, k / 100).mse]);
  const best = pts.reduce((b, p) => (p[1] < b[1] ? p : b));
  return { pts, best };
}

/**
 * Double exponential smoothing (6.4.3.3): S_t = α y_t + (1 − α)(S_{t−1} + b_{t−1}),
 * b_t = γ(S_t − S_{t−1}) + (1 − γ) b_{t−1}, S_1 = y_1. F[t] = S_{t−1} + b_{t−1} forecasts y[t].
 */
function doubleSmooth(y, a, g, b1) {
  const n = y.length;
  const S = [y[0]], B = [b1], F = [null];
  for (let t = 1; t < n; t++) {
    F.push(S[t - 1] + B[t - 1]);
    S.push(a * y[t] + (1 - a) * (S[t - 1] + B[t - 1]));
    B.push(g * (S[t] - S[t - 1]) + (1 - g) * B[t - 1]);
  }
  let sse = 0;
  for (let t = 1; t < n; t++) sse += (y[t] - F[t]) ** 2;
  return { S, B, F, mse: sse / (n - 1), ahead: (m) => S[n - 1] + m * B[n - 1] };
}

/** Holt–Winters start-up values from the handbook (6.4.3.5): initial trend and seasonal indices. */
function hwInit(y, L) {
  const years = Math.floor(y.length / L);
  const A = Array.from({ length: years }, (_, p) => mean(y.slice(p * L, p * L + L)));
  const I0 = Array.from({ length: L }, (_, q) => mean(A.map((avg, p) => y[p * L + q] / avg)));
  let b1 = 0;
  for (let i = 0; i < L; i++) b1 += (y[L + i] - y[i]) / L;
  return { A, I0, b1: b1 / L };
}

/**
 * Triple exponential smoothing (6.4.3.5), multiplicative seasons. β smooths the seasonal
 * index and γ the trend, as in the handbook. The recursion starts at period 1 with
 * S_1 = y_1 / I_1 and b_1 from hwInit; F[t] is the one-step forecast of y[t].
 */
function holtWinters(y, L, a, be, g, H = 8) {
  const n = y.length;
  const { I0, b1 } = hwInit(y, L);
  let S = y[0] / I0[0], B = b1;
  const I = [I0[0]], F = [null];
  for (let t = 1; t < n; t++) {
    const prev = t >= L ? I[t - L] : I0[t];
    F.push((S + B) * prev);
    const Sn = (a * y[t]) / prev + (1 - a) * (S + B);
    B = g * (Sn - S) + (1 - g) * B;
    S = Sn;
    I.push((be * y[t]) / S + (1 - be) * prev);
  }
  let sse = 0;
  for (let t = 1; t < n; t++) sse += (y[t] - F[t]) ** 2;
  const ahead = Array.from({ length: H }, (_, k) => (S + (k + 1) * B) * I[n - L + (k % L)]);
  return { F, mse: sse / (n - 1), ahead, S, B, I };
}

/** Grid search for the Holt–Winters constants with the smallest MSE (coarse, then fine). */
function hwFit(y, L) {
  let best = [0, 0, 0, Infinity];
  const scan = (lo, hi, step) => {
    const r = (v) => Math.round(v * 100) / 100;
    for (let a = lo[0]; a <= hi[0] + 1e-9; a += step) for (let be = lo[1]; be <= hi[1] + 1e-9; be += step) for (let g = lo[2]; g <= hi[2] + 1e-9; g += step) {
      const m = holtWinters(y, L, r(a), r(be), r(g), 0).mse;
      if (m < best[3]) best = [r(a), r(be), r(g), m];
    }
  };
  scan([0, 0, 0], [1, 1, 1], 0.05);
  const c = best.slice(0, 3);
  scan(c.map((v) => Math.max(0, v - 0.05)), c.map((v) => Math.min(1, v + 0.05)), 0.01);
  return { alpha: best[0], beta: best[1], gamma: best[2], mse: best[3] };
}

/* ---------- autocorrelation and AR models ---------- */

/** Sample autocorrelations r_1 … r_K. */
function acf(x, K) {
  const n = x.length, m = mean(x);
  const c0 = x.reduce((s, v) => s + (v - m) ** 2, 0);
  const r = [];
  for (let k = 1; k <= K; k++) {
    let c = 0;
    for (let t = k; t < n; t++) c += (x[t] - m) * (x[t - k] - m);
    r.push(c / c0);
  }
  return r;
}

/** Durbin–Levinson recursion: partial autocorrelations and the AR coefficients of each order. */
function durbinLevinson(r) {
  const pacf = [], phis = [];
  let phi = [];
  for (let k = 1; k <= r.length; k++) {
    let num = r[k - 1], den = 1;
    for (let j = 1; j < k; j++) { num -= phi[j - 1] * r[k - j - 1]; den -= phi[j - 1] * r[j - 1]; }
    const pkk = num / den;
    const next = [];
    for (let j = 1; j < k; j++) next.push(phi[j - 1] - pkk * phi[k - j - 1]);
    next.push(pkk);
    phi = next;
    pacf.push(pkk);
    phis.push([...phi]);
  }
  return { pacf, phis };
}

/** AR(p) fitted by the Yule–Walker equations about the series mean, with one-step fits and residuals. */
function arFit(x, p) {
  const mu = mean(x);
  const phi = durbinLevinson(acf(x, p)).phis[p - 1];
  const fit = x.map((_, t) => (t < p ? null : mu + phi.reduce((s, f, j) => s + f * (x[t - j - 1] - mu), 0)));
  const res = x.slice(p).map((v, i) => v - fit[i + p]);
  return { mu, phi, fit, res, sd: sd(res) };
}

/** Ljung–Box portmanteau test on residuals over h lags, with `fitted` parameters estimated. */
function ljungBox(res, h, fitted) {
  const n = res.length, r = acf(res, h);
  const Q = n * (n + 2) * r.reduce((s, v, k) => s + (v * v) / (n - k - 1), 0);
  const df = h - fitted;
  return { Q, df, p: 1 - chi2Cdf(Q, df) };
}

/** An AR(1) series x_t − μ = φ(x_{t−1} − μ) + a_t, started from its stationary distribution. */
function ar1Series(seed, phi, { n = 100, mu = 150, sa = 0.5 } = {}) {
  const R = rng(seed);
  let x = R.normal(0, sa / Math.sqrt(1 - phi * phi));
  const out = [];
  for (let t = 0; t < n; t++) {
    x = phi * x + R.normal(0, sa);
    out.push(mu + x);
  }
  return out;
}

/** Residuals of an AR(1) model with φ estimated by the lag-1 autocorrelation. */
function ar1Residuals(x) {
  const m = mean(x), phi = acf(x, 1)[0];
  return { phi, res: x.slice(1).map((v, i) => v - m - phi * (x[i] - m)) };
}

// </pure>

/** Re-run `fn` when the host's width changes (for specs that depend on the chart's width). */
function onWidth(host, fn) {
  let w = host.clientWidth, raf = 0;
  new ResizeObserver(() => {
    if (host.clientWidth === w) return;
    w = host.clientWidth;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(fn);
  }).observe(host);
}

const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const plural = (k, word) => `${k} ${word}${k === 1 ? '' : 's'}`;

/** Bars for an autocorrelation plot, lag k drawn centred on x = k. */
const acfBars = (r) => r.map((v, i) => ({ x0: i + 0.6, x1: i + 1.4, y: v }));

/** A standard autocorrelation chart spec with ±2/√n bounds. */
function acfSpec(r, n, label, aria, extra = []) {
  const b = 2 / Math.sqrt(n);
  const top = Math.max(1, ...r.map(Math.abs)) * 1.12;
  return {
    x: { domain: [0.3, r.length + 0.7], label: 'Lag', ticks: r.length > 12 ? 5 : r.length },
    y: { domain: [-top, top], label, ticks: [-1, -0.5, 0, 0.5, 1] },
    aria,
    layers: [
      { type: 'band', y0: -b, y1: b, cls: 'band' },
      { type: 'hline', y: b, cls: 'limit-soft', label: `+${fmt(b, 2)}` },
      { type: 'hline', y: -b, cls: 'limit-soft', label: `−${fmt(b, 2)}` },
      { type: 'hline', y: 0, cls: 'center' },
      { type: 'bars', bars: acfBars(r) },
      ...extra,
    ],
    hover: {
      xs: r.map((_, i) => i + 1), mark: (i) => [i + 1, r[i]],
      render: (i) => ({ title: `Lag ${i + 1}`, rows: [{ label, value: fmt(r[i], 3) }], note: Math.abs(r[i]) > b ? 'Outside ±2/√n' : undefined }),
    },
  };
}

/* ---------- Fig 11.1: autocorrelation fools a standard chart ---------- */
{
  const raw = new Chart($('#ar-raw'), { height: 250, margin: { top: 16, right: 76, bottom: 42, left: 56 } });
  const cf = new Chart($('#ar-acf'), { height: 250, margin: { top: 16, right: 56, bottom: 42, left: 46 } });
  const resC = new Chart($('#ar-resid'), { height: 220, margin: { top: 16, right: 76, bottom: 42, left: 56 } });
  const N = 100;
  let phi = 0.8, seed = 5;

  function iChart(chart, vals, start, label, dec, aria) {
    const L = imr(vals);
    const pts = vals.map((v, i) => [start + i, v, v > L.x.ucl || v < L.x.lcl]);
    const span = L.x.ucl - L.x.lcl;
    chart.update({
      x: { domain: [0.5, N + 0.5], label: 'Hour' },
      y: { domain: [Math.min(L.x.lcl - 0.1 * span, ...vals) - 0.04 * span, Math.max(L.x.ucl + 0.1 * span, ...vals) + 0.04 * span], label, format: (v) => fmt(v, dec) },
      aria,
      layers: [
        { type: 'hline', y: L.x.ucl, cls: 'limit', label: `UCL ${fmt(L.x.ucl, dec)}` },
        { type: 'hline', y: L.x.cl, cls: 'center' },
        { type: 'hline', y: L.x.lcl, cls: 'limit', label: `LCL ${fmt(L.x.lcl, dec)}` },
        { type: 'line', points: pts, cls: 'data-thin' },
        { type: 'dots', points: pts, cls: (p) => (p[2] ? 'signal' : 'dot'), r: (p) => (p[2] ? 4 : 2.4) },
      ],
      hover: {
        xs: pts.map((p) => p[0]), mark: (i) => pts[i],
        render: (i) => ({ title: `Hour ${pts[i][0]}`, rows: [{ label, value: fmt(vals[i], dec + 1) }], note: pts[i][2] ? 'Outside the individuals chart limits' : undefined }),
      },
    });
    return { out: pts.filter((p) => p[2]).length, sigma: L.sigma };
  }

  function draw() {
    const x = ar1Series(seed, phi, { n: N });
    const R1 = iChart(raw, x, 1, '°C', 2, `Individuals chart of ${N} hourly reactor temperatures with autocorrelation ${fmt(phi, 2)}`);
    const { phi: phiHat, res } = ar1Residuals(x);
    const R2 = iChart(resC, res, 2, 'Residual, °C', 2, 'Individuals chart of the residuals from an AR(1) model');
    const r = acf(x, 20);
    const theory = Array.from({ length: 20 }, (_, i) => [i + 1, phi ** (i + 1)]);
    cf.update(acfSpec(r, N, 'Autocorrelation', `Autocorrelation function of the temperatures at lags 1 to 20; lag 1 is ${fmt(r[0], 2)}`, [
      { type: 'line', points: theory, cls: 'ink dashed' },
    ]));
    readouts($('#ar-readouts'), [
      { label: 'Lag-1 autocorrelation', value: fmt(r[0], 2), sub: `Model value φ = ${fmt(phi, 2)}` },
      { label: 'σ from moving ranges', value: `${fmt(R1.sigma, 2)} °C`, sub: `Overall standard deviation ${fmt(sd(x), 2)} °C` },
      { label: 'Raw chart: points outside', value: `${R1.out} of ${N}`, state: R1.out > 1 ? 'signal' : 'good', sub: 'About 0.3 expected if independent' },
      { label: 'Residual chart: points outside', value: `${R2.out} of ${N - 1}`, state: R2.out > 1 ? 'signal' : 'good', sub: `Fitted φ = ${fmt(phiHat, 2)}` },
    ]);
  }

  legend($('#ar-legend'), [
    { label: 'Hourly temperature or residual', swatch: 'line', color: 'data' },
    { label: 'Individuals chart limits', swatch: 'dash', color: 'ink' },
    { label: 'Point outside the limits', swatch: 'dot', color: 'signal' },
    { label: 'Sample autocorrelation', swatch: 'box', color: 'data' },
    { label: 'AR(1) theory, φᵏ', swatch: 'dash', color: 'ink' },
  ]);
  $('#ar-new').addEventListener('click', () => { seed += 1; draw(); });
  bindRange('ar-phi', (v) => { phi = v; draw(); }, { format: (v) => fmt(v, 2) });
}

/* ---------- Fig 11.2: smoothing explorer ---------- */
{
  const main = new Chart($('#sm-chart'), { height: 280, margin: { top: 18, right: 24, bottom: 42, left: 46 } });
  const curveC = new Chart($('#sm-mse'), { height: 280, margin: { top: 18, right: 20, bottom: 42, left: 46 } });
  const Y = SMOOTH_Y, n = Y.length;
  const centerBox = $('#sm-center');
  const full = mseCurve(Y);
  let alpha = 0.1, N = 3, shown = 0, timer = 0;
  const xs = Array.from({ length: n + 1 }, (_, i) => i + 1);

  function draw() {
    const ses = singleSmooth(Y, alpha);
    const centered = centerBox.checked;
    const ma = maForecast(Y, N);
    const maPts = centered ? maCentered(Y, N).map((v, i) => [i + 1, v]) : ma.F.map((v, i) => [i + 1, v]);
    const sPts = ses.S.map((v, i) => [i + 1, v]);
    const data = Y.map((v, i) => [i + 1, v]);
    main.update({
      x: { domain: [0.5, n + 1.5], label: 'Period', ticks: [1, 3, 5, 7, 9, 11, 13] },
      y: { domain: [62, 81.5], label: 'Value', ticks: [65, 70, 75, 80] },
      aria: `The handbook's twelve observations with single exponential smoothing at alpha ${fmt(alpha, 2)} and a ${N}-term moving average`,
      layers: [
        { type: 'xband', x0: n + 0.5, x1: n + 1.5, cls: 'band' },
        { type: 'text', x: n + 1, y: 81.5, dy: 14, text: 'Next', cls: 'label', anchor: 'middle' },
        { type: 'line', points: data, cls: 'data' },
        { type: 'dots', points: data, cls: 'dot' },
        { type: 'line', points: maPts, cls: 'alt' },
        { type: 'dots', points: maPts.filter((p) => p[1] !== null), cls: 'dot-alt', r: 2.6 },
        { type: 'line', points: sPts, cls: 'alt2' },
        { type: 'dots', points: sPts.filter((p) => p[1] !== null), cls: 'dot-alt2', r: 2.6 },
      ],
      hover: {
        xs, mark: (i) => (i < n ? data[i] : sPts[i]),
        render: (i) => ({
          title: i < n ? `Period ${i + 1}` : `Period ${n + 1} (forecast)`,
          rows: [
            ...(i < n ? [{ label: 'observed', value: fmt(Y[i], 0) }] : []),
            { label: centered ? `centered ${N}-term average` : `${N}-term moving average`, value: maPts[i]?.[1] != null ? fmt(maPts[i][1], 2) : '–', key: 'alt' },
            { label: `smoothed, α = ${fmt(alpha, 2)}`, value: sPts[i][1] != null ? fmt(sPts[i][1], 2) : '–', key: 'alt2' },
          ],
        }),
      },
    });

    const curve = full.pts.slice(0, shown);
    const done = shown >= full.pts.length;
    curveC.update({
      x: { domain: [0, 1], label: 'Smoothing constant α', ticks: [0, 0.25, 0.5, 0.75, 1] },
      y: { domain: [11, 21], label: 'MSE' },
      aria: 'Mean squared error of one-step forecasts as a function of the smoothing constant',
      layers: [
        { type: 'line', points: curve, cls: 'alt2' },
        { type: 'vline', x: alpha, cls: 'marker' },
        { type: 'dots', points: [[alpha, ses.mse]], cls: 'dot-alt2', r: 5.5 },
        done ? { type: 'annot', x: full.best[0], y: full.best[1], text: `Lowest: α = ${fmt(full.best[0], 2)}`, dx: 16, dy: 22, anchor: 'end' } : null,
        !shown ? { type: 'text', x: 0.5, y: 20.2, text: 'Press “Find the best α” to trace the curve', cls: 'label', anchor: 'middle' } : null,
      ],
      hover: curve.length ? {
        xs: curve.map((p) => p[0]), mark: (i) => curve[i],
        render: (i) => ({ title: `α = ${fmt(curve[i][0], 2)}`, rows: [{ label: 'MSE', value: fmt(curve[i][1], 2), key: 'alt2' }] }),
      } : undefined,
    });

    readouts($('#sm-readouts'), [
      { label: `Smoothing MSE, α = ${fmt(alpha, 2)}`, value: fmt(ses.mse, 2), sub: `SSE ${fmt(ses.sse, 2)} over ${n - 1} forecasts` },
      centered
        ? { label: `Centered ${N}-term average`, value: 'No forecast', sub: 'It uses later values' }
        : { label: `Moving-average MSE, N = ${N}`, value: fmt(ma.mse, 2), sub: `Over ${n - N} forecasts` },
      { label: 'Forecast for period 13', value: fmt(ses.S[n], 2), sub: 'From single smoothing' },
      { label: 'Best α', value: done ? fmt(full.best[0], 2) : '–', sub: done ? `MSE ${fmt(full.best[1], 2)}` : 'Not searched yet', state: done ? 'good' : undefined },
    ]);

    dataTable($('#sm-table'), [
      { label: 'Period', key: 't' },
      { label: 'y', key: 'y' },
      { label: `S (α = ${fmt(alpha, 2)})`, key: 's', fmt: (v) => (v === null ? '' : fmt(v, 2)) },
      { label: 'Error', key: 'e', fmt: (v) => (v === null ? '' : fmt(v, 2)) },
      { label: 'Error²', key: 'e2', fmt: (v) => (v === null ? '' : fmt(v, 2)) },
    ], Y.map((y, i) => ({ t: i + 1, y, s: ses.S[i], e: i ? y - ses.S[i] : null, e2: i ? (y - ses.S[i]) ** 2 : null })));
  }

  const alphaIn = bindRange('sm-alpha', (v) => { alpha = v; draw(); }, { format: (v) => fmt(v, 2), call: false });
  bindRange('sm-window', (v) => { N = v; draw(); }, { call: false });
  centerBox.addEventListener('change', draw);
  $('#sm-best').addEventListener('click', () => {
    cancelAnimationFrame(timer);
    const finish = () => { shown = full.pts.length; alpha = full.best[0]; alphaIn.value = alpha; draw(); };
    if (reduceMotion()) { finish(); return; }
    shown = 0;
    const t0 = performance.now();
    const step = (now) => {
      shown = Math.min(full.pts.length, Math.ceil(((now - t0) / 1400) * full.pts.length));
      if (shown >= full.pts.length) { finish(); return; }
      alpha = full.pts[shown - 1]?.[0] ?? 0.01;
      alphaIn.value = alpha;
      draw();
      timer = requestAnimationFrame(step);
    };
    timer = requestAnimationFrame(step);
  });
  legend($('#sm-legend'), [
    { label: 'Observed', swatch: 'line', color: 'data' },
    { label: 'Moving average', swatch: 'line', color: 'alt' },
    { label: 'Single exponential smoothing', swatch: 'line', color: 'alt2' },
  ]);
  alpha = alphaIn.value;
  N = Number($('#sm-window').value);
  draw();
}

/* ---------- Fig 11.3: single against double smoothing on a trend ---------- */
{
  const chart = new Chart($('#db-chart'), { height: 290, margin: { top: 18, right: 24, bottom: 42, left: 46 } });
  const Y = TREND_Y, n = Y.length, H = 5;
  const B1 = ((Y[1] - Y[0]) + (Y[2] - Y[1]) + (Y[3] - Y[2])) / 3;
  let alpha = 0.36, gamma = 1;

  function draw() {
    const s = singleSmooth(Y, alpha);
    const d = doubleSmooth(Y, alpha, gamma, B1);
    const data = Y.map((v, i) => [i + 1, v]);
    const sFit = s.S.slice(0, n).map((v, i) => [i + 1, v]);
    const dFit = d.F.map((v, i) => [i + 1, v]);
    const sAhead = [[n, s.S[n - 1]], ...Array.from({ length: H }, (_, k) => [n + k + 1, s.S[n]])];
    const dAhead = [[n, d.F[n - 1]], ...Array.from({ length: H }, (_, k) => [n + k + 1, d.ahead(k + 1)])];
    const all = [...Y, ...sAhead.map((p) => p[1]), ...dAhead.map((p) => p[1])];
    chart.update({
      x: { domain: [0.5, n + H + 0.5], label: 'Period', ticks: [1, 3, 5, 7, 9, 11, 13, 15] },
      y: { domain: [0, Math.max(40, ...all) + 2], label: 'Value' },
      aria: 'Trending series with one-step forecasts from single and double exponential smoothing and five forecasts beyond the data',
      layers: [
        { type: 'xband', x0: n + 0.5, x1: n + H + 0.5, cls: 'band' },
        { type: 'text', x: n + 0.5 + H / 2, y: Math.max(40, ...all) + 2, dy: 14, text: 'Forecasts', cls: 'label', anchor: 'middle' },
        { type: 'line', points: data, cls: 'data' },
        { type: 'dots', points: data, cls: 'dot' },
        { type: 'line', points: sFit, cls: 'alt' },
        { type: 'line', points: sAhead, cls: 'alt dashed' },
        { type: 'dots', points: sAhead.slice(1), cls: 'dot-alt', r: 3 },
        { type: 'line', points: dFit, cls: 'alt2' },
        { type: 'line', points: dAhead, cls: 'alt2 dashed' },
        { type: 'dots', points: dAhead.slice(1), cls: 'dot-alt2', r: 3 },
        { type: 'line', points: [[n, s.S[n - 1]], [n, Y[n - 1]]], cls: 'ink' },
        { type: 'text', x: n, y: (Y[n - 1] + s.S[n - 1]) / 2, dx: 7, text: `Lag ${fmt(Y[n - 1] - s.S[n - 1], 1)}`, cls: 'label-strong', baseline: 'middle' },
      ],
      hover: {
        xs: Array.from({ length: n + H }, (_, i) => i + 1),
        mark: (i) => (i < n ? data[i] : dAhead[i - n + 1]),
        render: (i) => ({
          title: i < n ? `Period ${i + 1}` : `Period ${i + 1} (forecast)`,
          rows: [
            ...(i < n ? [{ label: 'observed', value: fmt(Y[i], 1) }] : []),
            { label: 'single smoothing', value: i === 0 ? '–' : fmt(i < n ? s.S[i] : s.S[n], 2), key: 'alt' },
            { label: 'double smoothing', value: i === 0 ? '–' : fmt(i < n ? d.F[i] : d.ahead(i - n + 1), 2), key: 'alt2' },
          ],
        }),
      },
    });
    readouts($('#db-readouts'), [
      { label: 'Single smoothing MSE', value: fmt(s.mse, 2), sub: 'One-step forecasts, periods 2–10' },
      { label: 'Double smoothing MSE', value: fmt(d.mse, 2), sub: `b₁ = ${fmt(B1, 1)}`, state: d.mse < s.mse ? 'good' : undefined },
      { label: 'Forecast for period 15', value: `${fmt(s.S[n], 1)} vs ${fmt(d.ahead(H), 1)}`, sub: 'Single vs double' },
    ]);
    dataTable($('#db-table'), [
      { label: 'Period', key: 't' },
      { label: 'y', key: 'y' },
      { label: 'Single S', key: 'ss', fmt: (v) => (v === null ? '' : fmt(v, 2)) },
      { label: 'Double S', key: 'ds', fmt: (v) => fmt(v, 2) },
      { label: 'Trend b', key: 'b', fmt: (v) => fmt(v, 2) },
      { label: 'Double forecast', key: 'f', fmt: (v) => (v === null ? '' : fmt(v, 2)) },
    ], Y.map((y, i) => ({ t: i + 1, y, ss: s.S[i], ds: d.S[i], b: d.B[i], f: d.F[i] })));
  }

  legend($('#db-legend'), [
    { label: 'Observed', swatch: 'line', color: 'data' },
    { label: 'Single smoothing', swatch: 'line', color: 'alt' },
    { label: 'Double smoothing', swatch: 'line', color: 'alt2' },
    { label: 'Forecasts beyond the data', swatch: 'dash', color: 'ink' },
  ]);
  bindRange('db-gamma', (v) => { gamma = v; draw(); }, { format: (v) => fmt(v, 2), call: false });
  bindRange('db-alpha', (v) => { alpha = v; draw(); }, { format: (v) => fmt(v, 2), call: false });
  alpha = Number($('#db-alpha').value);
  gamma = Number($('#db-gamma').value);
  draw();
}

/* ---------- Fig 11.4: Holt–Winters on quarterly sales ---------- */
{
  const host = $('#hw-chart');
  const chart = new Chart(host, { height: 300, margin: { top: 18, right: 24, bottom: 42, left: 52 } });
  const Y = SALES, n = Y.length, L = 4;
  const init = hwInit(Y, L);
  const q = (t) => `${1990 + Math.floor((t - 1) / 4)} Q${((t - 1) % 4) + 1}`;
  let H = 8;
  const ins = {};

  function draw() {
    const a = ins.alpha.value, be = ins.beta.value, g = ins.gamma.value;
    const hw = holtWinters(Y, L, a, be, g, H);
    const data = Y.map((v, i) => [i + 1, v]);
    const fit = hw.F.map((v, i) => [i + 1, v]);
    const ahead = [[n, hw.F[n - 1]], ...hw.ahead.map((v, k) => [n + k + 1, v])];
    const top = Math.max(...Y, ...hw.ahead) * 1.08;
    chart.update({
      x: { domain: [0.5, n + H + 0.5], label: 'Quarter', ticks: Array.from({ length: (n + H) / 4 }, (_, k) => 1 + 4 * k).filter((v, k) => (host.clientWidth || 640) >= 560 || k % 2 === 0), format: (v) => `${1990 + (v - 1) / 4}` },
      y: { domain: [250, top], label: 'Sales' },
      aria: `Quarterly sales 1990 to 1995 with Holt-Winters one-step forecasts and ${H} quarters forecast ahead`,
      layers: [
        { type: 'xband', x0: n + 0.5, x1: n + H + 0.5, cls: 'band' },
        { type: 'text', x: n + 0.5 + H / 2, y: top, dy: 14, text: 'Forecasts', cls: 'label', anchor: 'middle' },
        { type: 'line', points: data, cls: 'data' },
        { type: 'dots', points: data, cls: 'dot', r: 3 },
        { type: 'line', points: fit, cls: 'alt' },
        { type: 'line', points: ahead, cls: 'alt2 dashed' },
        { type: 'dots', points: ahead.slice(1), cls: 'dot-alt2', r: 3.2 },
      ],
      hover: {
        xs: Array.from({ length: n + H }, (_, i) => i + 1),
        mark: (i) => (i < n ? data[i] : ahead[i - n + 1]),
        render: (i) => ({
          title: `${q(i + 1)}${i < n ? '' : ' (forecast)'}`,
          rows: i < n
            ? [{ label: 'sales', value: fmtInt(Y[i]) }, { label: 'one-step forecast', value: i ? fmt(hw.F[i], 0) : '–', key: 'alt' }]
            : [{ label: 'forecast', value: fmt(hw.ahead[i - n], 0), key: 'alt2' }],
        }),
      },
    });
    const next4 = hw.ahead.slice(0, 4).reduce((s, v) => s + v, 0);
    readouts($('#hw-readouts'), [
      { label: 'MSE of one-step forecasts', value: fmtInt(hw.mse), sub: 'Quarters 2 to 24' },
      { label: 'Initial trend b₁', value: fmt(init.b1, 2), sub: 'Sales per quarter' },
      { label: 'Starting seasonal index, Q3', value: fmt(init.I0[2], 3), sub: `Q1 to Q4: ${init.I0.map((v) => fmt(v, 3)).join(', ')}` },
      { label: 'Forecast total for 1996', value: fmtInt(next4), sub: `Sales in 1995: ${fmtInt(Y.slice(20).reduce((s, v) => s + v, 0))}` },
    ]);
    dataTable($('#hw-table'), [
      { label: 'Quarter', key: 'q', num: false },
      { label: 'Period', key: 't' },
      { label: 'Sales', key: 'y' },
      { label: 'One-step forecast', key: 'f', fmt: (v) => (v === null ? '' : fmt(v, 1)) },
      { label: 'Error', key: 'e', fmt: (v) => (v === null ? '' : fmt(v, 1)) },
    ], Y.map((y, i) => ({ q: q(i + 1), t: i + 1, y, f: hw.F[i], e: hw.F[i] === null ? null : y - hw.F[i] })));
  }

  ins.alpha = bindRange('hw-alpha', draw, { format: (v) => fmt(v, 2), call: false });
  ins.beta = bindRange('hw-beta', draw, { format: (v) => fmt(v, 2), call: false });
  ins.gamma = bindRange('hw-gamma', draw, { format: (v) => fmt(v, 2), call: false });
  H = Number(segmented('hw-h', (v) => { H = Number(v); draw(); }).value);
  $('#hw-fit').addEventListener('click', () => {
    const f = hwFit(Y, L);
    ins.alpha.value = f.alpha; ins.beta.value = f.beta; ins.gamma.value = f.gamma;
    draw();
  });
  $('#hw-reset').addEventListener('click', () => {
    ins.alpha.value = 0.76; ins.beta.value = 0.98; ins.gamma.value = 0;
    draw();
  });
  onWidth(host, draw);
  legend($('#hw-legend'), [
    { label: 'Quarterly sales', swatch: 'line', color: 'data' },
    { label: 'One-step forecast', swatch: 'line', color: 'alt' },
    { label: 'Forecast beyond the data', swatch: 'dash', color: 'alt2' },
  ]);
  draw();
}

/* ---------- Fig 11.5: Box–Jenkins identification on series F ---------- */
{
  const ser = new Chart($('#bj-series'), { height: 230, margin: { top: 16, right: 76, bottom: 42, left: 46 } });
  const cf = new Chart($('#bj-acf'), { height: 230, margin: { top: 16, right: 56, bottom: 42, left: 46 } });
  const X = SERIES_F, n = X.length, K = 20, LB = 10;
  const r = acf(X, K);
  const { pacf } = durbinLevinson(r);
  const fits = { 1: arFit(X, 1), 2: arFit(X, 2) };
  const xs = X.map((_, i) => i + 1);

  function draw(view) {
    const model = view === 'res1' ? fits[1] : view === 'res2' ? fits[2] : null;
    const data = X.map((v, i) => [i + 1, v]);
    ser.update({
      x: { domain: [0.5, n + 0.5], label: 'Batch' },
      y: { domain: [15, 87], label: 'Yield', ticks: [20, 40, 60, 80] },
      aria: 'Series F: 70 consecutive batch yields' + (model ? ` with one-step fitted values from an AR(${model.phi.length}) model` : ''),
      layers: [
        { type: 'hline', y: mean(X), cls: 'center', label: `Mean ${fmt(mean(X), 2)}` },
        { type: 'line', points: data, cls: 'data-thin' },
        { type: 'dots', points: data, cls: 'dot', r: 2.6 },
        model ? { type: 'line', points: model.fit.map((v, i) => [i + 1, v]), cls: 'alt' } : null,
      ],
      hover: {
        xs, mark: (i) => data[i],
        render: (i) => ({
          title: `Batch ${i + 1}`,
          rows: [{ label: 'yield', value: fmtInt(X[i]) }, ...(model && model.fit[i] !== null ? [{ label: 'one-step fit', value: fmt(model.fit[i], 1), key: 'alt' }, { label: 'residual', value: fmt(X[i] - model.fit[i], 1), key: 'none' }] : [])],
        }),
      },
    });

    let vals, label, nn = n;
    if (view === 'acf') { vals = r; label = 'Autocorrelation'; }
    else if (view === 'pacf') { vals = pacf; label = 'Partial autocorrelation'; }
    else { vals = acf(model.res, K); label = 'Residual autocorrelation'; nn = model.res.length; }
    cf.update(acfSpec(vals, nn, label, `${label} at lags 1 to ${K}`));

    if (model) {
      const p = model.phi.length;
      const lb = ljungBox(model.res, LB, p);
      readouts($('#bj-readouts'), [
        { label: `AR(${p}) coefficients`, value: model.phi.map((v) => fmt(v, 3)).join(', '), sub: `φ₁${p > 1 ? ', φ₂' : ''}, fitted about the mean ${fmt(model.mu, 2)}` },
        { label: 'Residual standard deviation', value: fmt(model.sd, 2) },
        { label: `Ljung–Box Q, ${LB} lags`, value: fmt(lb.Q, 1), sub: `${lb.df} degrees of freedom, p = ${fmt(lb.p, 3)}`, state: lb.p < 0.05 ? 'signal' : 'good' },
      ]);
    } else {
      readouts($('#bj-readouts'), [
        { label: 'Lag 1', value: fmt(vals[0], 3) },
        { label: 'Lag 2', value: fmt(vals[1], 3) },
        { label: 'Lag 3', value: fmt(vals[2], 3) },
        { label: 'Bounds ±2/√n', value: `±${fmt(2 / Math.sqrt(n), 3)}`, sub: `n = ${n}` },
      ]);
    }
  }

  legend($('#bj-legend'), [
    { label: 'Yield', swatch: 'line', color: 'data' },
    { label: 'One-step fit of the chosen AR model', swatch: 'line', color: 'alt' },
    { label: 'Autocorrelation at each lag', swatch: 'box', color: 'data' },
    { label: 'Approximate 95% bounds, ±2/√n', swatch: 'box', color: 'muted' },
  ]);
  dataTable($('#bj-table'), [{ label: 'Batch', key: 't' }, { label: 'Yield', key: 'y' }], X.map((y, i) => ({ t: i + 1, y })));
  const seg = segmented('bj-view', draw);
  draw(seg.value);
}
