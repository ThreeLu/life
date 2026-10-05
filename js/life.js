// 纯计算：日期（一天从凌晨 4 点开始）、默认数据、每天的打卡清单、定期打理、祷告和小记的统计。
// 不碰 DOM，可以用 node 直接测。
//
// 代码是公开的：这里只放通用的默认值。用的什么产品、祷告事项、密码（只存哈希）都在私有仓库的 life.json 里。

import { STEPS, stepById } from './content.js';

export const DAY_START_HOUR = 4; // 凌晨 4 点前还算前一天（熬夜到 1 点洗的澡算「昨天」）

const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseDay = (s) => new Date(`${s}T12:00:00`);

// 这一刻算哪一天
export function dayKey(at = new Date(), startHour = DAY_START_HOUR) {
  return ymd(new Date(at.getTime() - startHour * 3600000));
}
export function addDays(day, n) {
  const d = parseDay(day);
  d.setDate(d.getDate() + n);
  return ymd(d);
}
export const daysBetween = (a, b) => Math.round((parseDay(b) - parseDay(a)) / 86400000);

// 一周从周一开始；周的名字用那周的周一
export function weekOf(day) {
  const d = parseDay(day);
  const back = (d.getDay() + 6) % 7;
  return addDays(day, -back);
}
export function weekLabel(monday) {
  const a = parseDay(monday);
  const b = parseDay(addDays(monday, 6));
  return `${a.getMonth() + 1}/${a.getDate()}–${b.getMonth() + 1}/${b.getDate()}`;
}
export const hm = (iso) => { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

export function defaultData(today) {
  return {
    version: 1,
    startDate: today,
    settings: {
      rhythmDays: 2, // 小记：几天一次的节奏，只在那一页上提
      checks: true, // 小记：记完弹出三项勾选
      bibleVersion: 48, // Bible App 的译本编号：48 = 新标点和合本（简体，神版）
      sportKinds: ['跑步', '走路', '爬山', '健身', '球类', '其他'],
      drinkKinds: ['咖啡', '奶茶', '茶'],
    },
    days: {}, // { 日期: { mood, note, energy, stress, did, plan, planDone, sleep: { bed, wake, q }, care: { 打卡项 id: true }, prayer: { night, morning }, read } }
    events: [], // 洗澡、运动、喝的、小记……：{ id, day, at, type, ... }
    look: { direction: [], steps: {}, routine: [], products: {}, hide: [] },
    notes: [], // 我学到的：{ id, title, text, track, link, at }
    periodic: DEFAULT_PERIODIC.map((p) => ({ ...p, last: null })),
    weeks: {}, // { 周一的日期: { skin: { score, tags, note }, thanks } }
    prayer: { stage: 1, since: today, items: [], next: 0 },
    private: { supplies: [], ui: {} }, // 小记：ui 是这一页上的文字（名字、按钮、说明），只在私有仓库里
  };
}

export const DEFAULT_PERIODIC = [
  { id: 'pd-nails', name: '剪指甲、磨平', every: 7 },
  { id: 'pd-sheets', name: '换床单枕套', every: 14 },
  { id: 'pd-hair', name: '理发', every: 35 },
  { id: 'pd-brush', name: '换牙刷', every: 90 },
];

// 旧数据补字段（以后加功能时在这里补，保证老数据能打开）
export function migrate(data) {
  const d = defaultData(data.startDate || ymd(new Date()));
  data.settings = { ...d.settings, ...(data.settings || {}) };
  data.days ||= {};
  data.events ||= [];
  data.look = { ...d.look, ...(data.look || {}) };
  data.notes ||= [];
  data.periodic ||= d.periodic;
  data.weeks ||= {};
  data.prayer = { ...d.prayer, ...(data.prayer || {}) };
  data.private = { ...d.private, ...(data.private || {}) };
  return data;
}

// ---------- 每天的打卡 ----------

export const WHEN = { am: '早上', pm: '晚上', shower: '洗澡后', week: '每周' };

// 某个时段的打卡项（optional 的不算进「做完了没有」）
export const routineOf = (data, when) => data.look.routine.filter((r) => r.when === when);

export function careDone(data, day, when) {
  const items = routineOf(data, when).filter((r) => !r.optional);
  const care = data.days[day]?.care || {};
  return { done: items.filter((r) => care[r.id]).length, total: items.length };
}

// 每周做几次的（面膜、水杨酸）：这周做了几次
export function weekCount(data, routineId, day) {
  const mon = weekOf(day);
  let n = 0;
  for (let i = 0; i < 7; i++) if (data.days[addDays(mon, i)]?.care?.[routineId]) n++;
  return n;
}

// 开始学一步：把这一步的打卡项、定期提醒加进来（已经有同名的就不重复加）
export function startStep(data, stepId, today) {
  const step = stepById(stepId);
  if (!step) return;
  data.look.steps[stepId] = { status: 'learning', since: today };
  for (const r of step.routine || []) {
    if (!data.look.routine.some((x) => x.step === stepId && x.name === r.name && x.when === r.when)) {
      data.look.routine.push({ id: `r-${stepId}-${data.look.routine.length}`, step: stepId, ...r });
    }
  }
  for (const p of step.periodic || []) {
    if (!data.periodic.some((x) => x.name === p.name)) data.periodic.push({ id: `pd-${stepId}`, last: null, ...p });
  }
}
// 不学了：打卡项拿掉（以前的打卡记录还在）
export function stopStep(data, stepId) {
  delete data.look.steps[stepId];
  data.look.routine = data.look.routine.filter((r) => r.step !== stepId);
  data.periodic = data.periodic.filter((p) => p.id !== `pd-${stepId}`);
}

export const stepStatus = (data, id) => data.look.steps[id]?.status || 'todo';

// 每条线上「下一步可以是……」：第一个还没开始的
export function nextStep(data, track) {
  return STEPS.find((s) => s.track === track && stepStatus(data, s.id) === 'todo') || null;
}

// 一个打卡项最近 days 天做了几天（用来提示「差不多养成了」）
export function streakInfo(data, routineId, today, days = 21) {
  let n = 0;
  for (let i = 0; i < days; i++) if (data.days[addDays(today, -i)]?.care?.[routineId]) n++;
  return n;
}

// 学了 21 天、其中做到 15 天以上：可以问一句「算养成了吗」
export function readyForHabit(data, stepId, today) {
  const st = data.look.steps[stepId];
  if (!st || st.status !== 'learning' || daysBetween(st.since, today) < 21) return false;
  const items = data.look.routine.filter((r) => r.step === stepId && !r.optional && r.when !== 'week');
  return items.length > 0 && items.every((r) => streakInfo(data, r.id, today) >= 15);
}

// ---------- 定期打理 ----------

export function periodicDue(data, today) {
  return data.periodic
    .map((p) => ({ ...p, left: p.last ? p.every - daysBetween(p.last, today) : 0 }))
    .filter((p) => p.left <= 0)
    .sort((a, b) => a.left - b.left);
}

// ---------- 事件 ----------

export const eventsOn = (data, day, type) => data.events.filter((e) => e.day === day && (!type || e.type === type))
  .sort((a, b) => a.at.localeCompare(b.at));

export function lastEvent(data, type) {
  let last = null;
  for (const e of data.events) if (e.type === type && (!last || e.at > last.at)) last = e;
  return last;
}

// ---------- 小记 ----------
// 事件 type 'p'（主要的一种，带 score 1–5、flag 是否、checks 三项勾选）和 'p2'（另一种，只记时间）。

export function privateStats(data, now = new Date()) {
  const list = data.events.filter((e) => e.type === 'p').sort((a, b) => a.at.localeCompare(b.at));
  const today = dayKey(now);
  const month = today.slice(0, 7);
  const last = list[list.length - 1] || null;
  const since = last ? (now - new Date(last.at)) / 86400000 : null;
  const recent = list.filter((e) => daysBetween(e.day, today) < 30);
  // 平均间隔：最近 30 天里相邻两次之间
  const gaps = [];
  for (let i = 1; i < recent.length; i++) gaps.push((new Date(recent[i].at) - new Date(recent[i - 1].at)) / 86400000);
  const scores = recent.filter((e) => e.score).map((e) => e.score);
  const slot = { 早上: 0, 下午: 0, 晚上: 0, 深夜: 0 };
  for (const e of recent) {
    const hr = new Date(e.at).getHours();
    slot[hr >= 5 && hr < 12 ? '早上' : hr >= 12 && hr < 18 ? '下午' : hr >= 18 && hr < 23 ? '晚上' : '深夜']++;
  }
  return {
    list, last, since,
    month: list.filter((e) => e.day.startsWith(month)).length,
    recent: recent.length,
    avgGap: gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : null,
    avgScore: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
    flag: recent.length ? recent.filter((e) => e.flag).length / recent.length : null,
    slot,
    other: data.events.filter((e) => e.type === 'p2' && daysBetween(e.day, today) < 30).length,
  };
}

// ---------- 祷告 ----------

export const prayedOn = (data, day) => Boolean(data.days[day]?.prayer?.night);

export function prayerStats(data, today) {
  const month = today.slice(0, 7);
  const days = Object.keys(data.days).filter((d) => prayedOn(data, d)).sort();
  const yesterday = addDays(today, -1);
  return {
    month: days.filter((d) => d.startsWith(month)).length,
    last: days[days.length - 1] || null,
    // 昨天没祷告、今天还没：温和地说一句「今晚 2 分钟就好」
    missedYesterday: !prayedOn(data, yesterday) && !prayedOn(data, today) && data.prayer.since <= yesterday,
    stageDays: daysBetween(data.prayer.since, today),
  };
}

// 每个阶段多久以后可以问「要不要进下一步」
export const STAGE_WEEKS = { 1: 4, 2: 4 };
export function stageReady(data, today) {
  const weeks = STAGE_WEEKS[data.prayer.stage];
  return Boolean(weeks) && daysBetween(data.prayer.since, today) >= weeks * 7;
}

// 读经：诗篇一天一篇，119 篇太长拆成 4 天。返回 [{ ch, from?, to?, label }]
export const PSALMS = (() => {
  const out = [];
  for (let ch = 1; ch <= 150; ch++) {
    if (ch === 119) for (const [from, to] of [[1, 48], [49, 96], [97, 144], [145, 176]]) out.push({ ch, from, to, label: `诗篇 119 篇 ${from}–${to} 节` });
    else out.push({ ch, label: `诗篇第 ${ch} 篇` });
  }
  return out;
})();
export function psalmLink(p, version = 48) {
  return `https://www.bible.com/bible/${version}/PSA.${p.ch}${p.from ? `.${p.from}-${p.to}` : ''}`;
}
