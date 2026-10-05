// 纯计算：日期（一天从凌晨 4 点开始）、默认数据、每天的打卡清单、定期打理、祷告和小记的统计。
// 不碰 DOM，可以用 node 直接测。
//
// 代码是公开的：这里只放通用的默认值。用的什么产品、祷告事项、密码（只存哈希）都在私有仓库的 life.json 里。

import { STEPS, stepById, CHEERS, CHEER_VERSES, MILESTONE_TEXT, DEFAULT_PLANS, MED_KNOWLEDGE, FEVER_INGREDIENTS, FEVER_FROM, RECOVERY_DAYS, BIBLE_BOOKS } from './content.js';

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
    sick: { current: null, history: [], plans: structuredClone(DEFAULT_PLANS), meds: {}, clinic: {} },
    english: { cards: [], next: '' },
    milestones: {}, // { key: 达到的日期 }，seen: { key: true }
    places: [], // 想去的地方，见 places.js
    letters: {}, // DeepSeek 写的回顾：{ w周一 / m月份 / y年份: { at, text, research } }
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
  data.sick = { ...d.sick, ...(data.sick || {}) };
  data.sick.plans = { ...DEFAULT_PLANS, ...(data.sick.plans || {}) };
  data.english = { ...d.english, ...(data.english || {}) };
  data.milestones ||= {};
  data.places ||= [];
  data.letters ||= {};
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
  const items = data.look.routine.filter((r) => !r.optional && ['am', 'pm'].includes(r.when));
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
    habit: Object.values(data.look.steps).filter((x) => x.status === 'habit').length,
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
