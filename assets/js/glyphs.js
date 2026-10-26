// glyphs.js: one small drawing per module, used on the home page map and in
// each module header. Each glyph is a tiny version of the chart the module teaches.

const W = 160, H = 90;
const pts = (arr) => arr.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('');
const dots = (arr, cls = 'g-dot', r = 2.3) => arr.map(([x, y]) => `<circle class="${cls}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}"/>`).join('');
const gauss = (x, m, s) => Math.exp(-0.5 * ((x - m) / s) ** 2);
const series = (ys, x0, x1) => ys.map((y, i) => [x0 + (i * (x1 - x0)) / (ys.length - 1), y]);
const hline = (y, cls, x0 = 6, x1 = 154) => `<line class="${cls}" x1="${x0}" x2="${x1}" y1="${y}" y2="${y}"/>`;

const NOISE = [0.2, -0.6, 0.9, -0.3, 0.5, -0.9, 0.1, 0.7, -0.4, 0.3, -0.7, 0.6, -0.2, 0.8, -0.5, 0.4];

const G = {
  1() {
    const bars = [];
    for (let i = 0; i < 11; i++) {
      const x = 22 + i * 11;
      const h = 62 * gauss(x + 5, 80, 22) + [1, 3, -2, 4, -3, 2, -4, 3, -1, 2, 1][i];
      bars.push(`<rect class="g-bar" x="${x}" y="${84 - h}" width="9" height="${h}" rx="1.5"/>`);
    }
    const curve = [];
    for (let x = 10; x <= 150; x += 2) curve.push([x, 84 - 64 * gauss(x, 80, 22)]);
    return `${hline(84.5, 'g-axis', 10, 150)}${bars.join('')}<path class="g-line-ink" d="${pts(curve)}"/>`;
  },
  2() {
    const ys = [45, 38, 52, 41, 48, 35, 55, 44, 12, 47, 40, 51, 43];
    const s = series(ys, 10, 150);
    return `<rect class="g-zone" x="6" y="22" width="148" height="46"/>${hline(22, 'g-limit')}${hline(45, 'g-center')}${hline(68, 'g-limit')}
      <path class="g-line" d="${pts(s)}"/>${dots(s.filter((_, i) => i !== 8))}${dots([s[8]], 'g-signal', 3.4)}`;
  },
  3() {
    const top = series([24, 18, 29, 21, 26, 16, 28, 22, 25, 19, 27], 10, 150);
    const bot = series([74, 66, 78, 70, 62, 75, 68, 77, 65, 72, 69], 10, 150);
    return `${hline(9, 'g-limit')}${hline(23, 'g-center')}${hline(37, 'g-limit')}<path class="g-line" d="${pts(top)}"/>${dots(top)}
      ${hline(57, 'g-limit')}${hline(71, 'g-center')}${hline(84, 'g-limit')}<path class="g-line-alt" d="${pts(bot)}"/>${dots(bot, 'g-dot-muted', 1.8)}`;
  },
  4() {
    const ys = [26, 20, 31, 17, 28, 23, 34, 21, 27, 18, 30, 24, 22];
    const s = series(ys, 10, 150);
    const mr = s.slice(1).map(([x, y], i) => `<line class="g-line-alt" x1="${x}" x2="${x}" y1="84" y2="${84 - Math.abs(y - s[i][1]) * 1.9}"/>`).join('');
    return `${hline(8, 'g-limit')}${hline(25, 'g-center')}${hline(42, 'g-limit')}<path class="g-line" d="${pts(s)}"/>${dots(s)}${hline(84.5, 'g-axis')}${mr}`;
  },
  5() {
    const ns = [1, 0.7, 1.2, 0.9, 1.4, 0.8, 1, 1.3, 0.75, 1.1, 0.9];
    let up = '', lo = '';
    ns.forEach((k, i) => {
      const x0 = 6 + i * 13.5, x1 = x0 + 13.5;
      const w = 18 / Math.sqrt(k);
      up += `${i ? 'L' : 'M'}${x0},${45 - w}L${x1},${45 - w}`;
      lo += `${i ? 'L' : 'M'}${x0},${45 + w}L${x1},${45 + w}`;
    });
    const ys = [44, 52, 38, 47, 41, 55, 36, 49, 18, 43, 50];
    const s = ys.map((y, i) => [12.75 + i * 13.5, y]);
    return `<path class="g-limit" d="${up}"/><path class="g-limit" d="${lo}"/>${hline(45, 'g-center')}${dots(s.filter((_, i) => i !== 8))}${dots([s[8]], 'g-signal', 3.4)}`;
  },
  6() {
    const ys = [70, 72, 69, 71, 70, 73, 71, 66, 60, 53, 47, 40, 33];
    const s = series(ys, 10, 128);
    const [lx, ly] = s[s.length - 1];
    const d = 10, h = 12;
    const vx = lx + d;
    return `${hline(70.5, 'g-center', 6, 154)}<path class="g-line" d="${pts(s)}"/>${dots(s.slice(0, -1))}${dots([s[s.length - 1]], 'g-signal', 3.4)}
      <path class="g-limit" style="stroke:var(--signal);opacity:.9;stroke-dasharray:none" d="M${vx},${ly}L${lx},${ly - h}L${8},${ly - h - 0.52 * (lx - 8)}M${vx},${ly}L${lx},${ly + h}L${8},${ly + h + 0.52 * (lx - 8)}"/>`;
  },
  7() {
    const raw = [48, 30, 55, 38, 62, 35, 50, 28, 46, 33, 26, 40, 22];
    const s = series(raw, 10, 150);
    let z = 45;
    const e = s.map(([x, y]) => { z = 0.3 * y + 0.7 * z; return [x, z]; });
    return `${hline(20, 'g-limit')}${hline(45, 'g-center')}${hline(70, 'g-limit')}${dots(s, 'g-dot-muted', 2.4)}<path class="g-line" d="${pts(e)}"/>${dots(e, 'g-dot', 1.9)}`;
  },
  8() {
    const curve = [];
    for (let x = 18; x <= 142; x += 2) curve.push([x, 80 - 62 * gauss(x, 86, 17)]);
    return `${hline(80.5, 'g-axis', 10, 150)}<path class="g-fill" d="${pts(curve)}Z"/><path class="g-line-ink" d="${pts(curve)}"/>
      <line class="g-spec" x1="34" x2="34" y1="10" y2="84"/><line class="g-spec" x1="126" x2="126" y1="10" y2="84"/>
      <line class="g-center" x1="80" x2="80" y1="14" y2="84" style="stroke-dasharray:2 2"/>`;
  },
  9() {
    const c = [];
    for (let x = 8; x <= 152; x += 2) { const p = (x - 8) / 144; c.push([x, 10 + 72 / (1 + Math.exp(-(p - 0.45) * 11))]); }
    const at = (x) => c.reduce((a, b) => (Math.abs(b[0] - x) < Math.abs(a[0] - x) ? b : a));
    const [ax, ay] = at(38), [bx, by] = at(98);
    return `${hline(84.5, 'g-axis')}<path class="g-line" d="${pts(c)}"/>
      <line class="g-center" x1="${ax}" x2="${ax}" y1="${ay}" y2="84" style="stroke-dasharray:2 2"/><line class="g-center" x1="${bx}" x2="${bx}" y1="${by}" y2="84" style="stroke-dasharray:2 2"/>
      ${dots([[ax, ay]], 'g-dot', 3.2)}${dots([[bx, by]], 'g-signal', 3.2)}`;
  },
  10() {
    const cx = 78, cy = 46, a = 58, b = 17, t = (-32 * Math.PI) / 180;
    const P = [];
    for (let i = 0; i < 26; i++) {
      const u = NOISE[i % 16] * 0.95, v = NOISE[(i * 5 + 3) % 16] * 0.8;
      const r1 = u * a * 0.95, r2 = v * b * 0.9;
      P.push([cx + r1 * Math.cos(t) - r2 * Math.sin(t), cy + r1 * Math.sin(t) + r2 * Math.cos(t)]);
    }
    return `<rect class="g-limit" x="22" y="10" width="112" height="72" fill="none"/>
      <ellipse class="g-fill-alt" cx="${cx}" cy="${cy}" rx="${a}" ry="${b}" transform="rotate(-32 ${cx} ${cy})"/>
      ${dots(P)}${dots([[44, 24]], 'g-signal', 3.4)}`;
  },
  11() {
    const h = [], f = [];
    for (let i = 0; i <= 28; i++) { const x = 8 + i * 4.2; h.push([x, 62 - i * 0.9 - 14 * Math.sin((i * Math.PI) / 4)]); }
    for (let i = 28; i <= 36; i++) { const x = 8 + i * 4.2; f.push([x, 62 - i * 0.9 - 14 * Math.sin((i * Math.PI) / 4)]); }
    const band = f.map(([x, y], i) => [x, y - 3 - i * 1.4]).concat([...f].reverse().map(([x, y], i) => [x, y + 3 + (f.length - 1 - i) * 1.4]));
    return `${hline(84.5, 'g-axis')}<path class="g-fill" d="${pts(band)}Z"/><path class="g-line" d="${pts(h)}"/><path class="g-line-alt" style="stroke-dasharray:3 3" d="${pts(f)}"/>`;
  },
  12() {
    const r = 38, cx = 80, cy = 46;
    const flat = `M${cx - 12},${cy + r - 1.9}A${r},${r} 0 1 1 ${cx + 12},${cy + r - 1.9}Z`;
    const sites = [[cx, cy - 25], [cx - 25, cy], [cx, cy], [cx + 25, cy], [cx, cy + 25]];
    return `<path class="g-wafer" d="${flat}"/>${hline(cy, 'g-center', cx - r + 4, cx + r - 4)}<line class="g-center" x1="${cx}" x2="${cx}" y1="${cy - r + 4}" y2="${cy + r - 6}"/>
      ${dots(sites, 'g-dot', 4)}${dots([[cx, cy - 25]], 'g-signal', 4)}`;
  },
};

/** SVG markup for module `n`. */
export function glyph(n, label = '') {
  const body = G[n] ? G[n]() : '';
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${label}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
}

/** The course mark: a control chart in miniature. */
export const MARK = `<svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
  <rect x="0.5" y="0.5" width="25" height="25" rx="7" fill="var(--ink)"/>
  <line x1="5" x2="21" y1="8" y2="8" stroke="var(--bg)" stroke-width="1" stroke-dasharray="2 1.6" opacity=".6"/>
  <line x1="5" x2="21" y1="18" y2="18" stroke="var(--bg)" stroke-width="1" stroke-dasharray="2 1.6" opacity=".6"/>
  <path d="M5 14 L8.5 11.5 L12 15 L15.5 12 L19 14.5" fill="none" stroke="var(--bg)" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>
  <circle cx="19" cy="5.6" r="2" fill="var(--signal)"/>
</svg>`;
