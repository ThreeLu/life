// 简单的 SVG 图表：折线（带 7 天平均）、柱状、月历、作息横条。文字只用 textContent，颜色用 CSS 变量。

const NS = 'http://www.w3.org/2000/svg';
function s(tag, attrs = {}, text) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) el.setAttribute(k, v);
  if (text !== undefined) el.textContent = text;
  return el;
}
const W = 320;

// 折线：vals 里可以有 null（那天没记）；点是每天的值，线是 7 天平均
export function lineChart({ days, vals, ma }, { min, max, title = '', color = 'var(--accent)', height = 130, fmt = (v) => v }) {
  const top = 10; const bottom = 18; const left = 22;
  const svg = s('svg', { viewBox: `0 0 ${W} ${height}`, class: 'chart', role: 'img', 'aria-label': title });
  const x = (i) => left + (days.length === 1 ? 0 : (i * (W - left - 6)) / (days.length - 1));
  const y = (v) => top + ((max - v) / (max - min || 1)) * (height - top - bottom);
  for (const g of [min, (min + max) / 2, max]) {
    svg.append(s('line', { x1: left, x2: W, y1: y(g), y2: y(g), style: 'stroke:var(--line)' }));
    svg.append(s('text', { x: left - 4, y: y(g) + 3, 'text-anchor': 'end', class: 'chart-label' }, String(fmt(Math.round(g * 10) / 10))));
  }
  vals.forEach((v, i) => { if (v !== null && v !== undefined) svg.append(s('circle', { cx: x(i), cy: y(v), r: 2.2, style: `fill:${color};opacity:.45` })); });
  let path = '';
  ma.forEach((v, i) => { if (v === null) return; path += `${path && ma[i - 1] !== null ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`; });
  if (path) svg.append(s('path', { d: path, fill: 'none', style: `stroke:${color}`, 'stroke-width': 2, 'stroke-linejoin': 'round' }));
  const lab = (i) => { const d = days[i]; return `${Number(d.slice(5, 7))}/${Number(d.slice(8))}`; };
  for (const i of [0, Math.floor((days.length - 1) / 2), days.length - 1]) svg.append(s('text', { x: x(i), y: height - 4, 'text-anchor': i === 0 ? 'start' : i === days.length - 1 ? 'end' : 'middle', class: 'chart-label' }, lab(i)));
  return svg;
}

// 柱状：bars = [{ label, v }]
export function barChart(bars, { title = '', color = 'var(--accent)', height = 110, fmt = (v) => v } = {}) {
  const top = 14; const bottom = 18;
  const max = Math.max(1, ...bars.map((b) => b.v || 0));
  const slot = W / bars.length; const bw = Math.min(26, slot * 0.6);
  const svg = s('svg', { viewBox: `0 0 ${W} ${height}`, class: 'chart', role: 'img', 'aria-label': title });
  bars.forEach((b, i) => {
    const hgt = ((b.v || 0) / max) * (height - top - bottom);
    const x = slot * i + (slot - bw) / 2;
    svg.append(s('rect', { x, y: height - bottom - hgt, width: bw, height: Math.max(b.v ? 1.5 : 0, hgt), rx: 3, style: `fill:${b.color || color}` }));
    if (b.v) svg.append(s('text', { x: x + bw / 2, y: height - bottom - hgt - 3, 'text-anchor': 'middle', class: 'chart-num' }, String(fmt(b.v))));
    svg.append(s('text', { x: slot * i + slot / 2, y: height - 4, 'text-anchor': 'middle', class: 'chart-label' }, b.label));
  });
  return svg;
}

// 月历：一个月，做了的日子涂色。marks = Set(日期)
export function monthGrid(month, marks, { color = 'var(--accent)', title = '' } = {}) {
  const [y, m] = month.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const n = new Date(y, m, 0).getDate();
  const off = (first.getDay() + 6) % 7;
  const cell = 40; const gap = 4; const rows = Math.ceil((off + n) / 7);
  const svg = s('svg', { viewBox: `0 0 ${7 * (cell + gap)} ${rows * (cell * 0.62 + gap) + 14}`, class: 'chart month-grid', role: 'img', 'aria-label': title });
  '一二三四五六日'.split('').forEach((w, i) => svg.append(s('text', { x: i * (cell + gap) + cell / 2, y: 10, 'text-anchor': 'middle', class: 'chart-label' }, w)));
  for (let d = 1; d <= n; d++) {
    const k = off + d - 1;
    const day = `${month}-${String(d).padStart(2, '0')}`;
    const x = (k % 7) * (cell + gap); const yy = 14 + Math.floor(k / 7) * (cell * 0.62 + gap);
    svg.append(s('rect', { x, y: yy, width: cell, height: cell * 0.62, rx: 5, style: `fill:${marks.has(day) ? color : 'var(--chip)'}` }));
    svg.append(s('text', { x: x + cell / 2, y: yy + cell * 0.42, 'text-anchor': 'middle', class: 'chart-label', style: marks.has(day) ? 'fill:#fff' : '' }, String(d)));
  }
  return svg;
}

// 作息横条：rows = [{ day, bed: 晚 18 点起的分钟, wake: 同 }]，横轴 21:00 → 第二天 12:00
export function sleepBars(rows, { title = '' } = {}) {
  const from = 180; const to = 1080; // 21:00 → 次日 12:00
  const rowH = 9; const left = 30; const height = rows.length * rowH + 18;
  const svg = s('svg', { viewBox: `0 0 ${W} ${height}`, class: 'chart', role: 'img', 'aria-label': title });
  const x = (m) => left + ((Math.min(Math.max(m, from), to) - from) / (to - from)) * (W - left - 4);
  for (const [m, t] of [[180, '21'], [360, '0'], [540, '3'], [720, '6'], [900, '9'], [1080, '12']]) {
    svg.append(s('line', { x1: x(m), x2: x(m), y1: 0, y2: height - 14, style: 'stroke:var(--line)' }));
    svg.append(s('text', { x: x(m), y: height - 3, 'text-anchor': 'middle', class: 'chart-label' }, `${t}点`));
  }
  rows.forEach((r, i) => {
    const yy = i * rowH + 2;
    if (i % 7 === 0) svg.append(s('text', { x: 0, y: yy + 7, class: 'chart-label' }, `${Number(r.day.slice(5, 7))}/${Number(r.day.slice(8))}`));
    if (r.bed !== null && r.wake !== null) {
      const x1 = x(r.bed); const x2 = x(r.wake > r.bed ? r.wake : r.wake + 1440);
      svg.append(s('rect', { x: x1, y: yy, width: Math.max(2, x2 - x1), height: rowH - 3, rx: 3, style: 'fill:var(--blue)' }));
    }
  });
  return svg;
}
