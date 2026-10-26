// Module 4: individuals and moving range charts.

import { Chart, dataTable } from '../chart.js';
import { rng, mean, sd, imr, c4, movingRanges, histogram, normPdf, shewhartArl, fmt, fmtInt, fmtRate } from '../stats.js';
import { bindRange, segmented, readouts, legend, $ } from '../ui.js';

/* ---------- Fig 4.1: the handbook's flow-rate example, plus your own data ---------- */
{
  const HANDBOOK = [49.6, 47.6, 49.9, 51.3, 47.8, 51.2, 52.6, 52.4, 53.6, 52.1];
  const MAX_N = 500;
  const margin = { top: 18, right: 80, bottom: 30, left: 56 };
  const ci = new Chart($('#flow-i'), { height: 250, margin });
  const cm = new Chart($('#flow-mr'), { height: 180, margin: { ...margin, bottom: 42 } });
  const msg = $('#flow-msg'), input = $('#flow-input');
  let data = HANDBOOK.slice(), own = false, dp = 1, method = 'mr', k = HANDBOOK.length, dom = null;

  function limitsFor(xs) {
    const r = imr(xs);
    const sigma = method === 's' ? sd(xs) / c4(xs.length) : r.sigma;
    return { xbar: r.xbar, mrbar: r.mrbar, mrs: r.mrs, sigma, ucl: r.xbar + 3 * sigma, lcl: r.xbar - 3 * sigma, mrUcl: 3.267 * r.mrbar };
  }

  // Axis ranges that cover every step of the slider, so the frame stays still while limits settle.
  function domains() {
    let lo = Math.min(...data), hi = Math.max(...data), mrHi = Math.max(...movingRanges(data));
    for (let j = 2; j <= data.length; j++) {
      const L = limitsFor(data.slice(0, j));
      lo = Math.min(lo, L.lcl); hi = Math.max(hi, L.ucl); mrHi = Math.max(mrHi, L.mrUcl);
    }
    const pad = (hi - lo) * 0.06;
    return { x: [lo - pad, hi + pad], mr: [0, mrHi * 1.1] };
  }

  function draw() {
    const N = data.length;
    const xs = data.slice(0, k);
    const L = limitsFor(xs);
    const xd = Math.min(4, dp + 2), ld = Math.min(4, dp + 3), lab = Math.min(3, dp + 1);
    const flags = xs.map((v) => v > L.ucl || v < L.lcl);
    const mrFlags = L.mrs.map((v) => v > L.mrUcl);
    const pts = xs.map((v, i) => [i + 1, v]);
    const mrPts = L.mrs.map((v, i) => [i + 2, v]);
    const r = N > 150 ? 2 : N > 50 ? 2.8 : 3.6;
    const noun = own ? 'Point' : 'Batch';
    const xTicks = N <= 12 ? Array.from({ length: N }, (_, i) => i + 1) : undefined;
    const tipFor = (i) => ({
      title: `${noun} ${i + 1}`,
      rows: [
        { label: own ? 'value' : 'flow rate', value: fmt(xs[i], dp) },
        { label: 'moving range', value: i ? fmt(L.mrs[i - 1], dp) : '–', key: 'alt' },
      ],
      note: flags[i] ? (xs[i] > L.ucl ? 'Above the UCL' : 'Below the LCL') : i && mrFlags[i - 1] ? 'Moving range above its UCL' : undefined,
    });

    ci.update({
      x: { domain: [0.5, N + 0.5], ticks: xTicks },
      y: { domain: dom.x, label: own ? 'Value' : 'Flow rate' },
      aria: `Individuals chart of ${k} ${own ? 'values' : 'batches'} with three-sigma limits`,
      layers: [
        { type: 'hline', y: L.ucl, cls: 'limit', label: `UCL ${fmt(L.ucl, lab)}` },
        { type: 'hline', y: L.xbar, cls: 'center', label: `CL ${fmt(L.xbar, lab)}` },
        { type: 'hline', y: L.lcl, cls: 'limit', label: `LCL ${fmt(L.lcl, lab)}` },
        { type: 'line', points: pts, cls: 'data' },
        { type: 'dots', points: pts, cls: (p, i) => (flags[i] ? 'signal' : 'dot'), r: (p, i) => (flags[i] ? r + 1 : r) },
      ],
      hover: { xs: pts.map((p) => p[0]), mark: (i) => pts[i], render: tipFor },
    });
    cm.update({
      x: { domain: [0.5, N + 0.5], ticks: xTicks, label: own ? 'Observation' : 'Batch' },
      y: { domain: dom.mr, label: 'Moving range', ticks: 3 },
      aria: `Moving range chart of the same ${k} ${own ? 'values' : 'batches'}`,
      layers: [
        { type: 'hline', y: L.mrUcl, cls: 'limit', label: `UCL ${fmt(L.mrUcl, lab)}` },
        { type: 'hline', y: L.mrbar, cls: 'center', label: `MR̄ ${fmt(L.mrbar, lab)}` },
        { type: 'line', points: mrPts, cls: 'alt' },
        { type: 'dots', points: mrPts, cls: (p, i) => (mrFlags[i] ? 'signal' : 'dot-alt'), r: (p, i) => (mrFlags[i] ? r + 1 : r) },
      ],
      hover: { xs: mrPts.map((p) => p[0]), mark: (i) => mrPts[i], render: (i) => tipFor(i + 1) },
    });

    const beyond = flags.filter(Boolean).length + mrFlags.filter(Boolean).length;
    readouts($('#flow-readouts'), [
      { label: 'Center line x̄', value: fmt(L.xbar, xd), sub: `${k} of ${N} ${own ? 'values' : 'batches'}` },
      { label: 'Average moving range', value: fmt(L.mrbar, ld), sub: `${k - 1} moving range${k === 2 ? '' : 's'}` },
      { label: 'Estimated σ', value: fmt(L.sigma, ld), sub: method === 'mr' ? 'MR̄ / 1.128' : `s / c₄, with c₄ = ${fmt(c4(k), 4)}` },
      { label: 'UCL', value: fmt(L.ucl, ld) },
      { label: 'LCL', value: fmt(L.lcl, ld) },
      { label: 'Moving range UCL', value: fmt(L.mrUcl, ld), sub: '3.267 × MR̄' },
      { label: 'Points beyond a limit', value: String(beyond), sub: 'On either chart', state: beyond ? 'signal' : 'good' },
    ]);
    dataTable($('#flow-table'), [
      { label: own ? 'Point' : 'Batch', key: 'i' },
      { label: own ? 'Value' : 'Flow rate', key: 'x', fmt: (v) => fmt(v, dp) },
      { label: 'Moving range', key: 'mr', fmt: (v) => (v === null ? '–' : fmt(v, dp)) },
      { label: 'Status', key: 'status', num: false },
    ], xs.map((v, i) => ({
      i: i + 1, x: v, mr: i ? L.mrs[i - 1] : null,
      status: flags[i] ? (v > L.ucl ? 'Above UCL' : 'Below LCL') : i && mrFlags[i - 1] ? 'MR above UCL' : 'In control',
      _cls: flags[i] || (i && mrFlags[i - 1]) ? 'is-signal' : '',
    })));
  }

  const slider = bindRange('flow-k', (v) => { k = v; draw(); }, { call: false });
  const say = (text, error = false) => { msg.textContent = text; msg.classList.toggle('is-error', error); };

  function use(values, decimals, isOwn) {
    data = values; dp = decimals; own = isOwn;
    slider.input.max = String(data.length);
    slider.value = data.length;
    k = data.length;
    dom = domains();
    draw();
  }

  function parse(text) {
    const tokens = text.replace(/[−–]/g, '-').split(/[\s,;]+/).filter(Boolean);
    if (!tokens.length) return { error: 'The box is empty. Enter at least three numbers.' };
    const bad = tokens.filter((t) => !/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t));
    if (bad.length) {
      const shown = bad.slice(0, 3).map((t) => `“${t.length > 14 ? `${t.slice(0, 14)}…` : t}”`).join(', ');
      return { error: `Could not read ${shown}${bad.length > 3 ? ` and ${bad.length - 3} more` : ''}. Use plain numbers such as 49.6, with a point for decimals.` };
    }
    const vals = tokens.map(Number);
    if (vals.some((v) => !Number.isFinite(v))) return { error: 'One of the numbers is too large to chart.' };
    if (vals.length < 3) return { error: `Enter at least three values; you entered ${vals.length}.` };
    if (vals.length > MAX_N) return { error: `This figure takes up to ${MAX_N} values; you entered ${vals.length}.` };
    if (movingRanges(vals).every((v) => v === 0)) return { error: 'Every value is the same, so every moving range is zero and the limits collapse onto the center line. Check that the values vary.' };
    const decimals = Math.min(4, Math.max(0, ...tokens.map((t) => { const m = /\.(\d+)/.exec(t.replace(/[eE].*$/, '')); return m ? m[1].length : 0; })));
    return { vals, decimals };
  }

  $('#flow-apply').addEventListener('click', () => {
    const res = parse(input.value);
    if (res.error) { say(res.error, true); return; }
    use(res.vals, res.decimals, true);
    const L = limitsFor(data);
    const out = data.filter((v) => v > L.ucl || v < L.lcl).length;
    const commaHint = /\d,\d/.test(input.value) && !input.value.includes('.') ? ' If you used commas as decimal separators, replace them with points.' : '';
    say(`Charted ${res.vals.length} values. ${out === 0 ? 'None falls outside the individuals limits.' : `${out} fall${out === 1 ? 's' : ''} outside the individuals limits.`}${commaHint}`);
  });
  $('#flow-restore').addEventListener('click', () => {
    input.value = HANDBOOK.join(', ');
    use(HANDBOOK.slice(), 1, false);
    say('Showing the handbook’s flow-rate data.');
  });
  segmented('flow-sigma', (v) => { method = v; dom = domains(); draw(); });
  legend($('#flow-legend'), [
    { label: 'Individual values', swatch: 'line', color: 'data' },
    { label: 'Moving ranges', swatch: 'line', color: 'alt' },
    { label: 'Control limits', swatch: 'dash', color: 'ink' },
    { label: 'Beyond a limit', swatch: 'dot', color: 'signal' },
  ]);
  method = $('#flow-sigma [aria-pressed="true"]')?.dataset.value ?? 'mr';
  dom = domains();
  k = Math.max(2, Math.min(data.length, Number(slider.input.value) || data.length));
  draw();
}

/* ---------- Fig 4.2: a shift inflates s, not the moving ranges ---------- */
{
  const N = 60, START = 31, MU = 32, SIG = 1.5;
  const chart = new Chart($('#mr-chart'), { height: 290, margin: { top: 24, right: 80, bottom: 40, left: 50 } });
  const est = new Chart($('#mr-curve'), { height: 290, margin: { top: 24, right: 18, bottom: 40, left: 46 } });
  const sizes = Array.from({ length: 25 }, (_, i) => i * 0.125);
  let seed = 8, kind = 'shift', size = 2, Z = [];
  const gen = () => { const R = rng(seed); Z = Array.from({ length: N }, () => R.normal()); };
  const series = (sz) => Z.map((z, i) => {
    const t = i + 1;
    const c = t < START ? 0 : kind === 'shift' ? sz : (sz * (t - START + 1)) / (N - START + 1);
    return MU + SIG * (z + c);
  });
  const estimates = (xs) => ({ mr: imr(xs).sigma, s: sd(xs) / c4(xs.length), xbar: mean(xs) });

  function draw() {
    const xs = series(size);
    const E = estimates(xs);
    const mrL = { ucl: E.xbar + 3 * E.mr, lcl: E.xbar - 3 * E.mr };
    const sL = { ucl: E.xbar + 3 * E.s, lcl: E.xbar - 3 * E.s };
    const fMR = xs.map((v) => v > mrL.ucl || v < mrL.lcl);
    const nMR = fMR.filter(Boolean).length;
    const nS = xs.filter((v) => v > sL.ucl || v < sL.lcl).length;
    const pts = xs.map((v, i) => [i + 1, v]);
    const all = [...xs, mrL.ucl, mrL.lcl, sL.ucl, sL.lcl];
    const layers = [
      { type: 'hline', y: sL.ucl, cls: 'alt', label: `${fmt(sL.ucl, 1)} (s)` },
      { type: 'hline', y: sL.lcl, cls: 'alt', label: `${fmt(sL.lcl, 1)} (s)` },
      { type: 'hline', y: mrL.ucl, cls: 'limit', label: `UCL ${fmt(mrL.ucl, 1)}` },
      { type: 'hline', y: mrL.lcl, cls: 'limit', label: `LCL ${fmt(mrL.lcl, 1)}` },
      { type: 'hline', y: E.xbar, cls: 'center' },
      { type: 'line', points: pts, cls: 'data-thin' },
      { type: 'dots', points: pts, cls: (p, i) => (fMR[i] ? 'signal' : 'dot'), r: (p, i) => (fMR[i] ? 4.5 : 3) },
    ];
    if (size > 0) layers.push({ type: 'vline', x: START - 0.5, cls: 'shift', label: kind === 'shift' ? 'Step starts' : 'Drift starts', anchor: 'start' });
    chart.update({
      x: { domain: [0.5, N + 0.5], label: 'Day' },
      y: { domain: [Math.min(...all) - 0.8, Math.max(...all) + 0.14 * (Math.max(...all) - Math.min(...all))], label: 'Strength (MPa)' },
      aria: 'Individuals chart of concrete strength with limits from moving ranges and from the overall standard deviation',
      layers,
      hover: {
        xs: pts.map((p) => p[0]), mark: (i) => pts[i],
        render: (i) => ({
          title: `Day ${i + 1}`,
          rows: [{ label: 'MPa', value: fmt(xs[i], 1) }, { label: 'moving range', value: i ? fmt(Math.abs(xs[i] - xs[i - 1]), 1) : '–', key: 'none' }],
          note: fMR[i] ? 'Beyond the moving-range limits' : undefined,
        }),
      },
    });

    const curves = sizes.map((sz) => estimates(series(sz)));
    const mrLine = sizes.map((sz, i) => [sz, curves[i].mr]);
    const sLine = sizes.map((sz, i) => [sz, curves[i].s]);
    const ys = [...mrLine, ...sLine].map((p) => p[1]);
    est.update({
      x: { domain: [0, 3], label: 'Size of the change (σ)', ticks: [0, 1, 2, 3] },
      y: { domain: [Math.min(SIG, ...ys) * 0.85, Math.max(...ys) * 1.08], label: 'Estimate of σ (MPa)' },
      aria: 'Two estimates of sigma against the size of the change: the s-based estimate rises, the moving-range estimate stays flat',
      layers: [
        { type: 'hline', y: SIG, cls: 'center', label: undefined },
        { type: 'text', x: 2.95, y: SIG, dy: 15, anchor: 'end', text: 'True σ = 1.5', cls: 'label' },
        { type: 'vline', x: size, cls: 'marker' },
        { type: 'line', points: mrLine, cls: 'ink dashed' },
        { type: 'line', points: sLine, cls: 'alt' },
        { type: 'dots', points: [[size, E.mr]], cls: 'dot-ink', r: 4.5 },
        { type: 'dots', points: [[size, E.s]], cls: 'dot-alt', r: 4.5 },
      ],
      hover: {
        xs: sizes, mark: (i) => sLine[i],
        render: (i) => ({
          title: `Change of ${fmt(sizes[i], 3)}σ (${fmt(sizes[i] * SIG, 2)} MPa)`,
          rows: [{ label: 's / c₄', value: fmt(sLine[i][1], 2), key: 'alt' }, { label: 'MR̄ / 1.128', value: fmt(mrLine[i][1], 2), key: 'ink' }],
        }),
      },
    });

    readouts($('#mr-readouts'), [
      { label: 'True short-term σ', value: `${fmt(SIG, 2)} MPa` },
      { label: 'MR̄ / 1.128', value: `${fmt(E.mr, 2)} MPa`, sub: `${E.mr >= SIG ? '+' : '−'}${fmt(Math.abs(100 * (E.mr / SIG - 1)), 0)}% from the truth` },
      { label: 's / c₄', value: `${fmt(E.s, 2)} MPa`, sub: `${E.s >= SIG ? '+' : '−'}${fmt(Math.abs(100 * (E.s / SIG - 1)), 0)}% from the truth` },
      { label: 'Beyond the moving-range limits', value: String(nMR), state: nMR ? 'signal' : undefined },
      { label: 'Beyond the s limits', value: String(nS), state: nS ? 'signal' : undefined },
    ]);
  }

  legend($('#mr-legend'), [
    { label: 'Daily strength', swatch: 'line', color: 'data' },
    { label: 'Moving-range limits and estimate', swatch: 'dash', color: 'ink' },
    { label: 's / c₄ limits and estimate', swatch: 'line', color: 'alt' },
    { label: 'Beyond the moving-range limits', swatch: 'dot', color: 'signal' },
  ]);
  segmented('mr-change', (v) => { kind = v; draw(); });
  bindRange('mr-size', (v) => { size = v; draw(); }, { call: false, format: (v) => (v === 0 ? 'none' : `${fmt(v * SIG, 2)} MPa (${v.toFixed(2)}σ)`) });
  $('#mr-new').addEventListener('click', () => { seed += 1; gen(); draw(); });
  kind = $('#mr-change [aria-pressed="true"]')?.dataset.value ?? 'shift';
  size = Number($('#mr-size').value);
  gen();
  draw();
}

/* ---------- Fig 4.3: skewed data and false alarms ---------- */
{
  const LONG = 200000, SHOW = 100, BINS = 60;
  const SHAPES = {
    normal: { f: (z) => 40 + 10 * z, name: 'Normal' },
    mild: { f: (z) => 40 * Math.exp(0.25 * z), name: 'Moderately skewed' },
    strong: { f: (z) => 40 * Math.exp(0.5 * z), name: 'Strongly skewed' },
  };
  const run = new Chart($('#skew-run'), { height: 280, margin: { top: 22, right: 76, bottom: 40, left: 50 } });
  const hist = new Chart($('#skew-hist'), { height: 280, margin: { top: 22, right: 18, bottom: 40, left: 18 } });
  const cache = new Map();
  let shape = 'normal', seed = 31;

  // Long-run behavior of each shape, computed once: limits, false-alarm rates and a histogram.
  function longRun(key) {
    if (cache.has(key)) return cache.get(key);
    const R = rng(9);
    const { f } = SHAPES[key];
    const xs = Array.from({ length: LONG }, () => f(R.normal()));
    const r = imr(xs);
    const above = xs.filter((v) => v > r.x.ucl).length / LONG;
    const below = xs.filter((v) => v < r.x.lcl).length / LONG;
    const sorted = xs.slice().sort((a, b) => a - b);
    const q = (p) => sorted[Math.floor(p * (LONG - 1))];
    const lo0 = Math.min(r.x.lcl, q(0.0005)), hi0 = Math.max(r.x.ucl, q(0.9995));
    const pad = (hi0 - lo0) * 0.04;
    const lo = lo0 - pad, hi = hi0 + pad;
    const bins = histogram(xs, lo, hi, BINS);
    const w = (hi - lo) / BINS;
    const out = { r, above, below, lo, hi, w, bins: bins.map((b) => ({ ...b, y: b.count / (LONG * w) })) };
    cache.set(key, out);
    return out;
  }
  const rate = (p) => (p === 0 ? 'None' : fmtRate(p));

  function draw() {
    const S = longRun(shape);
    const { ucl, lcl, cl } = S.r.x;
    const R = rng(seed);
    const xs = Array.from({ length: SHOW }, () => SHAPES[shape].f(R.normal()));
    const flags = xs.map((v) => v > ucl || v < lcl);
    const pts = xs.map((v, i) => [i + 1, v]);
    const all = [...xs, ucl, lcl];
    const pad = (Math.max(...all) - Math.min(...all)) * 0.06;
    run.update({
      x: { domain: [0.5, SHOW + 0.5], label: 'Lot' },
      y: { domain: [Math.min(...all) - pad, Math.max(...all) + pad], label: 'Impurity (ppm)' },
      aria: `${SHAPES[shape].name} impurity data for 100 lots with individuals chart limits`,
      layers: [
        { type: 'hline', y: ucl, cls: 'limit', label: `UCL ${fmt(ucl, 1)}` },
        { type: 'hline', y: cl, cls: 'center', label: `CL ${fmt(cl, 1)}` },
        { type: 'hline', y: lcl, cls: 'limit', label: `LCL ${fmt(lcl, 1)}` },
        { type: 'line', points: pts, cls: 'data-thin' },
        { type: 'dots', points: pts, cls: (p, i) => (flags[i] ? 'signal' : 'dot'), r: (p, i) => (flags[i] ? 4.5 : 2.8) },
      ],
      hover: {
        xs: pts.map((p) => p[0]), mark: (i) => pts[i],
        render: (i) => ({ title: `Lot ${i + 1}`, rows: [{ label: 'ppm', value: fmt(xs[i], 1) }], note: flags[i] ? 'False alarm: the process has not changed' : undefined }),
      },
    });

    const curve = [];
    for (let i = 0; i <= 200; i++) { const x = S.lo + ((S.hi - S.lo) * i) / 200; curve.push([x, normPdf(x, cl, S.r.sigma)]); }
    const ymax = Math.max(...S.bins.map((b) => b.y), ...curve.map((p) => p[1])) * 1.25;
    hist.update({
      x: { domain: [S.lo, S.hi], label: 'Impurity (ppm)', ticks: 5 },
      y: { domain: [0, ymax], axis: false, grid: false },
      aria: `Long-run distribution of ${SHAPES[shape].name.toLowerCase()} impurity data with the normal curve the limits assume`,
      layers: [
        { type: 'bars', bars: S.bins.map((b) => { const mid = (b.x0 + b.x1) / 2; return { x0: b.x0, x1: b.x1, y: b.y, cls: mid > ucl || mid < lcl ? 'bar-signal' : 'bar' }; }) },
        { type: 'line', points: curve, cls: 'curve' },
        { type: 'vline', x: lcl, cls: 'limit', label: `LCL ${fmt(lcl, 1)}`, anchor: 'start' },
        { type: 'vline', x: ucl, cls: 'limit', label: `UCL ${fmt(ucl, 1)}`, anchor: 'start' },
      ],
    });

    const total = S.above + S.below;
    const shown = flags.filter(Boolean).length;
    readouts($('#skew-readouts'), [
      { label: 'Above the UCL', value: rate(S.above), sub: 'Normal theory: 0.135%' },
      { label: 'Below the LCL', value: rate(S.below), sub: lcl < 0 ? `LCL is ${fmt(lcl, 1)} ppm, below zero` : 'Normal theory: 0.135%' },
      { label: 'Total false-alarm rate', value: rate(total), sub: total > 0 ? `${fmt(total / 0.0027, 1)} times the normal 0.27%` : '', state: total > 0.004 ? 'signal' : 'good' },
      { label: 'Lots to a false alarm, on average', value: total > 0 ? fmtInt(1 / total) : '∞', sub: 'Normal theory: 370' },
      { label: 'False alarms among these 100 lots', value: String(shown), state: shown ? 'signal' : undefined },
    ]);
  }

  legend($('#skew-legend'), [
    { label: 'Impurity per lot', swatch: 'line', color: 'data' },
    { label: 'Limits from moving ranges', swatch: 'dash', color: 'ink' },
    { label: 'Normal curve the limits assume', swatch: 'line', color: 'ink' },
    { label: 'Beyond the limits', swatch: 'box', color: 'signal' },
  ]);
  segmented('skew-shape', (v) => { shape = v; draw(); });
  $('#skew-new').addEventListener('click', () => { seed += 1; draw(); });
  shape = $('#skew-shape [aria-pressed="true"]')?.dataset.value ?? 'normal';
  draw();
}

/* ---------- Fig 4.4: ARL of individuals versus X̄ charts ---------- */
{
  const chart = new Chart($('#arl-chart'), { height: 300, margin: { top: 20, right: 30, bottom: 42, left: 56 } });
  const ds = Array.from({ length: 151 }, (_, i) => i * 0.02);
  const hoverDs = Array.from({ length: 61 }, (_, i) => i * 0.05);
  let n = 4, delta = 1, count = 'points';
  const fmtArl = (v) => (v >= 100 ? fmtInt(v) : fmt(v, 1));

  function draw() {
    const mult = count === 'meas' ? n : 1;
    const arlI = (d) => shewhartArl(d);
    const arlX = (d) => shewhartArl(d * Math.sqrt(n)) * mult;
    const ind = ds.map((d) => [d, Math.log10(arlI(d))]);
    const xb = ds.map((d) => [d, Math.log10(arlX(d))]);
    const top = Math.log10(shewhartArl(0) * mult) + 0.2;
    const aI = arlI(delta), aX = arlX(delta);
    const unit = count === 'meas' ? 'measurements' : 'points';
    chart.update({
      x: { domain: [0, 3], label: 'Shift in the mean, in units of σ for single values', format: (v) => `${fmt(v, Number.isInteger(v) ? 0 : 1)}σ` },
      y: { domain: [0, top], ticks: [0, 1, 2, 3].filter((t) => t <= top), format: (v) => fmtInt(10 ** v), label: `Average ${unit} to a signal (log scale)` },
      aria: `Average run length of an individuals chart and an X-bar chart with subgroups of ${n}, against the size of the shift, counted in ${unit}`,
      layers: [
        { type: 'vline', x: delta, cls: 'marker' },
        { type: 'line', points: ind, cls: 'data' },
        { type: 'line', points: xb, cls: 'alt' },
        { type: 'dots', points: [[delta, Math.log10(aI)]], cls: 'dot', r: 4.5 },
        { type: 'dots', points: [[delta, Math.log10(aX)]], cls: 'dot-alt', r: 4.5 },
      ],
      hover: {
        xs: hoverDs, mark: (i) => [hoverDs[i], Math.log10(arlI(hoverDs[i]))],
        render: (i) => ({
          title: `Shift of ${fmt(hoverDs[i], 2)}σ`,
          rows: [
            { label: `${unit}, individuals`, value: fmtArl(arlI(hoverDs[i])) },
            { label: `${unit}, X̄ with n = ${n}`, value: fmtArl(arlX(hoverDs[i])), key: 'alt' },
          ],
        }),
      },
    });
    legend($('#arl-legend'), [
      { label: 'Individuals chart', swatch: 'line', color: 'data' },
      { label: `X̄ chart, subgroups of ${n}`, swatch: 'line', color: 'alt' },
    ]);
    const third = delta === 0
      ? { label: 'With no shift', value: count === 'meas' ? `X̄ waits ${n}× longer` : 'Equal', sub: 'Both are waits for a false alarm' }
      : { label: 'Quicker to signal', value: aI < aX ? 'Individuals' : 'X̄ chart', sub: `${fmt(Math.max(aI, aX) / Math.min(aI, aX), 1)} times faster, counted in ${unit}` };
    readouts($('#arl-readouts'), [
      { label: 'Individuals chart', value: fmtArl(aI), sub: `${unit} on average` },
      { label: `X̄ chart, n = ${n}`, value: fmtArl(aX), sub: count === 'meas' ? `measurements, or ${fmtArl(aX / n)} subgroups` : 'subgroups on average' },
      third,
    ]);
  }

  bindRange('arl-n', (v) => { n = v; draw(); }, { call: false });
  bindRange('arl-shift', (v) => { delta = v; draw(); }, { call: false, format: (v) => (v === 0 ? 'none' : `${v.toFixed(2)}σ`) });
  segmented('arl-count', (v) => { count = v; draw(); });
  n = Number($('#arl-n').value);
  delta = Number($('#arl-shift').value);
  count = $('#arl-count [aria-pressed="true"]')?.dataset.value ?? 'points';
  draw();
}
