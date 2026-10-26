// ui.js: small helpers that keep every widget's controls consistent.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** Render TeX inside `.m` (inline) and `.eq` (display) elements as native MathML via KaTeX. */
export function renderMath(root = document) {
  const katex = window.katex;
  for (const node of root.querySelectorAll('.m:not([data-tex]), .eq:not([data-tex])')) {
    const tex = node.textContent.trim();
    node.dataset.tex = tex;
    if (!katex) { node.classList.add('raw'); continue; }
    try {
      katex.render(tex, node, { output: 'mathml', displayMode: node.classList.contains('eq'), throwOnError: false, strict: 'ignore' });
    } catch {
      node.classList.add('raw');
    }
  }
}

/** Set a TeX string on an element and render it (for values that change live). */
export function setTex(node, tex) {
  delete node.dataset.tex;
  node.textContent = tex;
  renderMath(node.parentNode ?? document);
}

/** Paint the filled part of a range track (WebKit has no ::-range-progress). */
export function syncRange(input) {
  const min = Number(input.min || 0), max = Number(input.max || 100), v = Number(input.value);
  input.style.setProperty('--fill', `${((v - min) / (max - min || 1)) * 100}%`);
}

/**
 * Bind an <input type="range" id=…> and its <output for=…>.
 * `format` turns the value into the output text. Calls `onInput(value)` now and on every change.
 */
export function bindRange(id, onInput, { format = (v) => String(v), call = true } = {}) {
  const input = document.getElementById(id);
  const out = document.querySelector(`output[for="${id}"]`);
  const update = () => {
    const v = Number(input.value);
    if (out) out.textContent = format(v);
    syncRange(input);
    onInput?.(v);
  };
  input.addEventListener('input', update);
  if (call) update(); else { syncRange(input); if (out) out.textContent = format(Number(input.value)); }
  return {
    input,
    get value() { return Number(input.value); },
    set value(v) { input.value = v; if (out) out.textContent = format(Number(input.value)); syncRange(input); },
    refresh: update,
  };
}

/**
 * A segmented control: <div class="seg" id=…><button data-value="a" aria-pressed="true">A</button>…</div>.
 * Calls onChange(value) on click. Returns { value, set(v) }.
 */
export function segmented(idOrEl, onChange) {
  const host = typeof idOrEl === 'string' ? document.getElementById(idOrEl) : idOrEl;
  const buttons = [...host.querySelectorAll('button')];
  buttons.forEach((b) => b.setAttribute('type', 'button'));
  host.setAttribute('role', host.getAttribute('role') ?? 'group');
  let value = (buttons.find((b) => b.getAttribute('aria-pressed') === 'true') ?? buttons[0]).dataset.value;
  const set = (v, fire = true) => {
    value = v;
    buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.value === v)));
    if (fire) onChange?.(v);
  };
  buttons.forEach((b) => b.addEventListener('click', () => set(b.dataset.value)));
  set(value, false);
  return { get value() { return value; }, set };
}

/**
 * Fill a `.readouts` element. items: [{ label, value, sub?, state?: 'signal' | 'good' }].
 * Text only, never HTML.
 */
export function readouts(host, items) {
  host.classList.add('readouts');
  if (host.children.length !== items.length) {
    host.replaceChildren(...items.map(() => {
      const d = document.createElement('div');
      d.className = 'readout';
      d.innerHTML = '<span class="r-label"></span><span class="r-value"></span><span class="r-sub"></span>';
      return d;
    }));
  }
  items.forEach((it, i) => {
    const d = host.children[i];
    d.className = `readout${it.state ? ` is-${it.state}` : ''}`;
    d.children[0].textContent = it.label;
    d.children[1].textContent = it.value;
    d.children[2].textContent = it.sub ?? '';
    d.children[2].hidden = !it.sub;
  });
}

/** A status pill: kind is 'ok' | 'signal' | 'warn' | ''. */
export function pill(host, text, kind = '') {
  host.className = `pill ${kind}`;
  host.textContent = text;
}

/**
 * A chart legend. items: [{ label, swatch: 'line' | 'dash' | 'dot' | 'box', color: 'data' | 'signal' | 'spec' | 'alt' | 'alt2' | 'ink' | 'muted' }]
 */
export function legend(host, items) {
  host.className = 'legend';
  host.replaceChildren(...items.map((it) => {
    const li = document.createElement('li');
    const sw = document.createElement('span');
    sw.className = `sw ${it.swatch ?? 'line'} c-${it.color ?? 'data'}`;
    sw.setAttribute('aria-hidden', 'true');
    const t = document.createElement('span');
    t.textContent = it.label;
    li.append(sw, t);
    return li;
  }));
}

/** Run `fn` once the DOM is parsed (module scripts already are, but this keeps intent explicit). */
export function ready(fn) {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
  else fn();
}
