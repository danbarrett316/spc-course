// Formula sheet: the run rules, the constants table and the ARL table are generated
// from stats.js so they always match what the course's charts compute.

import { dataTable } from '../chart.js';
import { spcConstants, shewhartArl, WECO_TEXT, fmt } from '../stats.js';
import { readouts, $ } from '../ui.js';

/* ---------- Western Electric rules ---------- */
{
  const fill = (host, rules) => {
    if (!host) return;
    host.replaceChildren(...rules.map((k) => {
      const li = document.createElement('li');
      li.textContent = WECO_TEXT[k];
      return li;
    }));
  };
  fill($('#weco-list'), [1, 2, 3, 4]);
  fill($('#weco-trend'), [5, 6]);
}

/* ---------- constants for n = 2..25 ---------- */
{
  const host = $('#const-table');
  const input = $('#const-n');
  const rows = [];
  for (let n = 2; n <= 25; n++) rows.push(spcConstants(n));
  const three = (v) => (v === 0 ? '0' : fmt(v, 3));
  const table = dataTable(host, [
    { label: 'n', key: 'n' },
    { label: 'd₂', key: 'd2', fmt: three },
    { label: 'd₃', key: 'd3', fmt: three },
    { label: 'c₄', key: 'c4', fmt: (v) => fmt(v, 4) },
    { label: 'A₂', key: 'A2', fmt: three },
    { label: 'A₃', key: 'A3', fmt: three },
    { label: 'D₃', key: 'D3', fmt: three },
    { label: 'D₄', key: 'D4', fmt: three },
    { label: 'B₃', key: 'B3', fmt: three },
    { label: 'B₄', key: 'B4', fmt: three },
  ], rows);
  table.setAttribute('aria-label', 'Control chart constants for subgroup sizes 2 to 25');
  const trs = [...table.tBodies[0].rows];

  function highlight(scroll) {
    if (input.value.trim() === '') return;
    const raw = Math.round(Number(input.value));
    if (!Number.isFinite(raw)) return;
    const n = Math.min(25, Math.max(2, raw));
    trs.forEach((tr, i) => tr.classList.toggle('is-hi', i + 2 === n));
    const k = spcConstants(n);
    readouts($('#const-readouts'), [
      { label: `X̄ chart, n = ${n}`, value: `x̿ ± ${fmt(k.A2, 3)} R̄`, sub: `or x̿ ± ${fmt(k.A3, 3)} s̄` },
      { label: 'R chart UCL', value: `${fmt(k.D4, 3)} R̄`, sub: `LCL ${three(k.D3)} R̄` },
      { label: 's chart UCL', value: `${fmt(k.B4, 3)} s̄`, sub: `LCL ${three(k.B3)} s̄` },
      { label: 'σ estimate', value: `R̄ / ${fmt(k.d2, 3)}`, sub: `or s̄ / ${fmt(k.c4, 4)}` },
    ]);
    if (scroll) {
      // keep the highlighted row in view inside the table's own scroll box
      const tr = trs[n - 2];
      const target = tr.offsetTop - host.clientHeight / 2 + tr.offsetHeight / 2;
      host.scrollTop = Math.max(0, target);
    }
  }
  input.addEventListener('input', () => highlight(true));
  input.addEventListener('change', () => {
    if (input.value.trim() === '') return;
    const raw = Math.round(Number(input.value));
    if (Number.isFinite(raw)) input.value = String(Math.min(25, Math.max(2, raw)));
    highlight(true);
  });
  highlight(false);
}

/* ---------- ARL of a 3σ Shewhart chart ---------- */
{
  const shifts = [0, 0.25, 0.5, 0.75, 1, 1.5, 2, 2.5, 3];
  const arl = (v) => fmt(v, 1);
  const table = dataTable($('#arl-table'), [
    { label: 'Process shift (σ)', key: 'd', fmt: (v) => fmt(v, 2) },
    { label: 'Individuals, n = 1', get: (r) => shewhartArl(r.d), fmt: arl },
    { label: 'X̄ chart, n = 4', get: (r) => shewhartArl(r.d * 2), fmt: arl },
    { label: 'X̄ chart, n = 5', get: (r) => shewhartArl(r.d * Math.sqrt(5)), fmt: arl },
  ], shifts.map((d) => ({ d })));
  table.setAttribute('aria-label', 'Average run length of a three-sigma Shewhart chart for mean shifts of 0 to 3 process standard deviations');
}
