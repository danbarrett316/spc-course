// Reference: an interactive guide to choosing a control chart.
// One question at a time; answers build a breadcrumb; the last answer opens a
// recommendation card with the chart, the reason, its key formula and a link.

import { MODULES } from '../course-data.js';
import { setTex, $ } from '../ui.js';

const mod = (n) => MODULES.find((m) => m.n === n);
const pad2 = (n) => String(n).padStart(2, '0');
const modLink = (n, hash = '', label) => ({ href: `../modules/${mod(n).slug}.html${hash}`, label: label ?? `Module ${pad2(n)} · ${mod(n).title}` });

/* ---------- questions ---------- */

const SHEWHART = { 1: 'imr', small: 'xr', large: 'xs' };

const QUESTIONS = {
  start: {
    q: 'What do you record for each sample?',
    options: [
      { label: 'A measurement', sub: 'A reading on a continuous scale: length in mm, fill volume in mL, temperature in °C.', crumb: 'Measurements', next: 'vars' },
      { label: 'A count or a pass/fail result', sub: 'Scratches on a panel, chips that fail a probe test, late deliveries.', crumb: 'Counts', next: 'attr' },
    ],
  },
  vars: {
    q: 'How many quality characteristics do you watch together?',
    options: [
      { label: 'One', sub: 'A single measurement, or several that you are happy to chart separately.', crumb: 'One variable', next: 'indep' },
      { label: 'Several that are correlated', sub: 'For example length and width of the same part, which tend to move together.', crumb: 'Several correlated variables', next: 'multi' },
    ],
  },
  multi: {
    q: 'Does the chart need to catch small, sustained shifts?',
    hint: 'A small shift here means a move of about 1.5 standard deviations or less that persists.',
    options: [
      { label: 'No, larger shifts are what matter', crumb: 'Large shifts', next: 'R:t2' },
      { label: 'Yes, small shifts matter', crumb: 'Small shifts', next: 'R:mewma' },
    ],
  },
  indep: {
    q: 'Are consecutive values independent of each other?',
    hint: 'Plot each value against the one before it. A clear upward slope means the data are autocorrelated, which is common when a continuous process is sampled often.',
    options: [
      { label: 'Yes, roughly independent', crumb: 'Independent', next: 'subgroup' },
      { label: 'No, each value tends to follow the last', crumb: 'Autocorrelated', next: 'R:resid' },
    ],
  },
  subgroup: {
    q: 'How many readings make up each sample?',
    hint: 'A subgroup is a set of readings taken close together, under the same conditions.',
    options: [
      { label: 'One', sub: 'One reading per batch, per shift or per hour.', crumb: 'Subgroups of 1', set: { n: 1 }, next: 'shift' },
      { label: '2 to 10', sub: 'For example five parts taken from the line every hour.', crumb: 'Subgroups of 2 to 10', set: { n: 'small' }, next: 'shift' },
      { label: 'More than 10', sub: 'Large subgroups, often from automated gauges.', crumb: 'Subgroups over 10', set: { n: 'large' }, next: 'shift' },
    ],
  },
  shift: {
    q: 'Does the chart need to catch small, sustained shifts quickly?',
    hint: 'A Shewhart chart takes about 44 samples, on average, to notice a 1σ shift in the plotted statistic.',
    options: [
      { label: 'No, larger shifts are what matter', sub: 'Shifts of about 2σ or more, or occasional spikes.', crumb: 'Large shifts', next: (ctx) => `R:${SHEWHART[ctx.n]}` },
      { label: 'Yes, shifts of 1.5σ or less matter', sub: 'A slow drift or a small step that persists.', crumb: 'Small shifts', next: 'small' },
    ],
  },
  small: {
    q: 'Which suits your process better?',
    options: [
      { label: 'Tune the chart to one shift size', sub: 'You know the smallest shift worth catching and want to know when it began.', crumb: 'Tuned to a shift', next: 'R:cusum' },
      { label: 'A smoothed running average', sub: 'Easy to explain, and less sensitive to data that are not quite normal.', crumb: 'Smoothed average', next: 'R:ewma' },
    ],
  },
  attr: {
    q: 'What exactly do you count?',
    options: [
      { label: 'Defective units', sub: 'Each unit passes or fails, and a failed unit counts once however many flaws it has.', crumb: 'Defective units', next: 'sameN' },
      { label: 'Defects', sub: 'Individual flaws. One unit can carry several.', crumb: 'Defects', next: 'sameA' },
    ],
  },
  sameN: {
    q: 'Is the number of units inspected the same in every sample?',
    options: [
      { label: 'Yes, always the same', crumb: 'Constant n', next: 'R:np' },
      { label: 'No, it varies', crumb: 'Varying n', next: 'R:p' },
    ],
  },
  sameA: {
    q: 'Is the amount inspected the same in every sample?',
    hint: 'The same area, length or number of units each time.',
    options: [
      { label: 'Yes, always the same', crumb: 'Constant area', next: 'R:c' },
      { label: 'No, it varies', crumb: 'Varying area', next: 'R:u' },
    ],
  },
};

/* ---------- recommendations ---------- */

const SHEWHART_NAME = { 1: 'individuals and moving range chart', small: 'X̄ and R chart', large: 'X̄ and s chart' };
const SHEWHART_MOD = { 1: 4, small: 3, large: 3 };
const ON = { 1: 'individual values', small: 'subgroup averages', large: 'subgroup averages' };

const RECS = {
  imr: {
    name: 'Individuals and moving range chart',
    why: 'With one reading per sample there is no spread within a subgroup to estimate σ from. The moving range between neighbouring readings stands in for it.',
    tex: '\\bar{x} \\pm 2.66\\,\\overline{MR}, \\qquad UCL_{MR} = 3.267\\,\\overline{MR}',
    also: 'Check a histogram first. Individuals charts assume roughly normal data and react slowly to small shifts.',
    links: [modLink(4)],
  },
  xr: {
    name: 'X̄ and R chart',
    why: 'Averages of a few readings catch shifts in the process mean, and for subgroups of 2 to 10 the range measures spread almost as well as the standard deviation.',
    tex: '\\bar{\\bar{x}} \\pm A_2\\bar{R}, \\qquad D_3\\bar{R} \\le R \\le D_4\\bar{R}',
    also: 'Run the R chart first. If the spread is out of control, the X̄ limits are not reliable.',
    links: [modLink(3)],
  },
  xs: {
    name: 'X̄ and s chart',
    why: 'Beyond about 10 readings the range throws away information, and the subgroup standard deviation measures spread better.',
    tex: '\\bar{\\bar{x}} \\pm A_3\\bar{s}, \\qquad B_3\\bar{s} \\le s \\le B_4\\bar{s}',
    also: 'The same chart handles subgroups of unequal size if you compute the limits for each subgroup.',
    links: [modLink(3)],
  },
  cusum: {
    name: 'CUSUM chart',
    why: 'A cumulative sum adds up small deviations from target, so a persistent shift builds until it crosses the decision interval h. Set the reference value k to half the shift you want to catch.',
    tex: 'S_{hi}(i) = \\max\\left[0,\\ S_{hi}(i-1) + x_i - \\mu_0 - k\\right]',
    also: (ctx) => `Run it on the ${ON[ctx.n]}, and keep the ${SHEWHART_NAME[ctx.n]} alongside it. A Shewhart chart still catches large, sudden shifts sooner.`,
    links: (ctx) => [modLink(6), modLink(SHEWHART_MOD[ctx.n])],
  },
  ewma: {
    name: 'EWMA chart',
    why: 'An exponentially weighted moving average gives recent points more weight than old ones. With a small weight λ it detects shifts of about 1σ and tolerates data that are not quite normal.',
    tex: 'z_t = \\lambda x_t + (1-\\lambda)\\,z_{t-1}',
    also: (ctx) => `Run it on the ${ON[ctx.n]}, and keep the ${SHEWHART_NAME[ctx.n]} alongside it. A Shewhart chart still catches large, sudden shifts sooner.`,
    links: (ctx) => [modLink(7), modLink(SHEWHART_MOD[ctx.n])],
  },
  resid: {
    name: 'Residuals chart from a time-series model',
    why: 'Control limits assume independent points. On autocorrelated data a Shewhart chart raises false alarms or misses real changes. Fit a time-series model and chart its one-step-ahead forecast errors, which should be independent.',
    tex: 'e_t = x_t - \\hat{x}_t',
    also: 'Chart the residuals with an individuals chart, or with a CUSUM or EWMA for small shifts.',
    links: [modLink(11)],
  },
  t2: {
    name: 'Hotelling T² chart',
    why: 'Separate charts for correlated variables miss points that are unusual in combination and inflate the overall false-alarm rate. T² measures each sample\'s distance from the center, allowing for the correlation.',
    tex: 'T^2 = n\\,(\\bar{\\mathbf{x}} - \\bar{\\bar{\\mathbf{x}}})^{\\top} S^{-1} (\\bar{\\mathbf{x}} - \\bar{\\bar{\\mathbf{x}}})',
    also: 'When T² signals, look at the individual variables to find which ones moved.',
    links: [modLink(10)],
  },
  mewma: {
    name: 'MEWMA chart',
    why: 'The multivariate EWMA smooths each variable over time before computing a T²-type distance, so small shifts in several correlated variables build up into a signal.',
    tex: '\\mathbf{z}_t = \\lambda\\mathbf{x}_t + (1-\\lambda)\\mathbf{z}_{t-1}, \\qquad T_t^2 = \\mathbf{z}_t^{\\top}\\Sigma_{z}^{-1}\\mathbf{z}_t',
    also: 'Keep a T² chart alongside it for large, sudden shifts.',
    links: [modLink(10)],
  },
  np: {
    name: 'np chart',
    why: 'With the same number of units in every sample, the count of defective units is easy to record and gives the same signals as the fraction.',
    tex: 'n\\bar{p} \\pm 3\\sqrt{n\\bar{p}(1-\\bar{p})}',
    also: 'If the LCL comes out negative, set it to zero. The chart then cannot signal an improvement.',
    links: [modLink(5, '#p-chart')],
  },
  p: {
    name: 'p chart',
    why: 'The fraction defective puts samples of different sizes on one scale. Each sample gets its own limits, wider for small samples, so the limit lines become steps.',
    tex: '\\bar{p} \\pm 3\\sqrt{\\frac{\\bar{p}(1-\\bar{p})}{n_i}}, \\qquad \\bar{p} = \\frac{\\sum D_i}{\\sum n_i}',
    also: 'Pool the totals to find p̄. Averaging the sample fractions gives small samples too much weight.',
    links: [modLink(5, '#p-chart')],
  },
  c: {
    name: 'c chart',
    why: 'Defects from samples of the same size follow a Poisson model, whose variance equals its mean. The chart plots the raw count.',
    tex: '\\bar{c} \\pm 3\\sqrt{\\bar{c}}',
    also: 'If the average count is 9 or less, the chart has no lower limit, and for small means the upper limit raises more false alarms than promised. Probability limits or a square-root transformation help with both.',
    links: [modLink(5, '#c-chart'), modLink(5, '#better-limits', 'Better limits for small counts')],
  },
  u: {
    name: 'u chart',
    why: 'Dividing each count by the amount inspected puts samples of different sizes on one scale. Larger samples get narrower limits.',
    tex: '\\bar{u} \\pm 3\\sqrt{\\frac{\\bar{u}}{n_i}}, \\qquad \\bar{u} = \\frac{\\sum c_i}{\\sum n_i}',
    also: 'Measure each sample size in inspection units, such as square metres of film or number of boards.',
    links: [modLink(5, '#u-chart')],
  },
};

/* ---------- rendering ---------- */

const box = $('#guide');
const crumbs = $('#guide-crumbs');
const stage = $('#guide-stage');
let path = []; // [{ node, option }]

function context() {
  const ctx = {};
  for (const step of path) Object.assign(ctx, QUESTIONS[step.node].options[step.option].set ?? {});
  return ctx;
}

function currentKey() {
  let key = 'start';
  const ctx = {};
  for (const step of path) {
    const opt = QUESTIONS[step.node].options[step.option];
    Object.assign(ctx, opt.set ?? {});
    key = typeof opt.next === 'function' ? opt.next(ctx) : opt.next;
  }
  return key;
}

function make(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) withXbar(n, text);
  return n;
}

/** Set text, drawing X̄ as an overlined X (the combining macron sits badly in the UI fonts). */
function withXbar(node, text) {
  node.replaceChildren();
  String(text).split('X̄').forEach((part, i) => {
    if (i) { const x = document.createElement('span'); x.className = 'ovl'; x.textContent = 'X'; node.append(x); }
    if (part) node.append(document.createTextNode(part));
  });
}

function renderCrumbs() {
  crumbs.replaceChildren();
  const first = make('li');
  const startBtn = make('button', '', 'Start');
  startBtn.type = 'button';
  startBtn.addEventListener('click', () => go(0));
  if (!path.length) startBtn.setAttribute('aria-current', 'step');
  first.append(startBtn);
  crumbs.append(first);
  path.forEach((step, i) => {
    const li = make('li');
    const b = make('button', '', QUESTIONS[step.node].options[step.option].crumb);
    b.type = 'button';
    b.title = 'Change this answer';
    b.addEventListener('click', () => go(i));
    li.append(b);
    crumbs.append(li);
  });
}

function renderQuestion(key) {
  const Q = QUESTIONS[key];
  const wrap = make('div', 'guide-step');
  const h = make('h3', 'guide-q', Q.q);
  h.tabIndex = -1;
  wrap.append(make('p', 'eyebrow', `Question ${path.length + 1}`), h);
  if (Q.hint) wrap.append(make('p', 'guide-hint', Q.hint));
  const list = make('ul', 'guide-options');
  Q.options.forEach((o, i) => {
    const li = make('li');
    const b = make('button', 'guide-opt');
    b.type = 'button';
    b.append(make('strong', '', o.label));
    if (o.sub) b.append(make('span', '', o.sub));
    b.addEventListener('click', () => { path.push({ node: key, option: i }); render(true); });
    li.append(b);
    list.append(li);
  });
  wrap.append(list);
  stage.replaceChildren(wrap);
  return h;
}

function renderRec(key) {
  const ctx = context();
  const R = RECS[key];
  const card = make('div', 'rec');
  card.append(make('p', 'eyebrow', 'Recommended chart'));
  const h = make('h3', '', R.name);
  h.tabIndex = -1;
  card.append(h, make('p', 'rec-why', R.why));
  const eq = make('div', 'eq');
  card.append(eq);
  const also = typeof R.also === 'function' ? R.also(ctx) : R.also;
  if (also) card.append(make('p', 'rec-also', also));
  const row = make('div', 'rec-links');
  const links = typeof R.links === 'function' ? R.links(ctx) : R.links;
  links.forEach((l, i) => {
    // one child, so the button's flex gap does not split the label around X̄
    const a = make('a', i ? 'btn' : 'btn primary');
    a.append(make('span', '', l.label));
    a.href = l.href;
    row.append(a);
  });
  const again = make('button', 'btn ghost', 'Start over');
  again.type = 'button';
  again.addEventListener('click', () => go(0));
  row.append(again);
  card.append(row);
  stage.replaceChildren(card);
  setTex(eq, R.tex);
  return h;
}

function render(moveFocus) {
  renderCrumbs();
  const key = currentKey();
  const heading = key.startsWith('R:') ? renderRec(key.slice(2)) : renderQuestion(key);
  box.dataset.state = key.startsWith('R:') ? 'done' : 'asking';
  if (moveFocus) {
    box.dataset.animate = '';
    heading.focus({ preventScroll: true });
  }
}

function go(i) {
  path = path.slice(0, i);
  render(true);
}

render(false);
