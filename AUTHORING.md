# Authoring guide

How the course is built, so new modules look and behave like the existing ones.
Read this together with `modules/01-variation.html` and `assets/js/modules/01-variation.js`,
which are the reference implementation.

## Stack

Static HTML, CSS and ES modules. No build step, no framework, no npm dependencies.
The only external resources are Google Fonts and KaTeX (for math) from jsDelivr.
Serve the folder with any static server, e.g. `python3 -m http.server 8123`.

```
index.html                     home page (hero + course map)
modules/NN-slug.html           one page per module
reference/*.html               formula sheet, chart chooser, glossary
assets/css/course.css          the whole design system (tokens, layout, components, chart styles)
assets/js/course.js            page chrome: rail, header details, numbering, checks, footer
assets/js/course-data.js       the course outline (titles, slugs, minutes, NIST sections)
assets/js/chart.js             declarative SVG chart kit (class Chart)
assets/js/stats.js             statistics: distributions, SPC constants, chart computations, seeded RNG
assets/js/ui.js                widget helpers: bindRange, segmented, readouts, legend, pill, renderMath
assets/js/quiz.js              self-marking checks (.check blocks)
assets/js/modules/NN-slug.js   one script per module with that module's figures
```

## Page skeleton

Copy the `<head>` of `modules/01-variation.html` exactly and change only the `<title>`,
the description and the module script path. Keep `class="math-pending"` on `<html>`.
Set `<body data-module="N">`. Page structure:

```html
<div class="shell">
<nav class="rail" id="rail"></nav>
<main class="page" id="main">
  <header class="module-head">
    <h1>Title</h1>
    <p class="lede">One or two sentences on what the module teaches and why it matters.</p>
  </header>
  <section id="kebab-id"><h2>Section title</h2> … </section>
  …
  <section id="summary" class="summary"><h2>Takeaways</h2><ul>…</ul></section>
</main>
</div>
```

`course.js` adds the eyebrow, glyph, reading time, NIST links, section numbers (N.1, N.2 …),
figure numbers, the rail and the footer with previous/next links. Do not write those by hand.
Section `id`s should be short kebab-case words because they become `#anchors`.

## Prose components

- Paragraphs, `<ul>`, `<ol>`, `<strong>`, `<em>` inside sections.
- Inline math: `<span class="m">\bar{x} \pm 3\sigma</span>`. Display math: `<div class="eq">…</div>`.
  Write TeX; KaTeX renders it to native MathML. Escape `<` as `&lt;` and `&` as `&amp;` inside TeX.
  For aligned multi-line formulas use `\begin{aligned} … \end{aligned}` inside one `.eq`.
- Symbol list after an equation:
  `<dl class="where"><dt><span class="m">\bar{R}</span></dt><dd>average subgroup range</dd>…</dl>`
- `<div class="key-idea"><span class="eyebrow">Key idea</span><p>…</p></div>`: one per section at most.
- `<div class="pitfall"><span class="eyebrow">Common mistake</span><p>…</p></div>`
- `<div class="from-nist"><span class="eyebrow">Handbook 6.3.2.1</span><p>…</p></div>`: a short paraphrase
  of the handbook with a link. Do not paste handbook text verbatim.
- `<div class="def-grid"><div class="def"><h3><span class="dot"></span>Term</h3><span class="aka">…</span><p>…</p></div>…</div>`
  (`.dot` variants: `signal`, `spec`, `alt`).
- `<ol class="steps"><li><span><strong>Step.</strong> text</span></li></ol>` for real procedures.
- Static tables: `<div class="table-scroll"><table class="ref">…</table></div>`; numeric cells get `class="num"`.
- Static diagrams: inline `<svg>` inside `<div class="diagram">`, using classes `dg-node`, `dg-node-accent`,
  `dg-node-signal`, `dg-node-good`, `dg-node-spec`, `dg-text`, `dg-sub`, `dg-edge`, `dg-edge-label`,
  `dg-arrowhead` (see the loop diagram in module 1). Never hard-code colors.

## Figures

Every interactive figure is a `.fig` card:

```html
<figure class="fig" id="fig-something">
  <div class="fig-head"><span class="fig-num"></span><h3 class="fig-title">What it shows</h3></div>
  <div class="controls">
    <label class="control" for="n-size">
      <span class="control-label">Subgroup size <output for="n-size"></output></span>
      <input type="range" id="n-size" min="2" max="10" step="1" value="5">
    </label>
    <div class="control"><span class="control-label">Chart</span>
      <div class="seg" id="chart-type"><button data-value="r" aria-pressed="true">R</button><button data-value="s">s</button></div>
    </div>
  </div>
  <div class="fig-chart" id="some-chart"></div>
  <ul class="legend" id="some-legend"></ul>
  <div id="some-readouts"></div>
  <figcaption>What to try, and what to notice.</figcaption>
</figure>
```

- `.fig-num` stays empty; it is numbered automatically.
- Put controls above the chart. Keep each figure to the controls it needs (usually 1–4).
- Side-by-side charts: wrap in `<div class="fig-split">` (add class `even` for equal columns).
- A figure opens in a realistic working state (data already plotted). Never start empty.
- Buttons: `.btn`, `.btn.primary`, `.btn.ghost`, `.btn.small`. Checkbox: `<label class="check-inline"><input type="checkbox" id=…> Text</label>`.
- Text that changes with a control: `<div class="state-panel">` with an `<h4>` and `<p>`s.
- Data tables for real datasets: `<details class="data"><summary>Data table</summary><div class="table-wrap" id="…"></div></details>`
  filled with `dataTable()` from chart.js. Do this for every handbook dataset you plot.
- Every figure gets a `<figcaption>` that says what to try and what to notice.
- Each `id` must be unique on the page and stable (the platform restores form state by id).

## Charts (assets/js/chart.js)

```js
import { Chart, el, pad, dataTable } from '../chart.js';
const c = new Chart(document.getElementById('some-chart'), { height: 260 });
c.update({
  x: { domain: [0.5, 25.5], label: 'Sample', ticks: 6, format: (v) => … },
  y: { domain: [lo, hi], label: 'mm' },
  aria: 'One sentence describing the chart',
  layers: [ … ],
  hover: { xs: [...], mark: (i) => [x, y], render: (i) => ({ title, rows: [{ label, value, key }], note }) },
});
```

Call `update()` again with a fresh spec whenever anything changes; the chart redraws itself
(also on resize). Options: `height` (number or `w => number`), `margin: {top,right,bottom,left}`
(right margin holds the line labels; default 76). Axis options: `domain`, `label`, `ticks` (count or
array), `format`, `grid` (y gridlines on by default, x off), `axis: false` to hide.

Layer types (`cls` names map to `.k-<cls>` styles in course.css):

| type | fields |
|---|---|
| `zones` | `cl`, `sigma`: shaded ±1/2/3σ bands with A/B/C labels |
| `band` / `xband` | `y0, y1` / `x0, x1`, `cls` (`band`, `band-signal`, `band-spec`, `band-accent`) |
| `hline` | `y`, `cls` (`center`, `limit`, `limit-soft`, `spec`, `target`, `marker`), `label` (drawn in the right margin, auto-spaced) |
| `vline` | `x`, `cls` (`marker`, `shift`, `spec`), `label`, optional `top`/`bottom` |
| `line` | `points: [[x,y],…]` (null y breaks the line), `cls` (`data`, `data-thin`, `alt`, `alt2`, `ink`, `faint`, `curve`, `curve-alt`; add ` dashed`), `step: true` for step-after |
| `area` | `points`, `base` (number) or `lower` (points), `cls` (`area`, `area-strong`, `area-signal`, `area-spec`, `area-alt`, `area-muted`) |
| `bars` | `bars: [{x0, x1, y, y0?, cls?}]`, `cls` (`bar`, `bar-muted`, `bar-alt`, `bar-signal`, `bar-spec`) |
| `dots` | `points`, `cls` (string or `(p, i) => string`: `dot`, `signal`, `dot-alt`, `dot-alt2`, `dot-muted`, `dot-ink`, `dot-hollow`), `r` |
| `text` | `x, y, text, cls (label, label-strong, label-signal), anchor, dx, dy` |
| `annot` | `x, y, text, dx, dy, cls`: a label with a leader line to a point |
| `path` | `d: (sx, sy, dims) => 'M…'`, `cls` (`ellipse`, `box`, `vmask`, `curve` …) |
| `custom` | `draw: (g, sx, sy, dims) => { el('rect', {...}, g) }` for anything else |
| `handle` | draggable: `x`/`y`, `axis: 'x' or 'y' or 'xy'`, `label`, `onDrag(x, y)`, `step`; `cls: 'accent'` or `'ink'` recolors a line handle (default amber, for spec limits) |

Color semantics are fixed across the course. Do not invent new ones:
- blue `data`: the plotted process statistic
- red `signal`: out-of-control points and the shifts that cause them
- amber `spec`: specification limits and targets (the voice of the customer)
- dashed ink `limit`: control limits; solid ink `center`: center line
- violet `alt` / green `alt2`: a second or third statistic (e.g. S_lo, EWMA, a forecast)

Mark signals with the `signal` dot class and say which rule fired in the tooltip `note`.
Use `hover` on every time-series chart. Label control lines with their values, e.g. `UCL 52.59`.
Never write colors in JS or inline styles; use the classes above or tokens in CSS.

## Statistics (assets/js/stats.js)

Descriptive: `sum, mean, min, max, range, variance, sd, quantile, movingRanges, histogram(values, lo, hi, k)`.
Distributions: `normPdf, normCdf, normInv, binomPmf, binomCdf, poissonPmf, poissonCdf, chi2Cdf, chi2Inv,
fCdf, fInv, betaCdf, betaInv, tCdf, tInv, lgamma, gammaP, betaI`.
SPC: `spcConstants(n)` → `{d2, d3, c4, A2, D3, D4, A3, B3, B4, E2}` for n = 2..25; `subgroups(values, n)`;
`xbarR(groups)`, `xbarS(groups)`, `imr(values)`; `cusum(xs, mu0, k, h)`; `ewma(xs, target, sigma, lambda, L, asymptotic)`;
`weco(values, cl, sigma, { rules, trends })` returns per-point arrays of rule numbers, with `WECO_TEXT`;
`shewhartArl(delta, L)`, `cusumArl(delta, k, h)` (one-sided, standardized).
Random: `rng(seed)` → `{ uniform, normal(mu, s), poisson(l), binomial(n, p), int(lo, hi), pick(arr) }`.
Always seed simulations so a figure looks the same on every load; offer a "New sample" button to reseed.
Formatting: `fmt(v, d)` (real minus sign), `fmtRate(p)` (%, ppm, ppb), `fmtInt(v)`.

Add a statistical function to your module script rather than editing stats.js. If you believe
stats.js or chart.js has a bug, say so in your report instead of changing it.

## UI helpers (assets/js/ui.js)

`bindRange(id, onInput, { format })` binds a slider and its `<output for=id>`;
`segmented(id, onChange)` drives a `.seg` group (buttons need `data-value`);
`readouts(el, [{ label, value, sub, state: 'signal' | 'good' }])`;
`legend(el, [{ label, swatch: 'line' | 'dash' | 'dot' | 'box', color: 'data' | 'signal' | 'spec' | 'alt' | 'alt2' | 'ink' | 'muted' }])`;
`pill(el, text, 'ok' | 'signal' | 'warn')`; `renderMath(root)` and `setTex(el, tex)` for math that changes live.

Insert any text that comes from data with `textContent`, never `innerHTML`.

## Checks (quiz.js)

Three to six per module, placed right after the idea they test (not all at the end).
Ids are `m<N>-q<k>`. Vary the position of the correct answer. Give every wrong option a
`data-why` that explains the misconception, and every check a `.check-explain`.

```html
<div class="check" id="m3-q1">
  <p class="check-q">Question?</p>
  <ul class="check-options">
    <li data-why="Why this is wrong.">Option</li>
    <li data-correct>Right option</li>
  </ul>
  <div class="check-explain"><p>Worked reasoning.</p></div>
</div>

<div class="check" id="m3-q2" data-answer="52.59" data-tolerance="0.02" data-unit="mm">
  <p class="check-q">Compute the UCL to two decimals.</p>
  <div class="check-explain"><p>Worked answer with the numbers.</p></div>
</div>
```

Numeric checks should come from a handbook example or a figure the reader can see.

## Writing

- Audience: engineers, analysts and students meeting SPC for the first time. Assume high-school
  algebra and a little statistics (mean, standard deviation, normal curve); explain everything else.
- Plain, direct sentences in the active voice. Explain why before how. Use concrete process examples
  with real units (mL, mm, µm, defects per wafer).
- Do not use em-dash asides, "not X, but Y" constructions, colon-then-reveal sentences, scare quotes,
  or filler such as "it's worth noting", "dive into", "let's explore", "crucial", "powerful".
- Paraphrase the handbook in your own words and link to its sections. Short attributed quotes only.
- Use the handbook's worked examples and datasets where it has them, and say so ("the handbook's
  flow-rate example"). Check every number you print against the handbook or recompute it in Node.
- Use sentence case for headings. Use "s" not "S" for the sample standard deviation, X̄ for averages.
- 5–7 sections per module, 1 figure per main idea (typically 3–5 figures), a Takeaways summary.

## Accessibility and polish

- Every chart has an `aria` description and keyboard hover (built in). Controls have labels.
- Make sure nothing overflows at 375px width. Charts resize automatically; long tables go in
  `.table-wrap` or `.table-scroll`.
- Respect `prefers-reduced-motion`: do not autoplay animations; start them from a button.
