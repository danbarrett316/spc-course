// progress.js: per-reader progress, kept only in this browser.
// Storage can be missing or blocked (private windows, embedded previews), so every
// access is guarded and the course works the same without it.

const KEY = 'in-control:v1';

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* storage unavailable */ }
  return { checks: {}, modules: {} };
}

let state = load();

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent('progress:change'));
}

function mod(n) {
  state.modules[n] ??= { visited: false, total: null, complete: false };
  return state.modules[n];
}

export const progress = {
  visit(n, totalChecks) {
    const m = mod(n);
    m.visited = true;
    m.total = totalChecks;
    save();
  },
  /** result: 'correct' | 'wrong' | 'revealed' */
  record(id, result) {
    const prev = state.checks[id];
    if (prev === 'correct') return; // first correct answer sticks
    state.checks[id] = result;
    save();
  },
  check(id) { return state.checks[id] ?? null; },
  clearCheck(id) { delete state.checks[id]; save(); },
  setComplete(n, v = true) { mod(n).complete = v; save(); },
  /** { visited, complete, answered, correct, total, fraction } */
  summary(n) {
    const m = state.modules[n] ?? { visited: false, total: null, complete: false };
    const prefix = `m${n}-`;
    const ids = Object.keys(state.checks).filter((k) => k.startsWith(prefix));
    const answered = ids.length;
    const correct = ids.filter((k) => state.checks[k] === 'correct').length;
    const total = m.total ?? null;
    let fraction = 0;
    if (m.complete) fraction = 1;
    else if (total) fraction = Math.min(1, answered / total);
    else if (m.visited) fraction = 0.05;
    return { visited: m.visited, complete: m.complete || (total ? answered >= total : false), answered, correct, total, fraction };
  },
  reset() { state = { checks: {}, modules: {} }; save(); },
};

/** Small ring that shows progress through a module. */
export function statusRing(fraction, complete) {
  const r = 7, c = 2 * Math.PI * r;
  if (complete) {
    return `<svg class="status-ring" viewBox="0 0 18 18" aria-hidden="true"><circle class="done" cx="9" cy="9" r="8"/><path class="tick" d="M5.4 9.2l2.4 2.4 4.6-4.8"/></svg>`;
  }
  const len = Math.max(0, Math.min(1, fraction)) * c;
  return `<svg class="status-ring" viewBox="0 0 18 18" aria-hidden="true"><circle class="track" cx="9" cy="9" r="${r}"/>${len > 0 ? `<circle class="fill" cx="9" cy="9" r="${r}" stroke-dasharray="${len.toFixed(2)} ${c.toFixed(2)}" transform="rotate(-90 9 9)"/>` : ''}</svg>`;
}
