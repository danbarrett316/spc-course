// home.js: the live control chart in the hero, and the course map.

import { Chart } from './chart.js';
import { rng, weco, WECO_TEXT, fmt } from './stats.js';
import { PARTS, MODULES } from './course-data.js';
import { glyph } from './glyphs.js';
import { progress, statusRing } from './progress.js';
import { legend, pill, $ } from './ui.js';

/* ---------- live chart ---------- */

const TARGET = 500, SIGMA = 1;
const R = rng(20240516); // Shewhart's memo was dated 16 May 1924
const xs = [];
let t = 0;
let event = null; // { kind, left, step }
let quiet = 30;

const EVENTS = [
  { kind: 'shift', len: 14, label: 'Shift: a new batch of bottles sits higher in the filler' },
  { kind: 'drift', len: 22, label: 'Drift: a slowly warming fill valve' },
  { kind: 'spike', len: 1, label: 'Spike: one bottle double-filled by a sticky nozzle' },
  { kind: 'spread', len: 16, label: 'Wider spread: a worn seal lets pressure wander' },
  { kind: 'down', len: 14, label: 'Shift down: low syrup level in the header tank' },
];
let lastLabel = '';

function nextValue() {
  if (!event && --quiet <= 0) {
    const e = R.pick(EVENTS);
    event = { ...e, left: e.len, step: 0 };
    lastLabel = e.label;
  }
  let mu = TARGET, s = SIGMA;
  if (event) {
    event.step++;
    if (event.kind === 'shift') mu += 1.6;
    if (event.kind === 'down') mu -= 1.8;
    if (event.kind === 'drift') mu += 0.13 * event.step;
    if (event.kind === 'spike') mu += 4.6;
    if (event.kind === 'spread') s *= 2.3;
    if (--event.left <= 0) { event = null; quiet = R.int(28, 48); }
  }
  return R.normal(mu, s);
}

for (let i = 0; i < 44; i++) { xs.push(nextValue()); t++; }

const host = $('#live-chart');
const chart = new Chart(host, { height: 300, margin: { top: 18, right: 64, bottom: 40, left: 52 } });
legend($('#live-legend'), [
  { label: 'Fill volume', swatch: 'line', color: 'data' },
  { label: 'Control limits, 500 ± 3 mL', swatch: 'dash', color: 'ink' },
  { label: 'Signal', swatch: 'dot', color: 'signal' },
]);

let lastSignalAt = -Infinity;
let lastSignalRules = [];

function draw() {
  const WINDOW = host.clientWidth < 520 ? 36 : 60;
  const start = Math.max(0, xs.length - WINDOW);
  const view = xs.slice(start);
  const flags = weco(xs, TARGET, SIGMA);
  const pts = view.map((v, i) => [start + i + 1, v, flags[start + i]]);
  const lo = Math.min(495.6, ...view) - 0.3, hi = Math.max(504.4, ...view) + 0.3;
  const sig = pts.filter((p) => p[2].length);
  const latest = sig[sig.length - 1];
  const layers = [
    { type: 'zones', cl: TARGET, sigma: SIGMA },
    { type: 'hline', y: TARGET, cls: 'center', label: 'CL 500' },
    { type: 'hline', y: TARGET + 3 * SIGMA, cls: 'limit', label: 'UCL 503' },
    { type: 'hline', y: TARGET - 3 * SIGMA, cls: 'limit', label: 'LCL 497' },
    { type: 'line', points: pts, cls: 'data' },
    { type: 'dots', points: pts, cls: (p) => (p[2].length ? 'signal' : 'dot'), r: (p) => (p[2].length ? 5 : 3.2) },
  ];
  if (latest) {
    layers.push({ type: 'annot', x: latest[0], y: latest[1], text: `Rule ${latest[2][0]}`, dx: 14, dy: latest[1] > TARGET ? -14 : 24, cls: 'label-signal' });
  }
  chart.update({
    x: { domain: [start + 0.5, start + WINDOW + 0.5], label: 'Bottle', ticks: 6 },
    y: { domain: [lo, hi], label: 'mL', ticks: [496, 498, 500, 502, 504].filter((v) => v > lo && v < hi) },
    aria: 'Live control chart of bottle fill volume with three-sigma limits at 497 and 503 mL',
    layers,
    hover: {
      xs: pts.map((p) => p[0]),
      mark: (i) => pts[i],
      render: (i) => ({
        title: `Bottle ${pts[i][0]}`,
        rows: [{ label: 'mL', value: fmt(pts[i][1], 2) }],
        note: pts[i][2].length ? pts[i][2].map((r) => `Rule ${r}: ${WECO_TEXT[r]}`).join('. ') : undefined,
      }),
    },
  });

  const newest = flags[xs.length - 1];
  if (newest.length) { lastSignalAt = xs.length; lastSignalRules = newest; }
  const status = $('#live-status'), note = $('#live-note');
  if (xs.length - lastSignalAt < 10) {
    pill(status, `Signal · rule ${lastSignalRules[0]}`, 'signal');
    note.textContent = `${WECO_TEXT[lastSignalRules[0]]}. Cause: ${lastLabel.split(':')[1].trim()}.`;
    note.classList.add('is-signal');
  } else {
    pill(status, 'In control', 'ok');
    note.textContent = 'Watching for the four Western Electric rules.';
    note.classList.remove('is-signal');
  }
}

const fig = host.closest('.fig');
const toggle = $('#live-toggle');
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
let playing = !reduce;
let visible = true;
let timer = null;

function tick() { xs.push(nextValue()); t++; draw(); }
function sync() {
  const run = playing && visible && !document.hidden;
  if (run && !timer) timer = setInterval(tick, 650);
  if (!run && timer) { clearInterval(timer); timer = null; }
  toggle.textContent = playing ? 'Pause' : 'Play';
  toggle.setAttribute('aria-pressed', String(playing));
  fig.classList.toggle('is-paused', !playing);
}
toggle.addEventListener('click', () => { playing = !playing; sync(); });
new IntersectionObserver(([e]) => { visible = e.isIntersecting; sync(); }).observe(host);
document.addEventListener('visibilitychange', sync);
draw();
sync();

/* ---------- course map ---------- */

function card(m) {
  const s = progress.summary(m.n);
  const a = document.createElement('a');
  a.className = `card${m.n === 12 ? ' capstone' : ''}`;
  a.href = `modules/${m.slug}.html`;
  const status = s.complete
    ? `<span class="card-status is-done">${statusRing(1, true)}Complete</span>`
    : s.visited
      ? `<span class="card-status">${statusRing(s.fraction, false)}${s.total ? `${s.answered} of ${s.total} checks` : 'Started'}</span>`
      : '<span class="card-status">Not started</span>';
  a.innerHTML = `<div class="glyph">${glyph(m.n, '')}</div><span class="card-n">Module ${String(m.n).padStart(2, '0')}</span><div><h4></h4><p></p></div>
    <div class="card-foot"><span>${m.minutes} min</span>${status}</div>`;
  a.querySelector('h4').textContent = m.title;
  a.querySelector('p').textContent = m.blurb;
  return a;
}

function drawMap() {
  const host = $('#parts');
  host.replaceChildren(...PARTS.map((p, i) => {
    const part = document.createElement('div');
    part.className = 'part';
    const head = document.createElement('div');
    head.className = 'part-head';
    head.innerHTML = `<span class="eyebrow">Part ${i + 1}</span><h3></h3>`;
    head.querySelector('h3').textContent = p.title;
    const cards = document.createElement('div');
    cards.className = `cards${p.modules.length === 1 ? ' single' : ''}`;
    cards.append(...p.modules.map((n) => card(MODULES.find((m) => m.n === n))));
    part.append(head, cards);
    return part;
  }));
}
drawMap();
window.addEventListener('progress:change', drawMap);
