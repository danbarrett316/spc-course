// course.js: page chrome shared by every page. Builds the course rail, the module
// header details, section and figure numbers, the checks, and the module footer.

import { COURSE, PARTS, MODULES, REFERENCE, nistUrl } from './course-data.js';
import { glyph, MARK } from './glyphs.js';
import { progress, statusRing } from './progress.js';
import { initChecks } from './quiz.js';
import { renderMath, syncRange, $, $$ } from './ui.js';

const ROOT = new URL('../../', import.meta.url);
const href = (path) => new URL(path, ROOT).href;
const modHref = (m) => href(`modules/${m.slug}.html`);
const pad2 = (n) => String(n).padStart(2, '0');

const body = document.body;
const moduleN = Number(body.dataset.module) || null;
const current = MODULES.find((m) => m.n === moduleN) ?? null;
const pageKey = body.dataset.page ?? (current ? `module-${current.n}` : 'home');

/* ---------- theme ---------- */

const THEME_KEY = 'in-control:theme';
function getTheme() { try { return localStorage.getItem(THEME_KEY) || 'system'; } catch { return 'system'; } }
function setTheme(t) {
  try { localStorage.setItem(THEME_KEY, t); } catch { /* ignore */ }
  if (t === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
  $$('.theme-switch button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.theme === t)));
}

/* ---------- rail ---------- */

function buildRail() {
  const rail = $('#rail');
  if (!rail) return;
  rail.setAttribute('aria-label', 'Course map');
  const parts = PARTS.map((p) => {
    const items = p.modules.map((n) => {
      const m = MODULES.find((x) => x.n === n);
      const s = progress.summary(n);
      const cur = current && current.n === n;
      return `<a class="rail-item" href="${modHref(m)}"${cur ? ' aria-current="page"' : ''} data-n="${n}">
          <span class="ring">${statusRing(s.fraction, s.complete)}</span><span class="n">${pad2(n)}</span><span class="t"></span></a>
          ${cur ? '<ul class="rail-sections"></ul>' : ''}`;
    }).join('');
    return `<div class="rail-part"><span class="eyebrow">${p.title}</span>${items}</div>`;
  }).join('');
  const refs = REFERENCE.map((r) => `<a href="${href(`reference/${r.slug}.html`)}"${pageKey === r.slug ? ' aria-current="page"' : ''}>${r.title}</a>`).join('');
  rail.innerHTML = `
    <div class="rail-head">
      <a class="brand" href="${href('index.html')}">${MARK}<span>${COURSE.name}</span></a>
      <button class="icon-btn rail-close" type="button" aria-label="Close course map">
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
      </button>
    </div>
    ${parts}
    <div class="rail-part"><span class="eyebrow">Reference</span><div class="rail-links" style="padding:0 .5rem">${refs}</div></div>
    <div class="rail-foot">
      <div class="theme-switch" role="group" aria-label="Color theme">
        <button type="button" data-theme="system">Auto</button><button type="button" data-theme="light">Light</button><button type="button" data-theme="dark">Dark</button>
      </div>
      <span>Based on chapter 6 of the <a href="${COURSE.source}" target="_blank" rel="noopener">NIST/SEMATECH e-Handbook of Statistical Methods</a>.</span>
      <span>Your progress is saved in this browser only. <button type="button" class="btn ghost small reset-progress" style="padding:.1rem .3rem;margin-left:-.3rem">Reset progress</button></span>
    </div>`;
  // module titles are plain text
  $$('.rail-item', rail).forEach((a) => { a.querySelector('.t').textContent = MODULES.find((m) => m.n === Number(a.dataset.n)).short; });

  // current module's sections
  const ul = $('.rail-sections', rail);
  if (ul) {
    for (const sec of $$('main section[id]')) {
      const h = sec.querySelector(':scope > h2');
      if (!h) continue;
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = `#${sec.id}`;
      a.textContent = h.dataset.title ?? h.textContent.replace(/^\s*\d+(\.\d+)*\s*/, '');
      li.append(a);
      ul.append(li);
    }
    const links = $$('a', ul);
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        links.forEach((l) => l.classList.toggle('is-active', l.getAttribute('href') === `#${e.target.id}`));
      }
    }, { rootMargin: '-20% 0px -70% 0px' });
    $$('main section[id]').forEach((s) => io.observe(s));
  }

  // theme
  $$('.theme-switch button', rail).forEach((b) => b.addEventListener('click', () => setTheme(b.dataset.theme)));
  setTheme(getTheme());

  // reset (two-step, since confirm() dialogs are not always available)
  const reset = $('.reset-progress', rail);
  let armed = false;
  reset.addEventListener('click', () => {
    if (!armed) { armed = true; reset.textContent = 'Click again to reset'; setTimeout(() => { armed = false; reset.textContent = 'Reset progress'; }, 4000); return; }
    progress.reset();
    location.reload();
  });

  // mobile drawer
  const top = document.createElement('header');
  top.className = 'topbar';
  top.innerHTML = `<a class="brand" href="${href('index.html')}">${MARK}<span>${COURSE.name}</span></a>
    <button class="icon-btn menu-btn" type="button" aria-expanded="false" aria-controls="rail">
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>Course map</button>`;
  body.prepend(top);
  const menu = $('.menu-btn', top);
  let scrim = null;
  const close = () => { rail.classList.remove('is-open'); menu.setAttribute('aria-expanded', 'false'); scrim?.remove(); scrim = null; };
  const open = () => {
    rail.classList.add('is-open');
    menu.setAttribute('aria-expanded', 'true');
    scrim = document.createElement('div');
    scrim.className = 'rail-scrim';
    scrim.addEventListener('click', close);
    body.append(scrim);
    rail.querySelector('a, button')?.focus();
  };
  menu.addEventListener('click', () => (rail.classList.contains('is-open') ? close() : open()));
  $('.rail-close', rail).addEventListener('click', close);
  rail.addEventListener('click', (e) => { if (e.target.closest('a[href^="#"]')) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && rail.classList.contains('is-open')) close(); });

  window.addEventListener('progress:change', () => {
    $$('.rail-item', rail).forEach((a) => {
      const s = progress.summary(Number(a.dataset.n));
      a.querySelector('.ring').innerHTML = statusRing(s.fraction, s.complete);
    });
  });
}

/* ---------- module page structure ---------- */

function decorateModule() {
  if (!current) return;
  const head = $('.module-head');
  const part = PARTS.find((p) => p.modules.includes(current.n));
  if (head) {
    const h1 = $('h1', head);
    const lede = $('.lede', head);
    const eyebrow = document.createElement('p');
    eyebrow.className = 'eyebrow';
    eyebrow.textContent = `Module ${pad2(current.n)} · ${part.title}`;
    const text = document.createElement('div');
    text.className = 'head-text';
    text.append(eyebrow, h1);
    if (lede) text.append(lede);
    const meta = document.createElement('ul');
    meta.className = 'meta';
    const checks = $$('.check').length;
    meta.innerHTML = `<li><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M8 4.6V8l2.3 1.5" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>About ${current.minutes} minutes</li>
      ${checks ? `<li><svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="2" width="12" height="12" rx="3" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M5.2 8.2l1.9 1.9 3.8-4" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>${checks} checks</li>` : ''}
      <li><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 2.5h7.5L13 5v8.5H3z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M5.5 7h5M5.5 9.5h5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>NIST ${current.nist.map((s) => `<a href="${nistUrl(s)}" target="_blank" rel="noopener">§${s}</a>`).join(', ')}</li>`;
    text.append(meta);
    const grid = document.createElement('div');
    grid.className = 'head-grid';
    const g = document.createElement('div');
    g.className = 'glyph';
    g.innerHTML = glyph(current.n, `Illustration: ${current.title}`);
    grid.append(text, g);
    head.replaceChildren(grid);
    const toc = document.createElement('ul');
    toc.className = 'toc';
    toc.setAttribute('aria-label', 'Sections in this module');
    for (const sec of $$('main section[id]')) {
      const h = sec.querySelector(':scope > h2');
      if (!h) continue;
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = `#${sec.id}`;
      a.textContent = h.textContent;
      li.append(a);
      toc.append(li);
    }
    if (toc.children.length) head.append(toc);
  }

  // number sections and figures
  let s = 0;
  for (const h of $$('main section[id] > h2')) {
    if (h.closest('.summary')) continue;
    s++;
    h.dataset.title = h.textContent;
    const num = document.createElement('span');
    num.className = 'sec-num';
    num.textContent = `${current.n}.${s}`;
    h.prepend(num);
  }
  $$('.fig-num').forEach((el, i) => { if (!el.textContent.trim()) el.textContent = `Fig. ${current.n}.${i + 1}`; });
}

function moduleFooter(totalChecks) {
  if (!current) return;
  const main = $('main');
  const i = MODULES.indexOf(current);
  const prev = MODULES[i - 1], next = MODULES[i + 1];
  const foot = document.createElement('footer');
  foot.className = 'module-foot';
  foot.innerHTML = `
    <div class="complete-row"><p class="complete-text"></p><button type="button" class="btn complete-btn"></button></div>
    <nav class="pager" aria-label="Module navigation">
      ${prev ? `<a class="prev" href="${modHref(prev)}"><span class="eyebrow">Previous · Module ${pad2(prev.n)}</span><strong></strong></a>` : ''}
      ${next ? `<a class="next" href="${modHref(next)}"><span class="eyebrow">Next · Module ${pad2(next.n)}</span><strong></strong></a>`
    : `<a class="next" href="${href('index.html')}"><span class="eyebrow">Finished</span><strong>Back to the course map</strong></a>`}
    </nav>
    <p class="credit">This module follows <a href="${nistUrl(current.nist[0])}" target="_blank" rel="noopener">section ${current.nist.join(', ')}</a> of the NIST/SEMATECH e-Handbook of Statistical Methods (2012). Worked examples use the handbook's data where noted. Explanations, simulations and figures are written for this course.</p>`;
  if (prev) $('.prev strong', foot).textContent = prev.title;
  if (next) $('.next strong', foot).textContent = next.title;
  main.append(foot);
  const txt = $('.complete-text', foot), btn = $('.complete-btn', foot);
  const paint = () => {
    const s = progress.summary(current.n);
    txt.textContent = totalChecks
      ? `You have answered ${s.answered} of ${totalChecks} checks${s.answered ? ` (${s.correct} correct)` : ''}.`
      : 'Work through the figures, then mark this module done.';
    btn.textContent = s.complete ? 'Completed ✓' : 'Mark module complete';
    btn.classList.toggle('primary', !s.complete);
  };
  btn.addEventListener('click', () => { const s = progress.summary(current.n); progress.setComplete(current.n, !s.complete); });
  window.addEventListener('progress:change', paint);
  paint();
}

function pageFooter() {
  if (current) return;
  const main = $('main');
  if (!main || $('.module-foot', main)) return;
  const foot = document.createElement('footer');
  foot.className = 'module-foot';
  foot.innerHTML = `<p class="credit">Built on chapter 6, “Process or Product Monitoring and Control”, of the <a href="${COURSE.source}" target="_blank" rel="noopener">NIST/SEMATECH e-Handbook of Statistical Methods</a>. Explanations, simulations and figures are written for this course. Free to use and share.</p>`;
  main.append(foot);
}

/* ---------- X̄ rendering ---------- */

// Public Sans has no mark positioning for a combining macron, so "X̄" drifts and eats the
// following space. Wrap every X̄ / x̄ in an element set in the display face, which positions it.
const BAR = /[Xx]\u0304/;
const SVG_NS = 'http://www.w3.org/2000/svg';
function wrapBars(root) {
  if (!root || !root.isConnected) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (BAR.test(n.data) && !n.parentElement?.closest('.xbar, math, script, style, textarea, title, option')
      ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    if (!node.isConnected || !node.parentNode) continue;
    const svg = node.parentNode.namespaceURI === SVG_NS;
    const frag = document.createDocumentFragment();
    for (const part of node.data.split(/([Xx]\u0304)/)) {
      if (!part) continue;
      if (BAR.test(part)) {
        const w = svg ? document.createElementNS(SVG_NS, 'tspan') : document.createElement('span');
        w.setAttribute('class', 'xbar');
        w.textContent = part;
        frag.append(w);
      } else frag.append(document.createTextNode(part));
    }
    node.replaceWith(frag);
  }
}

/* ---------- boot ---------- */

buildRail();
decorateModule();
renderMath();
document.documentElement.classList.remove('math-pending');
const totalChecks = initChecks();
if (current) progress.visit(current.n, totalChecks);
moduleFooter(totalChecks);
pageFooter();
$$('input[type="range"]').forEach(syncRange);
document.addEventListener('input', (e) => { if (e.target.matches?.('input[type="range"]')) syncRange(e.target); });

wrapBars(document.body);
new MutationObserver((records) => {
  for (const r of records) {
    if (r.type === 'characterData') { if (BAR.test(r.target.data)) wrapBars(r.target.parentNode); continue; }
    for (const n of r.addedNodes) {
      if (n.nodeType === 3 ? BAR.test(n.data) : n.nodeType === 1 && BAR.test(n.textContent)) wrapBars(n.nodeType === 3 ? n.parentNode : n);
    }
  }
}).observe(document.body, { childList: true, subtree: true, characterData: true });

// deep links into a section after the rail exists
if (location.hash) requestAnimationFrame(() => document.getElementById(location.hash.slice(1))?.scrollIntoView());
