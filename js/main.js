import { GitHub, GitHubError } from './github.js';
import { Store, newId, diff, apply as applyPatch } from './store.js';
import {
  defaultData, dayKey, addDays, daysBetween, weekOf, weekLabel, hm, parseDay, WHEN, routineOf, careDone, weekCount,
  periodicDue, periodicTomorrow, eventsOn, privateStats,
  prayedOn, prayerStats, stageReady, readingToday, markRead, bibleLink, programWeek, weekTasks, privateNote, fillText, pickOne, sessionPoints,
  dailyCheer, weekHighlights, newMilestones, careFullDay, showeredOn, careSkipped,
  sickActive, recoveryLeft, tempStats, medInfo, doseStatus, medConflicts, seasonWarning,
  sickDid, sickSymptoms, sickLessons, similarSick, planMissing, sickKinds,
  boilerStatus, solarTerm, lowLessons, goodDays, 
  parseSummary, reviewCard, dueCards, mistakeTypes, REVIEW_STEPS,
  goalProgress, goalLine, habitWeek, goalWeekDone, applyGoalPlan, lookMonth, careItemRates, paoMonths, openedStatus,
} from './life.js';
import {
  VERSES, MORNING_VERSES, CONFESS_VERSE, verseFor, LORDS_PRAYER,
  STAGES, PRAISE_HINTS, THANKS_HINTS, CONFESS_HINT, ASK_HINT, ENTRUST_HINT, prayerPrompt,
  EN_MODES, EN_CYCLE, EN_TOPICS, englishPrompt, goalPrompt,
  CHEER_ON, cheerNight, MILESTONE_TEXT, SICK_KINDS, SYMPTOMS, LOW_KINDS, LOW_VERSES, HOTLINES, SELF_LINES, RED_FLAGS, FEVER_FROM, BIBLE_BOOKS,
} from './content.js';
import { pushSupport, subscribe, currentSubscription, deviceName, PUSH_FILE } from './push.js';
import { h, compressImage, blobToBase64 } from './util.js';
import { askJson } from './ai.js';
import { PLACE_KINDS, parseShare, cleanCandidates, visited, lastVisit, bestScore, weekendPicks, districtProgress, footprints, weekendDays, wgsToGcj } from './places.js';
import {
  MIN_DAYS, influences, influenceText, moodDays, series, sleepPattern, sleepHours, bedMinutes, bedLabel, rhythm, careRates, planRates,
  beforeSick, gentleNote, periodSummary, rangeDays,
} from './stats.js';
import { lineChart, barChart, monthGrid, sleepBars } from './charts.js';
import { icon } from './icons.js';
import { PEOPLE_GROUPS, SEX, ta, relChoices, mainGroup, upcomingBirthdays, ledgerSync, moneyWith, timeline } from './people.js';
import { nextBirthday, birthdayText, lunarName, holidayAround, holidayLine } from './cal.js';

const SETTINGS_KEY = 'life-settings';
const DEFAULT_REPO = 'ThreeLu/life-data';
const EDITING_ROUTES = /^\/(night|pray\/go|p$|p\/s|english|place\/|ask|person\/new|person\/[^/]+\/edit)/;

const readJson = (key) => { try { return JSON.parse(localStorage.getItem(key)) || {}; } catch { return {}; } };
const writeJson = (key, v) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* 存不了就算了 */ } };

const view = document.getElementById('view');
const nav = document.getElementById('nav');
let settings = readSettings();
let gh = null;
let store = null;
let loadError = null;

// ---------- 启动 ----------


function readSettings() {
  let s = readJson(SETTINGS_KEY);
  // 和物品档案、账本在同一个网站下（threelu.github.io），令牌直接用那边的（令牌要额外授权 life-data 仓库）
  if (!s.token) {
    for (const key of ['inventory-settings', 'ledger-settings']) {
      const other = readJson(key);
      if (other.token) { s = { ...s, token: other.token, shared: true }; break; }
    }
  }
  return s;
}

function connect() {
  gh = new GitHub({ token: settings.token, repo: settings.repo || DEFAULT_REPO });
  store = new Store(gh);
  store.onStatus = showSync;
  store.loadCached();
  showSync(store.status);
}

const syncPill = h('button', { class: 'sync-pill', type: 'button', hidden: true, onclick: () => {
  if (store?.status.state === 'error') toast(`上传失败：${store.status.error}（记的都还在手机上）`, 'error');
  store?.sync();
} });
let syncTimer = null;
let renderedData = '';
function showSync(st) {
  clearTimeout(syncTimer);
  const n = st.pending;
  const text = st.state === 'offline' ? `没网，${n} 项存在手机上，有网自动上传`
    : st.state === 'error' ? `${n} 项没传上去，点一下看看`
      : n ? `正在上传 ${n} 项` : '';
  const show = () => { syncPill.textContent = text; syncPill.hidden = !text; syncPill.className = `sync-pill ${st.state}`; };
  if (st.state === 'offline' || st.state === 'error' || !text) show();
  else syncTimer = setTimeout(show, 1500);
  if (st.state === 'ok' && store?.data && !EDITING_ROUTES.test(currentPath()) && JSON.stringify(store.data) !== renderedData) render();
}

const currentPath = () => window.location.hash.replace(/^#/, '').split('?')[0];

async function refresh() {
  const before = store.head;
  const hadData = Boolean(store.data);
  try {
    await store.load();
    loadError = null;
  } catch (e) {
    loadError = e;
  }
  if (!hadData || loadError || store.missing) render();
  else if (store.head !== before && !EDITING_ROUTES.test(currentPath())) render();
}

function boot() {
  setupNav();
  document.body.append(syncPill);
  window.addEventListener('online', () => store?.sync());
  window.addEventListener('hashchange', () => {
    for (const el of document.querySelectorAll('.sheet-overlay, .overlay')) el.remove();
    if (currentPath() !== '/p/s') { document.body.classList.remove('dark-session'); try { speechSynthesis.cancel(); } catch { /* 无 */ } }
    render();
    window.scrollTo(0, 0);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') lockPrivate();
    if (document.visibilityState === 'visible' && store) refresh();
  });
  if (settings.token) {
    connect();
    render();
    refresh();
  } else {
    if (window.location.hash && window.location.hash !== '#/settings') sessionStorage.setItem('life-after-login', window.location.hash);
    go('#/settings', true);
  }
}

function go(hash, replace = false) {
  if (replace) { history.replaceState(null, '', hash); render(); } else window.location.hash = hash;
}

// ---------- 路由 ----------

const routes = [
  [/^\/?$/, () => todayView(dayKey())],
  [/^\/day\/(\d{4}-\d\d-\d\d)$/, (d) => todayView(d)],
  [/^\/night$/, (_, q) => nightView(q.d || dayKey())],
  [/^\/look$/, () => lookView()],
  [/^\/pray$/, () => prayView()],
  [/^\/pray\/go$/, (_, q) => prayGoView(q.m)],
  [/^\/english$/, () => englishView()],
  [/^\/english\/review$/, () => englishReviewView()],
  [/^\/english\/cards$/, () => englishCardsView()],
  [/^\/sick$/, () => sickView()],
  [/^\/sick\/book$/, () => sickBookView()],
  [/^\/places$/, () => placesView()],
  [/^\/place\/([^/]+)\/edit$/, (id) => placeEditView(id)],
  [/^\/place\/new$/, () => placeEditView('new')],
  [/^\/place\/([^/]+)$/, (id) => placeView(id)],
  [/^\/stats$/, () => statsView()],
  [/^\/report$/, (_, q) => reportView(q)],
  [/^\/ask$/, () => askView()],
  [/^\/p$/, () => privateView()],
  [/^\/p\/s$/, () => sessionView()],
  [/^\/periodic$/, () => periodicView()],
  [/^\/low$/, () => lowView()],
  [/^\/low\/go$/, () => lowGoView()],
  [/^\/history$/, () => historyView()],
  [/^\/goals$/, () => goalsView()],
  [/^\/goal\/([^/]+)$/, (id) => goalView(id)],
  [/^\/people$/, () => peopleView()],
  [/^\/person\/new$/, () => personEditView('new')],
  [/^\/person\/([^/]+)\/edit$/, (id) => personEditView(id)],
  [/^\/person\/([^/]+)$/, (id) => personView(id)],
  [/^\/more$/, () => moreView()],
  [/^\/settings$/, () => settingsView()],
];
const NAV_GROUPS = {
  '/': [/^\/?$/, /^\/day\//, /^\/night/, /^\/sick$/],
  '/look': [/^\/look/],
  '/pray': [/^\/pray/, /^\/low/],
  '/more': [/^\/more/, /^\/english/, /^\/history/, /^\/settings/, /^\/places?/, /^\/stats/, /^\/report/, /^\/ask/, /^\/sick\/book/, /^\/periodic/, /^\/goals?(\/|$)/, /^\/people/, /^\/person\//],
};

function setupNav() {
  for (const a of nav.querySelectorAll('a[data-icon]')) a.prepend(h('span', { class: 'tab-icon' }, icon(a.dataset.icon)));
  const plus = nav.querySelector('.plus');
  plus.append(h('span', { class: 'circle' }, icon('plus')));
  plus.addEventListener('click', () => { if (store?.data) quickSheet(); });
}

function render() {
  const [path, query = ''] = window.location.hash.replace(/^#/, '').split('?');
  const q = Object.fromEntries(new URLSearchParams(query));
  let content;
  for (const [re, fn] of routes) {
    const m = path.match(re);
    if (!m) continue;
    if (re.source.includes('settings')) content = fn();
    else if (!settings.token) content = settingsView();
    else if (loadError && !store.data) content = errorView(loadError);
    else if (store.missing) content = setupView();
    else if (!store.data) content = h('p', { class: 'muted center' }, '正在读取…');
    else content = fn(m[1], q);
    break;
  }
  view.replaceChildren(...[content || notFound(), store?.data && !NO_WHISPER.test(path) ? whisper(path) : null].filter(Boolean));
  if (path !== lastPath) { view.classList.remove('enter'); void view.offsetWidth; view.classList.add('enter'); lastPath = path; }
  if (tapped && Date.now() - tapped.at < 4000) {
    for (const el of view.querySelectorAll('.chip.check.on, .mini.check.on, .ring')) if (el.textContent.trim() === tapped.text) el.classList.add('pop');
    tapped = null;
  }
  document.documentElement.dataset.season = solarTerm(dayKey()).season;
  renderedData = store?.data ? JSON.stringify(store.data) : '';
  for (const a of nav.querySelectorAll('a[href]')) {
    const target = a.getAttribute('href').slice(1);
    a.classList.toggle('active', (NAV_GROUPS[target] || []).some((re) => re.test(path)));
  }
}

// ---------- 通用组件 ----------

// 换页淡入只在真的换了页时；点打勾的按钮记一下是哪个，存好重画后在它身上弹一下
let lastPath = null;
let tapped = null;
document.addEventListener('click', (e) => {
  const b = e.target.closest?.('.chip.check, .mini.check');
  if (b && !b.classList.contains('on')) tapped = { text: b.textContent.trim(), at: Date.now() };
}, true);

// 各页最下面角落的一句话（活出自己）：每页每天一句，同一天不变。小记、难受的时候一步一步、带着祷告、设置不放
const NO_WHISPER = /^\/(p|p\/s|low\/go|pray\/go|settings|look)$/;
function whisper(path) {
  const n = [...`${dayKey()}${path || '/'}`].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 11);
  const x = SELF_LINES[n % SELF_LINES.length];
  return h('div', { class: 'whisper' }, h('p', {}, x.text), h('small', {}, x.ref || '今天的一句'));
}

function toast(message, kind = 'ok') {
  const el = h('div', { class: `toast ${kind}` }, message);
  document.body.append(el);
  setTimeout(() => el.remove(), kind === 'error' ? 6000 : 2500);
}

async function saving(message, fn) {
  const el = h('div', { class: 'busy' }, h('div', { class: 'busy-box' }, message));
  document.body.append(el);
  try {
    return await fn();
  } catch (e) {
    toast(e.message, 'error');
    throw e;
  } finally {
    el.remove();
  }
}
// 先存手机、页面立刻更新、后台上传
async function save(message, fn, opts) {
  if (opts?.online || opts?.uploads?.length || opts?.removes?.length) return saving('正在保存…', () => store.save(message, fn, opts));
  try {
    return await store.save(message, fn, opts);
  } catch (e) {
    toast(e.message, 'error');
    throw e;
  }
}
// 改完马上重画
const saveRender = (message, fn) => save(message, fn).then(() => { render(); return true; }).catch(() => false); // 成功返回 true

function undoToast(text, onUndo) {
  for (const el of document.querySelectorAll('.toast.undo')) el.remove();
  const el = h('div', { class: 'toast undo', role: 'status' }, h('span', {}, text),
    h('button', { type: 'button', class: 'toast-undo', onclick: () => { el.remove(); onUndo(); } }, '撤销'));
  document.body.append(el);
  setTimeout(() => el.remove(), 6000);
}

// 能撤销的修改：撤销时只把这次改到的东西改回去
async function saveUndoable(message, fn, doneText) {
  const before = structuredClone(store.data);
  const result = await save(message, fn);
  if (result === false) return result;
  const back = diff(store.data, before);
  undoToast(doneText, () => save(`撤销：${message}`, (data) => { applyPatch(data, back); }).then(() => { toast('已撤销'); render(); }).catch(() => {}));
  return result;
}

function errorView(e) {
  return h('div', {},
    header('生活'),
    h('div', { class: 'card' },
      h('p', {}, '读取失败：', e.message),
      e.status === 404 ? h('p', { class: 'small muted' }, '多半是令牌还没授权 life-data 仓库。到「设置」看怎么加。') : null,
      h('div', { class: 'actions' }, h('button', { onclick: refresh }, '重试'), h('a', { href: '#/settings', class: 'button secondary' }, '设置'))));
}
const notFound = () => h('div', { class: 'card' }, h('p', {}, '没有这个页面'), h('a', { href: '#/', class: 'button' }, '回到今天'));

function header(title, ...extra) {
  const actions = extra.filter(Boolean);
  return h('header', { class: 'page-head' }, h('div', {}, h('h1', {}, title)),
    actions.length ? h('div', { class: 'head-actions' }, actions) : null);
}
function headerSub(title, sub, ...actions) {
  const el = header(title, ...actions);
  el.firstChild.append(h('div', { class: 'sub' }, sub));
  return el;
}

function cell({ href, onclick, ic, color = 'var(--accent)', title, meta, sub }) {
  return h(href ? 'a' : 'button', { class: 'cell', href, onclick, type: href ? undefined : 'button' },
    ic ? h('span', { class: 'dot', style: `background:${color}` }, icon(ic)) : null,
    h('span', { class: 'grow' }, title, sub ? h('span', { class: 'muted small block' }, sub) : null),
    meta ? h('span', { class: 'meta' }, meta) : null,
    icon('chev', 'i chev'));
}

function openSheet({ title, body, confirmText = '确定', cancelText = '取消', onConfirm }) {
  const close = () => overlay.remove();
  const overlay = h('div', { class: 'sheet-overlay', onclick: (e) => { if (e.target === overlay) close(); } },
    h('div', { class: 'sheet', role: 'dialog', 'aria-label': title },
      h('h3', {}, title),
      body,
      h('div', { class: 'actions' },
        confirmText ? h('button', { onclick: async () => { if ((await onConfirm()) !== false) close(); } }, confirmText) : null,
        cancelText ? h('button', { class: 'secondary', onclick: close }, cancelText) : null)));
  document.body.append(overlay);
  return close;
}

// 页面右上角的「?」：怎么用。sections = [[小标题, [一句一句]]]
function helpButton(title, sections) {
  return h('button', { class: 'icon-btn help-btn', 'aria-label': '怎么用', onclick: () => openSheet({
    title,
    body: h('div', { class: 'help' }, sections.map(([t, lines]) => [h('h4', {}, t), h('ul', {}, lines.map((l) => h('li', {}, l)))])),
    confirmText: '知道了', cancelText: null, onConfirm: () => {},
  }) }, '?');
}

// 一排分数按钮（1–n），点同一个再点一下取消
function scoreRow(label, n, value, onPick, names = null) {
  return h('div', { class: 'score', role: 'group', 'aria-label': label },
    Array.from({ length: n }, (_, i) => i + 1).map((v) => h('button', {
      type: 'button', class: `chip score-chip${value === v ? ' on' : ''}`, 'aria-pressed': String(value === v),
      onclick: () => onPick(value === v ? null : v),
    }, names ? names[v - 1] : String(v))));
}
// 一排选项（单选），options = [[值, 显示]]
function choiceRow(label, options, value, onPick) {
  return h('div', { class: 'chips', role: 'group', 'aria-label': label },
    options.map(([v, text]) => h('button', {
      type: 'button', class: `chip${value === v ? ' on' : ''}`, 'aria-pressed': String(value === v),
      onclick: () => onPick(value === v ? null : v),
    }, text)));
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('复制好了，去 ChatGPT 里粘贴');
  } catch {
    toast('复制不了：长按上面的文字，全选后复制', 'error');
  }
}

const WEEK = '日一二三四五六';
function dayLabel(day) {
  const d = parseDay(day);
  return `${d.getMonth() + 1}月${d.getDate()}日 周${WEEK[d.getDay()]}`;
}
function relDay(day, today = dayKey()) {
  const n = daysBetween(day, today);
  return n === 0 ? '今天' : n === 1 ? '昨天' : n === 2 ? '前天' : `${n} 天前`;
}
const dayOf = (data, day) => (data.days[day] ||= {});
const nowIso = () => new Date().toISOString();

// ---------- 今天 ----------

const TODAY_HELP = [
  ['这一页', [
    '按时间分三段：早上（4–11 点）、中午（11–17 点）、晚上（17 点以后）。打开时只展开现在这一段，别的在下面，点一下展开。',
    '做了就点，再点一下取消。没做的那天就空着。',
    '一天从凌晨 4 点开始算：1 点洗的澡还算昨天。',
  ]],
  ['几样小规矩', [
    '打水：点一下是打了；不想打就点「不打了」，这一回就不再提醒。',
    '洗澡不用每天：洗了就在「＋」或中午的「记一下」里点。洗过澡的晚上会多一行身体乳，晚上的洗脸自动划掉。',
    '最上面一行一行的是提醒：生病、降温、该打理了，有事才出现。',
  ]],
  ['其他', ['看以前的某一天、这周的你、一年前的今天：「生活 → 最近的记录」。']],
];

// ---------- 今天 ----------
// 首页只回答一件事：这一次打开要做什么。按时间分早上 / 中午 / 晚上三张清单，当下这一张展开，别的折起来。
// 有事才出现的提醒都是一行字；话只留顶上的问候和最底下的一句。
const PERIODS = { am: '早上', noon: '中午', pm: '晚上' };
const homeState = { open: null };
function periodNow() {
  const hr = new Date().getHours();
  return hr >= 4 && hr < 11 ? 'am' : hr >= 11 && hr < 17 ? 'noon' : 'pm';
}

function todayView(day) {
  const d = store.data;
  const today = dayKey();
  const isToday = day === today;
  if (!isToday) {
    return h('div', {},
      headerSub(relDay(day), dayLabel(day), helpButton('今天这一页怎么用', TODAY_HELP)),
      ['am', 'noon', 'pm'].map((p) => periodCard(day, p)),
      logLine(day),
      h('a', { class: 'button secondary wide', href: '#/' }, '回到今天'));
  }
  const lockBtn = h('a', { class: 'icon-btn quiet', href: '#/p', 'aria-label': '小记' }, icon('leaf'));
  const now = periodNow();
  const others = ['am', 'noon', 'pm'].filter((p) => p !== now);
  return h('div', {},
    todayHeader(day, lockBtn),
    alertRows(today),
    periodCard(day, now),
    now === 'noon' ? weekendCard(today) : null,
    homeState.open && others.includes(homeState.open) ? periodCard(day, homeState.open) : null,
    h('div', { class: 'other-periods' }, others.map((p) => {
      const { done, total } = periodCount(day, p);
      return h('button', { type: 'button', class: `other-p${homeState.open === p ? ' on' : ''}`, onclick: () => { homeState.open = homeState.open === p ? null : p; render(); } },
        total ? `${PERIODS[p]} ${done}/${total}` : PERIODS[p]);
    })),
    goalLines(),
    logLine(day),
    !sickActive(d) ? h('div', { class: 'unwell-row' }, h('button', { class: 'link small unwell', onclick: startSickSheet }, '我不舒服')) : null);
}

// 一行提醒：有事才出现
function alertLine(text, { href, onclick, action, tone = '' } = {}) {
  const inner = [h('i', { class: 'dot' }), h('span', { class: 'grow' }, text)];
  if (action) return h('div', { class: `alert-line ${tone}` }, ...inner, action);
  return h(href ? 'a' : 'button', { class: `alert-line ${tone}`, href, onclick, type: href ? undefined : 'button' }, ...inner, icon('chev', 'i chev'));
}
function alertRows(today) {
  const d = store.data;
  const out = [];
  const ep = d.sick.current;
  if (ep) out.push(alertLine(`${SICK_KINDS[ep.kind].name} · 第 ${daysBetween(ep.start, today) + 1} 天`, { href: '#/sick', tone: 'red' }));
  else if (recoveryLeft(d, today)) out.push(alertLine(`恢复期还有 ${recoveryLeft(d, today)} 天，早点睡`, { tone: 'soft' }));
  const w = seasonAlert();
  if (w) out.push(alertLine(w, { tone: 'amber' }));
  const ms = milestoneList();
  if (ms.length) out.push(alertLine(ms.map((m) => m.text).join('；'), { action: h('button', { class: 'link small', onclick: () => ms[0].okAll() }, '好') }));
  const due = periodicDue(d, today);
  if (due.length === 1) {
    const p = due[0];
    out.push(alertLine(`${p.name}，该做了`, { action: h('button', { class: 'small secondary', onclick: () => saveUndoable(`定期打理：${p.name}`, (data) => {
      const x = data.periodic.find((y) => y.id === p.id); if (x) x.last = today;
    }, '好了').then(render).catch(() => {}) }, '做了') }));
  } else if (due.length > 1) out.push(alertLine(`该打理了：${due.map((p) => p.name).join('、')}`, { href: '#/periodic' }));
  out.push(...peopleAlerts(today));
  const soon = periodicTomorrow(d, today);
  if (soon.length) out.push(alertLine(`明天该${soon.map((p) => p.name).join('、')}了`, { href: '#/periodic', tone: 'soft' }));
  const lowRecent = [today, addDays(today, -1)].some((x) => d.days[x]?.mood && d.days[x].mood <= 3) && !d.low.log.some((x) => x.day >= addDays(today, -1));
  const gn = gentleNote(d, today);
  if (lowRecent || gn) out.push(alertLine(lowRecent ? '这两天心情有点低' : gn, lowRecent || /心情/.test(gn) ? { href: '#/low', tone: 'soft' } : { tone: 'soft' }));
  else if ((d.days[today]?.mood || 0) >= 8 && !d.low.notes.some((x) => x.at.slice(0, 10) >= addDays(today, -14))) out.push(alertLine('今天不错，写一句给以后的自己', { onclick: lowNoteSheet, tone: 'soft' }));
  return out.length ? h('div', { class: 'alerts' }, out) : null;
}

// 一个时段的清单：{ key, done: true | false | 'skip', node, count }
function periodList(day, p) {
  const d = store.data;
  const r = d.days[day] || {};
  const list = [];
  const item = (key, done, title, sub, extra = {}) => list.push({ key, done, count: extra.count !== false, node: listItem(done, title, sub, extra) });
  if (p === 'am') {
    const sl = r.sleep;
    item('sleep', Boolean(sl?.bed || sl?.wake), '睡眠', sl?.bed || sl?.wake ? `${sl.bed || '?'} → ${sl.wake || '?'}${sleepText(sl) ? ` · ${sleepText(sl)}` : ''}` : '昨晚几点睡、几点起', { onclick: () => sleepSheet(day) });
    careItem(list, day, 'am', '早上护肤');
    const plan = d.days[addDays(day, -1)]?.plan;
    if (plan) {
      item('plan', Boolean(r.planDone), '昨天说今天要做', plan, { below: choiceRow('做到了吗', [['yes', '做到了'], ['part', '一部分'], ['no', '没做']], r.planDone ?? null, (v) =>
        saveRender('今天的计划', (data) => { if (v) dayOf(data, day).planDone = v; else delete dayOf(data, day).planDone; })
          .then((ok) => { if (ok && v) toast(CHEER_ON[{ yes: 'planYes', part: 'planPart', no: 'planNo' }[v]]); })) });
    }
    if (d.prayer.stage >= 2) item('morning', Boolean(r.prayer?.morning), '晨祷', '一分钟，把今天交给神', { href: '#/pray/go?m=morning' });
    if (day !== dayKey() || new Date().getHours() < 8 || r.fetch?.mid) waterItem(list, day, 'mid');
  }
  if (p === 'noon') {
    waterItem(list, day, 'mid');
    const n = dueCards(d, day).length;
    if (n && day === dayKey()) item('english', false, '英语复习', `${n} 张卡`, { href: '#/english/review' });
    list.push({ key: 'record', count: false, node: h('div', { class: 'it plain' }, h('span', { class: 't' }, '记一下',
      h('div', { class: 'minis' },
        h('button', { type: 'button', class: 'mini', onclick: () => sportSheet(day) }, '运动'),
        h('button', { type: 'button', class: 'mini', onclick: () => drinkSheet(day) }, '喝了一杯'),
        h('button', { type: 'button', class: 'mini', onclick: () => recordShower(day) }, '洗澡')))) });
  }
  if (p === 'pm') {
    const hr = new Date().getHours();
    if (day !== dayKey() || (hr >= 4 && hr < 19) || r.fetch?.eve) waterItem(list, day, 'eve');
    if (showeredOn(d, day)) careItem(list, day, 'shower', routineOf(d, 'shower').map((x) => x.name).join('、') || '洗澡后', '洗过澡了');
    careItem(list, day, 'pm', '晚上护肤');
    careItem(list, day, 'week', '这周', null, false);
    item('night', Boolean(r.mood || r.note), '睡前复盘', r.mood ? `心情 ${r.mood}${r.note ? ` · ${r.note}` : ''}` : '心情、一句话、科研、明天', { href: day === dayKey() ? '#/night' : `#/night?d=${day}` });
    if (day === dayKey()) item('prayer', Boolean(r.prayer?.night), '祷告', r.prayer?.night ? '祷告了' : '22:30', { href: '#/pray/go' });
  }
  return list;
}
function periodCount(day, p) {
  const l = periodList(day, p).filter((x) => x.count);
  return { done: l.filter((x) => x.done).length, total: l.length };
}
function periodCard(day, p) {
  const list = periodList(day, p);
  const c = list.filter((x) => x.count);
  const done = c.filter((x) => x.done).length;
  return h('section', { class: 'card period' },
    h('div', { class: 'period-head' }, h('h3', {}, PERIODS[p]), c.length ? h('span', { class: 'muted small' }, done === c.length ? '都好了' : `${done} / ${c.length}`) : null),
    list.map((x) => x.node));
}
// 清单里的一行：左边圆圈（做了实心、不做了虚线），点整行去做 / 打开
function listItem(done, title, sub, { onclick, href, right, below, chips } = {}) {
  const cls = `it${done === 'skip' ? ' skipped' : done ? ' done' : ''}`;
  const ck = h('span', { class: 'ck', 'aria-hidden': 'true' }, done === 'skip' ? '–' : done ? icon('check', 'i tiny') : null);
  const text = h('span', { class: 't' }, title, sub ? h('small', {}, sub) : null, chips || null, below || null);
  if (href || onclick) {
    return h('div', { class: cls }, h(href ? 'a' : 'button', { class: 'it-main', href, onclick, type: href ? undefined : 'button' }, ck, text, right ? null : icon('chev', 'i chev')), right || null);
  }
  return h('div', { class: cls }, h('span', { class: 'it-main' }, ck, text), right || null);
}
// 护肤一行：小标签逐个点；洗过澡的晚上，洗脸划掉
function careItem(list, day, when, title, sub = null, count = true) {
  const d = store.data;
  const items = routineOf(d, when);
  if (!items.length) return;
  const care = d.days[day]?.care || {};
  const st = careDone(d, day, when);
  const toggle = (r) => {
    const before = careDone(store.data, day, when);
    saveRender(`护肤：${r.name}`, (data) => {
      const c = (dayOf(data, day).care ||= {});
      if (c[r.id]) delete c[r.id]; else c[r.id] = true;
    }).then((ok) => {
      if (!ok) return;
      const after = careDone(store.data, day, when);
      if (CHEER_ON[when] && after.total && after.done === after.total && before.done < before.total) toast(CHEER_ON[when]);
    });
  };
  const chips = h('div', { class: 'minis' }, items.map((r) => {
    if (careSkipped(d, day, r)) return h('span', { class: 'mini off' }, `${r.name} · 洗澡时洗过了`);
    const on = Boolean(care[r.id]);
    const label = when === 'week' ? `${r.name} ${weekCount(d, r.id, day)}/${r.times || 1}` : r.name;
    return h('button', { type: 'button', class: `mini check${on ? ' on' : ''}${r.optional ? ' optional' : ''}`, 'aria-pressed': String(on), onclick: () => toggle(r) }, label);
  }));
  // 全被划掉（洗过澡的晚上只剩洗脸）也算好了
  const done = count && st.done === st.total && (st.total > 0 || items.some((r) => careSkipped(d, day, r)));
  // 只有一样、而且标题就是它（比如身体乳）：点整行就行，不再放小标签
  if (items.length === 1 && title === items[0].name && !careSkipped(d, day, items[0])) {
    list.push({ key: `care-${when}`, count, done, node: listItem(done, title, sub, { onclick: () => toggle(items[0]) }) });
    return;
  }
  list.push({ key: `care-${when}`, count, done, node: listItem(done, title, sub, { chips }) });
}
// 打水一行：点一下打了，旁边「不打了」
function waterItem(list, day, slot) {
  const d = store.data;
  const v = d.days[day]?.fetch?.[slot];
  const set = (val) => saveRender(val === 'skip' ? '打水：不打了' : '打水', (data) => {
    const r = dayOf(data, day);
    r.fetch ||= {};
    if (val) r.fetch[slot] = val; else delete r.fetch[slot];
    if (!Object.keys(r.fetch).length) delete r.fetch;
  });
  const minutes = new Date().getHours() * 60 + new Date().getMinutes();
  const st = day === dayKey() ? boilerStatus({ [slot === 'mid' ? 'eve' : 'mid']: true }, minutes) : null;
  const sub = v === 'skip' ? '今天不打了' : v ? '打好了' : st ? st.text : (slot === 'mid' ? '早上 7–8 点、中午 11–13 点' : '晚上 17–19 点');
  list.push({ key: `water-${slot}`, count: true, done: v === 'skip' ? 'skip' : Boolean(v), node: listItem(v === 'skip' ? 'skip' : Boolean(v), '打水', sub, {
    onclick: () => set(v ? null : true),
    right: v ? null : h('button', { type: 'button', class: 'skip-btn', onclick: () => set('skip') }, '不打了'),
  }) });
}
// 今天记下的：一行，点开能删
function logLine(day) {
  const list = eventsOn(store.data, day).filter((e) => ['shower', 'sport', 'drink'].includes(e.type)).sort((a, b) => a.at.localeCompare(b.at));
  if (!list.length) return null;
  return h('button', { type: 'button', class: 'log-line', onclick: () => openSheet({ title: '今天记下的', body: h('div', { class: 'event-list' }, list.map((e) => eventRow(e))), confirmText: null, cancelText: '关闭' }) },
    h('b', {}, '今天'), list.map((e) => h('span', {}, `${hm(e.at)} ${eventText(e)}`)));
}

// 首页开头：日期、问候（按时间）、节气和今天的天气；一天的事都做完了盖一个章
function todayHeader(today, lockBtn) {
  const d = store.data;
  const hr = new Date().getHours();
  const hi = hr < 4 ? '夜深了，早点睡' : hr < 11 ? '早上好' : hr < 13 ? '中午好' : hr < 18 ? '下午好' : hr < 23 ? '晚上好' : '夜深了，早点睡';
  const st = solarTerm(today);
  const term = st.today ? `今天${st.name}` : st.left <= 7 ? `${st.name} · ${st.next}还有 ${st.left} 天` : `${st.name}时节`;
  const w = readJson(WEATHER_KEY);
  const city = d.settings.city;
  const wx = w.day === today && w.daily?.[0] ? `${city?.name || ''} ${Math.round(w.daily[0].min)}–${Math.round(w.daily[0].max)}°C` : null;
  return h('header', { class: 'page-head today-head' },
    h('div', {},
      h('div', { class: 'sub' }, dayLabel(today)),
      h('h1', { class: 'greet' }, hi),
      h('div', { class: 'head-tags' }, h('span', { class: 'tag' }, term), wx ? h('span', { class: 'tag' }, wx.trim()) : null)),
    h('div', { class: 'head-actions' }, dayComplete(today) ? h('span', { class: 'seal', title: '今天护肤、复盘、祷告都做了' }, '圆', h('br'), '满') : null,
      lockBtn, helpButton('今天这一页怎么用', TODAY_HELP)));
}
// 护肤（早晚）、睡前复盘、祷告都做了
function dayComplete(day) {
  const d = store.data;
  const r = d.days[day] || {};
  return careFullDay(d, day) && Boolean(r.mood || r.note) && Boolean(r.prayer?.night);
}



// 这周的你：只数做到的
function weekCardToday(today) {
  const list = weekHighlights(store.data, today);
  if (!list.length) return null;
  return h('div', { class: 'card week-you' }, h('h3', {}, '这周的你'), h('p', {}, list.join(' · ')), h('p', { class: 'muted small' }, '一点一点，都算数。'));
}

// 里程碑：达到时记下日期，首页祝贺 3 天（或点「好」收起）
let milestoneSaving = false;
function milestoneList() {
  const d = store.data;
  const fresh = newMilestones(d);
  if (fresh.length && !milestoneSaving) {
    milestoneSaving = true;
    save('里程碑', (data) => { for (const k of newMilestones(data)) data.milestones[k] = dayKey(); })
      .then(() => { milestoneSaving = false; render(); }).catch(() => { milestoneSaving = false; });
  }
  const seen = d.milestones.seen || {};
  const show = Object.entries(d.milestones).filter(([k, at]) => k !== 'seen' && MILESTONE_TEXT[k] && !seen[k] && daysBetween(at, dayKey()) <= 3)
    .map(([k]) => [k, MILESTONE_TEXT[k]]);
  // 想做到的事：做到了也是里程碑
  for (const g of d.goals) if (g.status === 'done' && g.doneAt && !seen[`goal-${g.id}`] && daysBetween(g.doneAt, dayKey()) <= 3) show.push([`goal-${g.id}`, `做到了：${g.title}`]);
  const okAll = () => saveRender('里程碑：看到了', (data) => { data.milestones.seen = { ...(data.milestones.seen || {}), ...Object.fromEntries(show.map(([k]) => [k, true])) }; });
  return show.map(([, text]) => ({ text, okAll }));
}



const SLEEP_Q = ['很差', '不太好', '一般', '不错', '很好'];
function sleepText(sl) {
  if (!sl.bed || !sl.wake) return '';
  const [bh, bm] = sl.bed.split(':').map(Number);
  const [wh, wm] = sl.wake.split(':').map(Number);
  let mins = wh * 60 + wm - (bh * 60 + bm);
  if (mins <= 0) mins += 24 * 60;
  return `${Math.floor(mins / 60)} 小时${mins % 60 ? ` ${mins % 60} 分` : ''}`;
}
function sleepForm(day, after) {
  const sl = store.data.days[day]?.sleep || {};
  const bed = h('input', { type: 'time', value: sl.bed || '', 'aria-label': '几点睡' });
  const wake = h('input', { type: 'time', value: sl.wake || '', 'aria-label': '几点起' });
  let q = sl.q || null;
  const qRow = h('div', {});
  const drawQ = () => qRow.replaceChildren(scoreRow('睡得怎么样', 5, q, (v) => { q = v; drawQ(); }, SLEEP_Q));
  drawQ();
  const submit = () => {
    if (!bed.value && !wake.value) { toast('填一下几点睡、几点起', 'error'); return false; }
    return save('睡眠', (data) => { dayOf(data, day).sleep = { bed: bed.value, wake: wake.value, ...(q ? { q } : {}) }; })
      .then(() => { after(); toast(q >= 4 ? CHEER_ON.sleepGood : '记好了'); }).catch(() => false);
  };
  const box = h('div', { class: 'form sleep-form' },
    h('div', { class: 'row-2' }, h('label', {}, '几点睡', bed), h('label', {}, '几点起', wake)),
    qRow);
  box.submit = submit;
  return box;
}
function sleepSheet(day) {
  const form = sleepForm(day, render);
  openSheet({ title: day === dayKey() ? '昨晚的睡眠' : `${relDay(day)}的睡眠`, body: form, confirmText: '记好了', onConfirm: () => form.submit() });
}



function eventText(e) {
  if (e.type === 'shower') return '洗澡';
  if (e.type === 'drink') return e.kind;
  if (e.type === 'sport') return [e.kind, e.minutes ? `${e.minutes} 分钟` : '', e.km ? `${e.km} 公里` : '', e.level ? LEVEL[e.level] : ''].filter(Boolean).join(' · ');
  return '';
}
const LEVEL = { easy: '轻松', mid: '适中', hard: '累' };
function eventRow(e) {
  const remove = () => saveUndoable(`删掉：${eventText(e)}`, (data) => { data.events = data.events.filter((x) => x.id !== e.id); }, `删掉了「${eventText(e)}」`).then(render).catch(() => {});
  return h('div', { class: 'event-row' },
    h('span', { class: 'muted small ev-time' }, hm(e.at)),
    h('span', { class: 'grow' }, eventText(e), e.note ? h('span', { class: 'muted small' }, ` · ${e.note}`) : null),
    h('button', { class: 'link small', 'aria-label': `删掉 ${eventText(e)}`, onclick: remove }, '删掉'));
}

// 记在哪一天：今天就用现在的时间；补记以前的某天，就用那天晚上 9 点
function atFor(day) {
  return day === dayKey() ? nowIso() : new Date(`${day}T21:00:00`).toISOString();
}

async function recordShower(day) {
  try {
    await save('洗澡', (data) => { data.events.push({ id: newId('e'), day, at: atFor(day), type: 'shower' }); });
  } catch { return; }
  const items = routineOf(store.data, 'shower');
  render();
  if (!items.length) { toast('记好了'); return; }
  const picked = new Set(items.filter((r) => store.data.days[day]?.care?.[r.id]).map((r) => r.id));
  const body = h('div', { class: 'chips' }, items.map((r) => {
    const b = h('button', { type: 'button', class: `chip check${picked.has(r.id) ? ' on' : ''}`, onclick: () => {
      if (picked.has(r.id)) picked.delete(r.id); else picked.add(r.id);
      b.classList.toggle('on', picked.has(r.id));
    } }, r.name);
    return b;
  }));
  openSheet({
    title: '洗完澡了', body: [h('p', { class: 'muted small' }, '这些做了吗？做了的点一下。'), body], confirmText: '好了', cancelText: '待会儿再说',
    onConfirm: () => saveRender('洗澡后', (data) => {
      const c = (dayOf(data, day).care ||= {});
      for (const r of items) { if (picked.has(r.id)) c[r.id] = true; else delete c[r.id]; }
    }).then((ok) => { if (ok && picked.size === items.length) toast(CHEER_ON.shower); }),
  });
}

function recordDrink(day, kind) {
  saveUndoable(`喝了：${kind}`, (data) => { data.events.push({ id: newId('e'), day, at: atFor(day), type: 'drink', kind }); }, `记了一杯${kind}`).then(render).catch(() => {});
}

function sportSheet(day) {
  const d = store.data;
  let kind = null;
  let level = null;
  const minutes = h('input', { inputmode: 'numeric', placeholder: '多少分钟', 'aria-label': '多少分钟' });
  const km = h('input', { inputmode: 'decimal', placeholder: '多少公里（可以不填）', 'aria-label': '多少公里' });
  const note = h('input', { placeholder: '备注（可以不填）', 'aria-label': '备注' });
  const kindRow = h('div', {});
  const levelRow = h('div', {});
  const draw = () => {
    kindRow.replaceChildren(choiceRow('运动类型', d.settings.sportKinds.map((k) => [k, k]), kind, (v) => { kind = v; draw(); }));
    levelRow.replaceChildren(choiceRow('累不累', Object.entries(LEVEL), level, (v) => { level = v; draw(); }));
    km.hidden = !['跑步', '走路', '爬山'].includes(kind);
  };
  draw();
  openSheet({
    title: '运动', body: h('div', { class: 'form' }, kindRow, minutes, km, levelRow, note), confirmText: '记好了',
    onConfirm: () => {
      if (!kind) { toast('选一下做的什么运动', 'error'); return false; }
      const mins = Number(minutes.value) || null;
      const dist = Number(km.value) || null;
      if (sickActive(d)) toast('生病的时候运动先停一停，好了再动。', 'error');
      return saveRender(`运动：${kind}`, (data) => {
        data.events.push({ id: newId('e'), day, at: atFor(day), type: 'sport', kind, ...(mins ? { minutes: mins } : {}), ...(dist && !km.hidden ? { km: dist } : {}), ...(level ? { level } : {}), ...(note.value.trim() ? { note: note.value.trim() } : {}) });
      }).then((ok) => ok && toast(CHEER_ON.sport));
    },
  });
}

function quickSheet() {
  const day = dayKey();
  const close = openSheet({
    title: '记一下',
    body: h('div', { class: 'group' },
      cell({ ic: 'drop', title: '洗澡', onclick: () => { close(); recordShower(day); } }),
      cell({ ic: 'run', color: 'var(--sage)', title: '运动', onclick: () => { close(); sportSheet(day); } }),
      cell({ ic: 'cup', color: 'var(--amber)', title: '喝了一杯', sub: store.data.settings.drinkKinds.join(' / '), onclick: () => { close(); drinkSheet(day); } }),
      cell({ ic: 'bed', color: 'var(--blue)', title: '睡眠', onclick: () => { close(); sleepSheet(day); } }),
      cell({ ic: 'moon', color: 'var(--accent)', title: '睡前复盘', href: '#/night' }),
      sickActive(store.data) ? cell({ ic: 'shield', color: 'var(--danger)', title: '生病：喝水、体温、吃药', href: '#/sick' }) : cell({ ic: 'shield', color: 'var(--danger)', title: '我不舒服', onclick: () => { close(); startSickSheet(); } })),
    confirmText: null, cancelText: '关闭',
  });
}
function drinkSheet(day) {
  const close = openSheet({
    title: '喝了一杯',
    body: h('div', { class: 'chips' }, store.data.settings.drinkKinds.map((k) => h('button', { type: 'button', class: 'chip', onclick: () => { close(); recordDrink(day, k); } }, k))),
    confirmText: null, cancelText: '取消',
  });
}





// 每周问一次皮肤状态：首页周五到周日出现，「形象」页一直有
function yearAgoCard(today) {
  const ago = addDays(today, -365);
  const rec = store.data.days[ago];
  if (!rec?.note) return null;
  return h('a', { class: 'card link-card', href: `#/day/${ago}` },
    h('h3', {}, '一年前的今天'),
    h('span', { class: 'block' }, rec.note),
    rec.mood ? h('span', { class: 'muted small' }, `心情 ${rec.mood} 分`) : null);
}

// ---------- 睡前复盘 ----------

const NIGHT_HELP = [
  ['睡前复盘', ['每晚一页，1 分钟填完：心情打分和一句话、精力、压力、科研两句话。都可以不填，填几样算几样。', '「明天要做」会在明天的首页出现，问你做到了没有。', '填完点「记好了」，接着做晚上的护肤，然后去祷告。']],
  ['分数怎么打', ['心情 1–10：5 是平常，越高越好。', '精力 1–5：今天有没有精神。', '压力 1–5：越高压力越大。']],
];

function nightView(day) {
  const d = store.data;
  const rec = d.days[day] || {};
  const st = { mood: rec.mood || null, energy: rec.energy || null, stress: rec.stress || null, planDone: rec.planDone || null };
  const note = h('textarea', { rows: 2, placeholder: '今天怎么样，一句话', 'aria-label': '今天的一句话' });
  note.value = rec.note || '';
  const did = h('input', { value: rec.did || '', placeholder: '今天科研做了什么', 'aria-label': '今天科研做了什么' });
  const plan = h('input', { value: rec.plan || '', placeholder: '明天要做什么', 'aria-label': '明天要做什么' });
  const prevPlan = d.days[addDays(day, -1)]?.plan;
  const rows = h('div', {});
  const draw = () => rows.replaceChildren(...[
    h('div', { class: 'label-sm' }, '心情（1–10）'), scoreRow('心情', 10, st.mood, (v) => { st.mood = v; draw(); }),
    h('div', { class: 'label-sm' }, '精力'), scoreRow('精力', 5, st.energy, (v) => { st.energy = v; draw(); }, ['没劲', '有点累', '一般', '不错', '满满']),
    h('div', { class: 'label-sm' }, '压力'), scoreRow('压力', 5, st.stress, (v) => { st.stress = v; draw(); }, ['很轻松', '轻松', '一般', '有点大', '很大']),
    prevPlan ? [h('div', { class: 'label-sm' }, `昨天说今天要：${prevPlan}`), choiceRow('做到了吗', [['yes', '做到了'], ['part', '做了一部分'], ['no', '没做']], st.planDone, (v) => { st.planDone = v; draw(); })] : null,
  ].flat().filter(Boolean));
  draw();
  const submit = () => save('睡前复盘', (data) => {
    const r = dayOf(data, day);
    for (const k of ['mood', 'energy', 'stress', 'planDone']) { if (st[k]) r[k] = st[k]; else delete r[k]; }
    for (const [k, el] of [['note', note], ['did', did], ['plan', plan]]) { const v = el.value.trim(); if (v) r[k] = v; else delete r[k]; }
  }).then(() => { toast(cheerNight(st.mood)); render(); }).catch(() => {});
  const isToday = day === dayKey();
  const pmItems = routineOf(d, 'pm');
  return h('div', { class: 'form' },
    headerSub('睡前复盘', isToday ? dayLabel(day) : `${relDay(day)} · ${dayLabel(day)}`, helpButton('睡前复盘怎么用', NIGHT_HELP)),
    h('div', { class: 'card' }, rows, h('div', { class: 'label-sm' }, '一句话'), note),
    h('div', { class: 'card' }, h('h3', {}, '科研'), h('div', { class: 'label-sm first' }, '今天做了'), did, h('div', { class: 'label-sm' }, '明天要做'), plan),
    h('div', { class: 'actions' }, h('button', { class: 'grow', onclick: submit }, '记好了')),
    rec.mood || rec.note ? h('div', { class: 'card next-card' },
      h('h3', {}, '接下来'),
      pmItems.length ? [h('div', { class: 'small' }, '晚上的护肤：'), careCardInline(day, 'pm')] : null,
      isToday ? h('a', { class: 'button wide', href: '#/pray/go' }, icon('candle'), '去祷告') : null) : null);
}

function careCardInline(day, when) {
  const care = store.data.days[day]?.care || {};
  return h('div', { class: 'chips' }, routineOf(store.data, when).map((r) => {
    const on = Boolean(care[r.id]);
    return h('button', { type: 'button', class: `chip check${on ? ' on' : ''}`, 'aria-pressed': String(on), onclick: () => saveRender(`护肤：${r.name}`, (data) => {
      const c = (dayOf(data, day).care ||= {});
      if (c[r.id]) delete c[r.id]; else c[r.id] = true;
    }) }, r.name);
  }));
}

// ---------- 形象 ----------
// 只看做了什么：这个月、护肤（月历、每一项做到多少）、护肤品。不放口号，不涉及钱（钱在账本里看）

const LOOK_HELP = [
  ['这一页是什么', ['看你在形象上做了什么：这个月护肤做完几天、洗澡几次，每一项做到了多少，用的护肤品开封多久了。']],
  ['护肤', ['月历：早晚都做完是深紫，做了一部分是浅紫。', '每一项做到多少按最近 30 天算；洗过澡的那天，晚上的洗脸不算（洗澡时洗过了）。', '「改打卡项」可以加、改名、删掉每天的打卡项，比如加「防晒（早上）」「擦鞋（早上）」。']],
  ['护肤品', ['从物品档案里读「洗漱护肤」类的东西。点一下记开封日期、好不好用、开封后多久用完（一般 12 个月）。', '快到时间会标出来。「快用完了」会放进物品档案的购物清单。']],
];

function lookView() {
  const today = dayKey();
  return h('div', {},
    headerSub('形象', '这个月做了什么', helpButton('形象这一页怎么用', LOOK_HELP)),
    lookMonthCard(today),
    careDataCard(today),
    productsCard());
}

function lookMonthCard(today) {
  const d = store.data;
  const m = lookMonth(d, today);
  const tiles = [['护肤做完', `${m.full.size}/${m.days} 天`], ['洗澡', `${m.showers} 次`], ...m.extra.slice(0, 2).map((x) => [x.r.name, `${x.n} 次`])];
  return h('div', { class: 'card' },
    h('h3', {}, `${Number(today.slice(5, 7))} 月`),
    h('div', { class: 'stat-grid' }, tiles.map(([a, b]) => stat(a, b))),
    monthGrid(today.slice(0, 7), m.full, { partial: m.some, title: '这个月哪天护肤做完了' }),
    h('p', { class: 'muted small legend' }, h('i', { class: 'sw full' }), '早晚都做完　', h('i', { class: 'sw part' }), '做了一部分'));
}

function careDataCard(today) {
  const d = store.data;
  const rates = careItemRates(d, today);
  const span = Math.min(30, daysBetween(d.startDate || today, today) + 1);
  const pct = (x) => (x.rate === null ? '—' : `${Math.round(x.rate * 100)}%`);
  const order = { am: 0, pm: 1, shower: 2, week: 3 };
  const rows = rates.slice().sort((a, b) => order[a.r.when] - order[b.r.when]).map((x) => h('div', { class: 'care-rate' },
    h('span', { class: 'grow' }, x.r.name, h('span', { class: 'muted small' }, ` · ${WHEN[x.r.when]}`)),
    x.week ? h('span', { class: 'small' }, `这周 ${x.done}/${x.total}`)
      : [h('span', { class: 'bar-track' }, h('span', { class: 'bar', style: `width:${Math.round((x.rate || 0) * 100)}%` })),
        h('span', { class: 'small rate-num' }, x.r.when === 'shower' ? `${x.done}/${x.total} 次` : pct(x))]));
  const forgot = span >= 7 ? rates.filter((x) => !x.week && x.total >= 5 && x.rate < 0.8 && !x.r.optional).sort((a, b) => a.rate - b.rate)[0] : null;
  return h('div', { class: 'card' },
    h('div', { class: 'rec-top' }, h('h3', {}, `护肤 · 最近 ${span} 天`), h('button', { class: 'link small', onclick: routineSheet }, '改打卡项')),
    rates.length ? rows : h('p', { class: 'muted small' }, '还没有打卡项。点「改打卡项」加一个。'),
    forgot ? h('p', { class: 'small soon' }, `最常忘：${WHEN[forgot.r.when]}的${forgot.r.name}（${forgot.total} 次里忘了 ${forgot.total - forgot.done} 次）`) : null,
    span < 7 && rates.length ? h('p', { class: 'muted small' }, '记满一周后，会告诉你哪一项最常忘。') : null);
}

// 改打卡项：加、改名、改时间、删
function routineSheet() {
  const d = store.data;
  const list = h('div', {});
  const draw = () => list.replaceChildren(...store.data.look.routine.map((r) => h('div', { class: 'event-row' },
    h('span', { class: 'grow' }, r.name, h('span', { class: 'muted small' }, ` · ${WHEN[r.when]}${r.when === 'week' ? ` ${r.times || 1} 次` : ''}`)),
    h('button', { class: 'link small', onclick: () => { close(); routineItemSheet(r); } }, '改'))));
  draw();
  const close = openSheet({
    title: '打卡项',
    body: h('div', {}, d.look.routine.length ? list : h('p', { class: 'muted small' }, '还没有。'),
      h('button', { class: 'secondary wide', onclick: () => { close(); routineItemSheet(); } }, '＋ 加一项')),
    confirmText: null, cancelText: '好了', onConfirm: () => {},
  });
}
function routineItemSheet(r = null) {
  const name = h('input', { value: r?.name || '', placeholder: '比如「防晒」「洗脸（米粹）」', 'aria-label': '打卡项名字' });
  let when = r?.when || 'am';
  const times = h('input', { inputmode: 'numeric', value: String(r?.times || 1), 'aria-label': '每周几次' });
  const whenRow = h('div', {});
  const timesRow = h('label', {}, '每周几次', times);
  const draw = () => {
    whenRow.replaceChildren(choiceRow('什么时候', Object.entries(WHEN), when, (v) => { when = v || when; draw(); }));
    timesRow.hidden = when !== 'week';
  };
  draw();
  const close = openSheet({
    title: r ? '改打卡项' : '加一项',
    body: h('div', { class: 'form' }, name, h('div', { class: 'label-sm' }, '什么时候'), whenRow, timesRow,
      h('p', { class: 'muted small' }, '早上、晚上的会出现在「今天」的清单里；洗澡后的在记洗澡时问；每周的在这一周里做够几次就行。'),
      r ? h('button', { class: 'danger small', onclick: () => { close(); saveUndoable(`删掉打卡项：${r.name}`, (data) => {
        data.look.routine = data.look.routine.filter((x) => x.id !== r.id);
      }, `删掉了「${r.name}」（以前的打卡还在）`).then(render).catch(() => {}); } }, '删掉这项') : null),
    confirmText: '好了',
    onConfirm: () => {
      const v = name.value.trim();
      if (!v) { toast('写个名字', 'error'); return false; }
      const n = Math.min(7, Math.max(1, Number(times.value) || 1));
      return saveRender(r ? `改打卡项：${v}` : `加打卡项：${v}`, (data) => {
        const x = { ...(r ? data.look.routine.find((y) => y.id === r.id) : { id: newId('r') }), name: v, when };
        if (when === 'week') x.times = n; else delete x.times;
        const i = data.look.routine.findIndex((y) => y.id === x.id);
        if (i >= 0) data.look.routine[i] = x; else data.look.routine.push(x);
      });
    },
  });
}

// 物品档案里「洗漱护肤」类的东西（缓存 5 分钟）
const invCache = { at: 0, items: null, error: '' };
const inventoryGh = () => {
  const inv = readJson('inventory-settings');
  const owner = (settings.repo || DEFAULT_REPO).split('/')[0];
  return new GitHub({ token: inv.token || settings.token, repo: inv.repo || `${owner}/inventory-data` });
};
async function loadProducts(force = false) {
  if (!force && invCache.items && Date.now() - invCache.at < 300000) return;
  try {
    const data = JSON.parse(await inventoryGh().readText('inventory.json', 'main'));
    const locs = Object.fromEntries((data.locations || []).map((l) => [l.id, l.name]));
    invCache.items = (data.items || []).filter((i) => !i.archived && (i.tags || []).includes('洗漱护肤'))
      .map((i) => ({ id: i.id, name: i.name, where: (locs[i.location] || '').split(' ')[0], qty: i.quantity, low: i.runningLow || '', out: Number(i.quantity) === 0 }));
    invCache.error = '';
  } catch (e) {
    invCache.items = [];
    invCache.error = e.message;
  }
  invCache.at = Date.now();
}
// 改物品档案里的一件东西（直接提交，冲突了重来）
async function updateInventoryItem(id, fn, message) {
  const g = inventoryGh();
  for (let attempt = 0; ; attempt++) {
    const head = await g.headSha();
    const data = JSON.parse(await g.readText('inventory.json', head));
    const it = (data.items || []).find((x) => x.id === id);
    if (!it) throw new Error('物品档案里找不到这件了');
    fn(it);
    try {
      await g.commit(head, [{ path: 'inventory.json', content: JSON.stringify(data, null, 1) + '\n' }], message);
      return;
    } catch (e) {
      if (!(e instanceof GitHubError && e.status === 422) || attempt === 3) throw e;
    }
  }
}

const VERDICT = { good: '好用', ok: '一般', bad: '不适合' };
const PAO_TEXT = { over: '过了建议的时间，最好换新的', soon: '快到时间了' };
function productsCard() {
  const box = h('div', {}, h('p', { class: 'muted small' }, '正在读物品档案……'));
  const draw = () => {
    const d = store.data;
    const today = dayKey();
    const list = (invCache.items || []).filter((i) => !d.look.hide.includes(i.id));
    if (invCache.error) { box.replaceChildren(h('p', { class: 'muted small' }, `读不到物品档案：${invCache.error}`)); return; }
    const rows = list.map((i) => {
      const p = d.look.products[i.id] || {};
      const st = p.opened ? openedStatus(p.opened, paoMonths(i.name, p.pao), today) : null;
      return { i, p, st, rank: st ? { over: 0, soon: 1, ok: 2 }[st.level] : 3 };
    }).sort((a, b) => a.rank - b.rank);
    box.replaceChildren(...[
      ...(rows.length ? rows.map(({ i, p, st }) => h('button', { class: 'event-row product-row', onclick: () => productSheet(i) },
        h('span', { class: 'grow' }, i.name,
          h('span', { class: 'muted small block' }, [st?.age || '还没记开封', p.verdict ? VERDICT[p.verdict] : '', i.out ? '用完了' : i.low ? '快用完了 · 在购物清单上' : ''].filter(Boolean).join(' · ')),
          st && st.level !== 'ok' ? h('span', { class: `small block ${st.level === 'over' ? 'danger-text' : 'soon'}` }, PAO_TEXT[st.level]) : null),
        icon('chev', 'i chev'))) : [h('p', { class: 'muted small' }, '物品档案里还没有「洗漱护肤」类的东西。')]),
      d.look.hide.length ? h('button', { class: 'link small', onclick: () => saveRender('显示藏起来的东西', (data) => { data.look.hide = []; }) }, `显示藏起来的 ${d.look.hide.length} 样`) : null,
    ].filter(Boolean));
  };
  loadProducts().then(() => { if (box.isConnected) draw(); });
  if (invCache.items) draw();
  return h('div', { class: 'card' }, h('h3', {}, '护肤品'), box);
}

function productSheet(item) {
  const p = store.data.look.products[item.id] || {};
  const opened = h('input', { type: 'date', value: p.opened || '', 'aria-label': '开封日期' });
  const note = h('input', { value: p.note || '', placeholder: '用起来怎么样（可以不填）', 'aria-label': '备注' });
  let verdict = p.verdict || null;
  let pao = paoMonths(item.name, p.pao);
  const vRow = h('div', {});
  const pRow = h('div', {});
  const draw = () => {
    vRow.replaceChildren(choiceRow('好不好用', Object.entries(VERDICT), verdict, (v) => { verdict = v; draw(); }));
    pRow.replaceChildren(choiceRow('开封后多久用完', [[6, '6 个月'], [12, '12 个月'], [24, '24 个月'], [36, '36 个月']], pao, (v) => { pao = v || pao; draw(); }));
  };
  draw();
  const lowBtn = item.out ? null : h('button', { class: 'secondary small', onclick: async () => {
    close();
    try {
      await saving(item.low ? '正在改……' : '正在放进购物清单……', () => updateInventoryItem(item.id, (it) => { if (item.low) delete it.runningLow; else it.runningLow = dayKey(); }, `${item.low ? '还够用' : '快用完了'}：${item.name}（从「生活」）`));
      toast(item.low ? '好，还够用' : '放进购物清单了');
      await loadProducts(true);
      render();
    } catch { /* 已提示 */ }
  } }, item.low ? '还够用（从购物清单拿掉）' : '快用完了 → 放进购物清单');
  const close = openSheet({
    title: item.name,
    body: h('div', { class: 'form' }, h('label', {}, '开封日期', opened),
      h('div', { class: 'label-sm' }, '开封后多久用完'), pRow,
      h('div', { class: 'label-sm' }, '用了两周以后：'), vRow, note, lowBtn,
      h('button', { class: 'link small', onclick: () => { close(); saveRender('藏起来', (data) => { data.look.hide.push(item.id); }); } }, '这个不是护肤品，不在这里显示')),
    confirmText: '好了',
    onConfirm: () => saveRender(`护肤品：${item.name}`, (data) => {
      const x = { ...(opened.value ? { opened: opened.value } : {}), ...(verdict ? { verdict } : {}), ...(note.value.trim() ? { note: note.value.trim() } : {}),
        ...(pao !== paoMonths(item.name) ? { pao } : {}) };
      if (Object.keys(x).length) data.look.products[item.id] = x; else delete data.look.products[item.id];
    }),
  });
}

// ---------- 定期打理 ----------

function periodicView() {
  const d = store.data;
  const today = dayKey();
  const edit = (p = null) => {
    const name = h('input', { value: p?.name || '', placeholder: '比如「洗枕头」', 'aria-label': '名字' });
    const every = h('input', { inputmode: 'numeric', value: p?.every || '', placeholder: '几天一次', 'aria-label': '几天一次' });
    const last = h('input', { type: 'date', value: p?.last || '', 'aria-label': '上次做' });
    const close = openSheet({
      title: p ? p.name : '加一项',
      body: h('div', { class: 'form' }, h('label', {}, '名字', name), h('label', {}, '几天一次', every), h('label', {}, '上次做（不知道可以不填）', last),
        p ? h('button', { class: 'danger small', onclick: () => { close(); saveUndoable(`删掉定期：${p.name}`, (data) => { data.periodic = data.periodic.filter((x) => x.id !== p.id); }, `删掉了「${p.name}」`).then(render).catch(() => {}); } }, '删掉这项') : null),
      confirmText: '好了',
      onConfirm: () => {
        const n = Number(every.value);
        if (!name.value.trim() || !(n > 0)) { toast('名字和天数都要填', 'error'); return false; }
        return saveRender('定期打理', (data) => {
          const x = { id: p?.id || newId('pd'), name: name.value.trim(), every: n, last: last.value || null };
          const i = data.periodic.findIndex((y) => y.id === x.id);
          if (i >= 0) data.periodic[i] = x; else data.periodic.push(x);
        });
      },
    });
  };
  const withLeft = d.periodic.map((p) => ({ p, left: p.last ? p.every - daysBetween(p.last, today) : -999 }));
  const due = withLeft.filter((x) => x.left <= 0).sort((a, b) => a.left - b.left).map((x) => x.p);
  const later = withLeft.filter((x) => x.left > 0).sort((a, b) => a.left - b.left).map((x) => x.p);
  return h('div', {},
    headerSub('定期打理', '到日子了会出现在「今天」', helpButton('定期打理怎么用', [['怎么用', ['平时不打扰你：前一天「今天」页会说一声「明天该……了」；到了日子出现在「今天」，没做就每天都在，点「做了」就从那天重新数。', '点一项可以改名字、几天一次、上次是哪天；也可以自己加，比如洗枕头、擦眼镜。', '「形象」里开始学修眉这类步骤时，会自动加上对应的一项。']]])),
    due.length ? [h('div', { class: 'section-title' }, `该做了（${due.length}）`), h('div', { class: 'card list-card' }, due.map((p) => periodicRow(p, today, edit)))] : null,
    later.length ? [h('div', { class: 'section-title' }, '还早'), h('div', { class: 'card list-card' }, later.map((p) => periodicRow(p, today, edit)))] : null,
    h('button', { class: 'secondary wide', onclick: () => edit() }, '＋ 加一项'));
}
// 一项定期打理：名字（点了改）、进度条（离下次还有多久）、「做了」
function periodicRow(p, today, edit) {
  const passed = p.last ? daysBetween(p.last, today) : null;
  const left = p.last ? p.every - passed : 0;
  const frac = p.last ? Math.min(1, passed / p.every) : 0;
  const done = () => saveUndoable(`定期打理：${p.name}`, (data) => { const x = data.periodic.find((y) => y.id === p.id); if (x) x.last = today; }, `${CHEER_ON.periodic}（${p.every} 天后再提醒）`).then(render).catch(() => {});
  return h('div', { class: 'per-row' },
    h('button', { type: 'button', class: 'per-main', onclick: () => edit(p), 'aria-label': `改 ${p.name}` },
      h('span', { class: 'per-top' }, h('b', {}, p.name), h('span', { class: `small ${p.last && left <= 0 ? 'soon' : 'muted'}` }, !p.last ? '还没记过，做了就开始算' : left <= 0 ? (left === 0 ? '今天该做了' : `过了 ${-left} 天`) : `${left} 天后`)),
      h('span', { class: 'bar-track' }, h('span', { class: 'bar', style: `width:${Math.round(frac * 100)}%;background:${left <= 0 ? 'var(--amber)' : 'var(--sage)'}` })),
      h('span', { class: 'muted small' }, `每 ${p.every} 天${p.last ? ` · 上次${relDay(p.last, today)}` : ''}`)),
    p.last === today ? h('span', { class: 'good-text small per-done' }, '今天做了 ✓') : h('button', { class: 'small secondary per-done', onclick: done }, '做了'));
}

// ---------- 祷告 ----------

const PRAY_HELP = [
  ['祷告怎么用', [
    '「开始祷告」：网站带着你一步一步走，一步一页，点「下一步」。第 1 阶段是简短版（安静、感谢一句、主祷文），2 分钟。',
    '「和 ChatGPT 一起祷告」：复制提示词，打开 ChatGPT 粘贴，切到语音，让它带着你。结束后把它写的小结贴回来，就记成今晚的祷告。',
    '每晚 22:30 左右会提醒你（在「设置」里开启推送）。锁屏上看不出是什么。',
  ]],
  ['阶段', ['第 1 阶段 扎根（4 周）：睡前 2 分钟。', '第 2 阶段 早晚（4 周）：加一个早上一句话，首页早上会出现。', '第 3 阶段 回顾一天：睡前 5–10 分钟的完整版。', '满 4 周网页会问你要不要进下一步，你决定；随时也可以用完整版。']],
  ['断了怎么办', ['这里不显示「连续多少天」，只显示这个月祷告了几天、上次是哪天。', '只有一条规矩：别连着漏两天。漏了一天，第二天会说「今晚 2 分钟就好」。']],
  ['祷告事项和每周', ['祷告事项：挂在心上的事写下来，祷告时照着说。有了结果点「看到回应」，写一句。', '每周日安静时间：写这周的感恩，过一遍祷告事项，回看这周写过的话。']],
  ['读经（不强求）', ['诗篇一天一篇，点「打开」跳到 Bible App 的这一篇，读完点「读了」。读一篇，再用里面的一句话开始祷告。']],
];

function prayView() {
  const d = store.data;
  const today = dayKey();
  const ps = prayerStats(d, today);
  const stage = STAGES[d.prayer.stage];
  const tonight = d.days[today]?.prayer?.night;
  return h('div', {},
    headerSub('祷告', `第 ${d.prayer.stage} 阶段 · ${stage.name}`, helpButton('祷告怎么用', PRAY_HELP)),
    h('div', { class: 'card pray-card' },
      h('p', { class: 'small' }, stage.text),
      tonight ? h('p', { class: 'good-text' }, `今晚祷告了${tonight.note ? `：${tonight.note}` : ''}`) : null,
      h('a', { class: 'button wide', href: '#/pray/go' }, icon('candle'), tonight ? '再祷告一次' : '开始祷告'),
      d.prayer.stage < 3 ? h('a', { class: 'link small center block', href: '#/pray/go?m=full' }, '用完整版') : null,
      h('button', { class: 'secondary wide', onclick: chatgptPraySheet }, '和 ChatGPT 一起祷告')),
    h('p', { class: 'muted small center' }, `这个月祷告了 ${ps.month} 天${ps.last ? ` · 上次是${relDay(ps.last, today)}` : ''}`),
    ps.missedYesterday ? h('div', { class: 'card soft' }, h('p', { class: 'small' }, '昨天没祷告也没关系。今晚 2 分钟就好。')) : null,
    stageReady(d, today) ? stageCard() : null,
    weekCard(today),
    itemsCard(),
    readingCard(today),
    h('a', { class: 'quiet-link', href: '#/low', onclick: () => resetLow() }, '难受的时候 ›'));
}

function stageCard() {
  const d = store.data;
  const next = d.prayer.stage + 1;
  return h('div', { class: 'card good-card' },
    h('p', {}, `第 ${d.prayer.stage} 阶段已经 4 周了。要进第 ${next} 阶段「${STAGES[next].name}」吗？`),
    h('p', { class: 'small muted' }, STAGES[next].text),
    h('div', { class: 'actions' },
      h('button', { onclick: () => saveRender(`祷告进第 ${next} 阶段`, (data) => { data.prayer.stage = next; data.prayer.since = dayKey(); }) }, '进下一阶段'),
      h('button', { class: 'secondary', onclick: () => saveRender('祷告阶段再待一段', (data) => { data.prayer.since = addDays(dayKey(), -14); }) }, '再待两周')));
}

function weekCard(today) {
  const d = store.data;
  const mon = weekOf(today);
  const isSunday = parseDay(today).getDay() === 0;
  const nights = Array.from({ length: 7 }, (_, i) => addDays(mon, i)).filter((x) => x <= today)
    .map((x) => ({ day: x, p: d.days[x]?.prayer?.night })).filter((x) => x.p);
  const reads = Array.from({ length: 7 }, (_, i) => addDays(mon, i)).filter((x) => d.days[x]?.read !== undefined).length;
  const thanks = h('textarea', { rows: 3, placeholder: '这周感谢的事', 'aria-label': '这周的感恩' });
  thanks.value = d.weeks[mon]?.thanks || '';
  const saveThanks = () => saveRender('这周的感恩', (data) => {
    const v = thanks.value.trim();
    const w = (data.weeks[mon] ||= {});
    if (v) w.thanks = v; else delete w.thanks;
  }).then(() => toast('记好了'));
  return h('div', { class: `card${isSunday ? ' sunday' : ''}` },
    h('h3', {}, isSunday ? '今天是周日：安静时间' : `这周（${weekLabel(mon)}）`),
    isSunday ? h('p', { class: 'small muted' }, '花 15–30 分钟：写这周的感恩，过一遍祷告事项，读一读这周晚上写的话。') : null,
    thanks,
    h('button', { class: 'small secondary', onclick: saveThanks, style: 'margin-top:8px' }, '存好感恩'),
    h('p', { class: 'small muted' }, `这周祷告了 ${nights.length} 晚，读经 ${reads} 篇。`),
    nights.filter((x) => x.p.note || x.p.summary).map((x) => h('div', { class: 'small night-note' },
      h('span', { class: 'muted' }, `${dayLabel(x.day)}　`), x.p.note || x.p.summary)));
}

function itemsCard() {
  const d = store.data;
  const open = d.prayer.items.filter((x) => !x.answered);
  const done = d.prayer.items.filter((x) => x.answered);
  const input = h('input', { placeholder: '挂在心上的事，比如「论文顺利」', 'aria-label': '新的祷告事项' });
  const add = () => {
    const v = input.value.trim();
    if (!v) return;
    saveRender('祷告事项', (data) => { data.prayer.items.push({ id: newId('pi'), text: v, at: dayKey() }); });
  };
  const answer = (x) => {
    const note = h('input', { placeholder: '怎么看到回应的（一句话，可以不填）', 'aria-label': '回应' });
    openSheet({ title: x.text, body: note, confirmText: '记下', onConfirm: () => saveRender('看到回应', (data) => {
      const y = data.prayer.items.find((z) => z.id === x.id);
      if (y) Object.assign(y, { answered: dayKey(), ...(note.value.trim() ? { answerNote: note.value.trim() } : {}) });
    }) });
  };
  const remove = (x) => saveUndoable('删掉祷告事项', (data) => { data.prayer.items = data.prayer.items.filter((y) => y.id !== x.id); }, '删掉了一项').then(render).catch(() => {});
  return h('div', { class: 'card' },
    h('h3', {}, '祷告事项'),
    open.map((x) => h('div', { class: 'event-row' },
      h('span', { class: 'grow' }, x.text, h('span', { class: 'muted small' }, ` · ${x.at}`)),
      h('button', { class: 'link small', onclick: () => answer(x) }, '看到回应'),
      h('button', { class: 'link small muted', 'aria-label': `删掉 ${x.text}`, onclick: () => remove(x) }, '删'))),
    h('div', { class: 'inline-add' }, input, h('button', { class: 'small', onclick: add }, '加')),
    done.length ? h('details', { class: 'inner' }, h('summary', {}, `看到回应的（${done.length}）`),
      done.map((x) => h('div', { class: 'small night-note' }, h('b', {}, x.text), h('span', { class: 'muted' }, ` · ${x.answered}`), x.answerNote ? h('span', { class: 'block' }, x.answerNote) : null))) : null);
}

function readingCard(today) {
  const d = store.data;
  const r = readingToday(d, today);
  const readToday = d.days[today]?.read !== undefined;
  const read = () => saveRender(`读经：${r.label}`, (data) => markRead(data, today)).then((ok) => ok && toast(CHEER_ON.read));
  const en = d.settings.bibleVersionEn;
  return h('div', { class: 'card' },
    h('div', { class: 'rec-top' }, h('h3', {}, `读经（不强求）· ${r.info.name}`), h('button', { class: 'link small', onclick: bookSheet }, '换一卷')),
    r.done ? h('p', {}, `${r.info.name}读完了一遍 🎉 点「换一卷」接着读别的。`) : [
      h('p', {}, readToday ? `今天读过了 ✓${r.info.byDate ? '' : ` 下一次：${r.label}`}` : `今天：${r.label}`),
      h('div', { class: 'actions' },
        h('a', { class: 'button secondary', href: bibleLink(r.ref, d.settings.bibleVersion), target: '_blank', rel: 'noopener' }, '打开 Bible App'),
        en ? h('a', { class: 'button secondary', href: bibleLink(r.ref, en), target: '_blank', rel: 'noopener' }, '英文版') : null,
        readToday ? null : h('button', { onclick: read }, '读了')),
      h('p', { class: 'muted small' }, r.info.byDate ? r.info.note : `${r.info.note}。一共 ${r.total} 次读完，读到第 ${r.idx + 1} 次。`)]);
}

function bookSheet() {
  const d = store.data;
  const cur = d.prayer.book || 'PSA';
  let pick = cur;
  let en = Boolean(d.settings.bibleVersionEn);
  const list = h('div', {});
  const draw = () => list.replaceChildren(
    h('div', { class: 'group' }, Object.entries(BIBLE_BOOKS).map(([k, b]) => h('button', { type: 'button', class: `cell pick${pick === k ? ' on' : ''}`, 'aria-pressed': String(pick === k), onclick: () => { pick = k; draw(); } },
      h('span', { class: 'grow' }, b.name, h('span', { class: 'muted small block' }, b.note)), pick === k ? icon('check', 'i') : null))),
    h('label', { class: 'switch-row' }, h('input', { type: 'checkbox', checked: en, onchange: (e) => { en = e.target.checked; } }), '旁边加一个英文版（NLT）链接，中英对照读'));
  draw();
  openSheet({
    title: '读哪一卷', body: [h('p', { class: 'muted small' }, '换了以后，原来那一卷读到哪里还记着，换回来接着读。'), list], confirmText: '好了',
    onConfirm: () => saveRender('读经：换一卷', (data) => {
      data.prayer.book = pick;
      if (en) data.settings.bibleVersionEn = 116; else delete data.settings.bibleVersionEn;
    }),
  });
}

function chatgptPraySheet() {
  const d = store.data;
  const today = dayKey();
  const text = prayerPrompt({ about: d.prayer.about || undefined, verse: verseFor(today), items: d.prayer.items.filter((x) => !x.answered).map((x) => x.text), plan: d.days[today]?.plan || '' });
  const box = h('textarea', { rows: 8, readonly: true, class: 'prompt-box', 'aria-label': '祷告提示词' });
  box.value = text;
  const back = h('textarea', { rows: 4, placeholder: '祷告完，把 ChatGPT 最后写的小结（感谢 / 祈求 / 经文）贴在这里', 'aria-label': 'ChatGPT 的小结' });
  openSheet({
    title: '和 ChatGPT 一起祷告',
    body: h('div', { class: 'form' },
      h('ol', { class: 'small steps' }, h('li', {}, '点「复制」，打开 ChatGPT，新开一个对话粘贴发送。'), h('li', {}, '点右下角的语音按钮，跟着它祷告。'), h('li', {}, '结束后回到文字，把它写的小结复制，贴到下面。')),
      box, h('button', { class: 'secondary small', onclick: () => copyText(text) }, icon('copy'), '复制'),
      h('div', { class: 'label-sm' }, '祷告完：'), back),
    confirmText: '记成今晚的祷告',
    onConfirm: () => saveRender('祷告（和 ChatGPT）', (data) => {
      const p = (dayOf(data, today).prayer ||= {});
      p.night = { at: nowIso(), mode: 'chatgpt', ...(back.value.trim() ? { summary: back.value.trim() } : {}) };
    }).then((ok) => ok && toast(CHEER_ON.prayer)),
  });
}

// 带着祷告：一步一页
const prayState = { i: 0, key: '' };
function prayGoView(mode) {
  const d = store.data;
  const today = dayKey();
  const m = mode === 'morning' ? 'morning' : mode === 'full' || d.prayer.stage >= 3 ? 'full' : 'short';
  const key = `${today}-${m}`;
  if (prayState.key !== key) { prayState.key = key; prayState.i = 0; }
  const verse = m === 'morning' ? verseFor(today, MORNING_VERSES) : verseFor(today, VERSES);
  const items = d.prayer.items.filter((x) => !x.answered);
  const plan = m === 'morning' ? d.days[addDays(today, -1)]?.plan : d.days[today]?.plan;
  const page = (title, ...body) => ({ title, body });
  const quiet = page('安静', h('p', { class: 'pray-lead' }, '深呼吸三次。神就在这里。'), h('blockquote', {}, verse.text, h('cite', {}, verse.ref)));
  const lord = LORDS_PRAYER.lines.map((line, i) => page(i === 0 ? '主祷文' : '', h('p', { class: 'pray-line' }, line), i === 0 ? h('p', { class: 'muted small' }, `${LORDS_PRAYER.ref} · 一句一页，跟着念`) : null));
  const hints = (list) => h('ul', { class: 'pray-hints' }, list.map((x) => h('li', {}, x)));
  let pages;
  if (m === 'morning') {
    pages = [quiet,
      page('交托今天', plan ? h('p', { class: 'pray-lead' }, `今天要做：${plan}`) : h('p', { class: 'pray-lead' }, '今天要做的事'), h('p', { class: 'pray-hint' }, '主，今天交给你。求你给我智慧和平安，带领我做好每一件事。'))];
  } else if (m === 'short') {
    pages = [quiet, page('感谢', h('p', { class: 'pray-lead' }, '今天有什么值得感谢？说一句就好。'), hints(THANKS_HINTS)), ...lord];
  } else {
    pages = [quiet,
      page('赞美', h('p', { class: 'pray-lead' }, '神是怎样的？'), hints(PRAISE_HINTS)),
      page('感谢', h('p', { class: 'pray-lead' }, '今天有什么值得感谢？'), hints(THANKS_HINTS)),
      page('回看', h('p', { class: 'pray-lead' }, '今天什么时候离神近，什么时候离神远？'), h('p', { class: 'pray-hint' }, `有要认罪的：${CONFESS_HINT}`), h('blockquote', {}, CONFESS_VERSE.text, h('cite', {}, CONFESS_VERSE.ref))),
      page('祈求', h('p', { class: 'pray-lead' }, '心里挂着的事'), items.length ? h('ul', { class: 'pray-hints' }, items.map((x) => h('li', {}, x.text))) : h('p', { class: 'muted' }, '（还没写祷告事项，可以在祷告页加）'), h('p', { class: 'pray-hint' }, ASK_HINT)),
      page('交托明天', plan ? h('p', { class: 'pray-lead' }, `明天要做：${plan}`) : h('p', { class: 'pray-lead' }, '明天的事'), h('p', { class: 'pray-hint' }, ENTRUST_HINT)),
      ...lord];
  }
  const total = pages.length + 1;
  const i = Math.min(prayState.i, pages.length);
  const step = (n) => { prayState.i = Math.max(0, Math.min(pages.length, i + n)); render(); window.scrollTo(0, 0); };
  let content;
  if (i < pages.length) {
    const pg = pages[i];
    content = [
      pg.title ? h('h2', { class: 'pray-title' }, pg.title) : null,
      h('div', { class: 'pray-body' }, pg.body),
      h('div', { class: 'pray-nav' },
        i > 0 ? h('button', { class: 'secondary', onclick: () => step(-1) }, '上一步') : h('a', { class: 'button secondary', href: '#/pray' }, '先不了'),
        h('button', { class: 'grow', onclick: () => step(1) }, i === pages.length - 1 ? '阿们' : '下一步'))];
  } else {
    content = m === 'morning' ? finishMorning(today) : finishNight(today, m);
  }
  return h('div', { class: 'pray-screen' },
    h('div', { class: 'pray-progress', 'aria-label': `第 ${i + 1} 步，共 ${total} 步` }, Array.from({ length: total }, (_, k) => h('span', { class: k <= i ? 'on' : '' }))),
    content);
}
function finishMorning(today) {
  const done = () => saveRender('早上的祷告', (data) => { (dayOf(data, today).prayer ||= {}).morning = { at: nowIso() }; })
    .then((ok) => { if (!ok) return; prayState.key = ''; toast(CHEER_ON.morning); go('#/'); });
  return [h('h2', { class: 'pray-title' }, '去过今天吧'), h('button', { class: 'wide', onclick: done }, '好')];
}
function finishNight(today, m) {
  const note = h('textarea', { rows: 3, placeholder: '想写的话写一两句（可以不写）', 'aria-label': '祷告后的一句话' });
  const done = () => saveRender('祷告', (data) => {
    const p = (dayOf(data, today).prayer ||= {});
    p.night = { at: nowIso(), mode: m, ...(note.value.trim() ? { note: note.value.trim() } : {}) };
  }).then((ok) => { if (!ok) return; prayState.key = ''; toast(CHEER_ON.prayer); go('#/pray'); });
  return [h('h2', { class: 'pray-title' }, '想写点什么吗'), note, h('button', { class: 'wide', onclick: done }, '完成')];
}

// ---------- 英语陪练 ----------
// 错句本 / 表达本：english.cards = [{ id, kind: mistake|expr, front, back, type?, cn?, example?, at, due, level, seen }]，english.next = 上次 ChatGPT 说下次注意什么

const EN_HELP = [
  ['怎么练', [
    '网页按「聊天 2 次、美国生活 2 次、会议 1 次」轮着给你今天的模式和话题，也可以自己换。',
    '点「复制」→ 打开 ChatGPT 新对话粘贴发送 → 点语音按钮聊 15 分钟。',
    '聊完回到文字框打 wrap up，它会按固定格式列出你说错的句子和值得学的表达。',
    '把那段总结整个复制，贴到这一页的「贴回来」里，点「存进本子」：说错的进错句本，表达进表达本，同时记一次练习。不想贴的话点「练完了」只记一次。',
  ]],
  ['每天复习', [
    '首页会出现「英语复习 N 条」，每次最多 10 条，一两分钟。',
    '错句：先看你说的，想想怎么改，再点开看正确的。表达：先看中文，想想英文怎么说。',
    '「记住了」：隔 1、3、7、14、30、60 天再出现，越熟越少见。「还没记住」：明天再来。',
  ]],
  ['省事的办法', ['在 ChatGPT 里建一个「项目」（Projects），把提示词里不变的部分放进项目说明，以后只发今天的模式和话题。']],
];
const enState = { mode: null, topic: null };
function englishView() {
  const d = store.data;
  const today = dayKey();
  const sessions = d.events.filter((e) => e.type === 'english');
  const autoMode = EN_CYCLE[sessions.length % EN_CYCLE.length];
  const mode = enState.mode || autoMode;
  const pool = EN_TOPICS[mode];
  const seed = [...today].reduce((a, c) => a + c.charCodeAt(0), 0) + sessions.length;
  const topic = enState.topic && pool.includes(enState.topic) ? enState.topic : pool[seed % pool.length];
  const text = englishPrompt(mode, topic, d.english.next);
  const mon = weekOf(today);
  const thisWeek = sessions.filter((e) => e.day >= mon).length;
  const box = h('textarea', { rows: 8, readonly: true, class: 'prompt-box', 'aria-label': '英语提示词' });
  box.value = text;
  const done = (extra = {}) => saveUndoable('英语练了一次', (data) => { data.events.push({ id: newId('e'), day: today, at: nowIso(), type: 'english', mode, topic, ...extra }); }, CHEER_ON.english)
    .then(() => { enState.mode = null; enState.topic = null; render(); }).catch(() => {});
  const paste = h('textarea', { rows: 5, placeholder: '把 ChatGPT「wrap up」以后写的总结整段贴在这里', 'aria-label': 'ChatGPT 的总结' });
  const savePaste = () => {
    const r = parseSummary(paste.value);
    if (!r.mistakes.length && !r.expressions.length) { toast('没认出错句和表达。要贴 === SUMMARY === 那一整段', 'error'); return; }
    const have = new Set(d.english.cards.map((c) => c.front.toLowerCase()));
    const cards = [
      ...r.mistakes.map((m) => ({ kind: 'mistake', front: m.said, back: m.better, type: m.type })),
      ...r.expressions.map((x) => ({ kind: 'expr', front: x.expr, back: x.example, cn: x.cn })),
    ].filter((c) => !have.has(c.front.toLowerCase())).map((c) => ({ id: newId('c'), ...c, at: today, due: addDays(today, 1), level: 0 }));
    saveRender('英语：存进本子', (data) => {
      data.english.cards.push(...cards);
      if (r.next) data.english.next = r.next;
      data.events.push({ id: newId('e'), day: today, at: nowIso(), type: 'english', mode, topic, mistakes: r.mistakes.length, exprs: r.expressions.length });
    }).then((ok) => { if (ok) { enState.mode = null; enState.topic = null; toast(`存好了：${r.mistakes.length} 个错句、${r.expressions.length} 个表达。${CHEER_ON.english}`); } });
  };
  const due = dueCards(d, today);
  const month = today.slice(0, 7);
  const prevMonth = addDays(`${month}-01`, -1).slice(0, 7);
  const types = mistakeTypes(d, month);
  const prevTypes = mistakeTypes(d, prevMonth);
  const TYPE_CN = { tense: '时态', article: '冠词', preposition: '介词', 'word': '用词', grammar: '语法', other: '其他' };
  const counts = { mistake: d.english.cards.filter((c) => c.kind === 'mistake').length, expr: d.english.cards.filter((c) => c.kind === 'expr').length };
  return h('div', {},
    headerSub('英语陪练', `这周练了 ${thisWeek} 次 · 一共 ${sessions.length} 次`, helpButton('英语陪练怎么用', EN_HELP)),
    due.length ? h('a', { class: 'card link-card', href: '#/english/review' }, h('b', {}, `今天复习 ${due.length} 条`), h('span', { class: 'muted small block' }, '一两分钟')) : null,
    d.english.next ? h('div', { class: 'card soft' }, h('p', { class: 'small' }, `上次 ChatGPT 说下次注意：${d.english.next}`)) : null,
    h('div', { class: 'card' },
      h('h3', {}, '今天的模式'),
      choiceRow('模式', Object.entries(EN_MODES).map(([k, v]) => [k, v.name]), mode, (v) => { enState.mode = v || autoMode; enState.topic = null; render(); }),
      h('h3', {}, '话题'),
      h('p', { class: 'topic' }, topic),
      h('button', { class: 'link small', onclick: () => { enState.mode = mode; enState.topic = pool[(pool.indexOf(topic) + 1) % pool.length]; render(); } }, '换一个话题')),
    h('div', { class: 'card' }, box, h('div', { class: 'actions' },
      h('button', { onclick: () => copyText(text) }, icon('copy'), '复制'))),
    h('div', { class: 'card' },
      h('h3', {}, '练完了：贴回来'),
      paste,
      h('div', { class: 'actions' }, h('button', { onclick: savePaste }, '存进本子'), h('button', { class: 'secondary', onclick: () => done() }, '只记练了一次'))),
    h('div', { class: 'card' },
      h('h3', {}, '我的本子'),
      h('p', { class: 'small' }, `错句 ${counts.mistake} 个 · 表达 ${counts.expr} 个`),
      Object.keys(types).length ? h('p', { class: 'small' }, '这个月常错的：', Object.entries(types).sort((a, b) => b[1] - a[1]).map(([t, n]) => `${TYPE_CN[t] || t} ${n}${prevTypes[t] !== undefined ? `（上个月 ${prevTypes[t]}）` : ''}`).join('、')) : null,
      d.english.cards.length ? h('a', { class: 'small', href: '#/english/cards' }, '翻看全部 ›') : h('p', { class: 'muted small' }, '贴回第一次的总结，这里就有东西了。')));
}


const reviewState = { shown: false };
function englishReviewView() {
  const d = store.data;
  const today = dayKey();
  const due = dueCards(d, today);
  if (!due.length) {
    return h('div', {}, header('复习'), h('div', { class: 'card center' }, h('p', {}, '今天的复习做完了 ✓'), h('p', { class: 'muted small' }, CHEER_ON.englishCards), h('a', { class: 'button secondary', href: '#/english' }, '回到英语陪练')));
  }
  const c = due[0];
  const answer = (ok) => {
    reviewState.shown = false;
    save('英语复习', (data) => {
      const i = data.english.cards.findIndex((x) => x.id === c.id);
      if (i >= 0) data.english.cards[i] = reviewCard(data.english.cards[i], ok, today);
    }).then(() => { render(); if (due.length === 1) toast(CHEER_ON.englishCards); }).catch(() => {});
  };
  const front = c.kind === 'mistake'
    ? [h('div', { class: 'label-sm first' }, '你说的（哪里不对？）'), h('p', { class: 'card-front' }, c.front)]
    : [h('div', { class: 'label-sm first' }, '英文怎么说？'), h('p', { class: 'card-front' }, c.cn || c.front)];
  const back = c.kind === 'mistake'
    ? [h('div', { class: 'label-sm' }, '更好的说法'), h('p', { class: 'card-back' }, c.back), c.type ? h('span', { class: 'badge' }, c.type) : null]
    : [h('p', { class: 'card-back' }, c.front), c.back ? h('p', { class: 'muted small' }, c.back) : null];
  return h('div', {},
    headerSub('复习', `还有 ${due.length} 条`),
    h('div', { class: 'card flash' }, front, reviewState.shown ? back : null),
    reviewState.shown
      ? h('div', { class: 'actions' }, h('button', { class: 'grow', onclick: () => answer(true) }, '记住了'), h('button', { class: 'secondary grow', onclick: () => answer(false) }, '还没记住'))
      : h('button', { class: 'wide', onclick: () => { reviewState.shown = true; render(); } }, '看答案'),
    h('p', { class: 'muted small center' }, `记住了会隔 ${REVIEW_STEPS.slice(0, 4).join('、')}… 天再出现`));
}

function englishCardsView() {
  const d = store.data;
  const del = (c) => saveUndoable('英语：删一张', (data) => { data.english.cards = data.english.cards.filter((x) => x.id !== c.id); }, '删掉了').then(render).catch(() => {});
  const list = (kind) => d.english.cards.filter((c) => c.kind === kind).slice().reverse().map((c) => h('div', { class: 'event-row' },
    h('span', { class: 'grow small' }, kind === 'mistake' ? [h('s', { class: 'muted' }, c.front), h('span', { class: 'block' }, c.back)] : [h('b', {}, c.front), c.cn ? ` · ${c.cn}` : '', c.back ? h('span', { class: 'muted block' }, c.back) : null]),
    h('button', { class: 'link small muted', onclick: () => del(c) }, '删')));
  return h('div', {},
    headerSub('我的本子', '错句和表达'),
    h('div', { class: 'section-title' }, '表达本'), h('div', { class: 'card' }, list('expr')),
    h('div', { class: 'section-title' }, '错句本'), h('div', { class: 'card' }, list('mistake')));
}

// ---------- 想去的地方 ----------
// 地图用高德的底图（不用密钥）+ Leaflet（vendor/leaflet，按需加载）。坐标存高德坐标（GCJ-02）。

const PLACES_HELP = [
  ['怎么加', [
    '点「＋ 加一个」，第一个框里什么都能放：小红书、大众点评、美团、高德的分享，「店名 + 地址」，或者随便一句话，比如「芙蓉街那家排队很长的油旋」。',
    '点「一键补全」：名字、类型、区、地图上的位置会填好。写了地址的话，位置会准很多。',
    '选一下类型、在哪个区，在小地图上点一下它的位置（也可以点「用我现在的位置」）。其他都可以不填。',
  ]],
  ['去过了', ['点进一个地方 →「去过了」，打个分、写一句话，可以放一张照片。同一个地方可以去很多次。', '地图上空心的是想去的，实心的是去过的；颜色按类型分。']],
  ['周末去哪', ['周五到周日，「今天」页会从你写过的地方里挑 1–2 个：想去还没去的、去过觉得好的、好久没去的。周末要下雨就先推室内的。周五晚上的推送也会带上。']],
  ['走遍', ['「按区」看每个区去过几个地方，空着的区周末可以去转转。「足迹」是每一年去过的地方。']],
];
const placeState = { tab: 'list', kind: '' };
let leafletLoading = null;
function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (!leafletLoading) {
    leafletLoading = new Promise((resolve, reject) => {
      const css = document.createElement('link');
      css.rel = 'stylesheet'; css.href = 'vendor/leaflet/leaflet.css';
      document.head.append(css);
      const js = document.createElement('script');
      js.src = 'vendor/leaflet/leaflet.js';
      js.onload = () => resolve(window.L);
      js.onerror = () => { leafletLoading = null; reject(new Error('地图加载失败')); };
      document.head.append(js);
    });
  }
  return leafletLoading;
}
const AMAP_TILES = 'https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}';
function baseMap(el, L, center, zoom) {
  const map = L.map(el, { zoomControl: false, attributionControl: true }).setView(center, zoom);
  L.tileLayer(AMAP_TILES, { subdomains: '1234', maxZoom: 18, attribution: '高德地图' }).addTo(map);
  return map;
}
const cityCenter = () => { const c = store.data.settings.city; return c?.lat ? [c.lat, c.lon] : [36.66, 117.02]; };

function placesView() {
  const d = store.data;
  const today = dayKey();
  const list = d.places.filter((p) => !placeState.kind || p.kind === placeState.kind);
  const tabs = [['list', '列表'], ['map', '地图'], ['area', '按区'], ['foot', '足迹']];
  let body;
  if (placeState.tab === 'map') body = placesMap(list);
  else if (placeState.tab === 'area') body = placesArea();
  else if (placeState.tab === 'foot') body = placesFoot(today);
  else body = placesList(list, today);
  const visitedN = d.places.filter(visited).length;
  return h('div', {},
    headerSub('想去的地方', d.places.length ? `${d.places.length} 个地方，去过 ${visitedN} 个` : '走遍、吃遍你的城市', helpButton('想去的地方怎么用', PLACES_HELP)),
    weekendCard(today, true),
    h('div', { class: 'segmented' }, tabs.map(([k, v]) => h('button', { class: `seg${placeState.tab === k ? ' on' : ''}`, onclick: () => { placeState.tab = k; render(); } }, v))),
    ['list', 'map'].includes(placeState.tab) ? h('div', { class: 'chip-scroll' },
      [['', '全部'], ...Object.entries(PLACE_KINDS).map(([k, v]) => [k, v.name])].map(([k, v]) => h('button', { type: 'button', class: `chip${placeState.kind === k ? ' on' : ''}`, onclick: () => { placeState.kind = k; render(); } }, v))) : null,
    body,
    h('div', { class: 'actions sticky' }, h('a', { class: 'button', href: '#/place/new' }, '＋ 加一个')));
}

function stars(n) { return n ? '★'.repeat(n) + '☆'.repeat(Math.max(0, 3 - n)) : ''; }
function placeRow(p, today) {
  const last = lastVisit(p);
  const k = PLACE_KINDS[p.kind] || PLACE_KINDS.other;
  return h('a', { class: 'place-row', href: `#/place/${p.id}` },
    h('span', { class: `place-dot${visited(p) ? ' done' : ''}`, style: `--c:${k.color}` }),
    h('span', { class: 'grow' }, p.name, h('span', { class: 'muted small block' }, [k.name, p.district, p.want && !visited(p) ? stars(p.want) : '', last ? `去过 ${p.visits.length} 次 · 上次${relDay(last.day, today)}` : ''].filter(Boolean).join(' · '))),
    last?.score ? h('span', { class: 'small' }, `${bestScore(p)} 分`) : null);
}
function placesList(list, today) {
  if (!list.length) return h('div', { class: 'card' }, h('p', { class: 'muted small' }, store.data.places.length ? '这一类还没有。' : '还没有地方。在小红书看到想去的，复制链接，点下面「＋ 加一个」。'));
  const want = list.filter((p) => !visited(p)).sort((a, b) => (b.want || 0) - (a.want || 0));
  const been = list.filter(visited).sort((a, b) => lastVisit(b).day.localeCompare(lastVisit(a).day));
  return [
    want.length ? [h('div', { class: 'section-title' }, `想去（${want.length}）`), h('div', { class: 'card list-card' }, want.map((p) => placeRow(p, today)))] : null,
    been.length ? [h('div', { class: 'section-title' }, `去过（${been.length}）`), h('div', { class: 'card list-card' }, been.map((p) => placeRow(p, today)))] : null,
  ];
}
function placesMap(list) {
  const el = h('div', { class: 'map-box' });
  const noPos = list.filter((p) => !p.lat).length;
  loadLeaflet().then((L) => {
    if (!el.isConnected) return;
    const map = baseMap(el, L, cityCenter(), 12);
    const pts = [];
    for (const p of list.filter((x) => x.lat)) {
      const k = PLACE_KINDS[p.kind] || PLACE_KINDS.other;
      const m = L.circleMarker([p.lat, p.lng], { radius: 8, color: k.color, weight: 3, fillColor: k.color, fillOpacity: visited(p) ? 0.9 : 0.1 }).addTo(map);
      const a = document.createElement('a');
      a.href = `#/place/${p.id}`; a.textContent = p.name;
      m.bindPopup(a);
      pts.push([p.lat, p.lng]);
    }
    if (pts.length > 1) map.fitBounds(pts, { padding: [30, 30], maxZoom: 14 });
    else if (pts.length === 1) map.setView(pts[0], 14);
  }).catch((e) => el.replaceChildren(h('p', { class: 'muted small' }, e.message)));
  return [el, noPos ? h('p', { class: 'muted small' }, `还有 ${noPos} 个地方没标位置，点进去在小地图上点一下就好。`) : null];
}
function placesArea() {
  const d = store.data;
  const prog = districtProgress(d.places, d.settings.city?.districts || []);
  const rows = Object.entries(prog);
  if (!rows.length) return h('div', { class: 'card' }, h('p', { class: 'muted small' }, '加地方时选一下在哪个区，这里就能看到每个区去过几个。'));
  return h('div', { class: 'card' },
    h('p', { class: 'muted small' }, '空着的区，周末可以去转转。'),
    rows.map(([dist, x]) => h('div', { class: 'area-row' },
      h('span', { class: 'area-name' }, dist),
      h('span', { class: 'bar-track grow' }, h('span', { class: 'bar', style: `width:${x.total ? (x.visited / x.total) * 100 : 0}%;background:var(--good)` })),
      h('span', { class: 'small muted area-num' }, x.total ? `${x.visited}/${x.total}` : '—'))));
}
function placesFoot(today) {
  const years = [...new Set(store.data.places.flatMap((p) => (p.visits || []).map((v) => v.day.slice(0, 4))))].sort().reverse();
  if (!years.length) return h('div', { class: 'card' }, h('p', { class: 'muted small' }, '去过一个地方点「去过了」，足迹就从这里开始。'));
  return years.map((y) => {
    const list = footprints(store.data.places, y);
    const places = new Set(list.map((x) => x.place.id)).size;
    return [h('div', { class: 'section-title' }, `${y} 年 · 去了 ${places} 个地方、${list.length} 次`),
      h('div', { class: 'card list-card' }, list.map(({ place, visit }) => h('a', { class: 'place-row', href: `#/place/${place.id}` },
        h('span', { class: 'muted small ev-time' }, visit.day.slice(5).replace('-', '/')),
        h('span', { class: 'grow' }, place.name, visit.note ? h('span', { class: 'muted small block' }, visit.note) : null),
        visit.score ? h('span', { class: 'small' }, '★'.repeat(visit.score)) : null)))];
  });
}

// 周末去哪：周五到周日在「今天」出现；想去页一直有
const weekendWeather = { key: '', rainy: null };
function weekendCard(today, always = false) {
  const d = store.data;
  if (!d.places.length) return null;
  const dow = parseDay(today).getDay();
  if (!always && ![5, 6, 0].includes(dow)) return null;
  const [sat, sun] = weekendDays(today);
  const city = d.settings.city;
  if (city?.lat && weekendWeather.key !== sat) {
    weekendWeather.key = sat;
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}&daily=precipitation_probability_max&timezone=Asia%2FShanghai&start_date=${sat}&end_date=${sun}`)
      .then((r) => r.json()).then((j) => { weekendWeather.rainy = Math.max(...(j.daily?.precipitation_probability_max || [0])) >= 60; if (['/', '/places'].includes(currentPath())) render(); })
      .catch(() => {});
  }
  const picks = weekendPicks(d.places, today, { rainy: Boolean(weekendWeather.rainy) });
  if (!picks.length) return null;
  return h('div', { class: 'card weekend' },
    h('h3', {}, '这个周末去哪'),
    weekendWeather.rainy ? h('p', { class: 'small muted' }, '周末可能下雨，先推室内的。') : null,
    picks.map((x) => h('a', { class: 'place-row', href: `#/place/${x.place.id}` },
      h('span', { class: `place-dot${visited(x.place) ? ' done' : ''}`, style: `--c:${(PLACE_KINDS[x.place.kind] || PLACE_KINDS.other).color}` }),
      h('span', { class: 'grow' }, x.place.name, h('span', { class: 'muted small block' }, x.why)))),
    freeMoneyLine());
}
// 账本里这个预算月自由钱还剩多少（读不到就不显示）
const freeCache = { at: 0, text: '' };
function freeMoneyLine() {
  const el = h('p', { class: 'muted small' }, freeCache.text);
  if (Date.now() - freeCache.at > 600000) {
    freeCache.at = Date.now();
    readLedgerFile().then((f) => {
      if (!f?.budget?.free) return;
      const start = f.settings?.periodStartDay || 1;
      const t = dayKey();
      let ps = `${t.slice(0, 8)}${String(start).padStart(2, '0')}`;
      if (Number(t.slice(8)) < start) ps = `${addDays(`${t.slice(0, 8)}01`, -1).slice(0, 8)}${String(start).padStart(2, '0')}`;
      const free = new Set(f.categories.filter((c) => c.group === 'free').map((c) => c.id));
      const spent = f.tx.filter((x) => x.type === 'expense' && free.has(x.category) && x.date >= ps && x.date <= t).reduce((a, x) => a + (x.cny ?? x.amount), 0);
      freeCache.text = `这个月自由钱还剩 ¥${Math.max(0, Math.round(f.budget.free - spent))}`;
      if (el.isConnected) el.textContent = freeCache.text;
    });
  }
  return el;
}
async function readLedgerFile() {
  const lg = readJson('ledger-settings');
  const owner = (settings.repo || DEFAULT_REPO).split('/')[0];
  const g = new GitHub({ token: lg.token || settings.token, repo: lg.repo || `${owner}/finance-data` });
  try { return JSON.parse(await g.readText('finance.json', 'main')); } catch { return null; }
}

// 一个地方：新建 / 编辑
const placeDraft = { id: null, data: null, raw: '', autoName: '' }; // raw：第一个框里写的；autoName：从分享里认出来的名字（DeepSeek 可以换掉）
function placeEditView(id) {
  const d = store.data;
  const old = id === 'new' ? null : d.places.find((p) => p.id === id);
  if (id !== 'new' && !old) return notFound();
  if (placeDraft.id !== id) Object.assign(placeDraft, { id, data: structuredClone(old || { kind: null, district: null, want: 2 }), raw: '', autoName: '', ai: null });
  const x = placeDraft.data;
  const share = h('textarea', { rows: 3, placeholder: '粘贴小红书、大众点评、美团、高德的分享，\n或者写「店名 + 地址」，或者随便一句话', 'aria-label': '粘贴或写下地方' });
  share.value = placeDraft.raw;
  const name = h('input', { value: x.name || '', placeholder: '名字', 'aria-label': '名字', oninput: (e) => { x.name = e.target.value; } });
  const link = h('input', { class: 'bare', value: x.link || '', placeholder: '笔记或店铺的链接', 'aria-label': '链接', oninput: (e) => { x.link = e.target.value; } });
  const why = h('textarea', { class: 'bare', rows: 2, placeholder: '比如：朋友说那家的油旋很好吃', 'aria-label': '为什么想去', oninput: (e) => { x.why = e.target.value; } });
  why.value = x.why || '';
  const cost = h('input', { class: 'bare', inputmode: 'numeric', value: x.cost || '', placeholder: x.cost === 0 ? '免费' : '不知道可以空着', 'aria-label': '大概花多少', oninput: (e) => { x.cost = Number(e.target.value) || null; drawCost(); } });
  const season = h('input', { class: 'bare', value: x.season || '', placeholder: '或者自己写', 'aria-label': '什么时候去最好', oninput: (e) => { x.season = e.target.value; drawSeason(); } });
  const costChips = h('div', { class: 'chips detail-chips' });
  const drawCost = () => costChips.replaceChildren(...[[0, '免费'], [30, '¥30'], [50, '¥50'], [100, '¥100'], [200, '¥200']].map(([v, t]) => h('button', {
    type: 'button', class: `chip${x.cost === v ? ' on' : ''}`, 'aria-pressed': String(x.cost === v),
    onclick: () => { x.cost = x.cost === v ? null : v; cost.value = x.cost || ''; cost.placeholder = x.cost === 0 ? '免费' : '不知道可以空着'; drawCost(); },
  }, t)));
  drawCost();
  const seasonChips = h('div', { class: 'chips detail-chips' });
  const seasonParts = () => (x.season || '').split(/[、,，\s]+/).filter(Boolean);
  const drawSeason = () => seasonChips.replaceChildren(...['春天', '夏天', '秋天', '冬天', '晚上', '周末', '下雨天'].map((v) => {
    const on = seasonParts().includes(v);
    return h('button', { type: 'button', class: `chip${on ? ' on' : ''}`, 'aria-pressed': String(on), onclick: () => {
      const parts = seasonParts();
      x.season = (on ? parts.filter((y) => y !== v) : [...parts, v]).join('、');
      season.value = x.season; drawSeason();
    } }, v);
  }));
  drawSeason();
  const detailRow = (ic, label, ...body) => h('div', { class: 'detail-row' },
    h('div', { class: 'detail-label' }, icon(ic, 'i'), label), ...body);
  share.addEventListener('input', () => {
    placeDraft.raw = share.value;
    const r = parseShare(share.value);
    if (r.title && (!name.value || name.value === placeDraft.autoName)) { name.value = r.title; x.name = r.title; placeDraft.autoName = r.title; }
    if (r.url) { link.value = r.url; x.link = r.url; }
  });
  const pick = (k, v) => { x[k] = x[k] === v ? null : v; render(); };
  const ai = placeDraft.ai ||= { busy: false, note: '' };
  const aiFill = async () => {
    const text = old ? '' : placeDraft.raw.trim();
    if (!x.name?.trim() && !text) { toast('先写点什么：名字、地址或者一句话', 'error'); return; }
    ai.busy = true; ai.note = ''; render();
    try {
      const list = await findPlace(x.name?.trim() || '', text);
      ai.busy = false;
      if (!list.length) { ai.note = 'DeepSeek 不认识这个地方。在地图上点一下就好。'; render(); return; }
      const rename = !x.name?.trim() || x.name === placeDraft.autoName; // 名字是自己写的就不动
      if (list.length === 1) { applyCandidate(x, list[0], rename); ai.note = aiNote(list[0]); render(); return; }
      render();
      chooseCandidates(list, x, old);
    } catch (e) { ai.busy = false; ai.note = ''; render(); toast(e.message, 'error'); }
  };
  const mapEl = h('div', { class: 'map-box small-map' });
  loadLeaflet().then((L) => {
    if (!mapEl.isConnected) return;
    const map = baseMap(mapEl, L, x.lat ? [x.lat, x.lng] : cityCenter(), x.lat ? 15 : 12);
    let marker = x.lat ? L.marker([x.lat, x.lng]).addTo(map) : null;
    map.on('click', (e) => {
      x.lat = Math.round(e.latlng.lat * 1e6) / 1e6; x.lng = Math.round(e.latlng.lng * 1e6) / 1e6;
      if (marker) marker.setLatLng(e.latlng); else marker = L.marker(e.latlng).addTo(map);
    });
    mapEl.useHere = () => navigator.geolocation.getCurrentPosition((pos) => {
      const g = wgsToGcj(pos.coords.latitude, pos.coords.longitude);
      x.lat = Math.round(g.lat * 1e6) / 1e6; x.lng = Math.round(g.lng * 1e6) / 1e6;
      if (marker) marker.setLatLng([x.lat, x.lng]); else marker = L.marker([x.lat, x.lng]).addTo(map);
      map.setView([x.lat, x.lng], 16);
    }, () => toast('拿不到位置：在 iPhone 设置里允许 Safari 使用位置', 'error'), { enableHighAccuracy: true, timeout: 10000 });
  }).catch((e) => mapEl.replaceChildren(h('p', { class: 'muted small' }, e.message)));
  const submit = () => {
    if (!x.name?.trim()) { toast('写个名字', 'error'); return; }
    const pid = old?.id || newId('pl');
    saveRender(old ? `改地方：${x.name}` : `想去：${x.name}`, (data) => {
      const p = { ...x, id: pid, name: x.name.trim(), visits: old?.visits || [], at: old?.at || dayKey() };
      for (const k of Object.keys(p)) if (p[k] === null || p[k] === '' || p[k] === undefined) delete p[k];
      const i = data.places.findIndex((y) => y.id === pid);
      if (i >= 0) data.places[i] = p; else data.places.push(p);
    }).then((ok) => { if (ok) { placeDraft.id = null; placeDraft.ai = null; toast(old ? '改好了' : '记下了。'); go(old ? `#/place/${pid}` : '#/places'); } });
  };
  const districts = d.settings.city?.districts || [];
  const aiRow = h('div', { class: 'ai-fill' },
    h('button', { class: 'small secondary', disabled: ai.busy, onclick: aiFill }, ai.busy ? '正在找……' : '一键补全'),
    h('span', { class: 'muted small' }, old ? '类型、区、地图上的位置' : '名字、类型、区、地图上的位置'));
  return h('div', { class: 'form' },
    headerSub(old ? '改一下' : '想去的地方', old ? old.name : '名字之外都可以不填'),
    old ? null : h('div', { class: 'card' }, share, aiRow, ai.note ? h('p', { class: 'small muted' }, ai.note) : null),
    h('div', { class: 'card' },
      name,
      old ? [aiRow, ai.note ? h('p', { class: 'small muted' }, ai.note) : null] : null,
      x.address ? h('p', { class: 'small' }, `📍 ${x.address}`) : null,
      h('div', { class: 'label-sm' }, '类型'), choiceRow('类型', Object.entries(PLACE_KINDS).map(([k, v]) => [k, v.name]), x.kind, (v) => pick('kind', v)),
      districts.length ? [h('div', { class: 'label-sm' }, '在哪个区'), choiceRow('区', [...districts, '外地'].map((v) => [v, v]), x.district, (v) => pick('district', v))] : null,
      h('div', { class: 'label-sm' }, '有多想去'), choiceRow('有多想去', [[1, '★'], [2, '★★'], [3, '★★★']], x.want, (v) => pick('want', v))),
    h('div', { class: 'card' }, h('h3', {}, '位置：在地图上点一下'), mapEl,
      h('button', { class: 'link small', onclick: () => mapEl.useHere?.() }, '用我现在的位置')),
    h('div', { class: 'card detail-card' },
      h('h3', {}, '关于它'),
      detailRow('pen', '为什么想去', why),
      detailRow('wallet', '大概花多少', h('div', { class: 'detail-money' }, h('span', { class: 'yen' }, '¥'), cost), costChips),
      detailRow('calendar', '什么时候去最好', seasonChips, season),
      detailRow('globe', '链接', link)),
    h('div', { class: 'actions sticky' }, h('button', { class: 'grow', onclick: submit }, '存好'), h('a', { class: 'button secondary', href: old ? `#/place/${old.id}` : '#/places', onclick: () => { placeDraft.id = null; placeDraft.ai = null; } }, '取消')));
}

// 让 DeepSeek 找：名字，或者第一个框里写的（分享文字、店名 + 地址、一句话）→ 类型、区、坐标（高德坐标）。连锁店会列出这个城市的每一家
async function findPlace(name, text = '') {
  const city = store.data.settings.city || { name: '济南' };
  const districts = city.districts || [];
  const kinds = Object.entries(PLACE_KINDS).map(([k, v]) => `${k} ${v.name}`).join('、');
  const system = `你帮他把想去的地方标在地图上。他在${city.name}。他给你的可能是：一个名字；从小红书、大众点评、美团、高德复制的分享文字；「店名 + 地址」；或者一句描述。先认出他说的是哪个地方，用你知道的信息找出来。`
    + '他写了地址的，按地址定位置，坐标要和地址对得上；name 写干净的店名（分店名放括号里），不要带地址、广告词和表情。'
    + `如果是连锁店（比如 MUJI、星巴克）或者同名的有好几个，把${city.name}的每一家都列出来（最多 8 个，名字带上分店名或者所在商场）。`
    + '坐标用高德地图的坐标（GCJ-02），保留 6 位小数；不知道确切位置就给你最有把握的估计，并把 sure 写成 false。'
    + `不认识这个地方、或者${city.name}没有，就返回空列表，绝对不要编。`
    + `kind 只能从这些里选：${kinds}。district 只能从这些里选：${districts.join('、') || '（没有，写空字符串）'}，在${city.name}以外就写「外地」。`
    + '返回 JSON：{"places": [{"name": "完整名字", "address": "地址或者在哪个商场", "district": "区", "kind": "类型", "lat": 纬度, "lng": 经度, "sure": true}]}';
  const said = text.replace(/https?:\/\/\S+/g, ' ').replace(/\s+/g, ' ').trim(); // 链接它打不开，不发
  const user = [said ? `他写的：${said}` : '', name && !said.includes(name) ? `名字：${name}` : ''].filter(Boolean).join('\n');
  const out = await askJson(await aiConfig(), system, user || `名字：${name}`, { maxTokens: 6000, timeout: 90000 });
  return cleanCandidates(out.places, { center: city.lat ? [city.lat, city.lon] : null, districts });
}
function applyCandidate(x, c, withName = false) {
  if (withName) x.name = c.name;
  x.kind = c.kind;
  if (c.district) x.district = c.district;
  if (c.address) x.address = c.address;
  if (c.lat) { x.lat = c.lat; x.lng = c.lng; }
}
const aiNote = (c) => (c.lat
  ? `DeepSeek 认的是「${c.name}」。位置是它估计的，${c.sure ? '可能差一点' : '它也不太确定'}：打开地图看一下，不对就点一下正确的地方。`
  : `DeepSeek 认的是「${c.name}」，但不知道具体位置，在地图上点一下吧。`);

// 找到好几个（连锁店）：地图上标号，勾选要哪几个。新建时可以一次加好几个
function chooseCandidates(list, x, old) {
  const chosen = new Set();
  const multi = !old;
  const mapEl = h('div', { class: 'map-box small-map' });
  const rows = h('div', {});
  let close;
  const label = () => (chosen.size > 1 ? `加这 ${chosen.size} 个` : '用这一个');
  const draw = () => {
    rows.replaceChildren(...list.map((c, i) => h('label', { class: 'cand' },
      h('input', { type: 'checkbox', checked: chosen.has(i), 'aria-label': c.name, onchange: (e) => {
        if (!multi) chosen.clear();
        if (e.target.checked) chosen.add(i); else chosen.delete(i);
        draw();
      } }),
      c.lat ? h('span', { class: 'cand-num' }, String(i + 1)) : null,
      h('span', { class: 'grow' }, c.name,
        h('span', { class: 'muted small block' }, [c.address, c.district, PLACE_KINDS[c.kind].name, c.lat ? (c.sure ? '' : '位置不太准') : '没有位置'].filter(Boolean).join(' · '))))));
    const btn = document.querySelector('.sheet-overlay:last-child .sheet > .actions button');
    if (btn) btn.textContent = label();
  };
  draw();
  loadLeaflet().then((L) => {
    if (!mapEl.isConnected) return;
    const pts = list.map((c, i) => [c, i]).filter(([c]) => c.lat);
    const map = baseMap(mapEl, L, pts.length ? [pts[0][0].lat, pts[0][0].lng] : cityCenter(), 12);
    for (const [c, i] of pts) L.marker([c.lat, c.lng], { icon: L.divIcon({ className: '', html: `<div class="num-pin">${i + 1}</div>`, iconSize: [22, 22], iconAnchor: [11, 11] }) }).addTo(map);
    if (pts.length > 1) map.fitBounds(pts.map(([c]) => [c.lat, c.lng]), { padding: [24, 24], maxZoom: 15 });
  }).catch(() => mapEl.remove());
  close = openSheet({
    title: `找到 ${list.length} 个「${x.name}」`,
    body: h('div', {},
      h('p', { class: 'muted small' }, multi ? '想去哪几个就勾哪几个，可以勾好几个，会分开记。位置是 DeepSeek 估计的，之后可以在地图上改。' : '是哪一个？位置是 DeepSeek 估计的，之后可以在地图上改。'),
      mapEl, rows),
    confirmText: label(),
    onConfirm: async () => {
      if (!chosen.size) { toast('勾一个', 'error'); return false; }
      const picked = [...chosen].sort((a, b) => a - b).map((i) => list[i]);
      if (picked.length === 1) {
        applyCandidate(x, picked[0], true);
        placeDraft.ai.note = aiNote(picked[0]);
        render();
        return true;
      }
      const base = { want: x.want || 2, ...(x.why ? { why: x.why } : {}), ...(x.link ? { link: x.link } : {}), ...(x.cost != null ? { cost: x.cost } : {}), ...(x.season ? { season: x.season } : {}) };
      const ok = await saveRender(`想去：${picked.map((c) => c.name).join('、')}`, (data) => {
        for (const c of picked) {
          const p = { ...base, id: newId('pl'), name: c.name, kind: c.kind, at: dayKey(), visits: [] };
          applyCandidate(p, c);
          data.places.push(p);
        }
      });
      if (!ok) return false;
      placeDraft.id = null;
      toast(`记下了 ${picked.length} 个地方。`);
      go('#/places');
      return true;
    },
  });
  void close;
}

const photoUrls = {};
function placePhoto(path) {
  const img = h('img', { class: 'visit-photo', alt: '照片' });
  if (photoUrls[path]) img.src = photoUrls[path];
  else gh.readBlob(path).then((b) => { photoUrls[path] = URL.createObjectURL(b); img.src = photoUrls[path]; }).catch(() => img.remove());
  return img;
}

function placeView(id) {
  const d = store.data;
  const p = d.places.find((x) => x.id === id);
  if (!p) return notFound();
  const k = PLACE_KINDS[p.kind] || PLACE_KINDS.other;
  const visits = (p.visits || []).slice().sort((a, b) => b.day.localeCompare(a.day));
  const remove = () => {
    if (!confirm(`删掉「${p.name}」？去过的记录也会一起删掉。`)) return;
    save(`删掉地方：${p.name}`, (data) => { data.places = data.places.filter((x) => x.id !== id); }, { online: true, removes: (p.visits || []).filter((v) => v.photo).map((v) => v.photo) })
      .then(() => go('#/places')).catch(() => {});
  };
  const mapEl = p.lat ? h('div', { class: 'map-box small-map' }) : null;
  if (mapEl) loadLeaflet().then((L) => { if (mapEl.isConnected) { const m = baseMap(mapEl, L, [p.lat, p.lng], 15); L.circleMarker([p.lat, p.lng], { radius: 9, color: k.color, fillColor: k.color, fillOpacity: 0.6 }).addTo(m); } }).catch(() => {});
  const amap = p.lat ? `https://uri.amap.com/marker?position=${p.lng},${p.lat}&name=${encodeURIComponent(p.name)}&coordinate=gaode&callnative=1` : null;
  return h('div', {},
    headerSub(p.name, [k.name, p.district, !visited(p) && p.want ? stars(p.want) : ''].filter(Boolean).join(' · ')),
    h('div', { class: 'card' },
      p.address ? h('p', { class: 'small' }, `📍 ${p.address}`) : null,
      p.why ? h('p', {}, p.why) : null,
      [p.cost ? `大概 ¥${p.cost}` : p.cost === 0 ? '免费' : '', p.season ? `最好：${p.season}` : ''].filter(Boolean).length ? h('p', { class: 'small muted' }, [p.cost ? `大概 ¥${p.cost}` : p.cost === 0 ? '免费' : '', p.season ? `最好：${p.season}` : ''].filter(Boolean).join(' · ')) : null,
      h('div', { class: 'actions' },
        h('button', { onclick: () => visitSheet(p) }, visited(p) ? '又去了一次' : '去过了'),
        p.link ? h('a', { class: 'button secondary', href: p.link, target: '_blank', rel: 'noopener' }, '看笔记') : null,
        amap ? h('a', { class: 'button secondary', href: amap, target: '_blank', rel: 'noopener' }, '导航') : null)),
    mapEl,
    visits.length ? [h('div', { class: 'section-title' }, `去过 ${visits.length} 次`), visits.map((v) => h('div', { class: 'card visit' },
      h('div', { class: 'rec-top' }, h('b', {}, `${v.day} ${v.score ? '★'.repeat(v.score) : ''}`), h('button', { class: 'link small', onclick: () => visitSheet(p, v) }, '改')),
      v.with?.length ? h('p', { class: 'small muted' }, '和 ', v.with.map((pid, i) => [i ? '、' : '', h('a', { href: `#/person/${pid}` }, d.people.find((x) => x.id === pid)?.name || '某人')]), ' 一起') : null,
      v.note ? h('p', { class: 'small' }, v.note) : null,
      v.photo ? placePhoto(v.photo) : null))] : null,
    h('div', { class: 'actions' }, h('a', { class: 'button secondary', href: `#/place/${p.id}/edit` }, '改一下'), h('button', { class: 'danger', onclick: remove }, '删掉')),
    h('a', { class: 'small', href: '#/places' }, '‹ 回到想去的地方'));
}

function visitSheet(p, v = null) {
  const day = h('input', { type: 'date', value: v?.day || dayKey(), 'aria-label': '哪天去的' });
  const note = h('textarea', { rows: 3, placeholder: '一句话：怎么样？（可以不写）', 'aria-label': '一句话' });
  note.value = v?.note || '';
  const file = h('input', { type: 'file', accept: 'image/*', 'aria-label': '照片' });
  let score = v?.score || null;
  const withSet = new Set(v?.with || []);
  const wRow = h('div', {});
  const drawWith = () => {
    const people = store.data.people.filter((x) => !x.archived || withSet.has(x.id)).sort((a, b) => a.name.localeCompare(b.name, 'zh'));
    wRow.replaceChildren(people.length ? h('div', { class: 'chips', role: 'group', 'aria-label': '和谁一起去的' }, people.map((x) => h('button', {
      type: 'button', class: `chip${withSet.has(x.id) ? ' on' : ''}`, 'aria-pressed': String(withSet.has(x.id)),
      onclick: () => { if (withSet.has(x.id)) withSet.delete(x.id); else withSet.add(x.id); drawWith(); },
    }, x.name))) : h('p', { class: 'muted small' }, '在「生活 → 身边的人」里加了人，就能在这里选。'));
  };
  drawWith();
  const sRow = h('div', {});
  const draw = () => sRow.replaceChildren(scoreRow('打分', 5, score, (x) => { score = x; draw(); }, ['1', '2', '3', '4', '5'].map((n) => `${n} ★`)));
  draw();
  const close = openSheet({
    title: v ? '这一次' : `去过「${p.name}」`,
    body: h('div', { class: 'form' }, h('label', {}, '哪天', day), h('div', { class: 'label-sm' }, '打分'), sRow, h('div', { class: 'label-sm' }, '和谁一起去的（可以不选）'), wRow, note,
      h('label', {}, v?.photo ? '换一张照片（可以不换）' : '一张照片（可以不放）', file),
      v ? h('button', { class: 'danger small', onclick: () => { close(); save('删掉一次去过', (data) => { const q = data.places.find((x) => x.id === p.id); q.visits = q.visits.filter((x) => x.id !== v.id); }, { online: Boolean(v.photo), removes: v.photo ? [v.photo] : [] }).then(render).catch(() => {}); } }, '删掉这一次') : null),
    confirmText: '存好',
    onConfirm: async () => {
      const vid = v?.id || newId('v');
      let uploads = []; let photo = v?.photo || null; const removes = [];
      if (file.files[0]) {
        try {
          const blob = await compressImage(file.files[0], 1280, 0.8);
          const path = `photos/places/${p.id}-${vid}-${Date.now().toString(36)}.jpg`;
          uploads = [{ path, base64: await blobToBase64(blob) }];
          if (photo) removes.push(photo);
          photo = path;
        } catch (e) { toast(e.message, 'error'); return false; }
      }
      try {
        await save(`去过：${p.name}`, (data) => {
          const q = data.places.find((x) => x.id === p.id);
          if (!q) return false;
          q.visits ||= [];
          const x = { id: vid, day: day.value || dayKey(), ...(score ? { score } : {}), ...(withSet.size ? { with: [...withSet] } : {}), ...(note.value.trim() ? { note: note.value.trim() } : {}), ...(photo ? { photo } : {}) };
          const i = q.visits.findIndex((y) => y.id === vid);
          if (i >= 0) q.visits[i] = x; else q.visits.push(x);
        }, uploads.length || removes.length ? { uploads, removes } : undefined);
      } catch { return false; }
      render();
      if (!v) toast(score >= 4 ? '喜欢的地方，真好。' : '又走过一个地方。');
      return true;
    },
  });
}

// ---------- 分析 ----------

const STATS_HELP = [
  ['这一页是什么', [
    '把你记下来的东西放在一起看：什么在影响你的状态、作息、心情的走势、每件事的规律、护肤做得怎么样、计划完成得怎么样、生病前有什么规律。',
    '数据要攒一段时间：规律一两周就有；「什么在影响我」要心情记满 3 周才开始给结论。数据不够时会告诉你还要多少天。',
  ]],
  ['怎么看「什么在影响我」', [
    '网页比较「做了某件事的日子」和「没做的日子」，心情、精力这些平均差多少，从差得多的往下排。',
    '只能看出两件事常常一起出现，看不出谁导致谁。比如运动的日子心情好，可能是运动让你开心，也可能是开心的时候更想去运动。',
    '天数少的会标「还不太可靠」，多记一阵子就准了。',
  ]],
  ['报告和问问我的记录', [
    '周报、月报、年报：这段时间的数字，再请 DeepSeek 写一小段话（存下来，不会每次重写）。',
    '问问我的记录：用大白话问，比如「我最近为什么总是累？」。DeepSeek 会读你最近 60 天的记录来回答（小记里的东西不会发过去）。',
  ]],
];
const statsState = { range: 30, rhythm: 'shower' };
const weatherHist = { key: '', data: {} };
const spendHist = { at: 0, data: {} };

function statsView() {
  const d = store.data;
  const today = dayKey();
  const nMood = moodDays(d, today);
  // 天气历史（Open-Meteo 历史接口）和每天花的钱（账本）：拿到了就重画一次
  const city = d.settings.city;
  const from = addDays(today, -120);
  if (city?.lat && weatherHist.key !== today) {
    weatherHist.key = today;
    fetch(`https://archive-api.open-meteo.com/v1/archive?latitude=${city.lat}&longitude=${city.lon}&start_date=${from}&end_date=${addDays(today, -1)}&daily=precipitation_sum,sunshine_duration&timezone=Asia%2FShanghai`)
      .then((r) => r.json()).then((j) => {
        weatherHist.data = Object.fromEntries(j.daily.time.map((t, i) => [t, { rain: j.daily.precipitation_sum[i] || 0, sun: (j.daily.sunshine_duration[i] || 0) / 3600 }]));
        if (currentPath() === '/stats') render();
      }).catch(() => {});
  }
  if (Date.now() - spendHist.at > 600000) {
    spendHist.at = Date.now();
    readLedgerFile().then((f) => {
      if (!f) return;
      const out = {};
      for (const t of f.tx) if (['expense', 'writeoff'].includes(t.type)) out[t.date] = (out[t.date] || 0) + (t.cny ?? t.amount);
      spendHist.data = out;
      if (currentPath() === '/stats') render();
    });
  }
  const inf = influences(d, today, { weather: weatherHist.data, spend: spendHist.data });
  const n = statsState.range;
  const moodS = series(d, today, n, (x) => d.days[x]?.mood ?? null);
  const energyS = series(d, today, n, (x) => d.days[x]?.energy ?? null);
  const stressS = series(d, today, n, (x) => d.days[x]?.stress ?? null);
  const slS = series(d, today, n, (x) => sleepHours(d.days[x]?.sleep));
  const sp = sleepPattern(d, today, 30);
  const RH = { shower: ['洗澡', (e) => e.type === 'shower'], sport: ['运动', (e) => e.type === 'sport'], drink: ['咖啡奶茶茶', (e) => e.type === 'drink'], english: ['英语', (e) => e.type === 'english'] };
  const rh = rhythm(d, today, RH[statsState.rhythm][1]);
  const care = careRates(d, today);
  const plans = planRates(d, today);
  const bs = beforeSick(d);
  const fmtH = (v) => (v === null ? '—' : `${Math.floor(v)} 小时${Math.round((v % 1) * 60) ? ` ${Math.round((v % 1) * 60)} 分` : ''}`);
  return h('div', {},
    headerSub('分析', `心情记了 ${nMood} 天`, helpButton('分析怎么看', STATS_HELP)),
    h('div', { class: 'group' },
      cell({ href: '#/ask', ic: 'sparkle', title: '问问我的记录', sub: '用大白话问，DeepSeek 读你的记录回答' }),
      cell({ href: `#/report?k=week&d=${today}`, ic: 'calendar', color: 'var(--sage)', title: '这周的回顾' }),
      cell({ href: `#/report?k=month&d=${today}`, ic: 'chart', color: 'var(--blue)', title: '这个月的回顾' }),
      cell({ href: `#/report?k=year&d=${today}`, ic: 'book', color: 'var(--amber)', title: `${today.slice(0, 4)} 年度报告` })),

    h('div', { class: 'section-title' }, '什么在影响我'),
    h('div', { class: 'card' },
      nMood < MIN_DAYS ? h('p', { class: 'small' }, `心情再记大约 ${MIN_DAYS - nMood} 天，这里就开始有结论了。先照常记就好。`) : null,
      inf.length ? inf.slice(0, 8).map((x) => h('div', { class: 'inf-row' },
        h('span', { class: `inf-dot ${x.key === 'drink' || x.key === 'spend' ? (x.diff > 0 ? 'bad' : 'good') : x.diff >= 0 ? 'good' : 'bad'}` }),
        h('span', { class: 'grow small' }, influenceText(x), h('span', { class: 'muted block' }, `做了 ${x.nWith} 天 / 没做 ${x.nWithout} 天${x.reliable ? '' : ' · 还不太可靠'}`))))
        : h('p', { class: 'muted small' }, '每种情况都要有 3 天以上才能比，多记几天。'),
      h('p', { class: 'muted small' }, '只能看出两件事常常一起出现，看不出谁导致谁。')),

    h('div', { class: 'section-title' }, '走势'),
    h('div', { class: 'segmented' }, [[30, '30 天'], [90, '90 天']].map(([k, v]) => h('button', { class: `seg${n === k ? ' on' : ''}`, onclick: () => { statsState.range = k; render(); } }, v))),
    h('div', { class: 'card' },
      h('h3', {}, '心情（线是 7 天平均）'), lineChart(moodS, { min: 1, max: 10, title: '心情' }),
      h('h3', {}, '精力'), lineChart(energyS, { min: 1, max: 5, title: '精力', color: 'var(--good)' }),
      h('h3', {}, '压力'), lineChart(stressS, { min: 1, max: 5, title: '压力', color: 'var(--danger)' }),
      h('h3', {}, '睡了几小时'), lineChart(slS, { min: 4, max: 10, title: '睡眠', color: 'var(--blue)' })),

    h('div', { class: 'section-title' }, '作息（最近 30 天）'),
    h('div', { class: 'card' },
      sp.rows.length ? [
        sleepBars(sp.rows.map((r) => ({ day: r.day, bed: bedMinutes(r.sl), wake: bedMinutes({ bed: r.sl.wake }) })), { title: '每天几点睡几点起' }),
        h('div', { class: 'stat-grid' },
          stat('平均睡', fmtH(sp.all.hours)), stat('平均几点睡', sp.all.bed === null ? '—' : bedLabel(Math.round(sp.all.bed))),
          stat('工作日', `${fmtH(sp.weekday.hours)}`), stat('周末', `${fmtH(sp.weekend.hours)}`)),
        sp.weekday.bed !== null && sp.weekend.bed !== null && Math.abs(sp.weekend.bed - sp.weekday.bed) >= 60 ? h('p', { class: 'small muted' }, `周末比工作日晚睡 ${Math.round((sp.weekend.bed - sp.weekday.bed) / 60 * 10) / 10} 小时。差太多周一会特别困。`) : null,
      ] : h('p', { class: 'muted small' }, '早上在「今天」记一下几点睡几点起，这里就有图了。')),

    h('div', { class: 'section-title' }, '规律'),
    h('div', { class: 'chip-scroll' }, Object.entries(RH).map(([k, [v]]) => h('button', { type: 'button', class: `chip${statsState.rhythm === k ? ' on' : ''}`, onclick: () => { statsState.rhythm = k; render(); } }, v))),
    h('div', { class: 'card' },
      rh.count ? [
        h('div', { class: 'stat-grid' },
          stat('这个月', `${rh.thisMonth} 次`), stat('上个月', `${rh.lastMonth} 次`),
          stat('平均隔', rh.avgGap === null ? '—' : `${Math.round(rh.avgGap * 10) / 10} 天`), stat('最长隔', rh.maxGap === null ? '—' : `${rh.maxGap} 天`)),
        monthGrid(today.slice(0, 7), rh.days, { title: '这个月哪天做了' }),
        h('h3', { style: 'margin-top:12px' }, '星期几'), barChart('一二三四五六日'.split('').map((w, i) => ({ label: w, v: rh.weekday[i] })), { title: '星期几' }),
        h('h3', {}, '几点'), barChart(Object.entries(rh.hours).map(([k, v]) => ({ label: k, v })), { title: '几点', color: 'var(--sage)' }),
      ] : h('p', { class: 'muted small' }, '还没有记录。')),

    care.length ? [h('div', { class: 'section-title' }, '护肤（最近 30 天做了几天）'),
      h('div', { class: 'card' }, care.map((c) => h('div', { class: 'area-row' },
        h('span', { class: 'area-name' }, `${WHEN[c.r.when]}${c.r.name}`),
        h('span', { class: 'bar-track grow' }, h('span', { class: 'bar', style: `width:${c.total ? (c.done / c.total) * 100 : 0}%;background:var(--accent)` })),
        h('span', { class: 'small muted area-num' }, `${c.done}/${c.total}`))),
        null)] : null,

    plans.some((x) => x.n) ? [h('div', { class: 'section-title' }, '科研：说要做的做到了几成'),
      h('div', { class: 'card' }, barChart(plans.map((x) => ({ label: `${Number(x.mon.slice(5, 7))}/${Number(x.mon.slice(8))}`, v: x.rate === null ? 0 : Math.round(x.rate * 100) })), { title: '每周计划完成率', fmt: (v) => `${v}%`, color: 'var(--blue)' }),
        h('p', { class: 'muted small' }, '做到算 1，做了一部分算一半。计划没完成很正常，研究本来就难估时间。'),
        h('a', { class: 'small', href: `#/report?k=month&d=${today}` }, '月度科研回顾在月报里 ›'))] : null,

    bs ? [h('div', { class: 'section-title' }, '生病前一周'),
      h('div', { class: 'card' }, h('p', { class: 'small' }, `一共病过 ${bs.n} 次。生病前一周：平均睡 ${fmtH(bs.sleepBefore)}（平时 ${fmtH(bs.sleepUsual)}），压力 ${bs.stressBefore?.toFixed(1) ?? '—'}（平时 ${bs.stressUsual?.toFixed(1) ?? '—'}）。`),
        h('p', { class: 'muted small' }, bs.n < 3 ? '病过 3 次以上规律才看得清。' : '睡得少、压力大的时候，记得多照顾自己。'))] : null);
}
// 报告：周 / 月 / 年。数字 + DeepSeek 写的一小段（存在 letters 里）
function reportRange(k, day) {
  if (k === 'week') { const mon = weekOf(day); return { key: `w${mon}`, from: mon, to: addDays(mon, 6), title: `这周（${weekLabel(mon)}）`, prev: addDays(mon, -7), next: addDays(mon, 7) }; }
  if (k === 'month') {
    const m = day.slice(0, 7); const end = addDays(`${addDays(`${m}-28`, 7).slice(0, 7)}-01`, -1);
    return { key: `m${m}`, from: `${m}-01`, to: end, title: `${Number(m.slice(5))} 月`, prev: addDays(`${m}-01`, -1), next: addDays(end, 1) };
  }
  const y = day.slice(0, 4);
  return { key: `y${y}`, from: `${y}-01-01`, to: `${y}-12-31`, title: `${y} 年`, prev: `${Number(y) - 1}-06-01`, next: `${Number(y) + 1}-06-01` };
}
const letterBusy = {};
function reportView(q) {
  const d = store.data;
  const k = ['week', 'month', 'year'].includes(q.k) ? q.k : 'week';
  const r = reportRange(k, q.d || dayKey());
  const to = r.to > dayKey() ? dayKey() : r.to;
  const s = periodSummary(d, r.from, to);
  const letter = d.letters?.[r.key];
  const fmt1 = (v) => (v === null ? '—' : (Math.round(v * 10) / 10).toString());
  const tiles = [
    ['心情', fmt1(s.mood)], ['精力', fmt1(s.energy)], ['压力', fmt1(s.stress)], ['平均睡', s.sleep === null ? '—' : `${fmt1(s.sleep)} 小时`],
    ['护肤做完', `${s.careDays} 天`], ['洗澡', `${s.showers} 次`], ['运动', `${s.sports} 次${s.km ? ` · ${Math.round(s.km * 10) / 10} 公里` : ''}`], ['咖啡奶茶茶', `${s.drinks} 杯`],
    ['祷告', `${s.prayers} 晚`], ['读经', `${s.reads} 次`], ['英语', `${s.english} 次`], ['去了', `${new Set(s.visits.map((v) => v.name)).size} 个地方`],
  ];
  const write = async () => {
    letterBusy[r.key] = true; render();
    try {
      const cfg = await aiConfig();
      const out = await askJson(cfg, LETTER_SYSTEM, `${r.title}的记录（${r.from} 到 ${to}）：\n${summaryText(s)}\n\n请写这段时间的回顾。${k === 'month' ? '另外单独写一段「科研回顾」：把每天写的科研那一句整理成这个月做了哪些方向、推进到哪、卡在哪里，可以直接拿去组会汇报。' : ''}返回 JSON：{"letter": "回顾正文", "research": "科研回顾（月报才写，没有就空字符串）"}`);
      await save(`回顾：${r.title}`, (data) => { (data.letters ||= {})[r.key] = { at: dayKey(), text: String(out.letter || ''), research: String(out.research || '') }; });
    } catch (e) { toast(e.message, 'error'); }
    letterBusy[r.key] = false; render();
  };
  const tabs = [['week', '周'], ['month', '月'], ['year', '年']];
  return h('div', {},
    headerSub('回顾', r.title),
    h('div', { class: 'segmented' }, tabs.map(([kk, v]) => h('a', { class: `seg${k === kk ? ' on' : ''}`, href: `#/report?k=${kk}&d=${q.d || dayKey()}` }, v))),
    h('div', { class: 'period-nav' },
      h('a', { class: 'icon-btn', href: `#/report?k=${k}&d=${r.prev}`, 'aria-label': '上一段' }, '‹'),
      h('b', { class: 'grow center' }, r.title),
      r.next <= dayKey() ? h('a', { class: 'icon-btn', href: `#/report?k=${k}&d=${r.next}`, 'aria-label': '下一段' }, '›') : h('span', { class: 'icon-btn ghost' })),
    h('div', { class: 'card letter' },
      h('h3', {}, icon('sparkle', 'i'), ' 写给你的话'),
      letter ? [h('p', { class: 'letter-text' }, letter.text), letter.research ? [h('h3', {}, '科研回顾'), h('p', { class: 'letter-text' }, letter.research)] : null,
        h('button', { class: 'link small', onclick: write, disabled: letterBusy[r.key] }, letterBusy[r.key] ? '正在写……' : '重新写')]
        : s.recorded < 2 ? h('p', { class: 'muted small' }, '这段时间记得太少，先不写。')
          : h('button', { class: 'secondary', onclick: write, disabled: letterBusy[r.key] }, letterBusy[r.key] ? 'DeepSeek 正在写……' : '请 DeepSeek 写一段')),
    h('div', { class: 'card' }, h('div', { class: 'stat-grid' }, tiles.map(([a, b]) => stat(a, b))),
      s.bestDay ? h('p', { class: 'small' }, `心情最好的一天：${dayLabel(s.bestDay)}${d.days[s.bestDay].note ? `，「${d.days[s.bestDay].note}」` : ''}`) : null,
      s.habits ? h('p', { class: 'small good-text' }, `养成了 ${s.habits} 个新习惯。`) : null),
    k === 'week' ? goalWeekCard(r.from) : null,
    s.notes.length ? h('div', { class: 'card' }, h('h3', {}, '每天的一句话'), s.notes.slice(-31).map((x) => h('div', { class: 'small night-note' }, h('span', { class: 'muted' }, `${x.day.slice(5).replace('-', '/')} · ${x.mood || '-'} 分　`), x.note))) : null,
    s.did.length && k !== 'year' ? h('div', { class: 'card' }, h('h3', {}, '科研'), s.did.map((x) => h('div', { class: 'small night-note' }, h('span', { class: 'muted' }, `${x.day.slice(5).replace('-', '/')}　`), x.did))) : null);
}
// 周报里：想做到的事这周做了什么、现在到哪了
function goalWeekCard(mon) {
  const d = store.data;
  const active = d.goals.filter((g) => g.status === 'active');
  const did = goalWeekDone(d, mon);
  if (!active.length && !did.length) return null;
  return h('div', { class: 'card' }, h('h3', {}, '想做到的事'),
    active.map((g) => h('a', { class: 'small block', href: `#/goal/${g.id}` }, goalLine(g))),
    did.length ? [h('p', { class: 'small good-text' }, `这周做了 ${did.length} 件：`), did.map((x) => h('div', { class: 'small night-note' }, h('span', { class: 'muted' }, `${x.goal}　`), x.text))] : null);
}
const LETTER_SYSTEM = '你是一位温暖、真诚的朋友，帮一位博士生回顾他的一段生活。他在用心学着照顾自己：护肤、祷告（他是基督徒）、运动、练英语。'
  + '用中文大白话写，160–260 字，分两三段。先说看到的好的地方（要具体，引用他的数字或他写的话），再温和地说一两个可以留意的规律，最后一句鼓励。'
  + '不说教，不评判，不用「你应该」，不夸张，不制造焦虑。没做到的事轻轻带过或者不提。只能说「常常一起出现」，不要下因果结论。';

function summaryText(s) {
  const f = (v) => (v === null ? '没记' : Math.round(v * 10) / 10);
  return [
    `记录了 ${s.recorded}/${s.days} 天。心情平均 ${f(s.mood)}（1–10），精力 ${f(s.energy)}（1–5），压力 ${f(s.stress)}（1–5），平均睡 ${f(s.sleep)} 小时。`,
    `护肤都做完 ${s.careDays} 天，洗澡 ${s.showers} 次，运动 ${s.sports} 次（${s.sportMinutes} 分钟${s.km ? `，${Math.round(s.km * 10) / 10} 公里` : ''}），咖啡奶茶茶 ${s.drinks} 杯，祷告 ${s.prayers} 晚，读经 ${s.reads} 次，英语 ${s.english} 次，生病 ${s.sick} 次，新养成习惯 ${s.habits} 个。`,
    s.visits.length ? `去过：${s.visits.map((v) => `${v.name}${v.score ? `（${v.score} 分）` : ''}`).join('、')}。` : '',
    s.notes.length ? `每天的一句话：${s.notes.map((x) => `${x.day.slice(5)} ${x.mood || '-'}分 ${x.note}`).join('；')}` : '',
    s.did.length ? `科研：${s.did.map((x) => `${x.day.slice(5)} ${x.did}`).join('；')}` : '',
  ].filter(Boolean).join('\n');
}

let aiCache = null;
async function aiConfig() {
  if (aiCache?.key) return aiCache;
  const inv = readJson('inventory-settings');
  const owner = (settings.repo || DEFAULT_REPO).split('/')[0];
  const g = new GitHub({ token: inv.token || settings.token, repo: inv.repo || `${owner}/inventory-data` });
  try { aiCache = JSON.parse(await g.readText('config/ai.json', 'main'))?.deepseek || {}; } catch { aiCache = {}; }
  return aiCache;
}

// 问问我的记录：聊天只在内存里，不存
const askState = { messages: [], busy: false, draft: '' };
const ASK_SYSTEM = '你是一位温暖、聪明的朋友，帮他从自己的生活记录里找答案。下面是他最近的记录（每天一行）。'
  + '回答用中文大白话，先直接回答，再用记录里的具体日子和数字说明；不确定就说不确定，不要编；只能说「常常一起出现」，不下因果结论。'
  + '不说教、不评判，语气温和，最后可以给一个很小、很容易做到的建议。涉及身体不舒服要提醒他看医生。'
  + '返回 JSON：{"answer": "回答"}';
function recordContext() {
  const d = store.data;
  const today = dayKey();
  const lines = [];
  for (const day of rangeDays(addDays(today, -59), today)) {
    const r = d.days[day] || {};
    const ev = eventsOn(d, day);
    const parts = [
      r.mood ? `心情${r.mood}` : '', r.energy ? `精力${r.energy}` : '', r.stress ? `压力${r.stress}` : '',
      r.sleep?.bed ? `睡${r.sleep.bed}-${r.sleep.wake || '?'}` : '',
      ev.some((e) => e.type === 'shower') ? '洗澡' : '',
      ev.filter((e) => e.type === 'sport').map((e) => `运动${e.kind}${e.minutes ? `${e.minutes}分` : ''}`).join(' '),
      ev.filter((e) => e.type === 'drink').map((e) => `${e.kind}@${hm(e.at)}`).join(' '),
      careFullDay(d, day) ? '护肤做完' : Object.keys(r.care || {}).length ? '护肤做了一部分' : '',
      r.prayer?.night ? '祷告' : '', r.read !== undefined ? '读经' : '',
      r.note ? `「${r.note}」` : '', r.did ? `科研:${r.did}` : '', r.planDone ? `计划${{ yes: '做到', part: '部分', no: '没做' }[r.planDone]}` : '',
    ].filter(Boolean);
    if (parts.length) lines.push(`${day} ${parts.join('，')}`);
  }
  const sick = (d.sick.history || []).slice(-5).map((x) => `${x.start}~${x.end} ${SICK_KINDS[x.kind].name}`).join('；');
  // 小记和日常生活完全分开：从来不发
  return `今天 ${today}。\n${lines.join('\n') || '（最近没什么记录）'}${sick ? `\n生病：${sick}` : ''}`;
}
async function askRecords(question) {
  askState.messages.push({ role: 'me', text: question });
  askState.busy = true; render();
  try {
    const cfg = await aiConfig();
    const history = askState.messages.slice(0, -1).slice(-6).map((m) => ({ role: m.role === 'me' ? 'user' : 'assistant', content: m.role === 'me' ? m.text : JSON.stringify({ answer: m.text }) }));
    const out = await askJson(cfg, `${ASK_SYSTEM}\n\n${recordContext()}`, question, { history });
    askState.messages.push({ role: 'ai', text: String(out.answer || '（没有回答）') });
  } catch (e) {
    askState.messages.push({ role: 'ai', text: e.message, error: true });
  }
  askState.busy = false; render();
  window.scrollTo(0, document.body.scrollHeight);
}
function askView() {
  const input = h('textarea', { rows: 1, placeholder: '比如：我最近为什么总是累？', 'aria-label': '问题' });
  input.value = askState.draft;
  input.addEventListener('input', () => { askState.draft = input.value; });
  const send = () => { const v = input.value.trim(); if (!v || askState.busy) return; askState.draft = ''; askRecords(v); };
  const examples = ['我最近为什么总是累？', '我状态最好的那几天有什么共同点？', '咖啡对我的睡眠有影响吗？', '这个月我做得最好的是什么？'];
  return h('div', {},
    headerSub('问问我的记录', 'DeepSeek 读你最近 60 天的记录'),
    askState.messages.length ? null : h('div', { class: 'chips' }, examples.map((x) => h('button', { type: 'button', class: 'chip', onclick: () => askRecords(x) }, x))),
    h('div', { class: 'chat' }, askState.messages.map((m) => h('div', { class: `msg ${m.role}${m.error ? ' error-msg' : ''}` }, m.text)),
      askState.busy ? h('div', { class: 'msg ai thinking' }, '正在翻你的记录……') : null),
    h('div', { class: 'chat-input' }, input, h('button', { onclick: send, disabled: askState.busy }, '问')));
}

// ---------- 生病 ----------
// 一次生病 = sick.current：{ id, kind, start, temps: [{ at, t }], meds: [{ at, item, name }], water: { 日期: 杯 }, done: { 日期: { 第几项: true } },
//   gut: { 日期: { d: 拉, v: 吐 } }, suspects: [文字], end?, how? }。好了以后移进 sick.history。

const SICK_HELP = [
  ['生病模式', [
    '不舒服了在「今天」最下面点「我不舒服」，选感冒、发烧、肠胃。首页最上面会一直有一张生病卡片，运动先停。',
    '这一页：量了体温就记，喝一杯水点一下，今天有哪些症状点一下，要做的事做了就勾（预案里没有的，在下面「还做了」里加）。感冒时体温到 37.3°C 会问你要不要切到发烧模式。',
    '吃药：药从物品档案里读（药品急救类）。点「吃了」会记下时间，算出下次最早几点能吃；第一次用某个药，点「说明书」把一次多少、几小时一次、一天最多几次抄进来。',
    '同一种成分的两个药（比如两种感冒药里都有对乙酰氨基酚）一起吃会提醒你。抗生素、激素这类标着「医生判断」。',
    '「什么时候去医院」一直在页面上；你记的体温、天数到了会变红。',
    '好了点最下面的「好了」，勾一下这次什么管用，存进「生病手册」。之后两天是恢复期：运动先缓缓，早点睡。',
  ]],
  ['攒经验', [
    '记得越多，下次越有数：再生同样的病，最上面「以前的经验」会告诉你以前几天好、感冒有几次转成了发烧、什么管用、症状最像的那一次是怎么好的。',
    '以前觉得管用、预案里还没有的，可以一键加进预案。',
  ]],
  ['说明', ['这里写的是常识，不是医嘱。吃药以药盒上的说明书和医生说的为准。拿不准就去校医院。']],
  ['提醒', ['生病的时候白天大概每 2 小时提醒一次喝水；发烧时也提醒量体温（在「设置」开启推送）。']],
];


function startSickSheet() {
  const close = openSheet({
    title: '哪里不舒服',
    body: h('div', { class: 'group' }, Object.entries(SICK_KINDS).map(([k, v]) => cell({ title: `${v.icon} ${v.name}`, onclick: () => { close(); startSick(k); } }))),
    confirmText: null, cancelText: '取消',
  });
}
function startSick(kind) {
  saveRender(`生病：${SICK_KINDS[kind].name}`, (data) => {
    data.sick.current = { id: newId('sk'), kind, start: dayKey(), temps: [], meds: [], water: {}, done: {}, gut: {}, suspects: [] };
  }).then((ok) => { if (ok) { toast('好好休息。'); go('#/sick'); } });
}

// 换季预防：每天查一次天气（Open-Meteo，不用密钥），存在 localStorage
const WEATHER_KEY = 'life-weather';
// 换季：要降温了 / 温差大，返回一行字（没有就 null）
function seasonAlert() {
  const city = store.data.settings.city;
  if (!city?.lat) return null;
  const cached = readJson(WEATHER_KEY);
  if (cached.day !== dayKey() || cached.city !== city.name) {
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}&daily=temperature_2m_max,temperature_2m_min&timezone=Asia%2FShanghai&forecast_days=5`)
      .then((r) => r.json()).then((j) => {
        const daily = j.daily.time.map((date, i) => ({ date, min: j.daily.temperature_2m_min[i], max: j.daily.temperature_2m_max[i] }));
        writeJson(WEATHER_KEY, { day: dayKey(), city: city.name, daily });
        if (currentPath() === '/') render();
      }).catch(() => {});
    return null;
  }
  const w = seasonWarning(cached.daily);
  return w ? `${w.kind === 'drop' ? '要降温了' : '早晚温差大'}：${w.text}，多穿一件` : null;
}

// 物品档案里的药（药品急救类，缓存 5 分钟）
const medCache = { at: 0, items: null, error: '' };
async function loadMeds() {
  if (medCache.items && Date.now() - medCache.at < 300000) return;
  const inv = readJson('inventory-settings');
  const owner = (settings.repo || DEFAULT_REPO).split('/')[0];
  const g = new GitHub({ token: inv.token || settings.token, repo: inv.repo || `${owner}/inventory-data` });
  try {
    const data = JSON.parse(await g.readText('inventory.json', 'main'));
    const locs = Object.fromEntries((data.locations || []).map((l) => [l.id, l.name]));
    medCache.items = (data.items || []).filter((i) => !i.archived && (i.tags || []).includes('药品急救'))
      .map((i) => ({ id: i.id, name: i.name, where: (locs[i.location] || '').split(' ')[0], qty: i.quantity, expires: i.fields?.['保质期'] || '', left: i.fields?.['剩余'] || '' }));
    medCache.error = '';
  } catch (e) {
    medCache.items = [];
    medCache.error = e.message;
  }
  medCache.at = Date.now();
}
// 保质期「2027-08」「2026-12-15」→ 过期了 / 两个月内过期
function expiryNote(s) {
  if (!s) return '';
  const end = /^\d{4}-\d{2}$/.test(s) ? `${s}-28` : s;
  const left = daysBetween(dayKey(), end);
  if (Number.isNaN(left)) return '';
  return left < 0 ? '已经过期' : left <= 60 ? `${left} 天后过期` : '';
}
const KIND_USE = { cold: /感冒|退烧|咳嗽|流感/, fever: /退烧|感冒|流感/, gut: /拉肚子|消化|积食|补水/, other: /./ };

function sickView() {
  const d = store.data;
  const ep = d.sick.current;
  const today = dayKey();
  if (!ep) {
    return h('div', {},
      headerSub('生病', '现在没有生病', helpButton('生病模式怎么用', SICK_HELP)),
      h('div', { class: 'card' }, h('p', {}, '不舒服了点一下，网页带着你一步一步来。'),
        h('div', { class: 'group' }, Object.entries(SICK_KINDS).map(([k, v]) => cell({ title: `${v.icon} ${v.name}`, onclick: () => startSick(k) })))),
      h('a', { class: 'button secondary wide', href: '#/sick/book' }, '生病手册、预案和药箱'));
  }
  const ts = tempStats(ep);
  const nth = daysBetween(ep.start, today) + 1;
  const switchTo = (kind) => saveRender(`生病：换成${SICK_KINDS[kind].name}`, (data) => switchSickKind(data, kind));
  return h('div', {},
    headerSub(`${SICK_KINDS[ep.kind].icon} ${SICK_KINDS[ep.kind].name}`, `第 ${nth} 天 · 从 ${ep.start.slice(5).replace('-', '/')} 开始`, helpButton('生病模式怎么用', SICK_HELP)),
    h('p', { class: 'cheer' }, nth === 1 ? '今天只要好好休息。' : '会好起来的。'),
    ep.kind === 'cold' && ts.feverNow ? h('div', { class: 'banner warn' }, `体温 ${ts.last.t}°C，发烧了。`, h('button', { class: 'small', style: 'margin-left:8px', onclick: () => switchTo('fever') }, '切到发烧模式')) : null,
    ts.normal24 ? h('div', { class: 'card good-card' }, h('p', {}, '体温正常一天了。是不是好了？'), h('button', { onclick: endSickSheet }, '好了')) : null,
    lessonsCard(ep, today),
    redFlagCard(ep, ts),
    tempCard(ep, ts),
    symptomCard(ep, today),
    waterCard(ep, today),
    planCardSick(ep, today),
    ep.kind === 'gut' ? gutCard(ep, today) : null,
    medsCard(ep),
    h('div', { class: 'actions' },
      h('button', { class: 'grow', onclick: endSickSheet }, '好了'),
      h('button', { class: 'secondary', onclick: startSickSheet2 }, '换一种')),
    h('a', { class: 'small', href: '#/sick/book' }, '生病手册、预案和药箱 ›'));
}
// 换种类（比如感冒转成发烧）记在 path 里，以后能算出「感冒几次里有几次转成发烧、第几天」
function switchSickKind(data, kind) {
  const ep = data.sick.current;
  if (!ep || ep.kind === kind) return false;
  ep.path ||= [{ day: ep.start, kind: ep.kind }];
  ep.path.push({ day: dayKey(), kind });
  ep.kind = kind;
}
function startSickSheet2() {
  const close = openSheet({
    title: '换成', body: h('div', { class: 'group' }, Object.entries(SICK_KINDS).map(([k, v]) => cell({ title: `${v.icon} ${v.name}`, onclick: () => { close(); saveRender(`生病：换成${v.name}`, (data) => switchSickKind(data, k)); } }))),
    confirmText: null, cancelText: '取消',
  });
}

function redFlagCard(ep, ts) {
  const today = dayKey();
  const gutToday = ep.gut?.[today] || {};
  const hot = new Set();
  if (ep.kind === 'fever' || ep.kind === 'cold') {
    if (ts.max >= 39) hot.add(0);
    if (ts.feverDays > 3) hot.add(1);
  }
  if (ep.kind === 'gut' && (gutToday.d || 0) + (gutToday.v || 0) >= 6) hot.add(0);
  if (ep.kind === 'gut' && daysBetween(ep.start, today) >= 2) hot.add(4);
  return h('div', { class: `card${hot.size ? ' alert' : ''}` },
    h('h3', {}, '什么时候必须去医院'),
    hot.size ? h('p', { class: 'warn small' }, '你记的情况已经到了下面标红的那条，去看医生吧。') : null,
    h('ul', { class: 'small flags' }, RED_FLAGS[ep.kind].map((x, i) => h('li', { class: hot.has(i) ? 'warn' : '' }, x))),
    h('a', { class: 'small', href: 'tel:120' }, '急救 120'));
}

function tempCard(ep, ts) {
  const input = h('input', { inputmode: 'decimal', placeholder: '比如 37.6', 'aria-label': '体温', class: 'temp-input' });
  const add = () => {
    const t = Number(input.value);
    if (!(t >= 34 && t <= 43)) { toast('体温填 34 到 43 之间的数', 'error'); return; }
    saveRender(`体温 ${t}`, (data) => { data.sick.current.temps.push({ at: nowIso(), t }); })
      .then((ok) => ok && toast(t >= 39 ? '烧得比较高，按说明书吃退烧药、多喝水，看看下面什么时候要去医院。' : t >= FEVER_FROM ? '记好了。多喝水，躺下休息。' : '体温正常，很好。'));
  };
  const every = ep.kind === 'fever' ? 4 : 12;
  const next = ts.last ? new Date(new Date(ts.last.at).getTime() + every * 3600000) : null;
  return h('div', { class: 'card' },
    h('h3', {}, '体温'),
    h('div', { class: 'inline-add' }, input, h('button', { class: 'small', onclick: add }, '记')),
    ts.temps.length ? tempChart(ts.temps) : null,
    h('p', { class: 'muted small' }, ts.last ? `${ep.kind === 'fever' ? '每 4 小时' : '早晚各'}量一次${next ? `，下次大概 ${hm(next.toISOString())}` : ''}。最高 ${ts.max}°C。` : '先量一次。'));
}
function tempChart(temps) {
  const NS = 'http://www.w3.org/2000/svg';
  const W = 320; const H = 110; const pad = 18;
  const list = temps.slice(-12);
  const lo = Math.min(36, ...list.map((x) => x.t)); const hi = Math.max(39, ...list.map((x) => x.t));
  const x = (i) => pad + (list.length === 1 ? (W - 2 * pad) / 2 : (i * (W - 2 * pad)) / (list.length - 1));
  const y = (t) => 8 + ((hi - t) / (hi - lo)) * (H - 30);
  const el = (tag, a, text) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(a)) e.setAttribute(k, v); if (text) e.textContent = text; return e; };
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': '体温曲线' });
  svg.append(el('line', { x1: 0, x2: W, y1: y(FEVER_FROM), y2: y(FEVER_FROM), style: 'stroke:var(--amber)', 'stroke-dasharray': '4 4' }));
  svg.append(el('text', { x: W - 2, y: y(FEVER_FROM) - 3, 'text-anchor': 'end', class: 'chart-label' }, '37.3'));
  svg.append(el('polyline', { points: list.map((p, i) => `${x(i)},${y(p.t)}`).join(' '), fill: 'none', style: 'stroke:var(--accent)', 'stroke-width': 2 }));
  list.forEach((p, i) => {
    svg.append(el('circle', { cx: x(i), cy: y(p.t), r: 3, style: `fill:${p.t >= FEVER_FROM ? 'var(--danger)' : 'var(--accent)'}` }));
    svg.append(el('text', { x: x(i), y: y(p.t) - 6, 'text-anchor': 'middle', class: 'chart-num' }, String(p.t)));
    svg.append(el('text', { x: x(i), y: H - 4, 'text-anchor': 'middle', class: 'chart-label' }, hm(p.at)));
  });
  return svg;
}

const WATER_GOAL = 8;
function waterCard(ep, today) {
  const n = ep.water?.[today] || 0;
  const add = (k) => saveRender('喝水', (data) => { const w = (data.sick.current.water ||= {}); w[today] = Math.max(0, (w[today] || 0) + k); })
    .then((ok) => ok && k > 0 && n + 1 === WATER_GOAL && toast('今天的水喝够了。'));
  return h('div', { class: 'card' },
    h('h3', {}, '喝水'),
    h('div', { class: 'water' },
      h('div', { class: 'cups', 'aria-label': `喝了 ${n} 杯` }, Array.from({ length: Math.max(WATER_GOAL, n) }, (_, i) => h('span', { class: i < n ? 'on' : '' }))),
      h('span', { class: 'small' }, `${n} / ${WATER_GOAL} 杯`)),
    h('div', { class: 'actions' }, h('button', { onclick: () => add(1) }, '喝了一杯'), n ? h('button', { class: 'link small', onclick: () => add(-1) }, '点多了') : null),
    h('p', { class: 'muted small' }, ep.kind === 'gut' ? '肠胃不舒服：小口小口地喝，温的。' : '一杯大概 250 毫升，温水最好。'));
}

function planCardSick(ep, today) {
  const plan = store.data.sick.plans[ep.kind] || [];
  const items = [...new Set([...plan, ...(ep.extra || [])])];
  const done = ep.done?.[today] || {};
  const isDone = (x) => Boolean(done[x] || (plan.indexOf(x) >= 0 && done[plan.indexOf(x)]));
  const toggle = (x) => saveRender(`生病：${x}`, (data) => {
    const dd = ((data.sick.current.done ||= {})[today] ||= {});
    const i = plan.indexOf(x);
    if (isDone(x)) { delete dd[x]; if (i >= 0) delete dd[i]; } else dd[x] = true;
  });
  const input = h('input', { placeholder: '还做了别的？比如「喝姜汤」', 'aria-label': '还做了' });
  const add = () => {
    const t = input.value.trim();
    if (!t) return;
    saveRender(`生病：${t}`, (data) => {
      const ep2 = data.sick.current;
      ep2.extra ||= [];
      if (!ep2.extra.includes(t) && !plan.includes(t)) ep2.extra.push(t);
      ((ep2.done ||= {})[today] ||= {})[t] = true;
    });
  };
  return h('div', { class: 'card' },
    h('div', { class: 'rec-top' }, h('h3', {}, '今天要做'), h('a', { class: 'small', href: '#/sick/book' }, '改预案')),
    h('div', { class: 'chips' }, items.map((x) => h('button', {
      type: 'button', class: `chip check${isDone(x) ? ' on' : ''}`, 'aria-pressed': String(isDone(x)), onclick: () => toggle(x),
    }, isDone(x) ? icon('check', 'i tiny') : null, x))),
    h('div', { class: 'inline-add' }, input, h('button', { class: 'small secondary', onclick: add }, '加')),
    h('p', { class: 'muted small' }, '做了就点一下。好了的时候勾哪些管用，下次生病就知道先做什么。'));
}

// 今天有哪些症状：每天点一下（可以自己加）
function symptomCard(ep, today) {
  const mine = ep.sym?.[today] || [];
  const yest = ep.sym?.[addDays(today, -1)] || [];
  const all = [...new Set([...(SYMPTOMS[ep.kind] || SYMPTOMS.other), ...sickSymptoms(ep)])];
  const toggle = (x) => saveRender(`症状：${x}`, (data) => {
    const sym = (data.sick.current.sym ||= {});
    const l = (sym[today] ||= []);
    const i = l.indexOf(x);
    if (i >= 0) l.splice(i, 1); else l.push(x);
    if (!l.length) delete sym[today];
  });
  const input = h('input', { placeholder: '别的症状', 'aria-label': '别的症状' });
  return h('div', { class: 'card' },
    h('h3', {}, '今天哪里不舒服'),
    h('div', { class: 'chips' }, all.map((x) => h('button', { type: 'button', class: `chip check${mine.includes(x) ? ' on' : ''}`, 'aria-pressed': String(mine.includes(x)), onclick: () => toggle(x) }, x))),
    h('div', { class: 'inline-add' }, input, h('button', { class: 'small secondary', onclick: () => { const t = input.value.trim(); if (t && !mine.includes(t)) toggle(t); } }, '加')),
    yest.length ? h('p', { class: 'muted small' }, `昨天：${yest.join('、')}`) : null);
}

// 以前的经验：同一种病以前几次、几天好、感冒转发烧、什么管用、最像的那一次
function lessonsCard(ep, today) {
  const d = store.data;
  const name = SICK_KINDS[ep.kind].name;
  const ls = sickLessons(d.sick.history, ep.kind, d.sick.plans);
  if (!ls) {
    return h('div', { class: 'card soft' }, h('p', { class: 'small' },
      `这是第一次在这里记${name}。每天点一下症状、做了什么，好了的时候勾一下什么管用——下次再这样，这里会告诉你上次是怎么好的。`));
  }
  const nth = daysBetween(ep.start, today) + 1;
  const sim = similarSick(d.sick.history, ep);
  const missing = planMissing(ls, d.sick.plans[ep.kind]);
  const tf = ls.toFever;
  return h('div', { class: 'card lessons' },
    h('h3', {}, '以前的经验'),
    h('p', { class: 'small' }, `以前${name} ${ls.n} 次，平均 ${ls.avgDays} 天好${ls.maxTemp ? `，最高烧到 ${ls.maxTemp}°C` : ''}。${nth > 1 && nth <= Math.ceil(ls.avgDays) ? `今天第 ${nth} 天，快了。` : ''}`),
    ep.kind === 'cold' && tf?.turned ? h('p', { class: 'small fever-hint' },
      `${tf.n} 次感冒里有 ${tf.turned} 次后来发烧了${tf.day ? `，一般在第 ${tf.day} 天` : ''}。${!tf.day || nth <= tf.day ? '这两天早晚都量一下体温，泡脚、早睡别落下。' : ''}`) : null,
    ls.helped.length ? [h('div', { class: 'label-sm' }, '以前觉得管用的'),
      h('div', { class: 'chips' }, ls.helped.slice(0, 8).map((x) => h('span', { class: 'chip on static' }, `${x.text}${x.of > 1 ? ` ${x.n}/${x.of}` : ''}`)))] : null,
    missing.length ? h('button', { class: 'small secondary', onclick: () => saveRender('预案：加上管用的', (data) => {
      const pl = (data.sick.plans[ep.kind] ||= []);
      for (const x of missing) if (!pl.includes(x)) pl.push(x);
    }).then((ok) => ok && toast('加进预案了。')) }, `把「${missing.slice(0, 3).join('、')}」加进预案`) : null,
    sim ? h('div', { class: 'similar' },
      h('div', { class: 'label-sm' }, `最像的一次：${sim.ep.start.slice(5).replace('-', '/')}（也是${sim.common.join('、')}）`),
      h('p', { class: 'small' }, [
        `${daysBetween(sim.ep.start, sim.ep.end) + 1} 天好`,
        sickKinds(sim.ep).length > 1 ? `中间${sickKinds(sim.ep).map((k) => SICK_KINDS[k].name).join('→')}` : '',
        (sim.ep.helped || []).length ? `管用：${sim.ep.helped.join('、')}` : '',
      ].filter(Boolean).join(' · ')),
      sim.ep.how ? h('p', { class: 'small muted' }, `那次写的：${sim.ep.how}`) : null)
      : ls.hows[0] ? h('p', { class: 'small muted' }, `上次写的：${ls.hows[0].how}`) : null);
}

// 肠胃：记次数；从账本里看昨天吃了什么，点「可能是这个」
const foodCache = { day: '', list: null };
function gutCard(ep, today) {
  const g = ep.gut?.[today] || {};
  const bump = (k) => saveRender('肠胃：记一次', (data) => { const x = ((data.sick.current.gut ||= {})[today] ||= {}); x[k] = (x[k] || 0) + 1; });
  const box = h('div', { class: 'chips' });
  const draw = () => {
    const list = foodCache.list || [];
    box.replaceChildren(...(list.length ? list.map((f) => {
      const on = ep.suspects.includes(f.text);
      return h('button', { type: 'button', class: `chip check${on ? ' on' : ''}`, onclick: () => saveRender('肠胃：可能是这个', (data) => {
        const s = data.sick.current.suspects;
        const i = s.indexOf(f.text);
        if (i >= 0) s.splice(i, 1); else s.push(f.text);
      }) }, f.text);
    }) : [h('p', { class: 'muted small' }, foodCache.list ? '账本里昨天和今天没有吃饭的记录。' : '正在看账本……')]));
  };
  if (foodCache.day !== today) {
    foodCache.day = today;
    foodCache.list = null;
    readFood(today).then((list) => { foodCache.list = list; if (box.isConnected) draw(); });
  }
  draw();
  return h('div', { class: 'card' },
    h('h3', {}, '今天'),
    h('div', { class: 'actions' },
      h('button', { class: 'secondary', onclick: () => bump('d') }, `拉肚子 ${g.d || 0} 次`),
      h('button', { class: 'secondary', onclick: () => bump('v') }, `吐了 ${g.v || 0} 次`)),
    h('h3', {}, '可能是吃了什么'),
    h('p', { class: 'muted small' }, '从账本里找的昨天和今天吃的，觉得可疑的点一下。攒几次，「生病手册」里能看出规律。'),
    box);
}
async function readFood(today) {
  const lg = readJson('ledger-settings');
  const owner = (settings.repo || DEFAULT_REPO).split('/')[0];
  const g = new GitHub({ token: lg.token || settings.token, repo: lg.repo || `${owner}/finance-data` });
  try {
    const f = JSON.parse(await g.readText('finance.json', 'main'));
    const food = new Set(f.categories.filter((c) => c.group === 'food').map((c) => c.id));
    const name = Object.fromEntries(f.categories.map((c) => [c.id, c.name]));
    const days = [addDays(today, -1), today];
    return f.tx.filter((t) => t.type === 'expense' && food.has(t.category) && days.includes(t.date))
      .map((t) => ({ text: `${t.date === today ? '今天' : '昨天'}${name[t.category] || ''}${t.note ? `：${t.note.slice(0, 20)}` : ''}` }))
      .filter((x, i, arr) => arr.findIndex((y) => y.text === x.text) === i);
  } catch {
    return [];
  }
}

function medsCard(ep) {
  const d = store.data;
  const box = h('div', {}, h('p', { class: 'muted small' }, '正在读物品档案里的药……'));
  const draw = () => {
    if (medCache.error) { box.replaceChildren(h('p', { class: 'muted small' }, `读不到物品档案：${medCache.error}`)); return; }
    const use = KIND_USE[ep.kind];
    const items = (medCache.items || []).map((m) => ({ ...m, info: medInfo(m.name) }));
    const fit = items.filter((m) => use.test(m.info.use) && !m.info.rx);
    const rest = items.filter((m) => !fit.includes(m));
    box.replaceChildren(...[
      ...fit.map((m) => medRow(ep, m)),
      fit.length ? null : h('p', { class: 'muted small' }, '物品档案里没有对症的药。'),
      rest.length ? h('details', { class: 'inner' }, h('summary', {}, `其他药（${rest.length}）`), rest.map((m) => medRow(ep, m))) : null,
    ].filter(Boolean));
  };
  loadMeds().then(() => { if (box.isConnected) draw(); });
  if (medCache.items) draw();
  const taken = ep.meds.slice().sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8);
  return h('div', { class: 'card' },
    h('h3', {}, '吃药'),
    h('p', { class: 'muted small' }, '以药盒上的说明书为准。拿不准就问医生或药店。'),
    box,
    taken.length ? [h('h3', { style: 'margin-top:12px' }, '吃过的'), taken.map((m) => h('div', { class: 'event-row' },
      h('span', { class: 'muted small ev-time' }, hm(m.at)), h('span', { class: 'grow small' }, m.name),
      h('button', { class: 'link small', onclick: () => saveUndoable('删掉吃药记录', (data) => { data.sick.current.meds = data.sick.current.meds.filter((x) => x.at !== m.at || x.item !== m.item); }, '删掉了').then(render).catch(() => {}) }, '删掉')))] : null);
}
function medRow(ep, m) {
  const cfg = store.data.sick.meds[m.id] || {};
  const st = doseStatus(ep, m.id, cfg);
  const exp = expiryNote(m.expires);
  const line = [
    m.info.use, m.where,
    cfg.dose ? `${cfg.dose}${cfg.gapHours ? `，${cfg.gapHours} 小时一次` : ''}${cfg.perDay ? `，一天最多 ${cfg.perDay} 次` : ''}` : '还没抄说明书',
  ].filter(Boolean).join(' · ');
  const status = st.next ? `下次最早 ${hm(st.next.toISOString())}` : st.last ? `上次 ${hm(st.last.at)}` : '';
  return h('div', { class: 'med-row' },
    h('div', { class: 'grow' },
      h('b', {}, m.name), m.info.rx ? h('span', { class: 'badge warn' }, '医生判断') : null, exp ? h('span', { class: 'badge warn' }, exp) : null,
      h('span', { class: 'muted small block' }, line),
      status || st.left !== null ? h('span', { class: `small block${st.next || st.left === 0 ? ' soon' : ''}` }, [status, st.left !== null ? `今天还能吃 ${st.left} 次` : ''].filter(Boolean).join(' · ')) : null),
    h('div', { class: 'med-actions' },
      h('button', { class: 'small', onclick: () => takeMed(ep, m, st) }, '吃了'),
      h('button', { class: 'link small', onclick: () => medConfigSheet(m) }, '说明书')));
}
function takeMed(ep, m, st) {
  const warns = [...medConflicts(ep, m.name, m.id)];
  if (m.info.rx) warns.unshift(`${m.name}：${m.info.use}。医生让你吃了再吃。`);
  if (st.next) warns.push(`按你抄的说明书，下次最早 ${hm(st.next.toISOString())} 才能吃。`);
  if (st.left === 0) warns.push('今天已经吃到说明书写的最多次数了。');
  if (expiryNote(m.expires) === '已经过期') warns.push('这盒药已经过期了，别吃。');
  const doIt = () => saveRender(`吃药：${m.name}`, (data) => { data.sick.current.meds.push({ at: nowIso(), item: m.id, name: m.name }); })
    .then((ok) => ok && toast('记好了。躺一会儿吧。'));
  if (!warns.length) return doIt();
  openSheet({ title: '先看一下', body: h('ul', { class: 'small flags' }, warns.map((w) => h('li', { class: 'warn' }, w))), confirmText: '还是记上', cancelText: '先不吃', onConfirm: doIt });
}
function medConfigSheet(m) {
  const cfg = store.data.sick.meds[m.id] || {};
  const dose = h('input', { value: cfg.dose || '', placeholder: '一次多少，比如「1 片」「1 袋」', 'aria-label': '一次多少' });
  const gap = h('input', { inputmode: 'decimal', value: cfg.gapHours || '', placeholder: '几小时一次（可以不填）', 'aria-label': '几小时一次' });
  const per = h('input', { inputmode: 'numeric', value: cfg.perDay || '', placeholder: '一天最多几次', 'aria-label': '一天最多几次' });
  const info = medInfo(m.name);
  openSheet({
    title: m.name,
    body: h('div', { class: 'form' },
      h('p', { class: 'small' }, info.use ? `管什么：${info.use}` : '', info.ingredients.length ? h('span', { class: 'block muted' }, `主要成分：${info.ingredients.join('、')}`) : null),
      h('p', { class: 'muted small' }, '照着药盒里的说明书抄：成人一次多少、一天几次。说明书写「一日 3 次」，一般就是 6–8 小时一次。'),
      dose, gap, per,
      m.left ? h('p', { class: 'muted small' }, `物品档案里记着：${m.left}${m.expires ? `，保质期 ${m.expires}` : ''}`) : null),
    confirmText: '存好',
    onConfirm: () => saveRender(`药箱：${m.name}`, (data) => {
      const x = { ...(dose.value.trim() ? { dose: dose.value.trim() } : {}), ...(Number(gap.value) > 0 ? { gapHours: Number(gap.value) } : {}), ...(Number(per.value) > 0 ? { perDay: Number(per.value) } : {}) };
      if (Object.keys(x).length) data.sick.meds[m.id] = x; else delete data.sick.meds[m.id];
    }),
  });
}

function endSickSheet() {
  const d = store.data;
  const ep = d.sick.current;
  const did = ep ? sickDid(ep, d.sick.plans) : [];
  const helped = new Set();
  const chips = h('div', { class: 'chips' });
  const draw = () => chips.replaceChildren(...did.map((x) => h('button', {
    type: 'button', class: `chip check${helped.has(x) ? ' on' : ''}`, 'aria-pressed': String(helped.has(x)),
    onclick: () => { if (helped.has(x)) helped.delete(x); else helped.add(x); draw(); },
  }, x)));
  draw();
  const how = h('textarea', { rows: 3, placeholder: '还有想对下次的自己说的？（可以不写）', 'aria-label': '怎么好的' });
  openSheet({
    title: '好了 🎉',
    body: [h('p', { class: 'small' }, '辛苦了。接下来两天是恢复期：运动先缓缓，早点睡。'),
      did.length ? [h('div', { class: 'label-sm' }, '这次什么管用？点一下'), chips] : null, how],
    confirmText: '好了',
    onConfirm: () => saveRender('生病：好了', (data) => {
      const cur = data.sick.current;
      if (!cur) return false;
      data.sick.history.push({ ...cur, end: dayKey(), ...(helped.size ? { helped: [...helped] } : {}), ...(how.value.trim() ? { how: how.value.trim() } : {}) });
      data.sick.current = null;
    }).then((ok) => { if (ok) { toast('好起来了，真好。'); go('#/'); } }),
  });
}

// 生病手册：每一种的经验、以前的每一次、预案
function sickBookView() {
  const d = store.data;
  const hist = d.sick.history.slice().reverse();
  const year = dayKey().slice(0, 4);
  const thisYear = d.sick.history.filter((x) => x.start.startsWith(year));
  const months = {};
  for (const x of d.sick.history) months[Number(x.start.slice(5, 7))] = (months[Number(x.start.slice(5, 7))] || 0) + 1;
  const suspects = {};
  for (const x of d.sick.history) for (const s of x.suspects || []) { const k = s.replace(/^(昨天|今天)/, ''); suspects[k] = (suspects[k] || 0) + 1; }
  const editPlan = (kind) => {
    const ta = h('textarea', { rows: 8, 'aria-label': '预案' });
    ta.value = (d.sick.plans[kind] || []).join('\n');
    openSheet({
      title: `${SICK_KINDS[kind].name}的预案`, body: [h('p', { class: 'muted small' }, '一行一件事。生病时会变成可以打勾的清单。你自己习惯的做法（比如喝姜汤）都可以加。'), ta], confirmText: '存好',
      onConfirm: () => saveRender('生病预案', (data) => { data.sick.plans[kind] = ta.value.split('\n').map((x) => x.trim()).filter(Boolean); }),
    });
  };
  const lessons = Object.keys(SICK_KINDS).map((k) => [k, sickLessons(d.sick.history, k, d.sick.plans)]).filter(([, l]) => l);
  return h('div', {},
    headerSub('生病手册', `${year} 年病了 ${thisYear.length} 次`, helpButton('生病手册', [['这一页', [
      '每次生病好了以后存在这里：几号到几号、什么症状、最高几度、做了什么、什么管用。',
      '「我的经验」把同一种病的每一次放在一起看：一般几天好、感冒有几次转成发烧、什么最管用。下次生病，生病页最上面也会显示。',
      '预案：每种情况你要做的事，生病时变成打勾清单。经验里管用的，可以一键加进来。',
    ]]])),
    d.sick.history.length ? h('div', { class: 'card' },
      h('div', { class: 'stat-grid' },
        stat(`${year} 年`, `${thisYear.length} 次`), stat('一共', `${d.sick.history.length} 次`),
        stat('平均几天好', `${Math.round(d.sick.history.reduce((a, x) => a + daysBetween(x.start, x.end) + 1, 0) / d.sick.history.length * 10) / 10} 天`),
        stat('上一次', `${relDay(d.sick.history[d.sick.history.length - 1].end)}好的`)),
      h('h3', {}, '每个月'), barChart(Array.from({ length: 12 }, (_, i) => ({ label: String(i + 1), v: months[i + 1] || 0 })), { title: '每个月生病几次', color: 'var(--danger)' }))
      : h('div', { class: 'card soft' }, h('p', { class: 'small' }, '还没有记录。下次不舒服时在生病页每天点一下症状、做了什么，好了勾一下什么管用，这里就开始攒你自己的经验。')),
    lessons.length ? [h('div', { class: 'section-title' }, '我的经验'), lessons.map(([k, l]) => h('div', { class: 'card lessons' },
      h('div', { class: 'rec-top' }, h('b', {}, `${SICK_KINDS[k].icon} ${SICK_KINDS[k].name}`), h('span', { class: 'muted small' }, `${l.n} 次 · 平均 ${l.avgDays} 天好`)),
      k === 'cold' && l.toFever?.n ? h('p', { class: 'small' }, l.toFever.turned ? `${l.toFever.n} 次里 ${l.toFever.turned} 次转成了发烧${l.toFever.day ? `，一般在第 ${l.toFever.day} 天` : ''}` : `${l.toFever.n} 次都没有发烧`) : null,
      l.maxTemp ? h('p', { class: 'small' }, `最高烧到 ${l.maxTemp}°C`) : null,
      l.symptoms.length ? h('p', { class: 'small' }, h('span', { class: 'muted' }, '常有：'), l.symptoms.slice(0, 5).map((x) => `${x.text}${x.n > 1 ? `×${x.n}` : ''}`).join('、')) : null,
      l.helped.length ? h('p', { class: 'small' }, h('span', { class: 'muted' }, '管用：'), l.helped.slice(0, 6).map((x) => `${x.text}（${x.n}/${x.of}）`).join('、'))
        : l.did.length ? h('p', { class: 'small' }, h('span', { class: 'muted' }, '做过：'), l.did.slice(0, 6).map((x) => x.text).join('、')) : null))] : null,
    h('div', { class: 'section-title' }, '预案'),
    h('div', { class: 'group' }, Object.entries(SICK_KINDS).map(([k, v]) => cell({ title: `${v.icon} ${v.name}`, sub: (d.sick.plans[k] || []).join('、'), onclick: () => editPlan(k) }))),
    Object.keys(suspects).length ? h('div', { class: 'card' }, h('h3', {}, '肠胃不舒服前吃过的'),
      Object.entries(suspects).sort((a, b) => b[1] - a[1]).map(([k, n]) => h('div', { class: 'small' }, `${k}${n > 1 ? ` · ${n} 次` : ''}`))) : null,
    hist.length ? h('div', { class: 'section-title' }, '以前的每一次') : null,
    hist.map((x) => {
      const ts = tempStats(x);
      const meds = [...new Set(x.meds.map((m) => m.name))];
      const sym = sickSymptoms(x);
      return h('div', { class: 'card' },
        h('b', {}, sickKinds(x).map((k) => `${SICK_KINDS[k].icon} ${SICK_KINDS[k].name}`).join(' → ')),
        h('span', { class: 'muted small' }, ` · ${x.start.slice(5).replace('-', '/')}–${x.end.slice(5).replace('-', '/')}，${daysBetween(x.start, x.end) + 1} 天`),
        sym.length ? h('p', { class: 'small' }, sym.join('、')) : null,
        h('p', { class: 'small' }, [ts.max ? `最高 ${ts.max}°C` : '', meds.length ? `吃了 ${meds.join('、')}` : ''].filter(Boolean).join(' · ') || '没记体温和吃药'),
        (x.helped || []).length ? h('p', { class: 'small' }, `管用：${x.helped.join('、')}`) : null,
        x.how ? h('p', { class: 'small muted' }, `写的：${x.how}`) : null);
    }));
}

// ---------- 难受的时候 ----------
// 像生病的预案：先呼吸 → 有多难受 → 哪一种 → 一件一件做 → 给你的话 → 现在呢。每一次记进 low.log，攒成「什么管用」。

const LOW_HELP = [
  ['这一页', [
    '难受的时候点「现在开始」，网页带着你一步一步来：先慢慢呼吸一分钟，然后选是哪一种难受，照着清单一件一件做。',
    '清单是你的预案，可以改成你自己知道管用的事。',
    '做完会问你现在好一点没有、哪件事管用。记得越多，下次越知道先做什么。',
    '「写给难受时的自己」：状态好的时候写一句，难受的时候会翻出来给你看。',
  ]],
  ['如果很难受', ['有伤害自己的念头、或者觉得撑不下去了，请马上打下面的热线，或者告诉身边的人。这不丢人，打电话是在照顾自己。']],
];
const lowState = { step: 0, kind: null, before: null, after: null, did: new Set(), helped: new Set(), words: 0, wordStart: null };
function resetLow() { Object.assign(lowState, { step: 0, kind: null, before: null, after: null, did: new Set(), helped: new Set(), words: 0, wordStart: null }); }

function hotlineCard() {
  return h('div', { class: 'card hotline' },
    h('h3', {}, '很难受、有伤害自己的念头时'),
    h('p', { class: 'small' }, '马上打电话，或者告诉身边的人。你不用一个人扛。'),
    HOTLINES.map((x) => h('div', { class: 'kv-row' }, h('span', { class: 'small' }, x.name), h('a', { href: `tel:${x.phone}` }, x.show || x.phone))));
}
function lowNoteSheet() {
  const ta = h('textarea', { rows: 4, placeholder: '比如「你上次也觉得过不去，后来都过去了。先去洗个热水澡。」', 'aria-label': '写给难受时的自己' });
  openSheet({
    title: '写给难受时的自己', body: [h('p', { class: 'muted small' }, '现在的你最了解那时候的你。写一句真心话。'), ta], confirmText: '存好',
    onConfirm: () => {
      const t = ta.value.trim();
      if (!t) return false;
      return saveRender('写给难受时的自己', (data) => { data.low.notes.push({ id: newId('ln'), text: t, at: nowIso() }); }).then((ok) => { if (ok) toast('存好了。'); return ok; });
    },
  });
}

function lowView() {
  const d = store.data;
  const lessons = Object.keys(LOW_KINDS).map((k) => [k, lowLessons(d.low.log, k)]).filter(([, l]) => l);
  const editPlan = (kind) => {
    const ta = h('textarea', { rows: 8, 'aria-label': '预案' });
    ta.value = (d.low.plans[kind] || []).join('\n');
    openSheet({
      title: `${LOW_KINDS[kind].name}的时候`, body: [h('p', { class: 'muted small' }, '一行一件事，写你知道对自己管用的。到时候会变成可以打勾的清单。'), ta], confirmText: '存好',
      onConfirm: () => saveRender('难受的预案', (data) => { data.low.plans[kind] = ta.value.split('\n').map((x) => x.trim()).filter(Boolean); }),
    });
  };
  const log = d.low.log.slice().reverse();
  return h('div', {},
    headerSub('难受的时候', '慢慢来', helpButton('难受的时候', LOW_HELP)),
    h('a', { class: 'button wide', href: '#/low/go', onclick: () => resetLow() }, '现在开始'),
    h('div', { class: 'card' },
      h('div', { class: 'rec-top' }, h('h3', {}, '写给难受时的自己'), h('button', { class: 'link small', onclick: lowNoteSheet }, '＋ 写一句')),
      d.low.notes.length ? d.low.notes.slice().reverse().map((n) => h('div', { class: 'low-note' },
        h('p', {}, n.text),
        h('div', { class: 'rec-top' }, h('span', { class: 'muted small' }, n.at.slice(0, 10)),
          h('button', { class: 'link small', onclick: () => saveUndoable('删掉一句', (data) => { data.low.notes = data.low.notes.filter((x) => x.id !== n.id); }, '删掉了').then(render).catch(() => {}) }, '删掉'))))
        : h('p', { class: 'muted small' }, '状态好的时候写一句给难受时的自己。到时候会翻出来给你看。')),
    lessons.length ? [h('div', { class: 'section-title' }, '以前的经验'), h('div', { class: 'card' }, lessons.map(([k, l]) => h('div', { class: 'low-lesson' },
      h('b', {}, `${LOW_KINDS[k].icon} ${LOW_KINDS[k].name}`), h('span', { class: 'muted small' }, ` · ${l.n} 次${l.better ? ` · 做完平均好了 ${l.better} 分` : ''}`),
      l.helped.length ? h('p', { class: 'small' }, `管用：${l.helped.slice(0, 5).map((x) => `${x.text}${x.n > 1 ? `×${x.n}` : ''}`).join('、')}`) : null)))] : null,
    h('div', { class: 'section-title' }, '我的预案'),
    h('div', { class: 'group' }, Object.entries(LOW_KINDS).map(([k, v]) => cell({ title: `${v.icon} ${v.name}`, sub: (d.low.plans[k] || []).join('、'), onclick: () => editPlan(k) }))),
    log.length ? [h('div', { class: 'section-title' }, '以前的每一次'), h('div', { class: 'card list-card' }, log.slice(0, 12).map((x) => h('div', { class: 'event-row' },
      h('span', { class: 'muted small ev-time' }, x.day.slice(5).replace('-', '/')),
      h('span', { class: 'grow small' }, `${LOW_KINDS[x.kind]?.name || ''}${x.note ? ` · ${x.note}` : ''}`),
      x.before && x.after ? h('span', { class: 'small' }, `${x.before} → ${x.after}`) : null)))] : null,
    hotlineCard());
}

// 一步一步
let breathTimer = null;
function breathBox() {
  const label = h('div', { class: 'breath-label' }, '吸气');
  const circle = h('div', { class: 'breath-circle' }, label);
  requestAnimationFrame(() => requestAnimationFrame(() => circle.classList.add('in')));
  let phase = 'in'; let left = 6;
  const count = h('p', { class: 'muted small center' }, `还有 ${left} 次`);
  clearInterval(breathTimer);
  const tick = () => {
    if (!circle.isConnected) { clearInterval(breathTimer); return; }
    phase = phase === 'in' ? 'out' : 'in';
    if (phase === 'in') { left -= 1; count.textContent = left > 0 ? `还有 ${left} 次` : '好了。可以下一步了'; }
    if (left <= 0) { clearInterval(breathTimer); label.textContent = '好'; circle.className = 'breath-circle'; return; }
    circle.className = `breath-circle ${phase}`;
    label.textContent = phase === 'in' ? '吸气' : '慢慢呼气';
    clearInterval(breathTimer);
    breathTimer = setInterval(tick, phase === 'in' ? 4000 : 6000);
  };
  breathTimer = setInterval(tick, 4000);
  return h('div', { class: 'breath' }, circle, count);
}
function lowGoView() {
  const d = store.data;
  const st = lowState;
  const next = (step) => { st.step = step; render(); window.scrollTo(0, 0); };
  const top = (title, sub) => headerSub(title, sub, h('a', { class: 'icon-btn quiet', href: '#/low', 'aria-label': '回去' }, '×'));
  if (st.step === 0) {
    return h('div', { class: 'low-go' },
      top('先慢慢呼吸', '跟着圆圈：吸气 4 秒，呼气 6 秒'),
      breathBox(),
      h('div', { class: 'actions' }, h('button', { class: 'grow', onclick: () => next(1) }, '下一步'), h('button', { class: 'secondary', onclick: () => next(1) }, '跳过')));
  }
  if (st.step === 1) {
    return h('div', { class: 'low-go' },
      top('现在有多难受？', '1 是还好，10 是非常难受'),
      h('div', { class: 'card' }, scoreRow('有多难受', 10, st.before, (v) => { st.before = v; render(); })),
      st.before >= 9 ? hotlineCard() : null,
      h('div', { class: 'actions' }, h('button', { class: 'grow', onclick: () => next(2) }, '下一步')));
  }
  if (st.step === 2) {
    return h('div', { class: 'low-go' },
      top('是哪一种难受？', '选最接近的就好'),
      h('div', { class: 'group' }, Object.entries(LOW_KINDS).map(([k, v]) => cell({ title: `${v.icon} ${v.name}`, onclick: () => { st.kind = k; next(3); } }))));
  }
  if (st.step === 3) {
    const kind = st.kind || 'unclear';
    const plan = d.low.plans[kind] || [];
    const items = [...new Set([...plan, ...st.did])];
    const l = lowLessons(d.low.log, kind);
    const input = h('input', { placeholder: '还做了别的', 'aria-label': '还做了' });
    return h('div', { class: 'low-go' },
      top(LOW_KINDS[kind].name, '一件一件来，做一件点一件。不用全做完'),
      l?.helped.length ? h('div', { class: 'card soft' }, h('p', { class: 'small' }, `以前这种时候，「${l.helped[0].text}」最管用${l.helped[0].n > 1 ? `（${l.helped[0].n} 次）` : ''}。先从它开始？`)) : null,
      h('div', { class: 'card' },
        h('div', { class: 'chips col' }, items.map((x) => h('button', {
          type: 'button', class: `chip check${st.did.has(x) ? ' on' : ''}`, 'aria-pressed': String(st.did.has(x)),
          onclick: () => { if (st.did.has(x)) st.did.delete(x); else st.did.add(x); render(); },
        }, st.did.has(x) ? icon('check', 'i tiny') : null, x))),
        h('div', { class: 'inline-add' }, input, h('button', { class: 'small secondary', onclick: () => { const t = input.value.trim(); if (t) { st.did.add(t); render(); } } }, '加'))),
      h('div', { class: 'actions' }, h('button', { class: 'grow', onclick: () => next(4) }, '下一步')));
  }
  if (st.step === 4) {
    const notes = d.low.notes;
    const good = goodDays(d, dayKey());
    const words = [
      ...notes.map((n) => ({ who: `你在 ${n.at.slice(0, 10)} 写给现在的自己`, text: n.text })),
      ...good.map((g) => ({ who: `${g.day.slice(5).replace('-', '/')} 那天你心情 ${g.mood} 分，写了`, text: g.note })),
      ...LOW_VERSES.map((v) => ({ who: v.ref, text: v.text })),
    ];
    // 先给自己写的话，再是状态好的日子、经文；第一次打开时定一个起点，「再看一句」往后翻
    st.wordStart ??= Math.floor(Math.random() * (notes.length || words.length));
    const w = words[(st.wordStart + st.words) % words.length];
    const pastLow = d.low.log.filter((x) => x.before && x.after && x.after < x.before).length;
    return h('div', { class: 'low-go' },
      top('给你的话', ''),
      h('div', { class: 'card words' }, h('p', { class: 'words-text' }, w.text), h('p', { class: 'muted small' }, `— ${w.who}`)),
      h('button', { class: 'link small block', style: 'margin:0 4px 14px', onclick: () => { st.words += 1; render(); } }, '再看一句 ›'),
      pastLow ? h('p', { class: 'small cheer' }, `以前记过 ${pastLow} 次，后来都好了一些。`) : h('p', { class: 'small cheer' }, '难受会过去的。慢慢来。'),
      h('div', { class: 'actions' }, h('button', { class: 'grow', onclick: () => next(5) }, '下一步')));
  }
  if (st.step === 5) {
    const note = h('textarea', { rows: 2, placeholder: '想写点什么（可以不写）', 'aria-label': '想写点什么' });
    const finish = () => saveRender('难受的时候：记一次', (data) => {
      data.low.log.push({
        id: newId('lo'), day: dayKey(), at: nowIso(), kind: st.kind || 'unclear',
        ...(st.before ? { before: st.before } : {}), ...(st.after ? { after: st.after } : {}),
        did: [...st.did], helped: [...st.helped], ...(note.value.trim() ? { note: note.value.trim() } : {}),
      });
    }).then((ok) => { if (ok) next(6); });
    return h('div', { class: 'low-go' },
      top('现在呢？', '1 是还好，10 是非常难受'),
      h('div', { class: 'card' }, scoreRow('现在有多难受', 10, st.after, (v) => { st.after = v; render(); }),
        st.before ? h('p', { class: 'muted small' }, `开始的时候是 ${st.before}`) : null),
      st.did.size ? h('div', { class: 'card' }, h('h3', {}, '哪些有点用？'),
        h('div', { class: 'chips' }, [...st.did].map((x) => h('button', { type: 'button', class: `chip check${st.helped.has(x) ? ' on' : ''}`, 'aria-pressed': String(st.helped.has(x)),
          onclick: () => { if (st.helped.has(x)) st.helped.delete(x); else st.helped.add(x); render(); } }, x)))) : null,
      h('div', { class: 'card' }, note),
      h('div', { class: 'actions' }, h('button', { class: 'grow', onclick: finish }, '记下')));
  }
  const still = st.after >= 8;
  return h('div', { class: 'low-go' },
    top(still ? '还是很难受' : '辛苦了', ''),
    still ? [h('div', { class: 'card soft' }, h('p', {}, '还是很难受的话，不要一个人扛着。找一个人说说：家里人、同学、老师，或者打下面的电话。')), hotlineCard()]
      : h('div', { class: 'card soft' }, h('p', {}, st.before && st.after && st.after < st.before ? `从 ${st.before} 到 ${st.after}，你把自己照顾好了一点。` : '你没有放着不管，你在照顾自己。'),
        h('p', { class: 'small muted' }, '今晚早点睡。明天醒来，又是新的一天。')),
    h('div', { class: 'actions' }, h('a', { class: 'button grow', href: '#/', onclick: () => resetLow() }, '回到今天'), h('button', { class: 'secondary', onclick: lowNoteSheet }, '写给下次的自己')));
}

// ---------- 小记 ----------
// 单独有 6 位密码：只存「加盐哈希」（PBKDF2），存在私有仓库里。离开网站就锁上。
// 代码是公开的，这一页上的文字（名字、按钮、说明）都从私有仓库的 private.ui 读，这里只有中性的默认值。

const P_DEFAULT = {
  title: '小记', main: '记一次', alt: '另记一种', altStat: '另一种',
  score: '评分', flag: '标记', flagYes: '是', flagNo: '否', flagStat: '标记了',
  checksTitle: '之后', checksHint: '做了的点一下。', checks: { c1: '第一项', c2: '第二项', c3: '第三项' },
  suppliesTitle: '用品', suppliesHint: '只记在这里。', suppliesPlaceholder: '用品名字',
  help: [['怎么用', ['「记一次」：时间默认现在，可以改；评分、标记点一下；备注不用写。记完弹出三项勾选。', '上面显示距离上次多久。过了你设的节奏（设置里改），只在这一页提一句，不推送。', '这一页单独有 6 位密码，离开网站就锁上。']]],
};
function pui() {
  const ui = store.data.private.ui || {};
  return { ...P_DEFAULT, ...ui, checks: { ...P_DEFAULT.checks, ...(ui.checks || {}) } };
}

let unlockUntil = 0;
function lockPrivate() { unlockUntil = 0; }
const b64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function hashPin(pin, salt, iter) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  return b64(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, key, 256));
}
async function makePin(pin) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iter = 150000;
  return { salt: b64(salt), iter, hash: await hashPin(pin, salt, iter) };
}
async function checkPin(pin, rec) {
  return (await hashPin(pin, unb64(rec.salt), rec.iter)) === rec.hash;
}

function pinForm({ title, sub, confirm = false, onPin }) {
  const a = h('input', { type: 'password', inputmode: 'numeric', autocomplete: 'off', maxlength: 6, placeholder: '6 位数字', 'aria-label': '密码', class: 'pin-input' });
  const b = confirm ? h('input', { type: 'password', inputmode: 'numeric', autocomplete: 'off', maxlength: 6, placeholder: '再输一遍', 'aria-label': '再输一遍', class: 'pin-input' }) : null;
  const submit = async () => {
    if (!/^\d{6}$/.test(a.value)) { toast('要 6 位数字', 'error'); return; }
    if (b && a.value !== b.value) { toast('两次不一样', 'error'); return; }
    await onPin(a.value);
  };
  a.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  if (!confirm) a.addEventListener('input', () => { if (a.value.length === 6) submit(); });
  setTimeout(() => a.focus(), 50);
  return h('div', { class: 'pin-box' }, icon('lock', 'i big-icon'), h('h2', {}, title), sub ? h('p', { class: 'muted small' }, sub) : null, a, b,
    h('button', { class: 'wide', onclick: submit }, '好'));
}

// 没设密码 / 锁着：返回要显示的页面；开着锁返回 null
function lockGate() {
  const d = store.data;
  const pin = d.settings.pin;
  if (!pin) {
    return h('div', {}, pinForm({
      title: '给这一页设一个密码', sub: '6 位数字。只存加密后的结果，代码里没有。', confirm: true,
      onPin: async (v) => {
        const rec = await makePin(v);
        await save('小记：设密码', (data) => { data.settings.pin = rec; });
        unlockUntil = Date.now() + 10 * 60000;
        render();
      },
    }));
  }
  if (Date.now() > unlockUntil) {
    return h('div', {}, pinForm({
      title: '输入密码',
      onPin: async (v) => {
        if (await checkPin(v, pin)) { unlockUntil = Date.now() + 10 * 60000; render(); } else toast('密码不对', 'error');
      },
    }));
  }
  unlockUntil = Date.now() + 10 * 60000;
  return null;
}

function privateView() {
  const gate = lockGate();
  if (gate) return gate;
  const d = store.data;
  const ui = pui();
  const s = privateStats(d);
  const rhythm = d.settings.rhythmDays || 2;
  const sinceText = s.since === null ? '还没有记录' : s.since < 1 ? `距离上次 ${Math.max(1, Math.round(s.since * 24))} 小时` : `距离上次 ${Math.floor(s.since)} 天`;
  const slotMax = Math.max(1, ...Object.values(s.slot));
  return h('div', {},
    header(ui.title, h('button', { class: 'icon-btn', 'aria-label': '锁上', onclick: () => { lockPrivate(); go('#/'); } }, icon('lock')), helpButton(ui.title, ui.help)),
    privateNote(d, dayKey()) ? h('div', { class: 'card soft' }, h('p', { class: 'small' }, privateNote(d, dayKey()))) : null,
    programCard(dayKey()),
    h('div', { class: 'card center' },
      h('div', { class: 'big-num' }, sinceText),
      s.since !== null && s.since >= rhythm ? h('p', { class: 'small muted' }, `已经超过你设的 ${rhythm} 天节奏了，可以安排一下。`) : h('p', { class: 'small muted' }, `你的节奏：${rhythm} 天一次`),
      h('div', { class: 'actions center-actions' },
        h('button', { onclick: () => privateSheet() }, ui.main),
        h('button', { class: 'secondary', onclick: recordOther }, ui.alt))),
    h('div', { class: 'card' },
      h('h3', {}, '统计（最近 30 天）'),
      h('div', { class: 'stat-grid' },
        stat('这个月', `${s.month} 次`), stat('最近 30 天', `${s.recent} 次`),
        stat('平均隔', s.avgGap === null ? '—' : `${s.avgGap.toFixed(1)} 天`), stat(ui.score, s.avgScore === null ? '—' : s.avgScore.toFixed(1)),
        stat(ui.flagStat, s.flag === null ? '—' : `${Math.round(s.flag * 100)}%`), stat(ui.altStat, `${s.other} 次`)),
      s.recent ? h('div', { class: 'slot-bars' }, Object.entries(s.slot).map(([k, v]) => h('div', { class: 'slot' },
        h('span', { class: 'small' }, k), h('span', { class: 'bar-track' }, h('span', { class: 'bar', style: `width:${(v / slotMax) * 100}%;background:var(--accent)` })), h('span', { class: 'small muted' }, String(v))))) : null),
    s.list.length ? h('div', { class: 'card' }, h('h3', {}, '最近'),
      s.list.slice(-15).reverse().map((e) => h('button', { class: 'event-row product-row', onclick: () => privateSheet(e) },
        h('span', { class: 'grow' }, `${e.day.slice(5).replace('-', '/')} ${hm(e.at)}`,
          h('span', { class: 'muted small' }, [e.score ? `${ui.score} ${e.score}` : '', e.flag ? ui.flagStat : '', e.checks ? checksText(e.checks, ui) : ''].filter(Boolean).map((x) => ` · ${x}`).join(''))),
        icon('chev', 'i chev')))) : null,
    rulesCard(),
    sessionsCard(dayKey()),
    callNamesCard(),
    begsCard(),
    voiceCard(),
    mediaCard(),
    suppliesCard(ui),
    limitsCard());
}
const stat = (k, v) => h('div', { class: 'stat' }, h('span', { class: 'muted small' }, k), h('b', {}, v));
const CHECK_KEYS = ['c1', 'c2', 'c3'];
const checksText = (c, ui) => { const n = CHECK_KEYS.filter((k) => c[k]).length; return n === 3 ? `${ui.checksTitle} ✓` : `${ui.checksTitle} ${n}/3`; };

function localInput(iso) {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function privateSheet(e = null) {
  const ui = pui();
  const when = h('input', { type: 'datetime-local', value: localInput(e?.at || nowIso()), 'aria-label': '时间' });
  const note = h('input', { value: e?.note || '', placeholder: '备注（可以不填）', 'aria-label': '备注' });
  let score = e?.score || null;
  let flag = e ? Boolean(e.flag) : null;
  const rows = h('div', {});
  const draw = () => rows.replaceChildren(
    h('div', { class: 'label-sm' }, ui.score), scoreRow(ui.score, 5, score, (v) => { score = v; draw(); }),
    h('div', { class: 'label-sm' }, ui.flag), choiceRow(ui.flag, [[true, ui.flagYes], [false, ui.flagNo]], flag, (v) => { flag = v; draw(); }));
  draw();
  const close = openSheet({
    title: e ? '这一次' : ui.main,
    body: h('div', { class: 'form' }, h('label', {}, '时间', when), rows, note,
      e ? h('button', { class: 'link small', onclick: () => { close(); checksSheet(e.id); } }, ui.checksTitle) : null,
      e ? h('button', { class: 'danger small', onclick: () => { close(); saveUndoable('小记：删一条', (data) => { data.events = data.events.filter((x) => x.id !== e.id); }, '删掉了一条').then(render).catch(() => {}); } }, '删掉这条') : null),
    confirmText: '记好了',
    onConfirm: async () => {
      const at = new Date(when.value || Date.now());
      if (Number.isNaN(at.getTime())) { toast('时间不对', 'error'); return false; }
      const id = e?.id || newId('e');
      try {
        await save(e ? '小记：改一条' : '小记', (data) => {
          const x = { ...(e || {}), id, type: 'p', at: at.toISOString(), day: dayKey(at) };
          if (score) x.score = score; else delete x.score;
          x.flag = Boolean(flag);
          if (note.value.trim()) x.note = note.value.trim(); else delete x.note;
          const i = data.events.findIndex((y) => y.id === id);
          if (i >= 0) data.events[i] = x; else data.events.push(x);
        });
      } catch { return false; }
      render();
      if (!e && store.data.settings.checks !== false) setTimeout(() => checksSheet(id), 50);
      return true;
    },
  });
}

function checksSheet(id) {
  const ui = pui();
  const ev = store.data.events.find((x) => x.id === id);
  const picked = { ...(ev?.checks || {}) };
  const body = h('div', {},
    h('p', { class: 'muted small' }, ui.checksHint),
    h('div', { class: 'chips' }, CHECK_KEYS.map((k) => {
      const b = h('button', { type: 'button', class: `chip check${picked[k] ? ' on' : ''}`, onclick: () => { picked[k] = !picked[k]; b.classList.toggle('on', picked[k]); } }, ui.checks[k]);
      return b;
    })));
  openSheet({
    title: ui.checksTitle, body, confirmText: '好了', cancelText: '待会儿',
    onConfirm: () => saveRender('小记：勾选', (data) => {
      const x = data.events.find((y) => y.id === id);
      if (x) x.checks = Object.fromEntries(CHECK_KEYS.map((k) => [k, Boolean(picked[k])]));
    }),
  });
}

// 按周的任务、一段计时的「时间」、音频记录、绝对不要的清单。文字都从 private.ui 读，这里只有中性默认值。
const P_PROGRAM_DEFAULT = {
  programTitle: '这一周', sessionStart: '开始', sessionTitle: '时间', trackA: 'A', trackB: 'B',
  safety: ['任何一张都可以跳过。', '不舒服就停。'], aftercare: ['收拾好东西', '喝一杯水'],
  afterLabel: '结束后的心情', alsoCount: '这次也记一次', mediaTitle: '音频', limitsTitle: '绝对不要', customTitle: '自己写的',
  sceneTitle: '今天的情景', rewardTitle: '奖励', penaltyTitle: '惩罚', pointsLabel: '得分',
  trackC: 'C', checkTitle: '突击检查', rulesTitle: '规矩手册', levelLabel: '等级', callTitle: '称呼',
};
const pp = () => ({ ...P_PROGRAM_DEFAULT, ...pui() });

function programCard(today) {
  const d = store.data;
  const ui = pp();
  const w = programWeek(d, today);
  if (!w) return null;
  if (!w.week) return h('div', { class: 'card' }, h('h3', {}, ui.programTitle), h('p', { class: 'small muted' }, `${w.startsIn} 天后开始。`));
  const tasks = weekTasks(d, today);
  const mon = weekOf(today);
  const done = d.private.sessions.filter((s) => s.day >= mon);
  return h('div', { class: 'card program' },
    h('div', { class: 'rec-top' }, h('h3', {}, `${ui.programTitle} · 第 ${w.n + 1} 周${w.after ? '（之后）' : ` / ${w.total}`}`), done.length ? h('span', { class: 'good-text small' }, `这周做过 ${done.length} 次`) : null),
    h('b', { class: 'block' }, w.week.title),
    w.week.intro ? h('p', { class: 'small' }, w.week.intro) : null,
    h('p', { class: 'muted small' }, `${tasks.length} 张任务，开始以后一张一张出现。`),
    w.week.buy ? h('p', { class: 'small' }, `这周可以买：${w.week.buy.name}${w.week.buy.price ? `（${w.week.buy.price}）` : ''}。不买也行。`) : null,
    h('a', { class: 'button wide', href: '#/p/s' }, ui.sessionStart));
}

// 一段计时的时间：安全提醒（+ 现在生效的规矩）→ 情景 → 任务一张一张（语音念、带计时）→ 收尾（得分、等级、奖励 / 惩罚）
// 语音用浏览器自带的中文朗读（建议戴耳机）；突击检查：随机时刻响一声、念一条 program.checks；黑暗模式：全黑的大按钮界面。
const sess = { step: 'safety', i: 0, start: null, results: {}, key: '', seed: 0, scene: null, voice: true, dark: false, nextCheck: 0, check: null, checksDone: 0, checksSkip: 0, timer: null, beforePoints: 0 };
let sessTicker = null;

// 语音：浏览器自带的朗读（iPhone 上就是系统的中文声音）。用哪个声音、语速、音调存在这台设备上（每台设备的声音不一样）
const VOICE_KEY = 'life-voice';
const FEMALE = /tingting|婷婷|lili|meijia|美佳|xiaoxiao|晓晓|xiaoyi|晓伊|yaoyao|huihui|sinji|female|女/i;
function zhVoices() {
  try { return speechSynthesis.getVoices().filter((x) => /^zh/i.test(x.lang)); } catch { return []; }
}
function pickVoice() {
  const pref = readJson(VOICE_KEY);
  const list = zhVoices();
  return list.find((x) => x.name === pref.name) || list.find((x) => /zh[-_]CN/i.test(x.lang) && FEMALE.test(x.name)) || list.find((x) => /zh[-_]CN/i.test(x.lang)) || list[0] || null;
}
// wrap：任务和突击检查前后随机加一句（private.voiceLines.before / after，让语气更像在命令你）
function speak(text, wrap = false, force = false) {
  if ((!sess.voice && !force) || !('speechSynthesis' in window)) return;
  try {
    let line = String(text);
    const vl = store.data.private.voiceLines;
    if (wrap && vl) {
      const seed = Date.now();
      const pre = Math.random() < 0.6 ? pickOne(vl.before, seed) : '';
      const post = Math.random() < 0.5 ? pickOne(vl.after, seed + 1) : '';
      line = `${pre ? `${callName(pre, seed)} ` : ''}${line}${post ? ` ${callName(post, seed + 2)}` : ''}`;
    }
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(line.replace(/[「」]/g, ''));
    u.lang = 'zh-CN';
    const v = pickVoice();
    if (v) u.voice = v;
    const pref = readJson(VOICE_KEY);
    u.rate = pref.rate || 0.9;
    u.pitch = pref.pitch || 0.9;
    speechSynthesis.speak(u);
  } catch { /* 不支持就不念 */ }
}
function voiceCard() {
  const pref = readJson(VOICE_KEY);
  const sel = h('select', { 'aria-label': '声音' });
  const fill = () => {
    const list = zhVoices();
    const cur = pickVoice();
    sel.replaceChildren(...(list.length ? list.map((v) => h('option', { value: v.name, selected: cur?.name === v.name }, `${v.name}${FEMALE.test(v.name) ? '（女声）' : ''}`)) : [h('option', { value: '' }, '这台设备没有中文声音')]));
  };
  fill();
  try { speechSynthesis.onvoiceschanged = fill; } catch { /* 无 */ }
  const rate = h('input', { type: 'range', min: '0.6', max: '1.3', step: '0.05', value: pref.rate || 0.9, 'aria-label': '语速' });
  const pitch = h('input', { type: 'range', min: '0.5', max: '1.5', step: '0.05', value: pref.pitch || 0.9, 'aria-label': '音调' });
  const store_ = () => writeJson(VOICE_KEY, { name: sel.value, rate: Number(rate.value), pitch: Number(pitch.value) });
  for (const el of [sel, rate, pitch]) el.addEventListener('change', store_);
  const sample = () => { store_(); speak(callName('{称呼}，跪好。别让我说第二遍。', Date.now()), false, true); };
  return h('div', { class: 'card form' },
    h('h3', {}, '语音'),
    h('label', {}, '声音', sel),
    h('label', {}, '语速（慢一点更有压迫感）', rate),
    h('label', {}, '音调（低一点更冷）', pitch),
    h('button', { class: 'small secondary', onclick: sample }, '试听'),
    h('p', { class: 'muted small' }, 'iPhone 上想要更好听的女声：设置 → 辅助功能 → 朗读内容 → 声音 → 中文，下载「增强版」或「高级版」的女声，回来在这里选。设置只存在这台手机上。'));
}
function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.frequency.value = 880; g.gain.value = 0.15;
    o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.35);
  } catch { /* 没声音就算了 */ }
}
// 称呼：{称呼} 换成用户自己定的称呼里随机一个
function callName(text, seed) {
  const names = store.data.private.callNames || [];
  const begs = store.data.private.begs || [];
  let k = 0;
  return String(text)
    .replace(/\{称呼\}/g, () => pickOne(names.length ? names : [''], `${seed}-${k++}`) || '')
    .replace(/\{求\}/g, () => pickOne(begs.length ? begs : ['求求你，允许我'], `${seed}-b${k++}`));
}
const taskText = (t) => fillText(callName(t.text, `${sess.seed}-${t.id}`), `${sess.seed}-${t.id}`);
// 任务里的第一个时长：「3 分钟」「30 秒」→ 秒数
function durationOf(text) {
  const m = String(text).match(/(\d+)\s*(分钟|秒)/);
  return m ? Number(m[1]) * (m[2] === '分钟' ? 60 : 1) : 0;
}
function totalPoints(d) { return d.private.sessions.reduce((a, s) => a + (s.points || 0), 0); }
function levelOf(d, points) {
  const levels = (d.private.program?.levels || []).slice().sort((a, b) => a.min - b.min);
  let cur = null; let next = null;
  for (const l of levels) { if (points >= l.min) cur = l; else { next = l; break; } }
  return { cur, next };
}

function startTicker() {
  clearInterval(sessTicker);
  sessTicker = setInterval(() => {
    if (currentPath() !== '/p/s' || !sess.start) { clearInterval(sessTicker); sessTicker = null; document.body.classList.remove('dark-session'); return; }
    const d = store.data;
    // 计时器
    if (sess.timer) {
      const left = Math.ceil((sess.timer.end - Date.now()) / 1000);
      const el = document.querySelector('.count-down');
      if (el) el.textContent = left > 0 ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : '时间到';
      if (left === 10) speak('还剩十秒');
      if (left <= 0) { sess.timer = null; beep(); speak('时间到'); render(); }
    }
    const top = document.querySelector('.session-timer');
    if (top) top.textContent = timerLine(d);
    // 突击检查
    const checks = d.private.program?.checks || [];
    if (checks.length && !sess.check && sess.step === 'task' && sess.nextCheck && Date.now() >= sess.nextCheck) {
      sess.check = taskText({ id: `c${Date.now()}`, text: pickOne(checks, Date.now()) });
      beep();
      setTimeout(() => speak(`突击检查。${sess.check}`, true), 400);
      render();
    }
  }, 1000);
}
function timerLine(d) {
  const mins = Math.floor((Date.now() - sess.start) / 60000);
  const limit = d.private.minutes || 60;
  return mins >= limit ? `${mins} 分钟了，时间到了，开始收尾吧。` : `${mins} / ${limit} 分钟 · 最晚 ${d.private.latest || '23:30'} 收尾`;
}
function scheduleCheck() {
  // 下一次突击检查：program.checkEvery = [最少, 最多] 分钟以后（默认 4–10）
  const [lo, hi] = store.data.private.program?.checkEvery || [4, 10];
  sess.nextCheck = Date.now() + (lo + Math.random() * (hi - lo)) * 60000;
}

function sessionView() {
  const gate = lockGate();
  if (gate) return gate;
  const d = store.data;
  const ui = pp();
  const today = dayKey();
  const limits = d.private.limits.map((x) => x.trim()).filter(Boolean);
  const tasks = weekTasks(d, today).filter((t) => !limits.some((l) => t.text.includes(l)));
  if (sess.key !== today) Object.assign(sess, { step: 'safety', i: 0, start: null, results: {}, key: today, check: null, checksDone: 0, checksSkip: 0, timer: null });
  document.body.classList.toggle('dark-session', Boolean(sess.dark && sess.start));
  const top = sess.start ? h('div', { class: `session-timer${Math.floor((Date.now() - sess.start) / 60000) >= (d.private.minutes || 60) ? ' over' : ''}` }, timerLine(d)) : null;
  const rules = d.private.rules || [];
  const stopBtn = sess.start ? h('button', { class: 'link small center block stop-btn', onclick: () => { sess.timer = null; sess.check = null; sess.step = 'end'; speachStop(); render(); } }, '叫停，直接收尾') : null;

  if (sess.step === 'safety') {
    return h('div', { class: 'session' },
      header(ui.sessionTitle, helpButton(ui.title, ui.help)),
      h('div', { class: 'card' }, h('h3', {}, '开始之前'), h('ul', { class: 'small flags' }, ui.safety.map((x) => h('li', {}, x))),
        limits.length ? [h('h3', {}, ui.limitsTitle), h('p', { class: 'small' }, limits.join('、'))] : null),
      rules.length ? h('div', { class: 'card' }, h('h3', {}, ui.rulesTitle || '现在生效的规矩'), h('ol', { class: 'small' }, rules.map((r) => h('li', {}, r.text)))) : null,
      h('div', { class: 'card' },
        h('label', { class: 'switch-row' }, h('input', { type: 'checkbox', checked: sess.voice, onchange: (e) => { sess.voice = e.target.checked; } }), '语音念命令（戴上耳机）'),
        h('label', { class: 'switch-row', style: 'margin-top:10px !important' }, h('input', { type: 'checkbox', checked: sess.dark, onchange: (e) => { sess.dark = e.target.checked; } }), '黑暗模式（关灯，只听口令）')),
      h('button', { class: 'wide', onclick: () => {
        sess.seed = Date.now();
        sess.scene = pickOne(d.private.program?.scenes, sess.seed);
        sess.step = sess.scene ? 'scene' : 'task'; sess.start = Date.now();
        sess.beforePoints = totalPoints(d);
        scheduleCheck(); startTicker();
        if (sess.scene) speak(`今天的情景。${fillText(callName(sess.scene, sess.seed), sess.seed)}`);
        else if (tasks[0]) speak(taskText(tasks[0]), true);
        render();
      } }, '准备好了'),
      h('a', { class: 'link small center block', href: '#/p' }, '先不了'));
  }
  if (sess.check) {
    const finish = (ok) => { if (ok) sess.checksDone++; else sess.checksSkip++; sess.check = null; sess.timer = null; scheduleCheck(); render(); };
    const secs = durationOf(sess.check);
    return h('div', { class: 'session' }, top,
      h('div', { class: 'card task-card check-card' }, h('span', { class: 'badge warn' }, ui.checkTitle || '突击检查'), h('p', { class: 'task-text' }, sess.check),
        secs ? timerBox(secs) : null),
      h('div', { class: 'actions' }, h('button', { class: 'grow big-btn', onclick: () => finish(true) }, '做到了'), h('button', { class: 'secondary big-btn', onclick: () => finish(false) }, '跳过')));
  }
  if (sess.step === 'scene') {
    return h('div', { class: 'session' }, top,
      h('div', { class: 'card task-card scene' }, h('span', { class: 'badge accent' }, ui.sceneTitle), h('p', { class: 'task-text' }, fillText(callName(sess.scene, sess.seed), sess.seed))),
      h('button', { class: 'wide big-btn', onclick: () => { sess.step = 'task'; if (tasks[0]) speak(taskText(tasks[0]), true); render(); } }, '开始'),
      stopBtn);
  }
  if (sess.step === 'task' && sess.i < tasks.length) {
    const t = tasks[sess.i];
    const text = taskText(t);
    const mark = (r) => {
      sess.results[t.id] = r;
      sess.timer = null;
      if (r === 'done' && t.rule) save('小记：新规矩', (data) => { const rs = (data.private.rules ||= []); if (!rs.some((x) => x.text === t.rule)) rs.push({ id: newId('rl'), text: t.rule, at: dayKey() }); }).catch(() => {});
      sess.i++;
      if (sess.i >= tasks.length) { sess.step = 'end'; speak('任务做完了。开始收尾。'); } else speak(taskText(tasks[sess.i]), true);
      render(); window.scrollTo(0, 0);
    };
    const secs = durationOf(text);
    const badge = { a: ui.trackA, b: ui.trackB, c: ui.trackC || ui.trackB }[t.track] || ui.trackB;
    return h('div', { class: 'session' },
      top,
      h('div', { class: 'pray-progress' }, tasks.map((_, k) => h('span', { class: k <= sess.i ? 'on' : '' }))),
      h('div', { class: `card task-card ${t.track || ''}` },
        h('div', { class: 'rec-top' }, h('span', { class: 'badge accent' }, badge), t.level ? h('span', { class: 'muted small' }, '●'.repeat(t.level)) : null),
        h('p', { class: 'task-text' }, text),
        secs ? timerBox(secs) : null,
        t.rule ? h('p', { class: 'small' }, `做到了，这条会加进规矩手册：${t.rule}`) : null,
        t.note ? h('p', { class: 'small muted' }, t.note) : null),
      h('div', { class: 'actions' }, h('button', { class: 'grow big-btn', onclick: () => mark('done') }, '做到了'), h('button', { class: 'secondary big-btn', onclick: () => mark('skip') }, '跳过')),
      h('button', { class: 'link small center block', onclick: () => speak(text, true, true) }, '再念一遍'),
      stopBtn);
  }
  return sessionEnd(d, ui, tasks, top);
}
function speachStop() { try { speechSynthesis.cancel(); } catch { /* 无 */ } }

// 计时：点一下开始倒数，到了响一声、念「时间到」
function timerBox(secs) {
  const running = sess.timer && sess.timer.secs === secs;
  return h('div', { class: 'timer-box' },
    h('span', { class: 'count-down' }, running ? '' : `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`),
    running ? h('button', { class: 'small secondary', onclick: () => { sess.timer = null; render(); } }, '停')
      : h('button', { class: 'small', onclick: () => { sess.timer = { secs, end: Date.now() + secs * 1000 }; speak('开始'); render(); } }, '开始计时'));
}

function sessionEnd(d, ui, tasks, top) {
  // 收尾：得分（突击检查做到的每次 10 分）；等级；全做到抽奖励，跳过两张以上抽惩罚（可以不做）
  speachStop();
  const pg = d.private.program || {};
  const points = sessionPoints(sess.results, tasks) + sess.checksDone * 10;
  const skips = Object.values(sess.results).filter((x) => x === 'skip').length + sess.checksSkip;
  const doneAll = tasks.length > 0 && tasks.every((t) => sess.results[t.id] === 'done') && !sess.checksSkip;
  const reward = doneAll ? pickOne(pg.rewards, `${sess.seed}-r`) : null;
  const penalty = skips >= 2 ? pickOne(pg.penalties, `${sess.seed}-p`) : null;
  const before = levelOf(d, sess.beforePoints);
  const after_ = levelOf(d, sess.beforePoints + points);
  const levelUp = after_.cur && after_.cur !== before.cur;
  const care = new Set();
  let score = null; let after = null;
  const rows = h('div', {});
  const draw = () => rows.replaceChildren(
    h('div', { class: 'label-sm' }, ui.score), scoreRow(ui.score, 5, score, (v) => { score = v; draw(); }),
    h('div', { class: 'label-sm' }, ui.afterLabel), scoreRow(ui.afterLabel, 5, after, (v) => { after = v; draw(); }, ['很差', '不太好', '一般', '不错', '很好']));
  draw();
  const note = h('textarea', { rows: 2, placeholder: '想写的写一句（可以不写）', 'aria-label': '备注' });
  const count = h('input', { type: 'checkbox', 'aria-label': ui.alsoCount });
  const unrule = () => {
    const rs = d.private.rules || [];
    if (!rs.length) { toast('现在没有规矩可以撤销'); return; }
    const close = openSheet({ title: '撤销一条规矩', body: h('div', { class: 'group' }, rs.map((r) => cell({ title: r.text, onclick: () => { close(); saveRender('小记：撤销规矩', (data) => { data.private.rules = data.private.rules.filter((x) => x.id !== r.id); }); } }))), confirmText: null, cancelText: '先不撤' });
  };
  const finish = async () => {
    const end = new Date();
    const start = new Date(sess.start || end);
    const id = newId('ss');
    try {
      await save('小记：一段时间', (data) => {
        data.private.sessions.push({
          id, day: dayKey(start), start: start.toISOString(), end: end.toISOString(), minutes: Math.round((end - start) / 60000),
          week: (programWeek(data, dayKey(start))?.n ?? -1) + 1, tasks: { ...sess.results },
          ...(score ? { score } : {}), ...(after ? { after } : {}), ...(note.value.trim() ? { note: note.value.trim() } : {}),
          points, ...(sess.checksDone || sess.checksSkip ? { checks: sess.checksDone, checksSkip: sess.checksSkip } : {}),
          ...(sess.scene ? { scene: fillText(sess.scene, sess.seed).slice(0, 80) } : {}), ...(reward ? { reward: true } : {}), ...(penalty ? { penalty: true } : {}),
        });
        if (count.checked) data.events.push({ id: newId('e'), day: dayKey(end), at: end.toISOString(), type: 'p', ...(score ? { score } : {}), flag: false, session: id });
      });
    } catch { return; }
    Object.assign(sess, { step: 'safety', i: 0, start: null, results: {}, key: '', check: null, checksDone: 0, checksSkip: 0, timer: null });
    document.body.classList.remove('dark-session');
    toast(ui.doneToast || '收好了。');
    go('#/p');
  };
  return h('div', { class: 'session' },
    top,
    h('div', { class: 'card center' }, h('span', { class: 'muted small' }, ui.pointsLabel), h('div', { class: 'big-num' }, String(points)),
      h('span', { class: 'muted small' }, `做到 ${Object.values(sess.results).filter((x) => x === 'done').length + sess.checksDone} 张，跳过 ${skips} 张`),
      after_.cur ? h('p', { class: 'small' }, `${ui.levelLabel || '等级'}：${after_.cur.name}${after_.next ? `（再 ${after_.next.min - sess.beforePoints - points} 分升到「${after_.next.name}」）` : ''}`) : null),
    levelUp ? h('div', { class: 'card task-card reward' }, h('span', { class: 'badge good' }, '升级了'), h('p', { class: 'task-text' }, `${after_.cur.name}`), after_.cur.text ? h('p', { class: 'small' }, fillText(callName(after_.cur.text, sess.seed), sess.seed)) : null) : null,
    reward ? h('div', { class: 'card task-card reward' }, h('span', { class: 'badge good' }, ui.rewardTitle), h('p', { class: 'task-text' }, fillText(callName(reward.text || reward, sess.seed), sess.seed)),
      reward.unrule ? h('button', { class: 'small secondary', onclick: unrule }, '撤销一条规矩') : null) : null,
    penalty ? h('div', { class: 'card task-card penalty' }, h('span', { class: 'badge warn' }, ui.penaltyTitle), h('p', { class: 'task-text' }, fillText(callName(penalty, sess.seed), sess.seed)), h('p', { class: 'small muted' }, '惩罚也可以不做。')) : null,
    h('div', { class: 'card' }, h('h3', {}, '收尾'), h('p', { class: 'small muted' }, '一样一样做，做完点一下。'),
      h('div', { class: 'chips' }, ui.aftercare.map((x, i) => {
        const b = h('button', { type: 'button', class: 'chip check', onclick: () => { if (care.has(i)) care.delete(i); else care.add(i); b.classList.toggle('on', care.has(i)); } }, x);
        return b;
      }))),
    h('div', { class: 'card' }, rows, note, h('label', { class: 'switch-row', style: 'margin-top:10px !important' }, count, ui.alsoCount)),
    h('button', { class: 'wide', onclick: finish }, '结束'));
}

// 规矩手册：现在生效的规矩，可以自己加、删
function rulesCard() {
  const d = store.data;
  const ui = pp();
  const rs = d.private.rules || [];
  const input = h('input', { placeholder: '加一条规矩', 'aria-label': '新的规矩' });
  const add = () => { const v = input.value.trim(); if (v) saveRender('小记：加规矩', (data) => { (data.private.rules ||= []).push({ id: newId('rl'), text: v, at: dayKey() }); }); };
  const pts = totalPoints(d);
  const lv = levelOf(d, pts);
  return h('div', { class: 'card' },
    h('div', { class: 'rec-top' }, h('h3', {}, ui.rulesTitle || '规矩手册'), lv.cur ? h('span', { class: 'small' }, `${lv.cur.name} · ${pts} 分`) : null),
    rs.length ? h('ol', { class: 'small rules' }, rs.map((r) => h('li', {}, r.text, ' ', h('button', { class: 'link small muted', onclick: () => saveUndoable('小记：删规矩', (data) => { data.private.rules = data.private.rules.filter((x) => x.id !== r.id); }, '删掉了').then(render).catch(() => {}) }, '删')))) : h('p', { class: 'muted small' }, '还没有。任务做到了会往这里加，奖励可以撤销。'),
    h('div', { class: 'inline-add' }, input, h('button', { class: 'small', onclick: add }, '加')));
}

// 一组自己写的词：称呼（{称呼}）、求的话（{求}），任务和语音里随机用一个
function wordsCard(key, title, hint, placeholder) {
  const list = store.data.private[key] || [];
  const input = h('input', { placeholder, 'aria-label': placeholder });
  const add = () => { const v = input.value.trim(); if (v) saveRender(`小记：${title}`, (data) => { (data.private[key] ||= []).push(v); }); };
  return h('div', { class: 'card' },
    h('h3', {}, title), h('p', { class: 'muted small' }, hint),
    h('div', { class: 'chips' }, list.map((x, i) => h('button', { type: 'button', class: 'chip', onclick: () => saveRender(`小记：删${title}`, (data) => { data.private[key].splice(i, 1); }) }, `${x} ×`))),
    h('div', { class: 'inline-add' }, input, h('button', { class: 'small', onclick: add }, '加')));
}
const callNamesCard = () => wordsCard('callNames', pp().callTitle || '称呼', '任务和语音里会从这些里面随机叫你。点一个可以删掉。', '新的称呼');
const begsCard = () => wordsCard('begs', pp().begTitle || '求的话', '任务里要「求」的时候，从这里随机挑一句。你自己写。', '新的一句');

function sessionsCard(today) {
  const d = store.data;
  const ui = pp();
  const list = d.private.sessions.slice(-8).reverse();
  if (!list.length) return null;
  return h('div', { class: 'card' }, h('h3', {}, `${ui.sessionTitle}（最近）`),
    list.map((s) => {
      const done = Object.values(s.tasks || {}).filter((x) => x === 'done').length;
      const all = Object.keys(s.tasks || {}).length;
      return h('div', { class: 'event-row' },
        h('span', { class: 'grow small' }, `${s.day.slice(5).replace('-', '/')} · ${s.minutes} 分钟 · 任务 ${done}/${all}${s.points ? ` · ${s.points} 分` : ''}`,
          h('span', { class: 'muted' }, [s.score ? ` · ${ui.score} ${s.score}` : '', s.after ? ` · 心情 ${s.after}` : ''].join(''))),
        h('button', { class: 'link small muted', onclick: () => saveUndoable('小记：删一段', (data) => { data.private.sessions = data.private.sessions.filter((x) => x.id !== s.id); }, '删掉了').then(render).catch(() => {}) }, '删'));
    }));
}

function mediaCard() {
  const d = store.data;
  const ui = pp();
  const add = (m = null) => {
    const title = h('input', { value: m?.title || '', placeholder: '名字', 'aria-label': '名字' });
    const link = h('input', { value: m?.link || '', placeholder: '链接（可以不填）', 'aria-label': '链接' });
    const minutes = h('input', { inputmode: 'numeric', value: m?.minutes || '', placeholder: '多少分钟', 'aria-label': '多少分钟' });
    const note = h('input', { value: m?.note || '', placeholder: '听完怎么样（可以不填）', 'aria-label': '感受' });
    let after = m?.after || null;
    const r = h('div', {});
    const draw = () => r.replaceChildren(scoreRow('听完的感觉', 5, after, (v) => { after = v; draw(); }, ['很差', '不太好', '一般', '不错', '很好']));
    draw();
    openSheet({
      title: ui.mediaTitle, body: h('div', { class: 'form' }, title, link, minutes, h('div', { class: 'label-sm' }, '听完的感觉'), r, note), confirmText: '记好了',
      onConfirm: () => {
        if (!title.value.trim()) { toast('写个名字', 'error'); return false; }
        const x = { id: m?.id || newId('md'), day: m?.day || dayKey(), title: title.value.trim(), ...(link.value.trim() ? { link: link.value.trim() } : {}), ...(Number(minutes.value) ? { minutes: Number(minutes.value) } : {}), ...(after ? { after } : {}), ...(note.value.trim() ? { note: note.value.trim() } : {}) };
        return saveRender('小记：音频', (data) => { const i = data.private.media.findIndex((y) => y.id === x.id); if (i >= 0) data.private.media[i] = x; else data.private.media.push(x); });
      },
    });
  };
  const list = d.private.media.slice().reverse().slice(0, 10);
  return h('div', { class: 'card' },
    h('div', { class: 'rec-top' }, h('h3', {}, ui.mediaTitle), h('button', { class: 'link small', onclick: () => add() }, '＋ 记一个')),
    list.length ? list.map((m) => h('button', { class: 'event-row product-row', onclick: () => add(m) },
      h('span', { class: 'grow small' }, m.title, h('span', { class: 'muted block' }, [m.day.slice(5).replace('-', '/'), m.minutes ? `${m.minutes} 分钟` : '', m.after ? `听完 ${['很差', '不太好', '一般', '不错', '很好'][m.after - 1]}` : '', m.note || ''].filter(Boolean).join(' · '))),
      icon('chev', 'i chev'))) : h('p', { class: 'muted small' }, '还没有。'));
}

function limitsCard() {
  const d = store.data;
  const ui = pp();
  const input = h('input', { placeholder: '写几个字，含这几个字的任务不会出现', 'aria-label': '新的绝对不要' });
  const add = () => { const v = input.value.trim(); if (v) saveRender('小记：绝对不要', (data) => { data.private.limits.push(v); }); };
  const custom = h('input', { placeholder: '自己写一张任务', 'aria-label': '自己写的任务' });
  const addCustom = () => { const v = custom.value.trim(); if (v) saveRender('小记：自己写的', (data) => { data.private.custom.push({ id: newId('ct'), track: 'b', text: v, level: 1 }); }); };
  return [
    h('div', { class: 'card' }, h('h3', {}, ui.limitsTitle),
      d.private.limits.map((x, i) => h('div', { class: 'event-row' }, h('span', { class: 'grow small' }, x),
        h('button', { class: 'link small muted', onclick: () => saveRender('小记：删绝对不要', (data) => { data.private.limits.splice(i, 1); }) }, '删'))),
      h('div', { class: 'inline-add' }, input, h('button', { class: 'small', onclick: add }, '加'))),
    h('div', { class: 'card' }, h('h3', {}, ui.customTitle), h('p', { class: 'muted small' }, '路线走完以后，这些会和最后一周的任务一起出现。'),
      d.private.custom.map((x) => h('div', { class: 'event-row' }, h('span', { class: 'grow small' }, x.text),
        h('button', { class: 'link small muted', onclick: () => saveRender('小记：删自己写的', (data) => { data.private.custom = data.private.custom.filter((y) => y.id !== x.id); }) }, '删'))),
      h('div', { class: 'inline-add' }, custom, h('button', { class: 'small', onclick: addCustom }, '加'))),
  ];
}

function recordOther() {
  saveUndoable('小记：另一种', (data) => { data.events.push({ id: newId('e'), day: dayKey(), at: nowIso(), type: 'p2' }); }, '记好了').then(render).catch(() => {});
}

function suppliesCard(ui) {
  const d = store.data;
  const input = h('input', { placeholder: ui.suppliesPlaceholder, 'aria-label': '新的用品' });
  const add = () => {
    const v = input.value.trim();
    if (v) saveRender('小记：用品', (data) => { data.private.supplies.push({ id: newId('s'), name: v }); });
  };
  return h('div', { class: 'card' },
    h('h3', {}, ui.suppliesTitle),
    h('p', { class: 'muted small' }, ui.suppliesHint),
    d.private.supplies.map((x) => h('div', { class: 'event-row' },
      h('span', { class: 'grow' }, x.name, x.low ? h('span', { class: 'soon small' }, ' · 快用完了') : null),
      h('button', { class: 'link small', onclick: () => saveRender('小记：用品', (data) => { const y = data.private.supplies.find((z) => z.id === x.id); if (y) y.low = !y.low; }) }, x.low ? '补上了' : '快用完了'),
      h('button', { class: 'link small muted', onclick: () => saveUndoable('小记：删用品', (data) => { data.private.supplies = data.private.supplies.filter((z) => z.id !== x.id); }, '删掉了').then(render).catch(() => {}) }, '删'))),
    h('div', { class: 'inline-add' }, input, h('button', { class: 'small', onclick: add }, '加')));
}

// ---------- 最近的记录 ----------

function historyView() {
  const d = store.data;
  const today = dayKey();
  const days = Array.from({ length: 30 }, (_, i) => addDays(today, -i));
  return h('div', {},
    headerSub('最近的记录', '点一天可以看、可以补记'),
    weekCardToday(today),
    yearAgoCard(today),
    h('div', { class: 'group' }, days.map((x) => {
      const r = d.days[x] || {};
      const evs = eventsOn(d, x);
      const marks = [
        r.mood ? `心情 ${r.mood}` : '',
        evs.some((e) => e.type === 'shower') ? '洗澡' : '',
        evs.some((e) => e.type === 'sport') ? '运动' : '',
        prayedOn(d, x) ? '祷告' : '',
      ].filter(Boolean).join(' · ');
      return cell({ href: x === today ? '#/' : `#/day/${x}`, title: `${relDay(x, today)} · ${dayLabel(x)}`, sub: r.note || marks || '没有记录' });
    })));
}

// ---------- 想做到的事 ----------
// 写一句心愿 → 复制提示词和 ChatGPT 语音聊 → 让它「整理一下」，小结贴回来 → DeepSeek 拆成阶段、小事、习惯 → 一件件勾掉

const GOALS_HELP = [
  ['怎么用', [
    '点「＋ 写一个心愿」，用一句话写下想做到的事，比如「生活和工作分开，先从衣服开始」。',
    '复制提示词，打开 ChatGPT 新对话粘贴，切到语音，和它聊清楚。聊完说「整理一下」，它会写一份小结。',
    '把小结整段贴回来，点「让 DeepSeek 整理」：它会拆成几个阶段、每阶段几件能勾掉的小事，还有要养成的习惯。',
    '做完一件勾一件。首页会有一行进度。做到了点「做到了」，会进里程碑。',
  ]],
  ['要买的东西', ['DeepSeek 会看物品档案里已经有的东西（衣服的风格、季节、穿了几次、备注），已经有的不会叫你再买。它看不了照片。',
    '要买的那件事下面有「小红书」「淘宝」两个按钮，直接搜好；想买的话点「放进心愿单」，确认名字和价格后才会放进账本。']],
  ['改', ['点一件事可以改字或删掉；每个阶段下面可以加一件。', '想法变了：再和 ChatGPT 聊一次，把新的小结贴进来重新整理。已经勾掉的事，文字一样的会留着。']],
];

function goalsView() {
  const d = store.data;
  const by = (st) => d.goals.filter((g) => g.status === st);
  const active = [...by('talking'), ...by('active')];
  const done = by('done');
  const dropped = by('dropped');
  const add = () => {
    const wish = h('textarea', { rows: 3, placeholder: '比如：生活和工作分开，先从衣服开始', 'aria-label': '心愿' });
    openSheet({
      title: '写一个心愿',
      body: h('div', { class: 'form' }, wish, h('p', { class: 'muted small' }, '一句话就够，细节去和 ChatGPT 聊。')),
      confirmText: '下一步',
      onConfirm: async () => {
        const text = wish.value.trim();
        if (!text) { toast('写一句', 'error'); return false; }
        const id = newId('g');
        const ok = await save(`心愿：${text.slice(0, 20)}`, (data) => { data.goals.push({ id, wish: text, title: text.slice(0, 30), status: 'talking', at: dayKey() }); }).then(() => true).catch(() => false);
        if (ok) go(`#/goal/${id}`);
        return ok;
      },
    });
  };
  return h('div', {},
    headerSub('想做到的事', active.length ? `${active.length} 件在做` : '把心愿变成一步一步能做到的事', helpButton('想做到的事怎么用', GOALS_HELP)),
    active.length ? h('div', { class: 'group' }, active.map((g) => {
      const p = goalProgress(g);
      return cell({ href: `#/goal/${g.id}`, ic: 'sparkle', title: g.title || g.wish,
        sub: g.status === 'talking' ? '还没整理：和 ChatGPT 聊完贴回来' : p.allDone ? '都做完了，可以点「做到了」' : `第 ${p.stage + 1} 阶段 ${p.done}/${p.total} · 一共做了 ${p.doneAll}/${p.totalAll} 件` });
    })) : h('div', { class: 'card' }, h('p', { class: 'muted' }, '还没有。有想做到的事，写一句开始。')),
    h('button', { class: 'wide', onclick: add }, '＋ 写一个心愿'),
    done.length ? [h('div', { class: 'section-title' }, `做到了（${done.length}）`), h('div', { class: 'group' }, done.map((g) => cell({ href: `#/goal/${g.id}`, title: g.title, meta: relDay(g.doneAt, dayKey()) })))] : null,
    dropped.length ? h('details', { class: 'card' }, h('summary', {}, `先放下的（${dropped.length}）`), h('div', { class: 'group' }, dropped.map((g) => cell({ href: `#/goal/${g.id}`, title: g.title || g.wish })))) : null);
}

const goalAi = { busy: false };
const goalPaste = {}; // 贴了一半的小结，页面重画不丢
function goalView(id) {
  const d = store.data;
  const g = d.goals.find((x) => x.id === id);
  if (!g) return notFound();
  const today = dayKey();
  const upd = (message, fn) => saveRender(message, (data) => { const x = data.goals.find((y) => y.id === id); if (x) fn(x, data); });
  const back = h('a', { class: 'small', href: '#/goals' }, '‹ 想做到的事');
  if (g.status === 'talking') return h('div', {}, headerSub('和 ChatGPT 聊聊', g.wish), goalTalkCard(g, false), dropRow(g, upd), back);

  const p = goalProgress(g);
  const editTask = (stage, t = null) => {
    const text = h('textarea', { rows: 2, value: t?.text || '', 'aria-label': '这件事' });
    if (t) text.value = t.text;
    const close = openSheet({
      title: t ? '改这件事' : `加一件（${stage.title}）`,
      body: h('div', { class: 'form' }, text,
        t ? h('button', { class: 'danger small', onclick: () => { close(); saveUndoable(`删掉：${t.text}`, (data) => {
          const s = data.goals.find((y) => y.id === id)?.stages.find((y) => y.id === stage.id);
          if (s) s.tasks = s.tasks.filter((y) => y.id !== t.id);
        }, '删掉了').then(render).catch(() => {}); } }, '删掉这件') : null),
      confirmText: '好了',
      onConfirm: () => {
        const v = text.value.trim();
        if (!v) { toast('写一下', 'error'); return false; }
        return upd(t ? '改一件事' : '加一件事', (x) => {
          const s = x.stages.find((y) => y.id === stage.id);
          if (!s) return;
          if (t) { const y = s.tasks.find((z) => z.id === t.id); if (y) y.text = v; } else s.tasks.push({ id: newId('gt'), text: v, done: null });
        });
      },
    });
  };
  const toggle = (stage, t) => upd(t.done ? `没做完：${t.text}` : `做了：${t.text}`, (x) => {
    const y = x.stages.find((s) => s.id === stage.id)?.tasks.find((z) => z.id === t.id);
    if (y) y.done = y.done ? null : today;
  }).then((ok) => { if (ok && !t.done) toast(goalProgress(store.data.goals.find((x) => x.id === id)).allDone ? '都做完了。' : '一步。'); });
  const taskRow = (stage, t) => h('div', { class: `goal-task${t.done ? ' done' : ''}` },
    h('button', { type: 'button', class: 'check', 'aria-pressed': String(Boolean(t.done)), 'aria-label': t.text, onclick: () => toggle(stage, t) }, t.done ? '✓' : ''),
    h('div', { class: 'grow' },
      h('button', { type: 'button', class: 'goal-text', onclick: () => editTask(stage, t) }, t.text),
      t.buy ? h('div', { class: 'goal-buy' },
        h('span', { class: 'muted small' }, `${t.buy.name}${t.buy.price ? ` · 大概 ¥${t.buy.price}` : ''}`),
        h('a', { class: 'chip', href: `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(t.buy.query)}`, target: '_blank', rel: 'noopener' }, '小红书'),
        h('a', { class: 'chip', href: `https://s.taobao.com/search?q=${encodeURIComponent(t.buy.query)}`, target: '_blank', rel: 'noopener' }, '淘宝'),
        t.wishId ? h('span', { class: 'small good-text' }, '在心愿单里了') : h('button', { type: 'button', class: 'chip', onclick: () => goalWishSheet(g, t) }, '放进心愿单')) : null,
      t.done ? h('span', { class: 'muted small block' }, `${relDay(t.done, today)}做的`) : null));
  const habitRow = (x) => {
    const n = habitWeek(d, x.id, today);
    const on = Boolean(d.days[today]?.goals?.[x.id]);
    return h('div', { class: 'goal-habit' },
      h('div', { class: 'grow' }, x.text, h('span', { class: 'muted small block' }, `每周 ${x.perWeek} 次 · 这周 ${n} 次`)),
      h('button', { class: `small ${on ? '' : 'secondary'}`, 'aria-pressed': String(on), onclick: () => saveRender(`习惯：${x.text}`, (data) => {
        const day = dayOf(data, today);
        day.goals ||= {};
        if (day.goals[x.id]) delete day.goals[x.id]; else day.goals[x.id] = true;
      }) }, on ? '今天做了 ✓' : '今天做了'));
  };
  const finish = () => openSheet({
    title: '做到了？',
    body: h('p', {}, `「${g.title}」，会放进里程碑。`),
    confirmText: '做到了',
    onConfirm: () => upd(`做到了：${g.title}`, (x) => { x.status = 'done'; x.doneAt = today; }),
  });
  return h('div', {},
    headerSub(g.title, g.status === 'done' ? `${dayLabel(g.doneAt)}做到了` : g.status === 'dropped' ? '先放下了' : p.allDone ? '都做完了' : `第 ${p.stage + 1} 阶段 · ${p.done}/${p.total}`, helpButton('想做到的事怎么用', GOALS_HELP)),
    h('div', { class: 'card' },
      g.why ? h('p', {}, h('b', {}, '为什么　'), g.why) : null,
      g.key ? h('p', {}, h('b', {}, '关键　'), g.key) : null,
      g.note ? h('p', { class: 'muted small' }, g.note) : null,
      h('p', { class: 'muted small' }, `心愿：${g.wish}`)),
    (g.stages || []).map((s, i) => {
      const body = [h('h3', {}, `${i + 1}. ${s.title}`), s.tasks.map((t) => taskRow(s, t)),
        g.status === 'active' ? h('button', { class: 'link small', onclick: () => editTask(s) }, '＋ 加一件') : null];
      return i > p.stage && g.status === 'active'
        ? h('details', { class: 'card goal-stage later' }, h('summary', {}, `${i + 1}. ${s.title}（之后）`), body.slice(1))
        : h('div', { class: `card goal-stage${i < p.stage ? ' passed' : ''}` }, body);
    }),
    g.habits?.length ? h('div', { class: 'card' }, h('h3', {}, '要养成的习惯'), g.habits.map(habitRow)) : null,
    g.status === 'active' ? [
      h('button', { class: p.allDone ? 'wide' : 'secondary wide', onclick: finish }, '做到了'),
      h('details', { class: 'card' }, h('summary', {}, '想法变了：再和 ChatGPT 聊聊，重新整理'), goalTalkCard(g, true)),
      dropRow(g, upd)] : null,
    g.status === 'dropped' ? h('button', { class: 'secondary wide', onclick: () => upd(`又想做了：${g.title}`, (x) => { x.status = x.stages?.length ? 'active' : 'talking'; delete x.droppedAt; }) }, '又想做了') : null,
    back);
}
function dropRow(g, upd) {
  return h('div', { class: 'center' }, h('button', { class: 'link small muted', onclick: () => saveUndoable(`先放下：${g.title || g.wish}`, (data) => {
    const x = data.goals.find((y) => y.id === g.id); if (x) { x.status = 'dropped'; x.droppedAt = dayKey(); }
  }, '先放下了').then(() => go('#/goals')).catch(() => {}) }, '先放下'));
}

// 复制提示词 → 聊 → 贴回来 → DeepSeek 整理
function goalTalkCard(g, again) {
  const text = goalPrompt(g.wish);
  const paste = h('textarea', { rows: 8, placeholder: '把 ChatGPT「整理一下」写的小结整段贴在这里', 'aria-label': 'ChatGPT 的小结' });
  paste.value = goalPaste[g.id] ?? (again ? '' : g.chat || '');
  paste.addEventListener('input', () => { goalPaste[g.id] = paste.value; });
  const organize = async () => {
    const chat = paste.value.trim();
    if (chat.length < 20) { toast('先把 ChatGPT 的小结贴进来', 'error'); return; }
    goalAi.busy = true; render();
    try {
      const out = await goalPlan(g, chat, again);
      if (!Array.isArray(out.stages) || !out.stages.length) throw new Error('DeepSeek 没整理出来，再试一次');
      const ok = await saveRender(`整理目标：${g.title || g.wish}`, (data) => {
        const x = data.goals.find((y) => y.id === g.id);
        if (!x) return;
        x.chat = again && x.chat ? `${x.chat}\n\n——${dayKey()}——\n${chat}` : chat;
        applyGoalPlan(x, out, newId);
      });
      if (ok) { delete goalPaste[g.id]; toast('整理好了。从第一件开始。'); }
    } catch (e) { toast(e.message, 'error'); }
    goalAi.busy = false; render();
  };
  return h('div', { class: again ? 'form' : 'card form' },
    h('ol', { class: 'small steps' },
      h('li', {}, '点「复制」，打开 ChatGPT 新对话粘贴发送。'),
      h('li', {}, '点语音按钮，和它聊清楚。'),
      h('li', {}, '聊完说「整理一下」，把它写的小结整段复制，贴到下面。')),
    h('details', { class: 'inner' }, h('summary', {}, '看看提示词'), h('p', { class: 'goal-prompt' }, text)),
    h('button', { class: 'secondary small', onclick: () => copyText(text) }, icon('copy'), '复制提示词'),
    paste,
    h('button', { class: 'wide', disabled: goalAi.busy, onclick: organize }, icon('sparkle'), goalAi.busy ? 'DeepSeek 正在整理……' : again ? '让 DeepSeek 重新整理' : '让 DeepSeek 整理'));
}

async function goalPlan(g, chat, again) {
  const [things, wishes] = await Promise.all([goalInventory(), readLedgerFile()]);
  const openWishes = (wishes?.wishes || []).filter((w) => w.status === 'open').map((w) => `${w.name}（¥${w.price}）`);
  const system = [
    '你帮一个大学生把心愿整理成能一步一步做到的目标。他已经和 ChatGPT 聊过，下面是聊完的小结。',
    '要求：',
    '- 用小结里的内容和他的实际情况，不要另外加大道理。说话温和、具体、简短，不说教，不用「你应该」。',
    '- 分 2–4 个阶段，每个阶段 2–5 件小事。每件事要具体、做完能勾掉（比如「把现在的衣服按上班 / 休闲分成两堆」），不要「保持好心态」这种勾不掉的。第一阶段一两周内能做完。',
    '- 需要每周反复做的放进 habits（perWeek 每周几次，1–7），不要放进阶段里。最多 3 个。',
    '- 要买东西的那件事带上 buy：name 东西的名字，price 大概价格（人民币整数，学生价位），query 小红书 / 淘宝的搜索词（4–10 个字，比如「男生 休闲外套 秋季」）。',
    '- 下面有他物品档案里已经有的东西：已经有的就不要叫他买，可以直接用上（比如「休闲的衣服已经有 3 件：……」）。心愿单里已经有的也不要重复买。',
    again ? '- 这是重新整理：他已经做了一些事，做过的事保持原来的文字（这样网站能认出来），没做的可以按新的想法改。' : '',
    '只输出 JSON：{"title":"10 个字以内的名字","why":"一句话","key":"最关键的一两件事，一句话","stages":[{"title":"阶段名","tasks":[{"text":"一件小事","buy":{"name":"","price":0,"query":""}}]}],"habits":[{"text":"","perWeek":2}],"note":"一句给他的话，可以空"}',
    '不需要买东西的 task 不要写 buy。',
  ].filter(Boolean).join('\n');
  const doneTasks = again ? (g.stages || []).flatMap((s) => s.tasks.map((t) => `${t.done ? '✓' : '　'} ${t.text}`)) : [];
  const user = [
    `今天 ${dayKey()}。`,
    `心愿：${g.wish}`,
    `ChatGPT 的小结：\n${chat}`,
    doneTasks.length ? `现在的计划（✓ 是做过的）：\n${doneTasks.join('\n')}` : '',
    things,
    openWishes.length ? `账本心愿单里已经有：${openWishes.join('、')}` : '',
  ].filter(Boolean).join('\n\n');
  return askJson(await aiConfig(), system, user, { maxTokens: 8000, timeout: 150000 });
}

// 物品档案：衣服鞋子写细（风格、季节、颜色、穿了几次、备注），其他东西只写名字和类别
const WEAR_TAGS = ['衣服', '运动服', '鞋'];
async function goalInventory() {
  const inv = readJson('inventory-settings');
  const owner = (settings.repo || DEFAULT_REPO).split('/')[0];
  const g = new GitHub({ token: inv.token || settings.token, repo: inv.repo || `${owner}/inventory-data` });
  let data;
  try { data = JSON.parse(await g.readText('inventory.json', 'main')); } catch { return ''; }
  const items = (data.items || []).filter((i) => !i.archived);
  const clean = (x) => String(x ?? '').replace(/\s+/g, ' ').replace(/\|/g, '/').trim();
  const wear = items.filter((i) => WEAR_TAGS.includes(i.tags?.[0])).map((i) => {
    const f = i.fields || {};
    const style = f['风格'] || (i.tags[0] === '运动服' ? '运动' : '没填（一般是上班穿的正式）');
    const rest = Object.entries(f).filter(([k]) => k !== '风格').map(([k, v]) => `${k}${v}`).join(' ');
    return [i.name, i.tags[0], style, rest, Array.isArray(i.worn) ? `穿了 ${i.worn.length} 次` : '', i.description ? clean(i.description).slice(0, 60) : ''].map(clean).join(' | ');
  });
  const other = items.filter((i) => !WEAR_TAGS.includes(i.tags?.[0])).slice(0, 300).map((i) => `${clean(i.name)}（${clean(i.tags?.[0])}）`);
  return [
    wear.length ? `他的衣服和鞋（物品档案，名称 | 类别 | 风格 | 季节颜色等 | 穿的次数 | 备注）：\n${wear.join('\n')}` : '',
    other.length ? `他宿舍里的其他东西：${other.join('、')}` : '',
  ].filter(Boolean).join('\n\n');
}

// 放进账本的心愿单：确认名字和价格，直接提交到账本仓库
function goalWishSheet(g, t) {
  const name = h('input', { value: t.buy.name, 'aria-label': '想要什么' });
  const price = h('input', { inputmode: 'decimal', value: t.buy.price ? String(t.buy.price) : '', placeholder: '大概多少钱', 'aria-label': '价格' });
  openSheet({
    title: '放进心愿单',
    body: h('div', { class: 'form' }, name, price, h('p', { class: 'muted small' }, `会放进账本的心愿单，写着「为了：${g.title}」。冷静几天、什么时候买，在账本里看。`)),
    confirmText: '放进去',
    onConfirm: async () => {
      const n = Number(price.value.replace(/[，,\s¥]/g, ''));
      if (!name.value.trim()) { toast('写一下名字', 'error'); return false; }
      if (!(n > 0)) { toast('填一个大概的价格', 'error'); return false; }
      const wid = newId('w');
      try {
        await saving('正在放进心愿单…', () => addLedgerWish({ id: wid, name: name.value.trim(), price: Math.round(n * 100) / 100, want: 'want', kind: '', reason: `为了：${g.title}`, link: '', targetDate: '', createdAt: dayKey(), status: 'open' }));
      } catch { return false; }
      await upd2(g.id, t.id, wid);
      toast('放进心愿单了');
      return true;
    },
  });
}
const upd2 = (gid, tid, wid) => saveRender('放进心愿单', (data) => {
  const y = data.goals.find((x) => x.id === gid)?.stages.flatMap((s) => s.tasks).find((x) => x.id === tid);
  if (y) y.wishId = wid;
});
async function addLedgerWish(wish) {
  await updateLedger(`新心愿：${wish.name}（从「生活」）`, (f) => { (f.wishes ||= []).push(wish); });
}

// 首页：每个在做的目标一行进度
function goalLines() {
  const list = store.data.goals.filter((g) => g.status === 'active');
  if (!list.length) return null;
  return h('div', { class: 'goal-lines' }, list.map((g) => h('a', { class: 'goal-line', href: `#/goal/${g.id}` }, icon('sparkle', 'i'), h('span', { class: 'grow' }, goalLine(g)), icon('chev', 'i chev'))));
}

// ---------- 身边的人 ----------

const PEOPLE_HELP = [
  ['记什么', ['家人、亲戚，小学到研究生认识的人。只记名字。', '一个人可以在好几档，第一个选的是主要的。家人、亲戚写上具体关系（妈妈、二姨），研究生里的写导师、师兄、同门、同事……',
    '生日可以选公历或农历，农历每年自动换算成那年的日子；不知道哪年生的可以不填年份。']],
  ['怎么加', ['点右上角 ＋。可以直接填，也可以在第一个框里写一段话（比如「王一，本科同学，河南人，不吃辣，农历八月十二生日」），点「一键补全」，DeepSeek 填好后看一眼再存。']],
  ['来往', ['在一个人的页面点「记一笔来往」：一起吃了饭、他帮了你什么……', '欠了人情想记得还：在那一行点「记成人情」，会记进账本的人情账。也可以直接点「记一个人情」。', '想去的地方里「和谁一起去的」、账本里和他有关的钱和人情，都会出现在他的来往里。']],
  ['生日', ['前一天和当天，在「今天」里出现一行。不推送。', '点「想想送什么」，DeepSeek 按你记的他喜欢什么出几个主意，可以放进账本心愿单（送人）。']],
  ['人情', ['只在法定节假日（元旦、春节、清明、劳动节、端午、中秋、国庆）放假前一天起，「今天」和账本首页问一句欠的人情这次还不还。周末不算。', '「这次不还」就先放着，下个假期再问。「这次还」的，记请客、礼物的钱时在账本里选上这个人情，就算还上了。']],
  ['不再来往', ['归档，不删除。资料和来往都留着，平时不显示，在列表最下面能看到。']],
  ['和账本', ['账本人情账里的人就是这份名单。在账本里新加的人，打开这一页时会出现在「还没分组」。名字在这里改，账本跟着改。']],
];

// 账本的数据（人情、和他有关的钱）：读一次存 5 分钟；读到了只重画看得到它的页面
const ledgerCache = { at: 0, data: null, busy: false };
function ledgerSnap(force = false) {
  if (!ledgerCache.busy && (force || Date.now() - ledgerCache.at > 300000)) {
    ledgerCache.busy = true;
    readLedgerFile().then((f) => {
      ledgerCache.busy = false; ledgerCache.at = Date.now();
      if (!f) return;
      ledgerCache.data = f;
      if (/^\/?$|^\/people|^\/person\/[^/]+$/.test(currentPath()) && !/\/(new|edit)$/.test(currentPath())) render();
    });
  }
  return ledgerCache.data;
}
// 改账本 finance.json：读最新的 → 改 → 提交，冲突重试
async function updateLedger(message, fn) {
  const lg = readJson('ledger-settings');
  const owner = (settings.repo || DEFAULT_REPO).split('/')[0];
  const g = new GitHub({ token: lg.token || settings.token, repo: lg.repo || `${owner}/finance-data` });
  for (let attempt = 0; ; attempt++) {
    const head = await g.headSha();
    const f = JSON.parse(await g.readText('finance.json', head));
    if (fn(f) === false) return f;
    try {
      await g.commit(head, [{ path: 'finance.json', content: JSON.stringify(f, null, 1) + '\n' }], message);
      ledgerCache.data = f; ledgerCache.at = Date.now();
      return f;
    } catch (e) {
      if (!(e instanceof GitHubError && e.status === 422) || attempt === 3) throw e;
    }
  }
}

// 和账本名单对上：账本里新加的搬过来，这边的名字、归档写过去
const peopleSync = { at: 0, busy: false };
async function syncPeople(force = false) {
  if (peopleSync.busy || (!force && Date.now() - peopleSync.at < 60000)) return;
  peopleSync.busy = true;
  try {
    const f = await readLedgerFile();
    if (!f) return;
    ledgerCache.data = f; ledgerCache.at = Date.now();
    const { imports, merges, pushes } = ledgerSync(store.data.people, f.people || []);
    if (imports.length || merges.length) {
      await save(`身边的人：从账本来了 ${imports.length + merges.length} 个`, (data) => {
        for (const m of merges) {
          const p = data.people.find((x) => x.id === m.from);
          if (p) p.id = m.to;
          for (const pl of data.places) for (const v of pl.visits || []) if (v.with) v.with = v.with.map((x) => (x === m.from ? m.to : x));
        }
        for (const x of imports) if (!data.people.some((p) => p.id === x.id)) data.people.push({ id: x.id, name: x.name, groups: [], at: dayKey() });
      });
    }
    const after = ledgerSync(store.data.people, f.people || []).pushes;
    if (after.length) {
      await updateLedger(`人情账名单：${after.map((x) => x.name).join('、')}（从「生活」）`, (fin) => {
        fin.people ||= [];
        for (const x of after) {
          const t = fin.people.find((p) => p.id === x.id);
          if (t) { t.name = x.name; if (x.archived) t.archived = true; else delete t.archived; } else fin.people.push({ id: x.id, name: x.name, ...(x.archived ? { archived: true } : {}) });
        }
      });
    }
    peopleSync.at = Date.now();
    if (/^\/people|^\/person\/[^/]+$/.test(currentPath()) && !/\/(new|edit)$/.test(currentPath()) && (imports.length || merges.length || pushes.length)) render();
  } catch { /* 下次再同步 */ } finally { peopleSync.busy = false; }
}

const peopleState = { archived: false };
function peopleView() {
  const d = store.data;
  const today = dayKey();
  syncPeople();
  const live = d.people.filter((p) => !p.archived);
  const gone = d.people.filter((p) => p.archived);
  const bd = upcomingBirthdays(d.people, today, 30);
  const row = (p, g) => {
    const b = bd.find((x) => x.p.id === p.id);
    const others = (p.groups || []).filter((x) => x !== g).map((x) => PEOPLE_GROUPS[x]);
    return cell({ href: `#/person/${p.id}`, title: p.name,
      sub: [p.rel, mainGroup(p) !== g && mainGroup(p) ? `主要在${PEOPLE_GROUPS[mainGroup(p)]}` : others.length ? `也在${others.join('、')}` : null,
        b ? (b.left === 0 ? '今天生日' : b.left === 1 ? '明天生日' : `${b.left} 天后生日`) : null].filter(Boolean).join(' · ') });
  };
  const sections = Object.entries(PEOPLE_GROUPS).map(([g, name]) => {
    const list = live.filter((p) => (p.groups || []).includes(g)).sort((a, b) => (mainGroup(a) !== g) - (mainGroup(b) !== g) || a.name.localeCompare(b.name, 'zh'));
    return list.length ? [h('div', { class: 'section-title' }, `${name}（${list.length}）`), h('div', { class: 'group' }, list.map((p) => row(p, g)))] : null;
  });
  const loose = live.filter((p) => !(p.groups || []).length);
  return h('div', {},
    headerSub('身边的人', live.length ? `${live.length} 个人` : '家人、亲戚，一路上认识的人',
      h('a', { class: 'icon-btn', href: '#/person/new', 'aria-label': '加一个人' }, icon('plus')), helpButton('身边的人怎么用', PEOPLE_HELP)),
    bd.length ? h('div', { class: 'card birthday-card' }, h('h3', {}, '快到的生日'), bd.slice(0, 5).map((x) => h('a', { class: 'birthday-row', href: `#/person/${x.p.id}` },
      h('span', { class: 'grow' }, h('b', {}, x.p.name), x.p.rel ? ` · ${x.p.rel}` : ''),
      h('span', { class: 'muted small' }, `${x.left === 0 ? '今天' : x.left === 1 ? '明天' : `${x.left} 天后`} · ${Number(x.day.slice(5, 7))}月${Number(x.day.slice(8))}日${x.age ? ` · ${x.age} 岁` : ''}`)))) : null,
    loose.length ? [h('div', { class: 'section-title' }, `还没分组（${loose.length}）`), h('div', { class: 'group' }, loose.map((p) => row(p, '')))] : null,
    sections,
    !d.people.length ? h('div', { class: 'card' }, h('p', { class: 'muted' }, '还没有人。点右上角 ＋ 加第一个。')) : null,
    gone.length ? h('details', { class: 'card', open: peopleState.archived, ontoggle: (e) => { peopleState.archived = e.target.open; } },
      h('summary', {}, `不再来往的（${gone.length}）`),
      h('div', { class: 'group' }, gone.map((p) => cell({ href: `#/person/${p.id}`, title: p.name, sub: [PEOPLE_GROUPS[mainGroup(p)], p.rel, p.archiveNote].filter(Boolean).join(' · ') })))) : null);
}

// 加一个人 / 改资料。第一个框写一段话，「一键补全」让 DeepSeek 填
const personDraft = { id: null, data: null, raw: '', ai: null };
function personEditView(id) {
  const d = store.data;
  const old = id === 'new' ? null : d.people.find((p) => p.id === id);
  if (id !== 'new' && !old) return notFound();
  if (personDraft.id !== id) Object.assign(personDraft, { id, data: structuredClone(old || { groups: [], birthday: null }), raw: '', ai: { busy: false, note: '' } });
  const x = personDraft.data;
  x.groups ||= [];
  const ai = personDraft.ai;
  const input = (k, attrs) => { const el = h(attrs.rows ? 'textarea' : 'input', { ...attrs, oninput: (e) => { x[k] = e.target.value; } }); el.value = x[k] || ''; return el; };
  const raw = h('textarea', { rows: 3, placeholder: '写一段话，比如：王一，本科同学，河南人，不吃辣，农历八月十二生日', 'aria-label': '写一段话', oninput: (e) => { personDraft.raw = e.target.value; } });
  raw.value = personDraft.raw;
  const aiFill = async () => {
    const text = personDraft.raw.trim();
    if (!text) { toast('先写一段话', 'error'); return; }
    ai.busy = true; ai.note = ''; render();
    try {
      const out = await personFromText(text, x);
      Object.assign(x, out);
      ai.note = '填好了，看一眼对不对。';
    } catch (e) { toast(e.message, 'error'); }
    ai.busy = false; render();
  };
  const toggleGroup = (g) => {
    if (x.groups[0] === g) x.groups = x.groups.slice(1);
    else if (x.groups.includes(g)) x.groups = x.groups.filter((y) => y !== g);
    else x.groups = [...x.groups, g];
    render();
  };
  const setMain = (g) => { x.groups = [g, ...x.groups.filter((y) => y !== g)]; render(); };
  const rel = input('rel', { placeholder: '或者自己写', 'aria-label': '关系' });
  const relChips = relChoices(mainGroup(x));
  const b = x.birthday || {};
  const setB = (k, v) => { x.birthday = { cal: 'solar', ...(x.birthday || {}), [k]: v }; if (!x.birthday.m && !x.birthday.d && !x.birthday.y) x.birthday = null; };
  const month = h('select', { 'aria-label': '生日月', onchange: (e) => { setB('m', Number(e.target.value) || null); } },
    h('option', { value: '' }, '月'), Array.from({ length: 12 }, (_, i) => h('option', { value: String(i + 1), selected: b.m === i + 1 }, b.cal === 'lunar' ? `${'正二三四五六七八九十冬腊'[i]}月` : `${i + 1} 月`)));
  const dayOf = h('select', { 'aria-label': '生日日', onchange: (e) => { setB('d', Number(e.target.value) || null); } },
    h('option', { value: '' }, '日'), Array.from({ length: b.cal === 'lunar' ? 30 : 31 }, (_, i) => h('option', { value: String(i + 1), selected: b.d === i + 1 }, b.cal === 'lunar' ? lunarName(1, i + 1).slice(2) : `${i + 1} 日`)));
  const year = h('input', { inputmode: 'numeric', placeholder: '哪年（可以不填）', 'aria-label': '生日年', value: b.y ? String(b.y) : '', oninput: (e) => { setB('y', Number(e.target.value) > 1900 ? Number(e.target.value) : null); } });
  const submit = () => {
    if (!x.name?.trim()) { toast('写个名字', 'error'); return; }
    const name = x.name.trim();
    if (d.people.some((p) => p.name === name && p.id !== old?.id) && !confirm(`已经有一个「${name}」了，还要再加一个吗？`)) return;
    const pid = old?.id || newId('p');
    if (x.birthday && !(x.birthday.m && x.birthday.d)) { toast('生日的月和日都选一下', 'error'); return; }
    if (!x.sex) { toast('选一下男还是女', 'error'); return; }
    saveRender(old ? `改资料：${name}` : `身边的人：${name}`, (data) => {
      const p = { ...x, id: pid, name, log: old?.log || [], at: old?.at || dayKey() };
      for (const k of ['rel', 'how', 'likes', 'note']) { if (typeof p[k] === 'string') p[k] = p[k].trim(); if (!p[k]) delete p[k]; }
      if (!p.birthday) delete p.birthday;
      const i = data.people.findIndex((y) => y.id === pid);
      if (i >= 0) data.people[i] = p; else data.people.push(p);
    }).then((ok) => { if (ok) { personDraft.id = null; syncPeople(true); toast(old ? '改好了' : '记下了。'); go(`#/person/${pid}`, true); } });
  };
  return h('div', { class: 'form' },
    headerSub(old ? '改资料' : '加一个人', old ? old.name : '名字之外都可以不填'),
    old ? null : h('div', { class: 'card' }, raw, h('div', { class: 'ai-fill' },
      h('button', { class: 'small secondary', disabled: ai.busy, onclick: aiFill }, ai.busy ? '正在填……' : '一键补全'),
      h('span', { class: 'muted small' }, '名字、分组、关系、生日……')), ai.note ? h('p', { class: 'small muted' }, ai.note) : null),
    h('div', { class: 'card' },
      input('name', { placeholder: '名字', 'aria-label': '名字' }),
      h('div', { class: 'chips sex-chips', role: 'group', 'aria-label': '男女' }, Object.entries(SEX).map(([k, t]) => h('button', {
        type: 'button', class: `chip${x.sex === k ? ' on' : ''}`, 'aria-pressed': String(x.sex === k), onclick: () => { x.sex = x.sex === k ? undefined : k; render(); } }, t))),
      h('div', { class: 'label-sm' }, '在哪一档（可以多选，第一个是主要的）'),
      h('div', { class: 'chips', role: 'group', 'aria-label': '分组' }, Object.entries(PEOPLE_GROUPS).map(([g, t]) => {
        const on = x.groups.includes(g);
        return h('button', { type: 'button', class: `chip${on ? ' on' : ''}${x.groups[0] === g ? ' main' : ''}`, 'aria-pressed': String(on), onclick: () => toggleGroup(g) }, x.groups[0] === g && x.groups.length > 1 ? `${t} · 主要` : t);
      })),
      x.groups.length > 1 ? h('div', { class: 'chips small-chips', role: 'group', 'aria-label': '主要的档' }, h('span', { class: 'muted small' }, '主要的：'),
        x.groups.map((g) => h('button', { type: 'button', class: `chip${x.groups[0] === g ? ' on' : ''}`, 'aria-pressed': String(x.groups[0] === g), onclick: () => setMain(g) }, PEOPLE_GROUPS[g]))) : null,
      relChips.length ? [h('div', { class: 'label-sm' }, mainGroup(x) === 'family' || mainGroup(x) === 'relative' ? '是你的' : `${ta(x)}是`),
        h('div', { class: 'chips', role: 'group', 'aria-label': '关系' }, relChips.map((r) => h('button', { type: 'button', class: `chip${x.rel === r ? ' on' : ''}`, 'aria-pressed': String(x.rel === r), onclick: () => { x.rel = x.rel === r ? '' : r; render(); } }, r))), rel]
        : [h('div', { class: 'label-sm' }, '关系'), rel]),
    h('div', { class: 'card' }, h('h3', {}, '生日'),
      h('div', { class: 'chips', role: 'group', 'aria-label': '公历还是农历' }, [['solar', '公历'], ['lunar', '农历']].map(([k, t]) => h('button', {
        type: 'button', class: `chip${(b.cal || 'solar') === k ? ' on' : ''}`, 'aria-pressed': String((b.cal || 'solar') === k), onclick: () => { x.birthday = { ...(x.birthday || {}), cal: k }; render(); } }, t))),
      h('div', { class: 'row-2' }, month, dayOf), year,
      x.birthday?.m && x.birthday?.d ? h('p', { class: 'muted small' }, `下一次：${(() => { const n = nextBirthday(x.birthday, dayKey()); return n ? `${Number(n.slice(0, 4))}年${Number(n.slice(5, 7))}月${Number(n.slice(8))}日` : '算不出来'; })()}`) : null),
    h('div', { class: 'card detail-card' }, h('h3', {}, `关于${ta(x)}`),
      h('div', { class: 'detail-row' }, h('div', { class: 'detail-label' }, icon('people', 'i'), '怎么认识的'), input('how', { class: 'bare', rows: 2, placeholder: '比如：大一军训同一个连', 'aria-label': '怎么认识的' })),
      h('div', { class: 'detail-row' }, h('div', { class: 'detail-label' }, icon('sparkle', 'i'), '喜欢什么、不吃什么'), input('likes', { class: 'bare', rows: 2, placeholder: '比如：爱喝茶，不吃辣', 'aria-label': '喜欢什么' })),
      h('div', { class: 'detail-row' }, h('div', { class: 'detail-label' }, icon('pen', 'i'), '近况、要记得的'), input('note', { class: 'bare', rows: 2, placeholder: '比如：在准备考研', 'aria-label': '近况' }))),
    h('div', { class: 'actions sticky' }, h('button', { class: 'grow', onclick: submit }, '存好'),
      h('a', { class: 'button secondary', href: old ? `#/person/${old.id}` : '#/people', onclick: () => { personDraft.id = null; } }, '取消')));
}

async function personFromText(text, cur) {
  const groups = Object.entries(PEOPLE_GROUPS).map(([k, v]) => `${k} ${v}`).join('、');
  const system = '你帮一个研究生整理他身边的人的资料。他会写一段话，把里面说到的信息填进 JSON，没说到的留空，绝对不要编。'
    + `groups 是他从哪一段认识的这个人，只能从这些里选（写英文键）：${groups}。第一个是主要的；同一个人可能在两段都认识（比如本科同学后来成了研究生同门）。家人（父母兄弟姐妹、祖父母）用 family，其他亲戚用 relative。`
    + 'rel 是关系，简短：家人亲戚写具体称呼（妈妈、二姨、表哥）；研究生阶段写导师、老师、师兄、师姐、同门、师弟、师妹、同学、同事之一；其他写同学、老师、朋友。'
    + 'birthday：说了农历就 cal 写 lunar，否则 solar；m 月 d 日 y 年（数字，没说就 null）。'
    + 'sex：男 m，女 f，没说就空（师姐、妈妈这类称呼也能看出来）。'
    + 'how 怎么认识的；likes 喜欢什么、不吃什么、口味爱好；note 近况和其他要记得的事。name 只写名字。'
    + '只输出 JSON：{"name":"","sex":"","groups":[],"rel":"","birthday":{"cal":"solar","m":null,"d":null,"y":null},"how":"","likes":"","note":""}';
  const out = await askJson(await aiConfig(), system, text, { maxTokens: 2000, timeout: 60000 });
  const res = {};
  const s = (v) => (typeof v === 'string' ? v.trim() : '');
  if (s(out.name) && !cur.name?.trim()) res.name = s(out.name);
  if (SEX[out.sex] && !cur.sex) res.sex = out.sex;
  const gs = (out.groups || []).filter((g) => PEOPLE_GROUPS[g]);
  if (gs.length) res.groups = [...new Set(gs)];
  for (const k of ['rel', 'how', 'likes', 'note']) if (s(out[k])) res[k] = s(out[k]);
  const bd = out.birthday;
  if (bd && Number(bd.m) >= 1 && Number(bd.m) <= 12 && Number(bd.d) >= 1 && Number(bd.d) <= 31) {
    res.birthday = { cal: bd.cal === 'lunar' ? 'lunar' : 'solar', m: Number(bd.m), d: Number(bd.d), ...(Number(bd.y) > 1900 ? { y: Number(bd.y) } : {}) };
  }
  return res;
}

const giftState = {}; // { 人 id: { busy, ideas } }，页面重画不丢
function personView(id) {
  const d = store.data;
  const p = d.people.find((x) => x.id === id);
  if (!p) return notFound();
  syncPeople();
  const today = dayKey();
  const ledger = ledgerSnap();
  const tl = timeline(d, ledger, id);
  const owe = moneyWith(ledger, id);
  const openFavors = (ledger?.favors || []).filter((f) => f.person === id && f.status !== 'done');
  const next = p.birthday?.m ? nextBirthday(p.birthday, today) : null;
  const left = next ? daysBetween(today, next) : null;
  const gs = giftState[id] ||= { busy: false, ideas: null };
  const upd = (message, fn) => saveRender(message, (data) => { const x = data.people.find((y) => y.id === id); if (x) fn(x); });
  const logSheet = (l = null) => {
    const day = h('input', { type: 'date', value: l?.day || today, 'aria-label': '哪天' });
    const text = h('textarea', { rows: 3, placeholder: '比如：一起吃了饭，他帮我改了简历', 'aria-label': '发生了什么' });
    text.value = l?.text || '';
    const close = openSheet({
      title: l ? '改这一笔' : '记一笔来往',
      body: h('div', { class: 'form' }, h('label', {}, '哪天', day), text,
        l ? h('button', { class: 'danger small', onclick: () => { close(); upd('删掉一笔来往', (x) => { x.log = x.log.filter((y) => y.id !== l.id); }); } }, '删掉这一笔') : null),
      confirmText: '存好',
      onConfirm: () => {
        if (!text.value.trim()) { toast('写一句', 'error'); return false; }
        return upd(`来往：${p.name}`, (x) => {
          x.log ||= [];
          const rec = { id: l?.id || newId('l'), day: day.value || today, text: text.value.trim(), ...(l?.favor ? { favor: l.favor } : {}) };
          const i = x.log.findIndex((y) => y.id === rec.id);
          if (i >= 0) x.log[i] = rec; else x.log.push(rec);
        });
      },
    });
  };
  const favorSheet = (l = null) => {
    let dir = 'owe';
    const text = h('input', { placeholder: '什么事，比如 帮我改论文', 'aria-label': '什么事', value: l?.text?.slice(0, 40) || '' });
    const day = h('input', { type: 'date', value: l?.day || today, 'aria-label': '哪天' });
    const dirRow = h('div', {});
    const drawDir = () => dirRow.replaceChildren(choiceRow('谁欠谁', [['owe', `我欠${ta(p)}`], ['owed', `${ta(p)}欠我`]], dir, (v) => { dir = v || dir; drawDir(); }));
    drawDir();
    openSheet({
      title: '记一个人情', body: h('div', { class: 'form' }, dirRow, text, h('label', {}, '哪天', day),
        h('p', { class: 'muted small' }, '记进账本的人情账。节假日会问一句这次还不还。')),
      confirmText: '记好了',
      onConfirm: async () => {
        if (!text.value.trim()) { toast('写一下是什么事', 'error'); return false; }
        const fid = newId('f');
        try {
          await saving('正在记进账本…', async () => {
            await syncPeople(true);
            await updateLedger(`人情：${p.name}（从「生活」）`, (f) => {
              (f.favors ||= []).push({ id: fid, person: id, dir, text: text.value.trim(), date: day.value || today, createdAt: new Date().toISOString(), status: 'open' });
              f.people ||= [];
              if (!f.people.some((x) => x.id === id)) f.people.push({ id, name: p.name });
            });
          });
        } catch { return false; }
        if (l) await upd('来往：记成了人情', (x) => { const y = x.log.find((z) => z.id === l.id); if (y) y.favor = fid; });
        else render();
        toast('记进人情账了');
        return true;
      },
    });
  };
  const archive = () => {
    const why = h('input', { placeholder: '一句话（可以不写）', 'aria-label': '为什么' });
    openSheet({
      title: `不再和${p.name}来往`, body: h('div', { class: 'form' }, why, h('p', { class: 'muted small' }, '资料和来往都留着，平时不显示。随时可以恢复。')),
      confirmText: '归档',
      onConfirm: () => upd(`归档：${p.name}`, (x) => { x.archived = today; if (why.value.trim()) x.archiveNote = why.value.trim(); }).then((ok) => { if (ok) syncPeople(true); return ok; }),
    });
  };
  const unarchive = () => upd(`恢复：${p.name}`, (x) => { delete x.archived; delete x.archiveNote; }).then(() => syncPeople(true));
  const gift = async () => {
    gs.busy = true; render();
    try { gs.ideas = await giftIdeas(p, ledger, next); } catch (e) { toast(e.message, 'error'); }
    gs.busy = false; render();
  };
  const groupsText = (p.groups || []).map((g, i) => (i === 0 ? PEOPLE_GROUPS[g] : `也在${PEOPLE_GROUPS[g]}`)).join(' · ');
  return h('div', {},
    headerSub(p.name, [SEX[p.sex], groupsText || '还没分组', p.rel].filter(Boolean).join(' · '), h('a', { class: 'icon-btn', href: `#/person/${id}/edit`, 'aria-label': '改资料' }, icon('pen'))),
    p.archived ? h('div', { class: 'card muted-card' }, h('p', { class: 'small' }, `${p.archived} 起不再来往${p.archiveNote ? `：${p.archiveNote}` : ''}`), h('button', { class: 'link small', onclick: unarchive }, '恢复来往')) : null,
    h('div', { class: 'card person-card' },
      p.birthday?.m ? h('p', {}, icon('calendar', 'i'), ` ${birthdayText(p.birthday)}`, left != null ? h('span', { class: 'muted small' }, left === 0 ? ' · 就是今天' : ` · 还有 ${left} 天`) : null) : null,
      p.how ? h('p', { class: 'small' }, h('span', { class: 'muted' }, '怎么认识的：'), p.how) : null,
      p.likes ? h('p', { class: 'small' }, h('span', { class: 'muted' }, '喜欢：'), p.likes) : null,
      p.note ? h('p', { class: 'small' }, h('span', { class: 'muted' }, '要记得：'), p.note) : null,
      !p.birthday?.m && !p.how && !p.likes && !p.note ? h('p', { class: 'muted small' }, '还没写什么。点右上角的笔补上。') : null),
    h('div', { class: 'actions' },
      h('button', { onclick: () => logSheet() }, '记一笔来往'),
      h('button', { class: 'secondary', onclick: () => favorSheet() }, '记一个人情'),
      p.archived ? null : h('button', { class: 'secondary', disabled: gs.busy, onclick: gift }, gs.busy ? '正在想……' : '想想送什么')),
    gs.ideas ? giftCard(p, gs, next) : null,
    openFavors.length || owe ? h('div', { class: 'card favor-sum' },
      openFavors.map((f) => h('p', { class: 'small' }, h('span', { class: `favor-dir ${f.dir}` }, f.dir === 'owe' ? `欠${ta(p)}` : '欠我'), ` ${f.text}`, h('span', { class: 'muted' }, ` · ${f.date.slice(5).replace('-', '/')}`))),
      owe ? h('p', { class: 'small muted' }, owe > 0 ? `钱：${ta(p)}欠你 ¥${owe}` : `钱：你欠${ta(p)} ¥${-owe}`) : null,
      h('a', { class: 'small', href: `../ledger/#/person/${id}`, target: '_blank', rel: 'noopener' }, '在账本里看')) : null,
    h('div', { class: 'section-title' }, tl.length ? '来往' : ''),
    tl.length ? h('div', { class: 'card timeline' }, tl.map((e) => h('div', { class: `tl-row ${e.kind}` },
      h('span', { class: 'tl-day muted small' }, e.day.slice(0, 4) === today.slice(0, 4) ? e.day.slice(5).replace('-', '/') : e.day),
      e.kind === 'log' ? h('button', { type: 'button', class: 'grow tl-text', onclick: () => logSheet(e.log) }, e.text)
        : e.href ? h('a', { class: 'grow tl-text', href: e.href }, e.text) : h('span', { class: 'grow tl-text' }, e.text),
      e.kind === 'log' && !e.log.favor ? h('button', { class: 'link small', onclick: () => favorSheet(e.log) }, '记成人情') : null)))
      : h('p', { class: 'muted small center' }, '还没有来往的记录。'),
    p.archived ? null : h('p', { class: 'center' }, h('button', { class: 'link small muted', onclick: archive }, '不再来往了')),
    h('a', { class: 'small', href: '#/people' }, '‹ 身边的人'));
}

// 想想送什么：DeepSeek 按记下的喜好出主意，可以放进账本心愿单（送人）
async function giftIdeas(p, ledger, next) {
  const given = (ledger?.favors || []).filter((f) => f.person === p.id).map((f) => `${f.dir === 'owe' ? `${ta(p)}帮过我` : `我帮过${ta(p)}`}：${f.text}${f.status === 'done' ? `（还了${f.doneNote ? `：${f.doneNote}` : ''}）` : ''}`);
  const wishes = (ledger?.wishes || []).filter((w) => w.status === 'open' && w.kind === 'gift').map((w) => `${w.name}（¥${w.price}）`);
  const system = '你帮一个研究生想送身边的人什么礼物。按下面记的这个人的情况，出 3–5 个具体的主意：学生买得起、实用或有心意，和他的喜好、近况对得上；不要泛泛的「鲜花」「贺卡」。'
    + '每个主意：name 东西（具体一点），price 大概多少钱（人民币整数），why 一句话为什么适合他，query 淘宝 / 小红书的搜索词（4–10 个字）。说话温和简短。'
    + '只输出 JSON：{"ideas":[{"name":"","price":0,"why":"","query":""}]}';
  const user = [
    `${p.name}，${[SEX[p.sex], PEOPLE_GROUPS[mainGroup(p)], p.rel].filter(Boolean).join('，')}。`,
    next ? `生日是 ${next}（今天 ${dayKey()}）。` : `今天 ${dayKey()}。`,
    p.how ? `怎么认识的：${p.how}` : '', p.likes ? `喜欢什么、不吃什么：${p.likes}` : '', p.note ? `近况：${p.note}` : '',
    (p.log || []).length ? `最近的来往：${p.log.slice(-8).map((l) => `${l.day} ${l.text}`).join('；')}` : '',
    given.length ? `人情：${given.join('；')}` : '',
    wishes.length ? `心愿单里已经有要送人的：${wishes.join('、')}` : '',
  ].filter(Boolean).join('\n');
  const out = await askJson(await aiConfig(), system, user, { maxTokens: 3000, timeout: 90000 });
  return (out.ideas || []).filter((x) => x?.name).slice(0, 6);
}
function giftCard(p, gs, next) {
  const toWish = (it) => {
    const name = h('input', { value: it.name, 'aria-label': '想要什么' });
    const price = h('input', { inputmode: 'decimal', value: it.price ? String(it.price) : '', placeholder: '大概多少钱', 'aria-label': '价格' });
    openSheet({
      title: '放进心愿单（送人）',
      body: h('div', { class: 'form' }, name, price, h('p', { class: 'muted small' }, `写着「送${p.name}」${next ? `，${Number(next.slice(5, 7))}月${Number(next.slice(8))}日前送出去` : ''}。`)),
      confirmText: '放进去',
      onConfirm: async () => {
        const n = Number(price.value.replace(/[，,\s¥]/g, ''));
        if (!name.value.trim()) { toast('写一下名字', 'error'); return false; }
        if (!(n > 0)) { toast('填一个大概的价格', 'error'); return false; }
        try {
          await saving('正在放进心愿单…', () => updateLedger(`新心愿：${name.value.trim()}（从「生活」）`, (f) => {
            (f.wishes ||= []).push({ id: newId('w'), name: name.value.trim(), price: Math.round(n * 100) / 100, want: 'want', kind: 'gift', reason: `送${p.name}${it.why ? `：${it.why}` : ''}`,
              link: '', targetDate: next || '', createdAt: dayKey(), status: 'open' });
          }));
        } catch { return false; }
        it.added = true; render();
        toast('放进心愿单了');
        return true;
      },
    });
  };
  return h('div', { class: 'card gift-card' }, h('h3', {}, '可以送的'),
    gs.ideas.map((it) => h('div', { class: 'gift-row' },
      h('div', {}, h('b', {}, it.name), it.price ? h('span', { class: 'muted small' }, ` · 约 ¥${it.price}`) : null),
      it.why ? h('p', { class: 'small muted' }, it.why) : null,
      h('div', { class: 'chips' },
        it.query ? h('a', { class: 'chip', href: `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(it.query)}`, target: '_blank', rel: 'noopener' }, '小红书') : null,
        it.query ? h('a', { class: 'chip', href: `https://s.taobao.com/search?q=${encodeURIComponent(it.query)}`, target: '_blank', rel: 'noopener' }, '淘宝') : null,
        it.added ? h('span', { class: 'chip on' }, '在心愿单里了') : h('button', { type: 'button', class: 'chip', onclick: () => toWish(it) }, '放进心愿单')))),
    h('button', { class: 'link small', onclick: () => { gs.ideas = null; render(); } }, '收起'));
}

// 「今天」里的：生日（前一天、当天）、节假日问人情这次还不还
function peopleAlerts(today) {
  const d = store.data;
  const out = [];
  for (const x of upcomingBirthdays(d.people, today, 1)) {
    out.push(alertLine(`${x.left === 0 ? '今天' : '明天'}是${x.p.name}的生日${x.age ? `（${x.age} 岁）` : ''}`, { href: `#/person/${x.p.id}`, tone: 'soft' }));
  }
  const ledger = ledgerSnap();
  const hol = holidayAround(today);
  if (!ledger || !hol) return out;
  const pname = (id) => d.people.find((p) => p.id === id)?.name || (ledger.people || []).find((p) => p.id === id)?.name || '某人';
  const list = (ledger.favors || []).filter((f) => f.dir === 'owe' && f.status !== 'done' && f.skip !== hol.key && f.date <= today);
  const mark = (f, k) => saving('正在记进账本…', () => updateLedger(k === 'plan' ? `人情：这个假期还 ${pname(f.person)}（从「生活」）` : `人情：这次先不还 ${pname(f.person)}（从「生活」）`, (fin) => {
    const x = (fin.favors || []).find((y) => y.id === f.id);
    if (!x) return false;
    x[k] = hol.key;
  })).then(render).catch(() => {});
  for (const f of list.filter((y) => y.plan !== hol.key)) {
    out.push(alertLine(`${holidayLine(hol, today)}。还欠${pname(f.person)}一个人情：${f.text}，这次还吗？`, { action: h('span', { class: 'alert-actions' },
      h('button', { class: 'small secondary', onclick: () => mark(f, 'plan') }, '这次还'),
      h('button', { class: 'link small', onclick: () => mark(f, 'skip') }, '这次不还')) }));
  }
  const plan = list.filter((y) => y.plan === hol.key);
  if (plan.length) out.push(alertLine(`这个假期要还：${plan.map((f) => `${pname(f.person)}（${f.text}）`).join('、')}。花了钱的在账本记的时候选上它`, { href: `#/person/${plan[0].person}`, tone: 'soft' }));
  return out;
}

// ---------- 更多 ----------

function moreView() {
  return h('div', {},
    header('生活'),
    h('div', { class: 'group' },
      cell({ href: '#/goals', ic: 'sparkle', color: 'var(--accent)', title: '想做到的事', sub: '心愿 → 一步一步能做到的事' }),
      cell({ href: '#/places', ic: 'globe', color: 'var(--good)', title: '想去的地方', sub: '地图、周末去哪、足迹' }),
      cell({ href: '#/people', ic: 'people', color: 'var(--amber)', title: '身边的人', sub: '家人、亲戚、一路上认识的人' }),
      cell({ href: '#/english', ic: 'globe', color: 'var(--blue)', title: '英语陪练', sub: '和 ChatGPT 语音聊' }),
      cell({ href: '#/sick/book', ic: 'shield', color: 'var(--danger)', title: '生病手册', sub: '我的经验、预案' })),
    h('div', { class: 'group' },
      cell({ href: '#/stats', ic: 'chart', color: 'var(--blue)', title: '分析和回顾', sub: '什么在影响我、作息、周报月报' }),
      cell({ href: '#/history', ic: 'list', color: 'var(--amber)', title: '最近的记录', sub: '这周的你、一年前的今天' })),
    h('div', { class: 'group' },
      cell({ href: '#/periodic', ic: 'calendar', color: 'var(--muted)', title: '定期打理', sub: '剪指甲、换床单这些，到日子才出现' })),
    h('div', { class: 'group' },
      cell({ href: '#/settings', ic: 'gear', color: 'var(--muted)', title: '设置' })));
}

// ---------- 设置 ----------

function setupView() {
  const start = async () => {
    try {
      await saving('正在创建…', () => store.create(defaultData(dayKey()), '开始记录'));
      toast('建好了');
      go('#/', true);
    } catch { /* 已提示 */ }
  };
  return h('div', {},
    headerSub('开始记录', '数据仓库里还没有记录'),
    h('div', { class: 'card' }, h('p', {}, '点下面的按钮，在数据仓库里建一份空的记录。'), h('button', { class: 'wide', onclick: start }, '开始')));
}

function pushCard() {
  const status = h('p', { class: 'muted small' }, '检查中……');
  const sup = pushSupport();
  const enable = async () => {
    try {
      await saving('正在开启……', async () => {
        const sub = await subscribe();
        await store.saveJson(PUSH_FILE, (cfg) => {
          const subs = (cfg.subscriptions || []).filter((x) => x.endpoint !== sub.endpoint);
          return { ...cfg, subscriptions: [...subs, { ...sub, device: deviceName(), added: dayKey() }] };
        }, `开启推送：${deviceName()}`);
      });
      toast('已开启，应该马上收到一条「提醒已开启」');
      render();
    } catch { /* saving 已提示 */ }
  };
  if (sup.ok) {
    currentSubscription().then((sub) => {
      status.textContent = sub ? `✓ 这台设备已开启（${Notification.permission === 'granted' ? '通知已允许' : '通知没允许'}）` : '这台设备还没开启';
    }).catch(() => { status.textContent = '这台设备还没开启'; });
  } else {
    status.textContent = sup.why;
  }
  return h('div', { class: 'card' },
    h('h3', {}, '手机提醒'),
    h('p', { class: 'small' }, '每晚 22:30 左右一条：今天的一句话还没写、还没祷告就提醒你；周日加一句写这周的感恩。都做了就不发。锁屏上只显示「睡前」，看不出内容。'),
    h('p', { class: 'small muted' }, 'iPhone 上要先「分享 → 添加到主屏幕」，从主屏幕的「生活」打开再点开启。和账本、物品档案的提醒是分开的。'),
    status,
    sup.ok ? h('button', { class: 'secondary', onclick: enable }, '在这台设备上开启') : null);
}

function privateSettingsCard() {
  const d = store.data;
  const rhythm = h('input', { inputmode: 'numeric', value: d.settings.rhythmDays || 2, 'aria-label': '节奏（几天一次）' });
  const changePin = () => {
    const old = h('input', { type: 'password', inputmode: 'numeric', maxlength: 6, placeholder: '现在的密码', 'aria-label': '现在的密码' });
    const a = h('input', { type: 'password', inputmode: 'numeric', maxlength: 6, placeholder: '新密码（6 位数字）', 'aria-label': '新密码' });
    const b = h('input', { type: 'password', inputmode: 'numeric', maxlength: 6, placeholder: '再输一遍', 'aria-label': '再输一遍新密码' });
    openSheet({
      title: '改小记的密码', body: h('div', { class: 'form' }, old, a, b, h('p', { class: 'muted small' }, '忘了现在的密码：让 Claude 帮你在数据仓库里清掉，再重新设。')), confirmText: '改好',
      onConfirm: async () => {
        if (!(await checkPin(old.value, d.settings.pin))) { toast('现在的密码不对', 'error'); return false; }
        if (!/^\d{6}$/.test(a.value) || a.value !== b.value) { toast('新密码要 6 位数字，两次一样', 'error'); return false; }
        const rec = await makePin(a.value);
        return saveRender('小记：改密码', (data) => { data.settings.pin = rec; }).then(() => toast('改好了'));
      },
    });
  };
  return h('div', { class: 'card form' },
    h('h3', {}, '小记'),
    h('label', {}, '节奏：几天一次', rhythm),
    h('label', { class: 'switch-row' }, h('input', { type: 'checkbox', checked: d.settings.checks !== false, onchange: (e) => saveRender('小记：勾选', (data) => { data.settings.checks = e.target.checked; }) }), '记完弹出勾选'),
    h('div', { class: 'actions' },
      h('button', { class: 'secondary small', onclick: () => { const n = Number(rhythm.value); if (n > 0) saveRender('小记：节奏', (data) => { data.settings.rhythmDays = n; }).then(() => toast('存好了')); } }, '存好节奏'),
      d.settings.pin ? h('button', { class: 'secondary small', onclick: changePin }, '改密码') : null));
}

function settingsView() {
  const repo = h('input', { value: settings.repo || DEFAULT_REPO, 'aria-label': '数据仓库' });
  const token = h('input', { type: 'password', value: settings.shared ? '' : settings.token || '', placeholder: settings.shared ? '正在用物品档案的令牌' : 'github_pat_…', 'aria-label': '令牌' });
  const saveSettings = () => {
    const t = token.value.trim();
    const old = readJson(SETTINGS_KEY);
    writeJson(SETTINGS_KEY, { repo: repo.value.trim() || DEFAULT_REPO, ...(t ? { token: t } : old.token ? { token: old.token } : {}) });
    settings = readSettings();
    if (!settings.token) return toast('请填写令牌', 'error');
    connect();
    loadError = null;
    const after = sessionStorage.getItem('life-after-login');
    sessionStorage.removeItem('life-after-login');
    go(after || '#/', true);
    refresh();
  };
  const logout = () => {
    if (!confirm('退出这台设备？\n数据在 GitHub 上，不会丢；以后重新填令牌就能回来。')) return;
    localStorage.removeItem(SETTINGS_KEY);
    localStorage.removeItem('life-cache');
    settings = {};
    store = null;
    go('#/settings', true);
  };
  return h('div', {},
    header('设置'),
    h('div', { class: 'card' },
      h('h3', {}, '连接数据仓库'),
      h('p', { class: 'small' }, '记录存在你的 GitHub 私有仓库 life-data 里。和物品档案、账本用同一个令牌，只要让令牌多授权这个仓库：'),
      h('ol', { class: 'small' },
        h('li', {}, '打开 github.com → 右上角头像 → Settings → Developer settings → Personal access tokens → Fine-grained tokens。'),
        h('li', {}, '点物品档案用的那个令牌 → Edit。'),
        h('li', {}, 'Repository access 里把 life-data 也勾上（Contents 权限已经是 Read and write）→ Update。'),
        h('li', {}, '回到这里点「保存并连接」。令牌本身没变，不用重新复制。')),
      h('div', { class: 'form' },
        h('label', {}, '数据仓库', repo),
        h('label', {}, settings.shared ? '令牌（留空 = 用物品档案的）' : '令牌', token)),
      h('button', { class: 'wide', onclick: saveSettings }, '保存并连接')),
    settings.token && store?.data ? pushCard() : null,
    settings.token && store?.data ? privateSettingsCard() : null,
    settings.token ? h('div', { class: 'card' },
      h('p', { class: 'small' }, '数据仓库：', settings.repo || DEFAULT_REPO, '（每次修改都是一次提交，可以在 GitHub 上查看历史）'),
      h('div', { class: 'actions' }, h('button', { class: 'danger', onclick: logout }, '退出这台设备'))) : null);
}

boot();
