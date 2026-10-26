// Glossary: filter the terms live as the reader types.
// Matching ignores case and accents, folds symbols (X̄ → xbar, T² → t2), and matches the
// start of words, so "lot" finds "lot-to-lot" but not "plotted". Text is read with textContent only.

import { $, $$ } from '../ui.js';

const input = $('#gloss-q');
const count = $('#gloss-count');
const empty = $('#gloss-empty');
const letters = $$('.gloss-letter');
const navItems = $$('#gloss-letters li');

/** Lower-case, spell out X̄, strip accents, fold superscripts (T² → t2) and dashes. */
const fold = (s) => s
  .replace(/[Xx]\u0304/g, 'xbar')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[\u2010-\u2014]/g, '-')
  .toLowerCase();
const escape = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const entries = $$('.gloss-entry').map((node) => ({
  node,
  letter: node.closest('.gloss-letter'),
  text: fold(`${node.textContent} ${node.dataset.also ?? ''}`).replace(/\s+/g, ' '),
}));
const total = entries.length;

function update() {
  const raw = input.value.trim();
  const words = fold(raw).split(/\s+/).filter(Boolean);
  const tests = words.map((w) => new RegExp(`(?:^|[^a-z0-9])${escape(w)}`));
  let shown = 0;
  for (const e of entries) {
    const hit = tests.every((re) => re.test(e.text));
    e.node.hidden = !hit;
    if (hit) shown++;
  }
  letters.forEach((sec, i) => {
    const any = entries.some((e) => e.letter === sec && !e.node.hidden);
    sec.hidden = !any;
    if (navItems[i]) navItems[i].hidden = !any;
  });
  count.textContent = words.length ? `${shown} of ${total} terms match` : `${total} terms`;
  if (shown === 0) {
    empty.textContent = `No terms match “${raw}”. Try a shorter word, or clear the search with Escape.`;
    empty.hidden = false;
  } else {
    empty.hidden = true;
  }
}

input.addEventListener('input', update);
input.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && input.value) {
    input.value = '';
    update();
  }
});
update();
