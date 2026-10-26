// quiz.js: turns `.check` blocks into self-marking questions.
//
// Multiple choice:
//   <div class="check" id="m3-q1">
//     <p class="check-q">Question?</p>
//     <ul class="check-options">
//       <li data-correct>Right answer</li>
//       <li data-why="Why this one is wrong.">Wrong answer</li>
//     </ul>
//     <div class="check-explain">Shown once answered.</div>
//   </div>
//
// Numeric (absolute tolerance):
//   <div class="check" id="m3-q2" data-answer="52.59" data-tolerance="0.02" data-unit="mm">
//     <p class="check-q">Question?</p>
//     <div class="check-explain">Worked answer.</div>
//   </div>
//
// Ids must start with the module prefix `m<n>-` so progress can be counted per module.

import { progress } from './progress.js';

const LETTERS = 'ABCDEFGH';

function parseNumber(s) {
  const t = String(s).trim().replace(/[−–]/g, '-').replace(/,/g, '').replace(/%$/, '');
  if (t === '' || Number.isNaN(Number(t))) return null;
  return Number(t);
}

function feedback(box, ok, text, explain) {
  let fb = box.querySelector(':scope > .check-feedback');
  if (!fb) {
    fb = document.createElement('div');
    fb.className = 'check-feedback';
    fb.setAttribute('role', 'status');
    box.append(fb);
  }
  fb.className = `check-feedback ${ok === true ? 'is-correct' : ok === false ? 'is-wrong' : ''}`;
  fb.replaceChildren();
  const v = document.createElement('div');
  v.className = 'verdict';
  v.textContent = text;
  fb.append(v);
  if (explain) fb.append(explain);
  return fb;
}

function initChoice(box) {
  const list = box.querySelector('.check-options');
  const explain = box.querySelector(':scope > .check-explain');
  const items = [...list.children];
  const buttons = items.map((li, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'check-option';
    const letter = document.createElement('span');
    letter.className = 'letter';
    letter.textContent = LETTERS[i];
    const body = document.createElement('span');
    body.className = 'body';
    while (li.firstChild) body.append(li.firstChild);
    b.append(letter, body);
    li.append(b);
    return b;
  });

  const answer = (i, silent) => {
    const li = items[i];
    const ok = li.hasAttribute('data-correct');
    buttons.forEach((b, j) => {
      b.disabled = true;
      if (items[j].hasAttribute('data-correct')) b.classList.add('is-correct');
      else if (j === i) b.classList.add('is-wrong');
      else b.classList.add('is-dim');
    });
    const why = li.getAttribute('data-why');
    const frag = document.createDocumentFragment();
    if (!ok && why) { const p = document.createElement('p'); p.textContent = why; frag.append(p); }
    if (explain) frag.append(explain.cloneNode(true));
    feedback(box, ok, ok ? 'Correct.' : `Not quite. The answer is ${LETTERS[items.findIndex((x) => x.hasAttribute('data-correct'))]}.`, frag);
    addReset(box, () => {
      buttons.forEach((b) => { b.disabled = false; b.classList.remove('is-correct', 'is-wrong', 'is-dim'); });
      box.querySelector(':scope > .check-feedback')?.remove();
    });
    if (!silent) progress.record(box.id, ok ? 'correct' : 'wrong');
    box.dataset.state = ok ? 'correct' : 'wrong';
  };
  buttons.forEach((b, i) => b.addEventListener('click', () => answer(i)));
  box._restore = (result) => {
    if (result === 'correct') answer(items.findIndex((x) => x.hasAttribute('data-correct')), true);
  };
}

function initNumeric(box) {
  const target = Number(box.dataset.answer);
  const tol = Number(box.dataset.tolerance ?? Math.abs(target) * 0.01);
  const explain = box.querySelector(':scope > .check-explain');
  const row = document.createElement('div');
  row.className = 'check-numeric';
  const id = `${box.id}-input`;
  const label = document.createElement('label');
  label.className = 'visually-hidden';
  label.htmlFor = id;
  label.textContent = 'Your answer';
  const input = document.createElement('input');
  input.type = 'text';
  input.inputMode = 'decimal';
  input.id = id;
  input.className = 'mono-input';
  input.autocomplete = 'off';
  input.placeholder = 'Your answer';
  const unit = document.createElement('span');
  unit.className = 'unit';
  unit.textContent = box.dataset.unit ?? '';
  const go = document.createElement('button');
  go.type = 'button';
  go.className = 'btn small primary';
  go.textContent = 'Check';
  const reveal = document.createElement('button');
  reveal.type = 'button';
  reveal.className = 'btn small ghost';
  reveal.textContent = 'Show answer';
  reveal.hidden = true;
  row.append(label, input, unit, go, reveal);
  const q = box.querySelector('.check-q');
  q.after(row);
  let tries = 0;

  const done = (ok, silent, revealed) => {
    input.disabled = true; go.disabled = true; reveal.hidden = true;
    const frag = document.createDocumentFragment();
    if (explain) frag.append(explain.cloneNode(true));
    const shown = box.dataset.display ?? box.dataset.answer;
    feedback(box, revealed ? null : ok, ok ? `Correct: ${shown}${box.dataset.unit ? ' ' + box.dataset.unit : ''}.` : `The answer is ${shown}${box.dataset.unit ? ' ' + box.dataset.unit : ''}.`, frag);
    addReset(box, () => {
      input.disabled = false; go.disabled = false; input.value = ''; tries = 0;
      box.querySelector(':scope > .check-feedback')?.remove();
    });
    if (!silent) progress.record(box.id, ok ? 'correct' : 'revealed');
    box.dataset.state = ok ? 'correct' : 'revealed';
  };

  const check = () => {
    const v = parseNumber(input.value);
    if (v === null) { feedback(box, null, 'Enter a number, for example 12.5.'); return; }
    if (Math.abs(v - target) <= tol + 1e-12) { done(true); return; }
    tries++;
    const hint = box.dataset.hint;
    const frag = document.createDocumentFragment();
    if (hint) { const p = document.createElement('p'); p.textContent = hint; frag.append(p); }
    feedback(box, false, tries === 1 ? 'Not quite. Try again.' : 'Still not it. Try again or show the answer.', frag);
    if (tries >= 1) reveal.hidden = false;
    if (tries === 1) progress.record(box.id, 'wrong');
  };
  go.addEventListener('click', check);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') check(); });
  reveal.addEventListener('click', () => done(false, false, true));
  box._restore = (result) => { if (result === 'correct') { input.value = box.dataset.display ?? box.dataset.answer; done(true, true); } };
}

function addReset(box, fn) {
  const top = box.querySelector('.check-top');
  if (!top || top.querySelector('.check-reset')) return;
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'btn small ghost check-reset';
  b.textContent = 'Try again';
  b.addEventListener('click', () => {
    fn();
    b.remove();
    progress.clearCheck(box.id);
    delete box.dataset.state;
  });
  top.append(b);
}

export function initChecks(root = document) {
  const boxes = [...root.querySelectorAll('.check')];
  boxes.forEach((box, i) => {
    const top = document.createElement('div');
    top.className = 'check-top';
    const label = document.createElement('span');
    label.className = 'eyebrow';
    label.textContent = `Check ${i + 1} of ${boxes.length}`;
    top.append(label);
    box.prepend(top);
    if (box.querySelector('.check-options')) initChoice(box);
    else if (box.dataset.answer !== undefined) initNumeric(box);
    const prev = progress.check(box.id);
    if (prev === 'correct') box._restore?.(prev);
  });
  return boxes.length;
}
