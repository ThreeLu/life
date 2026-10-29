// 心情问卷（2026-10-28 用户要的）：每周日一份 DASS-21，每个月最后一个周日再加 PSS-10 和 SWLS。纯计算，没有 DOM。
// 题目照已发表的中文版逐字录入：
// - DASS-21：Lovibond & Lovibond (1995)；中文版 Taouk, Lovibond & Laube (2001)，dass.psy.unsw.edu.au/Chinese/ 转成简体；
//   选项用龚栩、谢熹瑶、徐蕊、罗跃嘉 (2010)《抑郁-焦虑-压力量表简体中文版 (DASS-21) 在中国大学生中的测试报告》的写法。
// - PSS-10：Cohen, Kamarck & Mermelstein (1983)；王振 (2008) 译，上海交通大学医学院附属精神卫生中心（Cohen 实验室网站上的简体中文版）。
// - SWLS：Diener, Emmons, Larsen & Griffin (1985)；中文版 Mantak Yuen (2002)，Diener 网站上的版本转成简体。
// 三份都允许个人、非商业使用。问卷只看自己的变化，不是诊断。

import { addDays, weekOf, parseDay } from './life.js';

export const DASS = {
  id: 'dass', name: 'DASS-21 抑郁焦虑压力量表', short: '心情问卷',
  intro: '下面每一句，按过去一周的情况，选最符合你的。答案没有对错，不用想太久。',
  options: ['不符合', '有时符合', '常常符合', '总是符合'],
  items: [
    '我觉得很难让自己安静下来',
    '我感到口干',
    '我好像不能再有任何愉快、舒畅的感觉',
    '我感到呼吸困难（例如不是做运动时也感到气促或透不过气来）',
    '我感到很难主动去开始工作',
    '我对事情往往作出过敏反应',
    '我感到颤抖（例如手抖）',
    '我觉得自己消耗很多精神',
    '我忧虑一些令自己恐慌或出丑的场合',
    '我觉得自己对将来没有什么可盼望',
    '我感到忐忑不安',
    '我感到很难放松自己',
    '我感到忧郁沮丧',
    '我无法容忍任何阻碍我继续工作的事情',
    '我感到快要恐慌了',
    '我对任何事也不能热衷',
    '我觉得自己不怎么配做人',
    '我发觉自己很容易被触怒',
    '我察觉自己在没有明显的体力劳动时，也感到心律不正常',
    '我无缘无故地感到害怕',
    '我感到生命毫无意义',
  ],
};
// 三个分量表各 7 题（题号从 1 开始），加起来乘 2，和 DASS-42 同一把尺子
export const DASS_SUB = {
  d: { name: '抑郁', items: [3, 5, 10, 13, 16, 17, 21], cut: [10, 14, 21, 28] },
  a: { name: '焦虑', items: [2, 4, 7, 9, 15, 19, 20], cut: [8, 10, 15, 20] },
  s: { name: '压力', items: [1, 6, 8, 11, 12, 14, 18], cut: [15, 19, 26, 34] },
};
export const DASS_LEVELS = ['正常', '轻度', '中度', '重度', '非常重'];

export const PSS = {
  id: 'pss', name: 'PSS-10 压力知觉量表', short: '这个月的压力',
  intro: '下面的问题问的是你在过去一个月里的感受和想法，选最符合你的。',
  options: ['从未有', '几乎没有', '偶尔', '经常', '非常多'],
  items: [
    '在过去的一个月里，你有多少时间因为发生意外的事情而感到心烦意乱？',
    '在过去的一个月里，有多少时间你感到无法掌控生活中重要的事情？',
    '在过去的一个月里，有多少时间你感觉到神经紧张或“快被压垮了”？',
    '在过去的一个月里，有多少时间你对自己处理个人问题的能力感到有信心？',
    '在过去的一个月里，有多少时间你感到事情发展和你预料的一样？',
    '在过去的一个月里，有多少时间你发现自己无法应付那些你必须去做的事情？',
    '在过去的一个月里，日常生活中有多少时间你能够控制自己的愤怒情绪？',
    '在过去的一个月里，有多少时间你感到处理事情得心应手（事情都在你的控制之中）？',
    '在过去的一个月里，有多少时间你因为一些超出自己控制能力的事情而感到愤怒？',
    '在过去的一个月里，有多少时间你感到问题堆积如山，已经无法逾越？',
  ],
  reverse: [4, 5, 7, 8],
};
export const PSS_LEVELS = [[0, '低'], [14, '中等'], [27, '高']];

export const SWLS = {
  id: 'swls', name: 'SWLS 生活满意度量表', short: '对生活满不满意',
  intro: '下面五句话，你有多同意？请坦白回答。',
  options: ['非常不同意', '不同意', '少许不同意', '中立', '少许同意', '同意', '非常同意'],
  items: [
    '我的生活大致符合我的理想。',
    '我的生活状况非常圆满。',
    '我满意自己的生活。',
    '直至现在为止，我都能够得到我在生活上希望拥有的重要东西。',
    '如果我能重新活过，差不多没有东西我想改变。',
  ],
};
export const SWLS_LEVELS = [[5, '非常不满意'], [10, '不满意'], [15, '有点不满意'], [20, '中立'], [21, '有点满意'], [26, '满意'], [31, '非常满意']];

// 每周的：DASS；每月的：PSS + SWLS（接着填，一题一屏）
export const SCALE_SETS = { w: [DASS], m: [PSS, SWLS] };

// ---------- 计分 ----------

const sum = (xs) => xs.reduce((a, b) => a + b, 0);
export function dassScore(ans) {
  if (!Array.isArray(ans) || ans.length !== 21 || ans.some((v) => !(v >= 0 && v <= 3))) return null;
  const out = {};
  for (const [k, s] of Object.entries(DASS_SUB)) out[k] = sum(s.items.map((i) => ans[i - 1])) * 2;
  return out;
}
export const dassLevel = (k, v) => DASS_SUB[k].cut.filter((c) => v >= c).length; // 0 正常 … 4 非常重
export function pssScore(ans) {
  if (!Array.isArray(ans) || ans.length !== 10 || ans.some((v) => !(v >= 0 && v <= 4))) return null;
  return sum(ans.map((v, i) => (PSS.reverse.includes(i + 1) ? 4 - v : v)));
}
export function swlsScore(ans) {
  if (!Array.isArray(ans) || ans.length !== 5 || ans.some((v) => !(v >= 0 && v <= 6))) return null;
  return sum(ans) + 5; // 存的是 0–6，原量表是 1–7
}
const bandOf = (levels, v) => levels.filter(([c]) => v >= c).pop()[1];
export const pssLevel = (v) => bandOf(PSS_LEVELS, v);
export const swlsLevel = (v) => bandOf(SWLS_LEVELS, v);

// 一份结果的分数：{ d, a, s }（周）/ { pss, swls }（月）
export function scoreOf(rec) {
  if (!rec) return null;
  if (rec.dass) return dassScore(rec.dass);
  const pss = pssScore(rec.pss);
  const swls = swlsScore(rec.swls);
  return pss === null && swls === null ? null : { pss, swls };
}

// 分数偏高：DASS 任何一项到中度，或者 PSS 到高。用户说这时只提醒多出去转转、走一走、放松
export function scaleHigh(rec) {
  const sc = scoreOf(rec);
  if (!sc) return false;
  if (rec.dass) return Object.keys(DASS_SUB).some((k) => dassLevel(k, sc[k]) >= 2);
  return sc.pss !== null && sc.pss >= PSS_LEVELS[2][0];
}

// ---------- 哪天该填 ----------

// 周日出现，没填就挂到周二（问的是「过去一周」，再晚就不准了）。键：w + 那周的周一；最后一个周日再加 m + 月份
export const SCALE_KEEP_DAYS = 2;
export function scaleDue(data, today) {
  const back = parseDay(today).getDay(); // 0 = 周日
  if (back > SCALE_KEEP_DAYS) return [];
  const sun = addDays(today, -back);
  if (data.startDate && sun < data.startDate) return [];
  const done = data.scales || {};
  const out = [];
  const wk = `w${weekOf(sun)}`;
  if (!done[wk]) out.push(wk);
  const mk = `m${sun.slice(0, 7)}`;
  if (addDays(sun, 7).slice(0, 7) !== sun.slice(0, 7) && !done[mk]) out.push(mk);
  return out;
}

// 键 → 名字
export function scaleTitle(key) {
  if (key[0] === 'm') return `${Number(key.slice(6, 8))} 月的问卷`;
  const mon = key.slice(1);
  const sun = addDays(mon, 6);
  return `${Number(sun.slice(5, 7))} 月 ${Number(sun.slice(8))} 日那周的问卷`;
}
export const scaleCount = (key) => SCALE_SETS[key[0]].reduce((a, s) => a + s.items.length, 0);

// 一段日子里的结果：周的看那周的周日（填的那天）在不在里面，月的看月份在不在里面
export function scalesIn(data, from, to) {
  return Object.entries(data.scales || {})
    .filter(([k]) => (k[0] === 'w' ? addDays(k.slice(1), 6) >= from && addDays(k.slice(1), 6) <= to : k.slice(1) >= from.slice(0, 7) && k.slice(1) <= to.slice(0, 7)))
    .map(([key, rec]) => ({ key, rec, score: scoreOf(rec) }))
    .filter((x) => x.score)
    .sort((a, b) => a.key.slice(1).localeCompare(b.key.slice(1)));
}

// 给 DeepSeek 的一段话（周报、月报、年报、问问我的记录）
export function scalesText(list) {
  if (!list.length) return '';
  const w = list.filter((x) => x.key[0] === 'w').map(({ key, score: s }) => {
    const sun = addDays(key.slice(1), 6);
    return `${sun.slice(5)}那周 抑郁${s.d}（${DASS_LEVELS[dassLevel('d', s.d)]}）焦虑${s.a}（${DASS_LEVELS[dassLevel('a', s.a)]}）压力${s.s}（${DASS_LEVELS[dassLevel('s', s.s)]}）`;
  });
  const m = list.filter((x) => x.key[0] === 'm').map(({ key, score: s }) => [
    `${Number(key.slice(6))}月`,
    s.pss !== null ? `压力知觉 ${s.pss}/40（${pssLevel(s.pss)}）` : '',
    s.swls !== null ? `生活满意度 ${s.swls}/35（${swlsLevel(s.swls)}）` : '',
  ].filter(Boolean).join(' '));
  return [
    w.length ? `每周心情问卷（DASS-21，每项 0–42，越高越重）：${w.join('；')}。` : '',
    m.length ? `每月问卷（PSS-10 越高压力越大；SWLS 越高越满意）：${m.join('；')}。` : '',
  ].filter(Boolean).join('\n');
}
