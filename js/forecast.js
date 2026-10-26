// 状态天气预报（2026-10-26 用户要的）：早上预报今天的心情和精力，说成天气。晚上记了心情就对答案。纯计算。
// 推送脚本 tools/life_push.py 里有一模一样的 Python 版（forecast_*），两边算出来的数要一样：改这里就改那边，
// tests/test_push.py 用同一组编的记录对数。
//
// 模型：贝叶斯线性回归（正态-逆伽马共轭先验），心情、精力各一个。每个记了的日子一行：
//   x = [1, 睡了几小时−7, 睡得怎样−3, 昨天的分−平均, 昨天运动了, 昨晚祷告了, 今天下雨, 今天大晴天, 周末]
//   除了常数项，每一列都减去训练日子里的平均；没记的（睡眠没填、天气查不到、往后几天还不知道的）就当是平均，填 0。
//   y − ȳ = xᵀβ + ε，ε ~ N(0, σ²)；β | σ² ~ N(0, σ²Λ⁻¹)，Λ = diag(1/τ²)；σ² ~ 逆伽马(a₀, b₀)
//   后验：V = (Λ + XᵀX)⁻¹，m = V·Xᵀy，a = a₀ + n/2，b = b₀ + (yᵀy − mᵀV⁻¹m)/2
//   预测：均值 ȳ + xᵀm，方差 σ̂²(1 + xᵀVx)，σ̂² = b/(a − 1)；「低落的可能」= P(心情 ≤ 4) 按正态算。
// 没有随机数，同样的记录算出同样的数。

import { addDays, parseDay } from './life.js';
import { solve } from './advisor.js';

export const FORECAST_MIN = 7; // 心情记满几天才开始预报
export const FORECAST_SURE = 21; // 记满几天才说具体的分（和「什么在影响我」一样）
export const FORECAST_WINDOW = 180; // 只用最近这么多天
export const LOW_MOOD = 4; // 心情 ≤ 4 算低落（和 gentleNote 一样）
export const FEATURES = ['常数', '睡眠时长', '睡得怎样', '昨天', '昨天运动', '昨晚祷告', '下雨', '大晴天', '周末'];
const TAU2 = [1, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25, 0.25];
const A0 = 3;
export const TARGETS = {
  mood: { lo: 1, hi: 10, s0: 1.5 },
  energy: { lo: 1, hi: 5, s0: 0.7 },
};
export const LEVELS = [
  { key: 'sun', name: '晴' },
  { key: 'partly', name: '晴间多云' },
  { key: 'cloud', name: '多云' },
  { key: 'overcast', name: '阴' },
  { key: 'rain', name: '小雨' },
];

const sleepH = (sl) => {
  if (!sl?.bed || !sl?.wake) return null;
  const toMin = (t) => { const [a, b] = t.split(':').map(Number); return a * 60 + b; };
  let m = toMin(sl.wake) - toMin(sl.bed);
  if (m <= 0) m += 1440;
  return m / 60;
};

// 一天的原始特征（还没减平均），不知道的是 null。today 以后的日子：前一天还没过完的事，没发生就当不知道
export function rawFeatures(data, day, target, weather, today) {
  const r = data.days[day] || {};
  const prev = addDays(day, -1);
  const p = data.days[prev] || {};
  const h = sleepH(r.sleep);
  const settled = prev < today; // 前一天已经过完了：没做就是没做
  const sport = data.events.some((e) => e.type === 'sport' && e.day === prev);
  const prayed = Boolean(p.prayer?.night);
  const w = weather[day];
  const wd = parseDay(day).getDay();
  return [
    h === null ? null : Math.max(-4, Math.min(4, h - 7)),
    r.sleep?.q ? r.sleep.q - 3 : null,
    p[target] ?? null,
    sport ? 1 : settled ? 0 : null,
    prayed ? 1 : settled ? 0 : null,
    w ? ((w.rain || 0) >= 1 ? 1 : 0) : null,
    w ? ((w.sun || 0) >= 6 ? 1 : 0) : null,
    wd === 0 || wd === 6 ? 1 : 0,
  ];
}

const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);

// 拟合：用 upTo 之前（不含）记了的日子。返回 null = 记得太少
export function forecastFit(data, upTo, target = 'mood', weather = {}) {
  const from = addDays(upTo, -FORECAST_WINDOW);
  const days = Object.keys(data.days).filter((d) => d < upTo && d >= from && data.days[d][target] != null).sort();
  if (days.length < FORECAST_MIN) return null;
  const raws = days.map((d) => rawFeatures(data, d, target, weather, upTo));
  const ys = days.map((d) => data.days[d][target]);
  const k = TAU2.length;
  const means = raws[0].map((_, j) => {
    const v = raws.map((r) => r[j]).filter((x) => x !== null);
    return v.length ? v.reduce((a, x) => a + x, 0) / v.length : 0;
  });
  const center = (raw) => [1, ...raw.map((x, j) => (x === null ? 0 : x - means[j]))];
  const ybar = ys.reduce((a, x) => a + x, 0) / ys.length;
  const X = raws.map(center);
  const y = ys.map((v) => v - ybar);
  const P = Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) => (i === j ? 1 / TAU2[i] : 0)));
  const Xty = new Array(k).fill(0);
  for (let n = 0; n < X.length; n++) {
    for (let i = 0; i < k; i++) {
      Xty[i] += X[n][i] * y[n];
      for (let j = 0; j < k; j++) P[i][j] += X[n][i] * X[n][j];
    }
  }
  const m = solve(P.map((r) => [...r]), Xty);
  const s0 = TARGETS[target].s0;
  const a = A0 + days.length / 2;
  const b = (A0 - 1) * s0 * s0 + (dot(y, y) - dot(m, Xty)) / 2; // mᵀV⁻¹m = mᵀXᵀy
  const sdY = Math.sqrt(ys.reduce((acc, v) => acc + (v - ybar) ** 2, 0) / ys.length);
  return { target, upTo, n: days.length, means, ybar, sdY, m, P, sigma2: b / (a - 1) };
}

// 正态分布函数（Abramowitz–Stegun 7.1.26，误差 < 1.5e-7；Python 版用同一个公式）
export function normCdf(z) {
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return z >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}

// 预测某一天：{ mean（夹在分数范围里）, sd, pLow?（心情才有）, imputed: [没记、按平均算的特征名] }
export function forecastPredict(fit, data, day, weather = {}, today = day) {
  if (!fit) return null;
  const raw = rawFeatures(data, day, fit.target, weather, today);
  const x = [1, ...raw.map((v, j) => (v === null ? 0 : v - fit.means[j]))];
  const mu = fit.ybar + dot(x, fit.m);
  const v = solve(fit.P.map((r) => [...r]), x);
  const sd = Math.sqrt(fit.sigma2 * (1 + dot(x, v)));
  const { lo, hi } = TARGETS[fit.target];
  const out = { mean: Math.max(lo, Math.min(hi, mu)), sd, imputed: raw.map((r, j) => (r === null ? FEATURES[j + 1] : null)).filter(Boolean) };
  if (fit.target === 'mood') out.pLow = normCdf((LOW_MOOD + 0.5 - mu) / sd);
  return out;
}

// 心情预报 → 天气：按和自己平时比高多少（z），低落的可能过半就是小雨
export function levelOf(fit, pred) {
  const z = (pred.mean - fit.ybar) / Math.max(0.5, fit.sdY);
  const i = pred.pLow >= 0.5 || z < -1 ? 4 : z < -0.5 ? 3 : z < 0 ? 2 : z < 0.5 ? 1 : 0;
  return LEVELS[i];
}
export const energyWord = (e) => (e >= 3.8 ? '精力足' : e >= 3 ? '精力还行' : e >= 2.3 ? '精力一般' : '容易累');

// 某一天的预报（心情 + 精力 + 天气），记得太少返回 { short: 记了几天 }
export function forecastDay(data, day, weather = {}, today = day) {
  const mf = forecastFit(data, day > today ? today : day, 'mood', weather);
  if (!mf) return { short: Object.keys(data.days).filter((d) => d < today && data.days[d].mood != null).length };
  const ef = forecastFit(data, day > today ? today : day, 'energy', weather);
  const mood = forecastPredict(mf, data, day, weather, today);
  const energy = ef ? forecastPredict(ef, data, day, weather, today) : null;
  return { day, mood, energy, level: levelOf(mf, mood), sure: mf.n >= FORECAST_SURE, fit: mf, efit: ef };
}

// 往后几天（不含今天）：睡眠、昨天的分都还不知道，只靠星期几和天气预报，说得粗
export function forecastWeek(data, today, weather = {}, n = 6) {
  const out = [];
  for (let i = 1; i <= n; i++) {
    const f = forecastDay(data, addDays(today, i), weather, today);
    if (f.short !== undefined) break;
    out.push(f);
  }
  return out;
}

// 准不准：最近 n 天里记了心情的日子，用那天以前的记录预报，和实际比。还和「只猜平均」比
export function forecastHistory(data, today, weather = {}, n = 30) {
  const rows = [];
  for (let i = n; i >= 0; i--) {
    const d = addDays(today, -i);
    const actual = data.days[d]?.mood;
    if (actual == null) continue;
    const fit = forecastFit(data, d, 'mood', weather);
    if (!fit) continue;
    rows.push({ day: d, pred: forecastPredict(fit, data, d, weather, d).mean, base: fit.ybar, actual });
  }
  if (!rows.length) return { rows, n: 0 };
  const mae = rows.reduce((a, r) => a + Math.abs(r.pred - r.actual), 0) / rows.length;
  const base = rows.reduce((a, r) => a + Math.abs(r.base - r.actual), 0) / rows.length;
  const within1 = rows.filter((r) => Math.abs(Math.round(r.pred) - r.actual) <= 1).length / rows.length;
  return { rows, n: rows.length, mae, base, within1 };
}

// 偏低的时候附一句：只从自己的规律里挑（stats.js influences 的结果），没有就不说
const TIPS = {
  sleep7: '睡够 7 小时的日子，你的心情会好一点。今晚早点睡。',
  sportE: '动一动的第二天，你的精力会高一点。',
  sport: '运动过的日子，你的心情会好一点。出去走走也好。',
  pray: '前一晚祷告过，第二天会平静一点。',
  planYes: '前一天的计划做到了，第二天会轻松一点。今天的事少一点也行。',
};
export function forecastTip(level, inf) {
  if (!['overcast', 'rain'].includes(level.key)) return null;
  const x = inf.find((f) => TIPS[f.key] && f.nWith >= 5 && f.nWithout >= 5 && f.diff >= (f.target.includes('精力') ? 0.25 : 0.5));
  return x ? TIPS[x.key] : null;
}

// 「怎么算的」：每一项让分数变多少（β，按原来的单位）
export function forecastEffects(fit) {
  return FEATURES.slice(1).map((name, j) => ({ name, beta: fit.m[j + 1] }));
}
