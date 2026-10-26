// Module 9: lot acceptance sampling.

import { Chart, el, dataTable } from '../chart.js';
import { rng, binomCdf, fmt, fmtInt } from '../stats.js';
import { bindRange, segmented, readouts, legend, $ } from '../ui.js';

/* ---------- shared helpers ---------- */

const pct = (p, d = 1) => `${fmt(100 * p, d)}%`;
const pctTick = (v) => `${+(v * 100).toFixed(1)}%`;
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Probability of acceptance of the single plan (n, c): the binomial OC curve. */
const pa = (n, c, p) => binomCdf(c, n, p);

/** The fraction defective at which a single plan accepts half the time. */
function halfPoint(n, c) {
  let lo = 0, hi = 1;
  for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (pa(n, c, m) > 0.5) lo = m; else hi = m; }
  return (lo + hi) / 2;
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

/** Double sampling (handbook 6.2.5): accept if d1 ≤ c1, reject if d1 > c2, else a second sample. */
function paDouble(n1, c1, n2, c2, p) {
  let s = binomCdf(c1, n1, p);
  for (let d1 = c1 + 1; d1 <= c2; d1++) s += (binomCdf(d1, n1, p) - binomCdf(d1 - 1, n1, p)) * binomCdf(c2 - d1, n2, p);
  return s;
}
function asnDouble(n1, c1, n2, c2, p) {
  const decideFirst = binomCdf(c1, n1, p) + 1 - binomCdf(c2, n1, p);
  return n1 + n2 * (1 - decideFirst);
}

/** Item-by-item sequential plan (handbook 6.2.6): x_a = −h1 + s·n, x_r = h2 + s·n. */
function seqPlan(p1, p2, alpha, beta) {
  const k = Math.log((p2 * (1 - p1)) / (p1 * (1 - p2)));
  return {
    h1: Math.log((1 - alpha) / beta) / k,
    h2: Math.log((1 - beta) / alpha) / k,
    s: Math.log((1 - p1) / (1 - p2)) / k,
  };
}
const accNum = (P, n) => Math.floor(-P.h1 + P.s * n);
const rejNum = (P, n) => Math.ceil(P.h2 + P.s * n);

/**
 * Exact OC and ASN of the sequential plan truncated at nT items, by stepping the
 * distribution of the cumulative count forward one item at a time. At the truncation
 * point the lot is accepted if the count is at or below the midline s·n.
 */
function seqOc(P, p, nT) {
  let dist = [1]; // dist[d] = P(undecided with d defectives)
  let accept = 0, asn = 0;
  for (let n = 1; n <= nT; n++) {
    const next = new Array(dist.length + 1).fill(0);
    dist.forEach((q, d) => { next[d] += q * (1 - p); next[d + 1] += q * p; });
    const a = accNum(P, n), r = rejNum(P, n);
    dist = next.map((q, d) => {
      if (!q) return 0;
      const last = n === nT;
      if (d <= a || (last && d < r && d <= P.s * n)) { accept += q; asn += q * n; return 0; }
      if (d >= r || last) { asn += q * n; return 0; }
      return q;
    });
  }
  return { pa: accept, asn };
}

/* ---------- Fig 9.1: inspecting lots ---------- */
{
  const N = 500, COLS = 25, ROWS = 20, n = 52, c = 3;
  const grid = new Chart($('#lot-grid'), { margin: { top: 4, right: 4, bottom: 4, left: 4 } });
  const tally = new Chart($('#lot-tally'), { margin: { top: 18, right: 72, bottom: 42, left: 44 } });
  const reveal = $('#lot-reveal');
  const runBtn = $('#lot-run');
  let p = 0.05, R = rng(9), lot = null, history = [], accepted = 0, timer = null, runLeft = 0;

  function inspect() {
    const bad = Array.from({ length: N }, () => R.uniform() < p);
    // a partial Fisher–Yates shuffle picks n distinct items at random
    const idx = Array.from({ length: N }, (_, i) => i);
    for (let i = 0; i < n; i++) { const j = i + Math.floor(R.uniform() * (N - i)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    const chosen = idx.slice(0, n);
    const d = chosen.filter((i) => bad[i]).length;
    lot = { bad, sample: new Set(chosen), d, ok: d <= c, total: bad.filter(Boolean).length };
    history.push(lot.ok);
    if (lot.ok) accepted++;
  }

  function restart(lots = 10) {
    R = rng(9 + Math.round(p * 1000));
    history = []; accepted = 0;
    for (let i = 0; i < lots; i++) inspect();
  }

  function draw() {
    grid.update({
      height: (W) => Math.round(8 + ((W - 8) * ROWS) / COLS),
      x: { domain: [0, COLS], axis: false, grid: false },
      y: { domain: [ROWS, 0], axis: false, grid: false },
      aria: `A lot of 500 items, ${lot.total} defective. The sample of 52 contains ${lot.d} defectives, so the lot is ${lot.ok ? 'accepted' : 'rejected'}.`,
      layers: [{
        type: 'custom', draw(g, sx, sy) {
          const cw = sx(1) - sx(0), chh = sy(1) - sy(0);
          const gap = Math.max(1, cw * 0.16);
          const show = reveal.checked;
          for (let i = 0; i < N; i++) {
            const col = i % COLS, row = Math.floor(i / COLS);
            const inS = lot.sample.has(i), bad = lot.bad[i];
            const cls = inS ? (bad ? 'k-item-sample-bad' : 'k-item-sample') : bad && show ? 'k-item-bad' : 'k-item';
            el('rect', { class: cls, x: sx(col) + gap / 2, y: sy(row) + gap / 2, width: cw - gap, height: chh - gap, rx: Math.min(2.5, cw / 5) }, g);
          }
        },
      }],
    });

    const P = pa(n, c, p);
    const run = [];
    let acc = 0;
    history.forEach((ok, i) => { acc += ok ? 1 : 0; run.push([i + 1, acc / (i + 1)]); });
    const xMax = Math.max(20, history.length);
    tally.update({
      height: (W) => Math.max(230, Math.min(360, Math.round(8 + ((W - 8) * ROWS) / COLS))), // matches the grid beside it
      x: { domain: [0.5, xMax + 0.5], label: 'Lots inspected', ticks: 5 },
      y: { domain: [0, 1], label: 'Share accepted', format: pctTick },
      aria: `Running share of lots accepted: ${accepted} of ${history.length}, against a probability of acceptance of ${fmt(P, 3)}`,
      layers: [
        { type: 'hline', y: P, cls: 'limit', label: `Pa ${fmt(P, 3)}` },
        { type: 'line', points: run, cls: 'data' },
        { type: 'dots', points: run.slice(-1), cls: lot.ok ? 'dot' : 'signal', r: 4 },
      ],
      hover: {
        xs: run.map((q) => q[0]), mark: (i) => run[i],
        render: (i) => ({ title: `After ${i + 1} lots`, rows: [{ label: 'accepted', value: pct(run[i][1], 0) }, { label: 'Pa', value: fmt(P, 3), key: 'ink' }], note: history[i] ? undefined : `Lot ${i + 1} rejected` }),
      },
    });

    readouts($('#lot-readouts'), [
      { label: 'This lot', value: lot.ok ? 'Accepted' : 'Rejected', sub: `${lot.d} defective in the sample; accept if 3 or fewer`, state: lot.ok ? 'good' : 'signal' },
      { label: 'Defective in the whole lot', value: `${lot.total} of ${N}`, sub: `${pct(lot.total / N)} of the lot` },
      { label: 'Lots accepted so far', value: `${accepted} of ${history.length}`, sub: pct(accepted / history.length, 0) },
      { label: 'Pa from the OC curve', value: fmt(P, 3), sub: `Binomial, n = 52, c = 3, p = ${pct(p)}` },
    ]);
  }

  const stop = () => { clearInterval(timer); timer = null; runBtn.textContent = 'Run 100 lots'; };
  const start = () => {
    if (reducedMotion()) { for (let i = 0; i < 100; i++) inspect(); draw(); return; }
    runLeft = 100;
    runBtn.textContent = 'Pause';
    timer = setInterval(() => { inspect(); draw(); if (--runLeft <= 0) stop(); }, 45);
  };
  runBtn.addEventListener('click', () => (timer ? stop() : start()));
  $('#lot-next').addEventListener('click', () => { inspect(); draw(); });
  $('#lot-reset').addEventListener('click', () => { stop(); restart(1); draw(); });
  reveal.addEventListener('change', draw);
  bindRange('lot-p', (v) => { p = v; stop(); restart(); draw(); }, { format: (v) => pct(v) });
  legend($('#lot-legend'), [
    { label: 'Sampled, good', swatch: 'box', color: 'data' },
    { label: 'Sampled, defective', swatch: 'box', color: 'signal' },
    { label: 'Not sampled', swatch: 'box', color: 'muted' },
    { label: 'Defective, not sampled (pale)', swatch: 'box', color: 'signal' },
    { label: 'Share of lots accepted', swatch: 'line', color: 'data' },
    { label: 'Probability of acceptance', swatch: 'dash', color: 'ink' },
  ]);
}

/* ---------- Fig 9.2: OC curve explorer ---------- */
{
  const host = $('#oc-chart');
  const chart = new Chart(host, { height: 310, margin: { top: 30, right: 24, bottom: 42, left: 48 } });
  const XMAX = 0.2;
  const ps = Array.from({ length: 201 }, (_, i) => (i * XMAX) / 200);
  let n = 52, c = 3, aql = 0.02, ltpd = 0.1;
  const round3 = (v) => Math.round(v * 1000) / 1000;

  const nIn = bindRange('oc-n', (v) => { n = v; draw(); }, { call: false });
  const cIn = bindRange('oc-c', (v) => { c = v; draw(); }, { call: false });
  $('#oc-handbook').addEventListener('click', () => { n = 52; c = 3; nIn.value = 52; cIn.value = 3; draw(); });

  function draw() {
    const cur = ps.map((p) => pa(n, c, p));
    const hb = ps.map((p) => pa(52, 3, p));
    const isHb = n === 52 && c === 3;
    const pA = pa(n, c, aql), pL = pa(n, c, ltpd);
    chart.update({
      x: { domain: [0, XMAX], label: 'Lot fraction defective p', format: pctTick, ticks: [0, 0.05, 0.1, 0.15, 0.2] },
      y: { domain: [0, 1.04], label: 'Pa', ticks: [0, 0.25, 0.5, 0.75, 1] },
      aria: `OC curve for n = ${n}, c = ${c}. At the AQL of ${pct(aql)} it accepts with probability ${fmt(pA, 3)}; at the LTPD of ${pct(ltpd)}, ${fmt(pL, 3)}.`,
      layers: [
        { type: 'xband', x0: aql, x1: ltpd, cls: 'band' },
        { type: 'line', points: [[0, 1], [aql, 1]], cls: 'ink dashed' },
        { type: 'line', points: [[ltpd, 0.004], [XMAX, 0.004]], cls: 'ink dashed' },
        { type: 'line', points: ps.map((p, i) => [p, hb[i]]), cls: 'faint', hidden: isHb },
        { type: 'line', points: ps.map((p, i) => [p, cur[i]]), cls: 'data' },
        { type: 'line', points: [[aql, pA], [aql, 1]], cls: 'alt risk' },
        { type: 'line', points: [[ltpd, 0], [ltpd, pL]], cls: 'alt2 risk' },
        { type: 'dots', points: [[aql, pA], [ltpd, pL]], cls: 'dot', r: 4.5 },
        { type: 'text', x: aql, y: Math.min(0.93, (pA + 1) / 2 - 0.06), dx: 8, text: `α = ${fmt(1 - pA, 3)}`, cls: 'label-strong' },
        { type: 'text', x: ltpd, y: Math.max(0.06, pL / 2 + 0.04), dx: 8, text: `β = ${fmt(pL, 3)}`, cls: 'label-strong' },
        {
          type: 'handle', x: aql, axis: 'x', cls: 'ink', label: `AQL ${pct(aql)}`, aria: 'Acceptable quality level', step: 0.001,
          onDrag: (x) => { keepHandleFocus(host); aql = Math.max(0.001, Math.min(ltpd - 0.005, round3(x))); draw(); },
        },
        {
          type: 'handle', x: ltpd, axis: 'x', cls: 'ink', label: `LTPD ${pct(ltpd)}`, aria: 'Lot tolerance percent defective', step: 0.001,
          onDrag: (x) => { keepHandleFocus(host); ltpd = Math.min(XMAX - 0.002, Math.max(aql + 0.005, round3(x))); draw(); },
        },
      ],
      hover: {
        xs: ps, mark: (i) => [ps[i], cur[i]],
        render: (i) => ({
          title: `${pct(ps[i])} defective`,
          rows: [{ label: `Pa, plan (${n}, ${c})`, value: fmt(cur[i], 3) }, ...(isHb ? [] : [{ label: 'Pa, handbook (52, 3)', value: fmt(hb[i], 3), key: 'ink' }])],
        }),
      },
    });
    readouts($('#oc-readouts'), [
      { label: 'Plan', value: `n = ${n}, c = ${c}` },
      { label: 'Pa at the AQL', value: fmt(pA, 3), sub: `Producer's risk α = ${fmt(1 - pA, 3)}` },
      { label: 'Pa at the LTPD', value: fmt(pL, 3), sub: `Consumer's risk β = ${fmt(pL, 3)}` },
      { label: 'Accepted half the time', value: c >= n ? 'never reached' : pct(halfPoint(n, c)), sub: 'Lot quality where Pa = 0.5' },
    ]);
  }

  legend($('#oc-legend'), [
    { label: 'OC curve of the plan', swatch: 'line', color: 'data' },
    { label: 'Handbook plan (52, 3)', swatch: 'line', color: 'muted' },
    { label: 'Ideal', swatch: 'dash', color: 'ink' },
    { label: 'Producer’s risk α', swatch: 'box', color: 'alt' },
    { label: 'Consumer’s risk β', swatch: 'box', color: 'alt2' },
  ]);
  const HANDBOOK = [0.998, 0.980, 0.930, 0.845, 0.739, 0.620, 0.502, 0.394, 0.300, 0.223, 0.162, 0.115];
  dataTable($('#oc-table'), [
    { label: 'Lot fraction defective p', key: 'p', fmt: (v) => fmt(v, 2) },
    { label: 'Pa, exact binomial', key: 'exact', fmt: (v) => fmt(v, 3) },
    { label: 'Pa, as printed in the handbook', key: 'hb', fmt: (v) => fmt(v, 3) },
  ], HANDBOOK.map((h, i) => { const p = (i + 1) / 100; return { p, exact: pa(52, 3, p), hb: h }; }));
  draw();
}

/* ---------- Fig 9.3: design from two points ---------- */
{
  const chart = new Chart($('#ds-chart'), { height: 290, margin: { top: 18, right: 24, bottom: 42, left: 48 } });
  const N_MAX = 5000, C_MAX = 40;
  let aql = 0.01, alpha = 0.05, ltpd = 0.1, beta = 0.1;

  /**
   * For c = 0, 1, 2, … find the smallest n that holds Pa(LTPD) ≤ β, and the largest n
   * that keeps Pa(AQL) ≥ 1 − α. The first c where the first is no larger than the second
   * gives the smallest plan, because the consumer's n only grows with c.
   */
  function search() {
    // both bounds grow with c, so each search starts where the last one ended
    const rows = [];
    let nc = 1, np = 0;
    for (let c = 0; c <= C_MAX; c++) {
      nc = Math.max(nc, c + 1);
      while (nc <= N_MAX && pa(nc, c, ltpd) > beta) nc++;
      np = Math.max(np, c);
      while (np < N_MAX && pa(np + 1, c, aql) >= 1 - alpha) np++;
      const ok = nc <= N_MAX && nc <= np;
      rows.push({ c, nc, np, ok });
      if (ok || nc > N_MAX) return { plan: ok ? { n: nc, c } : null, rows };
    }
    return { plan: null, rows };
  }

  function draw() {
    const { plan, rows } = search();
    const xMax = Math.min(0.5, Math.max(0.1, ltpd * 1.9));
    const ps = Array.from({ length: 201 }, (_, i) => (i * xMax) / 200);
    const layers = [
      { type: 'line', points: [[aql, 1 - alpha], [aql, 1]], cls: 'alt risk' },
      { type: 'line', points: [[ltpd, 0], [ltpd, beta]], cls: 'alt2 risk' },
      { type: 'vline', x: aql, cls: 'marker', label: `AQL ${pct(aql)}`, labelY: 0.3, anchor: 'start' },
      { type: 'vline', x: ltpd, cls: 'marker', label: `LTPD ${pct(ltpd)}`, labelY: 0.75, anchor: 'start' },
    ];
    let cur = null;
    const prev = plan && plan.c > 0 ? rows[plan.c - 1] : null;
    if (prev && prev.nc <= N_MAX) layers.push({ type: 'line', points: ps.map((p) => [p, pa(prev.nc, prev.c, p)]), cls: 'faint dashed' });
    if (plan) {
      cur = ps.map((p) => pa(plan.n, plan.c, p));
      layers.push({ type: 'line', points: ps.map((p, i) => [p, cur[i]]), cls: 'data' });
      layers.push({ type: 'dots', points: [[aql, pa(plan.n, plan.c, aql)], [ltpd, pa(plan.n, plan.c, ltpd)]], cls: 'dot', r: 4.5 });
    }
    layers.push({ type: 'dots', points: [[aql, 1 - alpha], [ltpd, beta]], cls: 'dot-hollow', r: 5.5 });
    chart.update({
      x: { domain: [0, xMax], label: 'Lot fraction defective p', format: pctTick, ticks: 5 },
      y: { domain: [0, 1.04], label: 'Probability of acceptance', ticks: [0, 0.25, 0.5, 0.75, 1] },
      aria: plan ? `Smallest plan meeting both points: n = ${plan.n}, c = ${plan.c}` : 'No plan found within the search limits',
      layers,
      hover: cur ? {
        xs: ps, mark: (i) => [ps[i], cur[i]],
        render: (i) => ({ title: `${pct(ps[i])} defective`, rows: [{ label: 'Pa', value: fmt(cur[i], 3) }] }),
      } : undefined,
    });

    const note = $('#ds-note');
    if (plan) {
      const pA = pa(plan.n, plan.c, aql), pL = pa(plan.n, plan.c, ltpd);
      readouts($('#ds-readouts'), [
        { label: 'Smallest plan', value: `n = ${plan.n}, c = ${plan.c}`, state: 'good' },
        { label: 'Pa at the AQL', value: fmt(pA, 3), sub: `Needs at least ${fmt(1 - alpha, 2)}` },
        { label: 'Pa at the LTPD', value: fmt(pL, 3), sub: `Needs at most ${fmt(beta, 2)}` },
        { label: 'LTPD ÷ AQL', value: fmt(ltpd / aql, 1), sub: 'Closer to 1 needs far more items' },
      ]);
      note.textContent = plan.c === 0
        ? `With c = 0, n = ${plan.n} already protects both sides.`
        : `With c = ${plan.c - 1}, the consumer needs at least ${prev.nc} items but the producer can accept at most ${prev.np}, so the search moves on. With c = ${plan.c} the two ranges meet.`;
    } else {
      readouts($('#ds-readouts'), [
        { label: 'Smallest plan', value: 'None found', sub: `Searched n up to ${fmtInt(N_MAX)}`, state: 'signal' },
        { label: 'Pa at the AQL', value: '–' },
        { label: 'Pa at the LTPD', value: '–' },
        { label: 'LTPD ÷ AQL', value: fmt(ltpd / aql, 1), sub: 'Closer to 1 needs far more items' },
      ]);
      note.textContent = 'The AQL and LTPD are too close together for a plan of manageable size. Move them apart or accept larger risks.';
    }
    const shown = rows.filter((r) => r.nc <= N_MAX);
    dataTable($('#ds-table'), [
      { label: 'c', key: 'c' },
      { label: 'Smallest n for the consumer', key: 'nc' },
      { label: 'Largest n for the producer', key: 'np', fmt: (v) => (v >= N_MAX ? `${fmtInt(N_MAX)}+` : String(v)) },
      { label: 'Plan exists?', key: 'ok', fmt: (v) => (v ? 'yes' : 'no'), num: false },
    ], shown.map((r) => ({ ...r, _cls: r.ok ? 'is-hi' : '' })));
  }

  legend($('#ds-legend'), [
    { label: 'Smallest plan that meets both points', swatch: 'line', color: 'data' },
    { label: 'Best plan with one fewer acceptance number', swatch: 'dash', color: 'muted' },
    { label: 'Producer’s requirement, Pa ≥ 1 − α', swatch: 'box', color: 'alt' },
    { label: 'Consumer’s requirement, Pa ≤ β', swatch: 'box', color: 'alt2' },
  ]);
  bindRange('ds-aql', (v) => { aql = v; if (ltpd < aql + 0.005) { ltpd = Math.ceil((aql + 0.005) * 200) / 200; ltpdIn.value = ltpd; } draw(); }, { format: (v) => pct(v), call: false });
  const ltpdIn = bindRange('ds-ltpd', (v) => { ltpd = Math.max(v, aql + 0.005); if (ltpd !== v) ltpdIn.value = ltpd; draw(); }, { format: (v) => pct(v), call: false });
  segmented('ds-alpha', (v) => { alpha = Number(v); draw(); });
  segmented('ds-beta', (v) => { beta = Number(v); draw(); });
  draw();
}

/* ---------- Fig 9.4: AOQ and ATI ---------- */
{
  const aoqChart = new Chart($('#aoq-chart'), { height: 260, margin: { top: 20, right: 80, bottom: 42, left: 48 } });
  const atiChart = new Chart($('#ati-chart'), { height: 260, margin: { top: 20, right: 76, bottom: 42, left: 56 } });
  let n = 52, c = 3, N = 10000;

  function draw() {
    const m = Math.min(n, N);
    let pMax = 0.2;
    while (pMax < 0.6 && pa(m, c, pMax) > 0.003) pMax += 0.05;
    const ps = Array.from({ length: 241 }, (_, i) => (i * pMax) / 240);
    const P = ps.map((p) => pa(m, c, p));
    const aoq = ps.map((p, i) => (P[i] * p * (N - m)) / N);
    const ati = ps.map((p, i) => m + (1 - P[i]) * (N - m));
    let best = [0, 0];
    for (let i = 0; i <= 3000; i++) {
      const p = (i * pMax) / 3000;
      const v = (pa(m, c, p) * p * (N - m)) / N;
      if (v > best[1]) best = [p, v];
    }
    const [pStar, aoql] = best;
    const atiStar = m + (1 - pa(m, c, pStar)) * (N - m);
    const acceptsAll = c >= m; // the sample can never hold more than c defectives
    const xTicks = pMax <= 0.2 ? [0, 0.05, 0.1, 0.15, 0.2] : 5;

    aoqChart.update({
      x: { domain: [0, pMax], label: 'Incoming fraction defective', format: pctTick, ticks: xTicks },
      y: { domain: [0, aoql * 1.3], label: 'AOQ', format: pctTick, ticks: 4 },
      aria: `Average outgoing quality for n = ${m}, c = ${c}, N = ${N}. AOQL ${pct(aoql, 2)} at ${pct(pStar)} incoming.`,
      layers: [
        { type: 'hline', y: aoql, cls: 'limit', label: `AOQL ${pct(aoql, 2)}` },
        { type: 'vline', x: pStar, cls: 'marker', top: aoql },
        { type: 'line', points: ps.map((p, i) => [p, aoq[i]]), cls: 'data' },
        { type: 'dots', points: [[pStar, aoql]], cls: 'dot', r: 4.5 },
      ],
      hover: {
        xs: ps, mark: (i) => [ps[i], aoq[i]],
        render: (i) => ({ title: `${pct(ps[i])} incoming`, rows: [{ label: 'AOQ', value: pct(aoq[i], 2) }, { label: 'Pa', value: fmt(P[i], 3), key: 'ink' }] }),
      },
    });
    atiChart.update({
      x: { domain: [0, pMax], label: 'Incoming fraction defective', format: pctTick, ticks: xTicks },
      y: { domain: [0, N * 1.08], label: 'ATI per lot', format: (v) => fmtInt(v), ticks: 4 },
      aria: `Average total inspection per lot, from ${m} up to ${N}`,
      layers: [
        { type: 'hline', y: N, cls: 'limit-soft', label: `N ${fmtInt(N)}` },
        { type: 'hline', y: m, cls: 'limit-soft', label: `n ${m}` },
        { type: 'vline', x: pStar, cls: 'marker' },
        { type: 'line', points: ps.map((p, i) => [p, ati[i]]), cls: 'alt' },
        { type: 'dots', points: [[pStar, atiStar]], cls: 'dot-alt', r: 4.5 },
      ],
      hover: {
        xs: ps, mark: (i) => [ps[i], ati[i]],
        render: (i) => ({ title: `${pct(ps[i])} incoming`, rows: [{ label: 'ATI', value: fmtInt(ati[i]), key: 'alt' }, { label: 'of each lot', value: pct(ati[i] / N, 0), key: 'ink' }] }),
      },
    });
    if (acceptsAll) {
      readouts($('#aoq-readouts'), [
        { label: 'AOQL', value: 'None', sub: 'With c ≥ n every lot is accepted', state: 'signal' },
        { label: 'Reached at', value: '–' },
        { label: 'ATI at that point', value: fmtInt(m), sub: 'Only the sample is ever inspected' },
      ]);
      return;
    }
    readouts($('#aoq-readouts'), [
      { label: 'AOQL', value: pct(aoql, 2), sub: 'Worst long-run outgoing quality' },
      { label: 'Reached at', value: `${pct(pStar)} incoming`, sub: `Pa there is ${fmt(pa(m, c, pStar), 3)}` },
      { label: 'ATI at that point', value: fmtInt(atiStar), sub: `${pct(atiStar / N, 0)} of each lot inspected` },
    ]);
  }

  legend($('#aoq-legend'), [
    { label: 'Average outgoing quality', swatch: 'line', color: 'data' },
    { label: 'Average total inspection', swatch: 'line', color: 'alt' },
    { label: 'Where AOQ peaks', swatch: 'dash', color: 'ink' },
  ]);
  dataTable($('#aoq-table'), [
    { label: 'p', key: 'p', fmt: (v) => fmt(v, 2) },
    { label: 'Pa', key: 'pa', fmt: (v) => fmt(v, 3) },
    { label: 'AOQ', key: 'aoq', fmt: (v) => fmt(v, 4) },
    { label: 'ATI', key: 'ati', fmt: (v) => fmtInt(v) },
  ], Array.from({ length: 14 }, (_, i) => {
    const p = (i + 1) / 100, P = pa(52, 3, p);
    return { p, pa: P, aoq: (P * p * (10000 - 52)) / 10000, ati: 52 + (1 - P) * (10000 - 52) };
  }));
  bindRange('aoq-n', (v) => { n = v; draw(); }, { call: false });
  bindRange('aoq-c', (v) => { c = v; draw(); }, { call: false });
  bindRange('aoq-lot', (v) => { N = v; draw(); }, { format: (v) => fmtInt(v), call: false });
  draw();
}

/* ---------- Fig 9.5: single, double and sequential plans ---------- */
{
  const SEQ = seqPlan(0.01, 0.1, 0.05, 0.1); // the handbook example: h1 0.939, h2 1.205, s 0.040
  const NT = 156; // truncate at three times the single plan's n = 52
  const SINGLE = { n: 52, c: 2 };
  const DOUBLE = { n1: 29, c1: 0, n2: 29, c2: 2 };
  const walk = new Chart($('#seq-walk'), { height: 290, margin: { top: 18, right: 20, bottom: 42, left: 40 } });
  const asnChart = new Chart($('#seq-asn'), { height: 290, margin: { top: 18, right: 16, bottom: 42, left: 44 } });
  const grid = Array.from({ length: 61 }, (_, i) => (i * 0.15) / 60);
  const curves = grid.map((p) => ({ seq: seqOc(SEQ, p, NT), dbl: asnDouble(DOUBLE.n1, DOUBLE.c1, DOUBLE.n2, DOUBLE.c2, p) }));
  let p = 0.03, seed = 5, path = [], decision = null, shown = 0, timer = null;

  function generate() {
    const R = rng(seed * 977 + Math.round(p * 1000));
    path = [[0, 0]]; decision = null;
    let d = 0;
    for (let n = 1; n <= NT; n++) {
      const bad = R.uniform() < p;
      d += bad ? 1 : 0;
      path.push([n, d, bad]);
      if (d <= accNum(SEQ, n)) { decision = 'accept'; break; }
      if (d >= rejNum(SEQ, n)) { decision = 'reject'; break; }
      if (n === NT) { decision = d <= SEQ.s * n ? 'accept' : 'reject'; break; }
    }
  }

  function drawWalk() {
    const vis = path.slice(0, shown + 1);
    const done = shown >= path.length - 1;
    const last = vis[vis.length - 1];
    const xMax = Math.min(NT + 4, Math.max(60, path[path.length - 1][0] + 8));
    const yMax = Math.max(4.5, Math.max(...path.map((q) => q[1])) + 1.5);
    const xa = (n) => -SEQ.h1 + SEQ.s * n, xr = (n) => SEQ.h2 + SEQ.s * n;
    const n0 = SEQ.h1 / SEQ.s;
    const layers = [
      { type: 'area', points: [[0, yMax], [xMax, yMax]], lower: [[0, xr(0)], [xMax, xr(xMax)]], cls: 'region-reject' },
      { type: 'area', points: [[n0, 0], [xMax, xa(xMax)]], base: 0, cls: 'region-accept' },
      { type: 'line', points: [[0, xr(0)], [xMax, xr(xMax)]], cls: 'ink dashed' },
      { type: 'line', points: [[n0, 0], [xMax, xa(xMax)]], cls: 'ink dashed' },
      { type: 'text', x: 2, y: yMax - 0.35, text: 'Reject', cls: 'label-signal', baseline: 'hanging' },
      { type: 'text', x: xMax - 2, y: 0.25, text: 'Accept', cls: 'label-good', anchor: 'end' },
      { type: 'line', points: vis.map((q) => [q[0], q[1]]), cls: 'data', step: true },
      { type: 'dots', points: vis.filter((q) => q[2]).map((q) => [q[0], q[1]]), cls: 'signal', r: 3.5 },
    ];
    if (xMax >= NT) layers.push({ type: 'vline', x: NT, cls: 'marker', label: `Stop at ${NT}`, anchor: 'end' });
    if (done) layers.push({ type: 'dots', points: [[last[0], last[1]]], cls: decision === 'accept' ? 'dot-good' : 'signal', r: 6 });
    walk.update({
      x: { domain: [0, xMax], label: 'Items inspected', ticks: 6 },
      y: { domain: [0, yMax], label: 'Defectives so far', ticks: Math.ceil(yMax) <= 6 ? Array.from({ length: Math.floor(yMax) + 1 }, (_, i) => i) : 5 },
      aria: `Sequential plan for one lot: ${last[1]} defectives in ${last[0]} items${done ? `, lot ${decision === 'accept' ? 'accepted' : 'rejected'}` : ''}`,
      layers,
      hover: {
        xs: vis.map((q) => q[0]), mark: (i) => [vis[i][0], vis[i][1]],
        render: (i) => {
          const n = vis[i][0];
          if (n === 0) return { title: 'Start', rows: [{ label: 'defectives', value: '0' }] };
          const a = accNum(SEQ, n), r = rejNum(SEQ, n);
          return {
            title: `Item ${n}${vis[i][2] ? ' (defective)' : ''}`,
            rows: [{ label: 'defectives so far', value: String(vis[i][1]) }, { label: 'accept if at most', value: a < 0 ? 'not yet' : String(a), key: 'ink' }, { label: 'reject if at least', value: String(r), key: 'ink' }],
          };
        },
      },
    });
    return { done, last };
  }

  function draw() {
    const { done, last } = drawWalk();
    const s = seqOc(SEQ, p, NT);
    const dA = asnDouble(DOUBLE.n1, DOUBLE.c1, DOUBLE.n2, DOUBLE.c2, p);
    asnChart.update({
      x: { domain: [0, 0.15], label: 'Lot fraction defective p', format: pctTick, ticks: [0, 0.05, 0.1, 0.15] },
      y: { domain: [0, 60], label: 'Average items inspected per lot', ticks: [0, 20, 40, 60] },
      aria: `Average sample number at ${pct(p)} defective: single 52, double ${fmt(dA, 1)}, sequential ${fmt(s.asn, 1)}`,
      layers: [
        { type: 'vline', x: p, cls: 'marker' },
        { type: 'line', points: [[0, SINGLE.n], [0.15, SINGLE.n]], cls: 'ink' },
        { type: 'line', points: grid.map((q, i) => [q, curves[i].dbl]), cls: 'alt' },
        { type: 'line', points: grid.map((q, i) => [q, curves[i].seq.asn]), cls: 'data' },
        { type: 'dots', points: [[p, SINGLE.n]], cls: 'dot-ink', r: 4 },
        { type: 'dots', points: [[p, dA]], cls: 'dot-alt', r: 4 },
        { type: 'dots', points: [[p, s.asn]], cls: 'dot', r: 4.5 },
      ],
      hover: {
        xs: grid, mark: (i) => [grid[i], curves[i].seq.asn],
        render: (i) => ({
          title: `${pct(grid[i])} defective`,
          rows: [
            { label: 'sequential', value: fmt(curves[i].seq.asn, 1) },
            { label: 'double', value: fmt(curves[i].dbl, 1), key: 'alt' },
            { label: 'single', value: String(SINGLE.n), key: 'ink' },
          ],
        }),
      },
    });
    readouts($('#seq-readouts'), [
      done
        ? { label: 'This lot, sequential plan', value: `${decision === 'accept' ? 'Accepted' : 'Rejected'} after ${last[0]}`, sub: `${last[1]} defective found`, state: decision === 'accept' ? 'good' : 'signal' }
        : { label: 'This lot, sequential plan', value: `Item ${last[0]}`, sub: `${last[1]} defective so far` },
      { label: 'Sequential ASN', value: fmt(s.asn, 1), sub: `Pa ${fmt(s.pa, 3)}` },
      { label: 'Double ASN', value: fmt(dA, 1), sub: `Pa ${fmt(paDouble(DOUBLE.n1, DOUBLE.c1, DOUBLE.n2, DOUBLE.c2, p), 3)}` },
      { label: 'Single sample', value: String(SINGLE.n), sub: `Pa ${fmt(pa(SINGLE.n, SINGLE.c, p), 3)}` },
    ]);
  }

  const stop = () => { clearInterval(timer); timer = null; };
  function inspectLot() {
    stop();
    seed += 1;
    generate();
    if (reducedMotion()) { shown = path.length - 1; draw(); return; }
    shown = 0;
    draw();
    timer = setInterval(() => { shown += 1; draw(); if (shown >= path.length - 1) stop(); }, 40);
  }

  legend($('#seq-legend'), [
    { label: 'Sequential plan: one lot (left), average items (right)', swatch: 'line', color: 'data' },
    { label: 'Double plan', swatch: 'line', color: 'alt' },
    { label: 'Single plan, always 52', swatch: 'line', color: 'ink' },
    { label: 'Defective item', swatch: 'dot', color: 'signal' },
    { label: 'Acceptance and rejection lines', swatch: 'dash', color: 'ink' },
  ]);
  $('#seq-go').addEventListener('click', inspectLot);
  bindRange('seq-p', (v) => { p = v; stop(); generate(); shown = path.length - 1; draw(); }, { format: (v) => pct(v) });
}
