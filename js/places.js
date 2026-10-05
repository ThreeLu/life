// 想去的地方：纯计算（不碰 DOM）。
// places = [{ id, name, kind, district, why, link, cost, season, want 1–3, lat, lng, at, visits: [{ id, day, score 1–5, note, photo? }] }]
// 坐标用高德地图的坐标（GCJ-02）：地图底图是高德的，在地图上点出来的就是这个坐标；手机定位（WGS-84）要先转一下。

import { addDays, daysBetween, parseDay } from './life.js';

export const PLACE_KINDS = {
  spot: { name: '景点', color: '#5f9a6a', indoor: false },
  walk: { name: '逛街', color: '#5f7fa8', indoor: false },
  shop: { name: '店', color: '#7a68b0', indoor: true },
  food: { name: '吃的', color: '#c0803f', indoor: true },
  show: { name: '展览演出', color: '#b97a92', indoor: true },
  museum: { name: '博物馆', color: '#a0704a', indoor: true },
  other: { name: '其他', color: '#8a857c', indoor: true },
};

// 小红书「分享 → 复制链接」复制出来的一段：标题 + 作者 + 链接 + 「复制本条信息……」
export function parseShare(text) {
  const s = String(text || '').trim();
  const url = (s.match(/https?:\/\/[^\s，。！!）)]+/) || [])[0] || '';
  let title = url ? s.slice(0, s.indexOf(url)) : s;
  title = title
    .replace(/复制本条信息.*$/s, '')
    .replace(/[【】]/g, ' ')
    .replace(/\|\s*小红书.*$/, '')
    .replace(/-\s*[^-\s]{1,20}\s*$/, '') // 末尾的「- 作者名」
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, ' ')
    .replace(/\b[A-Za-z0-9]{8,}\b/g, ' ') // 口令码
    .replace(/\s+/g, ' ')
    .trim();
  return { title, url };
}

// DeepSeek 找到的地方 → 整理一下：类型、区只能是已有的；坐标离城市太远（大于 80 公里）就不要，算不准
export function cleanCandidates(list, { center, districts = [] } = {}) {
  const out = [];
  for (const c of Array.isArray(list) ? list : []) {
    const name = String(c?.name || '').trim();
    if (!name) continue;
    const lat = Number(c.lat); const lng = Number(c.lng);
    let ok = Number.isFinite(lat) && Number.isFinite(lng) && lat && lng;
    if (ok && center && distanceKm(center[0], center[1], lat, lng) > 80) ok = false;
    const district = c.district === '外地' || districts.includes(c.district) ? c.district : null;
    out.push({
      name, address: String(c.address || '').trim(),
      kind: PLACE_KINDS[c.kind] ? c.kind : 'other', district,
      ...(ok ? { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 } : {}),
      sure: c.sure !== false,
    });
  }
  return out.filter((c, i) => out.findIndex((x) => x.name === c.name) === i).slice(0, 10);
}
export function distanceKm(lat1, lng1, lat2, lng2) {
  const r = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lng2 - lng1) * r) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(a));
}

export const visited = (p) => (p.visits || []).length > 0;
export const lastVisit = (p) => (p.visits || []).reduce((a, v) => (!a || v.day > a.day ? v : a), null);
export const bestScore = (p) => Math.max(0, ...(p.visits || []).map((v) => v.score || 0));

// 周末去哪：只从自己写的地方挑。三类轮着来：没去过的（想去程度高的先）、去过觉得好的（4 分以上）、好久没去的（60 天以上）。
// rainy = 周末要下雨：先推室内的。返回最多 n 个 { place, why }
export function weekendPicks(places, today, { rainy = false, n = 2 } = {}) {
  const cand = [];
  for (const p of places) {
    if (p.archived) continue;
    const last = lastVisit(p);
    let score; let why;
    if (!last) { score = 30 + (p.want || 1) * 10; why = '想去还没去'; }
    else if (bestScore(p) >= 4 && daysBetween(last.day, today) >= 21) { score = 20 + bestScore(p) * 2; why = `去过觉得好（${bestScore(p)} 分）`; }
    else if (daysBetween(last.day, today) >= 60) { score = 15; why = `${daysBetween(last.day, today)} 天没去了`; }
    else continue;
    const kind = PLACE_KINDS[p.kind] || PLACE_KINDS.other;
    if (rainy && !kind.indoor) score -= 25;
    cand.push({ place: p, why, score });
  }
  cand.sort((a, b) => b.score - a.score || a.place.name.localeCompare(b.place.name));
  // 两个尽量不是同一类
  const out = [];
  for (const c of cand) {
    if (out.length >= n) break;
    if (out.length && out.some((x) => x.why.slice(0, 2) === c.why.slice(0, 2)) && cand.some((x) => !out.includes(x) && x !== c && x.why.slice(0, 2) !== out[0].why.slice(0, 2))) continue;
    out.push(c);
  }
  for (const c of cand) if (out.length < n && !out.includes(c)) out.push(c);
  return out;
}

// 按区看进度：{ 区: { total, visited } }
export function districtProgress(places, districts) {
  const out = Object.fromEntries((districts || []).map((d) => [d, { total: 0, visited: 0 }]));
  for (const p of places) {
    const d = p.district || '没分区';
    out[d] ||= { total: 0, visited: 0 };
    out[d].total++;
    if (visited(p)) out[d].visited++;
  }
  return out;
}

// 足迹：某年去过的每一次
export function footprints(places, year) {
  const out = [];
  for (const p of places) for (const v of p.visits || []) if (v.day.startsWith(String(year))) out.push({ place: p, visit: v });
  return out.sort((a, b) => b.visit.day.localeCompare(a.visit.day));
}

// 这个周末的周六、周日（今天是周六周日就是这个，周一到周五是接下来那个）
export function weekendDays(today) {
  const dow = parseDay(today).getDay();
  const sat = dow === 0 ? addDays(today, -1) : addDays(today, (6 - dow + 7) % 7);
  return [sat, addDays(sat, 1)];
}

// WGS-84（手机定位）→ GCJ-02（高德）。公开的标准近似算法
export function wgsToGcj(lat, lng) {
  const a = 6378245.0;
  const ee = 0.00669342162296594323;
  const tLat = (x, y) => {
    let r = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
    r += ((20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2) / 3;
    r += ((20 * Math.sin(y * Math.PI) + 40 * Math.sin((y / 3) * Math.PI)) * 2) / 3;
    r += ((160 * Math.sin((y / 12) * Math.PI) + 320 * Math.sin((y * Math.PI) / 30)) * 2) / 3;
    return r;
  };
  const tLng = (x, y) => {
    let r = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
    r += ((20 * Math.sin(6 * x * Math.PI) + 20 * Math.sin(2 * x * Math.PI)) * 2) / 3;
    r += ((20 * Math.sin(x * Math.PI) + 40 * Math.sin((x / 3) * Math.PI)) * 2) / 3;
    r += ((150 * Math.sin((x / 12) * Math.PI) + 300 * Math.sin((x / 30) * Math.PI)) * 2) / 3;
    return r;
  };
  let dLat = tLat(lng - 105, lat - 35);
  let dLng = tLng(lng - 105, lat - 35);
  const rad = (lat / 180) * Math.PI;
  let magic = Math.sin(rad);
  magic = 1 - ee * magic * magic;
  const sq = Math.sqrt(magic);
  dLat = (dLat * 180) / (((a * (1 - ee)) / (magic * sq)) * Math.PI);
  dLng = (dLng * 180) / ((a / sq) * Math.cos(rad) * Math.PI);
  return { lat: lat + dLat, lng: lng + dLng };
}
