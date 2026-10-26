// 导师找我（2026-10-25 用户要的）：预测今天被问进度的可能，可能 ≥ 25% 就早上提醒。纯计算。
// 推送脚本 tools/life_push.py 里有一模一样的 Python 版（advisor_*），两边算出来的数要一样：改这里就改那边，
// tests/test_push.py 和网页测试用同一组日子对数。
//
// 模型：离散时间风险模型（贝叶斯逻辑回归）。从第一次被找的第二天起，每天一行：
//   y = 这天被找了没有；x = [1, ln(离上次几天), 离上次几天 / 7, 周一…周日]
//   logit P(y = 1) = β₀ + β₁·ln d + β₂·d/7 + γ_周几
//   先验 β ~ N(0, 2²)，γ ~ N(0, 1)（把各个星期几往平均拉，数据少时不把巧合当规律）
// 拉普拉斯近似：牛顿法求后验众数 θ̂，协方差 Σ = (XᵀWX + Λ)⁻¹；
// 预测 P = σ(μ / √(1 + π·s²/8))，μ = xᵀθ̂，s² = xᵀΣx（MacKay 近似，把参数的不确定也算进去）。
// 没有随机数，同样的记录算出同样的数。

import { addDays, daysBetween, parseDay } from './life.js';

export const ADVISOR_REMIND = 0.25; // 可能到这么多就早上提醒（用户 2026-10-25 定的）
export const ADVISOR_MIN = 3; // 至少记了几次才预测
const PRIOR_VAR = [4, 4, 4, 1, 1, 1, 1, 1, 1, 1];
const WEEK = '一二三四五六日';

// 被找过的日子（一天只算一次），从早到晚
export const advisorDays = (data) => [...new Set((data.events || []).filter((e) => e.type === 'advisor').map((e) => e.day))].sort();

// 周一 = 0 … 周日 = 6
const weekday = (day) => (parseDay(day).getDay() + 6) % 7;
export function advisorFeatures(gap, wd) {
  const x = [1, Math.log(gap), gap / 7, 0, 0, 0, 0, 0, 0, 0];
  x[3 + wd] = 1;
  return x;
}

// 解线性方程组 A·v = b（高斯消元，选主元）；A 会被改。状态预报 forecast.js 也用它
export function solve(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}
const sigmoid = (z) => 1 / (1 + Math.exp(-z));

// 拟合：用 upTo 之前（不含）的日子。返回 null = 记录太少
export function advisorFit(days, upTo) {
  const ev = days.filter((d) => d < upTo);
  if (ev.length < ADVISOR_MIN) return null;
  const set = new Set(ev);
  const rows = [];
  let last = ev[0];
  for (let d = addDays(ev[0], 1); d < upTo; d = addDays(d, 1)) {
    const y = set.has(d) ? 1 : 0;
    rows.push({ x: advisorFeatures(daysBetween(last, d), weekday(d)), y });
    if (y) last = d;
  }
  const k = PRIOR_VAR.length;
  let th = new Array(k).fill(0);
  th[0] = -2;
  let H = null;
  for (let it = 0; it < 30; it++) {
    const g = th.map((t, i) => -t / PRIOR_VAR[i]);
    H = Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) => (i === j ? 1 / PRIOR_VAR[i] : 0)));
    for (const { x, y } of rows) {
      const p = sigmoid(x.reduce((a, xi, i) => a + xi * th[i], 0));
      const w = p * (1 - p);
      for (let i = 0; i < k; i++) {
        if (!x[i]) continue;
        g[i] += x[i] * (y - p);
        for (let j = 0; j < k; j++) if (x[j]) H[i][j] += w * x[i] * x[j];
      }
    }
    const step = solve(H.map((r) => [...r]), g);
    th = th.map((t, i) => t + step[i]);
    if (Math.max(...step.map(Math.abs)) < 1e-9) break;
  }
  return { theta: th, H, rows: rows.length, events: ev.length, last: ev.at(-1) };
}

// 某一天被找的可能（fit 用的是这天以前的记录；假设从上次到这天之间没再被找）
export function advisorProb(fit, day) {
  if (!fit) return null;
  const x = advisorFeatures(daysBetween(fit.last, day), weekday(day));
  const mu = x.reduce((a, xi, i) => a + xi * fit.theta[i], 0);
  const v = solve(fit.H.map((r) => [...r]), x); // Σx
  const s2 = x.reduce((a, xi, i) => a + xi * v[i], 0);
  return sigmoid(mu / Math.sqrt(1 + (Math.PI * s2) / 8));
}

// 今天和往后几天：today 已经记了就不用提醒
export function advisorOutlook(data, today, n = 14) {
  const days = advisorDays(data);
  const fit = advisorFit(days, today);
  const doneToday = days.includes(today);
  const next = [];
  // 今天已经被找了：往后按今天是「上次」重新算（model 是往后用的那一个，「怎么算的」写它）
  const f2 = fit && doneToday ? advisorFit(days, addDays(today, 1)) : fit;
  if (fit) {
    for (let i = doneToday ? 1 : 0; next.length < n; i++) { const d = addDays(today, i); next.push({ day: d, p: advisorProb(f2, d) }); }
  }
  const p = fit && !doneToday ? advisorProb(fit, today) : null;
  return { days, fit, model: f2, p, remind: p != null && p >= ADVISOR_REMIND, doneToday, next,
    // 各个星期几比平均高多少（γ 减去平均，换成「几倍」），「怎么算的」里写
    week: f2 ? WEEK.split('').map((w, i) => ({ w, odds: Math.exp(f2.theta[3 + i] - f2.theta.slice(3).reduce((a, x) => a + x, 0) / 7) })) : [] };
}
