// 纯计算：日期（一天从凌晨 4 点开始）、默认数据、每天的打卡清单、定期打理、祷告和小记的统计。
// 不碰 DOM，可以用 node 直接测。
//
// 代码是公开的：这里只放通用的默认值。用的什么产品、祷告事项、密码（只存哈希）都在私有仓库的 life.json 里。

import { CHEERS, CHEER_VERSES, MILESTONE_TEXT, LOW_PLANS } from './content.js';

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
      sportKinds: ['跑步', '走路', '爬山', '健身', '球类', '其他'],
    },
    days: {}, // { 日期: { mood, note, energy, stress, did, plan, planDone, sleep: { bed, wake, q }, care: { 打卡项 id: true }, prayer: { night, morning }, noShower } }
    events: [], // 洗澡、运动、小记……：{ id, day, at, type, ... }
    look: { direction: [], steps: {}, routine: [], identity: null, moments: [] }, // identity：「我是这样的人」自己改过的句子；moments：精致时刻 { id, day, text }
    notes: [], // 我学到的：{ id, title, text, track, link, at }
    periodic: DEFAULT_PERIODIC.map((p) => ({ ...p, last: null })),
    weeks: {}, // { 周一的日期: { skin: { score, tags, note }, thanks } }
    prayer: { stage: 1, since: today, items: [] },
    // 小记：ui 是这一页上的文字（名字、按钮、说明），只在私有仓库里
    private: { supplies: [], ui: {} },
    // 难受的时候：plans 每种难受的清单，notes 写给难受时的自己 { id, text, at }，log 每一次 { id, day, at, kind, before, after, did, helped, note }
    low: { plans: structuredClone(LOW_PLANS), notes: [], log: [] },
    milestones: {}, // { key: 达到的日期 }，seen: { key: true }
    places: [], // 想去的地方，见 places.js
    letters: {}, // DeepSeek 写的回顾：{ w周一 / m月份 / y年份: { at, text, research } }
    goals: [], // 想做到的事，见下面「想做到的事」
    chats: [], // 和 ChatGPT 聊过的：{ id, day, at, mood?, title, text }
    people: [], // 身边的人，见 people.js
    greeted: {}, // 过节问候发了没有：{ '年-节': { 人 id: 日期 } }
    scales: {}, // 心情问卷：{ w周一: { at, day, dass: [21 个 0–3] }, m月份: { at, day, pss: [10 个 0–4], swls: [5 个 0–6] } }，见 scales.js
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
  data.periodic = data.periodic.filter((p) => p.name !== '擦鞋'); // 2026-10-06 擦鞋改成每天早上打卡
  if (data.look.steps['g-clothes'] && !data.look.routine.some((r) => r.step === 'g-clothes' && r.name === '擦鞋')) {
    data.look.routine.push({ id: `r-g-clothes-${data.look.routine.length}`, step: 'g-clothes', name: '擦鞋', when: 'am' });
  }
  // 2026-10-15 润唇只在早上做：晚上的挪到早上（早上已有就去掉晚上的）
  for (const r of data.look.routine.filter((x) => x.when === 'pm' && /润唇|唇膏/.test(x.name))) {
    if (data.look.routine.some((x) => x.when === 'am' && /润唇|唇膏/.test(x.name))) data.look.routine.splice(data.look.routine.indexOf(r), 1);
    else r.when = 'am';
  }
  data.weeks ||= {};
  data.prayer = { ...d.prayer, ...(data.prayer || {}) };
  data.private = { ...d.private, ...(data.private || {}) };
  data.low = { ...d.low, ...(data.low || {}) };
  data.low.plans = { ...LOW_PLANS, ...(data.low.plans || {}) };
  data.milestones ||= {};
  data.places ||= [];
  data.letters ||= {};
  data.goals ||= [];
  data.chats ||= [];
  data.people ||= [];
  data.greeted ||= {};
  data.scales ||= {};
  // 2026-10-24 用户说咖啡奶茶茶、英语、读经的老数据都不要了
  delete data.settings.drinkKinds;
  delete data.english;
  data.events = data.events.filter((e) => !['drink', 'english'].includes(e.type));
  for (const r of Object.values(data.days)) { delete r.read; delete r.readBook; }
  for (const k of ['book', 'pos', 'next']) delete data.prayer[k];
  for (const k of Object.keys(data.milestones)) if (k.startsWith('english-')) delete data.milestones[k];
  // 2026-10-24 护肤品（开封日期、好不好用）也不要了
  delete data.look.products;
  delete data.look.hide;
  // 2026-10-24 生病模式、生病手册整个不要了，老的生病记录、预案、抄的药品说明都删掉
  delete data.sick;
  if (data.milestones.seen) for (const k of Object.keys(data.milestones.seen)) if (k.startsWith('english-')) delete data.milestones.seen[k];
  return data;
}

// ---------- 每天的打卡 ----------

export const WHEN = { am: '早上', pm: '晚上', shower: '洗澡后', week: '每周' };

// 某个时段的打卡项（optional 的不算进「做完了没有」）
export const routineOf = (data, when) => data.look.routine.filter((r) => r.when === when);

export const showeredOn = (data, day) => (data.events || []).some((e) => e.day === day && e.type === 'shower');
// 洗过澡的那天，晚上的洗脸不用再做（洗澡时洗过了）
export const careSkipped = (data, day, r) => r.when === 'pm' && (r.step === 's-cleanse' || /洗脸|洁面/.test(r.name)) && showeredOn(data, day);

export function careDone(data, day, when) {
  const items = routineOf(data, when).filter((r) => !r.optional && !careSkipped(data, day, r));
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

// ---------- 定期打理 ----------

// 到日子了的（没做就一直在，直到点「做了」，从那天重新数）
export function periodicDue(data, today) {
  return data.periodic
    .map((p) => ({ ...p, left: p.last ? p.every - daysBetween(p.last, today) : 0 }))
    .filter((p) => p.left <= 0)
    .sort((a, b) => a.left - b.left);
}
// 明天到日子的：前一天先说一声
export const periodicTomorrow = (data, today) => data.periodic.filter((p) => p.last && p.every - daysBetween(p.last, today) === 1);

// ---------- 事件 ----------

export const eventsOn = (data, day, type) => data.events.filter((e) => e.day === day && (!type || e.type === type))
  .sort((a, b) => a.at.localeCompare(b.at));

export function lastEvent(data, type) {
  let last = null;
  for (const e of data.events) if (e.type === type && (!last || e.at > last.at)) last = e;
  return last;
}

// ---------- 小记 ----------
// 事件 type 'p'（主要的一种，带 score 1–5、flag / flag2 两个是否、checks 三项勾选）和 'p2'（另一种，只记时间）。

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
    flag2: recent.length ? recent.filter((e) => e.flag2).length / recent.length : null,
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

const dayOf = (data, day) => (data.days[day] ||= {});

// ---------- 鼓励 ----------

// 首页每天一句：大多是话，每 4 天一节经文
export function dailyCheer(day) {
  const n = [...day].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0;
  if (n % 4 === 0) return { verse: CHEER_VERSES[(n >>> 2) % CHEER_VERSES.length] };
  return { text: CHEERS[n % CHEERS.length] };
}

// 某天的日常护肤（早上 + 晚上 + 洗澡后里不是可选的）都做完了吗
export function careFullDay(data, day) {
  const items = data.look.routine.filter((r) => !r.optional && ['am', 'pm'].includes(r.when) && !careSkipped(data, day, r));
  const care = data.days[day]?.care || {};
  return items.length > 0 && items.every((r) => care[r.id]);
}

// 新达到的里程碑（还没记过的）
export function newMilestones(data) {
  const allDays = Object.keys(data.days);
  const counts = {
    care: allDays.filter((d) => careFullDay(data, d)).length,
    pray: allDays.filter((d) => data.days[d]?.prayer?.night).length,
    sport: data.events.filter((e) => e.type === 'sport').length,
    night: allDays.filter((d) => data.days[d]?.note).length,
  };
  return Object.keys(MILESTONE_TEXT).filter((key) => {
    const [k, n] = key.split('-');
    return counts[k] >= Number(n) && !data.milestones[key];
  });
}

// ---------- 换季 ----------

// 换季预防：daily = [{ date, min, max }]，第一天是今天。三天内最低温比今天低 8°C 以上，或某天温差 12°C 以上
export function seasonWarning(daily) {
  if (!daily || daily.length < 2) return null;
  const today = daily[0];
  const next = daily.slice(1, 4);
  const coldest = next.reduce((a, b) => (b.min < a.min ? b : a), next[0]);
  const drop = Math.round(today.min - coldest.min);
  if (drop >= 8) return { kind: 'drop', drop, date: coldest.date, text: `${coldest.date.slice(5).replace('-', '/')} 最低 ${Math.round(coldest.min)}°C，比今天低 ${drop}°C` };
  const swing = daily.slice(0, 3).find((x) => x.max - x.min >= 12);
  if (swing) return { kind: 'swing', date: swing.date, text: `${swing.date.slice(5).replace('-', '/')} 早晚温差 ${Math.round(swing.max - swing.min)}°C` };
  return null;
}

// ---------- 打水 ----------
// 一天打一桶。早上不打；中午 11–13 打，中午「不打了」就晚上 17–19 打（17:00 推送提醒）。
// 记在 days[日期].fetch = { noon|eve: true | 'skip' }（老数据还有 am，和 { mid, eve }）
export const BOILER = [
  { slot: 'noon', from: 11 * 60, to: 13 * 60, name: '中午' },
  { slot: 'eve', from: 17 * 60, to: 19 * 60, name: '晚上' },
];
const clock = (m) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
// 哪一回打了、哪几回不打了（老数据 { mid, eve }：mid 算中午，mid 不打了算早上和中午都不打）
export function fetchState(f = {}) {
  const g = { ...f };
  if ('mid' in g) {
    if (g.mid === true) g.noon ??= true;
    else if (g.mid === 'skip') { g.am ??= 'skip'; g.noon ??= 'skip'; }
    delete g.mid;
  }
  const slots = ['am', 'noon', 'eve'];
  return { got: slots.find((x) => g[x] === true) || null, skip: slots.filter((x) => g[x] === 'skip') };
}
// 中午、晚上两行该怎么显示。minutes = 一天里的第几分钟（看以前的日子传 24 * 60）
// 中午那行一直在；晚上那行只在中午没打上时出现（点了不打了，或 13 点过了）
// 每行 { done: true | 'skip' | false, text }
export function fetchRows(f, minutes) {
  const { got, skip } = fetchState(f);
  const [noon, eve] = BOILER;
  const open = (w) => (minutes >= w.from ? `开水房开着，${clock(w.to)} 关` : `${clock(w.from)}–${clock(w.to)} 开`);
  if (got && got !== 'eve') return { noon: { done: true, text: '打好了，今天不用再打' }, eve: null };
  const rows = {};
  if (got === 'eve') rows.noon = { done: 'skip', text: '晚上打了' };
  else if (skip.includes('noon')) rows.noon = { done: 'skip', text: '中午不打了，晚上打' };
  else if (minutes >= noon.to) rows.noon = { done: 'skip', text: '中午没打，晚上打' };
  else return { noon: { done: false, text: open(noon) }, eve: null };
  if (got === 'eve') rows.eve = { done: true, text: '晚上打好了' };
  else if (skip.includes('eve')) rows.eve = { done: 'skip', text: '今天不打了' };
  else if (minutes >= eve.to) rows.eve = { done: 'skip', text: '今天没打' };
  else rows.eve = { done: false, text: open(eve) };
  return rows;
}

// ---------- 难受的时候 ----------
// 某一种难受以前记过几次、做完以后平均好了多少、什么管用
export function lowLessons(log, kind) {
  const list = (log || []).filter((x) => x.kind === kind);
  if (!list.length) return null;
  const both = list.filter((x) => x.before && x.after);
  const helped = {};
  for (const x of list) for (const t of new Set(x.helped || [])) helped[t] = (helped[t] || 0) + 1;
  return {
    n: list.length,
    better: both.length ? Math.round((both.reduce((a, x) => a + (x.before - x.after), 0) / both.length) * 10) / 10 : null,
    helped: Object.entries(helped).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([text, n]) => ({ text, n })),
    last: list[list.length - 1],
  };
}
// 状态好的日子（心情 8 分以上、写了一句话）：难受的时候拿出来给自己看
export function goodDays(data, today, n = 3) {
  return Object.entries(data.days)
    .filter(([d, r]) => d < today && r.mood >= 8 && r.note)
    .sort((a, b) => b[1].mood - a[1].mood || b[0].localeCompare(a[0]))
    .slice(0, n).map(([day, r]) => ({ day, mood: r.mood, note: r.note }));
}

// ---------- 节气 ----------
// 寿星公式（21 世纪）：日 = [Y×0.2422 + C] − [L]，Y 是年份后两位；1、2 月的四个节气 L 用 (Y−1)/4，其余用 Y/4。个别年份可能差一天
const TERMS = [
  ['小寒', 1, 5.4055], ['大寒', 1, 20.12], ['立春', 2, 3.87], ['雨水', 2, 18.73], ['惊蛰', 3, 5.63], ['春分', 3, 20.646],
  ['清明', 4, 4.81], ['谷雨', 4, 20.1], ['立夏', 5, 5.52], ['小满', 5, 21.04], ['芒种', 6, 5.678], ['夏至', 6, 21.37],
  ['小暑', 7, 7.108], ['大暑', 7, 22.83], ['立秋', 8, 7.5], ['处暑', 8, 23.13], ['白露', 9, 7.646], ['秋分', 9, 23.042],
  ['寒露', 10, 8.318], ['霜降', 10, 23.438], ['立冬', 11, 7.438], ['小雪', 11, 22.36], ['大雪', 12, 7.18], ['冬至', 12, 21.94],
];
export function termDates(year) {
  const y = year % 100;
  return TERMS.map(([name, m, c]) => {
    const l = Math.floor((m <= 2 ? y - 1 : y) / 4);
    return { name, day: `${year}-${String(m).padStart(2, '0')}-${String(Math.floor(y * 0.2422 + c) - l).padStart(2, '0')}` };
  });
}
// 今天在哪个节气、下一个是什么、还有几天；season = spring|summer|autumn|winter（立春、立夏、立秋、立冬分）
export function solarTerm(day) {
  const y = Number(day.slice(0, 4));
  const all = [...termDates(y - 1), ...termDates(y), ...termDates(y + 1)];
  const i = all.findIndex((t) => t.day > day) - 1;
  const cur = all[i]; const next = all[i + 1];
  const idx = TERMS.findIndex((t) => t[0] === cur.name);
  const season = ['spring', 'summer', 'autumn', 'winter'][Math.floor(((idx - 2 + 24) % 24) / 6)];
  return { name: cur.name, today: cur.day === day, next: next.name, left: daysBetween(day, next.day), season };
}

// ---------- 想做到的事 ----------
// goals = [{ id, wish（心愿原话）, title, status: talking|active|done|dropped, at, chat（ChatGPT 的小结）, why, key, note,
//            stages: [{ id, title, tasks: [{ id, text, done: 日期|null, buy?: { name, price, query }, wishId? }] }],
//            habits: [{ id, text, perWeek }], doneAt?, droppedAt? }]
// 习惯打卡记在 days[日期].goals[习惯id] = true

// 现在在第几阶段（第一个还有没做完的事的阶段），这一阶段做了几件
export function goalProgress(g) {
  const stages = g.stages || [];
  let i = stages.findIndex((s) => s.tasks.some((t) => !t.done));
  if (i < 0) i = stages.length;
  const cur = stages[i];
  const all = stages.flatMap((s) => s.tasks);
  return {
    stage: i, stages: stages.length, allDone: stages.length > 0 && i === stages.length,
    done: cur ? cur.tasks.filter((t) => t.done).length : 0, total: cur ? cur.tasks.length : 0,
    doneAll: all.filter((t) => t.done).length, totalAll: all.length,
  };
}
export function goalLine(g) {
  const p = goalProgress(g);
  if (g.status === 'talking') return `${g.title || g.wish} · 还没整理`;
  if (p.allDone) return `${g.title} · 都做完了`;
  return `${g.title} · 第 ${p.stage + 1} 阶段 ${p.done}/${p.total}`;
}
// 这周（周一起）某个习惯做了几次
export function habitWeek(data, habitId, today) {
  const mon = weekOf(today);
  let n = 0;
  for (let i = 0; i < 7; i++) if (data.days[addDays(mon, i)]?.goals?.[habitId]) n++;
  return n;
}
// 这周勾掉的事（周报用）
export function goalWeekDone(data, mon) {
  const end = addDays(mon, 6);
  return (data.goals || []).flatMap((g) => (g.stages || []).flatMap((s) => s.tasks.filter((t) => t.done && t.done >= mon && t.done <= end).map((t) => ({ goal: g.title, text: t.text }))));
}
// DeepSeek 整理出来的 → 存进目标。重新整理时，同样文字的事保留「做了」和放进心愿单的记号
export function applyGoalPlan(g, out, newId) {
  const old = new Map((g.stages || []).flatMap((s) => s.tasks).map((t) => [t.text, t]));
  const str = (x, n = 200) => String(x ?? '').trim().slice(0, n);
  g.title = str(out.title, 30) || g.title || str(g.wish, 30);
  g.why = str(out.why); g.key = str(out.key); g.note = str(out.note);
  g.stages = (Array.isArray(out.stages) ? out.stages : []).slice(0, 6).map((s, i) => ({
    id: newId('gs'), title: str(s?.title, 40) || `第 ${i + 1} 阶段`,
    tasks: (Array.isArray(s?.tasks) ? s.tasks : []).slice(0, 8).map((t) => {
      const text = str(typeof t === 'string' ? t : t?.text, 120);
      const prev = old.get(text);
      const b = t?.buy && str(t.buy.name) ? { name: str(t.buy.name, 40), price: Math.max(0, Math.round(Number(t.buy.price) || 0)), query: str(t.buy.query, 40) || str(t.buy.name, 40) } : null;
      return { id: prev?.id || newId('gt'), text, done: prev?.done || null, ...(b ? { buy: b } : {}), ...(prev?.wishId ? { wishId: prev.wishId } : {}) };
    }).filter((t) => t.text),
  })).filter((s) => s.tasks.length);
  const oldH = new Map((g.habits || []).map((x) => [x.text, x]));
  g.habits = (Array.isArray(out.habits) ? out.habits : []).slice(0, 4).map((x) => {
    const text = str(typeof x === 'string' ? x : x?.text, 80);
    return { id: oldH.get(text)?.id || newId('gh'), text, perWeek: Math.min(7, Math.max(1, Math.round(Number(x?.perWeek) || 1))) };
  }).filter((x) => x.text);
  g.status = 'active';
  return g;
}

// ---------- 形象：只看做了什么 ----------

// 这个月：护肤做完几天（早晚都做完）、做了一部分几天、洗澡几次、每周 / 洗澡后的项各做了几次
export function lookMonth(data, today) {
  const from = [`${today.slice(0, 7)}-01`, data.startDate || today].sort().at(-1);
  const days = Array.from({ length: Math.max(0, daysBetween(from, today)) + 1 }, (_, i) => addDays(from, i));
  const full = new Set(days.filter((x) => careFullDay(data, x)));
  const some = new Set(days.filter((x) => !full.has(x) && Object.keys(data.days[x]?.care || {}).length));
  const showers = data.events.filter((e) => e.type === 'shower' && e.day >= from && e.day <= today).length;
  const extra = data.look.routine.filter((r) => ['week', 'shower'].includes(r.when))
    .map((r) => ({ r, n: days.filter((x) => data.days[x]?.care?.[r.id]).length }));
  return { from, days: days.length, full, some, showers, extra };
}

// 最近 n 天每一项做到的比例。早晚的项：做了 / 该做的天数（洗澡那天晚上的洗脸不算）；洗澡后的项：做了 / 洗澡次数；每周的：这周几次
export function careItemRates(data, today, n = 30) {
  const from = [addDays(today, -(n - 1)), data.startDate || today].sort().at(-1);
  const days = Array.from({ length: Math.max(0, daysBetween(from, today)) + 1 }, (_, i) => addDays(from, i));
  return data.look.routine.map((r) => {
    if (r.when === 'week') return { r, done: weekCount(data, r.id, today), total: r.times || 1, week: true };
    const can = r.when === 'shower' ? days.filter((x) => showeredOn(data, x)) : days.filter((x) => !careSkipped(data, x, r));
    const done = can.filter((x) => data.days[x]?.care?.[r.id]).length;
    return { r, done, total: can.length, rate: can.length ? done / can.length : null };
  });
}

// 一项打卡最近 n 天每天的样子（最早的在前）：done 做了 / skip 不用做（洗过澡的晚上洗脸）/ miss 没做 / null 还没开始记
export function careDots(data, r, today, n = 14) {
  return Array.from({ length: n }, (_, i) => {
    const x = addDays(today, i - n + 1);
    if (x < (data.startDate || today)) return null;
    if (data.days[x]?.care?.[r.id]) return 'done';
    return careSkipped(data, x, r) ? 'skip' : 'miss';
  });
}
