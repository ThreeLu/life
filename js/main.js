import { GitHub, GitHubError } from './github.js';
import { Store, newId, diff, apply as applyPatch } from './store.js';
import {
  defaultData, dayKey, addDays, daysBetween, weekOf, weekLabel, hm, parseDay, WHEN, routineOf, careDone, weekCount,
  periodicDue, periodicTomorrow, eventsOn, privateStats,
  prayedOn,
  dailyCheer, newMilestones, careFullDay, showeredOn, careSkipped,
  seasonWarning,
  fetchRows, fetchState, solarTerm, lowLessons, goodDays, 
  goalProgress, goalLine, habitWeek, goalWeekDone, applyGoalPlan, lookMonth, careItemRates, careDots,
} from './life.js';
import {
  VERSES, verseFor, prayerPrompt, quickPrayerPrompt,
  goalPrompt, CHAT_MOODS, CHAT_RECORD_PROMPT,
  CHEER_ON, cheerNight, MILESTONE_TEXT, LOW_KINDS, LOW_VERSES, HOTLINES, SELF_LINES,
} from './content.js';
import { pushSupport, subscribe, currentSubscription, deviceName, PUSH_FILE } from './push.js';
import { h, compressImage, blobToBase64 } from './util.js';
import { askJson } from './ai.js';
import { PLACE_KINDS, parseShare, cleanCandidates, visited, lastVisit, bestScore, weekendPicks, districtProgress, footprints, weekendDays, wgsToGcj } from './places.js';
import {
  MIN_DAYS, influences, influenceText, moodDays, series, sleepPattern, sleepHours, bedMinutes, bedLabel, rhythm, weekdayMood,
  gentleNote, periodSummary, rangeDays, seriesRange, weekGrid, careInRange, gaps, yearData,
} from './stats.js';
import { lineChart, barChart, monthGrid, sleepBars, yearCalendar } from './charts.js';
import { advisorOutlook, ADVISOR_REMIND, ADVISOR_MIN } from './advisor.js';
import { mainGrid, cellRing, cellOf, districtAt, fogProgress, metroProgress, metroStations, HEX_KM } from './fog.js';
import { MAIN_DISTRICTS, METRO } from './jinan.js';
import { forecastDay, forecastWeek, forecastHistory, forecastTip, forecastEffects, energyWord, FORECAST_MIN, FORECAST_SURE } from './forecast.js';
import { icon } from './icons.js';
import { personPicker, recentIds } from './picker.js';
import { FAVOR_BIG, estimatePrompt, cleanEstimate } from './renqing.js';
import { PEOPLE_GROUPS, SEX, RANKS, RANK_ORDER, rankOf, personHint, ta, relChoices, mainGroup, upcomingBirthdays, upcomingDates, giftsWith, giftSummary, ledgerSync, moneyWith, timeline } from './people.js';
import { nextBirthday, birthdayText, lunarName, holidayAround, holidayLine, GREET_DAYS, festivalDay, festivalsAround } from './cal.js';

const SETTINGS_KEY = 'life-settings';
const DEFAULT_REPO = 'ThreeLu/life-data';
const EDITING_ROUTES = /^\/(night|pray\/go|chat\/new|chat\/[^/]+\/edit|p$|p\/s|place\/|ask|person\/new|person\/[^/]+\/edit)/;

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
  [/^\/look$/, (_, q) => lookView(q)],
  [/^\/pray$/, () => prayView()],
  [/^\/pray\/go$/, (_, q) => prayGoView(q.m)],
  [/^\/photos$/, (_, q) => photosView(q.m)],
  [/^\/places$/, () => placesView()],
  [/^\/place\/([^/]+)\/edit$/, (id) => placeEditView(id)],
  [/^\/place\/new$/, () => placeEditView('new')],
  [/^\/place\/([^/]+)$/, (id) => placeView(id)],
  [/^\/stats$/, () => statsView()],
  [/^\/report$/, (_, q) => lookView({ mode: q.k, day: q.d })], // 老链接
  [/^\/ask$/, () => askView()],
  [/^\/p$/, () => privateView()],
  [/^\/periodic$/, () => periodicView()],
  [/^\/advisor$/, () => advisorView()],
  [/^\/forecast$/, () => forecastView()],
  [/^\/chats$/, () => chatsView()],
  [/^\/chat\/new$/, (_, q) => chatEditView('new', q)],
  [/^\/chat\/([^/]+)\/edit$/, (id) => chatEditView(id)],
  [/^\/chat\/([^/]+)$/, (id) => chatView(id)],
  [/^\/low$/, () => lowView()],
  [/^\/low\/go$/, () => lowGoView()],
  [/^\/goals$/, () => goalsView()],
  [/^\/goal\/([^/]+)$/, (id) => goalView(id)],
  [/^\/people$/, () => peopleView()],
  [/^\/greet\/([^/]+)$/, (k) => greetView(k)],
  [/^\/person\/new$/, () => personEditView('new')],
  [/^\/person\/([^/]+)\/edit$/, (id) => personEditView(id)],
  [/^\/person\/([^/]+)$/, (id) => personView(id)],
  [/^\/more$/, () => moreView()],
  [/^\/settings$/, () => settingsView()],
];
const NAV_GROUPS = {
  '/': [/^\/?$/, /^\/day\//, /^\/night/],
  '/look': [/^\/look/, /^\/stats/, /^\/report/, /^\/ask/],
  '/pray': [/^\/pray/, /^\/low/, /^\/chats?(\/|$)/],
  '/more': [/^\/more/, /^\/settings/, /^\/places?/, /^\/periodic/, /^\/advisor/, /^\/forecast/, /^\/goals?(\/|$)/, /^\/people/, /^\/person\//, /^\/greet\//],
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
  // 刚点过：记下重画前哪些行已经打勾、哪张卡已经都好了，重画后新变的那几个动一下
  const fresh = tapped && Date.now() - tapped.at < 4000 && path === lastPath;
  const was = fresh ? new Set([...view.querySelectorAll('.it.done[data-key], .period.all-done[data-key]')].map((el) => el.dataset.key)) : null;
  view.replaceChildren(...[content || notFound(), store?.data && !NO_WHISPER.test(path) ? whisper(path) : null].filter(Boolean));
  if (path !== lastPath) { view.classList.remove('enter'); void view.offsetWidth; view.classList.add('enter'); lastPath = path; }
  if (tapped && Date.now() - tapped.at < 4000) {
    if (tapped.text) for (const el of view.querySelectorAll('.chip.check.on, .mini.check.on, .ring')) if (el.textContent.trim() === tapped.text) el.classList.add('pop');
    if (was) for (const el of view.querySelectorAll('.it.done[data-key], .period.all-done[data-key]')) if (!was.has(el.dataset.key)) el.classList.add(el.matches('.period') ? 'finish' : 'pop');
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
  else if (e.target.closest?.('button, a')) tapped = { at: Date.now() };
}, true);
// iPhone 上要有这个，按住时 :active 的样子才会出来
document.addEventListener('touchstart', () => {}, { passive: true });

// 各页最下面角落的一句话（活出自己）：每页每天一句，同一天不变。小记、难受的时候一步一步、带着祷告、设置不放
const NO_WHISPER = /^\/(p|p\/s|low\/go|pray\/go|settings|look|chat\/.+)$/;
function whisper(path) {
  const n = [...`${dayKey()}${path || '/'}`].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 11);
  const x = SELF_LINES[n % SELF_LINES.length];
  return h('div', { class: 'whisper' }, h('p', {}, x.text), h('small', {}, x.ref || '今天的一句'));
}

// 一次只出一条提示：新的换掉旧的；底部有「撤销」时放在它上面，不压住
function toast(message, kind = 'ok') {
  // 底部已经有「…  撤销」时，普通的「已保存」就不再叠一条了，只出错误
  if (kind !== 'error' && document.querySelector('.toast.undo')) return;
  for (const x of document.querySelectorAll('.toast:not(.undo)')) x.remove();
  const el = h('div', { class: `toast ${kind}${document.querySelector('.toast.undo') ? ' raised' : ''}` }, message);
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
  for (const el of document.querySelectorAll('.toast')) el.remove();
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

// 打开 ChatGPT App 并带上要说的话：chatgpt.com/?prompt= 是 App 认的通用链接（根路径不带参数只开网页）。
// 同时悄悄复制一份，万一没带上就粘贴
function chatgptButton(text, cls = 'button secondary') {
  return h('a', { class: cls, href: `https://chatgpt.com/?prompt=${encodeURIComponent(text)}`, target: '_blank', rel: 'noopener',
    onclick: () => { navigator.clipboard?.writeText(text).catch(() => {}); } }, '打开 ChatGPT');
}

async function copyText(text, done = '复制好了，去 ChatGPT 里粘贴') {
  try {
    await navigator.clipboard.writeText(text);
    toast(done);
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
    '打水：一天一桶，中午打。中午点「不打了」，晚上会再出一行打水，17:00 也会提醒你。',
    '打扫卫生：中午做。点「不弄了」就是今天不弄了。',
    '泡脚：晚上泡了就点一下，再点取消；今晚不泡就点右边的「今晚不泡」，点一下那行又能改回泡了。',
    '今天的一张照片：在睡前复盘那一页里，「明天要做」下面。选一张或现在拍一张，窗外、饭菜、桌面都行；选好就存了，不用点「记好了」。没拍的那天就空着。',
    '洗澡不用每天：洗了就点晚上的「洗澡」（或底部中间的「＋」），会先问一句，点「洗好了」才记，点错了点「取消」；记了也能撤销，或在「今天记下的」里删掉。不洗就点「今晚不洗」，后来又洗了，点这一行照样能记。洗过澡的晚上会多一行身体乳，晚上的洗脸自动划掉。',
    '最上面一行一行的是提醒：降温、该打理了，有事才出现。',
  ]],
  ['其他', ['看以前的某一天、这周的你、一年前的今天：底下的「回顾」。月历上点一天就打开那天，忘了记的也能补。']],
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
    forecastCard(today),
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
    logLine(day));
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
  // 导师找我：今天被问进度的可能 ≥ 25%、今天还没记，一整天都在（早上还会推送一次）
  const adv = advisorOutlook(d, today);
  if (adv.remind) out.push(alertLine(`导师今天可能会问进度 · 可能 ${pct(adv.p)}`, { href: '#/advisor' }));
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
  }
  if (p === 'noon') {
    waterItem(list, day, 'noon');
    cleanItem(list, day);
  }
  if (p === 'pm') {
    waterItem(list, day, 'eve');
    // 洗澡不是每天：没洗是一行「洗澡」（不算进度），洗了换成洗澡后要做的
    if (showeredOn(d, day)) careItem(list, day, 'shower', routineOf(d, 'shower').map((x) => x.name).join('、') || '洗澡后', '洗过澡了');
    else if (r.noShower) item('shower', 'skip', '洗澡', '今晚不洗了', { onclick: () => showerSheet(day), count: false });
    else item('shower', false, '洗澡', '洗了就点一下，不是每天都要', { onclick: () => showerSheet(day), count: false,
      right: h('button', { type: 'button', class: 'skip-btn', onclick: () => saveUndoable('洗澡：今晚不洗', (data) => { dayOf(data, day).noShower = true; }, '今晚不洗了').then(render).catch(() => {}) }, '今晚不洗') });
    // 泡脚：先洗澡再泡脚，每天都泡，点一下就好；今晚不泡就点「今晚不泡」（soak: 'skip'）
    const soakSet = (val) => (data) => { const x = dayOf(data, day); if (val === undefined) delete x.soak; else x.soak = val; };
    if (r.soak === true) item('soak', true, '泡脚', '泡了', { onclick: () => saveRender('泡脚：没泡', soakSet(undefined)) });
    else if (r.soak === 'skip') item('soak', 'skip', '泡脚', '今晚不泡了', { onclick: () => saveRender('泡脚', soakSet(true)) });
    else item('soak', false, '泡脚', '每天泡', { onclick: () => saveRender('泡脚', soakSet(true)),
      right: h('button', { type: 'button', class: 'skip-btn', onclick: () => saveUndoable('泡脚：今晚不泡', soakSet('skip'), '今晚不泡了').then(render).catch(() => {}) }, '今晚不泡') });
    careItem(list, day, 'pm', '晚上护肤');
    // 每周的（面膜等）只在周六晚上问；别的日子做了的，那天也显示
    if (parseDay(day).getDay() === 6 || routineOf(d, 'week').some((x) => r.care?.[x.id])) careItem(list, day, 'week', '这周', null, false);
    item('night', Boolean(r.mood || r.note), '睡前复盘', r.mood ? `心情 ${r.mood}${r.note ? ` · ${r.note}` : ''}` : '心情、一句话、科研、明天要做', { href: day === dayKey() ? '#/night' : `#/night?d=${day}` });
    if (day === dayKey()) item('prayer', Boolean(r.prayer?.night), '祷告', r.prayer?.night ? '祷告了' : '22:30', { href: '#/pray/go?m=night' });
  }
  return list;
}
// 今天的一张照片（2026-10-16）：存进 life-data 的 photos/days/，days[日].photo 是路径
const thumbOf = (path) => path.replace('photos/days/', 'photos/days/t-');
// 小图读不到（比如老照片没有小图）就读原图
function dayImg(path, cls) {
  const img = h('img', { class: cls, alt: '照片', loading: 'lazy' });
  const t = thumbOf(path);
  const show = (key, p2) => (photoUrls[key] ? Promise.resolve(photoUrls[key]) : gh.readBlob(p2).then((b) => (photoUrls[key] = URL.createObjectURL(b))));
  show(t, t).catch(() => show(path, path)).then((u) => { img.src = u; }).catch(() => img.remove());
  return img;
}
const dayThumb = (path) => dayImg(path, 'day-thumb');
function dayPhotoSheet(day) {
  const old = store.data.days[day]?.photo || null;
  const file = h('input', { type: 'file', accept: 'image/*', 'aria-label': '照片' });
  const close = openSheet({
    title: day === dayKey() ? '今天的一张照片' : `${relDay(day)}的一张照片`,
    body: h('div', { class: 'form' },
      old ? placePhoto(old) : h('p', { class: 'muted small' }, '窗外、饭菜、桌面、路上，随手拍的都行。'),
      h('label', {}, old ? '换一张（可以不换）' : '选一张或现在拍一张', file),
      old ? h('button', { class: 'danger small', onclick: () => { close(); save('删掉今天的照片', (data) => { delete dayOf(data, day).photo; }, { removes: [old, thumbOf(old)] }).then(render).catch(() => {}); } }, '删掉这张') : null),
    confirmText: '存好',
    onConfirm: async () => {
      if (!file.files[0]) { toast('先选一张照片', 'error'); return false; }
      let path; let base64; let thumb;
      try {
        path = `photos/days/${day}-${Date.now().toString(36)}.jpg`;
        base64 = await blobToBase64(await compressImage(file.files[0], 1600, 0.8));
        thumb = await blobToBase64(await compressImage(file.files[0], 400, 0.75));
      } catch (e) { toast(e.message, 'error'); return false; }
      try {
        await save('今天的一张照片', (data) => { dayOf(data, day).photo = path; }, { uploads: [{ path, base64 }, { path: thumbOf(path), base64: thumb }], removes: old ? [old, thumbOf(old)] : [] });
      } catch { return false; }
      render();
      toast('存好了。');
      return true;
    },
  });
}
function periodCount(day, p) {
  const l = periodList(day, p).filter((x) => x.count);
  return { done: l.filter((x) => x.done).length, total: l.length };
}
function periodCard(day, p) {
  const list = periodList(day, p);
  const c = list.filter((x) => x.count);
  const done = c.filter((x) => x.done).length;
  // 昨晚写的「明天要做」：早上只提一句，不打勾；做到没有睡前复盘再问
  const plan = p === 'am' ? store.data.days[addDays(day, -1)]?.plan : null;
  const all = c.length > 0 && done === c.length;
  for (const x of list) x.node.dataset.key = `${day}-${p}-${x.key}`;
  return h('section', { class: `card period${all ? ' all-done' : ''}`, 'data-key': `${day}-${p}` },
    h('div', { class: 'period-head' }, h('h3', {}, PERIODS[p]), c.length ? h('span', { class: all ? 'period-done small' : 'muted small' }, all ? [icon('check', 'i tiny'), '都好了'] : `${done} / ${c.length}`) : null),
    plan ? h('p', { class: 'small today-plan' }, h('span', { class: 'muted' }, '今天要做：'), plan) : null,
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
// 打水：一天一桶。中午一行一直在；中午点了「不打了」（或 13 点过了），晚上再出一行
function waterItem(list, day, slot) {
  const now = new Date();
  const rows = fetchRows(store.data.days[day]?.fetch || {}, day === dayKey() ? now.getHours() * 60 + now.getMinutes() : 24 * 60);
  const row = rows[slot];
  if (!row) return;
  const edit = (fn) => (data) => {
    const r = dayOf(data, day);
    const g = { ...(r.fetch || {}) };
    if ('mid' in g) { const st = fetchState(g); delete g.mid; if (st.got) g[st.got] = true; for (const x of st.skip) g[x] = 'skip'; }
    fn(g);
    if (Object.keys(g).length) r.fetch = g; else delete r.fetch;
  };
  const name = slot === 'noon' ? '中午' : '晚上';
  const got = () => saveRender('打水', edit((g) => { for (const k of Object.keys(g)) if (g[k] === true) delete g[k]; g[slot] = true; }));
  const undo = () => saveRender('打水：没打', edit((g) => { for (const k of Object.keys(g)) if (g[k] === true) delete g[k]; }));
  const skip = () => saveUndoable(`打水：${name}不打了`, edit((g) => { g[slot] = 'skip'; }), `${name}不打了`).then(render).catch(() => {});
  list.push({ key: 'water', count: true, done: row.done, node: listItem(row.done, '打水', row.text, {
    onclick: row.done === true ? undo : got,
    right: row.done === false ? h('button', { type: 'button', class: 'skip-btn', onclick: skip }, '不打了') : null,
  }) });
}
// 打扫卫生：中午做；点了「不弄了」今天就不弄了
function cleanItem(list, day) {
  const v = store.data.days[day]?.clean;
  const set = (val) => (data) => { const r = dayOf(data, day); if (val === undefined) delete r.clean; else r.clean = val; };
  if (v === true) list.push({ key: 'clean', count: true, done: true, node: listItem(true, '打扫卫生', '打扫好了', { onclick: () => saveRender('打扫卫生：没弄', set(undefined)) }) });
  else if (v === 'skip') list.push({ key: 'clean', count: true, done: 'skip', node: listItem('skip', '打扫卫生', '今天不弄了', { onclick: () => saveRender('打扫卫生', set(true)) }) });
  else list.push({ key: 'clean', count: true, done: false, node: listItem(false, '打扫卫生', '中午收拾一下', {
    onclick: () => saveRender('打扫卫生', set(true)),
    right: h('button', { type: 'button', class: 'skip-btn', onclick: () => saveUndoable('打扫卫生：今天不弄了', set('skip'), '今天不弄了').then(render).catch(() => {}) }, '不弄了'),
  }) });
}
// 今天记下的：一行，点开能删
function logLine(day) {
  const list = eventsOn(store.data, day).filter((e) => ['shower', 'sport'].includes(e.type)).sort((a, b) => a.at.localeCompare(b.at));
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
  const note = seasonAlert();
  const wx = w.day === today && w.daily?.[0] ? `${city?.name || ''} ${Math.round(w.daily[0].min)}–${Math.round(w.daily[0].max)}°C` : null;
  return h('header', { class: 'page-head today-head' },
    h('div', {},
      h('div', { class: 'sub' }, dayLabel(today)),
      h('h1', { class: 'greet' }, hi),
      h('div', { class: 'head-tags' }, h('span', { class: 'tag' }, term), wx ? h('span', { class: 'tag' }, wx.trim()) : null),
      note ? h('p', { class: 'wx-note' }, note) : null),
    h('div', { class: 'head-actions' }, dayComplete(today) ? h('span', { class: 'seal', title: '今天护肤、复盘、祷告都做了' }, '圆', h('br'), '满') : null,
      lockBtn, helpButton('今天这一页怎么用', TODAY_HELP)));
}
// 护肤（早晚）、睡前复盘、祷告都做了
function dayComplete(day) {
  const d = store.data;
  const r = d.days[day] || {};
  return careFullDay(d, day) && Boolean(r.mood || r.note) && Boolean(r.prayer?.night);
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

// 洗澡：先问一句，点「洗好了」才记；点错了「取消」，记了也能撤销或在「今天记下的」里删
function showerSheet(day) {
  const items = routineOf(store.data, 'shower');
  const picked = new Set(items.filter((r) => store.data.days[day]?.care?.[r.id]).map((r) => r.id));
  const chips = h('div', { class: 'chips' }, items.map((r) => {
    const b = h('button', { type: 'button', class: `chip check${picked.has(r.id) ? ' on' : ''}`, 'aria-pressed': String(picked.has(r.id)), onclick: () => {
      if (picked.has(r.id)) picked.delete(r.id); else picked.add(r.id);
      b.classList.toggle('on', picked.has(r.id));
      b.setAttribute('aria-pressed', String(picked.has(r.id)));
    } }, r.name);
    return b;
  }));
  openSheet({
    title: day === dayKey() ? '洗澡了吗' : `${relDay(day)}洗澡了吗`,
    body: [
      h('p', { class: 'muted small' }, '洗好了就点「洗好了」。点错了点「取消」，什么都不记。'),
      items.length ? [h('p', { class: 'muted small' }, '洗完以后这些做了吗？做了的点一下，没做也可以待会儿在首页点。'), chips] : null],
    confirmText: '洗好了', cancelText: '取消',
    onConfirm: () => saveUndoable('洗澡', (data) => {
      data.events.push({ id: newId('e'), day, at: atFor(day), type: 'shower' });
      delete dayOf(data, day).noShower;
      const c = (dayOf(data, day).care ||= {});
      for (const r of items) { if (picked.has(r.id)) c[r.id] = true; else delete c[r.id]; }
    }, items.length && picked.size === items.length ? `记好了。${CHEER_ON.shower}` : '记好了：洗澡').then(render).catch(() => false),
  });
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
      cell({ ic: 'drop', title: '洗澡', onclick: () => { close(); showerSheet(day); } }),
      cell({ ic: 'run', color: 'var(--sage)', title: '运动', onclick: () => { close(); sportSheet(day); } }),
      cell({ ic: 'bed', color: 'var(--blue)', title: '睡眠', onclick: () => { close(); sleepSheet(day); } }),
      cell({ ic: 'moon', color: 'var(--accent)', title: '睡前复盘', href: '#/night' }),
      cell({ ic: 'people', color: 'var(--amber)', title: '导师找我了', onclick: () => { close(); advisorSheet(); } })),
    confirmText: null, cancelText: '关闭',
  });
}





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
  ['睡前复盘', ['每晚一页，1 分钟填完：心情打分和一句话、精力、压力、科研做了什么、明天要做什么。都可以不填，填几样算几样。', '「明天要做」什么事都可以写。明天早上的清单上会提一句，做到了没有到明天睡前复盘再问。', '填完点「记好了」，接着做晚上的护肤，然后去祷告。']],
  ['分数怎么打', ['心情 1–10：5 是平常，越高越好。', '精力 1–5：今天有没有精神。', '压力 1–5：越高压力越大。']],
];

// 还没点「记好了」的内容存在这台手机上：iPhone 拍照、选照片时常常把网页整个重新打开，只放在内存里会丢。点了「记好了」才清掉
const NIGHT_DRAFT_KEY = 'life-night-draft';

function nightView(day) {
  const d = store.data;
  const rec = d.days[day] || {};
  const saved = readJson(NIGHT_DRAFT_KEY);
  const draft = saved.day === day ? saved : null;
  const st = draft?.st || { mood: rec.mood || null, energy: rec.energy || null, stress: rec.stress || null, planDone: rec.planDone || null };
  const note = h('textarea', { rows: 2, placeholder: '今天怎么样，一句话', 'aria-label': '今天的一句话' });
  note.value = draft ? draft.note : rec.note || '';
  const did = h('input', { value: draft ? draft.did : rec.did || '', placeholder: '今天科研做了什么', 'aria-label': '今天科研做了什么' });
  const plan = h('input', { value: draft ? draft.plan : rec.plan || '', placeholder: '明天要做什么', 'aria-label': '明天要做什么' });
  const keep = () => writeJson(NIGHT_DRAFT_KEY, { day, st, note: note.value, did: did.value, plan: plan.value });
  for (const el of [note, did, plan]) el.addEventListener('input', keep);
  const prevPlan = d.days[addDays(day, -1)]?.plan;
  const rows = h('div', {});
  const draw = () => rows.replaceChildren(...[
    h('div', { class: 'label-sm' }, '心情（1–10）'), scoreRow('心情', 10, st.mood, (v) => { st.mood = v; keep(); draw(); }),
    h('div', { class: 'label-sm' }, '精力'), scoreRow('精力', 5, st.energy, (v) => { st.energy = v; keep(); draw(); }, ['没劲', '有点累', '一般', '不错', '满满']),
    h('div', { class: 'label-sm' }, '压力'), scoreRow('压力', 5, st.stress, (v) => { st.stress = v; keep(); draw(); }, ['很轻松', '轻松', '一般', '有点大', '很大']),
    prevPlan ? [h('div', { class: 'label-sm' }, `今天要做：${prevPlan}`), choiceRow('做到了吗', [['yes', '做到了'], ['part', '做了一部分'], ['no', '没做']], st.planDone, (v) => { st.planDone = v; keep(); draw(); })] : null,
  ].flat().filter(Boolean));
  draw();
  const submit = () => save('睡前复盘', (data) => {
    const r = dayOf(data, day);
    for (const k of ['mood', 'energy', 'stress', 'planDone']) { if (st[k]) r[k] = st[k]; else delete r[k]; }
    for (const [k, el] of [['note', note], ['did', did], ['plan', plan]]) { const v = el.value.trim(); if (v) r[k] = v; else delete r[k]; }
  }).then(() => { try { localStorage.removeItem(NIGHT_DRAFT_KEY); } catch { /* 无 */ } toast(cheerNight(st.mood)); render(); }).catch(() => {});
  const isToday = day === dayKey();
  const pmItems = routineOf(d, 'pm');
  return h('div', { class: 'form' },
    headerSub('睡前复盘', isToday ? dayLabel(day) : `${relDay(day)} · ${dayLabel(day)}`, helpButton('睡前复盘怎么用', NIGHT_HELP)),
    h('div', { class: 'card' }, rows, h('div', { class: 'label-sm' }, '一句话'), note),
    h('div', { class: 'card' }, h('h3', {}, '科研'), h('div', { class: 'label-sm first' }, '今天做了'), did),
    h('div', { class: 'card' }, h('h3', {}, '明天要做'), plan),
    photoCard(day),
    h('div', { class: 'actions' }, h('button', { class: 'grow', onclick: submit }, '记好了')),
    rec.mood || rec.note ? h('div', { class: 'card next-card' },
      h('h3', {}, '接下来'),
      pmItems.length ? [h('div', { class: 'small' }, '晚上的护肤：'), careCardInline(day, 'pm')] : null,
      isToday ? h('a', { class: 'button wide', href: '#/pray/go?m=night' }, icon('candle'), '去祷告') : null) : null);
}

// 睡前复盘里的「今天的一张照片」：选或拍一张就直接存，不用等「记好了」
function photoCard(day) {
  const p = store.data.days[day]?.photo;
  return h('div', { class: 'card' }, h('h3', {}, day === dayKey() ? '今天的一张照片' : '这天的一张照片'),
    p ? h('button', { type: 'button', class: 'photo-line', onclick: () => dayPhotoSheet(day) }, dayThumb(p), h('span', { class: 'small muted' }, '点一下换或删')) : null,
    p ? null : h('p', { class: 'muted small' }, '窗外、饭菜、桌面，随手拍的都行；不拍也没关系。'),
    p ? null : h('button', { type: 'button', class: 'secondary wide', onclick: () => dayPhotoSheet(day) }, icon('image'), '选一张或拍一张'));
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

// ---------- 回顾 ----------
// 2026-10-27 照账本的「总结」改版：顶上「周 | 月 | 年 | 分析」，默认是周；刊头左边宋体大字（第 44 周 / 10 月 / 2026），右边日期范围和一句在哪。
// 不放口号，不涉及钱（钱在账本里看），小记不进来，科研不展示。没做的那天就空着。

const LOOK_HELP = [
  ['周', ['一周从周一到周日。最上面是这周护肤做完了几天，下面三个数是祷告、运动、平均睡多久，最下面一行是上周的。',
    '格子：一列一天，一行一件事。实心是做了，浅的是早上或晚上的护肤做了一部分，空着的是没有；心情那一行颜色越深心情越好，数字是那天的分。点上面的星期几，打开那天，能看也能补记。',
    '再往下：每天的心情，几点睡几点起，想做到的事，这周的感恩，去了的地方，照片和每天的一句话。看的是这周时，还有护肤最近两周（「改打卡项」在这里）。']],
  ['月', ['最上面是这个月护肤做完了几天，和祷告、运动、洗澡几次。',
    '月历可以切护肤、心情、运动：护肤早晚都做完是实心，做了一部分是浅的；心情越好越深。点一天打开那天，忘了记的也能补。',
    '走势是这个月的心情、精力、压力、睡眠（线是 7 天平均）。下面是每一项护肤做了几天、洗澡运动隔几天、和上个月比。']],
  ['年', ['一年的日历一格一天，可以切护肤和心情。下面是每个月护肤、运动、祷告几次，每个月的平均心情，这一年去过的地方、心情最好的几天。']],
  ['写给你的话', ['每一周、每个月、每一年都可以请 DeepSeek 看这段时间的数字和每天的一句话，写一小段（存下来，不会每次重写）。科研和小记不会发过去。', '月和年最下面「复制给 ChatGPT」：把这段时间的数字复制好，拿去聊。']],
  ['翻看', ['左右箭头看以前的。顶上点「分析」看心情、作息这些的分析。']],
];
const lookState = { cal: 'care', ycal: 'care' };
const WD7 = '一二三四五六日';
const lookLink = (mode, day) => `#/look?mode=${mode}${day ? `&day=${day}` : ''}`;
// 回顾页顶上的切换：周 | 月 | 年 | 分析（分析页也有）
function lookTabs(on) {
  return h('div', { class: 'segmented', role: 'group', 'aria-label': '回顾' },
    [['week', '周', '#/look'], ['month', '月', lookLink('month')], ['year', '年', lookLink('year')], ['stats', '分析', '#/stats']]
      .map(([k, v, href]) => h('a', { class: `seg${on === k ? ' on' : ''}`, href, 'aria-current': on === k ? 'page' : null }, v)));
}

// 刊头的字（和账本一样）：日期范围（同一个月的后半截不写月）+ 一句在哪（这周还剩几天 / 上周 / 3 周前）
const lmd = (day) => `${Number(day.slice(5, 7))}月${Number(day.slice(8))}日`;
const mastRange = (a, b) => `${lmd(a)} – ${a.slice(0, 7) === b.slice(0, 7) ? `${Number(b.slice(8))}日` : lmd(b)}`;
const mastLeft = (end, what) => { const n = daysBetween(dayKey(), end); return n ? `${what} · 还剩 ${n} 天` : `${what} · 最后一天`; };
// 第几周：ISO 周（周一开始，有 1 月 4 日的那周是第 1 周）
function weekNo(day) {
  const thu = addDays(day, 3 - (parseDay(day).getDay() + 6) % 7);
  return Math.floor(daysBetween(`${thu.slice(0, 4)}-01-01`, thu) / 7) + 1;
}
const f1 = (v) => (v === null || v === undefined ? '—' : String(Math.round(v * 10) / 10));
const hoursText = (v) => (v === null ? '—' : `${f1(v)} 小时`);
const mh = (k, v, sub) => h('div', {}, h('span', { class: 'muted small' }, k), h('b', {}, v), sub ? h('span', { class: 'muted small' }, sub) : null);
const dayHref = (x) => (x === dayKey() ? '#/' : `#/day/${x}`);

function lookView(q = {}) {
  const d = store.data;
  const today = dayKey();
  const mode = ['month', 'year'].includes(q.mode) ? q.mode : 'week';
  const day = /^\d{4}-\d\d-\d\d$/.test(q.day || '') && q.day <= today ? q.day : today;
  const start = d.startDate || today;
  const head = header('回顾', helpButton('回顾怎么看', LOOK_HELP));
  const navRow = (m, prev, next) => h('div', { class: 'period-nav mast-nav' },
    prev >= start ? h('a', { class: 'icon-btn', href: lookLink(mode, prev), 'aria-label': '上一个' }, '‹') : h('span', { class: 'icon-btn ghost' }),
    h('div', { class: 'mast' },
      h('div', { class: 'mast-big' }, m.pre ? h('small', {}, m.pre) : null, h('b', {}, m.big), m.unit ? h('small', {}, m.unit) : null),
      h('div', { class: 'mast-side' }, h('div', { class: 'mast-range' }, m.range), h('div', { class: 'mast-sub' }, m.sub))),
    next <= today ? h('a', { class: 'icon-btn', href: lookLink(mode, next), 'aria-label': '下一个' }, '›') : h('span', { class: 'icon-btn ghost' }));
  if (mode === 'month') return lookMonthView(d, day, today, head, navRow);
  if (mode === 'year') return lookYearView(d, day, today, head, navRow);
  return lookWeekView(d, day, today, head, navRow);
}

// 最上面那张（和账本周总结一样的样子）：宋体大数字 + 一条进度 + 三个小数 + 上一段的一行
function lookHead({ label, n, of, left, prevText, stats, foot }) {
  return h('div', { class: 'card summary-head look-head' },
    h('div', { class: 'muted small' }, label),
    h('div', { class: 'look-big' }, h('b', {}, String(n)), h('span', {}, `/ ${of} 天`)),
    h('div', { class: 'time-bar' },
      h('div', { class: 'time-track', 'aria-label': `${of} 天里做完 ${n} 天` }, h('span', { class: 'time-fill wh-fill', style: `width:${Math.min(100, (n / of) * 100).toFixed(1)}%` })),
      h('div', { class: 'time-legend small' }, h('span', {}, left || ''), h('span', { class: 'muted' }, prevText || ''))),
    h('div', { class: 'mh-stats' }, stats),
    foot ? h('div', { class: 'hero-foot muted small' }, foot) : null);
}

// ----- 周 -----
function lookWeekView(d, day, today, head, navRow) {
  const mon = weekOf(day);
  const end = addDays(mon, 6);
  const to = end < today ? end : today;
  const ongoing = end >= today;
  const s = periodSummary(d, mon, to);
  const hasPrev = addDays(mon, -1) >= (d.startDate || today);
  const prev = periodSummary(d, addDays(mon, -7), addDays(mon, -1));
  const ago = daysBetween(mon, weekOf(today)) / 7;
  const mast = { pre: '第', big: String(weekNo(mon)), unit: '周', range: mastRange(mon, end), sub: ago ? (ago === 1 ? '上周' : `${ago} 周前`) : mastLeft(end, '这周') };
  const left = daysBetween(today, end);
  const thanks = d.weeks?.[mon]?.thanks;
  return h('div', {}, head, lookTabs('week'),
    navRow(mast, addDays(mon, -1), addDays(end, 1)),
    lookHead({
      label: '这周护肤做完', n: s.careDays, of: 7,
      left: ongoing ? (left ? `还剩 ${left} 天` : '最后一天') : '',
      prevText: hasPrev ? `上周 ${prev.careDays} 天` : '',
      stats: [mh('祷告', `${s.prayers} 晚`), mh('运动', `${s.sports} 次`), mh('平均睡', hoursText(s.sleep))],
      foot: hasPrev ? `上周：祷告 ${prev.prayers} 晚 · 运动 ${prev.sports} 次 · 平均睡 ${hoursText(prev.sleep)}` : null,
    }),
    weekGridCard(d, mon, today),
    weekMoodCard(d, mon, s, hasPrev ? prev : null),
    sleepCard(d, mon, to, '这周几点睡几点起', 1),
    goalWeekCard(mon),
    thanks ? h('div', { class: 'card' }, h('h3', {}, '这周的感恩'), h('p', { class: 'letter-text' }, thanks)) : null,
    visitsCard(s, '这周去了'),
    ongoing ? careDataCard(today) : null,
    ongoing ? yearAgoCard(today) : null,
    photosNotesCard(d, s),
    letterCard(d, { key: `w${mon}`, title: `第 ${weekNo(mon)} 周（${weekLabel(mon)}）`, from: mon, to }, s));
}

// 这周每天：一列一天，一行一件事（和账本「午饭和晚饭」的格子一个样子）
function weekGridCard(d, mon, today) {
  const g = weekGrid(d, mon, today);
  const start = d.startDate || today;
  return h('div', { class: 'card' }, h('h3', {}, '这周每天'),
    h('div', { class: 'wk-grid' },
      h('span', {}),
      g.days.map((x, i) => (x > today || x < start ? h('span', { class: 'wk-wd' }, WD7[i])
        : h('a', { class: `wk-wd${x === today ? ' today' : ''}`, href: dayHref(x), 'aria-label': dayLabel(x) }, WD7[i]))),
      g.rows.map((r) => [h('span', { class: 'wk-name small' }, r.name),
        r.cells.map((c) => h('span', { class: `wk-cell ${c.st}`, title: `${r.name} · ${dayLabel(c.day)}` }, c.v ? String(c.v) : ''))])),
    h('p', { class: 'muted small legend' }, h('i', { class: 'dot-sw full' }), '做了　', h('i', { class: 'dot-sw part' }), '做了一部分', h('span', { class: 'grow' }), '心情越好越深'));
}

function weekMoodCard(d, mon, s, prev) {
  if (s.mood === null && s.energy === null && s.stress === null) return null;
  const days = rangeDays(mon, addDays(mon, 6));
  const cmp = (a, b) => (a === null || !prev || b === null ? null : Math.abs(a - b) < 0.05 ? '和上周一样' : `比上周${a > b ? '高' : '低'} ${f1(Math.abs(a - b))}`);
  return h('div', { class: 'card' }, h('h3', {}, '每天的心情'),
    barChart(days.map((x, i) => ({ label: `周${WD7[i]}`, v: d.days[x]?.mood || 0 })), { title: '这周每天的心情', scale: 10 }),
    h('div', { class: 'mh-stats' },
      mh('心情', f1(s.mood), cmp(s.mood, prev?.mood)), mh('精力', f1(s.energy), cmp(s.energy, prev?.energy)), mh('压力', f1(s.stress), cmp(s.stress, prev?.stress))));
}

// 几点睡几点起（周、月）
function sleepCard(d, from, to, title, every) {
  const rows = rangeDays(from, to).map((x) => ({ day: x, sl: d.days[x]?.sleep })).filter((x) => x.sl?.bed && x.sl?.wake);
  if (!rows.length) return null;
  const hrs = rows.map((r) => sleepHours(r.sl));
  const beds = rows.map((r) => bedMinutes(r.sl));
  const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  return h('div', { class: 'card' }, h('h3', {}, '作息'),
    sleepBars(rows.map((r) => ({ day: r.day, bed: bedMinutes(r.sl), wake: bedMinutes({ bed: r.sl.wake }) })), { title, every }),
    h('div', { class: 'mh-stats' }, mh('平均睡', hoursText(avg(hrs))), mh('平均几点睡', bedLabel(Math.round(avg(beds)))), mh('记了', `${rows.length} 天`)));
}

function visitsCard(s, title) {
  if (!s.visits.length) return null;
  return h('div', { class: 'card' }, h('h3', {}, title),
    s.visits.map((v) => h('div', { class: 'small night-note' }, h('span', { class: 'muted' }, `${lmd(v.day)}　`), v.name, v.score ? h('span', { class: 'muted' }, ` · ${v.score} 分`) : null)));
}

function photosNotesCard(d, s) {
  if (!s.photos.length && !s.notes.length) return null;
  return h('div', { class: 'card' }, h('h3', {}, '照片和每天的一句话'),
    s.photos.length ? h('div', { class: 'wk-photos' }, s.photos.map((x) => h('a', { class: 'wk-photo', href: dayHref(x), 'aria-label': dayLabel(x) },
      dayImg(d.days[x].photo, 'wk-photo-img'), h('small', {}, `周${WD7[(parseDay(x).getDay() + 6) % 7]}`)))) : null,
    s.notes.map((x) => h('div', { class: 'small night-note' }, h('span', { class: 'muted' }, `${x.day.slice(5).replace('-', '/')} · ${x.mood || '-'} 分　`), x.note)));
}

// ----- 月 -----
function lookMonthView(d, day, today, head, navRow) {
  const m = day.slice(0, 7);
  const from = `${m}-01`;
  const end = addDays(`${addDays(`${m}-28`, 7).slice(0, 7)}-01`, -1);
  const to = end < today ? end : today;
  const ongoing = end >= today;
  const pFrom = `${addDays(from, -1).slice(0, 7)}-01`;
  const pEnd = addDays(from, -1);
  const hasPrev = pEnd >= (d.startDate || today);
  const s = periodSummary(d, from, to);
  const prev = periodSummary(d, pFrom, pEnd);
  const now = today.slice(0, 7);
  const ago = (Number(now.slice(0, 4)) * 12 + Number(now.slice(5))) - (Number(m.slice(0, 4)) * 12 + Number(m.slice(5)));
  const where = ago ? (ago === 1 ? '上个月' : `${ago} 个月前`) : mastLeft(end, '这个月');
  const mast = { big: String(Number(m.slice(5))), unit: '月', range: mastRange(from, end), sub: m.slice(0, 4) === today.slice(0, 4) ? where : `${m.slice(0, 4)} 年 · ${where}` };
  const left = daysBetween(today, end);
  const title = `${m.slice(0, 4)} 年 ${Number(m.slice(5))} 月`;
  return h('div', {}, head, lookTabs('month'),
    navRow(mast, pEnd, addDays(end, 1)),
    lookHead({
      label: '这个月护肤做完', n: s.careDays, of: Number(end.slice(8)),
      left: ongoing ? (left ? `还剩 ${left} 天` : '最后一天') : '',
      prevText: hasPrev ? `上个月 ${prev.careDays} 天` : '',
      stats: [mh('祷告', `${s.prayers} 晚`), mh('运动', `${s.sports} 次`), mh('洗澡', `${s.showers} 次`)],
    }),
    monthCalCard(d, m, to, today),
    monthTrendCard(d, from, end),
    sleepCard(d, from, to, '这个月几点睡几点起', 7),
    monthCareCard(d, from, to),
    rhythmCard(d, from, to, s),
    hasPrev ? compareCard(s, prev, '这个月', '上个月') : null,
    visitsCard(s, '这个月去了'),
    s.photos.length ? h('div', { class: 'group' }, cell({ href: `#/photos?m=${m}`, ic: 'image', color: 'var(--sage)', title: '这个月的照片', meta: `${s.photos.length} 张` })) : null,
    notesFold(s),
    letterCard(d, { key: `m${m}`, title, from, to }, s),
    exportButton(title, from, to, s));
}

// 月历：切护肤 / 心情 / 运动；点一天打开那天
function monthCalCard(d, m, to, today) {
  const start = d.startDate || today;
  const mode = lookState.cal;
  const sport = new Set(d.events.filter((e) => e.type === 'sport' && e.day.startsWith(m)).map((e) => e.day));
  const lm = lookMonth(d, to);
  const stOf = {
    care: (x) => (lm.full.has(x) ? 'full' : lm.some.has(x) ? 'part' : ''),
    mood: (x) => (d.days[x]?.mood ? `m${Math.ceil(d.days[x].mood / 2)}` : ''),
    sport: (x) => (sport.has(x) ? 'full' : ''),
  }[mode];
  const legend = {
    care: [h('i', { class: 'dot-sw full' }), '早晚都做完　', h('i', { class: 'dot-sw part' }), '做了一部分'],
    mood: ['低', [1, 2, 3, 4, 5].map((k) => h('i', { class: `dot-sw m${k}` })), '高'],
    sport: [h('i', { class: 'dot-sw full' }), '运动了'],
  }[mode];
  return h('div', { class: 'card look-month' },
    h('div', { class: 'segmented small-seg' }, [['care', '护肤'], ['mood', '心情'], ['sport', '运动']].map(([k, v]) =>
      h('button', { type: 'button', class: `seg${mode === k ? ' on' : ''}`, onclick: () => { lookState.cal = k; render(); } }, v))),
    dotMonth(m, stOf, today, start),
    h('p', { class: `muted small legend${mode === 'mood' ? ' mood-legend' : ''}` }, legend, h('span', { class: 'grow' }), '点一天看那天'));
}
function dotMonth(month, stOf, today, start) {
  const first = `${month}-01`;
  const lead = (parseDay(first).getDay() + 6) % 7;
  const n = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
  const cells = Array.from({ length: lead }, () => h('span', {}));
  for (let i = 1; i <= n; i++) {
    const x = `${month}-${String(i).padStart(2, '0')}`;
    const st = x > today ? 'future' : x < start ? 'before' : stOf(x) || 'empty';
    const inner = [h('i', {}), h('small', {}, String(i))];
    const cls = `md ${st.startsWith('m') ? `mood ${st}` : st}${x === today ? ' today' : ''}`;
    cells.push(x > today || x < start ? h('span', { class: cls }, inner)
      : h('a', { class: cls, href: dayHref(x), 'aria-label': `${Number(month.slice(5, 7))} 月 ${i} 日` }, inner));
  }
  return h('div', { class: 'dot-month' },
    WD7.split('').map((w) => h('span', { class: 'wd', 'aria-hidden': 'true' }, w)), cells);
}

function monthTrendCard(d, from, end) {
  const get = (k) => (x) => d.days[x]?.[k] ?? null;
  const mood = seriesRange(d, from, end, get('mood'));
  if (!mood.vals.some((v) => v !== null)) return null;
  return h('div', { class: 'card' },
    h('h3', {}, '心情（线是 7 天平均）'), lineChart(mood, { min: 1, max: 10, title: '这个月的心情' }),
    h('h3', {}, '精力'), lineChart(seriesRange(d, from, end, get('energy')), { min: 1, max: 5, title: '这个月的精力', color: 'var(--good)' }),
    h('h3', {}, '压力'), lineChart(seriesRange(d, from, end, get('stress')), { min: 1, max: 5, title: '这个月的压力', color: 'var(--danger)' }),
    h('h3', {}, '睡了几小时'), lineChart(seriesRange(d, from, end, (x) => sleepHours(d.days[x]?.sleep)), { min: 4, max: 10, title: '这个月的睡眠', color: 'var(--blue)' }));
}

// 每一项护肤这个月做了几天（按早上 / 晚上 / 洗澡后 / 每周分组）
function monthCareCard(d, from, to) {
  const rows = careInRange(d, from, to);
  if (!rows.length) return null;
  const groups = ['am', 'pm', 'shower', 'week'].map((w) => {
    const items = rows.filter((x) => x.r.when === w);
    if (!items.length) return null;
    return h('div', { class: 'care-group' },
      h('div', { class: 'care-when' }, icon(WHEN_ICON[w], 'i'), WHEN[w]),
      items.map((x) => h('div', { class: 'care-rate' },
        h('span', { class: 'grow' }, x.r.name),
        ['am', 'pm'].includes(w) && x.total ? h('span', { class: 'care-bar', 'aria-hidden': 'true' }, h('i', { style: `width:${((x.done / x.total) * 100).toFixed(1)}%` })) : null,
        h('span', { class: 'small muted care-n' }, w === 'shower' ? `洗澡 ${x.total} 次里 ${x.done} 次` : w === 'week' ? `${x.done} 次` : `${x.done}/${x.total} 天`))));
  });
  return h('div', { class: 'card' }, h('h3', {}, '每一项护肤'), groups);
}

// 洗澡、运动：几次、平均隔几天（月、年）
function rhythmCard(d, from, to, s) {
  const inR = (e) => e.day >= from && e.day <= to;
  const sh = gaps(d.events.filter((e) => e.type === 'shower' && inR(e)).map((e) => e.day));
  const sp = d.events.filter((e) => e.type === 'sport' && inR(e));
  if (!sh.n && !sp.length) return null;
  const kinds = {};
  for (const e of sp) kinds[e.kind || '其他'] = (kinds[e.kind || '其他'] || 0) + 1;
  return h('div', { class: 'card' }, h('h3', {}, '洗澡和运动'),
    h('div', { class: 'stat-grid' },
      stat('洗澡', `${sh.n} 次`), stat('平均隔', sh.avg === null ? '—' : `${f1(sh.avg)} 天`),
      stat('运动', `${sp.length} 次${s.sportMinutes ? ` · ${s.sportMinutes} 分钟` : ''}`), stat('走了 / 跑了', s.km ? `${f1(s.km)} 公里` : '—')),
    Object.keys(kinds).length ? h('p', { class: 'look-counts' }, Object.entries(kinds).sort((a, b) => b[1] - a[1]).map(([k, n]) => h('span', {}, `${k} ${n} 次`))) : null);
}

function compareCard(s, prev, a, b) {
  const rows = [
    ['护肤做完', `${s.careDays} 天`, `${prev.careDays} 天`], ['祷告', `${s.prayers} 晚`, `${prev.prayers} 晚`],
    ['运动', `${s.sports} 次`, `${prev.sports} 次`], ['洗澡', `${s.showers} 次`, `${prev.showers} 次`],
    ['心情', f1(s.mood), f1(prev.mood)], ['精力', f1(s.energy), f1(prev.energy)], ['压力', f1(s.stress), f1(prev.stress)],
    ['平均睡', hoursText(s.sleep), hoursText(prev.sleep)],
  ];
  return h('div', { class: 'card' }, h('h3', {}, `和${b}比`),
    h('table', { class: 'cmp-table' }, h('thead', {}, h('tr', {}, h('th', {}, ''), h('th', {}, a), h('th', {}, b))),
      h('tbody', {}, rows.map(([k, x, y]) => h('tr', {}, h('td', {}, k), h('td', {}, x), h('td', { class: 'muted' }, y))))));
}

function notesFold(s) {
  if (!s.notes.length) return null;
  return h('details', { class: 'card notes-fold' }, h('summary', {}, h('h3', {}, `每天的一句话（${s.notes.length}）`)),
    s.notes.map((x) => h('div', { class: 'small night-note' }, h('span', { class: 'muted' }, `${x.day.slice(5).replace('-', '/')} · ${x.mood || '-'} 分　`), x.note)));
}

const exportButton = (title, from, to, s) => h('button', { type: 'button', class: 'secondary wide', onclick: () => copyText(`${title}的记录（${from} 到 ${to}）：\n${summaryText(s)}`) }, icon('copy'), '复制给 ChatGPT');

// ----- 年 -----
function lookYearView(d, day, today, head, navRow) {
  const y = Number(day.slice(0, 4));
  const from = `${y}-01-01`;
  const end = `${y}-12-31`;
  const to = end < today ? end : today;
  const start = d.startDate || today;
  const s = periodSummary(d, from, to);
  const yd = yearData(d, y, today);
  const ago = Number(today.slice(0, 4)) - y;
  const mast = { big: String(y), range: '1月1日 – 12月31日', sub: ago ? (ago === 1 ? '去年' : `${ago} 年前`) : mastLeft(end, '今年') };
  const counted = yd.days.filter((x) => !x.off).length;
  const places = new Set(s.visits.map((v) => v.name));
  const title = `${y} 年`;
  return h('div', {}, head, lookTabs('year'),
    navRow(mast, `${y - 1}-12-31`, `${y + 1}-01-01`),
    lookHead({
      label: '这一年护肤做完', n: s.careDays, of: counted || 1,
      left: start > from ? `从 ${lmd(start)} 开始记` : '', prevText: `记了 ${s.recorded} 天心情或一句话`,
      stats: [mh('祷告', `${s.prayers} 晚`), mh('运动', `${s.sports} 次`), mh('去了', `${places.size} 个地方`)],
    }),
    yearCalCard(yd, today),
    yearMonthsCard(yd),
    yearThingsCard(d, s, y),
    letterCard(d, { key: `y${y}`, title, from, to }, s),
    exportButton(title, from, to, s));
}

function yearCalCard(yd, today) {
  const mode = lookState.ycal;
  const days = yd.days.map((x) => (mode === 'care'
    ? { day: x.day, off: x.off, lv: x.care * 2, tip: x.care === 2 ? '护肤都做完' : x.care ? '做了一部分' : '' }
    : { day: x.day, off: x.off, lv: x.mood ? Math.min(4, Math.ceil(x.mood / 2.5)) : 0, tip: x.mood ? `心情 ${x.mood} 分` : '' }));
  return h('div', { class: 'card' }, h('h3', {}, '一年的日历'),
    h('div', { class: 'segmented small-seg' }, [['care', '护肤'], ['mood', '心情']].map(([k, v]) =>
      h('button', { type: 'button', class: `seg${mode === k ? ' on' : ''}`, onclick: () => { lookState.ycal = k; render(); } }, v))),
    yearCalendar(days, { today, title: mode === 'care' ? '这一年每天的护肤' : '这一年每天的心情', legend: mode === 'care' ? ['没做', '做完'] : ['低', '高'] }));
}

function yearMonthsCard(yd) {
  const ms = yd.months;
  if (!ms.some((x) => x.n)) return null;
  const bars = (k) => ms.map((x) => ({ label: String(x.month), v: x[k] }));
  return h('div', { class: 'card' }, h('h3', {}, '每个月'),
    h('div', { class: 'label-sm' }, '护肤做完（天）'), barChart(bars('careDays'), { title: '每个月护肤做完几天' }),
    h('div', { class: 'label-sm' }, '祷告（晚）'), barChart(bars('prayers'), { title: '每个月祷告几晚', color: 'var(--sage)' }),
    h('div', { class: 'label-sm' }, '运动（次）'), barChart(bars('sports'), { title: '每个月运动几次', color: 'var(--good)' }),
    ms.some((x) => x.mood !== null) ? [h('div', { class: 'label-sm' }, '平均心情'),
      barChart(ms.map((x) => ({ label: String(x.month), v: x.mood === null ? 0 : Math.round(x.mood * 10) / 10 })), { title: '每个月的平均心情', scale: 10, color: 'var(--blue)' })] : null);
}

// 这一年：去过的地方、心情最好的几天、里程碑、做到的事
function yearThingsCard(d, s, y) {
  const places = [...new Set(s.visits.map((v) => v.name))];
  const best = s.notes.filter((x) => x.mood).sort((a, b) => b.mood - a.mood || a.day.localeCompare(b.day)).slice(0, 3);
  const miles = Object.entries(d.milestones || {}).filter(([k, at]) => k !== 'seen' && MILESTONE_TEXT[k] && String(at).startsWith(String(y))).sort((a, b) => a[1].localeCompare(b[1]));
  const goals = (d.goals || []).filter((g) => g.status === 'done' && String(g.doneAt || '').startsWith(String(y)));
  if (!places.length && !best.length && !miles.length && !goals.length) return null;
  return h('div', { class: 'card' }, h('h3', {}, '这一年'),
    places.length ? [h('div', { class: 'label-sm' }, `去过 ${places.length} 个地方`), h('p', { class: 'look-counts' }, places.map((n) => h('span', {}, n)))] : null,
    best.length ? [h('div', { class: 'label-sm' }, '心情最好的几天'), best.map((x) => h('a', { class: 'small night-note block', href: dayHref(x.day) }, h('span', { class: 'muted' }, `${lmd(x.day)} · ${x.mood} 分　`), x.note))] : null,
    goals.length ? [h('div', { class: 'label-sm' }, '做到的事'), goals.map((g) => h('div', { class: 'small night-note' }, h('span', { class: 'muted' }, `${lmd(g.doneAt)}　`), g.title))] : null,
    miles.length ? [h('div', { class: 'label-sm' }, '第一次'), miles.map(([k, at]) => h('div', { class: 'small night-note' }, h('span', { class: 'muted' }, `${lmd(at)}　`), MILESTONE_TEXT[k]))] : null);
}

// 写给你的话：DeepSeek 看这段时间的数字和每天的一句话写一段，存在 letters（周 w周一 / 月 m月份 / 年 y年份）
const letterBusy = {};
function letterCard(d, r, s) {
  const letter = d.letters?.[r.key];
  const write = async () => {
    letterBusy[r.key] = true; render();
    try {
      const cfg = await aiConfig();
      const out = await askJson(cfg, LETTER_SYSTEM, `${r.title}的记录（${r.from} 到 ${r.to}）：\n${summaryText(s)}\n\n请写这段时间的回顾。返回 JSON：{"letter": "回顾正文"}`);
      await save(`回顾：${r.title}`, (data) => { (data.letters ||= {})[r.key] = { at: dayKey(), text: String(out.letter || '') }; });
    } catch (e) { toast(e.message, 'error'); }
    letterBusy[r.key] = false; render();
  };
  return h('div', { class: 'card letter' },
    h('h3', {}, icon('sparkle', 'i'), ' 写给你的话'),
    letter ? [h('p', { class: 'letter-text' }, letter.text),
      h('button', { class: 'link small', onclick: write, disabled: letterBusy[r.key] }, letterBusy[r.key] ? '正在写……' : '重新写')]
      : s.recorded < 2 ? h('p', { class: 'muted small' }, '这段时间记得太少，先不写。')
        : h('button', { class: 'secondary', onclick: write, disabled: letterBusy[r.key] }, letterBusy[r.key] ? 'DeepSeek 正在写……' : '请 DeepSeek 写一段'));
}

// 护肤：按早上 / 晚上 / 洗澡后 / 每周分组，每一项后面最近 14 天一天一个点
const WHEN_ICON = { am: 'today', pm: 'moon', shower: 'drop', week: 'calendar' };
function careDataCard(today) {
  const d = store.data;
  const rates = careItemRates(d, today);
  const span = Math.min(30, daysBetween(d.startDate || today, today) + 1);
  const dots = (list) => h('span', { class: 'dots', 'aria-hidden': 'true' }, list.map((v) => h('i', { class: v || 'none' })));
  const groups = ['am', 'pm', 'shower', 'week'].map((w) => {
    const items = rates.filter((x) => x.r.when === w);
    if (!items.length) return null;
    return h('div', { class: 'care-group' },
      h('div', { class: 'care-when' }, icon(WHEN_ICON[w], 'i'), WHEN[w]),
      items.map((x) => h('div', { class: 'care-rate' },
        h('span', { class: 'grow' }, x.r.name),
        w === 'week' ? h('span', { class: 'week-dots' }, dots(Array.from({ length: x.total }, (_, i) => (i < x.done ? 'done' : 'miss'))), h('small', { class: 'muted' }, '这周'))
          : w === 'shower' ? h('span', { class: 'small muted' }, x.total ? `洗澡 ${x.total} 次里做了 ${x.done} 次` : '还没洗过澡')
            : dots(careDots(d, x.r, today)))));
  });
  const forgot = span >= 7 ? rates.filter((x) => !x.week && x.total >= 5 && x.rate < 0.8 && !x.r.optional).sort((a, b) => a.rate - b.rate)[0] : null;
  return h('div', { class: 'card' },
    h('div', { class: 'rec-top' }, h('h3', {}, '护肤 · 最近两周'), h('button', { class: 'link small', onclick: routineSheet }, '改打卡项')),
    rates.length ? groups : h('p', { class: 'muted small' }, '还没有打卡项。点「改打卡项」加一个。'),
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
  const name = h('input', { value: r?.name || '', placeholder: '比如「防晒」「洗脸」', 'aria-label': '打卡项名字' });
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
      h('p', { class: 'muted small' }, '早上、晚上的会出现在「今天」的清单里；洗澡后的在记洗澡时问；每周的只在周六晚上出现。'),
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
    headerSub('定期打理', '到日子了会出现在「今天」', helpButton('定期打理怎么用', [['怎么用', ['平时不打扰你：前一天「今天」页会说一声「明天该……了」；到了日子出现在「今天」，没做就每天都在，点「做了」就从那天重新数。', '点一项可以改名字、几天一次、上次是哪天；也可以自己加，比如洗枕头、擦眼镜。']]])),
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
  ['白天的祷告', [
    '早上、下午、傍晚，想到就来，几分钟就好。',
    '两种都行：和 ChatGPT 说（点「打开 ChatGPT」，会打开 App 并带上要说的话，发送后切到语音），或者不方便的时候写一句话，点「阿们」。',
    '不读经文，只是把现在的事交给神。',
  ]],
  ['晚上的祷告', [
    '晚上 8 点以后第一次是晚上的祷告：ChatGPT 像一位懂信仰的长辈，陪你聊聊今天和心里的事，合适的时候带一两句圣经。',
    '想结束了就说「差不多了」，它会为你今天聊的事祷告。回来点「祷告完了」。',
  ]],
  ['提醒', ['每晚 22:30 左右，如果还没有晚上的祷告会提醒你（在「设置」里开启推送）。锁屏上看不出是什么。']],
];

// 某一天的祷告：几点、是晚上那次还是随时的（老数据只有 night / morning）
function prayersOn(d, day) {
  const p = d.days[day]?.prayer || {};
  const list = [...(p.times || [])];
  if (p.night && !list.some((x) => x.kind === 'night')) list.push({ at: p.night.at, kind: 'night' });
  if (p.morning) list.push({ at: p.morning.at, kind: 'quick' });
  return list.sort((a, b) => String(a.at).localeCompare(String(b.at)));
}
const isNightNow = (d, today) => { const hr = new Date().getHours(); return (hr >= 20 || hr < 4) && !d.days[today]?.prayer?.night; };

function prayView() {
  const d = store.data;
  const today = dayKey();
  const verse = verseFor(today, VERSES);
  const night = isNightNow(d, today);
  // 只显示最近有祷告的那一天
  let last = null;
  for (let i = 0; i < 60 && !last; i++) { const day = addDays(today, -i); if (prayersOn(d, day).length) last = day; }
  const list = last ? prayersOn(d, last) : [];
  return h('div', { class: 'pray-page' },
    headerSub('祷告', '', helpButton('祷告怎么用', PRAY_HELP)),
    h('div', { class: 'card pray-hero' },
      h('div', { class: 'pray-glow', 'aria-hidden': 'true' }),
      h('blockquote', { class: 'pray-verse' }, h('span', { class: 'v' }, verse.text), h('cite', {}, verse.ref)),
      h('div', { class: 'pray-divider', 'aria-hidden': 'true' }, h('span', {}, '✝')),
      h('a', { class: 'button wide pray-start', href: `#/pray/go?m=${night ? 'night' : 'quick'}` }, icon('candle'), '开始祷告'),
      h('p', { class: 'pray-mode small' }, night ? '聊一聊今天，最后为你祷告' : `${dayPrayName()}，几分钟或者一句话`,
        h('a', { class: 'pray-switch', href: `#/pray/go?m=${night ? 'quick' : 'night'}` }, night ? '只简短祷告' : '这是晚上那次'))),
    last ? h('div', { class: 'card pray-recent' },
      h('h3', {}, last === today ? '今天' : relDay(last, today), h('span', { class: 'muted small' }, ` · 祷告了 ${list.length} 次`)),
      h('div', { class: 'pray-times' }, list.map((x) => h('span', { class: `pray-time ${x.kind}` },
        x.kind === 'night' ? '✝ ' : '', String(x.at).includes('T') ? hm(x.at) : '', x.kind === 'night' ? ' 晚上' : ''))),
      list.filter((x) => x.text).map((x) => h('p', { class: 'small pray-said' }, h('span', { class: 'muted' }, `${hm(x.at)}　`), x.text))) : null,
    chatsCard(),
    h('a', { class: 'quiet-link', href: '#/low', onclick: () => resetLow() }, '难受的时候 ›'));
}

// 晚上祷告完问一句：要不要把今晚聊的记下来（不想记就点「不用了」）
function askRecordChat() {
  openSheet({
    title: '把今晚聊的记下来？',
    body: h('p', { class: 'muted small' }, '在刚才那次聊天里发一段话，ChatGPT 会把聊的整理成文字，复制回来就行。'),
    confirmText: '记一段', cancelText: '不用了',
    onConfirm: () => { delete chatDraft.new; go('#/chat/new?from=pray'); },
  });
}

// 白天的祷告叫什么：早上 / 下午 / 傍晚
function dayPrayName() {
  const hr = new Date().getHours();
  return hr >= 4 && hr < 11 ? '早上的祷告' : hr >= 11 && hr < 17 ? '下午的祷告' : hr >= 17 && hr < 20 ? '傍晚的祷告' : '祷告';
}

// 晚上的祷告：复制提示词 → 和 ChatGPT 语音聊天、开导，最后它为我祷告 →「祷告完了」。
// 白天的祷告：和 ChatGPT 简短说（不读经文），或者写一句话
const prayState = { key: '', step: 0, way: 'chatgpt' };
function prayGoView(mode) {
  const d = store.data;
  const today = dayKey();
  const m = mode === 'night' ? 'night' : 'quick';
  const key = `${today}-${m}`;
  if (prayState.key !== key) Object.assign(prayState, { key, step: 0 });
  const verse = verseFor(today, VERSES);
  const record = (said = '') => saveRender(m === 'night' ? '晚上的祷告' : '祷告', (data) => {
    const p = (dayOf(data, today).prayer ||= {});
    const at = nowIso();
    (p.times ||= []).push(said ? { at, kind: m, text: said } : { at, kind: m });
    if (m === 'night') p.night = { at, mode: 'chatgpt' };
  }).then((ok) => { if (!ok) return; prayState.key = ''; toast(CHEER_ON.prayer);
    if (m === 'night') { go('#/pray', true); askRecordChat(); } else go('#/pray'); // 换页会关掉弹出的，所以晚上那次直接换、再问
  });
  const back = h('a', { class: 'button secondary', href: '#/pray', onclick: () => { prayState.key = ''; } }, '先不了');
  const chatgpt = (text, steps) => [
    h('ol', { class: 'pray-steps' }, steps.map((x) => h('li', {}, x))),
    h('div', { class: 'actions' },
      chatgptButton(text, 'button grow'),
      h('button', { class: 'secondary', onclick: () => copyText(text) }, icon('copy'), '复制')),
    h('details', { class: 'prompt-peek' }, h('summary', { class: 'small muted' }, '看看要复制的话'), h('p', { class: 'small prompt-text' }, text))];
  if (m === 'night') {
    const text = prayerPrompt({ about: d.prayer.about || undefined, plan: d.days[today]?.plan || '' });
    return h('div', { class: 'pray-screen' },
      h('div', { class: 'pray-cross', 'aria-hidden': 'true' }, '✝'),
      h('h2', { class: 'pray-title' }, '晚上的祷告'),
      h('blockquote', { class: 'pray-verse' }, h('span', { class: 'v' }, verse.text), h('cite', {}, verse.ref)),
      chatgpt(text, ['点「打开 ChatGPT」，要说的话会带过去，发送后切到语音', '聊聊今天和心里的事，想结束了说「差不多了」，它会为你祷告', '回来点「祷告完了」']),
      h('div', { class: 'pray-nav' }, back,
        h('button', { class: 'grow', onclick: () => record() }, '祷告完了')));
  }
  // 白天：两种方式
  const way = prayState.way;
  const tabs = h('div', { class: 'segmented pray-ways', role: 'group', 'aria-label': '怎么祷告' }, [['chatgpt', '和 ChatGPT 说'], ['text', '写一句']].map(([v, t]) =>
    h('button', { type: 'button', class: `seg${way === v ? ' on' : ''}`, 'aria-pressed': String(way === v), onclick: () => { prayState.way = v; render(); } }, t)));
  let body;
  let done;
  if (way === 'text') {
    const said = h('textarea', { rows: 3, placeholder: '主，……', 'aria-label': '祷告的话' });
    body = [said, h('p', { class: 'muted small center' }, '一句就好。所有的事，都有神在帮助我。')];
    done = h('button', { class: 'grow', onclick: () => { const v = said.value.trim(); if (!v) { said.focus(); return; } record(v); } }, '阿们');
  } else {
    body = chatgpt(quickPrayerPrompt({ about: d.prayer.about || undefined }), ['点「打开 ChatGPT」，要说的话会带过去，发送后切到语音', '说说现在心里的事，回来点「祷告完了」']);
    done = h('button', { class: 'grow', onclick: () => record() }, '祷告完了');
  }
  return h('div', { class: 'pray-screen' },
    h('div', { class: 'pray-cross', 'aria-hidden': 'true' }, '✝'),
    h('h2', { class: 'pray-title' }, dayPrayName()),
    tabs, body,
    h('div', { class: 'pray-nav' }, back, done));
}

// ---------- 和 ChatGPT 聊过的 ----------
// 烦躁、心情有波动的时候和 ChatGPT 聊过，把聊的内容贴进来留着（只存在私有数据仓库）

const CHATS_HELP = [
  ['记一段', [
    '在 ChatGPT 那次聊天的最后（语音聊完也行），把「记一段」页面上那段话复制过去发送，它会把这次聊的整理成文字。',
    '长按它的回复，点「Copy」，回来贴进「聊天内容」。也可以只贴几句自己想留下的话。',
    '当时的心情、聊了什么可以不填；不写「聊了什么」就用内容的第一行。',
  ]],
  ['以后看', ['晚上祷告完会问一句要不要记下今晚聊的，点「记一段」就行，不想记点「不用了」。', '在「祷告」页下面和「全部」里按时间排着，能按心情挑、能搜。点进去能改、能删。', '这些只有你自己看得到，不会拿去分析，也不会发给 DeepSeek。']],
];
const byNewest = (a, b) => `${b.day}${b.at}`.localeCompare(`${a.day}${a.at}`);
const chatFirstLine = (text) => (String(text).split('\n').map((x) => x.trim()).find(Boolean) || '').slice(0, 40);
function chatCell(c) {
  const today = dayKey();
  return cell({ href: `#/chat/${c.id}`, title: c.title || chatFirstLine(c.text),
    sub: [c.from === 'pray' ? '晚上祷告' : '', c.mood ? CHAT_MOODS[c.mood] : '', `${c.text.length} 字`].filter(Boolean).join(' · '),
    meta: daysBetween(c.day, today) < 3 ? relDay(c.day, today) : `${parseDay(c.day).getMonth() + 1}/${parseDay(c.day).getDate()}` });
}

// 祷告页下面一块：最近两段 + 记一段
function chatsCard() {
  const list = [...store.data.chats].sort(byNewest);
  return [
    h('div', { class: 'section-title rec-top' }, h('span', {}, '和 ChatGPT 聊过的'), list.length > 2 ? h('a', { href: '#/chats' }, `全部 ${list.length} 段 ›`) : null),
    h('div', { class: 'group' },
      list.slice(0, 2).map(chatCell),
      cell({ href: '#/chat/new', ic: 'plus', title: '记一段', sub: list.length ? null : '烦躁、心里乱的时候和 ChatGPT 聊过，可以把聊的留下来' }))];
}

const chatState = { mood: '', q: '' };
function chatsView() {
  const all = [...store.data.chats].sort(byNewest);
  const box = h('div', {});
  const filter = () => {
    const q = chatState.q.trim();
    const list = all.filter((c) => (!chatState.mood || c.mood === chatState.mood) && (!q || `${c.title}\n${c.text}`.includes(q)));
    const months = [];
    for (const c of list) {
      const m = c.day.slice(0, 7);
      if (months.at(-1)?.m !== m) months.push({ m, list: [] });
      months.at(-1).list.push(c);
    }
    box.replaceChildren(...(list.length ? months.flatMap(({ m, list: l }) => [
      h('div', { class: 'section-title' }, `${Number(m.slice(0, 4))}年${Number(m.slice(5))}月`), h('div', { class: 'group' }, l.map(chatCell))])
      : [h('div', { class: 'card' }, h('p', { class: 'muted' }, all.length ? '没有找到。' : '还没有。和 ChatGPT 聊过以后，点「记一段」把聊的贴进来。'))]));
  };
  filter();
  const used = Object.entries(CHAT_MOODS).filter(([k]) => all.some((c) => c.mood === k));
  return h('div', {},
    headerSub('聊过的', all.length ? `和 ChatGPT 聊过 ${all.length} 段` : '和 ChatGPT 聊过的，留下来', helpButton('聊过的怎么用', CHATS_HELP)),
    h('a', { class: 'button wide', href: '#/chat/new' }, '＋ 记一段'),
    all.length > 5 ? h('input', { type: 'search', class: 'av-search', placeholder: '搜一搜', 'aria-label': '搜一搜', value: chatState.q, oninput: (e) => { chatState.q = e.target.value; filter(); } }) : null,
    used.length ? choiceRow('按心情', used, chatState.mood, (v) => { chatState.mood = v || ''; render(); }) : null,
    box,
    h('a', { class: 'small', href: '#/pray' }, '‹ 祷告'));
}

const chatDraft = {}; // 写了一半的，页面重画不丢
function chatEditView(id, q = {}) {
  const d = store.data;
  const c = id === 'new' ? null : d.chats.find((x) => x.id === id);
  if (id !== 'new' && !c) return notFound();
  const dr = (chatDraft[id] ||= { day: c?.day || dayKey(), mood: c?.mood || '', title: c?.title || '', text: c?.text || '', from: c?.from || (q.from === 'pray' ? 'pray' : '') });
  const keep = (k) => (e) => { dr[k] = e.target.value; };
  const day = h('input', { type: 'date', value: dr.day, max: dayKey(), 'aria-label': '哪天聊的', oninput: keep('day') });
  const title = h('input', { type: 'text', value: dr.title, placeholder: '一句话（可以不写，就用内容的第一行）', 'aria-label': '聊了什么', oninput: keep('title') });
  const text = h('textarea', { rows: 12, placeholder: '把 ChatGPT 整理好的文字贴在这里，也可以只贴几句想留下的', 'aria-label': '聊天内容', oninput: keep('text') });
  text.value = dr.text;
  const back = c ? `#/chat/${c.id}` : '#/pray';
  const submit = async () => {
    const body = dr.text.trim();
    if (!body) { toast('先把聊的内容贴进来', 'error'); text.focus(); return; }
    const entry = { day: dr.day || dayKey(), title: dr.title.trim(), text: body };
    if (dr.mood) entry.mood = dr.mood;
    if (dr.from) entry.from = dr.from;
    const cid = c?.id || newId('ct');
    const ok = await saveRender(c ? `改聊过的：${entry.title || chatFirstLine(body)}` : `记一段聊过的：${entry.title || chatFirstLine(body)}`, (data) => {
      if (c) {
        const x = data.chats.find((y) => y.id === c.id);
        if (!x) return;
        delete x.mood;
        Object.assign(x, entry);
      } else data.chats.push({ id: cid, at: nowIso(), ...entry });
    });
    if (ok) { delete chatDraft[id]; toast(c ? '改好了' : '记下了'); go(`#/chat/${cid}`, true); }
  };
  return h('div', {},
    headerSub(c ? '改一下' : '记一段', dr.from === 'pray' ? '晚上祷告时聊的' : '和 ChatGPT 聊过的'),
    c ? null : h('div', { class: 'card' },
      h('h3', {}, '从 ChatGPT 搬过来'),
      h('ol', { class: 'small steps' },
        h('li', {}, '复制下面这段话，回到刚才那次聊天里发送（语音聊的也行）。'),
        h('li', {}, '它会把这次聊的整理成文字。长按它的回复，点「Copy」。'),
        h('li', {}, '回来贴到下面「聊天内容」里。')),
      h('details', { class: 'inner' }, h('summary', {}, '看看这段话'), h('p', { class: 'goal-prompt' }, CHAT_RECORD_PROMPT)),
      h('button', { class: 'secondary small', onclick: () => copyText(CHAT_RECORD_PROMPT) }, icon('copy'), '复制这段话')),
    h('div', { class: 'card form' },
      h('label', {}, '哪天聊的', day),
      h('div', { class: 'label-sm' }, '那时候的心情（可以不选）'),
      choiceRow('那时候的心情', Object.entries(CHAT_MOODS), dr.mood, (v) => { dr.mood = v || ''; render(); }),
      h('label', {}, '聊了什么', title),
      h('label', {}, '聊天内容', text)),
    h('div', { class: 'actions' },
      h('a', { class: 'button secondary', href: back, onclick: () => { delete chatDraft[id]; } }, '取消'),
      h('button', { class: 'grow', onclick: submit }, '存好')));
}

function chatView(id) {
  const c = store.data.chats.find((x) => x.id === id);
  if (!c) return notFound();
  const name = c.title || chatFirstLine(c.text);
  const remove = () => saveUndoable(`删掉聊过的：${name}`, (data) => { data.chats = data.chats.filter((x) => x.id !== id); }, `删掉了「${name}」`)
    .then(() => go('#/chats', true)).catch(() => {});
  return h('div', {},
    headerSub(name, [dayLabel(c.day), c.from === 'pray' ? '晚上祷告' : '', c.mood ? CHAT_MOODS[c.mood] : ''].filter(Boolean).join(' · ')),
    h('div', { class: 'card' }, h('p', { class: 'letter-text' }, c.text)),
    h('div', { class: 'actions' },
      h('button', { class: 'secondary', onclick: () => copyText(c.text, '复制好了') }, icon('copy'), '复制'),
      h('a', { class: 'button secondary', href: `#/chat/${c.id}/edit` }, '改一下'),
      h('button', { class: 'danger', onclick: remove }, '删掉')),
    h('a', { class: 'small', href: '#/chats' }, '‹ 聊过的'));
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
  ['点亮', [
    '主城区（历下、市中、槐荫、天桥、历城）盖着一层雾，分成大约 1 公里一格的六边形。去过的地方会把雾吹开。',
    '记了「去过了」的地方，那一格和周围一圈都会亮，以前去过的也算。',
    '散步路过、没记成地方的，点「我在这」，用现在的位置点亮脚下那一格。',
    '坐地铁：点「坐了一趟」，选上车和下车的站。只有进出过的站才算，路过的不算。',
    '新点亮的格子，下次打开时雾会慢慢散开。',
  ]],
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
  const tabs = [['list', '列表'], ['map', '地图'], ['light', '点亮'], ['area', '按区'], ['foot', '足迹']];
  let body;
  if (placeState.tab === 'map') body = placesMap(list);
  else if (placeState.tab === 'light') body = placesLight(today);
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
// 点亮（2026-10-26）：主城区的雾，去过的地方、「我在这」、进出过的地铁站把雾吹开。计算在 js/fog.js
const LIT_SEEN = 'life-lit-seen'; // 这台设备上已经看过的亮格子：没看过的这次慢慢散开
function placesLight(today) {
  const d = store.data;
  const prog = fogProgress(d);
  const lines = metroProgress(d);
  const seen = new Set(readJson(LIT_SEEN).keys || []);
  const grid = mainGrid();
  const fresh = Object.keys(prog.cells).filter((k) => grid[k] && !seen.has(k));
  const el = h('div', { class: 'map-box fog-box' });
  loadLeaflet().then((L) => {
    if (!el.isConnected) return;
    const map = baseMap(el, L, cityCenter(), 11);
    const ring = (k) => [cellRing(k, 1.04)];
    const dark = Object.keys(grid).filter((k) => !prog.cells[k]);
    // 雾：没点亮的格子拼成一块（颜色在 CSS 里，跟着深浅色变）。smoothFactor 0：小格子不让 Leaflet 简化变形，不然格子之间漏缝
    L.polygon(dark.map(ring), { stroke: false, interactive: false, smoothFactor: 0, className: 'fog' }).addTo(map);
    if (fresh.length && seen.size) L.polygon(fresh.map(ring), { stroke: false, interactive: false, smoothFactor: 0, className: 'fog fog-new' }).addTo(map);
    const bounds = [];
    for (const x of MAIN_DISTRICTS) for (const r of x.rings) {
      const ll = r.map(([lng, lat]) => [lat, lng]);
      bounds.push(...ll);
      L.polyline(ll, { weight: 1, interactive: false, className: 'fog-edge' }).addTo(map);
    }
    for (const l of lines) {
      L.polyline(l.stations.map((x) => [x.lat, x.lng]), { weight: 2, interactive: false, className: 'metro-line' }).addTo(map);
      for (const x of l.stations) {
        L.circleMarker([x.lat, x.lng], { radius: x.day ? 4 : 2.5, weight: 1.2, className: x.day ? 'metro-st on' : 'metro-st' })
          .bindPopup(`${x.name}${x.day ? ` · ${x.day.slice(5).replace('-', '/')} 第一次` : ''}`).addTo(map);
      }
    }
    map.fitBounds(bounds, { padding: [10, 10] });
    writeJson(LIT_SEEN, { keys: Object.keys(prog.cells) });
  }).catch((e) => el.replaceChildren(h('p', { class: 'muted small' }, e.message)));
  const share = prog.total ? prog.lit / prog.total : 0;
  const pctText = (a, b) => (b ? `${((a / b) * 100).toFixed(a && a / b < 0.1 ? 1 : 0)}%` : '—');
  const rides = [...(d.metro || [])].sort((a, b) => b.day.localeCompare(a.day));
  const removeRide = (x) => saveUndoable(`删掉：地铁 ${x.from} → ${x.to}`, (data) => { data.metro = (data.metro || []).filter((y) => y.id !== x.id); }, '删掉了').then(render).catch(() => {});
  return [
    h('div', { class: 'card fog-sum' },
      h('div', { class: 'look-big' }, h('b', {}, pctText(prog.lit, prog.total)), h('span', {}, ' 主城区点亮了')),
      h('p', { class: 'muted small' }, `${prog.lit} / ${prog.total} 格，一格大约 ${HEX_KM} 公里宽${fresh.length && seen.size ? ` · 这次新亮了 ${fresh.length} 格` : ''}`),
      h('div', { class: 'actions' }, h('button', { class: 'secondary', onclick: lightHere }, '我在这'), h('button', { class: 'secondary', onclick: () => rideSheet(today) }, '坐了一趟'))),
    el,
    h('div', { class: 'card' }, h('h3', {}, '五个区'),
      prog.districts.map((x) => h('div', { class: 'area-row' },
        h('span', { class: 'area-name' }, x.name),
        h('span', { class: 'bar-track grow' }, h('span', { class: 'bar', style: `width:${x.total ? Math.max(x.lit ? 2 : 0, (x.lit / x.total) * 100) : 0}%;background:var(--accent)` })),
        h('span', { class: 'small muted area-num' }, pctText(x.lit, x.total)))),
      h('p', { class: 'muted small' }, share < 0.05 ? '刚刚开始。去过一个地方，记一下「去过了」，那一片就亮了。' : '亮得少的区，周末可以去转转。')),
    h('div', { class: 'card' }, h('h3', {}, '地铁'),
      lines.map((l) => h('details', { class: 'metro' },
        h('summary', { class: 'area-row' }, h('span', { class: 'area-name' }, l.name),
          h('span', { class: 'bar-track grow' }, h('span', { class: 'bar', style: `width:${(l.done / l.total) * 100}%;background:var(--accent)` })),
          h('span', { class: 'small muted area-num' }, `${l.done}/${l.total}`)),
        h('div', { class: 'chips metro-chips' }, l.stations.map((x) => h('span', { class: `chip${x.day ? ' on' : ''}` }, x.name))))),
      h('p', { class: 'muted small' }, '只算上车、下车的站，路过的不算。点一条线看是哪几站。'),
      rides.length ? h('details', { class: 'rides' }, h('summary', { class: 'small' }, `坐过的 ${rides.length} 趟`),
        h('div', { class: 'event-list' }, rides.map((x) => h('div', { class: 'event-row' },
          h('span', { class: 'muted small ev-time' }, x.day.slice(5).replace('-', '/')),
          h('span', { class: 'grow' }, `${x.from} → ${x.to}`),
          h('button', { class: 'icon-btn icon-del', 'aria-label': `删掉 ${x.from} → ${x.to}`, onclick: () => removeRide(x) }, icon('trash')))))) : null),
  ];
}
// 我在这：用现在的位置点亮脚下那一格（存 lights，高德坐标）
function lightHere() {
  if (!navigator.geolocation) { toast('这台设备拿不到位置', 'error'); return; }
  navigator.geolocation.getCurrentPosition((pos) => {
    const g = wgsToGcj(pos.coords.latitude, pos.coords.longitude);
    const lat = Math.round(g.lat * 1e5) / 1e5; const lng = Math.round(g.lng * 1e5) / 1e5;
    const before = fogProgress(store.data).cells;
    const dist = districtAt(lat, lng);
    const text = before[cellOf(lat, lng)] ? '这一格已经亮了' : dist ? `点亮了${dist}的一格` : '这里不在主城区，也记下了';
    saveUndoable('我在这', (data) => { (data.lights ||= []).push({ id: newId('l'), day: dayKey(), at: nowIso(), lat, lng }); }, text).then(render).catch(() => {});
  }, () => toast('拿不到位置：在 iPhone 设置里允许 Safari 使用位置', 'error'), { enableHighAccuracy: true, timeout: 10000 });
}
// 坐了一趟：上车、下车的站（换乘站在几条线里都有，选哪个都一样）
function rideSheet(today) {
  const pick = (label) => h('select', { 'aria-label': label },
    h('option', { value: '' }, label),
    METRO.map((l) => h('optgroup', { label: l.name }, l.stations.map(([n]) => h('option', { value: n }, n)))));
  const from = pick('上车的站');
  const to = pick('下车的站');
  const day = h('input', { type: 'date', value: today, max: today, 'aria-label': '哪天' });
  openSheet({
    title: '坐了一趟地铁',
    body: h('div', { class: 'form' }, h('label', {}, '从', from), h('label', {}, '到', to), h('label', {}, '哪天', day),
      h('p', { class: 'muted small' }, '只点亮这两站。')),
    confirmText: '记下',
    onConfirm: () => {
      if (!from.value || !to.value) { toast('选一下上车和下车的站', 'error'); return false; }
      if (from.value === to.value) { toast('上车和下车是同一站', 'error'); return false; }
      const st = metroStations();
      const had = new Set((store.data.metro || []).flatMap((x) => [x.from, x.to]));
      const n = [from.value, to.value].filter((x) => !had.has(x) && st[x]).length;
      return saveUndoable(`地铁：${from.value} → ${to.value}`, (data) => {
        (data.metro ||= []).push({ id: newId('m'), day: day.value || today, at: nowIso(), from: from.value, to: to.value });
      }, n ? `点亮了 ${n} 站` : '记下了').then(() => { render(); return true; }).catch(() => false);
    },
  });
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
  let withIds = [...(v?.with || [])];
  const ppl = store.data.people.map((x) => ({ id: x.id, name: x.name, hint: personHint(x), archived: x.archived }));
  const wRow = ppl.length ? personPicker({ people: ppl, value: withIds, multi: true, label: '和谁一起去的', recent: recentPeopleLife(), onChange: (ids) => { withIds = ids; } })
    : h('p', { class: 'muted small' }, '在「生活 → 身边的人」里加了人，就能在这里选。');
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
          const x = { id: vid, day: day.value || dayKey(), ...(score ? { score } : {}), ...(withIds.length ? { with: [...withIds] } : {}), ...(note.value.trim() ? { note: note.value.trim() } : {}), ...(photo ? { photo } : {}) };
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
    '回顾页顶上点「分析」到这里，点「这个月」回去。',
    '把你记下来的东西放在一起看：每天的心情、心情精力压力睡眠的走势、作息、一周里哪天状态好、洗澡运动的规律、什么在影响你。',
    '数据要攒一段时间：规律一两周就有；「什么在影响我」要心情记满 3 周才开始给结论。数据不够时会告诉你还要多少天。',
  ]],
  ['心情月历和一周里哪天', [
    '月历一天一个点，心情越好紫色越深，没记的那天空着。点两边的箭头看别的月。',
    '一周里哪天：最近 90 天，星期一到星期日各自的平均心情和精力。哪天记得不到 2 次就先空着。',
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
  const RH = { shower: ['洗澡', (e) => e.type === 'shower'], sport: ['运动', (e) => e.type === 'sport'] };
  const rh = rhythm(d, today, RH[statsState.rhythm][1]);
  const fmtH = (v) => (v === null ? '—' : `${Math.floor(v)} 小时${Math.round((v % 1) * 60) ? ` ${Math.round((v % 1) * 60)} 分` : ''}`);
  return h('div', {},
    headerSub('回顾', `心情记了 ${nMood} 天`, helpButton('分析怎么看', STATS_HELP)),
    lookTabs('stats'),

    moodMonthCard(today),

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

    weekdayCard(today),

    h('div', { class: 'section-title' }, '规律'),
    h('div', { class: 'segmented' }, Object.entries(RH).map(([k, [v]]) => h('button', { type: 'button', class: `seg${statsState.rhythm === k ? ' on' : ''}`, onclick: () => { statsState.rhythm = k; render(); } }, v))),
    h('div', { class: 'card' },
      rh.count ? [
        h('div', { class: 'stat-grid' },
          stat('这个月', `${rh.thisMonth} 次`), stat('上个月', `${rh.lastMonth} 次`),
          stat('平均隔', rh.avgGap === null ? '—' : `${Math.round(rh.avgGap * 10) / 10} 天`), stat('最长隔', rh.maxGap === null ? '—' : `${rh.maxGap} 天`)),
        monthGrid(today.slice(0, 7), rh.days, { title: '这个月哪天做了' }),
        h('h3', { style: 'margin-top:12px' }, '星期几'), barChart('一二三四五六日'.split('').map((w, i) => ({ label: w, v: rh.weekday[i] })), { title: '星期几' }),
        h('h3', {}, '几点'), barChart(Object.entries(rh.hours).map(([k, v]) => ({ label: k, v })), { title: '几点', color: 'var(--sage)' }),
      ] : h('p', { class: 'muted small' }, '还没有记录。')),

    h('div', { class: 'section-title' }, '什么在影响我'),
    h('div', { class: 'card' },
      nMood < MIN_DAYS ? h('p', { class: 'small' }, `心情再记大约 ${MIN_DAYS - nMood} 天，这里就开始有结论了。先照常记就好。`) : null,
      inf.length ? inf.slice(0, 8).map((x) => h('div', { class: 'inf-row' },
        h('span', { class: `inf-dot ${x.key === 'spend' ? (x.diff > 0 ? 'bad' : 'good') : x.diff >= 0 ? 'good' : 'bad'}` }),
        h('span', { class: 'grow small' }, influenceText(x), h('span', { class: 'muted block' }, `做了 ${x.nWith} 天 / 没做 ${x.nWithout} 天${x.reliable ? '' : ' · 还不太可靠'}`))))
        : h('p', { class: 'muted small' }, '每种情况都要有 3 天以上才能比，多记几天。'),
      h('p', { class: 'muted small' }, '只能看出两件事常常一起出现，看不出谁导致谁。')),

    h('div', { class: 'group' },
      cell({ href: '#/ask', ic: 'sparkle', title: '问问我的记录', sub: '用大白话问，DeepSeek 读你的记录回答' })));
}

// 心情月历：一天一个点，心情越好越深（1–2 分最浅，9–10 分最深），没记的空着
function moodMonthCard(today) {
  const d = store.data;
  const month = statsState.moodMonth || today.slice(0, 7);
  const first = `${month}-01`;
  const prev = addDays(first, -1).slice(0, 7);
  const next = addDays(`${month}-28`, 7).slice(0, 7);
  const lead = (parseDay(first).getDay() + 6) % 7;
  const n = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
  const cells = Array.from({ length: lead }, () => h('span', {}));
  const moods = [];
  for (let i = 1; i <= n; i++) {
    const x = `${month}-${String(i).padStart(2, '0')}`;
    const mood = d.days[x]?.mood;
    if (mood) moods.push(mood);
    const st = mood ? `mood m${Math.ceil(mood / 2)}` : x > today ? 'future' : 'empty';
    cells.push(h('span', { class: `md ${st}${x === today ? ' today' : ''}`, title: mood ? `${i} 日 · ${mood} 分` : `${i} 日` }, h('i', {}), h('small', {}, String(i))));
  }
  const earliest = [d.startDate || today, ...Object.keys(d.days).filter((x) => d.days[x].mood)].sort()[0].slice(0, 7);
  const move = (m) => { statsState.moodMonth = m === today.slice(0, 7) ? null : m; render(); };
  const avgMood = moods.length ? Math.round((moods.reduce((a, b) => a + b, 0) / moods.length) * 10) / 10 : null;
  return h('div', { class: 'card' },
    h('div', { class: 'period-nav' },
      prev >= earliest ? h('button', { class: 'icon-btn', onclick: () => move(prev), 'aria-label': '上个月' }, '‹') : h('span', { class: 'icon-btn ghost' }),
      h('h3', { class: 'grow center' }, `${Number(month.slice(5, 7))} 月的心情`),
      next <= today.slice(0, 7) ? h('button', { class: 'icon-btn', onclick: () => move(next), 'aria-label': '下个月' }, '›') : h('span', { class: 'icon-btn ghost' })),
    h('div', { class: 'dot-month', role: 'img', 'aria-label': '心情月历' }, ['一', '二', '三', '四', '五', '六', '日'].map((w) => h('span', { class: 'wd' }, w)), cells),
    h('p', { class: 'muted small legend mood-legend' }, '低', [1, 2, 3, 4, 5].map((k) => h('i', { class: `dot-sw m${k}` })), '高',
      h('span', { class: 'grow' }), moods.length ? `记了 ${moods.length} 天 · 平均 ${avgMood}` : '这个月还没记'));
}

// 一周里哪天状态好：最近 90 天，每个星期几的平均心情、精力
function weekdayCard(today) {
  const w = weekdayMood(store.data, today);
  if (!w.some((x) => x.mood !== null)) return null;
  const f1 = (v) => Math.round(v * 10) / 10;
  const bars = (key) => '一二三四五六日'.split('').map((label, i) => ({ label, v: w[i][key] === null ? 0 : f1(w[i][key]) }));
  const full = w.filter((x) => x.mood !== null);
  const best = full.length === 7 ? full.reduce((a, b) => (b.mood > a.mood ? b : a)) : null;
  const worst = best ? full.reduce((a, b) => (b.mood < a.mood ? b : a)) : null;
  const name = (x) => `星期${'一二三四五六日'[w.indexOf(x)]}`;
  return [h('div', { class: 'section-title' }, '一周里哪天状态好'),
    h('div', { class: 'card' },
      h('h3', {}, '心情'), barChart(bars('mood'), { title: '星期几的心情', scale: 10 }),
      h('h3', {}, '精力'), barChart(bars('energy'), { title: '星期几的精力', scale: 5, color: 'var(--good)' }),
      best && best.mood - worst.mood >= 0.5 ? h('p', { class: 'small' }, `${name(best)}心情最好（平均 ${f1(best.mood)}），${name(worst)}低一些（${f1(worst.mood)}）。`)
        : h('p', { class: 'muted small' }, best ? '每天差不多，没有哪天特别不一样。' : '最近 90 天，每个星期几都记过 2 次以上，就能比出来了。'))];
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
const LETTER_SYSTEM = '你是一位温暖、真诚的朋友，帮一位博士生回顾他的一段生活。他在用心学着照顾自己：护肤、祷告（他是基督徒）、运动。'
  + '用中文大白话写，160–260 字，分两三段。先说看到的好的地方（要具体，引用他的数字或他写的话），再温和地说一两个可以留意的规律，最后一句鼓励。'
  + '不说教，不评判，不用「你应该」，不夸张，不制造焦虑。没做到的事轻轻带过或者不提。只能说「常常一起出现」，不要下因果结论。';

function summaryText(s) {
  const f = (v) => (v === null ? '没记' : Math.round(v * 10) / 10);
  return [
    `记录了 ${s.recorded}/${s.days} 天。心情平均 ${f(s.mood)}（1–10），精力 ${f(s.energy)}（1–5），压力 ${f(s.stress)}（1–5），平均睡 ${f(s.sleep)} 小时。`,
    `护肤都做完 ${s.careDays} 天，洗澡 ${s.showers} 次，运动 ${s.sports} 次（${s.sportMinutes} 分钟${s.km ? `，${Math.round(s.km * 10) / 10} 公里` : ''}），祷告 ${s.prayers} 晚。`,
    s.visits.length ? `去过：${s.visits.map((v) => `${v.name}${v.score ? `（${v.score} 分）` : ''}`).join('、')}。` : '',
    s.notes.length ? `每天的一句话：${s.notes.map((x) => `${x.day.slice(5)} ${x.mood || '-'}分 ${x.note}`).join('；')}` : '',
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
      careFullDay(d, day) ? '护肤做完' : Object.keys(r.care || {}).length ? '护肤做了一部分' : '',
      r.prayer?.night ? '祷告' : '',
      r.note ? `「${r.note}」` : '', r.did ? `科研:${r.did}` : '', r.planDone ? `计划${{ yes: '做到', part: '部分', no: '没做' }[r.planDone]}` : '',
    ].filter(Boolean);
    if (parts.length) lines.push(`${day} ${parts.join('，')}`);
  }
  // 小记和日常生活完全分开：从来不发
  return `今天 ${today}。\n${lines.join('\n') || '（最近没什么记录）'}`;
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
  const examples = ['我最近为什么总是累？', '我状态最好的那几天有什么共同点？', '我睡得晚的第二天心情怎么样？', '这个月我做得最好的是什么？'];
  return h('div', {},
    headerSub('问问我的记录', 'DeepSeek 读你最近 60 天的记录'),
    askState.messages.length ? null : h('div', { class: 'chips' }, examples.map((x) => h('button', { type: 'button', class: 'chip', onclick: () => askRecords(x) }, x))),
    h('div', { class: 'chat' }, askState.messages.map((m) => h('div', { class: `msg ${m.role}${m.error ? ' error-msg' : ''}` }, m.text)),
      askState.busy ? h('div', { class: 'msg ai thinking' }, '正在翻你的记录……') : null),
    h('div', { class: 'chat-input' }, input, h('button', { onclick: send, disabled: askState.busy }, '问')),
    h('a', { class: 'small', href: '#/stats' }, '‹ 分析'));
}

// ---------- 换季 ----------
// 换季预防：每天查一次天气（Open-Meteo，不用密钥），存在 localStorage
const WEATHER_KEY = 'life-weather';
// 换季：要降温了 / 温差大，返回一句话（没有就 null），放在首页天气下面
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
  if (!w) return null;
  const n = daysBetween(dayKey(), w.date);
  const when = ['今天', '明天', '后天'][n] ?? w.date.slice(5).replace('-', '/');
  const x = cached.daily.find((y) => y.date === w.date);
  return w.kind === 'drop'
    ? `${when}降温，最低 ${Math.round(x.min)}°C，比今天低 ${w.drop}°C，多穿一件`
    : `${when}早晚温差 ${Math.round(x.max - x.min)}°C，出门带件外套`;
}

// ---------- 难受的时候 ----------
// 先呼吸 → 有多难受 → 哪一种 → 一件一件做 → 给你的话 → 现在呢。每一次记进 low.log，攒成「什么管用」。

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
  flag2: '另一个标记', flag2Yes: '是', flag2No: '否', flag2Stat: '另一个标记了',
  checksTitle: '之后', checksHint: '做了的点一下。', checks: { c1: '第一项', c2: '第二项', c3: '第三项' },
  suppliesTitle: '用品', suppliesHint: '只记在这里。', suppliesPlaceholder: '用品名字',
  help: [['怎么用', ['「记一次」：时间默认现在，可以改；评分、两个标记点一下；备注不用写。记完弹出三项勾选。', '上面显示距离上次多久。过了你设的节奏（设置里改），只在这一页提一句，不推送。', '这一页单独有 6 位密码，离开网站就锁上。']]],
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
        stat(ui.flagStat, s.flag === null ? '—' : `${Math.round(s.flag * 100)}%`), stat(ui.flag2Stat, s.flag2 === null ? '—' : `${Math.round(s.flag2 * 100)}%`),
        stat(ui.altStat, `${s.other} 次`)),
      s.recent ? h('div', { class: 'slot-bars' }, Object.entries(s.slot).map(([k, v]) => h('div', { class: 'slot' },
        h('span', { class: 'small' }, k), h('span', { class: 'bar-track' }, h('span', { class: 'bar', style: `width:${(v / slotMax) * 100}%;background:var(--accent)` })), h('span', { class: 'small muted' }, String(v))))) : null),
    s.list.length ? h('div', { class: 'card' }, h('h3', {}, '最近'),
      s.list.slice(-15).reverse().map((e) => h('button', { class: 'event-row product-row', onclick: () => privateSheet(e) },
        h('span', { class: 'grow' }, `${e.day.slice(5).replace('-', '/')} ${hm(e.at)}`,
          h('span', { class: 'muted small' }, [e.score ? `${ui.score} ${e.score}` : '', e.flag ? ui.flagStat : '', e.flag2 ? ui.flag2Stat : '', e.checks ? checksText(e.checks, ui) : ''].filter(Boolean).map((x) => ` · ${x}`).join(''))),
        icon('chev', 'i chev')))) : null,
    suppliesCard(ui));
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
  let flag2 = e ? Boolean(e.flag2) : null;
  const rows = h('div', {});
  const draw = () => rows.replaceChildren(
    h('div', { class: 'label-sm' }, ui.score), scoreRow(ui.score, 5, score, (v) => { score = v; draw(); }),
    h('div', { class: 'label-sm' }, ui.flag), choiceRow(ui.flag, [[true, ui.flagYes], [false, ui.flagNo]], flag, (v) => { flag = v; draw(); }),
    h('div', { class: 'label-sm' }, ui.flag2), choiceRow(ui.flag2, [[true, ui.flag2Yes], [false, ui.flag2No]], flag2, (v) => { flag2 = v; draw(); }));
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
          x.flag2 = Boolean(flag2);
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
      h('button', { class: 'link small muted icon-del', 'aria-label': '删掉', onclick: () => saveUndoable('小记：删用品', (data) => { data.private.supplies = data.private.supplies.filter((z) => z.id !== x.id); }, '删掉了').then(render).catch(() => {}) }, icon('trash')))),
    h('div', { class: 'inline-add' }, input, h('button', { class: 'small', onclick: add }, '加')));
}

// ---------- 想做到的事 ----------
// 写一句心愿 → 复制提示词和 ChatGPT 语音聊 → 让它「整理一下」，小结贴回来 → DeepSeek 拆成阶段、小事、习惯 → 一件件勾掉

const GOALS_HELP = [
  ['怎么用', [
    '点「＋ 写一个心愿」，用一句话写下想做到的事，比如「生活和工作分开，先从衣服开始」。',
    '点「打开 ChatGPT」（提示词会带过去），发送后切到语音，和它聊清楚。聊完说「整理一下」，它会写一份小结。',
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
      h('li', {}, '点「打开 ChatGPT」，提示词会带过去，发送。'),
      h('li', {}, '点语音按钮，和它聊清楚。'),
      h('li', {}, '聊完说「整理一下」，把它写的小结整段复制，贴到下面。')),
    h('details', { class: 'inner' }, h('summary', {}, '看看提示词'), h('p', { class: 'goal-prompt' }, text)),
    h('div', { class: 'actions' }, chatgptButton(text, 'button small'), h('button', { class: 'secondary small', onclick: () => copyText(text) }, icon('copy'), '复制提示词')),
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
  ['我们的经历', ['在一个人的页面「我们的经历」里，一段一段记下你们之间的事：从哪年到哪年、发生了什么。也可以写一大段话，点「写一段话整理」，DeepSeek 按时间分好段。']],
  ['重要的日子', ['婚礼、乔迁、孩子满月、答辩……记下来，前一天和当天「今天」里有一行；勾了「要随礼」的，会一起说以前你们来回送过多少。']],
  ['礼尚往来', ['在账本里记礼物、红包、请客时选「给谁的」，收到红包礼金选「谁给的」，这里就能看到。不花钱的礼，在「记一笔来往」里选「我送的礼 / 送我的礼」。']],
  ['过节问候', ['在资料里勾「过节要问候」（元旦、春节、端午、中秋、教师节）。节日前一天和当天，「今天」里出一行，点进去一个个「起个头」：DeepSeek 按你们的关系、你写的「怎么称呼、怎么说话」写一条，复制了自己改改再发，发完点「发了」。']],
  ['怎么还人情', ['欠的人情旁边点「怎么还」，DeepSeek 按这个人喜欢什么出几个主意；请吃饭的话会从你「想去的地方」里挑。']],
  ['不再来往', ['归档，不删除。资料和来往都留着，平时不显示，在列表最下面能看到。']],
  ['和账本', ['账本人情账里的人就是这份名单。在账本里新加的人，打开这一页时会出现在「还没分组」。名字在这里改，账本跟着改。']],
];

// 选人时「最近」：最近记过来往、一起去过地方的人
function recentPeopleLife() {
  const d = store.data;
  return recentIds([...d.people.flatMap((p) => (p.log || []).map((l) => ({ id: p.id, day: l.day }))),
    ...d.places.flatMap((pl) => (pl.visits || []).flatMap((v) => (v.with || []).map((id) => ({ id, day: v.day }))))]);
}

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

// 「我的故事」（../story）里和这个人有关的事：读 story-data 的 story.json 存 5 分钟，只读
const storyCache = { at: 0, data: null, busy: false };
function storySnap() {
  if (!storyCache.busy && Date.now() - storyCache.at > 300000) {
    storyCache.busy = true;
    const ss = readJson('story-settings');
    const owner = (settings.repo || DEFAULT_REPO).split('/')[0];
    new GitHub({ token: ss.token || settings.token, repo: ss.repo || `${owner}/story-data` }).readText('story.json', 'main')
      .then((t) => { storyCache.data = JSON.parse(t); if (/^\/person\/[^/]+$/.test(currentPath())) render(); })
      .catch(() => { /* 没授权 story-data 就不显示 */ })
      .finally(() => { storyCache.busy = false; storyCache.at = Date.now(); });
  }
  return storyCache.data;
}
function storyCard(p) {
  const s = storySnap();
  if (!s) return null;
  const evs = (s.events || []).filter((e) => (e.people || []).includes(p.id)).sort((a, b) => (a.date || '9').localeCompare(b.date || '9'));
  const stages = (s.stages || []).filter((x) => (x.people || []).includes(p.id));
  if (!evs.length && !stages.length) return null;
  const when = (e) => e.label || (e.date ? e.date.split('-').map(Number).join('.') : '');
  return h('div', { class: 'card story-card' },
    h('h3', {}, '在我的故事里'),
    stages.length ? h('p', { class: 'small muted' }, `${stages.map((x) => x.title).join('、')}的时候在身边`) : null,
    evs.map((e) => h('a', { class: 'story-row', href: `../story/#/event/${e.id}`, target: '_blank', rel: 'noopener' }, h('span', { class: 'muted small' }, when(e)), ' ', e.title)));
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
          let t = fin.people.find((p) => p.id === x.id);
          if (t) { t.name = x.name; if (x.archived) t.archived = true; else delete t.archived; } else fin.people.push(t = { id: x.id, name: x.name, ...(x.archived ? { archived: true } : {}) });
          if (x.hint) t.hint = x.hint; else delete t.hint;
        }
      });
    }
    peopleSync.at = Date.now();
    if (/^\/people|^\/person\/[^/]+$/.test(currentPath()) && !/\/(new|edit)$/.test(currentPath()) && (imports.length || merges.length || pushes.length)) render();
  } catch { /* 下次再同步 */ } finally { peopleSync.busy = false; }
}

// 头像墙：每个人一个圆（名字最后一个字，按主要的档上色）+ 全名；上面一排切换分组，可以搜
const peopleState = { tab: 'all', q: '' };
const WALL_ORDER = ['family', 'relative', 'grad', 'college', 'high', 'middle', 'primary'];
function avatar(p, soon) {
  return h('a', { class: `av${p.archived ? ' gone' : ''}${p.close ? ' close' : ''}`, href: `#/person/${p.id}`, 'data-name': p.name, 'data-key': [p.name, p.rel, p.note, p.how].filter(Boolean).join(' ') },
    h('span', { class: `av-c av-${mainGroup(p) || 'none'}` }, [...p.name].pop(), soon ? h('i', { class: 'av-dot', title: soon }) : null),
    h('span', { class: 'av-n' }, p.name));
}
function peopleView() {
  const d = store.data;
  const today = dayKey();
  syncPeople();
  const live = d.people.filter((p) => !p.archived);
  const gone = d.people.filter((p) => p.archived);
  const bd = upcomingBirthdays(d.people, today, 30);
  const dates = upcomingDates(d.people, today, 30);
  const soonOf = (p) => { const b = bd.find((x) => x.p.id === p.id && x.left <= 7); const x = dates.find((y) => y.p.id === p.id && y.left <= 7); return b ? '快过生日了' : x ? x.x.title : ''; };
  const byName = (a, b) => Boolean(b.close) - Boolean(a.close) || a.name.localeCompare(b.name, 'zh'); // 亲近的在前
  // 一块里按辈分分几行（只有一种辈分就不写小标题）
  const rankRows = (list) => {
    const rows = RANK_ORDER.map((r) => [r, list.filter((p) => rankOf(p) === r).sort(byName)]).filter(([, l]) => l.length);
    if (rows.length <= 1) return wall(list.sort(byName));
    return rows.map(([r, l]) => h('div', { class: 'av-rank' }, h('div', { class: 'av-rank-name' }, RANKS[r]), wall(l)));
  };
  const loose = live.filter((p) => !(p.groups || []).length);
  const tabs = [['all', '全部'], ...WALL_ORDER.filter((g) => live.some((p) => (p.groups || []).includes(g))).map((g) => [g, PEOPLE_GROUPS[g]]),
    ...(loose.length ? [['none', '还没分组']] : []), ...(gone.length ? [['gone', '不再来往']] : [])];
  if (!tabs.some(([k]) => k === peopleState.tab)) peopleState.tab = 'all';
  const wall = (list) => h('div', { class: 'av-wall' }, list.map((p) => avatar(p, p.archived ? '' : soonOf(p))));
  const block = (title, list, cls = '') => (list.length ? h('div', { class: `av-block ${cls}` }, h('div', { class: 'av-head' }, h('span', {}, title), h('span', { class: 'muted small' }, String(list.length))), rankRows(list)) : null);
  let body;
  const t = peopleState.tab;
  if (t === 'all') {
    const mentors = live.filter((p) => rankOf(p) === 'mentor');
    body = [block('导师', mentors, 'mentors'), loose.length ? block('还没分组', loose.filter((p) => !mentors.includes(p))) : null,
      ...WALL_ORDER.map((g) => block(PEOPLE_GROUPS[g], live.filter((p) => mainGroup(p) === g && !mentors.includes(p)))),
      gone.length ? h('button', { type: 'button', class: 'av-gone-row', onclick: () => { peopleState.tab = 'gone'; render(); } },
        h('span', { class: 'av-stack' }, gone.slice(0, 6).map((p) => h('span', { class: 'av-mini' }, [...p.name].pop()))),
        h('span', { class: 'grow muted small' }, `不再来往 ${gone.length} 人`), icon('chev', 'i chev')) : null];
  } else if (t === 'none') body = [rankRows(loose)];
  else if (t === 'gone') body = [wall(gone.sort(byName))];
  else {
    const list = live.filter((p) => (p.groups || []).includes(t));
    body = [rankRows(list)];
  }
  const area = h('div', { class: 'av-area' }, body);
  // 搜索只在这一页上藏起不匹配的，不重画（输入框不丢焦点）
  const filter = () => {
    const q = peopleState.q.trim();
    for (const el of area.querySelectorAll('.av')) el.hidden = Boolean(q) && !el.dataset.key.includes(q);
    for (const el of area.querySelectorAll('.av-block')) el.hidden = Boolean(q) && !el.querySelector('.av:not([hidden])');
  };
  const search = h('input', { type: 'search', class: 'av-search', placeholder: '找人', 'aria-label': '找人', value: peopleState.q, oninput: (e) => { peopleState.q = e.target.value; filter(); } });
  setTimeout(filter);
  return h('div', {},
    headerSub('身边的人', live.length ? `${live.length} 个人` : '家人、亲戚，一路上认识的人',
      h('a', { class: 'icon-btn', href: '#/person/new', 'aria-label': '加一个人' }, icon('plus')), helpButton('身边的人怎么用', PEOPLE_HELP)),
    bd.length || dates.length ? h('div', { class: 'card birthday-card' }, h('h3', {}, '快到的日子'),
      [...bd.map((x) => ({ ...x, what: `生日${x.age ? ` · ${x.age} 岁` : ''}` })), ...dates.map((x) => ({ ...x, what: x.x.title }))].sort((a, b) => a.left - b.left).slice(0, 6).map((x) => h('a', { class: 'birthday-row', href: `#/person/${x.p.id}` },
        h('span', { class: 'grow' }, h('b', {}, x.p.name), ` · ${x.what}`),
        h('span', { class: 'muted small' }, `${x.left === 0 ? '今天' : x.left === 1 ? '明天' : `${x.left} 天后`} · ${Number(x.day.slice(5, 7))}月${Number(x.day.slice(8))}日`)))) : null,
    (() => {
      const greets = festivalsAround(today).filter((f) => d.people.some((p) => !p.archived && (p.greet || []).includes(f.key)));
      return greets.length ? h('div', { class: 'alerts' }, greets.map((f) => alertLine(`${f.name}问候`, { href: `#/greet/${f.fkey}`, tone: 'soft' }))) : null;
    })(),
    d.people.length ? [
      h('div', { class: 'chips av-tabs', role: 'group', 'aria-label': '分组' }, tabs.map(([k, name]) => h('button', {
        type: 'button', class: `chip${t === k ? ' on' : ''}`, 'aria-pressed': String(t === k), onclick: () => { peopleState.tab = k; render(); } }, name))),
      d.people.length > 12 ? search : null,
      area,
    ] : h('div', { class: 'card' }, h('p', { class: 'muted' }, '还没有人。点右上角 ＋ 加第一个。')));
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
  const bdState = x.birthday ? 'yes' : x.noBirthday ? 'no' : x._bd || ''; // 先问知不知道生日，知道才展开
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
      const p = { ...x, id: pid, name, log: old?.log || [], ...(old?.stages ? { stages: old.stages } : {}), ...(old?.dates ? { dates: old.dates } : {}), at: old?.at || dayKey() };
      for (const k of ['rel', 'how', 'likes', 'note', 'tone']) { if (typeof p[k] === 'string') p[k] = p[k].trim(); if (!p[k]) delete p[k]; }
      if (!p.greet?.length) delete p.greet;
      if (!p.close) delete p.close;
      delete p._bd;
      if (!p.birthday) delete p.birthday; else delete p.noBirthday;
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
        : [h('div', { class: 'label-sm' }, '关系'), rel],
      h('div', { class: 'label-sm' }, '辈分'),
      h('div', { class: 'chips', role: 'group', 'aria-label': '辈分' }, Object.entries(RANKS).map(([k, t]) => h('button', {
        type: 'button', class: `chip${rankOf(x) === k ? ' on' : ''}`, 'aria-pressed': String(rankOf(x) === k), onclick: () => { x.rank = k; render(); } }, t))),
      h('label', { class: 'switch-row' }, h('input', { type: 'checkbox', checked: Boolean(x.close), 'aria-label': '更亲近', onchange: (e) => { x.close = e.target.checked || undefined; } }), '更亲近（头像多一圈金边）')),
    h('div', { class: 'card' }, h('div', { class: 'rec-top' }, h('h3', {}, '生日'),
      h('div', { class: 'chips', role: 'group', 'aria-label': '知道生日吗' }, [['yes', '知道'], ['no', '不知道']].map(([k, t]) => h('button', {
        type: 'button', class: `chip${bdState === k ? ' on' : ''}`, 'aria-pressed': String(bdState === k),
        onclick: () => { x._bd = k; if (k === 'no') { x.birthday = null; x.noBirthday = true; } else delete x.noBirthday; render(); } }, t)))),
      bdState !== 'yes' ? null : [h('div', { class: 'chips', role: 'group', 'aria-label': '公历还是农历' }, [['solar', '公历'], ['lunar', '农历']].map(([k, t]) => h('button', {
        type: 'button', class: `chip${(b.cal || 'solar') === k ? ' on' : ''}`, 'aria-pressed': String((b.cal || 'solar') === k), onclick: () => { x.birthday = { ...(x.birthday || {}), cal: k }; render(); } }, t))),
      h('div', { class: 'row-2' }, month, dayOf), year,
      x.birthday?.m && x.birthday?.d ? h('p', { class: 'muted small' }, `下一次：${(() => { const n = nextBirthday(x.birthday, dayKey()); return n ? `${Number(n.slice(0, 4))}年${Number(n.slice(5, 7))}月${Number(n.slice(8))}日` : '算不出来'; })()}`) : null]),
    h('div', { class: 'card detail-card' }, h('h3', {}, `关于${ta(x)}`),
      h('div', { class: 'detail-row' }, h('div', { class: 'detail-label' }, icon('people', 'i'), '怎么认识的'), input('how', { class: 'bare', rows: 2, placeholder: '比如：大一军训同一个连', 'aria-label': '怎么认识的' })),
      h('div', { class: 'detail-row' }, h('div', { class: 'detail-label' }, icon('sparkle', 'i'), '喜欢什么、不吃什么'), input('likes', { class: 'bare', rows: 2, placeholder: '比如：爱喝茶，不吃辣', 'aria-label': '喜欢什么' })),
      h('div', { class: 'detail-row' }, h('div', { class: 'detail-label' }, icon('pen', 'i'), '近况、要记得的'), input('note', { class: 'bare', rows: 2, placeholder: '比如：在准备考研', 'aria-label': '近况' })),
      h('div', { class: 'detail-row' }, h('div', { class: 'detail-label' }, icon('mic', 'i'), `怎么称呼${ta(x)}、怎么说话`), input('tone', { class: 'bare', rows: 2, placeholder: '比如：叫王老师，用「您」；或者 随便开玩笑', 'aria-label': '怎么称呼' })),
      h('div', { class: 'detail-row' }, h('div', { class: 'detail-label' }, icon('calendar', 'i'), '过节要问候'),
        h('div', { class: 'chips detail-chips', role: 'group', 'aria-label': '过节要问候' }, Object.entries(GREET_DAYS).map(([k, t]) => {
          const on = (x.greet || []).includes(k);
          return h('button', { type: 'button', class: `chip${on ? ' on' : ''}`, 'aria-pressed': String(on), onclick: () => { x.greet = on ? x.greet.filter((y) => y !== k) : [...(x.greet || []), k]; render(); } }, t);
        })))),
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
    const text = h('textarea', { rows: 3, placeholder: `比如：一起吃了饭，${ta(p)}帮我改了简历`, 'aria-label': '发生了什么' });
    text.value = l?.text || '';
    let gift = l?.gift || '';
    const giftRow = h('div', {});
    const drawGift = () => giftRow.replaceChildren(choiceRow('这是', [['out', `我送${ta(p)}的礼`], ['in', `${ta(p)}送我的礼`]], gift, (v) => { gift = v || ''; drawGift(); }),
      h('p', { class: 'muted small' }, '花了钱、收了红包的，在账本里记那笔钱时选上这个人就行，这里不用再记。'));
    drawGift();
    const close = openSheet({
      title: l ? '改这一笔' : '记一笔来往',
      body: h('div', { class: 'form' }, h('label', {}, '哪天', day), text, giftRow,
        l ? h('button', { class: 'danger small', onclick: () => { close(); upd('删掉一笔来往', (x) => { x.log = x.log.filter((y) => y.id !== l.id); }); } }, '删掉这一笔') : null),
      confirmText: '存好',
      onConfirm: () => {
        if (!text.value.trim()) { toast('写一句', 'error'); return false; }
        return upd(`来往：${p.name}`, (x) => {
          x.log ||= [];
          const rec = { id: l?.id || newId('l'), day: day.value || today, text: text.value.trim(), ...(l?.favor ? { favor: l.favor } : {}), ...(gift ? { gift } : {}) };
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
    const ef = estimateFields(p, {}, () => text.value.trim());
    const drawDir = () => { dirRow.replaceChildren(choiceRow('谁欠谁', [['owe', `我欠${ta(p)}`], ['owed', `${ta(p)}欠我`]], dir, (v) => { dir = v || dir; drawDir(); })); ef.node.hidden = dir !== 'owe'; };
    drawDir();
    openSheet({
      title: '记一个人情', body: h('div', { class: 'form' }, dirRow, text, h('label', {}, '哪天', day), ef.node,
        h('p', { class: 'muted small' }, '记进账本的人情账。节假日会问一句这次还不还。')),
      confirmText: '记好了',
      onConfirm: async () => {
        if (!text.value.trim()) { toast('写一下是什么事', 'error'); return false; }
        const fid = newId('f');
        try {
          await saving('正在记进账本…', async () => {
            await syncPeople(true);
            await updateLedger(`人情：${p.name}（从「生活」）`, (f) => {
              const v = dir === 'owe' ? ef.values() : {};
              (f.favors ||= []).push({ id: fid, person: id, dir, text: text.value.trim(), date: day.value || today, createdAt: new Date().toISOString(), status: 'open',
                ...(v.cost ? { cost: v.cost } : {}), ...(v.estimate ? { estimate: v.estimate } : {}) });
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
    headerSub(p.name, [SEX[p.sex], groupsText || '还没分组', p.rel, rankOf(p) !== 'peer' ? RANKS[rankOf(p)] : null, p.close ? '亲近' : null].filter(Boolean).join(' · '), h('a', { class: 'icon-btn', href: `#/person/${id}/edit`, 'aria-label': '改资料' }, icon('pen'))),
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
    stagesCard(p),
    storyCard(p),
    openFavors.length || owe ? h('div', { class: 'card favor-sum' }, h('h3', {}, '人情'),
      favorRows(p, ledger),
      owe ? h('p', { class: 'small muted' }, owe > 0 ? `钱：${ta(p)}欠你 ¥${owe}` : `钱：你欠${ta(p)} ¥${-owe}`) : null,
      h('a', { class: 'small', href: `../ledger/#/person/${id}`, target: '_blank', rel: 'noopener' }, '在账本里看')) : null,
    giftBookCard(p, ledger),
    datesCard(p, today),
    h('div', { class: 'section-title' }, tl.length ? '来往' : ''),
    tl.length ? h('div', { class: 'card timeline' }, tl.map((e) => h('div', { class: `tl-row ${e.kind}` },
      h('span', { class: 'tl-day muted small' }, e.day.slice(0, 4) === today.slice(0, 4) ? e.day.slice(5).replace('-', '/') : e.day.slice(2).replace(/-/g, '/')),
      e.kind === 'log' ? h('button', { type: 'button', class: 'grow tl-text', onclick: () => logSheet(e.log) }, e.text)
        : e.href ? h('a', { class: 'grow tl-text', href: e.href }, e.text) : h('span', { class: 'grow tl-text' }, e.text),
      e.kind === 'log' && !e.log.favor ? h('button', { class: 'link small', onclick: () => favorSheet(e.log) }, '记成人情') : null)))
      : h('p', { class: 'muted small center' }, '还没有来往的记录。'),
    p.archived ? null : h('p', { class: 'center' }, h('button', { class: 'link small muted', onclick: archive }, '不再来往了')),
    h('a', { class: 'small', href: '#/people' }, '‹ 身边的人'));
}

// 想想送什么：DeepSeek 按记下的喜好出主意，可以放进账本心愿单（送人）
async function giftIdeas(p, ledger, next) {
  const wishes = (ledger?.wishes || []).filter((w) => w.status === 'open' && w.kind === 'gift').map((w) => `${w.name}（¥${w.price}）`);
  const system = `你帮一个研究生想送身边的人什么礼物。按下面记的这个人的情况，出 3–5 个具体的主意：学生买得起、实用或有心意，和${ta(p)}的喜好、近况、你们的关系对得上；不要泛泛的「鲜花」「贺卡」。礼尚往来里以前送过的不要重复。`
    + `每个主意：name 东西（具体一点），price 大概多少钱（人民币整数），why 一句话为什么适合${ta(p)}，query 淘宝 / 小红书的搜索词（4–10 个字）。说话温和简短。`
    + '只输出 JSON：{"ideas":[{"name":"","price":0,"why":"","query":""}]}';
  const user = [
    next ? `生日是 ${next}（今天 ${dayKey()}）。` : `今天 ${dayKey()}。`,
    personContext(p, ledger),
    wishes.length ? `心愿单里已经有要送人的：${wishes.join('、')}` : '',
  ].filter(Boolean).join('\n\n');
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

// 发给 DeepSeek 的「这个人」：关系、怎么说话、经历、来往、人情、礼尚往来
function personContext(p, ledger) {
  const pr = ta(p);
  const favors = (ledger?.favors || []).filter((f) => f.person === p.id)
    .map((f) => `${f.date} ${f.dir === 'owe' ? `${pr}帮过我` : `我帮过${pr}`}：${f.text}${f.status === 'done' ? `（还了${f.doneNote ? `：${f.doneNote}` : ''}）` : '（还没还）'}`);
  const gifts = giftsWith(store.data, ledger, p.id).slice(0, 8).map((g) => `${g.day} ${g.dir === 'out' ? `我给${pr}` : `${pr}给我`}：${g.text}${g.amount ? ` ¥${Math.round(g.amount)}` : ''}`);
  const stages = (p.stages || []).slice().sort((a, b) => String(a.from).localeCompare(String(b.from)))
    .map((s) => `${s.from || ''}${s.to ? `–${s.to}` : s.from ? ' 起' : ''} ${s.title}${s.text ? `：${s.text}` : ''}`);
  return [
    `${p.name}，${[SEX[p.sex], RANKS[rankOf(p)], (p.groups || []).map((g) => PEOPLE_GROUPS[g]).join('、') && `${(p.groups || []).map((g) => PEOPLE_GROUPS[g]).join('、')}认识的`, p.rel].filter(Boolean).join('，')}。`,
    p.birthday?.m ? `生日：${birthdayText(p.birthday)}` : '',
    p.tone ? `我平时怎么称呼${pr}、怎么和${pr}说话：${p.tone}` : '',
    p.how ? `怎么认识的：${p.how}` : '', p.likes ? `${pr}喜欢什么、不吃什么：${p.likes}` : '', p.note ? `近况、要记得的：${p.note}` : '',
    stages.length ? `我们的经历：\n${stages.join('\n')}` : '',
    (p.log || []).length ? `最近的来往：${p.log.slice().sort((a, b) => a.day.localeCompare(b.day)).slice(-8).map((l) => `${l.day} ${l.text}`).join('；')}` : '',
    favors.length ? `人情：${favors.join('；')}` : '',
    gifts.length ? `礼尚往来：${gifts.join('；')}` : '',
  ].filter(Boolean).join('\n');
}

// 我们的经历：一段一段（2019-09 到 2023-06 本科同宿舍……）
function stageSheet(p, s = null) {
  const title = h('input', { placeholder: '这一段叫什么，比如 本科同宿舍', 'aria-label': '这一段', value: s?.title || '' });
  const from = h('input', { placeholder: '从（2019 或 2019-09）', 'aria-label': '从', value: s?.from || '' });
  const to = h('input', { placeholder: '到（还在继续就空着）', 'aria-label': '到', value: s?.to || '' });
  const text = h('textarea', { rows: 5, placeholder: '这段时间里你们之间发生了什么，想写多少写多少', 'aria-label': '发生了什么' });
  text.value = s?.text || '';
  const close = openSheet({
    title: s ? '改这一段' : '加一段经历',
    body: h('div', { class: 'form' }, title, h('div', { class: 'row-2' }, from, to), text,
      s ? h('button', { class: 'danger small', onclick: () => { close(); saveRender('删掉一段经历', (data) => { const x = data.people.find((y) => y.id === p.id); x.stages = x.stages.filter((y) => y.id !== s.id); }); } }, '删掉这一段') : null),
    confirmText: '存好',
    onConfirm: () => {
      if (!title.value.trim()) { toast('给这一段起个名字', 'error'); return false; }
      return saveRender(`经历：${p.name}`, (data) => {
        const x = data.people.find((y) => y.id === p.id);
        x.stages ||= [];
        const rec = { id: s?.id || newId('s'), title: title.value.trim(), from: from.value.trim(), ...(to.value.trim() ? { to: to.value.trim() } : {}), ...(text.value.trim() ? { text: text.value.trim() } : {}) };
        const i = x.stages.findIndex((y) => y.id === rec.id);
        if (i >= 0) x.stages[i] = rec; else x.stages.push(rec);
      });
    },
  });
}
// 写一大段话，DeepSeek 分成几段经历（加在后面，不动已有的）
function stagesFromTextSheet(p) {
  const text = h('textarea', { rows: 8, placeholder: `想到什么写什么：怎么认识的、哪几年走得近、发生过什么、后来怎么样了……`, 'aria-label': '写一段话' });
  openSheet({
    title: `和${p.name}的经历`,
    body: h('div', { class: 'form' }, text, h('p', { class: 'muted small' }, 'DeepSeek 按时间分成几段，加在后面。分得不对可以再改。')),
    confirmText: '整理',
    onConfirm: async () => {
      if (!text.value.trim()) { toast('先写一段', 'error'); return false; }
      let list;
      try {
        list = await saving('正在整理…', async () => {
          const system = '你帮一个研究生整理他和一个人之间的经历。他写了一段话，按时间分成几段（一般 1–5 段），每段：title 简短的名字（比如「本科同宿舍」「一起备考」「在一起」「分开以后」），from / to 用「2019」或「2019-09」这样的写法（不知道就空字符串；还在继续 to 空），text 用他的话把这段里的事写清楚，不加评价、不说教、不编没说的事。'
            + '只输出 JSON：{"stages":[{"title":"","from":"","to":"","text":""}]}';
          const out = await askJson(await aiConfig(), system, `${personContext(p, ledgerSnap())}\n\n他写的：\n${text.value.trim()}`, { maxTokens: 4000, timeout: 90000 });
          return (out.stages || []).filter((x) => x?.title);
        });
      } catch { return false; }
      if (!list.length) { toast('没整理出来，换个说法试试', 'error'); return false; }
      return saveRender(`经历：${p.name}（${list.length} 段）`, (data) => {
        const x = data.people.find((y) => y.id === p.id);
        x.stages ||= [];
        for (const s of list) x.stages.push({ id: newId('s'), title: String(s.title).trim(), from: String(s.from || '').trim(), ...(s.to ? { to: String(s.to).trim() } : {}), ...(s.text ? { text: String(s.text).trim() } : {}) });
      });
    },
  });
}
function stagesCard(p) {
  const list = (p.stages || []).slice().sort((a, b) => String(a.from || '9').localeCompare(String(b.from || '9')));
  return h('div', { class: 'card stages-card' },
    h('div', { class: 'rec-top' }, h('h3', {}, '我们的经历'), h('span', {},
      h('button', { class: 'link small', onclick: () => stagesFromTextSheet(p) }, '写一段话整理'),
      h('button', { class: 'link small', onclick: () => stageSheet(p) }, '＋ 一段'))),
    list.length ? h('div', { class: 'stages' }, list.map((s) => h('button', { type: 'button', class: 'stage', onclick: () => stageSheet(p, s) },
      h('span', { class: 'stage-when muted small' }, s.from ? `${s.from}${s.to ? ` – ${s.to}` : ' 起'}` : ''),
      h('b', { class: 'stage-title' }, s.title),
      s.text ? h('span', { class: 'stage-text small' }, s.text) : null)))
      : h('p', { class: 'muted small' }, `一段一段记下你们之间的经历：怎么认识、哪几年走得近、后来怎么样了。`));
}

// 「他为我花了多少」「大概要准备多少」+「估一个」（DeepSeek 按以前来回的钱给参考）
function estimateFields(p, { cost: c0, estimate: e0 } = {}, getText, { withCost = true } = {}) {
  const cost = h('input', { inputmode: 'decimal', placeholder: '不知道就空着', 'aria-label': `${ta(p)}为我花了多少`, value: c0 ? String(c0) : '' });
  const est = h('input', { inputmode: 'decimal', placeholder: '大概要准备多少', 'aria-label': '预计要准备多少', value: e0 ? String(e0) : '' });
  const why = h('p', { class: 'muted small' });
  const guess = async (btn) => {
    if (!getText()) { toast('先写是什么事', 'error'); return; }
    btn.disabled = true; btn.textContent = '正在估……';
    try {
      const ledger = ledgerSnap();
      const history = [
        ...giftsWith(store.data, ledger, p.id).map((g) => `${g.day} ${g.dir === 'out' ? `我给${ta(p)}` : `${ta(p)}给我`} ${g.text}${g.amount ? ` ¥${Math.round(g.amount)}` : ''}`),
        ...(ledger?.favors || []).filter((x) => x.person === p.id && x.status === 'done').map((x) => `${x.doneAt} 还过人情「${x.text}」${x.doneNote ? `（${x.doneNote}）` : ''}${x.cost ? `，当时${ta(p)}花了 ¥${x.cost}` : ''}`),
      ];
      const { system, user } = estimatePrompt({ who: { name: p.name, hint: [personHint(p), RANKS[rankOf(p)], p.close ? '比较亲近' : ''].filter(Boolean).join(' · ') }, f: { text: getText(), dir: 'owe', cost: Number(cost.value) || 0 }, history, budget: ledger?.budget?.daily || 0 });
      const r = cleanEstimate(await askJson(await aiConfig(), system, user, { maxTokens: 1000, timeout: 60000 }));
      if (r.estimate) est.value = String(r.estimate);
      why.textContent = r.why ? `DeepSeek：${r.why}` : '';
    } catch (e) { toast(e.message, 'error'); }
    btn.disabled = false; btn.textContent = '估一个';
  };
  const num = (el) => Number(el.value.replace(/[，,\s¥]/g, '')) || 0;
  return {
    node: h('div', { class: 'form' },
      withCost ? h('label', {}, `${ta(p)}为我花了多少（选填）`, cost) : null,
      h('label', {}, '大概要准备多少（选填）', h('div', { class: 'inline-add' }, est, h('button', { type: 'button', class: 'small secondary', onclick: (e) => guess(e.currentTarget) }, '估一个'))), why,
      h('p', { class: 'muted small' }, `${FAVOR_BIG} 以上的会在账本里自动算成存款目标，以下的从日常里出。`)),
    values: () => ({ cost: withCost ? num(cost) : 0, estimate: num(est) }),
  };
}

// 重要的日子：婚礼、乔迁、满月、答辩……；要随礼的，到时候提醒以前来回送过多少
const DATE_KINDS = ['婚礼', '乔迁', '孩子满月', '升学毕业', '答辩', '纪念日'];
function dateSheet(p, x = null) {
  const title = h('input', { placeholder: '什么日子，比如 婚礼', 'aria-label': '什么日子', value: x?.title || '' });
  const day = h('input', { type: 'date', 'aria-label': '哪天', value: x?.day || '' });
  let gift = x?.gift ?? false;
  let yearly = x?.yearly ?? false;
  const fid = `fd-${x?.id || newId('d')}`; // 账本里对应的人情（随礼）
  const old = (ledgerSnap()?.favors || []).find((f) => f.id === (x ? `fd-${x.id}` : fid));
  const ef = estimateFields(p, { estimate: old?.estimate || x?.estimate }, () => title.value.trim(), { withCost: false });
  const opts = h('div', {});
  const drawOpts = () => opts.replaceChildren(
    h('div', { class: 'chips' }, DATE_KINDS.map((k) => h('button', { type: 'button', class: 'chip', onclick: () => { title.value = k; if (/婚礼|乔迁|满月|升学/.test(k)) gift = true; if (k === '纪念日') yearly = true; drawOpts(); } }, k))),
    h('label', { class: 'switch-row' }, h('input', { type: 'checkbox', checked: gift, onchange: (e) => { gift = e.target.checked; drawOpts(); } }), '要随礼 / 送东西'),
    h('label', { class: 'switch-row' }, h('input', { type: 'checkbox', checked: yearly, onchange: (e) => { yearly = e.target.checked; drawOpts(); } }), '每年都有'),
    gift && !yearly ? ef.node : '');
  drawOpts();
  const close = openSheet({
    title: x ? '改这个日子' : `${p.name}的重要日子`,
    body: h('div', { class: 'form' }, title, h('label', {}, '哪天', day), opts,
      x ? h('button', { class: 'danger small', onclick: () => { close(); saveRender('删掉一个日子', (data) => { const q = data.people.find((y) => y.id === p.id); q.dates = q.dates.filter((y) => y.id !== x.id); }).then(() => syncDateFavor(p, x.id, null)); } }, '删掉') : null),
    confirmText: '存好',
    onConfirm: async () => {
      if (!title.value.trim() || !day.value) { toast('写上什么日子、哪天', 'error'); return false; }
      const did = x?.id || fid.slice(3);
      const ok = await saveRender(`重要的日子：${p.name} ${title.value.trim()}`, (data) => {
        const q = data.people.find((y) => y.id === p.id);
        q.dates ||= [];
        const rec = { id: did, day: day.value, title: title.value.trim(), ...(gift ? { gift: true } : {}), ...(yearly ? { yearly: true } : {}) };
        const i = q.dates.findIndex((y) => y.id === rec.id);
        if (i >= 0) q.dates[i] = rec; else q.dates.push(rec);
      });
      if (ok) syncDateFavor(p, did, gift && !yearly ? { title: title.value.trim(), day: day.value, estimate: ef.values().estimate } : null);
      return ok;
    },
  });
}
// 要随礼的日子 → 账本里一个有日子的人情（id fd-日子id）：预计的钱进「要准备的钱」，300 以上进存款目标；不随礼了 / 删了就拿掉（还没还的）
function syncDateFavor(p, dateId, rec) {
  const fid = `fd-${dateId}`;
  const cur = (ledgerSnap()?.favors || []).find((f) => f.id === fid);
  if (!rec && !cur) return;
  updateLedger(rec ? `人情：${p.name} ${rec.title}（从「生活」）` : `人情：拿掉 ${p.name} 的日子（从「生活」）`, (f) => {
    f.favors ||= [];
    const i = f.favors.findIndex((x) => x.id === fid);
    if (!rec) { if (i < 0 || f.favors[i].status === 'done') return false; f.favors.splice(i, 1); return; }
    const base = i >= 0 ? f.favors[i] : { id: fid, person: p.id, dir: 'owe', kind: 'date', dateId, date: dayKey(), createdAt: new Date().toISOString(), status: 'open' };
    Object.assign(base, { text: rec.title, due: rec.day });
    if (rec.estimate) base.estimate = rec.estimate; else delete base.estimate;
    if (i < 0) f.favors.push(base);
    f.people ||= [];
    if (!f.people.some((x) => x.id === p.id)) f.people.push({ id: p.id, name: p.name });
  }).then(() => { if (/^\/person\//.test(currentPath())) render(); }).catch(() => toast('账本那边没记上，等会儿再改一次这个日子', 'error'));
}
function datesCard(p, today) {
  const list = (p.dates || []).slice().sort((a, b) => b.day.localeCompare(a.day));
  return h('div', { class: 'card' },
    h('div', { class: 'rec-top' }, h('h3', {}, '重要的日子'), h('button', { class: 'link small', onclick: () => dateSheet(p) }, '＋ 一个日子')),
    list.length ? list.map((x) => h('button', { type: 'button', class: 'date-row', onclick: () => dateSheet(p, x) },
      h('span', { class: 'grow' }, x.title, x.gift ? h('span', { class: 'muted small' }, (() => { const f = (ledgerSnap()?.favors || []).find((y) => y.id === `fd-${x.id}`); return f?.status === 'done' ? ' · 随过了' : f?.estimate ? ` · 随礼约 ¥${f.estimate}` : ' · 要随礼'; })()) : null),
      h('span', { class: 'muted small' }, x.yearly ? `每年 ${Number(x.day.slice(5, 7))}月${Number(x.day.slice(8))}日` : `${x.day}${x.day >= today ? ` · 还有 ${daysBetween(today, x.day)} 天` : ''}`)))
      : h('p', { class: 'muted small' }, '婚礼、乔迁、孩子满月、答辩……记下来，前一天会提醒你；要随礼的，会告诉你以前来回送过多少。'));
}
function giftBookCard(p, ledger) {
  const list = giftsWith(store.data, ledger, p.id);
  if (!list.length) return null;
  return h('div', { class: 'card' }, h('h3', {}, '礼尚往来'),
    h('p', { class: 'muted small' }, giftSummary(list, ta(p))),
    list.slice(0, 12).map((g) => h('div', { class: 'gift-line' },
      h('span', { class: `favor-dir ${g.dir === 'out' ? 'owe' : 'owed'}` }, g.dir === 'out' ? `给${ta(p)}` : `${ta(p)}给`),
      h('span', { class: 'grow small' }, g.text), g.amount ? h('span', { class: 'small' }, `¥${Math.round(g.amount * 100) / 100}`) : null,
      h('span', { class: 'muted small' }, g.day.slice(0, 7)))));
}

// 怎么还人情：DeepSeek 按他喜欢什么出主意；请吃饭就从「想去的地方」里挑
const repayState = {}; // { 人情 id: { busy, ideas } }
async function repayIdeas(p, f, ledger) {
  const places = store.data.places.filter((x) => ['food', 'shop', 'show', 'museum', 'spot', 'walk'].includes(x.kind)).slice(0, 80)
    .map((x) => `${x.id} | ${x.name} | ${PLACE_KINDS[x.kind]?.name || ''} | ${x.district || ''} | ${(x.visits || []).length ? '去过' : '还没去'}${x.cost ? ` | 人均约 ¥${x.cost}` : ''}`);
  const system = `你帮一个研究生想怎么还一个人情。按这个人的情况和这份人情的轻重，出 2–4 个具体、自然的还法：请吃饭、送个小东西、帮${ta(p)}一个忙、陪${ta(p)}做件事都行，不要太隆重让人有负担，也不要太随便。`
    + '如果合适请吃饭或者一起去哪，就从他「想去的地方」清单里挑，place 写那一行最前面的 id（不在清单里就不写）。说话温和简短，不说教。'
    + '只输出 JSON：{"ideas":[{"text":"一句话怎么还","why":"为什么合适，一句话","place":""}]}';
  const user = [`今天 ${dayKey()}。`, personContext(p, ledger), `要还的人情：${f.date} ${f.text}`,
    places.length ? `他想去的地方（id | 名字 | 类型 | 区 | 去过没有 | 花费）：\n${places.join('\n')}` : ''].filter(Boolean).join('\n\n');
  const out = await askJson(await aiConfig(), system, user, { maxTokens: 3000, timeout: 90000 });
  return (out.ideas || []).filter((x) => x?.text).slice(0, 5).map((x) => ({ ...x, place: store.data.places.some((y) => y.id === x.place) ? x.place : '' }));
}
function favorRows(p, ledger) {
  const list = (ledger?.favors || []).filter((f) => f.person === p.id && f.status !== 'done');
  return list.map((f) => {
    const rs = repayState[f.id] ||= { busy: false, ideas: null };
    const ask = async () => {
      rs.busy = true; render();
      try { rs.ideas = await repayIdeas(p, f, ledger); } catch (e) { toast(e.message, 'error'); }
      rs.busy = false; render();
    };
    return h('div', { class: 'favor-item' },
      h('p', { class: 'small' }, h('span', { class: `favor-dir ${f.dir}` }, f.dir === 'owe' ? `欠${ta(p)}` : '欠我'), ` ${f.text}`, h('span', { class: 'muted' }, ` · ${f.date.slice(5).replace('-', '/')}`),
        f.dir === 'owe' ? h('button', { class: 'link small', disabled: rs.busy, onclick: ask }, rs.busy ? '正在想……' : rs.ideas ? '再想想' : '怎么还') : null),
      rs.ideas ? h('div', { class: 'repay-ideas' }, rs.ideas.map((x) => h('div', { class: 'repay-idea small' },
        h('b', {}, x.text), x.why ? h('span', { class: 'muted block' }, x.why) : null,
        x.place ? h('a', { href: `#/place/${x.place}` }, `看看 ${store.data.places.find((y) => y.id === x.place)?.name} ›`) : null))) : null);
  });
}

// 过节问候：标了「过节要问候」的人，节日前一天和当天，「今天」里一行 → 这一页一个个起个头、复制、发了
const greetDrafts = {}; // { fkey-人 id: { busy, text } }
async function greetDraft(p, fest, ledger) {
  const system = `你帮一个研究生给身边的人写一条${fest.name}的微信问候，他会复制了自己再改改发出去。`
    + '按他和这个人的关系、平时怎么称呼和说话来写：对导师、老师、长辈用「您」，尊敬、真诚但不堆客套话；对同学、朋友、师兄师姐就像平时聊天，轻松自然；对家人亲近直接。'
    + '可以带一点你们之间具体的事（经历、近况、他帮过的忙），让人看得出是专门写给这个人的，但别硬塞。1–3 句，不用成语堆砌、不用「祝您万事如意心想事成」这种套话串，最多一个表情。'
    + '只输出 JSON：{"text":"消息正文"}';
  const user = [`今天 ${dayKey()}，${fest.name}是 ${fest.day}。`, personContext(p, ledger)].join('\n\n');
  const out = await askJson(await aiConfig(), system, user, { maxTokens: 1500, timeout: 60000 });
  return String(out.text || '').trim();
}
function greetView(fkey) {
  const d = store.data;
  const today = dayKey();
  const fest = festivalsAround(today).find((x) => x.fkey === fkey)
    || (() => { const [y, key] = fkey.split('-'); return GREET_DAYS[key] ? { key, name: GREET_DAYS[key], day: festivalDay(key, Number(y)), fkey } : null; })();
  if (!fest) return notFound();
  const ledger = ledgerSnap();
  const done = d.greeted?.[fkey] || {};
  const list = d.people.filter((p) => !p.archived && (p.greet || []).includes(fest.key));
  const mark = (p, on) => saveRender(on ? `问候了：${p.name}` : `还没问候：${p.name}`, (data) => {
    data.greeted ||= {};
    data.greeted[fkey] ||= {};
    if (on) data.greeted[fkey][p.id] = today; else delete data.greeted[fkey][p.id];
  });
  return h('div', {},
    headerSub(`${fest.name}问候`, `${fest.day.slice(5).replace('-', '月')}日 · ${list.filter((p) => done[p.id]).length}/${list.length} 发了`),
    list.length ? list.map((p) => {
      const k = `${fkey}-${p.id}`;
      const st = greetDrafts[k] ||= { busy: false, text: '' };
      const box = h('textarea', { rows: 3, 'aria-label': `给${p.name}的问候`, placeholder: '点「起个头」，或者自己写', oninput: (e) => { st.text = e.target.value; } });
      box.value = st.text;
      const draft = async () => {
        st.busy = true; render();
        try { st.text = await greetDraft(p, fest, ledger); } catch (e) { toast(e.message, 'error'); }
        st.busy = false; render();
      };
      return h('div', { class: `card greet-card${done[p.id] ? ' done' : ''}` },
        h('div', { class: 'rec-top' }, h('b', {}, p.name, h('span', { class: 'muted small' }, ` · ${p.rel || PEOPLE_GROUPS[mainGroup(p)] || ''}`)),
          done[p.id] ? h('button', { class: 'link small', onclick: () => mark(p, false) }, '发了 ✓') : null),
        done[p.id] ? null : [box, h('div', { class: 'actions' },
          h('button', { class: 'small secondary', disabled: st.busy, onclick: draft }, st.busy ? '正在写……' : st.text ? '换一个' : '起个头'),
          h('button', { class: 'small secondary', onclick: () => copyText(box.value) }, '复制'),
          h('button', { class: 'small', onclick: () => mark(p, true) }, '发了'))]);
    }) : h('div', { class: 'card' }, h('p', { class: 'muted' }, `还没有人标「过节要问候」。在一个人的资料里勾上${fest.name}。`)),
    h('a', { class: 'small', href: '#/people' }, '‹ 身边的人'));
}

// 「今天」里的：生日（前一天、当天）、节假日问人情这次还不还
function peopleAlerts(today) {
  const d = store.data;
  const out = [];
  for (const x of upcomingBirthdays(d.people, today, 1)) {
    out.push(alertLine(`${x.left === 0 ? '今天' : '明天'}是${x.p.name}的生日${x.age ? `（${x.age} 岁）` : ''}`, { href: `#/person/${x.p.id}`, tone: 'soft' }));
  }
  const ledger = ledgerSnap();
  for (const x of upcomingDates(d.people, today, 1)) {
    const gs = x.x.gift ? giftSummary(giftsWith(d, ledger, x.p.id), ta(x.p)) : '';
    out.push(alertLine(`${x.left === 0 ? '今天' : '明天'}：${x.p.name} ${x.x.title}${x.x.gift ? `。${gs || '以前没有来往的礼。'}` : ''}`, { href: `#/person/${x.p.id}`, tone: 'soft' }));
  }
  for (const f of festivalsAround(today)) {
    const left = d.people.filter((p) => !p.archived && (p.greet || []).includes(f.key) && !d.greeted?.[f.fkey]?.[p.id]);
    if (left.length) out.push(alertLine(`${f.day === today ? '今天' : '明天'}${f.name}，给${left.map((p) => p.name).join('、')}发个问候`, { href: `#/greet/${f.fkey}`, tone: 'soft' }));
  }
  const hol = holidayAround(today);
  if (!ledger || !hol) return out;
  const pname = (id) => d.people.find((p) => p.id === id)?.name || (ledger.people || []).find((p) => p.id === id)?.name || '某人';
  const list = (ledger.favors || []).filter((f) => f.dir === 'owe' && f.status !== 'done' && !f.due && f.skip !== hol.key && f.date <= today);
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

// 每天一张照片：按月排成一面墙，点一张看大图、换、删
function photosView(month) {
  const d = store.data;
  const cur = dayKey().slice(0, 7);
  const m = /^\d{4}-\d\d$/.test(month || '') ? month : cur;
  const shift = (n) => { const x = parseDay(`${m}-01`); x.setMonth(x.getMonth() + n); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`; };
  const days = Object.keys(d.days).filter((k) => k.startsWith(m) && d.days[k].photo).sort();
  const all = Object.keys(d.days).filter((k) => d.days[k].photo).length;
  const open = (day) => openSheet({
    title: dayLabel(day),
    body: h('div', { class: 'form' }, placePhoto(d.days[day].photo), d.days[day].note ? h('p', { class: 'small muted' }, d.days[day].note) : null),
    confirmText: '换或删', cancelText: '关闭', onConfirm: () => { setTimeout(() => dayPhotoSheet(day), 0); },
  });
  return h('div', {},
    headerSub('照片', all ? `一共 ${all} 张，每天一张` : '每天一张', helpButton('照片怎么用', [['怎么用', ['每天在睡前复盘那一页里存一张。这里按月排成一面墙。', '点一张看大图；要换或删，点「换或删」。', '忘了拍的那天空着就好。想补以前某一天的，在「回顾」的月历上点那一天，点它的睡前复盘，同样有这一块。']]])),
    h('div', { class: 'month-nav' },
      h('a', { class: 'link', href: `#/photos?m=${shift(-1)}` }, '‹'),
      h('b', {}, `${Number(m.slice(0, 4))}年${Number(m.slice(5))}月`),
      m < cur ? h('a', { class: 'link', href: `#/photos?m=${shift(1)}` }, '›') : h('span', { class: 'link off' }, '›')),
    days.length ? h('div', { class: 'photo-wall' }, days.map((day) => h('button', { type: 'button', class: 'photo-cell', 'aria-label': dayLabel(day), onclick: () => open(day) },
      dayImg(d.days[day].photo, 'photo-img'), h('span', {}, `${Number(day.slice(8))}日`))))
      : h('div', { class: 'card' }, h('p', { class: 'muted' }, m === cur ? '这个月还没有。晚上睡前复盘的下面，存今天的第一张。' : '这个月没有存照片。')),
    h('a', { class: 'small', href: '#/more' }, '‹ 生活'));
}

// ---------- 导师找我（2026-10-25 用户要的） ----------
// 被找了就在「＋」里记一下（不每天问）；模型在 js/advisor.js，可能 ≥ 25% 时「今天」里一行、早上推送一次

const pct = (p) => `${Math.round(p * 100)}%`;
const ADVISOR_HOW = { wechat: '微信', face: '当面', meeting: '组会', phone: '电话' };
function advisorSheet() {
  const today = dayKey();
  const day = h('input', { type: 'date', value: today, max: today, 'aria-label': '哪天' });
  let how = null;
  const howRow = h('div', {});
  const draw = () => howRow.replaceChildren(choiceRow('怎么找的', Object.entries(ADVISOR_HOW), how, (v) => { how = v; draw(); }));
  draw();
  openSheet({
    title: '导师找我了',
    body: h('div', { class: 'form' }, h('label', {}, '哪天（忘了记可以改成那天）', day), h('p', { class: 'muted small' }, '怎么找的（可以不选）'), howRow),
    confirmText: '记好了',
    onConfirm: () => {
      const d = day.value || today;
      if (d > today) { toast('还没到那天', 'error'); return false; }
      if (store.data.events.some((e) => e.type === 'advisor' && e.day === d)) { toast('这天已经记过了', 'error'); return false; }
      return saveUndoable('导师找我了', (data) => {
        data.events.push({ id: newId('e'), day: d, at: atFor(d), type: 'advisor', ...(how ? { kind: how } : {}) });
      }, d === today ? '记好了：导师今天找你了' : `记好了：${relDay(d)}`).then(render).catch(() => false);
    },
  });
}

const ADVISOR_HELP = [
  ['怎么用', ['导师找你问进度了，点底部中间的「＋」→「导师找我了」。忘了当天记，可以改成那天。一天只算一次。', '不用每天记「没找」：没记的日子就是没找。', '今天被问的可能到了 25%，「今天」页最上面会有一行，早上 7:30–10:00 还会推送一次（GitHub 定时有时晚，晚太多那天就只在「今天」里看得到）。']],
  ['看什么', ['「往后两周」每天一根柱子：如果在那之前都没被找，那天被问的可能。超过 25% 的是深色。', '按你以前被找的日子估的：离上次多久、周几。记得越多越准。']],
];
function advisorView() {
  const d = store.data;
  const today = dayKey();
  const o = advisorOutlook(d, today);
  const list = d.events.filter((e) => e.type === 'advisor').sort((a, b) => b.day.localeCompare(a.day));
  const week = '日一二三四五六';
  const remove = (e) => saveUndoable(`删掉：导师找我 ${e.day}`, (data) => { data.events = data.events.filter((x) => x.id !== e.id); }, `删掉了 ${relDay(e.day)}`).then(render).catch(() => {});
  const gaps = list.slice(0, -1).map((e, i) => daysBetween(list[i + 1].day, e.day));
  const fit = o.model;
  return h('div', {},
    headerSub('导师找我', '哪天可能会问进度', helpButton('导师找我怎么用', ADVISOR_HELP)),
    h('div', { class: 'card adv-today' },
      !fit ? h('p', { class: 'muted' }, `记满 ${ADVISOR_MIN} 次才开始预测（现在 ${o.days.length} 次）。被找了就在「＋」里记一下。`)
        : o.doneToday ? h('p', {}, h('b', {}, '今天已经找过了。'), ' 下面是往后的。')
          : [h('div', { class: 'muted small' }, '今天被问进度的可能'), h('div', { class: `adv-big${o.remind ? ' on' : ''}` }, pct(o.p)),
            h('p', { class: 'muted small' }, o.remind ? '到了 25%，留意一下。' : '不到 25%，不提醒。')],
      list.length ? h('p', { class: 'muted small' }, `上次：${relDay(list[0].day)}（${dayLabel(list[0].day)}）${gaps.length ? ` · 平均隔 ${(gaps.reduce((a, x) => a + x, 0) / gaps.length).toFixed(1)} 天` : ''}`) : null),
    o.next.length ? h('div', { class: 'card' }, h('h3', {}, '往后两周'),
      barChart(o.next.map((x) => ({ label: week[parseDay(x.day).getDay()], v: Math.round(x.p * 100), color: x.p >= ADVISOR_REMIND ? 'var(--accent)' : 'color-mix(in srgb, var(--accent) 35%, transparent)' })),
        { title: '往后两周每天被问的可能（%）', fmt: (v) => `${v}`, scale: 100 }),
      h('p', { class: 'muted small' }, `从${o.next[0].day === today ? '今天' : '明天'}起，每根柱子是「如果在那之前都没被找」那天的可能（%）。深色是到了 25% 会提醒的日子。`)) : null,
    h('div', { class: 'card' }, h('h3', {}, `记下的 ${list.length} 次`),
      list.length ? h('div', { class: 'event-list' }, list.map((e) => h('div', { class: 'event-row' },
        h('span', { class: 'grow' }, dayLabel(e.day), e.kind ? h('span', { class: 'muted small' }, ` · ${ADVISOR_HOW[e.kind] || e.kind}`) : null),
        h('button', { class: 'link small', 'aria-label': `删掉 ${e.day}`, onclick: () => remove(e) }, '删掉'))))
        : h('p', { class: 'muted small' }, '还没有。')),
    fit ? h('details', { class: 'card how' }, h('summary', {}, '怎么算的'),
      h('p', { class: 'small' }, '离散时间风险模型（贝叶斯逻辑回归）。从第一次被找的第二天起，每天一行：那天被找了没有，离上次几天，周几。'),
      h('p', { class: 'how-math' }, 'logit P = β₀ + β₁·ln d + β₂·d/7 + γ_周几'),
      h('p', { class: 'how-math' }, '先验：β ~ N(0, 2²)，γ ~ N(0, 1)'),
      h('p', { class: 'small' }, '先验把各个星期几往平均拉：数据少的时候，不把巧合当成规律。拉普拉斯近似：牛顿法求后验众数 θ̂，协方差 Σ = (XᵀWX + Λ)⁻¹。预测时把参数的不确定也算进去：'),
      h('p', { class: 'how-math' }, 'P = σ(μ / √(1 + π·s²/8))，μ = xᵀθ̂，s² = xᵀΣx'),
      h('p', { class: 'small' }, `用了 ${fit.events} 次、${fit.rows} 天。β₁ = ${fit.theta[1].toFixed(2)}，β₂ = ${fit.theta[2].toFixed(2)}（${fit.theta[1] + fit.theta[2] / 7 > 0 ? '离上次越久越可能' : '离上次越久反而越不可能'}）。各个星期几比平均（倍数，按几率算）：`),
      h('p', { class: 'how-math' }, o.week.map((x) => `周${x.w} ${x.odds.toFixed(2)}`).join(' · ')),
      h('p', { class: 'small muted' }, '没有随机数：同样的记录算出同样的数。早上推送用的是同一个模型的 Python 版。')) : null);
}

// ---------- 状态预报 ----------
// 早上按昨晚的睡眠、昨天、星期几和今天的天气预报今天的心情和精力，说成天气（2026-10-26 用户要的）。模型在 js/forecast.js，
// 早上推送用的是 tools/life_push.py 里同一个模型的 Python 版。天气：Open-Meteo 前 92 天到往后 7 天的降水和日照，一天查一次
const FC_WX_KEY = 'life-fc-weather';
let fcWxTried = '';
function forecastWeather() {
  const city = store.data.settings.city;
  if (!city?.lat) return {};
  const c = readJson(FC_WX_KEY);
  const fresh = c.day === dayKey() && c.city === city.name;
  if (!fresh && fcWxTried !== dayKey()) {
    fcWxTried = dayKey();
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}&daily=precipitation_sum,sunshine_duration&timezone=Asia%2FShanghai&past_days=92&forecast_days=7`)
      .then((r) => r.json()).then((j) => {
        const data = Object.fromEntries(j.daily.time.map((t, i) => [t, { rain: j.daily.precipitation_sum[i] || 0, sun: (j.daily.sunshine_duration[i] || 0) / 3600 }]));
        writeJson(FC_WX_KEY, { day: dayKey(), city: city.name, data });
        if (['/', '', '/forecast'].includes(currentPath())) render();
      }).catch(() => {});
  }
  return c.city === city.name ? c.data || {} : {};
}
const WX_ICON = { sun: 'today', partly: 'partly', cloud: 'cloud', overcast: 'overcast', rain: 'rain' };
const fcScore = (f) => `心情 ${Math.round(f.mood.mean)} 分左右${f.energy ? ` · ${energyWord(f.energy.mean)}` : ''}`;
function forecastTipFor(f, today, w) {
  return f.sure ? forecastTip(f.level, influences(store.data, today, { weather: w })) : null;
}

// 首页：问候下面一张小卡，点了去 #/forecast。心情记得太少就不出现
function forecastCard(today) {
  const d = store.data;
  const w = forecastWeather();
  const f = forecastDay(d, today, w, today);
  if (f.short !== undefined) return null;
  const r = d.days[today] || {};
  const tip = forecastTipFor(f, today, w);
  return h('a', { class: `card fc-card fc-${f.level.key}`, href: '#/forecast', 'aria-label': `今天的状态：${f.level.name}` },
    h('span', { class: 'fc-ic' }, icon(WX_ICON[f.level.key])),
    h('div', { class: 'grow' },
      h('div', { class: 'fc-name' }, f.level.name, h('span', { class: 'muted small' }, ' 今天的状态')),
      h('div', { class: 'small' }, f.sure ? fcScore(f) : '还在认识你，先说个大概'),
      f.sure ? h('div', { class: 'muted small' }, `低落的可能 ${pct(f.mood.pLow)}`) : null,
      r.mood != null && f.sure ? h('div', { class: 'fc-check small' }, `预报 ${Math.round(f.mood.mean)} · 实际 ${r.mood}`) : null,
      r.mood == null && !r.sleep?.bed ? h('div', { class: 'muted small' }, '记了睡眠会更准') : null,
      tip ? h('p', { class: 'fc-tip small' }, tip) : null));
}

const FORECAST_HELP = [
  ['怎么看', [
    '每天按昨晚睡了多久、睡得怎样、昨天的心情、昨天运动没有、昨晚祷告没有、星期几和济南今天的天气，猜今天的心情和精力。',
    '比你平时好是晴，差不多是晴间多云或多云，低一些是阴，低落的可能过半是小雨。',
    '「低落的可能」：今天心情在 4 分和以下的可能，像天气预报里的降水概率。',
    '晚上记了心情，卡片上会对答案。',
  ]],
  ['什么时候准', [
    `心情记满 ${FORECAST_MIN} 天开始预报，记满 ${FORECAST_SURE} 天才说具体的分。`,
    '睡眠没记的时候按你平时的睡眠算，记了以后预报会跟着变。',
    '往后几天还不知道睡眠和前一天，只看星期几和天气预报，说得粗。',
    '偏阴的时候会附一句，只从你自己的记录里挑（比如运动过的第二天精力高），没有可说的就不说。',
  ]],
  ['提醒', ['早上 7:30–10:00 推送一条，导师可能会问进度时也写在这一条里。GitHub 定时有时晚，晚太多那天就只在「今天」里看得到。']],
];
const FC_EFFECT = {
  睡眠时长: '每多睡 1 小时', 睡得怎样: '睡得好 1 档', 昨天: '昨天高 1 分', 昨天运动: '昨天运动了', 昨晚祷告: '昨晚祷告了', 下雨: '下雨天', 大晴天: '大晴天', 周末: '周末',
};
function forecastView() {
  const d = store.data;
  const today = dayKey();
  const w = forecastWeather();
  const f = forecastDay(d, today, w, today);
  const head = headerSub('状态预报', '今天的心情和精力，说成天气', helpButton('状态预报怎么看', FORECAST_HELP));
  if (f.short !== undefined) {
    return h('div', {}, head, h('div', { class: 'card' }, h('p', {}, `心情记满 ${FORECAST_MIN} 天就开始预报（现在 ${f.short} 天）。`),
      h('p', { class: 'muted small' }, '每晚睡前复盘里点一下心情就行。')));
  }
  const r = d.days[today] || {};
  const tip = forecastTipFor(f, today, w);
  const week = forecastWeek(d, today, w);
  const hist = forecastHistory(d, today, w, 30);
  const fit = f.fit;
  const sign = (x) => (Math.abs(x) < 0.05 ? '0' : `${x > 0 ? '+' : '−'}${Math.abs(x).toFixed(1)}`);
  return h('div', {},
    head,
    h('div', { class: `card fc-big fc-${f.level.key}` },
      h('span', { class: 'fc-ic' }, icon(WX_ICON[f.level.key])),
      h('div', { class: 'fc-name' }, f.level.name),
      h('p', {}, f.sure ? fcScore(f) : `还在认识你：心情记满 ${FORECAST_SURE} 天才说具体的分（现在 ${fit.n} 天）。`),
      f.sure ? h('p', { class: 'muted small' }, `低落的可能 ${pct(f.mood.pLow)} · 大概在 ${Math.max(1, Math.round(f.mood.mean - f.mood.sd))}–${Math.min(10, Math.round(f.mood.mean + f.mood.sd))} 分之间`) : null,
      r.mood != null && f.sure ? h('p', { class: 'fc-check' }, `预报 ${Math.round(f.mood.mean)} · 实际 ${r.mood}`) : null,
      r.mood == null && !r.sleep?.bed ? h('p', { class: 'muted small' }, '还没记睡眠，先按你平时的睡眠算。') : null,
      tip ? h('p', { class: 'fc-tip' }, tip) : null),
    week.length ? h('div', { class: 'card' }, h('h3', {}, '往后几天'),
      h('div', { class: 'fc-week' }, week.map((x) => h('div', { class: `fc-day fc-${x.level.key}` },
        h('span', { class: 'muted small' }, `周${WEEK[parseDay(x.day).getDay()]}`), icon(WX_ICON[x.level.key]),
        h('span', { class: 'small' }, x.level.name), f.sure ? h('span', { class: 'muted small' }, `${Math.round(x.mood.mean)} 分`) : null))),
      h('p', { class: 'muted small' }, '还不知道那几天睡得怎样，只看星期几和天气预报，说得粗。')) : null,
    hist.n >= 3 ? h('div', { class: 'card' }, h('h3', {}, '准不准'),
      h('p', {}, `最近 ${hist.n} 天，预报和实际平均差 ${hist.mae.toFixed(1)} 分，${pct(hist.within1)} 的日子差 1 分以内。`),
      h('p', { class: 'muted small' }, hist.mae < hist.base ? `每天都猜「和平时一样」的话，平均差 ${hist.base.toFixed(1)} 分。` : `每天都猜「和平时一样」也差不多准（平均差 ${hist.base.toFixed(1)} 分），多记一阵子会好。`),
      lineChart({ days: hist.rows.map((x) => x.day), vals: hist.rows.map((x) => x.actual), ma: hist.rows.map((x) => x.pred) }, { min: 1, max: 10, title: '预报（线）和实际（点）' }),
      h('p', { class: 'muted small' }, '线是预报，点是你记的心情。每一天都只用了那天以前的记录。')) : null,
    h('details', { class: 'card how' }, h('summary', {}, '怎么算的'),
      h('p', { class: 'small' }, '贝叶斯线性回归（正态-逆伽马共轭先验），心情、精力各一个。每个记了心情的日子一行：'),
      h('p', { class: 'how-math' }, '心情 − 平均 = β·(睡眠时长, 睡得怎样, 昨天, 昨天运动, 昨晚祷告, 下雨, 大晴天, 周末) + ε'),
      h('p', { class: 'how-math' }, 'β | σ² ~ N(0, σ²·0.5²)，σ² ~ 逆伽马'),
      h('p', { class: 'small' }, '每一项先减去平时的平均；没记的（睡眠没填、天气查不到）就当是平时。先验把每一项往 0 拉：数据少的时候，不把巧合当成规律。预测的方差把 β 的不确定也算进去：'),
      h('p', { class: 'how-math' }, '方差 = σ̂²·(1 + xᵀVx)，低落的可能 = Φ((4.5 − 预测) / 标准差)'),
      h('p', { class: 'small' }, `用了最近 ${fit.n} 天，平时心情 ${fit.ybar.toFixed(1)} 分。每一项让心情变多少：`),
      h('p', { class: 'how-math' }, forecastEffects(fit).map((x) => `${FC_EFFECT[x.name] || x.name} ${sign(x.beta)}`).join(' · ')),
      h('p', { class: 'small muted' }, '只能看出常常一起出现，看不出谁导致谁。没有随机数：同样的记录算出同样的数。早上推送用的是同一个模型的 Python 版。')));
}

// ---------- 更多 ----------

function moreView() {
  return h('div', {},
    header('生活'),
    h('div', { class: 'group' },
      cell({ href: '#/goals', ic: 'sparkle', color: 'var(--accent)', title: '想做到的事', sub: '心愿 → 一步一步能做到的事' }),
      cell({ href: '#/places', ic: 'globe', color: 'var(--good)', title: '想去的地方', sub: '地图、周末去哪、足迹' }),
      cell({ href: '#/photos', ic: 'image', color: 'var(--blue)', title: '照片', sub: '每天一张，按月排成一面墙' }),
      cell({ href: '#/people', ic: 'people', color: 'var(--amber)', title: '身边的人', sub: '家人、亲戚、一路上认识的人' })),
    h('div', { class: 'group' },
      cell({ href: '#/periodic', ic: 'calendar', color: 'var(--muted)', title: '定期打理', sub: '剪指甲、换床单这些，到日子才出现' }),
      cell({ href: '#/forecast', ic: 'partly', color: 'var(--blue)', title: '状态预报', sub: '今天的心情和精力，说成天气' }),
      cell({ href: '#/advisor', ic: 'people', color: 'var(--amber)', title: '导师找我', sub: '哪天可能会问进度' })),
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
    h('p', { class: 'small' }, '每晚 22:30 左右一条：今天的一句话还没写、还没有晚上的祷告就提醒你。都做了就不发。锁屏上只显示「睡前」，看不出内容。'),
    h('p', { class: 'small' }, '早上 7:30–10:00 一条：今天的状态预报，导师可能会问进度时也写在这一条里。'),
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
