// chart.js: a small declarative SVG plotting kit.
//
//   const c = new Chart(el, { height: 260 });
//   c.update({
//     x: { domain: [0, 25], label: 'Sample' },
//     y: { domain: [44, 56], label: 'Flow rate' },
//     layers: [
//       { type: 'zones', cl: 50, sigma: 1.5 },
//       { type: 'hline', y: 54.5, cls: 'limit', label: 'UCL 54.5' },
//       { type: 'line', points: [[1, 50.2], [2, 49.1]], cls: 'data' },
//       { type: 'dots', points: [[1, 50.2], [2, 49.1]], cls: (p, i) => 'dot' },
//     ],
//     hover: { xs: [1, 2], render: (i) => ({ title: 'Sample 1', rows: [{ label: 'x', value: '50.2' }] }) },
//   });
//
// Every visual decision lives in course.css under `.ch .k-<cls>`, so charts follow
// the light and dark themes with no colors in JavaScript. The whole chart re-renders
// on every update and on resize, which keeps widget code stateless.

const NS = 'http://www.w3.org/2000/svg';

/** Create an SVG element with attributes. */
export function el(tag, attrs = {}, parent) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) n.setAttribute(k, v);
  if (parent) parent.append(n);
  return n;
}

/** Linear scale with `.invert`. */
export function linear([d0, d1], [r0, r1]) {
  const k = (r1 - r0) / (d1 - d0 || 1);
  const f = (v) => r0 + (v - d0) * k;
  f.invert = (p) => d0 + (p - r0) / k;
  f.domain = [d0, d1];
  f.range = [r0, r1];
  return f;
}

/** Round tick values across [lo, hi], roughly `count` of them. */
export function niceTicks(lo, hi, count = 5) {
  if (!(hi > lo)) return [lo];
  const raw = (hi - lo) / Math.max(1, count);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const start = Math.ceil(lo / step - 1e-9) * step;
  const ticks = [];
  for (let v = start; v <= hi + step * 1e-9; v += step) ticks.push(Math.abs(v) < step * 1e-9 ? 0 : +v.toPrecision(12));
  return ticks;
}

/** Decimal places that make a set of ticks read cleanly. */
function tickDecimals(ticks) {
  for (let d = 0; d <= 6; d++) {
    if (ticks.every((t) => Math.abs(t * 10 ** d - Math.round(t * 10 ** d)) < 1e-6)) return d;
  }
  return 6;
}

const minus = (s) => s.replace(/^-/, '−');

/** Extend a [lo, hi] domain by a fraction on each side. */
export function pad([lo, hi], f = 0.08) {
  const d = (hi - lo) || Math.abs(hi) || 1;
  return [lo - d * f, hi + d * f];
}

export class Chart {
  constructor(host, opts = {}) {
    this.host = host;
    host.classList.add('ch');
    this.opts = { height: 260, margin: { top: 16, right: 76, bottom: 42, left: 54 }, ...opts };
    this.svg = el('svg', { role: 'img', focusable: 'false' }, host);
    this.tip = document.createElement('div');
    this.tip.className = 'ch-tip';
    this.tip.hidden = true;
    host.append(this.tip);
    this.spec = null;
    this.hoverIndex = null;
    this.ro = new ResizeObserver(() => {
      const w = host.clientWidth;
      if (w && w !== this.lastWidth) this.render();
    });
    this.ro.observe(host);
  }

  update(spec) {
    this.spec = spec;
    this.render();
    return this;
  }

  render() {
    const spec = this.spec;
    if (!spec) return;
    const W = this.host.clientWidth || 640;
    this.lastWidth = W;
    const narrow = W < 520;
    const H = typeof spec.height === 'function' ? spec.height(W) : spec.height ?? (narrow ? Math.round(this.opts.height * 0.82) : this.opts.height);
    const m = { ...this.opts.margin, ...(narrow ? { right: Math.min(this.opts.margin.right, 64), left: Math.min(this.opts.margin.left, 46) } : {}), ...spec.margin };
    const iw = Math.max(40, W - m.left - m.right);
    const ih = Math.max(40, H - m.top - m.bottom);

    const svg = this.svg;
    svg.replaceChildren();
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('width', W);
    svg.setAttribute('height', H);
    if (spec.aria) svg.setAttribute('aria-label', spec.aria);

    const sx = linear(spec.x.domain, [0, iw]);
    const sy = linear(spec.y.domain, [ih, 0]);
    const dims = { W, H, iw, ih, m, narrow };
    this.scales = { sx, sy, dims };

    const root = el('g', { transform: `translate(${m.left},${m.top})` }, svg);
    const clipId = `clip-${Math.random().toString(36).slice(2, 9)}`;
    const clip = el('clipPath', { id: clipId }, el('defs', {}, svg));
    el('rect', { x: -2, y: -6, width: iw + 4, height: ih + 12 }, clip);

    // axes and grid
    const gGrid = el('g', { class: 'grid' }, root);
    const gAxes = el('g', { class: 'axis' }, root);
    const yTicks = Array.isArray(spec.y.ticks) ? spec.y.ticks : niceTicks(...spec.y.domain, spec.y.ticks ?? (ih < 160 ? 3 : 5));
    const xTicks = Array.isArray(spec.x.ticks) ? spec.x.ticks : niceTicks(...spec.x.domain, spec.x.ticks ?? Math.max(2, Math.min(10, Math.floor(iw / 70))));
    const yDec = tickDecimals(yTicks), xDec = tickDecimals(xTicks);
    const yFmt = spec.y.format ?? ((v) => minus(v.toFixed(yDec)));
    const xFmt = spec.x.format ?? ((v) => minus(v.toFixed(xDec)));

    if (spec.y.grid !== false) for (const t of yTicks) el('line', { x1: 0, x2: iw, y1: sy(t), y2: sy(t) }, gGrid);
    if (spec.x.grid) for (const t of xTicks) el('line', { x1: sx(t), x2: sx(t), y1: 0, y2: ih }, gGrid);

    if (spec.y.axis !== false) {
      for (const t of yTicks) {
        const tx = el('text', { x: -10, y: sy(t), 'text-anchor': 'end', 'dominant-baseline': 'middle' }, gAxes);
        tx.textContent = yFmt(t);
      }
    }
    if (spec.x.axis !== false) {
      el('line', { class: 'baseline', x1: 0, x2: iw, y1: ih, y2: ih }, gAxes);
      for (const t of xTicks) {
        el('line', { class: 'tick', x1: sx(t), x2: sx(t), y1: ih, y2: ih + 4 }, gAxes);
        const tx = el('text', { x: sx(t), y: ih + 18, 'text-anchor': 'middle' }, gAxes);
        tx.textContent = xFmt(t);
      }
    }
    if (spec.x.label) {
      const t = el('text', { class: 'axis-label', x: iw, y: ih + 36, 'text-anchor': 'end' }, gAxes);
      t.textContent = spec.x.label;
    }
    if (spec.y.label) {
      const t = el('text', { class: 'axis-label', x: -m.left + 2, y: -6, 'text-anchor': 'start' }, gAxes);
      t.textContent = spec.y.label;
      if (m.top < 18) t.setAttribute('y', -2);
    }

    // layers
    const gPlot = el('g', { 'clip-path': `url(#${clipId})` }, root);
    const gFree = el('g', {}, root); // unclipped: labels, handles
    const rightLabels = [];
    const k = (c) => (c ? c.split(/\s+/).map((s) => `k-${s}`).join(' ') : '');

    for (const L of spec.layers ?? []) {
      if (!L || L.hidden) continue;
      switch (L.type) {
        case 'zones': {
          // Shaded ±1σ, ±2σ, ±3σ bands (Western Electric zones C, B, A).
          const { cl, sigma } = L;
          const bands = [[1, 'zone-c'], [2, 'zone-b'], [3, 'zone-a']];
          let prev = 0;
          for (const [kk, cls] of bands) {
            for (const s of [1, -1]) {
              const a = cl + s * prev * sigma, b = cl + s * kk * sigma;
              el('rect', { class: k(cls), x: 0, width: iw, y: Math.min(sy(a), sy(b)), height: Math.abs(sy(a) - sy(b)) }, gPlot);
            }
            prev = kk;
          }
          if (L.labels !== false && !narrow) {
            for (const [lab, lo, hi] of [['C', 0, 1], ['B', 1, 2], ['A', 2, 3]]) {
              for (const s of [1, -1]) {
                const y = sy(cl + s * ((lo + hi) / 2) * sigma);
                if (y < 6 || y > ih - 4) continue;
                const t = el('text', { class: 'k-zone-label', x: 8, y, 'dominant-baseline': 'middle' }, gPlot);
                t.textContent = lab;
              }
            }
          }
          break;
        }
        case 'band':
          el('rect', { class: k(L.cls ?? 'band'), x: 0, width: iw, y: sy(Math.max(L.y0, L.y1)), height: Math.abs(sy(L.y0) - sy(L.y1)) }, gPlot);
          break;
        case 'xband':
          el('rect', { class: k(L.cls ?? 'band'), y: 0, height: ih, x: sx(Math.min(L.x0, L.x1)), width: Math.abs(sx(L.x1) - sx(L.x0)) }, gPlot);
          break;
        case 'hline': {
          const y = sy(L.y);
          if (y < -1 || y > ih + 1) break;
          el('line', { class: k(L.cls ?? 'limit'), x1: 0, x2: iw, y1: y, y2: y }, gPlot);
          if (L.label) rightLabels.push({ y, text: L.label, cls: L.cls });
          break;
        }
        case 'vline': {
          const x = sx(L.x);
          if (x < -1 || x > iw + 1) break;
          el('line', { class: k(L.cls ?? 'marker'), x1: x, x2: x, y1: L.top !== undefined ? sy(L.top) : 0, y2: L.bottom !== undefined ? sy(L.bottom) : ih }, gPlot);
          if (L.label) {
            const anchor = L.anchor ?? (x > iw - 60 ? 'end' : 'start');
            const t = el('text', { class: 'k-label', x: x + (anchor === 'end' ? -6 : 6), y: L.labelY !== undefined ? sy(L.labelY) : 12, 'text-anchor': anchor }, gFree);
            t.textContent = L.label;
          }
          break;
        }
        case 'line': {
          const pts = L.points;
          let d = '';
          let pen = false;
          for (let i = 0; i < pts.length; i++) {
            const p = pts[i];
            if (!p || p[1] === null || p[1] === undefined || Number.isNaN(p[1])) { pen = false; continue; }
            const X = sx(p[0]), Y = sy(p[1]);
            if (L.step && pen) d += `H${X.toFixed(2)}V${Y.toFixed(2)}`;
            else d += `${pen ? 'L' : 'M'}${X.toFixed(2)},${Y.toFixed(2)}`;
            pen = true;
          }
          if (L.step && pts.length && L.stepEnd !== undefined) d += `H${sx(L.stepEnd).toFixed(2)}`;
          el('path', { class: k(L.cls ?? 'data'), d }, gPlot);
          break;
        }
        case 'area': {
          const up = L.points.filter((p) => p && Number.isFinite(p[1]));
          if (!up.length) break;
          const low = Array.isArray(L.lower) ? L.lower.filter((p) => p && Number.isFinite(p[1])) : up.map((p) => [p[0], L.base ?? spec.y.domain[0]]);
          let d = up.map((p, i) => `${i ? 'L' : 'M'}${sx(p[0]).toFixed(2)},${sy(p[1]).toFixed(2)}`).join('');
          d += [...low].reverse().map((p) => `L${sx(p[0]).toFixed(2)},${sy(p[1]).toFixed(2)}`).join('') + 'Z';
          el('path', { class: k(L.cls ?? 'area'), d }, gPlot);
          break;
        }
        case 'bars': {
          for (const b of L.bars) {
            const x0 = sx(b.x0), x1 = sx(b.x1);
            const y0 = sy(b.y0 ?? 0), y1 = sy(b.y);
            const gap = Math.min(1, (x1 - x0) / 4);
            const w = Math.max(0.5, x1 - x0 - 2 * gap);
            const h = Math.abs(y0 - y1);
            if (h < 0.01) continue;
            const r = Math.min(3, w / 2, h);
            const top = Math.min(y0, y1);
            const xl = x0 + gap;
            // rounded data end, square baseline
            const d = y1 <= y0
              ? `M${xl},${y0}V${top + r}Q${xl},${top} ${xl + r},${top}H${xl + w - r}Q${xl + w},${top} ${xl + w},${top + r}V${y0}Z`
              : `M${xl},${y0}V${y1 - r}Q${xl},${y1} ${xl + r},${y1}H${xl + w - r}Q${xl + w},${y1} ${xl + w},${y1 - r}V${y0}Z`;
            el('path', { class: k(b.cls ?? L.cls ?? 'bar'), d }, gPlot);
          }
          break;
        }
        case 'dots': {
          const g = el('g', {}, L.clip === false ? gFree : gPlot);
          L.points.forEach((p, i) => {
            if (!p || !Number.isFinite(p[1])) return;
            const cls = typeof L.cls === 'function' ? L.cls(p, i) : L.cls ?? 'dot';
            const r = typeof L.r === 'function' ? L.r(p, i) : L.r ?? (cls && cls.includes('signal') ? 5 : 3.5);
            el('circle', { class: k(cls), cx: sx(p[0]), cy: sy(p[1]), r }, g);
          });
          break;
        }
        case 'text': {
          const t = el('text', {
            class: k(L.cls ?? 'label'), x: sx(L.x) + (L.dx ?? 0), y: sy(L.y) + (L.dy ?? 0),
            'text-anchor': L.anchor ?? 'start', 'dominant-baseline': L.baseline ?? 'auto',
          }, L.clip ? gPlot : gFree);
          t.textContent = L.text;
          break;
        }
        case 'annot': {
          // A labelled callout: short leader from the point to the text.
          const X = sx(L.x), Y = sy(L.y);
          const dx = L.dx ?? 18, dy = L.dy ?? -22;
          let tx = X + dx;
          const anchor = L.anchor ?? (tx > iw - 120 ? 'end' : 'start');
          if (anchor === 'end' && dx > 0) tx = X - dx;
          el('line', { class: 'k-leader', x1: X, y1: Y, x2: tx, y2: Y + dy + 4 }, gFree);
          const t = el('text', { class: k(L.cls ?? 'annot'), x: tx + (anchor === 'end' ? -2 : 2), y: Y + dy, 'text-anchor': anchor }, gFree);
          t.textContent = L.text;
          break;
        }
        case 'path':
          el('path', { class: k(L.cls ?? 'data'), d: L.d(sx, sy, dims) }, L.clip === false ? gFree : gPlot);
          break;
        case 'custom':
          L.draw(el('g', { class: k(L.cls) }, L.clip === false ? gFree : gPlot), sx, sy, dims);
          break;
        case 'handle':
          this.#handle(L, gFree, sx, sy, iw, ih, k);
          break;
        default:
          break;
      }
    }

    // right-edge labels for horizontal lines, nudged apart so they never collide
    rightLabels.sort((a, b) => a.y - b.y);
    for (let i = 1; i < rightLabels.length; i++) {
      if (rightLabels[i].y - rightLabels[i - 1].y < 13) rightLabels[i].y = rightLabels[i - 1].y + 13;
    }
    for (const r of rightLabels) {
      const t = el('text', { class: `k-hlabel ${r.cls ? r.cls.split(/\s+/).map((c) => `k-${c}-label`).join(' ') : ''}`, x: iw + 8, y: r.y, 'dominant-baseline': 'middle' }, gFree);
      t.textContent = r.text;
    }

    this.#hover(root, gFree, sx, sy, iw, ih);
  }

  #handle(L, g, sx, sy, iw, ih, k) {
    const X = L.x !== undefined ? sx(L.x) : null;
    const Y = L.y !== undefined ? sy(L.y) : null;
    const axis = L.axis ?? 'xy';
    const grp = el('g', { class: `k-handle ${k(L.cls)}`, tabindex: 0, role: 'slider', 'aria-label': L.aria ?? L.label ?? 'Drag handle' }, g);
    if (axis === 'x') {
      el('line', { class: 'k-handle-line', x1: X, x2: X, y1: 0, y2: ih }, grp);
      el('rect', { class: 'k-handle-hit', x: X - 12, y: 0, width: 24, height: ih }, grp);
      el('rect', { class: 'k-handle-grip', x: X - 6, y: (L.gripY !== undefined ? sy(L.gripY) : 4) - 9, width: 12, height: 18, rx: 4 }, grp);
      if (L.label) {
        const t = el('text', { class: 'k-handle-label', x: X, y: -4, 'text-anchor': 'middle' }, grp);
        t.textContent = L.label;
      }
    } else if (axis === 'y') {
      el('line', { class: 'k-handle-line', x1: 0, x2: iw, y1: Y, y2: Y }, grp);
      el('rect', { class: 'k-handle-hit', x: 0, y: Y - 12, width: iw, height: 24 }, grp);
      el('rect', { class: 'k-handle-grip', x: iw - 9, y: Y - 6, width: 18, height: 12, rx: 4 }, grp);
    } else {
      el('circle', { class: 'k-handle-hit', cx: X, cy: Y, r: 16 }, grp);
      el('circle', { class: 'k-handle-dot', cx: X, cy: Y, r: L.r ?? 7 }, grp);
    }
    const toData = (ev) => {
      const pt = this.svg.getBoundingClientRect();
      const px = ev.clientX - pt.left - this.scales.dims.m.left;
      const py = ev.clientY - pt.top - this.scales.dims.m.top;
      const s = this.scales;
      return [s.sx.invert(Math.max(0, Math.min(s.dims.iw, px))), s.sy.invert(Math.max(0, Math.min(s.dims.ih, py)))];
    };
    grp.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      this.host.classList.add('is-dragging');
      const move = (e) => { const [x, y] = toData(e); L.onDrag?.(axis === 'y' ? L.x : x, axis === 'x' ? L.y : y); };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        this.host.classList.remove('is-dragging');
        L.onEnd?.();
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
    grp.addEventListener('keydown', (ev) => {
      const step = L.step ?? (this.scales.sx.domain[1] - this.scales.sx.domain[0]) / 100;
      const stepY = L.stepY ?? (this.scales.sy.domain[1] - this.scales.sy.domain[0]) / 100;
      let { x, y } = L;
      if (ev.key === 'ArrowLeft' && axis !== 'y') x -= step;
      else if (ev.key === 'ArrowRight' && axis !== 'y') x += step;
      else if (ev.key === 'ArrowUp' && axis !== 'x') y += stepY;
      else if (ev.key === 'ArrowDown' && axis !== 'x') y -= stepY;
      else return;
      ev.preventDefault();
      const idx = [...this.host.querySelectorAll('.k-handle')].indexOf(grp);
      L.onDrag?.(x, y);
      requestAnimationFrame(() => this.host.querySelectorAll('.k-handle')[idx]?.focus());
    });
  }

  #hover(root, gFree, sx, sy, iw, ih) {
    const H = this.spec.hover;
    this.tip.hidden = true;
    if (!H) { this.svg.removeAttribute('tabindex'); return; }
    const cross = el('line', { class: 'ch-cross', x1: 0, x2: 0, y1: 0, y2: ih, visibility: 'hidden' }, root);
    const ring = el('circle', { class: 'ch-ring', r: 6, visibility: 'hidden' }, root);
    const overlay = el('rect', { class: 'ch-overlay', x: 0, y: 0, width: iw, height: ih }, root);
    // labels, annotations and drag handles stay above the hover overlay
    root.append(gFree);
    const two = Array.isArray(H.points);
    const n = two ? H.points.length : H.xs.length;
    const m = this.scales.dims.m;

    const show = (i) => {
      if (i === null || i < 0 || i >= n) { hide(); return; }
      this.hoverIndex = i;
      const px = two ? sx(H.points[i][0]) : sx(H.xs[i]);
      const mark = two ? H.points[i] : H.mark?.(i);
      if (!two) { cross.setAttribute('x1', px); cross.setAttribute('x2', px); cross.setAttribute('visibility', 'visible'); }
      if (mark && Number.isFinite(mark[1])) {
        ring.setAttribute('cx', sx(mark[0])); ring.setAttribute('cy', sy(mark[1])); ring.setAttribute('visibility', 'visible');
      } else ring.setAttribute('visibility', 'hidden');
      const content = H.render(i);
      if (!content) { this.tip.hidden = true; return; }
      this.tip.replaceChildren();
      if (content.title) {
        const t = document.createElement('div');
        t.className = 'ch-tip-title';
        t.textContent = content.title;
        this.tip.append(t);
      }
      for (const r of content.rows ?? []) {
        const row = document.createElement('div');
        row.className = 'ch-tip-row';
        const key = document.createElement('span');
        key.className = `ch-tip-key k-key-${r.key ?? 'data'}`;
        const v = document.createElement('b');
        v.textContent = r.value;
        const lab = document.createElement('span');
        lab.textContent = r.label;
        row.append(key, v, lab);
        this.tip.append(row);
      }
      if (content.note) {
        const nn = document.createElement('div');
        nn.className = 'ch-tip-note';
        nn.textContent = content.note;
        this.tip.append(nn);
      }
      this.tip.hidden = false;
      const tw = this.tip.offsetWidth, th = this.tip.offsetHeight;
      const W = this.scales.dims.W;
      let left = m.left + px + 14;
      if (left + tw > W - 4) left = m.left + px - tw - 14;
      left = Math.max(4, left);
      const anchorY = mark && Number.isFinite(mark[1]) ? sy(mark[1]) : ih / 2;
      let top = m.top + anchorY - th / 2;
      top = Math.max(0, Math.min(this.scales.dims.H - th, top));
      this.tip.style.left = `${left}px`;
      this.tip.style.top = `${top}px`;
    };
    const hide = () => {
      this.hoverIndex = null;
      cross.setAttribute('visibility', 'hidden');
      ring.setAttribute('visibility', 'hidden');
      this.tip.hidden = true;
    };
    const nearest = (ev) => {
      const r = overlay.getBoundingClientRect();
      const px = ev.clientX - r.left, py = ev.clientY - r.top;
      let best = null, bd = Infinity;
      for (let i = 0; i < n; i++) {
        const d = two ? Math.hypot(sx(H.points[i][0]) - px, sy(H.points[i][1]) - py) : Math.abs(sx(H.xs[i]) - px);
        if (d < bd) { bd = d; best = i; }
      }
      return two && bd > 28 ? null : best;
    };
    overlay.addEventListener('pointermove', (ev) => show(nearest(ev)));
    overlay.addEventListener('pointerleave', hide);
    overlay.addEventListener('pointerdown', (ev) => {
      const i = nearest(ev);
      show(i);
      if (i !== null) H.onClick?.(i);
    });
    this.svg.setAttribute('tabindex', '0');
    this.svg.onkeydown = (ev) => {
      if (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') {
        ev.preventDefault();
        const cur = this.hoverIndex ?? (ev.key === 'ArrowRight' ? -1 : n);
        show(Math.max(0, Math.min(n - 1, cur + (ev.key === 'ArrowRight' ? 1 : -1))));
      } else if (ev.key === 'Enter' && this.hoverIndex !== null) H.onClick?.(this.hoverIndex);
      else if (ev.key === 'Escape') hide();
    };
    this.svg.onblur = hide;
    if (this.hoverIndex !== null && this.hoverIndex < n) show(this.hoverIndex);
  }
}

/** A plain HTML table: columns [{label, key|get, fmt, num}], rows [...]. Safe text only. */
export function dataTable(host, columns, rows) {
  const table = document.createElement('table');
  table.className = 'data-table';
  const thead = table.createTHead().insertRow();
  for (const c of columns) {
    const th = document.createElement('th');
    th.textContent = c.label;
    if (c.num !== false) th.className = 'num';
    thead.append(th);
  }
  const tb = table.createTBody();
  for (const r of rows) {
    const tr = tb.insertRow();
    if (r._cls) tr.className = r._cls;
    for (const c of columns) {
      const td = tr.insertCell();
      const v = c.get ? c.get(r) : r[c.key];
      td.textContent = c.fmt ? c.fmt(v, r) : v;
      if (c.num !== false) td.className = 'num';
    }
  }
  host.replaceChildren(table);
  return table;
}
