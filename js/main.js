import { GitHub } from './github.js';
import { Store, newId, diff, apply as applyPatch } from './store.js';
import {
  defaultData, dayKey, addDays, daysBetween, weekOf, weekLabel, hm, parseDay, WHEN, routineOf, careDone, weekCount,
  startStep, stopStep, stepStatus, nextStep, readyForHabit, periodicDue, eventsOn, privateStats,
  prayedOn, prayerStats, stageReady, PSALMS, psalmLink,
} from './life.js';
import {
  TRACKS, STEPS, stepById, DIRECTIONS, SKIN_TAGS, VERSES, MORNING_VERSES, CONFESS_VERSE, verseFor, LORDS_PRAYER,
  STAGES, PRAISE_HINTS, THANKS_HINTS, CONFESS_HINT, ASK_HINT, ENTRUST_HINT, NEAR, prayerPrompt,
  EN_MODES, EN_CYCLE, EN_TOPICS, englishPrompt,
} from './content.js';
import { pushSupport, subscribe, currentSubscription, deviceName, PUSH_FILE } from './push.js';
import { h } from './util.js';
import { icon } from './icons.js';

const SETTINGS_KEY = 'life-settings';
const DEFAULT_REPO = 'ThreeLu/life-data';
const EDITING_ROUTES = /^\/(night|pray\/go|p$|english)/;

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
  [/^\/look$/, () => lookView()],
  [/^\/step\/([^/]+)$/, (id) => stepView(id)],
  [/^\/pray$/, () => prayView()],
  [/^\/pray\/go$/, (_, q) => prayGoView(q.m)],
  [/^\/english$/, () => englishView()],
  [/^\/p$/, () => privateView()],
  [/^\/periodic$/, () => periodicView()],
  [/^\/history$/, () => historyView()],
  [/^\/more$/, () => moreView()],
  [/^\/settings$/, () => settingsView()],
];
const NAV_GROUPS = {
  '/': [/^\/?$/, /^\/day\//, /^\/night/],
  '/look': [/^\/look/, /^\/step\//],
  '/pray': [/^\/pray/],
  '/more': [/^\/more/, /^\/english/, /^\/periodic/, /^\/history/, /^\/settings/],
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
  view.replaceChildren(content || notFound());
  renderedData = store?.data ? JSON.stringify(store.data) : '';
  for (const a of nav.querySelectorAll('a[href]')) {
    const target = a.getAttribute('href').slice(1);
    a.classList.toggle('active', (NAV_GROUPS[target] || []).some((re) => re.test(path)));
  }
}

// ---------- 通用组件 ----------

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
  if (opts?.online) return saving('正在保存…', () => store.save(message, fn, opts));
  try {
    return await store.save(message, fn, opts);
  } catch (e) {
    toast(e.message, 'error');
    throw e;
  }
}
// 改完马上重画
const saveRender = (message, fn) => save(message, fn).then(render).catch(() => {});

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
  ['这一页是什么', ['每天要点的几样都在这里：睡眠、护肤打卡、洗澡运动喝的、睡前复盘和祷告。没点的那天就空着，不算断，不催你。', '一天从凌晨 4 点开始算：1 点洗的澡还算昨天。']],
  ['怎么记', [
    '护肤：做了哪样点哪样，再点一下取消。打卡项来自「形象」里你开始学的步骤。',
    '洗澡、运动、喝的：点下面中间的「＋」，或者这一页「随手记」里的按钮。洗完澡会顺便问身体乳擦了没有。',
    '睡眠：早上在这一页填昨晚几点睡、今早几点起。',
    '晚上：点「睡前复盘」写今天的一句话，接着护肤、祷告。每晚 22:30 左右会提醒你（在「设置」里开启推送）。',
  ]],
  ['其他', ['「昨天说今天要……」是你昨晚写的明天计划，点一下做到了没有。', '到了该剪指甲、换床单的日子，这里会出现，点「做了」就好。', '看以前的某一天：「更多 → 最近的记录」。']],
];

function todayView(day) {
  const d = store.data;
  const today = dayKey();
  const isToday = day === today;
  const rec = d.days[day] || {};
  const lockBtn = isToday ? h('a', { class: 'icon-btn quiet', href: '#/p', 'aria-label': '小记' }, icon('leaf')) : null;
  return h('div', {},
    headerSub(isToday ? '今天' : relDay(day), dayLabel(day), lockBtn, helpButton('今天这一页怎么用', TODAY_HELP)),
    isToday ? morningPrayerCard(day) : null,
    planCard(day),
    sleepCard(day),
    careCard(day),
    quickCard(day),
    nightCard(day, rec),
    isToday ? periodicCard(today) : null,
    isToday ? skinWeekCard(today, true) : null,
    isToday ? yearAgoCard(today) : null,
    !isToday ? h('a', { class: 'button secondary wide', href: '#/' }, '回到今天') : null);
}

// 第 2 阶段起：早上一句话，把今天交给神
function morningPrayerCard(day) {
  const d = store.data;
  if (d.prayer.stage < 2 || d.days[day]?.prayer?.morning || new Date().getHours() >= 14) return null;
  return h('a', { class: 'card link-card morning', href: '#/pray/go?m=morning' },
    h('span', { class: 'row-line' }, icon('candle'), h('span', { class: 'grow' }, '早上一句话：把今天交给神')),
    h('span', { class: 'muted small block' }, '1 分钟'));
}

function planCard(day) {
  const d = store.data;
  const plan = d.days[addDays(day, -1)]?.plan;
  if (!plan) return null;
  const done = d.days[day]?.planDone ?? null;
  return h('div', { class: 'card' },
    h('h3', {}, '昨天说今天要'),
    h('p', { class: 'plan-text' }, plan),
    choiceRow('做到了吗', [['yes', '做到了'], ['part', '做了一部分'], ['no', '没做']], done, (v) =>
      saveRender('今天的计划', (data) => { if (v) dayOf(data, day).planDone = v; else delete dayOf(data, day).planDone; })));
}

function sleepCard(day) {
  const d = store.data;
  const sl = d.days[day]?.sleep;
  if (sl?.bed || sl?.wake) {
    return h('button', { class: 'card line-card', onclick: () => sleepSheet(day) },
      icon('bed'), h('span', { class: 'grow' }, `昨晚 ${sl.bed || '?'} 睡，${sl.wake || '?'} 起`, sl.q ? h('span', { class: 'muted' }, ` · 睡得 ${SLEEP_Q[sl.q - 1]}`) : null),
      h('span', { class: 'muted small' }, sleepHours(sl)));
  }
  if (day === dayKey() && new Date().getHours() >= 15) return null; // 下午以后就不占地方了（「＋」里还能记）
  const form = sleepForm(day, render);
  return h('div', { class: 'card' },
    h('h3', {}, '昨晚睡得怎么样'),
    form,
    h('button', { class: 'small', onclick: () => form.submit() }, '记好了'));
}
const SLEEP_Q = ['很差', '不太好', '一般', '不错', '很好'];
function sleepHours(sl) {
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
    return save('睡眠', (data) => { dayOf(data, day).sleep = { bed: bed.value, wake: wake.value, ...(q ? { q } : {}) }; }).then(after).catch(() => false);
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

function careCard(day) {
  const d = store.data;
  const care = d.days[day]?.care || {};
  const toggle = (r) => saveRender(`护肤：${r.name}`, (data) => {
    const c = (dayOf(data, day).care ||= {});
    if (c[r.id]) delete c[r.id]; else c[r.id] = true;
  });
  const groups = ['am', 'shower', 'pm', 'week'].map((when) => {
    const items = routineOf(d, when);
    if (!items.length) return null;
    const { done, total } = careDone(d, day, when);
    return h('div', { class: 'care-group' },
      h('div', { class: 'care-head' }, h('span', {}, WHEN[when]), when !== 'week' && total ? h('span', { class: `muted small${done === total ? ' good-text' : ''}` }, done === total ? '都做了' : `${done}/${total}`) : null),
      h('div', { class: 'chips' }, items.map((r) => {
        const on = Boolean(care[r.id]);
        const label = when === 'week' ? `${r.name} · 本周 ${weekCount(d, r.id, day)}/${r.times || 1}` : r.name;
        return h('button', { type: 'button', class: `chip check${on ? ' on' : ''}${r.optional ? ' optional' : ''}`, 'aria-pressed': String(on), onclick: () => toggle(r) },
          on ? icon('check', 'i tiny') : null, label);
      })));
  }).filter(Boolean);
  return h('div', { class: 'card' },
    h('h3', {}, '护肤和打理'),
    groups.length ? groups : h('p', { class: 'muted small' }, '还没有打卡项。到「形象」开始学第一步，这里就会出现。'),
    h('a', { class: 'small', href: '#/look' }, '形象路线图 ›'));
}

function quickCard(day) {
  const d = store.data;
  const list = eventsOn(d, day).filter((e) => ['shower', 'sport', 'drink'].includes(e.type));
  return h('div', { class: 'card' },
    h('h3', {}, '随手记'),
    h('div', { class: 'quick-row' },
      h('button', { class: 'secondary small', onclick: () => recordShower(day) }, icon('drop'), '洗澡'),
      h('button', { class: 'secondary small', onclick: () => sportSheet(day) }, icon('run'), '运动'),
      d.settings.drinkKinds.map((k) => h('button', { class: 'secondary small', onclick: () => recordDrink(day, k) }, icon('cup'), k))),
    list.length ? h('div', { class: 'event-list' }, list.map((e) => eventRow(e))) : null);
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
    }),
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
      return saveRender(`运动：${kind}`, (data) => {
        data.events.push({ id: newId('e'), day, at: atFor(day), type: 'sport', kind, ...(mins ? { minutes: mins } : {}), ...(dist && !km.hidden ? { km: dist } : {}), ...(level ? { level } : {}), ...(note.value.trim() ? { note: note.value.trim() } : {}) });
      });
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
      cell({ ic: 'moon', color: 'var(--accent)', title: '睡前复盘', href: '#/night' })),
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

function nightCard(day, rec) {
  const d = store.data;
  const prayed = d.days[day]?.prayer?.night;
  return h('div', { class: 'card' },
    h('h3', {}, '睡前'),
    h('a', { class: 'line-link', href: day === dayKey() ? '#/night' : `#/night?d=${day}` },
      icon('moon'), h('span', { class: 'grow' }, rec.mood ? `心情 ${rec.mood} 分${rec.note ? `：${rec.note}` : ''}` : '睡前复盘：今天的一句话'),
      rec.mood ? icon('check', 'i good-text') : icon('chev', 'i chev')),
    day === dayKey() ? h('a', { class: 'line-link', href: '#/pray/go' },
      icon('candle'), h('span', { class: 'grow' }, prayed ? `祷告了 · ${NEAR[prayed.near] || ''}` : '今晚的祷告'),
      prayed ? icon('check', 'i good-text') : icon('chev', 'i chev')) : null);
}

function periodicCard(today) {
  const due = periodicDue(store.data, today);
  if (!due.length) return null;
  const done = (p) => saveUndoable(`定期打理：${p.name}`, (data) => {
    const x = data.periodic.find((y) => y.id === p.id);
    if (x) x.last = today;
  }, `「${p.name}」记好了，${p.every} 天后再提醒`).then(render).catch(() => {});
  return h('div', { class: 'card' },
    h('h3', {}, '该打理了'),
    due.map((p) => h('div', { class: 'event-row' },
      h('span', { class: 'grow' }, p.name, h('span', { class: 'muted small' }, p.last ? ` · 上次 ${relDay(p.last, today)}` : ' · 还没记过')),
      h('button', { class: 'small secondary', onclick: () => done(p) }, '做了'))));
}

// 每周问一次皮肤状态：首页周五到周日出现，「形象」页一直有
function skinWeekCard(today, onlyWeekend = false) {
  const mon = weekOf(today);
  const wk = store.data.weeks[mon]?.skin;
  const dow = parseDay(today).getDay();
  if (onlyWeekend && (wk || ![5, 6, 0].includes(dow))) return null;
  const set = (patch) => saveRender('这周的皮肤', (data) => {
    const w = (data.weeks[mon] ||= {});
    w.skin = { ...(w.skin || {}), ...patch };
  });
  const tags = new Set(wk?.tags || []);
  return h('div', { class: 'card' },
    h('h3', {}, `这周的皮肤（${weekLabel(mon)}）`),
    scoreRow('皮肤状态', 5, wk?.score || null, (v) => set({ score: v }), ['很差', '差', '一般', '好', '很好']),
    h('div', { class: 'chips' }, SKIN_TAGS.map((t) => h('button', {
      type: 'button', class: `chip small-chip${tags.has(t) ? ' on' : ''}`, 'aria-pressed': String(tags.has(t)),
      onclick: () => { if (tags.has(t)) tags.delete(t); else tags.add(t); set({ tags: [...tags] }); },
    }, t))));
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
  }).then(() => { toast('记好了'); render(); }).catch(() => {});
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

const LOOK_HELP = [
  ['这一页是什么', ['你的形象档案：方向、路线图、用的东西、学到的知识、定期打理。它会跟着你慢慢长大，不用一次填满。']],
  ['路线图怎么用', [
    '分护肤、化妆、气质三条线，每条从上往下一样一样来，一次只加一样（万一过敏或爆痘，马上知道是哪样惹的）。',
    '点一步看：为什么要做、买什么（大概多少钱）、怎么做。想好了点「开始学」，它的打卡项就进到「今天」里。',
    '坚持三周左右、大部分天都做到了，网页会问你「算养成了吗」。养成了的也会继续出现在打卡里。',
    '不会催你：只有你点开时才告诉你「下一步可以是……」。',
  ]],
  ['其他', [
    '我的东西：从物品档案里读「洗漱护肤」类的东西，点一下记开封日期、好不好用；不想显示的可以藏起来。',
    '我学到的：在小红书、B 站学到一招，就记成一张卡片。',
    '这周的皮肤：每周打一次分，用来看护肤有没有效果。',
  ]],
];

function lookView() {
  const d = store.data;
  const today = dayKey();
  return h('div', {},
    headerSub('形象', '精致的生活，一步一步来', helpButton('形象这一页怎么用', LOOK_HELP)),
    directionCard(),
    h('div', { class: 'section-title' }, '路线图'),
    Object.entries(TRACKS).map(([track, name]) => trackCard(track, name, today)),
    skinWeekCard(today),
    productsCard(),
    notesCard(),
    h('div', { class: 'section-title' }, '定期打理'),
    h('div', { class: 'group' },
      d.periodic.map((p) => cell({ href: '#/periodic', title: p.name, meta: p.last ? nextDueText(p, today) : '还没记过' }))));
}
function nextDueText(p, today) {
  const left = p.every - daysBetween(p.last, today);
  return left <= 0 ? '该做了' : `${left} 天后`;
}

function directionCard() {
  const d = store.data;
  const dirs = d.look.direction.filter((k) => DIRECTIONS[k]);
  const edit = () => {
    const picked = new Set(dirs);
    const body = h('div', { class: 'chips' }, Object.entries(DIRECTIONS).map(([k, v]) => {
      const b = h('button', { type: 'button', class: `chip${picked.has(k) ? ' on' : ''}`, onclick: () => {
        if (picked.has(k)) picked.delete(k); else picked.add(k);
        b.classList.toggle('on', picked.has(k));
      } }, v.name);
      return b;
    }));
    openSheet({ title: '我的方向（可以选一两个）', body, confirmText: '好了', onConfirm: () => saveRender('形象方向', (data) => { data.look.direction = [...picked]; }) });
  };
  return h('div', { class: 'card direction' },
    h('div', { class: 'rec-top' }, h('h3', {}, '我的方向'), h('button', { class: 'link small', onclick: edit }, '改')),
    dirs.length ? h('div', { class: 'dir-name' }, dirs.map((k) => DIRECTIONS[k].name).join(' + ')) : h('p', { class: 'muted small' }, '还没选。点「改」选一两个方向。'),
    dirs.length ? h('ul', { class: 'small dir-points' }, dirs.flatMap((k) => DIRECTIONS[k].points).map((p) => h('li', {}, p))) : null);
}

const STATUS = { todo: '没开始', learning: '在学', habit: '已养成' };
function trackCard(track, name, today) {
  const d = store.data;
  const next = nextStep(d, track);
  return h('div', { class: 'card track' },
    h('h3', {}, name),
    STEPS.filter((s) => s.track === track).map((s) => {
      const st = stepStatus(d, s.id);
      return h('a', { class: `step-row ${st}${next?.id === s.id ? ' next' : ''}`, href: `#/step/${s.id}` },
        h('span', { class: `step-dot ${st}` }, st === 'habit' ? icon('check', 'i tiny') : null),
        h('span', { class: 'grow' }, s.name, next?.id === s.id ? h('span', { class: 'muted small' }, ' · 下一步可以是这个') : null,
          readyForHabit(d, s.id, today) ? h('span', { class: 'good-text small' }, ' · 差不多养成了') : null),
        h('span', { class: `badge ${st === 'learning' ? 'accent' : st === 'habit' ? 'good' : ''}` }, STATUS[st]));
    }));
}

function stepView(id) {
  const s = stepById(id);
  if (!s) return notFound();
  const d = store.data;
  const today = dayKey();
  const st = stepStatus(d, id);
  const info = d.look.steps[id];
  const items = d.look.routine.filter((r) => r.step === id);
  const start = () => saveRender(`开始学：${s.name}`, (data) => startStep(data, id, today)).then(() => toast(s.routine ? '开始了，打卡项已经加进「今天」' : '开始了'));
  const habit = () => saveRender(`养成了：${s.name}`, (data) => { data.look.steps[id] = { ...data.look.steps[id], status: 'habit', habitAt: today }; }).then(() => toast('🎉 养成了一个好习惯'));
  const back = () => saveRender(`改回在学：${s.name}`, (data) => { data.look.steps[id] = { ...data.look.steps[id], status: 'learning' }; delete data.look.steps[id].habitAt; });
  const stop = () => saveUndoable(`不学了：${s.name}`, (data) => stopStep(data, id), `「${s.name}」先放下了`).then(render).catch(() => {});
  const rename = (r) => {
    const input = h('input', { value: r.name, 'aria-label': '打卡项名字' });
    openSheet({
      title: '改名字', body: [h('p', { class: 'muted small' }, '可以写上用的什么，比如「洗脸（米粹）」。'), input], confirmText: '好了',
      onConfirm: () => {
        const v = input.value.trim();
        if (!v) return false;
        return saveRender('改打卡项名字', (data) => { const x = data.look.routine.find((y) => y.id === r.id); if (x) x.name = v; });
      },
    });
  };
  return h('div', {},
    headerSub(s.name, `${TRACKS[s.track]} · ${STATUS[st]}${info?.since ? ` · ${info.since} 开始` : ''}`),
    readyForHabit(d, id, today) ? h('div', { class: 'card good-card' }, h('p', {}, '这三周你大部分天都做到了。算养成了吗？'), h('button', { onclick: habit }, '算养成了')) : null,
    h('div', { class: 'card explain' }, h('h3', {}, '为什么'), h('p', {}, s.why)),
    h('div', { class: 'card help' }, h('h3', {}, '怎么做'), h('ul', {}, s.how.map((x) => h('li', {}, x)))),
    h('div', { class: 'card' }, h('h3', {}, '要买什么'), h('p', { class: 'small' }, s.buy),
      h('p', { class: 'muted small' }, '买了以后记得在账本里记一笔（类别选「形象」那几样），在物品档案里建档，这里「我的东西」就能看到。')),
    st !== 'todo' && items.length ? h('div', { class: 'card' }, h('h3', {}, '每天打卡'),
      items.map((r) => h('div', { class: 'event-row' },
        h('span', { class: 'grow' }, r.name, h('span', { class: 'muted small' }, ` · ${WHEN[r.when]}${r.times ? ` ${r.times} 次` : ''}${r.optional ? ' · 可做可不做' : ''}`)),
        h('button', { class: 'link small', onclick: () => rename(r) }, '改名')))) : null,
    h('div', { class: 'actions' },
      st === 'todo' ? h('button', { onclick: start }, '开始学') : null,
      st === 'learning' ? h('button', { class: 'secondary', onclick: habit }, '算养成了') : null,
      st === 'habit' ? h('button', { class: 'secondary', onclick: back }, '改回在学') : null,
      st !== 'todo' ? h('button', { class: 'danger', onclick: stop }, '不学了') : null),
    h('a', { class: 'small', href: '#/look' }, '‹ 回到形象'));
}

// 物品档案里「洗漱护肤」类的东西（缓存 5 分钟）
const invCache = { at: 0, items: null, error: '' };
async function loadProducts() {
  if (invCache.items && Date.now() - invCache.at < 300000) return;
  const inv = readJson('inventory-settings');
  const owner = (settings.repo || DEFAULT_REPO).split('/')[0];
  const g = new GitHub({ token: inv.token || settings.token, repo: inv.repo || `${owner}/inventory-data` });
  try {
    const data = JSON.parse(await g.readText('inventory.json', 'main'));
    const locs = Object.fromEntries((data.locations || []).map((l) => [l.id, l.name]));
    invCache.items = (data.items || []).filter((i) => !i.archived && (i.tags || []).includes('洗漱护肤'))
      .map((i) => ({ id: i.id, name: i.name, where: (locs[i.location] || '').split(' ')[0], qty: i.quantity }));
    invCache.error = '';
  } catch (e) {
    invCache.items = [];
    invCache.error = e.message;
  }
  invCache.at = Date.now();
}

const VERDICT = { good: '好用', ok: '一般', bad: '不适合' };
function productsCard() {
  const box = h('div', {}, h('p', { class: 'muted small' }, '正在读物品档案……'));
  const draw = () => {
    const d = store.data;
    const list = (invCache.items || []).filter((i) => !d.look.hide.includes(i.id));
    if (invCache.error) { box.replaceChildren(h('p', { class: 'muted small' }, `读不到物品档案：${invCache.error}`)); return; }
    box.replaceChildren(...[
      ...(list.length ? list.map((i) => {
        const p = d.look.products[i.id] || {};
        const opened = p.opened ? `开封 ${daysBetween(p.opened, dayKey())} 天` : '';
        return h('button', { class: 'event-row product-row', onclick: () => productSheet(i) },
          h('span', { class: 'grow' }, i.name, h('span', { class: 'muted small block' }, [i.where, opened, p.verdict ? VERDICT[p.verdict] : ''].filter(Boolean).join(' · '))),
          icon('chev', 'i chev'));
      }) : [h('p', { class: 'muted small' }, '物品档案里还没有「洗漱护肤」类的东西。')]),
      d.look.hide.length ? h('button', { class: 'link small', onclick: () => saveRender('显示藏起来的东西', (data) => { data.look.hide = []; }) }, `显示藏起来的 ${d.look.hide.length} 样`) : null,
    ].filter(Boolean));
  };
  loadProducts().then(() => { if (box.isConnected) draw(); });
  if (invCache.items) draw();
  return h('div', { class: 'card' }, h('h3', {}, '我的东西'), box);
}

function productSheet(item) {
  const p = store.data.look.products[item.id] || {};
  const opened = h('input', { type: 'date', value: p.opened || '', 'aria-label': '开封日期' });
  const note = h('input', { value: p.note || '', placeholder: '用起来怎么样（可以不填）', 'aria-label': '备注' });
  let verdict = p.verdict || null;
  const vRow = h('div', {});
  const draw = () => vRow.replaceChildren(choiceRow('好不好用', Object.entries(VERDICT), verdict, (v) => { verdict = v; draw(); }));
  draw();
  const close = openSheet({
    title: item.name,
    body: h('div', { class: 'form' }, h('label', {}, '开封日期', opened), h('div', { class: 'label-sm' }, '用了两周以后：'), vRow, note,
      h('button', { class: 'link small', onclick: () => { close(); saveRender('藏起来', (data) => { data.look.hide.push(item.id); }); } }, '这个不是护肤品，不在这里显示')),
    confirmText: '好了',
    onConfirm: () => saveRender(`我的东西：${item.name}`, (data) => {
      const x = { ...(opened.value ? { opened: opened.value } : {}), ...(verdict ? { verdict } : {}), ...(note.value.trim() ? { note: note.value.trim() } : {}) };
      if (Object.keys(x).length) data.look.products[item.id] = x; else delete data.look.products[item.id];
    }),
  });
}

function notesCard() {
  const d = store.data;
  return h('div', { class: 'card' },
    h('div', { class: 'rec-top' }, h('h3', {}, '我学到的'), h('button', { class: 'link small', onclick: () => noteSheet() }, '＋ 记一张')),
    d.notes.length ? d.notes.slice().reverse().map((n) => h('button', { class: 'note-card', onclick: () => noteSheet(n) },
      h('b', { class: 'block' }, n.title), n.text ? h('span', { class: 'small pre block' }, n.text) : null,
      h('span', { class: 'muted small' }, [TRACKS[n.track], n.at].filter(Boolean).join(' · '))))
      : h('p', { class: 'muted small' }, '在小红书、B 站学到一招，就记一张，比如「修眉：先画出眉形再刮」。'));
}

function noteSheet(n = null) {
  const title = h('input', { value: n?.title || '', placeholder: '标题，比如「修眉的顺序」', 'aria-label': '标题' });
  const text = h('textarea', { rows: 5, placeholder: '学到了什么', 'aria-label': '内容' });
  text.value = n?.text || '';
  const link = h('input', { value: n?.link || '', placeholder: '链接（可以不填）', 'aria-label': '链接' });
  let track = n?.track || null;
  const tRow = h('div', {});
  const draw = () => tRow.replaceChildren(choiceRow('属于哪条线', Object.entries(TRACKS), track, (v) => { track = v; draw(); }));
  draw();
  const close = openSheet({
    title: n ? '我学到的' : '记一张',
    body: h('div', { class: 'form' }, title, text, link, tRow,
      n?.link ? h('a', { href: n.link, target: '_blank', rel: 'noopener', class: 'small' }, '打开链接') : null,
      n ? h('button', { class: 'danger small', onclick: () => { close(); saveUndoable('删掉卡片', (data) => { data.notes = data.notes.filter((x) => x.id !== n.id); }, '删掉了一张卡片').then(render).catch(() => {}); } }, '删掉这张') : null),
    confirmText: '存好',
    onConfirm: () => {
      if (!title.value.trim()) { toast('写个标题', 'error'); return false; }
      const x = { id: n?.id || newId('n'), title: title.value.trim(), text: text.value.trim(), link: link.value.trim(), track, at: n?.at || dayKey() };
      return saveRender('我学到的', (data) => {
        const i = data.notes.findIndex((y) => y.id === x.id);
        if (i >= 0) data.notes[i] = x; else data.notes.push(x);
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
  return h('div', {},
    headerSub('定期打理', '到日子了会出现在「今天」', helpButton('定期打理怎么用', [['怎么用', ['到了该做的日子，「今天」页会出现这一项，点「做了」就从那天重新算。', '点一项可以改名字、几天一次、上次是哪天；也可以自己加，比如洗枕头、擦眼镜。', '「形象」里开始学修眉这类步骤时，会自动加上对应的一项。']]])),
    h('div', { class: 'group' }, d.periodic.map((p) => cell({ onclick: () => edit(p), title: p.name, sub: `${p.every} 天一次${p.last ? ` · 上次 ${relDay(p.last, today)}` : ''}`, meta: p.last ? nextDueText(p, today) : '还没记过' }))),
    h('button', { class: 'secondary wide', onclick: () => edit() }, '＋ 加一项'));
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
      tonight ? h('p', { class: 'good-text' }, `今晚祷告了 · ${NEAR[tonight.near] || '记下了'}${tonight.note ? `：${tonight.note}` : ''}`) : null,
      h('a', { class: 'button wide', href: '#/pray/go' }, icon('candle'), tonight ? '再祷告一次' : '开始祷告'),
      d.prayer.stage < 3 ? h('a', { class: 'link small center block', href: '#/pray/go?m=full' }, '用完整版') : null,
      h('button', { class: 'secondary wide', onclick: chatgptPraySheet }, '和 ChatGPT 一起祷告')),
    h('p', { class: 'muted small center' }, `这个月祷告了 ${ps.month} 天${ps.last ? ` · 上次是${relDay(ps.last, today)}` : ''}`),
    ps.missedYesterday ? h('div', { class: 'card soft' }, h('p', { class: 'small' }, '昨天没祷告也没关系。今晚 2 分钟就好。')) : null,
    stageReady(d, today) ? stageCard() : null,
    weekCard(today),
    itemsCard(),
    readingCard(today));
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
      h('span', { class: 'muted' }, `${dayLabel(x.day)} · ${NEAR[x.p.near] || ''}　`), x.p.note || x.p.summary)));
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
  const idx = Math.min(d.prayer.next || 0, PSALMS.length - 1);
  const p = PSALMS[idx];
  const readToday = d.days[today]?.read !== undefined;
  const finished = (d.prayer.next || 0) >= PSALMS.length;
  const read = () => saveRender(`读经：${p.label}`, (data) => { dayOf(data, today).read = idx; data.prayer.next = idx + 1; }).then(() => toast('读了 ✓'));
  return h('div', { class: 'card' },
    h('h3', {}, '读经（不强求）'),
    finished ? h('p', {}, '诗篇读完了一遍 🎉 想读什么，告诉 Claude 换一卷。') : [
      h('p', {}, readToday ? `今天读了 ✓ 下一篇：${p.label}` : `今天：${p.label}`),
      h('div', { class: 'actions' },
        h('a', { class: 'button secondary', href: psalmLink(p, d.settings.bibleVersion), target: '_blank', rel: 'noopener' }, '打开 Bible App'),
        readToday ? null : h('button', { onclick: read }, '读了')),
      h('p', { class: 'muted small' }, `诗篇一共 ${PSALMS.length} 次读完，读到第 ${idx + 1} 次。`)]);
}

function chatgptPraySheet() {
  const d = store.data;
  const today = dayKey();
  const text = prayerPrompt({ about: d.prayer.about || undefined, verse: verseFor(today), items: d.prayer.items.filter((x) => !x.answered).map((x) => x.text), plan: d.days[today]?.plan || '' });
  const box = h('textarea', { rows: 8, readonly: true, class: 'prompt-box', 'aria-label': '祷告提示词' });
  box.value = text;
  const back = h('textarea', { rows: 4, placeholder: '祷告完，把 ChatGPT 最后写的小结（感谢 / 祈求 / 经文）贴在这里', 'aria-label': 'ChatGPT 的小结' });
  let near = null;
  const nRow = h('div', {});
  const draw = () => nRow.replaceChildren(choiceRow('今天和神', Object.entries(NEAR), near, (v) => { near = v; draw(); }));
  draw();
  openSheet({
    title: '和 ChatGPT 一起祷告',
    body: h('div', { class: 'form' },
      h('ol', { class: 'small steps' }, h('li', {}, '点「复制」，打开 ChatGPT，新开一个对话粘贴发送。'), h('li', {}, '点右下角的语音按钮，跟着它祷告。'), h('li', {}, '结束后回到文字，把它写的小结复制，贴到下面。')),
      box, h('button', { class: 'secondary small', onclick: () => copyText(text) }, icon('copy'), '复制'),
      h('div', { class: 'label-sm' }, '祷告完：'), back, h('div', { class: 'label-sm' }, '今天离神'), nRow),
    confirmText: '记成今晚的祷告',
    onConfirm: () => saveRender('祷告（和 ChatGPT）', (data) => {
      const p = (dayOf(data, today).prayer ||= {});
      p.night = { at: nowIso(), mode: 'chatgpt', ...(near ? { near } : {}), ...(back.value.trim() ? { summary: back.value.trim() } : {}) };
    }).then(() => toast('记好了，晚安')),
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
    .then(() => { prayState.key = ''; toast('今天交给神了'); go('#/'); });
  return [h('h2', { class: 'pray-title' }, '去过今天吧'), h('button', { class: 'wide', onclick: done }, '好')];
}
function finishNight(today, m) {
  let near = null;
  const nRow = h('div', {});
  const note = h('textarea', { rows: 3, placeholder: '想写的话写一两句（可以不写）', 'aria-label': '祷告后的一句话' });
  const draw = () => nRow.replaceChildren(choiceRow('今天离神', Object.entries(NEAR), near, (v) => { near = v; draw(); }));
  draw();
  const done = () => saveRender('祷告', (data) => {
    const p = (dayOf(data, today).prayer ||= {});
    p.night = { at: nowIso(), mode: m, ...(near ? { near } : {}), ...(note.value.trim() ? { note: note.value.trim() } : {}) };
  }).then(() => { prayState.key = ''; toast('晚安'); go('#/pray'); });
  return [h('h2', { class: 'pray-title' }, '今天离神'), nRow, note, h('button', { class: 'wide', onclick: done }, '完成')];
}

// ---------- 英语陪练 ----------

const EN_HELP = [
  ['怎么练', [
    '网页按「聊天 2 次、美国生活 2 次、会议 1 次」轮着给你今天的模式和话题，也可以自己换。',
    '点「复制」→ 打开 ChatGPT 新对话粘贴发送 → 点语音按钮聊 15 分钟。',
    '聊完回到文字框打 wrap up，它会列出你说错的句子和值得学的表达。',
    '回来点「练完了」，记一次。按周算次数，不用每天练。',
  ]],
  ['以后会加', ['把 ChatGPT 的总结贴回来，自动存进错句本和表达本，每天复习一两分钟（第二批做）。']],
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
  const text = englishPrompt(mode, topic);
  const mon = weekOf(today);
  const thisWeek = sessions.filter((e) => e.day >= mon).length;
  const box = h('textarea', { rows: 8, readonly: true, class: 'prompt-box', 'aria-label': '英语提示词' });
  box.value = text;
  const done = () => saveUndoable('英语练了一次', (data) => { data.events.push({ id: newId('e'), day: today, at: nowIso(), type: 'english', mode, topic }); }, '记了一次')
    .then(() => { enState.mode = null; enState.topic = null; render(); }).catch(() => {});
  return h('div', {},
    headerSub('英语陪练', `这周练了 ${thisWeek} 次 · 一共 ${sessions.length} 次`, helpButton('英语陪练怎么用', EN_HELP)),
    h('div', { class: 'card' },
      h('h3', {}, '今天的模式'),
      choiceRow('模式', Object.entries(EN_MODES).map(([k, v]) => [k, v.name]), mode, (v) => { enState.mode = v || autoMode; enState.topic = null; render(); }),
      h('h3', {}, '话题'),
      h('p', { class: 'topic' }, topic),
      h('button', { class: 'link small', onclick: () => { enState.mode = mode; enState.topic = pool[(pool.indexOf(topic) + 1) % pool.length]; render(); } }, '换一个话题')),
    h('div', { class: 'card' }, box, h('div', { class: 'actions' },
      h('button', { onclick: () => copyText(text) }, icon('copy'), '复制'),
      h('button', { class: 'secondary', onclick: done }, '练完了'))));
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

function privateView() {
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
        stat(ui.flagStat, s.flag === null ? '—' : `${Math.round(s.flag * 100)}%`), stat(ui.altStat, `${s.other} 次`)),
      s.recent ? h('div', { class: 'slot-bars' }, Object.entries(s.slot).map(([k, v]) => h('div', { class: 'slot' },
        h('span', { class: 'small' }, k), h('span', { class: 'bar-track' }, h('span', { class: 'bar', style: `width:${(v / slotMax) * 100}%;background:var(--accent)` })), h('span', { class: 'small muted' }, String(v))))) : null),
    s.list.length ? h('div', { class: 'card' }, h('h3', {}, '最近'),
      s.list.slice(-15).reverse().map((e) => h('button', { class: 'event-row product-row', onclick: () => privateSheet(e) },
        h('span', { class: 'grow' }, `${e.day.slice(5).replace('-', '/')} ${hm(e.at)}`,
          h('span', { class: 'muted small' }, [e.score ? `${ui.score} ${e.score}` : '', e.flag ? ui.flagStat : '', e.checks ? checksText(e.checks, ui) : ''].filter(Boolean).map((x) => ` · ${x}`).join(''))),
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

// ---------- 更多 ----------

function moreView() {
  return h('div', {},
    header('更多'),
    h('div', { class: 'group' },
      cell({ href: '#/night', ic: 'moon', title: '睡前复盘' }),
      cell({ href: '#/english', ic: 'globe', color: 'var(--blue)', title: '英语陪练', sub: '复制提示词，和 ChatGPT 语音聊' }),
      cell({ href: '#/periodic', ic: 'calendar', color: 'var(--sage)', title: '定期打理', sub: '剪指甲、换床单、理发……' }),
      cell({ href: '#/history', ic: 'list', color: 'var(--amber)', title: '最近的记录' })),
    h('div', { class: 'group' },
      cell({ href: '#/settings', ic: 'gear', color: 'var(--muted)', title: '设置' })),
    h('p', { class: 'muted small center' }, '以后还会加：生病模式、分析、想去的地方、爱好。'));
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
