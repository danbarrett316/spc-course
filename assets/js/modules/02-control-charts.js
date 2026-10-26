// Module 2: how control charts work.

import { Chart } from '../chart.js';
import { rng, mean, normPdf, normCdf, weco, WECO_TEXT, fmt, fmtRate, fmtInt, quantile } from '../stats.js';
import { bindRange, readouts, legend, $ } from '../ui.js';

/* ---------- Fig 2.1: anatomy ---------- */
{
  const CL = 25.0, S = 0.004;
  const R = rng(31);
  const ys = Array.from({ length: 25 }, (_, i) => (i === 17 ? CL + 3.4 * S : CL + R.normal(0, S * 0.85)));
  const flags = weco(ys, CL, S, { rules: [1] });
  const pts = ys.map((y, i) => [i + 1, y, flags[i]]);
  const chart = new Chart($('#anatomy-chart'), { height: 280, margin: { top: 18, right: 92, bottom: 40, left: 64 } });
  chart.update({
    x: { domain: [0.5, 25.5], label: 'Hour' },
    y: { domain: [CL - 4.2 * S, CL + 4.2 * S], label: 'mm', format: (v) => v.toFixed(3), ticks: [24.985, 24.99, 24.995, 25, 25.005, 25.01, 25.015] },
    aria: 'Control chart of hourly average shaft diameter with center line at 25.000 mm and limits at 24.988 and 25.012 mm; hour 18 is above the upper limit',
    layers: [
      { type: 'zones', cl: CL, sigma: S },
      { type: 'hline', y: CL + 3 * S, cls: 'limit', label: 'UCL 25.012' },
      { type: 'hline', y: CL, cls: 'center', label: 'CL 25.000' },
      { type: 'hline', y: CL - 3 * S, cls: 'limit', label: 'LCL 24.988' },
      { type: 'line', points: pts, cls: 'data' },
      { type: 'dots', points: pts, cls: (p) => (p[2].length ? 'signal' : 'dot') },
      { type: 'annot', x: 18, y: ys[17], text: 'Beyond the UCL: investigate', dx: 16, dy: -8, cls: 'label-signal' },
    ],
    hover: {
      xs: pts.map((p) => p[0]), mark: (i) => pts[i],
      render: (i) => ({
        title: `Hour ${i + 1}`,
        rows: [{ label: 'mm (average of 4)', value: ys[i].toFixed(4) }, { label: 'σ from center', value: fmt((ys[i] - CL) / S, 2), key: 'none' }],
        note: pts[i][2].length ? 'Above the upper control limit' : undefined,
      }),
    },
  });
  legend($('#anatomy-legend'), [
    { label: 'Subgroup average', swatch: 'line', color: 'data' },
    { label: 'Center line', swatch: 'line', color: 'ink' },
    { label: 'Control limits (±3σ)', swatch: 'dash', color: 'ink' },
    { label: 'Out-of-control point', swatch: 'dot', color: 'signal' },
  ]);
}

/* ---------- Fig 2.2: false alarms vs missed shifts ---------- */
{
  const chart = new Chart($('#tradeoff-chart'), { height: 260, margin: { top: 22, right: 24, bottom: 40, left: 24 } });
  let k = 3, d = 1;
  const curve = (mu) => { const out = []; for (let x = -4.6; x <= 6.6; x += 0.04) out.push([x, normPdf(x, mu, 1)]); return out; };
  const slice = (pts, lo, hi) => pts.filter((p) => p[0] >= lo && p[0] <= hi);

  function draw() {
    const base = curve(0), shifted = curve(d);
    const alpha = 2 * normCdf(-k);
    const detect = normCdf(-k - d) + 1 - normCdf(k - d);
    chart.update({
      x: { domain: [-4.6, 6.6], ticks: [-4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6], format: (v) => (v === 0 ? 'CL' : `${v > 0 ? '+' : '−'}${Math.abs(v)}σ`) },
      y: { domain: [0, 0.46], axis: false, grid: false },
      aria: `Normal curves for the in-control and shifted process with limits at plus and minus ${k} sigma`,
      layers: [
        { type: 'area', points: slice(shifted, k, 7), base: 0, cls: 'area-alt' },
        { type: 'area', points: slice(shifted, -5, -k), base: 0, cls: 'area-alt' },
        { type: 'area', points: slice(base, k, 7), base: 0, cls: 'area-signal' },
        { type: 'area', points: slice(base, -5, -k), base: 0, cls: 'area-signal' },
        { type: 'line', points: base, cls: 'ink' },
        { type: 'line', points: shifted, cls: d > 0 ? 'alt' : 'faint' },
        { type: 'vline', x: -k, cls: 'marker', label: 'LCL', anchor: 'end' },
        { type: 'vline', x: k, cls: 'marker', label: 'UCL', anchor: 'start' },
        { type: 'text', x: 0, y: 0.415, text: 'In control', anchor: 'middle', cls: 'label' },
        ...(d >= 0.6 ? [{ type: 'text', x: d, y: 0.37, text: `Shifted ${fmt(d, 1)}σ`, anchor: 'middle', cls: 'label' }] : []),
      ],
    });
    readouts($('#tradeoff-readouts'), [
      { label: 'False alarms per point', value: fmtRate(alpha), sub: `1 in ${fmtInt(1 / alpha)}` },
      { label: 'In-control ARL', value: fmtInt(1 / alpha), sub: 'points between false alarms' },
      { label: 'Chance a point catches the shift', value: d > 0 ? fmtRate(detect) : '–' },
      { label: 'ARL after the shift', value: d > 0 ? fmtInt(1 / detect, 1 / detect < 10 ? 1 : 0) : '–', sub: d > 0 ? 'points until detection' : 'set a shift to see it' },
    ]);
  }
  bindRange('to-k', (v) => { k = v; draw(); }, { format: (v) => `${v.toFixed(2)}σ` });
  bindRange('to-shift', (v) => { d = v; draw(); }, { format: (v) => `${v.toFixed(1)}σ` });
  legend($('#tradeoff-legend'), [
    { label: 'In-control process', swatch: 'line', color: 'ink' },
    { label: 'Shifted process', swatch: 'line', color: 'alt' },
    { label: 'False alarm (α)', swatch: 'box', color: 'signal' },
    { label: 'Detection (1 − β)', swatch: 'box', color: 'alt' },
  ]);
}

/* ---------- Fig 2.3: ARL and the run-length distribution ---------- */
{
  const curve = new Chart($('#arl-curve'), { height: 250, margin: { top: 18, right: 20, bottom: 40, left: 46 } });
  const hist = new Chart($('#arl-hist'), { height: 250, margin: { top: 18, right: 20, bottom: 40, left: 46 } });
  const pOf = (d) => normCdf(-3 - d) + 1 - normCdf(3 - d);
  let d = 0, seed = 1, runs = [];

  function simulate(count) {
    const R = rng(seed++ * 7919 + Math.round(d * 100));
    const p = pOf(d);
    for (let i = 0; i < count; i++) runs.push(Math.max(1, Math.ceil(Math.log(1 - R.uniform()) / Math.log(1 - p))));
  }

  function draw() {
    const pts = [];
    for (let x = 0; x <= 3.001; x += 0.05) pts.push([x, Math.log10(1 / pOf(x))]);
    const arl = 1 / pOf(d);
    curve.update({
      x: { domain: [0, 3], label: 'Shift (σ)', ticks: [0, 0.5, 1, 1.5, 2, 2.5, 3] },
      y: { domain: [0, 2.8], label: 'ARL (log scale)', ticks: [0, 1, 2], format: (v) => String(10 ** v) },
      aria: 'Average run length of a three-sigma chart against the size of the shift',
      layers: [
        { type: 'hline', y: Math.log10(370.4), cls: 'limit-soft' },
        { type: 'line', points: pts, cls: 'data' },
        { type: 'dots', points: [[d, Math.log10(arl)]], cls: 'dot', r: 5 },
        { type: 'annot', x: d, y: Math.log10(arl), text: `ARL ${fmtInt(arl, arl < 10 ? 1 : 0)}`, dx: 14, dy: d < 0.5 ? 26 : -14 },
      ],
      hover: {
        xs: pts.map((p) => p[0]), mark: (i) => pts[i],
        render: (i) => ({ title: `Shift ${fmt(pts[i][0], 2)}σ`, rows: [{ label: 'ARL', value: fmtInt(10 ** pts[i][1], 10 ** pts[i][1] < 10 ? 1 : 0) }] }),
      },
    });

    const cap = Math.max(5, quantile(runs, 0.97));
    const k = Math.min(32, Math.max(6, Math.ceil(cap)));
    const w = cap / k;
    const bins = Array.from({ length: k }, (_, i) => ({ x0: i * w, x1: (i + 1) * w, y: 0 }));
    for (const r of runs) { const i = Math.floor((r - 0.0001) / w); if (i < k) bins[i].y++; }
    const sorted = [...runs].sort((a, b) => a - b);
    const med = sorted[Math.floor(sorted.length / 2)];
    const avg = mean(runs);
    hist.update({
      x: { domain: [0, cap], label: 'Points until the first signal' },
      y: { domain: [0, Math.max(...bins.map((b) => b.y)) * 1.15], label: 'Charts' },
      aria: 'Histogram of simulated run lengths',
      layers: [
        { type: 'bars', bars: bins, cls: 'bar' },
        { type: 'vline', x: med, cls: 'marker', label: `median ${fmtInt(med)}`, labelY: Math.max(...bins.map((b) => b.y)) * 1.05 },
        { type: 'vline', x: avg, cls: 'shift', label: `mean ${fmtInt(avg)}`, labelY: Math.max(...bins.map((b) => b.y)) * 0.85 },
      ],
      hover: {
        xs: bins.map((b) => (b.x0 + b.x1) / 2),
        render: (i) => ({ title: `${fmtInt(Math.ceil(bins[i].x0) || 1)}–${fmtInt(Math.floor(bins[i].x1))} points`, rows: [{ label: 'charts', value: fmtInt(bins[i].y) }] }),
      },
    });
    readouts($('#arl-readouts'), [
      { label: 'Exact ARL', value: fmtInt(arl, arl < 10 ? 1 : 0), sub: `p = ${fmtRate(pOf(d))} per point` },
      { label: 'Simulated mean', value: fmtInt(avg, avg < 10 ? 1 : 0) },
      { label: 'Simulated median', value: fmtInt(med) },
      { label: 'Charts simulated', value: fmtInt(runs.length) },
    ]);
  }
  bindRange('arl-shift', (v) => { d = v; runs = []; simulate(2000); draw(); }, { format: (v) => `${v.toFixed(2)}σ` });
  $('#arl-sim').addEventListener('click', () => { simulate(2000); draw(); });
}

/* ---------- Fig 2.4: the rules, as small multiples ---------- */

/** Indices that make up the pattern completed at index i for a given rule. */
function patternPoints(values, cl, s, rule, i) {
  const z = values.map((v) => (v - cl) / s);
  const side = Math.sign(z[i]) || 1;
  const range = (a, b) => Array.from({ length: b - a + 1 }, (_, k) => a + k).filter((k) => k >= 0);
  if (rule === 1) return [i];
  if (rule === 2) return range(i - 2, i).filter((k) => z[k] * side > 2);
  if (rule === 3) return range(i - 4, i).filter((k) => z[k] * side > 1);
  if (rule === 4) return range(i - 7, i);
  if (rule === 5) return range(i - 5, i);
  if (rule === 6) return range(i - 13, i);
  return [i];
}

{
  const EX = {
    1: [0.3, -0.5, 0.8, -0.2, 0.4, 3.4, 0.1, -0.6],
    2: [0.2, -0.4, 0.5, 2.4, 0.9, 2.6, 0.3, -0.2],
    3: [-0.3, 0.2, 1.3, 1.6, 0.4, 1.2, 1.5, -0.2],
    4: [-0.6, 0.4, 0.7, 0.3, 0.9, 0.2, 0.6, 0.5, 0.8, -0.3],
    5: [0.4, -0.8, -0.6, -0.2, 0.3, 0.7, 1.2, 0.5, 0.1],
    6: [0.5, -0.4, 0.6, -0.5, 0.4, -0.6, 0.7, -0.3, 0.5, -0.6, 0.4, -0.5, 0.6, -0.4],
  };
  const grid = $('#rules-grid');
  for (const r of [1, 2, 3, 4, 5, 6]) {
    const vals = EX[r];
    const flags = weco(vals, 0, 1, { rules: [1, 2, 3, 4], trends: true });
    const first = flags.findIndex((f) => f.includes(r));
    const red = new Set(first >= 0 ? patternPoints(vals, 0, 1, r, first) : []);
    const box = document.createElement('div');
    box.className = 'mini';
    const h = document.createElement('h4');
    h.innerHTML = `<span class="n">Rule ${r}</span><span></span>`;
    h.lastChild.textContent = r <= 4 ? 'Western Electric' : 'Trend rule';
    const host = document.createElement('div');
    const p = document.createElement('p');
    p.textContent = WECO_TEXT[r];
    box.append(h, host, p);
    grid.append(box);
    const pts = vals.map((v, i) => [i + 1, v]);
    new Chart(host, { height: 128, margin: { top: 6, right: 8, bottom: 8, left: 8 } }).update({
      height: 128,
      x: { domain: [0.3, vals.length + 0.7], axis: false },
      y: { domain: [-3.9, 3.9], axis: false, grid: false },
      aria: `Example of rule ${r}: ${WECO_TEXT[r]}`,
      layers: [
        { type: 'zones', cl: 0, sigma: 1, labels: false },
        { type: 'hline', y: 3, cls: 'limit' }, { type: 'hline', y: 0, cls: 'center' }, { type: 'hline', y: -3, cls: 'limit' },
        { type: 'line', points: pts, cls: 'data-thin' },
        { type: 'dots', points: pts, cls: (q, i) => (red.has(i) ? 'signal' : 'dot'), r: (q, i) => (red.has(i) ? 4 : 3) },
      ],
    });
  }
}

/* ---------- Fig 2.5: spot the signal ---------- */
{
  const CL = 50, S = 1.5, N = 25;
  const RULES = { rules: [1, 2, 3, 4], trends: false };
  const chart = new Chart($('#game-chart'), { height: 270, margin: { top: 18, right: 76, bottom: 40, left: 46 } });
  const msg = $('#game-msg'), score = $('#game-score');
  let R = rng(77);
  let game = null;
  let right = 0, played = 0;

  const firstFlag = (zs) => {
    const fl = weco(zs, 0, 1, RULES);
    for (let i = 0; i < fl.length; i++) {
      const ruled = fl[i].filter((r) => r !== 5 && r !== 6);
      // trend rule 5 is checked separately so it only fires when a trend scenario is planted
      if (ruled.length) return { i, rule: ruled[0] };
    }
    return null;
  };
  const trendAt = (zs) => {
    const fl = weco(zs, 0, 1, { rules: [], trends: true });
    const i = fl.findIndex((f) => f.includes(5));
    return i >= 0 ? { i, rule: 5 } : null;
  };

  function makeGame() {
    const kinds = ['none', 'none', 1, 2, 3, 4, 5];
    for (let attempt = 0; attempt < 400; attempt++) {
      const kind = R.pick(kinds);
      const z = Array.from({ length: N }, () => R.normal(0, 0.9));
      const j = R.int(9, 17);
      if (kind === 1) z[j] = (R.uniform() < 0.5 ? 1 : -1) * (3.25 + R.uniform() * 0.6);
      if (kind === 2) { const s = R.uniform() < 0.5 ? 1 : -1; z[j] = s * (2.15 + R.uniform() * 0.6); z[j + 1] = s * R.uniform() * 1.2; z[j + 2] = s * (2.15 + R.uniform() * 0.6); }
      if (kind === 3) { const s = R.uniform() < 0.5 ? 1 : -1; for (let k = j; k < j + 7 && k < N; k++) z[k] = s * 1.35 + R.normal(0, 0.45); }
      if (kind === 4) { const s = R.uniform() < 0.5 ? 1 : -1; for (let k = j - 3; k < N; k++) z[k] = s * 0.85 + R.normal(0, 0.45); }
      if (kind === 5) { const s = R.uniform() < 0.5 ? 1 : -1; const b = z[j - 1]; for (let k = 0; k < 7; k++) z[j + k] = b + s * 0.42 * (k + 1) + R.normal(0, 0.05); }
      const f = firstFlag(z);
      const t = trendAt(z);
      if (kind === 'none') { if (!f && !t) return { z, kind, f: null }; continue; }
      if (kind === 5) { if (t && (!f || f.i > t.i) && t.i >= j) return { z, kind, f: t }; continue; }
      if (t && (!f || t.i <= f.i)) continue;
      if (f && f.rule === kind && f.i >= j - 3) return { z, kind, f };
    }
    return { z: Array(N).fill(0), kind: 'none', f: null };
  }

  function draw(reveal) {
    const ys = game.z.map((v) => CL + S * v);
    const red = new Set(reveal && game.f ? patternPoints(ys, CL, S, game.f.rule, game.f.i) : []);
    const pts = ys.map((y, i) => [i + 1, y]);
    const layers = [
      { type: 'zones', cl: CL, sigma: S },
      { type: 'hline', y: CL + 3 * S, cls: 'limit', label: 'UCL 54.5' },
      { type: 'hline', y: CL, cls: 'center', label: 'CL 50.0' },
      { type: 'hline', y: CL - 3 * S, cls: 'limit', label: 'LCL 45.5' },
      { type: 'line', points: pts, cls: 'data-thin' },
      { type: 'dots', points: pts, cls: (p, i) => (red.has(i) ? 'signal' : game.pick === i ? 'dot-ink' : 'dot'), r: (p, i) => (red.has(i) || game.pick === i ? 5 : 3.6) },
    ];
    if (reveal && game.f) layers.push({ type: 'annot', x: game.f.i + 1, y: ys[game.f.i], text: `Rule ${game.f.rule}`, dx: 14, dy: game.z[game.f.i] > 0 ? -16 : 26, cls: 'label-signal' });
    chart.update({
      x: { domain: [0.5, N + 0.5], label: 'Sample' },
      y: { domain: [CL - 4.1 * S, CL + 4.1 * S], label: 'Coating thickness, µm' },
      aria: 'Practice control chart: find the first point that completes a run rule',
      layers,
      hover: {
        xs: pts.map((p) => p[0]), mark: (i) => pts[i],
        render: (i) => ({ title: `Sample ${i + 1}`, rows: [{ label: 'µm', value: fmt(ys[i], 2) }, { label: 'σ from center', value: fmt(game.z[i], 2), key: 'none' }] }),
        onClick: (i) => answer(i),
      },
    });
  }

  function setMsg(text, cls) { msg.textContent = text; msg.className = `game-msg${cls ? ` ${cls}` : ''}`; }

  function answer(i) {
    if (game.done) return;
    game.done = true;
    game.pick = i;
    played++;
    let ok;
    if (i === null) ok = !game.f;
    else ok = !!game.f && patternPoints(game.z.map((v) => CL + S * v), CL, S, game.f.rule, game.f.i).includes(i);
    if (ok) right++;
    const what = game.f ? `Rule ${game.f.rule} (${WECO_TEXT[game.f.rule].toLowerCase()}) completes at sample ${game.f.i + 1}.` : 'This chart is in control: no rule fires.';
    if (ok) setMsg(`Correct. ${what}`, 'is-correct');
    else if (i === null) setMsg(`Not quite. ${what}`, 'is-wrong');
    else setMsg(`Not quite. ${game.f ? what : 'Sample ' + (i + 1) + ' is ordinary noise. ' + what}`, 'is-wrong');
    score.textContent = `${right} of ${played} correct`;
    draw(true);
  }

  function next() {
    game = { ...makeGame(), done: false, pick: null };
    setMsg('Click the first point that completes a rule, or choose “No signal”.');
    draw(false);
  }
  $('#game-none').addEventListener('click', () => answer(null));
  $('#game-next').addEventListener('click', next);
  legend($('#game-legend'), [
    { label: 'Sample', swatch: 'line', color: 'data' },
    { label: 'Limits at ±3σ', swatch: 'dash', color: 'ink' },
    { label: 'Pattern that triggers a rule', swatch: 'dot', color: 'signal' },
  ]);
  next();
}

/* ---------- Fig 2.6: Phase I clean-up, then Phase II ---------- */
{
  const MU = 1650, SD = 12;
  const LOG = {
    9: 'Lab log, day 9: coupon cut from the end of a coil that had been re-annealed. Real cause, so exclude it.',
    21: 'Lab log, day 21: the grips slipped and the operator noted a partial break. Real cause, so exclude it.',
  };
  const chart = new Chart($('#phase-chart'), { height: 290, margin: { top: 18, right: 92, bottom: 40, left: 54 } });
  const msg = $('#phase-msg'), goBtn = $('#phase-go');
  let base, phase2, excluded, frozen;

  function reset() {
    const R = rng(1924);
    base = Array.from({ length: 30 }, () => R.normal(MU, SD));
    base[8] = MU + 58;
    base[20] = MU - 62;
    base[25] = MU + 3.4 * SD;
    phase2 = Array.from({ length: 30 }, (_, i) => R.normal(MU + (i >= 14 ? 1.5 * SD : 0), SD));
    excluded = new Set();
    frozen = null;
    goBtn.disabled = false;
    goBtn.textContent = 'Freeze limits and start Phase II';
    setMsg('Phase I: click a red point to read its log entry and exclude it if the cause is real.');
  }
  function setMsg(t, cls) { msg.textContent = t; msg.className = `game-msg${cls ? ` ${cls}` : ''}`; }

  function limits() {
    const kept = base.filter((_, i) => !excluded.has(i));
    const mr = kept.slice(1).map((v, i) => Math.abs(v - kept[i]));
    const sigma = mean(mr) / 1.128;
    const cl = mean(kept);
    return { cl, sigma, ucl: cl + 3 * sigma, lcl: cl - 3 * sigma, n: kept.length };
  }

  function draw() {
    const L = frozen ?? limits();
    const all = frozen ? [...base, ...phase2] : base;
    const flags1 = base.map((v, i) => !excluded.has(i) && (v > L.ucl || v < L.lcl));
    const flags2 = frozen ? weco(phase2, L.cl, L.sigma) : [];
    const first2 = flags2.findIndex((f) => f.length);
    const pts = all.map((v, i) => [i + 1, v]);
    const layers = [
      ...(frozen ? [{ type: 'xband', x0: 30.5, x1: 60.5, cls: 'band' }] : []),
      { type: 'hline', y: L.ucl, cls: 'limit', label: `UCL ${fmt(L.ucl, 0)}` },
      { type: 'hline', y: L.cl, cls: 'center', label: `CL ${fmt(L.cl, 0)}` },
      { type: 'hline', y: L.lcl, cls: 'limit', label: `LCL ${fmt(L.lcl, 0)}` },
      { type: 'line', points: pts.map((p, i) => (i < 30 && excluded.has(i) ? [p[0], null] : p)), cls: 'data-thin' },
      {
        type: 'dots', points: pts,
        cls: (p, i) => (i < 30 ? (excluded.has(i) ? 'dot-hollow' : flags1[i] ? 'signal' : 'dot') : flags2[i - 30].length ? 'signal' : 'dot'),
        r: (p, i) => ((i < 30 && flags1[i]) || (i >= 30 && flags2[i - 30].length) ? 4.8 : 3.4),
      },
    ];
    if (frozen) {
      layers.push({ type: 'vline', x: 30.5, cls: 'marker', label: 'Phase II: limits frozen' });
      layers.push({ type: 'vline', x: 44.5, cls: 'shift', label: 'Mean shifts +1.5σ', labelY: L.lcl + (L.ucl - L.lcl) * 0.08 });
    }
    chart.update({
      x: { domain: [0.5, (frozen ? 60 : 30) + 0.5], label: 'Day' },
      y: { domain: [Math.min(MU - 75, ...all) - 5, Math.max(MU + 75, ...all) + 5], label: 'Tensile strength, MPa' },
      aria: 'Individuals chart of daily tensile strength used to set Phase I limits and then monitor Phase II',
      layers,
      hover: {
        xs: pts.map((p) => p[0]), mark: (i) => pts[i],
        render: (i) => ({
          title: `Day ${i + 1}${i >= 30 ? ' (Phase II)' : ''}`,
          rows: [{ label: 'MPa', value: fmt(all[i], 1) }],
          note: i < 30 ? (excluded.has(i) ? 'Excluded from the baseline' : flags1[i] ? 'Outside the trial limits: click to investigate' : undefined) : flags2[i - 30].length ? flags2[i - 30].map((r) => `Rule ${r}`).join(', ') : undefined,
        }),
        onClick: (i) => investigate(i),
      },
    });
    readouts($('#phase-readouts'), [
      { label: 'Days in the baseline', value: `${L.n} of 30` },
      { label: 'Center line', value: `${fmt(L.cl, 1)} MPa` },
      { label: 'σ estimate (MR̄ / 1.128)', value: `${fmt(L.sigma, 1)} MPa`, sub: `True process σ is ${SD}` },
      frozen
        ? { label: 'Phase II: first signal', value: first2 >= 0 ? `Day ${first2 + 31}` : 'None', sub: first2 >= 0 ? `${first2 + 31 - 45} days after the shift` : 'The shift went unnoticed', state: first2 >= 0 ? 'good' : 'signal' }
        : { label: 'Phase II', value: 'Not started' },
    ]);
  }

  function investigate(i) {
    if (frozen || i >= 30) return;
    const L = limits();
    const out = base[i] > L.ucl || base[i] < L.lcl;
    if (excluded.has(i)) { excluded.delete(i); setMsg(`Day ${i + 1} is back in the baseline.`); draw(); return; }
    if (!out) { setMsg(`Day ${i + 1} is inside the trial limits. It stays.`); return; }
    if (LOG[i + 1]) {
      excluded.add(i);
      setMsg(`${LOG[i + 1]} Limits recomputed.`, 'is-correct');
    } else {
      setMsg(`Day ${i + 1}: no log entry and no cause found. It stays in the baseline, but keep an eye on this test.`, 'is-wrong');
    }
    draw();
  }

  goBtn.addEventListener('click', () => {
    if (frozen) return;
    frozen = limits();
    goBtn.disabled = true;
    goBtn.textContent = 'Phase II running';
    const dirty = excluded.size < 2;
    setMsg(dirty ? 'Limits frozen with special causes still in the baseline. Notice how wide they are.' : 'Clean limits frozen. New days are plotted against them.', dirty ? 'is-wrong' : 'is-correct');
    draw();
  });
  $('#phase-reset').addEventListener('click', () => { reset(); draw(); });
  legend($('#phase-legend'), [
    { label: 'Daily test', swatch: 'line', color: 'data' },
    { label: 'Control limits', swatch: 'dash', color: 'ink' },
    { label: 'Signal', swatch: 'dot', color: 'signal' },
  ]);
  reset();
  draw();
}
