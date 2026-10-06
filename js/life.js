// 纯计算：日期（一天从凌晨 4 点开始）、默认数据、每天的打卡清单、定期打理、祷告和小记的统计。
// 不碰 DOM，可以用 node 直接测。
//
// 代码是公开的：这里只放通用的默认值。用的什么产品、祷告事项、密码（只存哈希）都在私有仓库的 life.json 里。

import { CHEERS, CHEER_VERSES, MILESTONE_TEXT, DEFAULT_PLANS, LOW_PLANS, MED_KNOWLEDGE, FEVER_INGREDIENTS, FEVER_FROM, RECOVERY_DAYS, BIBLE_BOOKS } from './content.js';

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
    look: { direction: [], steps: {}, routine: [], products: {}, hide: [], identity: null, moments: [] }, // identity：「我是这样的人」自己改过的句子；moments：精致时刻 { id, day, text }
    notes: [], // 我学到的：{ id, title, text, track, link, at }
    periodic: DEFAULT_PERIODIC.map((p) => ({ ...p, last: null })),
    weeks: {}, // { 周一的日期: { skin: { score, tags, note }, thanks } }
    prayer: { stage: 1, since: today, items: [], next: 0 },
    // 小记：ui 是这一页上的文字（名字、按钮、说明），program 是按周解锁的任务，都只在私有仓库里
    private: { supplies: [], ui: {}, program: null, sessions: [], media: [], limits: [], custom: [], minutes: 60, latest: '23:30', perWeek: 1 },
    sick: { current: null, history: [], plans: structuredClone(DEFAULT_PLANS), meds: {}, clinic: {} },
    // 难受的时候：plans 每种难受的清单，notes 写给难受时的自己 { id, text, at }，log 每一次 { id, day, at, kind, before, after, did, helped, note }
    low: { plans: structuredClone(LOW_PLANS), notes: [], log: [] },
    english: { cards: [], next: '' },
    milestones: {}, // { key: 达到的日期 }，seen: { key: true }
    places: [], // 想去的地方，见 places.js
    letters: {}, // DeepSeek 写的回顾：{ w周一 / m月份 / y年份: { at, text, research } }
    goals: [], // 想做到的事，见下面「想做到的事」
    people: [], // 身边的人，见 people.js
    greeted: {}, // 过节问候发了没有：{ '年-节': { 人 id: 日期 } }
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
  data.weeks ||= {};
  data.prayer = { ...d.prayer, ...(data.prayer || {}) };
  data.private = { ...d.private, ...(data.private || {}) };
  data.sick = { ...d.sick, ...(data.sick || {}) };
  data.sick.plans = { ...DEFAULT_PLANS, ...(data.sick.plans || {}) };
  data.english = { ...d.english, ...(data.english || {}) };
  data.low = { ...d.low, ...(data.low || {}) };
  data.low.plans = { ...LOW_PLANS, ...(data.low.plans || {}) };
  data.milestones ||= {};
  data.places ||= [];
  data.letters ||= {};
  data.goals ||= [];
  data.people ||= [];
  data.greeted ||= {};
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

// 读经：现在读哪一卷、今天读哪一章。诗篇用 PSALMS（119 篇拆开），箴言按日期，其他按顺序一天一章。
export function readingToday(data, today) {
  const book = data.prayer.book || 'PSA';
  const info = BIBLE_BOOKS[book] || BIBLE_BOOKS.PSA;
  if (book === 'PSA') {
    const idx = data.prayer.next || 0;
    if (idx >= PSALMS.length) return { book, info, done: true };
    const p = PSALMS[idx];
    return { book, info, idx, label: p.label, ref: `PSA.${p.ch}${p.from ? `.${p.from}-${p.to}` : ''}`, total: PSALMS.length };
  }
  if (info.byDate) {
    const ch = Math.min(parseDay(today).getDate(), info.chapters);
    return { book, info, idx: ch - 1, label: `${info.name}第 ${ch} 章`, ref: `${book}.${ch}`, total: info.chapters };
  }
  const idx = (data.prayer.pos || {})[book] || 0;
  if (idx >= info.chapters) return { book, info, done: true };
  return { book, info, idx, label: `${info.name}第 ${idx + 1} 章`, ref: `${book}.${idx + 1}`, total: info.chapters };
}
export const bibleLink = (ref, version) => `https://www.bible.com/bible/${version}/${ref}`;
export function markRead(data, today) {
  const r = readingToday(data, today);
  if (r.done) return;
  dayOf(data, today).read = r.idx;
  dayOf(data, today).readBook = r.book;
  if (r.book === 'PSA') data.prayer.next = r.idx + 1;
  else if (!r.info.byDate) data.prayer.pos = { ...(data.prayer.pos || {}), [r.book]: r.idx + 1 };
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

// 这周的你：只数做到了的，不提没做的
export function weekHighlights(data, today) {
  const mon = weekOf(today);
  const days = Array.from({ length: daysBetween(mon, today) + 1 }, (_, i) => addDays(mon, i));
  const inWeek = (e) => e.day >= mon && e.day <= today;
  const out = [];
  const care = days.filter((x) => Object.keys(data.days[x]?.care || {}).length).length;
  if (care) out.push(`护肤 ${care} 天`);
  const sport = data.events.filter((e) => e.type === 'sport' && inWeek(e)).length;
  if (sport) out.push(`运动 ${sport} 次`);
  const pray = days.filter((x) => data.days[x]?.prayer?.night).length;
  if (pray) out.push(`祷告 ${pray} 晚`);
  const notes = days.filter((x) => data.days[x]?.note || data.days[x]?.mood).length;
  if (notes) out.push(`记录了 ${notes} 天`);
  const en = data.events.filter((e) => e.type === 'english' && inWeek(e)).length;
  if (en) out.push(`英语 ${en} 次`);
  const read = days.filter((x) => data.days[x]?.read !== undefined).length;
  if (read) out.push(`读经 ${read} 次`);
  return out;
}

// 新达到的里程碑（还没记过的）
export function newMilestones(data) {
  const allDays = Object.keys(data.days);
  const counts = {
    care: allDays.filter((d) => careFullDay(data, d)).length,
    pray: allDays.filter((d) => data.days[d]?.prayer?.night).length,
    sport: data.events.filter((e) => e.type === 'sport').length,
    english: data.events.filter((e) => e.type === 'english').length,
    night: allDays.filter((d) => data.days[d]?.note).length,
  };
  return Object.keys(MILESTONE_TEXT).filter((key) => {
    const [k, n] = key.split('-');
    return counts[k] >= Number(n) && !data.milestones[key];
  });
}

// ---------- 生病 ----------

export const sickActive = (data) => Boolean(data.sick.current);

// 好了以后的恢复期还剩几天（没有就 0）
export function recoveryLeft(data, today) {
  const last = data.sick.history[data.sick.history.length - 1];
  if (!last?.end || data.sick.current) return 0;
  const left = RECOVERY_DAYS - daysBetween(last.end, today);
  return left > 0 ? left : 0;
}

// ---- 从以前生病的记录里攒经验 ----
// 一次生病：path = [{ day, kind }]（换过种类才有，第一个是开始时的种类），sym = { 日期: [症状] }，
// done = { 日期: { 做的事: true } }（老数据的键是预案里的序号），extra = [自己加的事]，helped = [觉得管用的]
export const sickStartKind = (ep) => ep.path?.[0]?.kind || ep.kind;
export const sickKinds = (ep) => [...new Set([...(ep.path || []).map((x) => x.kind), ep.kind])];
export const sickSymptoms = (ep) => [...new Set(Object.values(ep.sym || {}).flat())];
export function sickDid(ep, plans = {}) {
  const plan = plans[sickStartKind(ep)] || plans[ep.kind] || [];
  const out = new Set();
  for (const dd of Object.values(ep.done || {})) for (const k of Object.keys(dd)) out.add(/^\d+$/.test(k) ? plan[Number(k)] : k);
  for (const x of ep.extra || []) out.add(x);
  for (const m of ep.meds || []) out.add(m.name);
  out.delete(undefined);
  return [...out];
}
function tally(lists) {
  const m = {};
  for (const l of lists) for (const x of new Set(l)) m[x] = (m[x] || 0) + 1;
  return Object.entries(m).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([text, n]) => ({ text, n }));
}
// 某一种（感冒 / 发烧 / 肠胃……）的经验：经过这一种的每一次都算
export function sickLessons(history, kind, plans = {}) {
  const eps = history.filter((e) => e.end && sickKinds(e).includes(kind));
  if (!eps.length) return null;
  const days = eps.map((e) => daysBetween(e.start, e.end) + 1);
  const maxes = eps.map((e) => tempStats(e).max).filter(Boolean);
  let toFever = null;
  if (kind === 'cold') {
    const colds = eps.filter((e) => sickStartKind(e) === 'cold');
    const turned = colds.filter((e) => sickKinds(e).includes('fever'));
    const at = turned.map((e) => daysBetween(e.start, e.path.find((x) => x.kind === 'fever').day) + 1);
    if (colds.length) toFever = { n: colds.length, turned: turned.length, day: at.length ? Math.round(at.reduce((a, x) => a + x, 0) / at.length) : null };
  }
  const did = tally(eps.map((e) => sickDid(e, plans)));
  const helped = tally(eps.map((e) => e.helped || []));
  const didN = Object.fromEntries(did.map((x) => [x.text, x.n]));
  return {
    n: eps.length,
    avgDays: Math.round((days.reduce((a, x) => a + x, 0) / days.length) * 10) / 10,
    maxTemp: maxes.length ? Math.max(...maxes) : null,
    toFever,
    symptoms: tally(eps.map(sickSymptoms)),
    did,
    helped: helped.map((x) => ({ ...x, of: Math.max(x.n, didN[x.text] || 0) })),
    hows: eps.filter((e) => e.how).slice(-3).reverse().map((e) => ({ start: e.start, how: e.how })),
  };
}
// 以前最像这一次的（症状重合最多的那次），没有足够像的就 null
export function similarSick(history, ep) {
  const mine = new Set(sickSymptoms(ep));
  if (!mine.size) return null;
  let best = null;
  for (const e of history) {
    if (!e.end || !sickKinds(e).some((k) => sickKinds(ep).includes(k))) continue;
    const theirs = new Set(sickSymptoms(e));
    const common = [...mine].filter((x) => theirs.has(x));
    const score = common.length / new Set([...mine, ...theirs]).size;
    if (common.length && score >= 0.34 && (!best || score > best.score || (score === best.score && e.start > best.ep.start))) best = { ep: e, common, score };
  }
  return best;
}
// 经验里觉得管用、但预案里还没有的
export const planMissing = (lessons, plan) => (lessons?.helped || []).filter((x) => !(plan || []).includes(x.text)).map((x) => x.text);

export function tempStats(ep, now = new Date()) {
  const temps = (ep.temps || []).slice().sort((a, b) => a.at.localeCompare(b.at));
  const last = temps[temps.length - 1] || null;
  const max = temps.reduce((m, x) => Math.max(m, x.t), 0) || null;
  const fevers = temps.filter((x) => x.t >= FEVER_FROM);
  const feverDays = fevers.length ? Math.floor((now - new Date(fevers[0].at)) / 86400000) + 1 : 0;
  const day = temps.filter((x) => now - new Date(x.at) <= 86400000);
  // 发过烧、最近 24 小时量过不少于 2 次、都正常 → 可以问「是不是好了」
  const normal24 = fevers.length > 0 && day.length >= 2 && day.every((x) => x.t < FEVER_FROM) && now - new Date(day[0].at) >= 12 * 3600000;
  return { temps, last, max, feverNow: Boolean(last && last.t >= FEVER_FROM), feverDays, normal24 };
}

// 认药：名字 → 成分、管什么、是不是要医生判断
export function medInfo(name) {
  return MED_KNOWLEDGE.find((m) => m.match.test(name)) || { ingredients: [], use: '' };
}

// 这个药下次最早几点能吃、今天还能吃几次（按用户从说明书抄的：几小时一次、一天最多几次）
export function doseStatus(ep, itemId, cfg, now = new Date()) {
  const taken = (ep.meds || []).filter((m) => m.item === itemId).sort((a, b) => a.at.localeCompare(b.at));
  const last = taken[taken.length - 1] || null;
  const in24 = taken.filter((m) => now - new Date(m.at) < 86400000).length;
  const gap = Number(cfg?.gapHours) || 0;
  const next = last && gap ? new Date(new Date(last.at).getTime() + gap * 3600000) : null;
  const max = Number(cfg?.perDay) || 0;
  return { last, in24, next: next && next > now ? next : null, left: max ? Math.max(0, max - in24) : null };
}

// 吃这个药之前：24 小时内吃过的别的药里有没有同样的成分；两种退烧药混着吃
export function medConflicts(ep, name, itemId, now = new Date()) {
  const mine = medInfo(name).ingredients;
  const out = [];
  const recent = (ep.meds || []).filter((m) => m.item !== itemId && now - new Date(m.at) < 86400000);
  const seen = new Set();
  for (const m of recent) {
    if (seen.has(m.name)) continue;
    seen.add(m.name);
    const theirs = medInfo(m.name).ingredients;
    const same = mine.filter((x) => theirs.includes(x));
    if (same.length) out.push(`${m.name} 里也有${same.join('、')}，一起吃会超量${same.includes('对乙酰氨基酚') ? '（伤肝）' : same.includes('氯苯那敏') ? '（会特别困）' : ''}。`);
    else if (FEVER_INGREDIENTS.some((x) => mine.includes(x)) && FEVER_INGREDIENTS.some((x) => theirs.includes(x))) out.push(`24 小时内吃过 ${m.name}：两种退烧药别自己混着吃，问一下医生。`);
  }
  return out;
}

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

// ---------- 英语错句本 / 表达本 ----------

// 解析 ChatGPT「wrap up」的总结。容忍全角竖线、少了 Type、多余的空行和 Markdown 符号
export function parseSummary(text) {
  const out = { mistakes: [], expressions: [], next: '' };
  let part = '';
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.replace(/\*\*/g, '').trim();
    if (!line) continue;
    if (/^=+\s*(SUMMARY|END)/i.test(line)) continue;
    if (/^#*\s*MISTAKES?\b/i.test(line)) { part = 'm'; continue; }
    if (/^#*\s*EXPRESSIONS?\b/i.test(line)) { part = 'e'; continue; }
    if (/^#*\s*NEXT TIME\b/i.test(line)) { part = 'n'; continue; }
    const body = line.replace(/^[-*•\d.)\s]+/, '');
    const cols = body.split(/\s*[|｜]\s*/).map((x) => x.trim()).filter(Boolean);
    if (part === 'm') {
      const get = (re) => cols.map((c) => c.match(re)).find(Boolean)?.[1]?.trim().replace(/^["“]|["”]$/g, '') || '';
      const said = get(/^I said:?\s*(.+)$/i) || cols[0] || '';
      const better = get(/^Better:?\s*(.+)$/i) || cols[1] || '';
      const type = get(/^Type:?\s*(.+)$/i);
      if (said && better && said !== better) out.mistakes.push({ said, better, type: type.toLowerCase() });
    } else if (part === 'e') {
      if (cols[0]) out.expressions.push({ expr: cols[0], cn: cols[1] || '', example: cols[2] || '' });
    } else if (part === 'n') {
      out.next = out.next ? `${out.next} ${body}` : body;
    }
  }
  return out;
}

export const REVIEW_STEPS = [1, 3, 7, 14, 30, 60]; // 记住了：隔几天再出现
export function reviewCard(card, ok, today) {
  const level = ok ? Math.min((card.level || 0) + 1, REVIEW_STEPS.length) : 0;
  return { ...card, level, due: addDays(today, ok ? REVIEW_STEPS[level - 1] : 1), seen: (card.seen || 0) + 1 };
}
export const dueCards = (data, today, max = 10) => data.english.cards.filter((c) => c.due <= today).slice(0, max);

// 这个月 / 上个月哪类错误多
export function mistakeTypes(data, month) {
  const out = {};
  for (const c of data.english.cards) {
    if (c.kind !== 'mistake' || !c.at.startsWith(month)) continue;
    const t = (c.type || 'other').split(/[\s/,]+/)[0] || 'other';
    out[t] = (out[t] || 0) + 1;
  }
  return out;
}

// ---------- 小记：按周解锁的任务 ----------
// private.program = { start: 第一周的周一, weeks: [{ title, intro, tasks: [{ id, track, text, level, note? }], buy?: { name, price } }] }
// 超过最后一周以后：一直是最后一周的任务 + 自己写的（private.custom）

export function programWeek(data, today) {
  const pg = data.private.program;
  if (!pg?.weeks?.length) return null;
  const n = Math.floor(daysBetween(pg.start, today) / 7);
  if (n < 0) return { n: -1, week: null, total: pg.weeks.length, startsIn: -daysBetween(pg.start, today) };
  const i = Math.min(n, pg.weeks.length - 1);
  return { n, i, week: pg.weeks[i], total: pg.weeks.length, after: n >= pg.weeks.length };
}

// 这周的任务：本周的 + 从任务池里抽的几张（program.draw 张，同一周抽到的一样）+ 超过最后一周时自己写的
export function weekTasks(data, today) {
  const w = programWeek(data, today);
  if (!w?.week) return [];
  const pg = data.private.program;
  const fixed = new Set(w.week.tasks.map((t) => t.id));
  const pool = (pg.pool || []).filter((t) => (t.from || 1) <= w.n + 1 && !fixed.has(t.id));
  const drawn = [];
  let seed = [...`${pg.start}-${w.n}`].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 17);
  const left = pool.slice();
  for (let k = 0; k < (pg.draw || 0) && left.length; k++) {
    seed = (seed * 1103515245 + 12345) >>> 0;
    drawn.push(left.splice(seed % left.length, 1)[0]);
  }
  // 抽到的放在最后一张之前（最后一张通常是收尾的规矩）
  const tasks = w.week.tasks.slice();
  tasks.splice(Math.max(1, tasks.length - 1), 0, ...drawn);
  return [...tasks, ...(w.after ? data.private.custom : [])];
}

// 不影响生活：这周次数超过自己定的、最近几次结束后心情低
export function privateNote(data, today) {
  const ss = data.private.sessions;
  const mon = weekOf(today);
  const thisWeek = ss.filter((s) => s.day >= mon).length;
  const per = data.private.perWeek || 1;
  if (thisWeek > per) return `这周已经是第 ${thisWeek} 次了，你给自己定的是一周 ${per} 次。`;
  const last = ss.slice(-3);
  if (last.length === 3 && last.every((s) => s.after && s.after <= 2)) return '最近几次结束后心情都不太好。可以缓一缓，或者换轻一点的任务；不舒服的话随时可以停。';
  const long = ss.slice(-3).filter((s) => s.minutes > (data.private.minutes || 60) + 20).length;
  if (long >= 2) return '最近几次都超时了不少，注意别占了睡觉的时间。';
  return null;
}

// 让任务有点变化：{3-6} → 3 到 6 之间随机一个整数；{跪好|趴好} → 随机选一个。同一个 seed 结果一样（一次时间里不会变）
export function seeded(seed) {
  let x = (typeof seed === 'number' ? seed : [...String(seed)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7)) >>> 0 || 1;
  return () => { x = (x * 1103515245 + 12345) >>> 0; return x / 4294967296; };
}
export function fillText(text, seed) {
  const rnd = seeded(seed);
  return String(text || '').replace(/\{(\d+)-(\d+)\}|\{([^{}]*\|[^{}]*)\}/g, (m, a, b, opts) => {
    if (opts) { const list = opts.split('|'); return list[Math.floor(rnd() * list.length)]; }
    const lo = Number(a); const hi = Number(b);
    return String(lo + Math.floor(rnd() * (hi - lo + 1)));
  });
}
export const pickOne = (list, seed) => (list?.length ? list[Math.floor(seeded(seed)() * list.length)] : null);
// 得分：做到的任务按强度算（1 级 10 分，2 级 20 分，3 级 30 分）
export const sessionPoints = (results, tasks) => tasks.reduce((a, t) => a + (results[t.id] === 'done' ? (t.level || 1) * 10 : 0), 0);

// ---------- 打水 ----------
// 开水房：早上 7–8、中午 11–13、晚上 17–19。两个暖壶，一天打两回：上午或中午一回（早上打了中午就不用），晚上一回。
// 记在 days[日期].fetch = { mid: true, eve: true }
export const BOILER = [
  { slot: 'mid', from: 7 * 60, to: 8 * 60, name: '早上' },
  { slot: 'mid', from: 11 * 60, to: 13 * 60, name: '中午' },
  { slot: 'eve', from: 17 * 60, to: 19 * 60, name: '晚上' },
];
export const fetchSlot = (minutes) => (minutes < 15 * 60 ? 'mid' : 'eve');
const clock = (m) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
// 现在开着吗、下一回什么时候开（只看还没打的那一回）。minutes = 一天里的第几分钟
export function boilerStatus(fetch = {}, minutes) {
  const todo = BOILER.filter((w) => !fetch[w.slot] && w.to > minutes);
  const open = todo.find((w) => w.from <= minutes);
  if (open) return { open: true, text: `开水房开着，${clock(open.to)} 关`, slot: open.slot };
  const next = todo[0];
  return next ? { open: false, text: `${next.name} ${clock(next.from)}–${clock(next.to)} 开`, slot: next.slot } : null;
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

// 护肤品开封后多久用完（月）：香水久一点，睫毛膏短，其他按 12 个月；自己改过的用自己的
export function paoMonths(name, set) {
  if (set) return set;
  if (/香水|香氛/.test(name)) return 36;
  if (/睫毛膏|眼线/.test(name)) return 6;
  return 12;
}
export function openedStatus(opened, months, today) {
  const days = daysBetween(opened, today);
  const left = Math.round(months * 30.4) - days;
  const age = days < 60 ? `开封 ${days} 天` : `开封 ${Math.floor(days / 30.4)} 个月`;
  return { age, left, level: left < 0 ? 'over' : left <= 30 ? 'soon' : 'ok' };
}
