// 分析：纯计算（不碰 DOM）。只用记下来的数，数据不够就说「还需要几天」，不硬下结论。
// 只能看出「两件事常常一起出现」，看不出谁导致谁——页面上要这样写。

import { addDays, daysBetween, parseDay, weekOf, careFullDay } from './life.js';

export const MIN_DAYS = 21; // 心情记满这么多天，「什么在影响我」才开始给结论

const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

// 睡了几小时（跨午夜）
export function sleepHours(sl) {
  if (!sl?.bed || !sl?.wake) return null;
  let m = toMin(sl.wake) - toMin(sl.bed);
  if (m <= 0) m += 1440;
  return m / 60;
}
// 入睡时间换成「晚上 18 点起的分钟数」，凌晨 1 点 = 420，好比较早晚
export function bedMinutes(sl) {
  if (!sl?.bed) return null;
  const m = toMin(sl.bed);
  return m < 18 * 60 ? m + 360 : m - 1080;
}
export const bedLabel = (m) => { const t = (m + 1080) % 1440; return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };

export function rangeDays(from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

const evDays = (data, test) => new Set(data.events.filter(test).map((e) => e.day));

// 「什么在影响我」：每个因素，做了的日子 vs 没做的日子，结果差多少。
// 返回 [{ key, name, target, with, without, nWith, nWithout, diff, unit, reliable }]，按差多少排序
export function influences(data, today, { weather = {}, spend = {} } = {}) {
  const days = Object.keys(data.days).filter((d) => d <= today).sort();
  const D = (d) => data.days[d] || {};
  const sport = evDays(data, (e) => e.type === 'sport');
  const lateDrink = evDays(data, (e) => e.type === 'drink' && new Date(e.at).getHours() >= 15);
  const out = [];
  // 因素（某天的真假） → 结果（某天的数）
  const factor = (key, name, has, result, target, unit, valid = () => true) => {
    const w = []; const wo = [];
    for (const d of days) {
      if (!valid(d)) continue;
      const r = result(d);
      if (r === null || r === undefined) continue;
      (has(d) ? w : wo).push(r);
    }
    if (w.length < 3 || wo.length < 3) return;
    const a = avg(w); const b = avg(wo);
    out.push({ key, name, target, unit, with: a, without: b, diff: a - b, nWith: w.length, nWithout: wo.length, reliable: Math.min(w.length, wo.length) >= 7 });
  };
  const mood = (d) => D(d).mood ?? null;
  const energy = (d) => D(d).energy ?? null;
  const next = (fn) => (d) => fn(addDays(d, 1));
  factor('sleep7', '睡够 7 小时', (d) => sleepHours(D(d).sleep) >= 7, mood, '当天心情', '分', (d) => sleepHours(D(d).sleep) !== null);
  factor('sleep7e', '睡够 7 小时', (d) => sleepHours(D(d).sleep) >= 7, energy, '当天精力', '分', (d) => sleepHours(D(d).sleep) !== null);
  factor('sport', '运动了', (d) => sport.has(d), mood, '当天心情', '分');
  factor('sportE', '运动了', (d) => sport.has(d), next(energy), '第二天精力', '分');
  factor('drink', '下午 3 点后喝了咖啡奶茶茶', (d) => lateDrink.has(d), (d) => bedMinutes(D(addDays(d, 1)).sleep), '当晚几点睡', '分钟晚');
  factor('pray', '前一晚祷告了', (d) => Boolean(D(addDays(d, -1)).prayer?.night), mood, '当天心情', '分');
  factor('read', '读了经', (d) => D(d).read !== undefined, mood, '当天心情', '分');
  factor('care', '护肤都做完', (d) => careFullDay(data, d), mood, '当天心情', '分');
  factor('planYes', '前一天的计划做到了', (d) => D(d).planDone === 'yes', mood, '当天心情', '分', (d) => Boolean(D(d).planDone));
  if (Object.keys(weather).length) {
    factor('rain', '下雨天', (d) => (weather[d]?.rain || 0) >= 1, mood, '当天心情', '分', (d) => Boolean(weather[d]));
    factor('sun', '大晴天（日照 6 小时以上）', (d) => (weather[d]?.sun || 0) >= 6, mood, '当天心情', '分', (d) => Boolean(weather[d]));
  }
  if (Object.keys(spend).length) {
    factor('spend', '心情低（4 分以下）', (d) => (D(d).mood || 10) <= 4, (d) => spend[d] ?? 0, '那天花的钱', '元', (d) => Boolean(D(d).mood));
  }
  return out.sort((a, b) => Math.abs(normalize(b)) - Math.abs(normalize(a)));
}
// 不同单位放一起排：心情按 10 分，精力按 5 分，睡觉按 60 分钟，花钱按 50 元算「一档」
function normalize(x) {
  const scale = x.key === 'drink' ? 60 : x.key === 'spend' ? 50 : x.target.includes('精力') ? 1 : 2;
  return x.diff / scale;
}

// 一句话描述一个因素
export function influenceText(x) {
  const n = (v) => (Math.abs(v) >= 10 ? Math.round(v) : Math.round(v * 10) / 10);
  if (x.key === 'drink') return `${x.name}的晚上，平均晚睡 ${n(x.diff)} 分钟`;
  if (x.key === 'spend') return `${x.name}的日子，平均花 ${n(x.with)} 元；其他日子 ${n(x.without)} 元`;
  const dir = x.diff >= 0 ? '高' : '低';
  return `${x.name}的日子，${x.target}平均 ${n(x.with)}，其他日子 ${n(x.without)}（${dir} ${n(Math.abs(x.diff))}）`;
}

export function moodDays(data, today) {
  return Object.keys(data.days).filter((d) => d <= today && data.days[d].mood).length;
}

// 最近 n 天的一个数，加 7 天平均
export function series(data, today, n, get) {
  const days = rangeDays(addDays(today, -(n - 1)), today);
  const vals = days.map((d) => get(d));
  const ma = vals.map((_, i) => {
    const win = vals.slice(Math.max(0, i - 6), i + 1).filter((v) => v !== null && v !== undefined);
    return win.length >= 3 ? avg(win) : null;
  });
  return { days, vals, ma };
}

// 作息：最近 n 天每天几点睡几点起；工作日 / 周末平均
export function sleepPattern(data, today, n = 30) {
  const days = rangeDays(addDays(today, -(n - 1)), today);
  const rows = days.map((d) => ({ day: d, sl: data.days[d]?.sleep })).filter((x) => x.sl?.bed && x.sl?.wake);
  const weekend = (d) => [0, 6].includes(parseDay(d).getDay()); // 记在醒来那天：周六、周日早上醒来 = 周五、周六晚上睡
  const part = (f) => {
    const xs = rows.filter((r) => f(r.day));
    return { n: xs.length, hours: avg(xs.map((r) => sleepHours(r.sl))), bed: avg(xs.map((r) => bedMinutes(r.sl))) };
  };
  return { rows, all: part(() => true), weekday: part((d) => !weekend(d)), weekend: part(weekend) };
}

// 一件事的规律（洗澡、运动、喝的）
export function rhythm(data, today, test) {
  const list = data.events.filter(test).sort((a, b) => a.at.localeCompare(b.at));
  const days = [...new Set(list.map((e) => e.day))];
  const gaps = [];
  for (let i = 1; i < days.length; i++) gaps.push(daysBetween(days[i - 1], days[i]));
  const weekday = Array(7).fill(0);
  const hours = { 早上: 0, 下午: 0, 晚上: 0, 深夜: 0 };
  for (const e of list) {
    weekday[(parseDay(e.day).getDay() + 6) % 7]++;
    const h = new Date(e.at).getHours();
    hours[h >= 5 && h < 12 ? '早上' : h >= 12 && h < 18 ? '下午' : h >= 18 && h < 23 ? '晚上' : '深夜']++;
  }
  const month = today.slice(0, 7);
  const prev = addDays(`${month}-01`, -1).slice(0, 7);
  return {
    count: list.length,
    avgGap: avg(gaps), maxGap: gaps.length ? Math.max(...gaps) : null,
    since: days.length ? daysBetween(days[days.length - 1], today) : null,
    weekday, hours,
    thisMonth: list.filter((e) => e.day.startsWith(month)).length,
    lastMonth: list.filter((e) => e.day.startsWith(prev)).length,
    days: new Set(days),
  };
}

// 护肤：每一项最近 30 天做了几天
export function careRates(data, today, n = 30) {
  const days = rangeDays(addDays(today, -(n - 1)), today).filter((d) => d >= data.startDate);
  return data.look.routine.filter((r) => r.when !== 'week').map((r) => ({
    r, done: days.filter((d) => data.days[d]?.care?.[r.id]).length, total: days.length,
  }));
}

// 计划完成率：做到 1、一部分 0.5、没做 0；按周
export function planRates(data, today, weeks = 8) {
  const out = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const mon = addDays(weekOf(today), -7 * i);
    const vals = rangeDays(mon, addDays(mon, 6)).map((d) => data.days[d]?.planDone).filter(Boolean);
    out.push({ mon, n: vals.length, rate: vals.length ? avg(vals.map((v) => ({ yes: 1, part: 0.5, no: 0 }[v]))) : null });
  }
  return out;
}

// 生病前一周：睡眠、压力和平时比
export function beforeSick(data) {
  const eps = data.sick?.history || [];
  if (!eps.length) return null;
  const pre = new Set();
  for (const ep of eps) for (let i = 1; i <= 7; i++) pre.add(addDays(ep.start, -i));
  const all = Object.keys(data.days);
  const pick = (set, f) => avg(all.filter((d) => set(d)).map(f).filter((v) => v !== null && v !== undefined));
  const sl = (d) => sleepHours(data.days[d]?.sleep);
  const st = (d) => data.days[d]?.stress ?? null;
  return {
    n: eps.length,
    sleepBefore: pick((d) => pre.has(d), sl), sleepUsual: pick((d) => !pre.has(d), sl),
    stressBefore: pick((d) => pre.has(d), st), stressUsual: pick((d) => !pre.has(d), st),
  };
}

// 最近几天状态不对：连续 3 天心情 ≤4，或连续 3 晚睡不到 6 小时。只说看到的情况
export function gentleNote(data, today) {
  const last3 = [1, 2, 3].map((i) => data.days[addDays(today, -i)] || {});
  const lowMood = last3.every((r) => r.mood && r.mood <= 4);
  const shortSleep = [0, 1, 2].map((i) => sleepHours(data.days[addDays(today, -i)]?.sleep)).every((h) => h !== null && h < 6);
  if (lowMood && shortSleep) return '这几天睡得少，心情也有点低';
  if (lowMood) return '这几天心情有点低';
  if (shortSleep) return '这几天没睡够，今晚早点睡';
  return null;
}

// 一段时间的数字汇总（周报、月报、年报都用它）
export function periodSummary(data, from, to) {
  const days = rangeDays(from, to);
  const rec = days.map((d) => data.days[d]).filter(Boolean);
  const ev = (t) => data.events.filter((e) => e.type === t && e.day >= from && e.day <= to);
  const sports = ev('sport');
  const moods = rec.map((r) => r.mood).filter(Boolean);
  const best = days.filter((d) => data.days[d]?.mood).sort((a, b) => data.days[b].mood - data.days[a].mood)[0];
  const slp = days.map((d) => sleepHours(data.days[d]?.sleep)).filter((v) => v !== null);
  return {
    from, to, days: days.length,
    recorded: rec.filter((r) => r.mood || r.note).length,
    mood: avg(moods), energy: avg(rec.map((r) => r.energy).filter(Boolean)), stress: avg(rec.map((r) => r.stress).filter(Boolean)),
    bestDay: best || null,
    sleep: avg(slp),
    careDays: days.filter((d) => careFullDay(data, d)).length,
    showers: ev('shower').length,
    sports: sports.length, sportMinutes: sports.reduce((a, e) => a + (e.minutes || 0), 0), km: sports.reduce((a, e) => a + (e.km || 0), 0),
    drinks: ev('drink').length,
    prayers: days.filter((d) => data.days[d]?.prayer?.night).length,
    reads: days.filter((d) => data.days[d]?.read !== undefined).length,
    english: ev('english').length,
    did: days.map((d) => ({ day: d, did: data.days[d]?.did })).filter((x) => x.did),
    notes: days.map((d) => ({ day: d, note: data.days[d]?.note, mood: data.days[d]?.mood })).filter((x) => x.note),
    sick: (data.sick?.history || []).filter((x) => x.start <= to && x.end >= from).length,
    habits: Object.values(data.look.steps).filter((x) => x.status === 'habit' && x.habitAt >= from && x.habitAt <= to).length,
    visits: (data.places || []).flatMap((p) => (p.visits || []).filter((v) => v.day >= from && v.day <= to).map((v) => ({ name: p.name, ...v }))),
  };
}
