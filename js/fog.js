// 济南点亮地图（2026-10-26 用户要的）：主城区盖一层雾，分成约 1 公里一格的六边形，去过的地方把雾吹开。纯计算。
// 点亮的来源：想去的地方里「去过了」（那一格和周围 6 格）、「我在这」（只那一格）、坐地铁进出过的站（那一格）。
// 坐标都是高德坐标（GCJ-02），和地图底图、想去的地方一致。

import { MAIN_DISTRICTS, METRO } from './jinan.js';

const LAT0 = 36.67;
const LNG0 = 117.0;
const KX = 111.32 * Math.cos((LAT0 * Math.PI) / 180); // 每度经度多少公里
const KY = 110.574; // 每度纬度多少公里
export const HEX_KM = 1; // 六边形对边的距离
const S = HEX_KM / Math.sqrt(3); // 中心到顶点
const SQ3 = Math.sqrt(3);

const toXY = (lat, lng) => [(lng - LNG0) * KX, (lat - LAT0) * KY];
const toLatLng = (x, y) => [LAT0 + y / KY, LNG0 + x / KX];

// 点 → 所在格子（尖顶六边形，轴坐标 q, r），键是 "q,r"
export function cellOf(lat, lng) {
  const [x, y] = toXY(lat, lng);
  const fq = ((SQ3 / 3) * x - y / 3) / S;
  const fr = ((2 / 3) * y) / S;
  const fs = -fq - fr;
  let q = Math.round(fq); let r = Math.round(fr); const s = Math.round(fs);
  const dq = Math.abs(q - fq); const dr = Math.abs(r - fr); const ds = Math.abs(s - fs);
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  return `${q},${r}`;
}
const center = (q, r) => toLatLng(S * (SQ3 * q + (SQ3 / 2) * r), S * 1.5 * r);
export function cellCenter(key) { const [q, r] = key.split(',').map(Number); return center(q, r); }
// 六个顶点 [[lat, lng], …]。grow：放大一点点，画雾时相邻的格子叠住，不留细缝
export function cellRing(key, grow = 1) {
  const [q, r] = key.split(',').map(Number);
  const cx = S * (SQ3 * q + (SQ3 / 2) * r); const cy = S * 1.5 * r;
  return Array.from({ length: 6 }, (_, i) => { const a = (Math.PI / 180) * (60 * i - 30); return toLatLng(cx + grow * S * Math.cos(a), cy + grow * S * Math.sin(a)); });
}
export function neighbors(key) {
  const [q, r] = key.split(',').map(Number);
  return [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]].map(([a, b]) => `${q + a},${r + b}`);
}

// 点在不在多边形里（射线法），ring = [[lng, lat], …]
function inRing(lng, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]; const [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
export function districtAt(lat, lng) {
  return MAIN_DISTRICTS.find((d) => d.rings.some((ring) => inRing(lng, lat, ring)))?.name || null;
}

// 主城区的所有格子：{ 键: 区 }（中心落在哪个区就算哪个区），算一次存着
let gridCache = null;
export function mainGrid() {
  if (gridCache) return gridCache;
  const pts = MAIN_DISTRICTS.flatMap((d) => d.rings.flat());
  const lats = pts.map((p) => p[1]); const lngs = pts.map((p) => p[0]);
  const [x0, y0] = toXY(Math.min(...lats), Math.min(...lngs));
  const [x1, y1] = toXY(Math.max(...lats), Math.max(...lngs));
  const grid = {};
  const r0 = Math.floor(y0 / (1.5 * S)) - 1; const r1 = Math.ceil(y1 / (1.5 * S)) + 1;
  for (let r = r0; r <= r1; r++) {
    const q0 = Math.floor((x0 / S - (SQ3 / 2) * r) / SQ3) - 1; const q1 = Math.ceil((x1 / S - (SQ3 / 2) * r) / SQ3) + 1;
    for (let q = q0; q <= q1; q++) {
      const [lat, lng] = center(q, r);
      const dist = districtAt(lat, lng);
      if (dist) grid[`${q},${r}`] = dist;
    }
  }
  gridCache = grid;
  return grid;
}

// 地铁站：{ 站名: { lat, lng, lines: [线] } }（换乘站在几条线上）
export function metroStations() {
  const out = {};
  for (const l of METRO) for (const [name, lat, lng] of l.stations) (out[name] ||= { lat, lng, lines: [] }).lines.push(l.ref);
  return out;
}
// 进出过的站（只算上车、下车的两站）：{ 站名: 第一次的日子 }
export function stationsVisited(data) {
  const out = {};
  for (const x of [...(data.metro || [])].sort((a, b) => a.day.localeCompare(b.day))) for (const s of [x.from, x.to]) if (s && !out[s]) out[s] = x.day;
  return out;
}
// 每条线：{ ref, name, total, done, stations: [{ name, day? }] }
export function metroProgress(data) {
  const v = stationsVisited(data);
  return METRO.map((l) => ({ ref: l.ref, name: l.name, total: l.stations.length, done: l.stations.filter(([n]) => v[n]).length,
    stations: l.stations.map(([name, lat, lng]) => ({ name, lat, lng, day: v[name] || null })) }));
}

// 点亮的格子：{ 键: 第一次点亮的日子 }（不止主城区，外面的也记着，只是不算进度）
export function litCells(data) {
  const lit = {};
  const add = (key, day) => { if (!lit[key] || day < lit[key]) lit[key] = day; };
  for (const p of data.places || []) {
    if (!p.lat || !p.lng) continue;
    for (const v of p.visits || []) { const k = cellOf(p.lat, p.lng); add(k, v.day); for (const n of neighbors(k)) add(n, v.day); }
  }
  for (const x of data.lights || []) add(cellOf(x.lat, x.lng), x.day);
  const st = metroStations();
  for (const [name, day] of Object.entries(stationsVisited(data))) if (st[name]) add(cellOf(st[name].lat, st[name].lng), day);
  return lit;
}

// 进度：主城区一共几格、点亮几格，每个区各自的
export function fogProgress(data) {
  const grid = mainGrid();
  const lit = litCells(data);
  const by = Object.fromEntries(MAIN_DISTRICTS.map((d) => [d.name, { total: 0, lit: 0 }]));
  for (const [k, dist] of Object.entries(grid)) { by[dist].total++; if (lit[k]) by[dist].lit++; }
  const total = Object.keys(grid).length;
  const litN = Object.keys(grid).filter((k) => lit[k]).length;
  return { total, lit: litN, districts: MAIN_DISTRICTS.map((d) => ({ name: d.name, ...by[d.name] })), cells: lit };
}
