// stats.js: the numerical toolkit shared by every module.
// Pure functions, no DOM. Everything a widget needs to compute limits,
// probabilities and simulated data lives here.

/* ---------- descriptive ---------- */

export const sum = (a) => a.reduce((s, v) => s + v, 0);
export const mean = (a) => sum(a) / a.length;
export const min = (a) => a.reduce((m, v) => (v < m ? v : m), Infinity);
export const max = (a) => a.reduce((m, v) => (v > m ? v : m), -Infinity);
export const range = (a) => max(a) - min(a);

export function variance(a) {
  const m = mean(a);
  return a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1);
}
export const sd = (a) => Math.sqrt(variance(a));

/** Quantile with linear interpolation (type 7). `p` in [0, 1]. */
export function quantile(a, p) {
  const s = [...a].sort((x, y) => x - y);
  const h = (s.length - 1) * p;
  const lo = Math.floor(h);
  return s[lo] + (h - lo) * ((s[lo + 1] ?? s[lo]) - s[lo]);
}

/** Moving ranges |x_i - x_{i-1}|, length n-1. */
export const movingRanges = (a) => a.slice(1).map((v, i) => Math.abs(v - a[i]));

/** Bin values into `k` equal-width bins over [lo, hi]. Returns [{x0, x1, count}]. */
export function histogram(values, lo, hi, k) {
  const w = (hi - lo) / k;
  const bins = Array.from({ length: k }, (_, i) => ({ x0: lo + i * w, x1: lo + (i + 1) * w, count: 0 }));
  for (const v of values) {
    const i = Math.floor((v - lo) / w);
    if (i >= 0 && i < k) bins[i].count++;
    else if (v === hi) bins[k - 1].count++;
  }
  return bins;
}

/* ---------- special functions ---------- */

/** Complementary error function, fractional error < 1.2e-7 everywhere (good in the far tails). */
export function erfc(x) {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 +
    t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 +
    t * (-0.82215223 + t * 0.17087277)))))))));
  return x >= 0 ? r : 2 - r;
}
export const erf = (x) => 1 - erfc(x);

/** log Γ(x), Lanczos approximation. */
export function lgamma(x) {
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x);
  x -= 1;
  let a = c[0];
  const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/** Regularized lower incomplete gamma P(a, x). */
export function gammaP(a, x) {
  if (x <= 0) return 0;
  if (x < a + 1) {
    let ap = a, s = 1 / a, d = s;
    for (let n = 0; n < 500; n++) { ap++; d *= x / ap; s += d; if (Math.abs(d) < Math.abs(s) * 1e-15) break; }
    return s * Math.exp(-x + a * Math.log(x) - lgamma(a));
  }
  // continued fraction for Q, then P = 1 - Q
  let b = x + 1 - a, c = 1e300, d = 1 / b, h = d;
  for (let i = 1; i < 500; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300;
    c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d;
    const del = d * c; h *= del;
    if (Math.abs(del - 1) < 1e-15) break;
  }
  return 1 - Math.exp(-x + a * Math.log(x) - lgamma(a)) * h;
}

function betacf(a, b, x) {
  const qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1, d = 1 - (qab * x) / qap;
  if (Math.abs(d) < 1e-300) d = 1e-300;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 500; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < 1e-300) d = 1e-300;
    c = 1 + aa / c; if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d; h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < 1e-300) d = 1e-300;
    c = 1 + aa / c; if (Math.abs(c) < 1e-300) c = 1e-300;
    d = 1 / d;
    const del = d * c; h *= del;
    if (Math.abs(del - 1) < 1e-15) break;
  }
  return h;
}

/** Regularized incomplete beta I_x(a, b). */
export function betaI(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? (bt * betacf(a, b, x)) / a : 1 - (bt * betacf(b, a, 1 - x)) / b;
}

/** Invert a monotone increasing CDF on [lo, hi] by bisection. */
export function invert(cdf, p, lo, hi, iters = 200) {
  for (let i = 0; i < iters; i++) {
    const mid = (lo + hi) / 2;
    if (cdf(mid) < p) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/* ---------- distributions ---------- */

export const normPdf = (x, mu = 0, s = 1) => Math.exp(-0.5 * ((x - mu) / s) ** 2) / (s * Math.sqrt(2 * Math.PI));
export const normCdf = (x, mu = 0, s = 1) => 0.5 * erfc(-(x - mu) / (s * Math.SQRT2));

/** Standard normal quantile (Acklam), refined with one Halley step. */
export function normInv(p) {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155211881];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425;
  let x;
  if (p < pl) {
    const q = Math.sqrt(-2 * Math.log(p));
    x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p <= 1 - pl) {
    const q = p - 0.5, r = q * q;
    x = ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  const e = normCdf(x) - p;
  const u = e * Math.sqrt(2 * Math.PI) * Math.exp((x * x) / 2);
  return x - u / (1 + (x * u) / 2);
}

export function binomPmf(k, n, p) {
  if (k < 0 || k > n) return 0;
  if (p <= 0) return k === 0 ? 1 : 0;
  if (p >= 1) return k === n ? 1 : 0;
  return Math.exp(lgamma(n + 1) - lgamma(k + 1) - lgamma(n - k + 1) + k * Math.log(p) + (n - k) * Math.log(1 - p));
}
/** P(X <= c) for X ~ Binomial(n, p). */
export function binomCdf(c, n, p) {
  if (c < 0) return 0;
  if (c >= n) return 1;
  let s = 0;
  for (let k = 0; k <= c; k++) s += binomPmf(k, n, p);
  return Math.min(1, s);
}

export function poissonPmf(k, lam) {
  if (k < 0) return 0;
  if (lam <= 0) return k === 0 ? 1 : 0;
  return Math.exp(k * Math.log(lam) - lam - lgamma(k + 1));
}
export function poissonCdf(c, lam) {
  if (c < 0) return 0;
  let s = 0;
  for (let k = 0; k <= c; k++) s += poissonPmf(k, lam);
  return Math.min(1, s);
}

export const chi2Cdf = (x, k) => gammaP(k / 2, x / 2);
export const chi2Inv = (p, k) => invert((x) => chi2Cdf(x, k), p, 0, Math.max(100, k * 10));

export const fCdf = (x, d1, d2) => (x <= 0 ? 0 : betaI((d1 * x) / (d1 * x + d2), d1 / 2, d2 / 2));
export const fInv = (p, d1, d2) => invert((x) => fCdf(x, d1, d2), p, 0, 1e4);

export const betaCdf = (x, a, b) => betaI(x, a, b);
export const betaInv = (p, a, b) => invert((x) => betaI(x, a, b), p, 0, 1);

export function tCdf(t, df) {
  const x = df / (df + t * t);
  const tail = 0.5 * betaI(x, df / 2, 0.5);
  return t >= 0 ? 1 - tail : tail;
}
export const tInv = (p, df) => invert((t) => tCdf(t, df), p, -1e3, 1e3);

/* ---------- control chart constants ---------- */

// d2 (6 decimals) and d3 (4 decimals, as published) for subgroup sizes 2..25, from
// numerical integration of the range of n standard normal values. With these, the derived
// factors round to the handbook's table (e.g. n = 2: D4 3.267; n = 5: A2 0.577, D4 2.115).
const D2 = [NaN, NaN, 1.128379, 1.692569, 2.058751, 2.325929, 2.534413, 2.704357, 2.847201, 2.970026, 3.077505, 3.172873, 3.258455, 3.335980, 3.406763, 3.471827, 3.531983, 3.587884, 3.640064, 3.688963, 3.734950, 3.778336, 3.819385, 3.858323, 3.895348, 3.930629];
const D3 = [NaN, NaN, 0.8525, 0.8884, 0.8798, 0.8641, 0.8480, 0.8332, 0.8198, 0.8078, 0.7971, 0.7873, 0.7785, 0.7704, 0.7630, 0.7562, 0.7499, 0.7441, 0.7386, 0.7335, 0.7287, 0.7242, 0.7199, 0.7159, 0.7121, 0.7084];

/** c4(n) = E[s]/σ for samples of size n from a normal population. */
export const c4 = (n) => Math.sqrt(2 / (n - 1)) * Math.exp(lgamma(n / 2) - lgamma((n - 1) / 2));

/**
 * Every Shewhart constant for subgroup size n (2..25).
 * Values round to the published tables (e.g. n = 5: A2 0.577, D4 2.115, B4 2.089).
 */
export function spcConstants(n) {
  if (n < 2 || n > 25) throw new RangeError('subgroup size must be 2..25');
  const d2 = D2[n], d3 = D3[n], cc = c4(n);
  const r = Math.sqrt(1 - cc * cc) / cc;
  return {
    n, d2, d3, c4: cc,
    A2: 3 / (d2 * Math.sqrt(n)),
    D3: Math.max(0, 1 - (3 * d3) / d2),
    D4: 1 + (3 * d3) / d2,
    A3: 3 / (cc * Math.sqrt(n)),
    B3: Math.max(0, 1 - 3 * r),
    B4: 1 + 3 * r,
    E2: 3 / d2,
  };
}

/* ---------- control chart computations ---------- */

/** Split a flat array into consecutive subgroups of size n (drops a ragged tail). */
export function subgroups(values, n) {
  const out = [];
  for (let i = 0; i + n <= values.length; i += n) out.push(values.slice(i, i + n));
  return out;
}

/** X̄–R chart limits from an array of subgroups (arrays of equal length). */
export function xbarR(groups) {
  const n = groups[0].length;
  const K = spcConstants(n);
  const xbars = groups.map(mean);
  const ranges = groups.map(range);
  const xbb = mean(xbars), rbar = mean(ranges);
  return {
    n, K, xbars, ranges, xbb, rbar, sigma: rbar / K.d2,
    x: { cl: xbb, ucl: xbb + K.A2 * rbar, lcl: xbb - K.A2 * rbar },
    r: { cl: rbar, ucl: K.D4 * rbar, lcl: K.D3 * rbar },
  };
}

/** X̄–s chart limits from an array of subgroups. */
export function xbarS(groups) {
  const n = groups[0].length;
  const K = spcConstants(n);
  const xbars = groups.map(mean);
  const sds = groups.map(sd);
  const xbb = mean(xbars), sbar = mean(sds);
  return {
    n, K, xbars, sds, xbb, sbar, sigma: sbar / K.c4,
    x: { cl: xbb, ucl: xbb + K.A3 * sbar, lcl: xbb - K.A3 * sbar },
    s: { cl: sbar, ucl: K.B4 * sbar, lcl: K.B3 * sbar },
  };
}

/** Individuals and moving range limits (MR of span 2, d2 = 1.128). */
export function imr(values) {
  const mrs = movingRanges(values);
  const xbar = mean(values), mrbar = mean(mrs);
  const sigma = mrbar / 1.128;
  return {
    xbar, mrbar, mrs, sigma,
    x: { cl: xbar, ucl: xbar + 3 * sigma, lcl: xbar - 3 * sigma },
    mr: { cl: mrbar, ucl: 3.267 * mrbar, lcl: 0 },
  };
}

/**
 * Tabular CUSUM (NIST §6.3.2.3).
 * S_hi(i) = max(0, S_hi(i-1) + x_i - mu0 - k), S_lo(i) = max(0, S_lo(i-1) + mu0 - k - x_i).
 * Returns arrays plus the index of each signal (S > h). `k` and `h` are in data units.
 */
export function cusum(xs, mu0, k, h) {
  const hi = [], lo = [], cum = [];
  let sh = 0, sl = 0, c = 0;
  xs.forEach((x) => {
    sh = Math.max(0, sh + x - mu0 - k);
    sl = Math.max(0, sl + mu0 - k - x);
    c += x - mu0;
    hi.push(sh); lo.push(sl); cum.push(c);
  });
  const signals = xs.map((_, i) => hi[i] > h || lo[i] > h);
  return { hi, lo, cum, signals, firstSignal: signals.indexOf(true) };
}

/**
 * EWMA statistic z_t = λ x_t + (1-λ) z_{t-1}, z_0 = target, with exact
 * time-varying limits target ± L σ √(λ/(2-λ) [1-(1-λ)^{2t}]).
 * Set `asymptotic` to use the steady-state width (as in the NIST example).
 */
export function ewma(xs, target, sigma, lambda, L = 3, asymptotic = false) {
  const z = [], ucl = [], lcl = [];
  let prev = target;
  xs.forEach((x, i) => {
    prev = lambda * x + (1 - lambda) * prev;
    const t = i + 1;
    const f = asymptotic ? 1 : 1 - (1 - lambda) ** (2 * t);
    const w = L * sigma * Math.sqrt((lambda / (2 - lambda)) * f);
    z.push(prev); ucl.push(target + w); lcl.push(target - w);
  });
  const signals = z.map((v, i) => v > ucl[i] || v < lcl[i]);
  return { z, ucl, lcl, signals };
}

/**
 * Western Electric rules on a sequence, given center line and sigma of the plotted statistic.
 * Returns, for every point, the list of rules it completes:
 *  1: one point beyond 3σ
 *  2: two of three consecutive beyond 2σ, same side
 *  3: four of five consecutive beyond 1σ, same side
 *  4: eight consecutive on one side of the center line
 * Optional trend rules (pass `trends: true`):
 *  5: six points in a row steadily increasing or decreasing
 *  6: fourteen points in a row alternating up and down
 */
export function weco(values, cl, sigma, { rules = [1, 2, 3, 4], trends = false } = {}) {
  const z = values.map((v) => (v - cl) / sigma);
  const out = values.map(() => []);
  const on = new Set(trends ? [...rules, 5, 6] : rules);
  for (let i = 0; i < z.length; i++) {
    if (on.has(1) && Math.abs(z[i]) > 3) out[i].push(1);
    for (const side of [1, -1]) {
      const beyond = (k, lim) => z[k] * side > lim;
      if (on.has(2) && i >= 2 && beyond(i, 2)) {
        const c = [i - 2, i - 1, i].filter((k) => beyond(k, 2)).length;
        if (c >= 2) out[i].push(2);
      }
      if (on.has(3) && i >= 4 && beyond(i, 1)) {
        const c = [i - 4, i - 3, i - 2, i - 1, i].filter((k) => beyond(k, 1)).length;
        if (c >= 4) out[i].push(3);
      }
      if (on.has(4) && i >= 7) {
        let all = true;
        for (let k = i - 7; k <= i; k++) if (!(z[k] * side > 0)) { all = false; break; }
        if (all) out[i].push(4);
      }
    }
    if (on.has(5) && i >= 5) {
      let up = true, down = true;
      for (let k = i - 4; k <= i; k++) { if (!(values[k] > values[k - 1])) up = false; if (!(values[k] < values[k - 1])) down = false; }
      if (up || down) out[i].push(5);
    }
    if (on.has(6) && i >= 13) {
      let alt = true;
      for (let k = i - 11; k <= i; k++) {
        const a = values[k] - values[k - 1], b = values[k - 1] - values[k - 2];
        if (!(a * b < 0)) { alt = false; break; }
      }
      if (alt) out[i].push(6);
    }
    out[i] = [...new Set(out[i])].sort();
  }
  return out;
}

export const WECO_TEXT = {
  1: 'One point beyond 3σ',
  2: 'Two of three points beyond 2σ on the same side',
  3: 'Four of five points beyond 1σ on the same side',
  4: 'Eight points in a row on one side of the center line',
  5: 'Six points in a row steadily rising or falling',
  6: 'Fourteen points in a row alternating up and down',
};

/* ---------- run length ---------- */

/** ARL of a two-sided Shewhart chart with ±L σ limits when the mean has shifted by `delta` σ. */
export function shewhartArl(delta, L = 3) {
  const p = normCdf(-L - delta) + 1 - normCdf(L - delta);
  return 1 / p;
}

/**
 * ARL of a one-sided upper CUSUM (standardized: k and h in σ units of the plotted
 * statistic) for a mean shift of `delta` σ, via the Brook–Evans Markov chain.
 */
export function cusumArl(delta, k, h, states = 120) {
  const m = states;
  const w = h / (m - 0.5);
  // state i represents S in [(i-0.5)w, (i+0.5)w), state 0 is S = 0 (plus [0, w/2)).
  const P = [];
  for (let i = 0; i < m; i++) {
    const row = new Array(m).fill(0);
    const c = i * w;
    for (let j = 0; j < m; j++) {
      if (j === 0) row[j] = normCdf(-c + k + w / 2 - delta);
      else row[j] = normCdf((j + 0.5) * w - c + k - delta) - normCdf((j - 0.5) * w - c + k - delta);
    }
    P.push(row);
  }
  // Solve (I - P) L = 1
  const A = P.map((row, i) => row.map((v, j) => (i === j ? 1 : 0) - v));
  const b = new Array(m).fill(1);
  for (let col = 0; col < m; col++) {
    let piv = col;
    for (let r = col + 1; r < m; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    [A[col], A[piv]] = [A[piv], A[col]];
    [b[col], b[piv]] = [b[piv], b[col]];
    for (let r = col + 1; r < m; r++) {
      const f = A[r][col] / A[col][col];
      if (!f) continue;
      for (let c2 = col; c2 < m; c2++) A[r][c2] -= f * A[col][c2];
      b[r] -= f * b[col];
    }
  }
  const x = new Array(m).fill(0);
  for (let r = m - 1; r >= 0; r--) {
    let s = b[r];
    for (let c2 = r + 1; c2 < m; c2++) s -= A[r][c2] * x[c2];
    x[r] = s / A[r][r];
  }
  return x[0];
}

/* ---------- random numbers (seeded, so examples are reproducible) ---------- */

export function rng(seed = 1) {
  let a = seed >>> 0;
  const uniform = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  let spare = null;
  const normal = (mu = 0, s = 1) => {
    if (spare !== null) { const v = spare; spare = null; return mu + s * v; }
    let u = 0, v = 0;
    while (u === 0) u = uniform();
    v = uniform();
    const r = Math.sqrt(-2 * Math.log(u));
    spare = r * Math.sin(2 * Math.PI * v);
    return mu + s * r * Math.cos(2 * Math.PI * v);
  };
  const poisson = (lam) => {
    if (lam > 50) return Math.max(0, Math.round(normal(lam, Math.sqrt(lam))));
    const L = Math.exp(-lam);
    let k = 0, p = 1;
    do { k++; p *= uniform(); } while (p > L);
    return k - 1;
  };
  const binomial = (n, p) => {
    let c = 0;
    for (let i = 0; i < n; i++) if (uniform() < p) c++;
    return c;
  };
  const int = (lo, hi) => lo + Math.floor(uniform() * (hi - lo + 1));
  const pick = (arr) => arr[Math.floor(uniform() * arr.length)];
  return { uniform, normal, poisson, binomial, int, pick };
}

/* ---------- formatting ---------- */

/** Fixed decimals with a real minus sign. */
export function fmt(v, d = 2) {
  if (v === null || v === undefined || Number.isNaN(v)) return '–';
  if (!Number.isFinite(v)) return v > 0 ? '∞' : '−∞';
  const s = Math.abs(v).toFixed(d);
  return (v < 0 && Number(s) !== 0 ? '−' : '') + s;
}

/** Probability shown as a readable rate: 0.0027 → "0.27%", tiny values → ppm / ppb. */
export function fmtRate(p) {
  if (p >= 0.001) return `${fmt(p * 100, p >= 0.1 ? 1 : 2)}%`;
  if (p * 1e6 >= 1) return `${fmt(p * 1e6, p * 1e6 >= 10 ? 0 : 1)} ppm`;
  return `${fmt(p * 1e9, p * 1e9 >= 10 ? 0 : 1)} ppb`;
}

/** Thousands separators, no decimals unless asked. */
export const fmtInt = (v, d = 0) => (Number.isFinite(v) ? v.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d }) : '∞');
