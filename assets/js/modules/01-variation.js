// Module 1: variation and control.

import { Chart, el } from '../chart.js';
import { rng, mean, sd, histogram, normPdf, normCdf, weco, fmt } from '../stats.js';
import { segmented, readouts, legend, $ } from '../ui.js';

const TARGET = 500, SIGMA = 1;

/* ---------- Fig 1.1: run chart and sideways histogram ---------- */
{
  const runChart = new Chart($('#line-run'), { height: 280, margin: { top: 18, right: 20, bottom: 40, left: 50 } });
  const histChart = new Chart($('#line-hist'), { height: 280, margin: { top: 18, right: 16, bottom: 40, left: 16 } });
  let R = rng(11);
  let fills = [];
  let change = 'none';
  let changeAt = null;
  let timer = null;
  const WINDOW = 80, MAX = 600;

  function next() {
    const i = fills.length;
    let mu = TARGET, s = SIGMA;
    if (changeAt !== null && i >= changeAt) {
      const k = i - changeAt + 1;
      if (change === 'shift') mu += 1.5;
      if (change === 'drift') mu += Math.min(0.06 * k, 4);
      if (change === 'spread') s *= 2;
      if (change === 'spike' && k % 23 === 1) mu += 4.5;
    }
    fills.push(R.normal(mu, s));
  }

  function reset() {
    R = rng(11);
    fills = [];
    changeAt = change === 'none' ? null : 40;
    for (let i = 0; i < 60; i++) next();
  }

  function draw() {
    const n = fills.length;
    const start = Math.max(0, n - WINDOW);
    const view = fills.slice(start).map((v, i) => [start + i + 1, v]);
    const lo = Math.min(495.5, ...fills) - 0.2, hi = Math.max(504.5, ...fills) + 0.2;
    const layers = [
      { type: 'hline', y: TARGET, cls: 'center' },
      { type: 'line', points: view, cls: 'data-thin' },
      { type: 'dots', points: view, cls: 'dot', r: 2.8 },
    ];
    if (changeAt !== null && changeAt >= start) {
      layers.push({ type: 'vline', x: changeAt + 0.5, cls: 'shift', label: 'Change starts' });
    }
    runChart.update({
      x: { domain: [start + 0.5, Math.max(start + WINDOW, n) + 0.5], label: 'Bottle', ticks: 5 },
      y: { domain: [lo, hi], label: 'mL' },
      aria: 'Run chart of fill volumes in time order',
      layers,
      hover: { xs: view.map((p) => p[0]), mark: (i) => view[i], render: (i) => ({ title: `Bottle ${view[i][0]}`, rows: [{ label: 'mL', value: fmt(view[i][1], 2) }] }) },
    });

    const k = 24;
    const bins = histogram(fills, lo, hi, k);
    const w = (hi - lo) / k;
    const maxC = Math.max(...bins.map((b) => b.count), n * w * normPdf(0, 0, SIGMA));
    const curve = [];
    for (let y = lo; y <= hi; y += (hi - lo) / 120) curve.push([n * w * normPdf(y, TARGET, SIGMA), y]);
    histChart.update({
      x: { domain: [0, maxC * 1.08], label: 'Count', ticks: 3, grid: false },
      y: { domain: [lo, hi], axis: false, grid: false },
      aria: 'Histogram of all fill volumes, drawn sideways so it shares the vertical scale with the run chart',
      layers: [
        { type: 'hline', y: TARGET, cls: 'center' },
        {
          type: 'custom', draw(g, sx, sy) {
            for (const b of bins) {
              if (!b.count) continue;
              const y0 = sy(b.x1) + 1, h = Math.max(0.5, sy(b.x0) - sy(b.x1) - 2);
              const wpx = sx(b.count) - sx(0);
              const r = Math.min(3, h / 2, wpx);
              el('path', { class: 'k-bar', d: `M0,${y0}H${wpx - r}Q${wpx},${y0} ${wpx},${y0 + r}V${y0 + h - r}Q${wpx},${y0 + h} ${wpx - r},${y0 + h}H0Z` }, g);
            }
          },
        },
        { type: 'line', points: curve.map(([c, y]) => [c, y]), cls: 'curve' },
      ],
    });
    // the curve is drawn as (count, y) pairs, which is what a sideways density needs
    readouts($('#line-readouts'), [
      { label: 'Bottles filled', value: String(n) },
      { label: 'Average', value: `${fmt(mean(fills), 2)} mL` },
      { label: 'Standard deviation', value: `${fmt(sd(fills), 2)} mL`, sub: change === 'none' ? 'Common causes only: about 1.00' : 'Includes the change' },
      { label: 'Last 20 average', value: `${fmt(mean(fills.slice(-20)), 2)} mL` },
    ]);
  }

  const runBtn = $('#line-run-btn');
  const stop = () => { clearInterval(timer); timer = null; runBtn.textContent = 'Run the line'; };
  const start = () => {
    if (fills.length >= MAX) reset();
    timer = setInterval(() => { next(); draw(); if (fills.length >= MAX) stop(); }, 90);
    runBtn.textContent = 'Pause';
  };
  runBtn.addEventListener('click', () => (timer ? stop() : start()));
  $('#line-step').addEventListener('click', () => { for (let i = 0; i < 10; i++) next(); draw(); });
  $('#line-reset').addEventListener('click', () => { stop(); reset(); draw(); });
  segmented('line-change', (v) => {
    change = v;
    if (v === 'none') changeAt = null;
    else changeAt = fills.length;
    // a fresh start shows the change against a clean baseline
    if (fills.length > 140) { R = rng(11); fills = []; changeAt = v === 'none' ? null : 40; for (let i = 0; i < 60; i++) next(); }
    draw();
  });
  reset();
  draw();
}

/* ---------- Fig 1.2: tampering ---------- */
{
  const chart = new Chart($('#tamper-chart'), { height: 270 });
  const N = 100, SHIFT_AT = 60, SHIFT = 2.5;
  let seed = 3;
  let rule = 'every';
  const shiftBox = $('#tamper-shift');

  function simulate(policy, noise, withShift) {
    let setting = TARGET;
    const ys = [], sig = [];
    for (let t = 0; t < N; t++) {
      const drift = withShift && t >= SHIFT_AT ? SHIFT : 0;
      const y = setting + drift + noise[t];
      ys.push(y);
      const err = y - TARGET;
      // a signal: one point beyond 3σ, or two of the last three beyond 2σ on the same side
      const last3 = ys.slice(-3).map((v) => (v - TARGET) / SIGMA);
      const twoOfThree = last3.length === 3 && Math.abs(err) > 2 * SIGMA &&
        (last3.filter((z) => z > 2).length >= 2 || last3.filter((z) => z < -2).length >= 2);
      const signal = Math.abs(err) > 3 * SIGMA || twoOfThree;
      sig.push(signal);
      if (policy === 'every') setting -= err;
      // on a signal, correct by the average error of the last three bottles
      if (policy === 'signal' && signal) setting -= mean(ys.slice(-3).map((v) => v - TARGET));
    }
    return { ys, sig };
  }
  const rmse = (ys) => Math.sqrt(mean(ys.map((y) => (y - TARGET) ** 2)));

  function draw() {
    const R = rng(seed);
    const noise = Array.from({ length: N }, () => R.normal(0, SIGMA));
    const withShift = shiftBox.checked;
    const runs = { alone: simulate('alone', noise, withShift), every: simulate('every', noise, withShift), signal: simulate('signal', noise, withShift) };
    const cur = runs[rule];
    const pts = cur.ys.map((y, i) => [i + 1, y, cur.sig[i]]);
    const base = runs.alone.ys.map((y, i) => [i + 1, y]);
    const all = [...cur.ys, ...runs.alone.ys];
    const layers = [
      { type: 'hline', y: TARGET, cls: 'center', label: 'Target' },
      { type: 'hline', y: TARGET + 3, cls: 'limit', label: '+3σ' },
      { type: 'hline', y: TARGET - 3, cls: 'limit', label: '−3σ' },
      { type: 'line', points: rule === 'alone' ? [] : base, cls: 'faint' },
      { type: 'line', points: pts, cls: 'data' },
      { type: 'dots', points: pts, cls: (p) => (p[2] && rule !== 'every' ? 'signal' : 'dot'), r: (p) => (p[2] && rule !== 'every' ? 4.5 : 2.6) },
    ];
    if (withShift) layers.push({ type: 'vline', x: SHIFT_AT + 0.5, cls: 'shift', label: 'Real shift +2.5 mL' });
    chart.update({
      x: { domain: [0.5, N + 0.5], label: 'Bottle' },
      y: { domain: [Math.min(494, ...all) - 0.3, Math.max(506, ...all) + 0.3], label: 'mL' },
      aria: 'Fill volumes under the chosen adjustment rule compared with leaving the process alone',
      layers,
      hover: {
        xs: pts.map((p) => p[0]), mark: (i) => pts[i],
        render: (i) => ({ title: `Bottle ${i + 1}`, rows: [{ label: 'this rule', value: fmt(pts[i][1], 2) }, { label: 'left alone', value: fmt(base[i][1], 2), key: 'ink' }] }),
      },
    });
    legend($('#tamper-legend'), [
      { label: { alone: 'Leave it alone', every: 'Adjust after every bottle', signal: 'Adjust only on a signal' }[rule], swatch: 'line', color: 'data' },
      ...(rule === 'alone' ? [] : [{ label: 'Left alone, for comparison', swatch: 'line', color: 'muted' }]),
      { label: '±3σ around target', swatch: 'dash', color: 'ink' },
    ]);
    const best = Math.min(...Object.values(runs).map((r) => rmse(r.ys)));
    readouts($('#tamper-readouts'), [
      ['alone', 'Leave it alone'], ['every', 'Adjust every bottle'], ['signal', 'Adjust on a signal'],
    ].map(([k, label]) => {
      const v = rmse(runs[k].ys);
      return { label: `${label}${k === rule ? ' (shown)' : ''}`, value: `${fmt(v, 2)} mL`, sub: Math.abs(v - best) < 1e-9 ? 'Closest to target' : `${fmt((v / best - 1) * 100, 0)}% worse`, state: Math.abs(v - best) < 1e-9 ? 'good' : undefined };
    }));
  }

  segmented('tamper-rule', (v) => { rule = v; draw(); });
  shiftBox.addEventListener('change', draw);
  $('#tamper-new').addEventListener('click', () => { seed += 1; draw(); });
  draw();
}

/* ---------- Fig 1.4: four states ---------- */
{
  const chart = new Chart($('#state-chart'), { height: 270 });
  const LSL = 496, USL = 504, N = 80;
  const STATES = {
    ideal: {
      name: 'Ideal state', pill: ['In control', 'ok'], pill2: ['Meets specification', 'ok'],
      desc: 'Only common causes act, and the natural spread of the process sits comfortably inside the specification.',
      act: 'Keep monitoring, and do not adjust between signals. Improvement now is a business choice, not an emergency.',
      gen: (R) => Array.from({ length: N }, () => R.normal(500, 0.9)),
    },
    threshold: {
      name: 'Threshold state', pill: ['In control', 'ok'], pill2: ['Some product out of spec', 'signal'],
      desc: 'The process is stable and predictable, but its natural spread is wider than the specification allows. It will keep making a steady fraction of nonconforming product.',
      act: 'Change the process itself: reduce variation or recenter it, using experiments, calibration or a study of historical data. Searching for special causes will find nothing.',
      gen: (R) => Array.from({ length: N }, () => R.normal(500, 1.75)),
    },
    brink: {
      name: 'Brink of chaos', pill: ['Out of control', 'signal'], pill2: ['Meets specification', 'ok'],
      desc: 'Every bottle is within specification today, but special causes are pushing the process around. Because it is unpredictable, nothing guarantees tomorrow will look the same.',
      act: 'Follow the out-of-control action plan, find the assignable causes and remove them before they grow into bad product.',
      gen: (R) => Array.from({ length: N }, (_, i) => R.normal(500 + (i >= 28 && i < 40 ? 2.1 : 0) + (i >= 58 ? -1.6 : 0), 0.6)),
    },
    chaos: {
      name: 'State of chaos', pill: ['Out of control', 'signal'], pill2: ['Some product out of spec', 'signal'],
      desc: 'The process is unpredictable and is making nonconforming product. Inspection can sort good from bad but cannot fix the process.',
      act: 'First remove the special causes so the process becomes stable. Only then can you judge, and improve, its capability.',
      gen: (R) => Array.from({ length: N }, (_, i) => R.normal(500 + (i >= 30 ? 2.8 : 0) + (i >= 55 ? 0.05 * (i - 55) : 0), 1.2)),
    },
  };

  function draw(key) {
    const S = STATES[key];
    // seeds chosen so each state reads unambiguously (no false alarms in the stable states)
    const R = rng({ ideal: 1, threshold: 12, brink: 3, chaos: 4 }[key]);
    const ys = S.gen(R);
    // Phase I limits from the first 25 bottles, as a quality engineer would set them
    const base = ys.slice(0, 25);
    const mr = base.slice(1).map((v, i) => Math.abs(v - base[i]));
    const sig = mean(mr) / 1.128, cl = mean(base);
    const flags = weco(ys, cl, sig);
    const pts = ys.map((y, i) => [i + 1, y, flags[i]]);
    const outSpec = ys.filter((y) => y < LSL || y > USL).length;
    const signals = flags.filter((f) => f.length).length;
    chart.update({
      x: { domain: [0.5, N + 0.5], label: 'Bottle' },
      y: { domain: [Math.min(493.5, ...ys) - 0.3, Math.max(506.5, ...ys) + 0.3], label: 'mL' },
      aria: `${S.name}: run chart with control limits and specification limits`,
      layers: [
        { type: 'band', y0: LSL, y1: USL, cls: 'band-spec' },
        { type: 'hline', y: LSL, cls: 'spec', label: 'LSL 496' },
        { type: 'hline', y: USL, cls: 'spec', label: 'USL 504' },
        { type: 'hline', y: cl + 3 * sig, cls: 'limit', label: `UCL ${fmt(cl + 3 * sig, 1)}` },
        { type: 'hline', y: cl - 3 * sig, cls: 'limit', label: `LCL ${fmt(cl - 3 * sig, 1)}` },
        { type: 'hline', y: cl, cls: 'center' },
        { type: 'line', points: pts, cls: 'data-thin' },
        { type: 'dots', points: pts, cls: (p) => (p[2].length ? 'signal' : p[1] < LSL || p[1] > USL ? 'dot-hollow' : 'dot'), r: (p) => (p[2].length ? 4.5 : 3) },
      ],
      hover: {
        xs: pts.map((p) => p[0]), mark: (i) => pts[i],
        render: (i) => ({
          title: `Bottle ${i + 1}`,
          rows: [{ label: 'mL', value: fmt(ys[i], 2) }],
          note: [pts[i][2].length ? 'Control chart signal' : '', ys[i] < LSL || ys[i] > USL ? 'Out of specification' : ''].filter(Boolean).join(' · ') || undefined,
        }),
      },
    });
    readouts($('#state-readouts'), [
      { label: 'Run-rule signals', value: String(signals), state: signals ? 'signal' : 'good' },
      { label: 'Bottles out of spec', value: `${outSpec} of ${N}`, state: outSpec ? 'signal' : 'good' },
      { label: 'Expected out of spec if stable', value: `${fmt(100 * (normCdf(LSL, cl, sig) + 1 - normCdf(USL, cl, sig)), 2)}%`, sub: 'From the Phase I average and spread' },
    ]);
    const panel = $('#state-panel');
    const h = panel.querySelector('h4');
    h.replaceChildren(document.createTextNode(S.name));
    for (const [txt, kind] of [S.pill, S.pill2]) { const p = document.createElement('span'); p.className = `pill ${kind}`; p.textContent = txt; h.append(p); }
    panel.querySelector('.desc').textContent = S.desc;
    panel.querySelector('.do').textContent = S.act;
  }
  legend($('#state-legend'), [
    { label: 'Fill volume', swatch: 'line', color: 'data' },
    { label: 'Control limits (from the first 25 bottles)', swatch: 'dash', color: 'ink' },
    { label: 'Specification 496–504 mL', swatch: 'line', color: 'spec' },
    { label: 'Signal', swatch: 'dot', color: 'signal' },
  ]);
  segmented('state-pick', draw);
  draw('ideal');
}
