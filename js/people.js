// 身边的人：分组、生日、来往、和账本人情账的名单对上。纯计算，不碰 DOM。
//
// people: [{ id（和账本 people 同一个 id）, name, sex: 'm'|'f', groups: [主要的档, 也在的档…], rel（妈妈 / 导师 / 同学…）, how（怎么认识的）,
//            birthday: { cal: 'solar'|'lunar', m, d, y? } | null, likes（喜欢什么、不吃什么）, note（近况、要记得的）,
//            log: [{ id, day, text, favor?, gift?: 'out'|'in' }], at, archived?（归档的日期）, archiveNote?,
//            tone（平时怎么称呼、怎么说话，DeepSeek 写问候时照着）, greet: [过节要问候的节 key], dates: [{ id, day, title, gift?, yearly? }]（重要的日子）,
//            stages: [{ id, title, from, to?, text }]（我们的经历，from / to 写「2019」或「2019-09」） }]
// 人情（不是钱的）存在账本 finance.json 的 favors 里，这里只读和写进去。

import { nextBirthday } from './cal.js';

export const PEOPLE_GROUPS = { family: '家人', relative: '亲戚', primary: '小学', middle: '初中', high: '高中', college: '本科', grad: '研究生' };
// 关系的快捷选项（也可以自己写）
export const REL_CHOICES = {
  family: ['爸爸', '妈妈', '哥哥', '姐姐', '弟弟', '妹妹', '爷爷', '奶奶', '外公', '外婆'],
  relative: ['叔叔', '伯伯', '姑姑', '舅舅', '姨', '表哥', '表姐', '表弟', '表妹', '堂哥', '堂姐', '堂弟', '堂妹'],
  grad: ['导师', '老师', '师兄', '师姐', '同门', '师弟', '师妹', '同学', '舍友', '同事'],
  school: ['同学', '舍友', '老师', '朋友'],
};
export const relChoices = (group) => REL_CHOICES[group] || (group ? REL_CHOICES.school : []);

export const mainGroup = (p) => p.groups?.[0] || '';
export const SEX = { m: '男', f: '女' };
export const ta = (p) => (p?.sex === 'f' ? '她' : '他');
const dayDiff = (a, b) => Math.round((new Date(`${b}T12:00:00`) - new Date(`${a}T12:00:00`)) / 86400000);

// 接下来 within 天里过生日的（归档的不算），近的在前
export function upcomingBirthdays(people, today, within = 30) {
  return people.filter((p) => !p.archived && p.birthday?.m)
    .map((p) => {
      const day = nextBirthday(p.birthday, today);
      return day && { p, day, left: dayDiff(today, day), age: p.birthday.y && p.birthday.cal !== 'lunar' ? Number(day.slice(0, 4)) - p.birthday.y : null };
    })
    .filter((x) => x && x.left <= within)
    .sort((a, b) => a.left - b.left);
}

// 重要的日子（婚礼、乔迁、满月……）：接下来 within 天里的；yearly 的每年算一次
export function upcomingDates(people, today, within = 30) {
  const out = [];
  for (const p of people) {
    if (p.archived) continue;
    for (const x of p.dates || []) {
      let day = x.day;
      if (x.yearly && day) {
        const y = Number(today.slice(0, 4));
        day = [y, y + 1].map((yy) => `${yy}${x.day.slice(4)}`).find((d) => d >= today);
      }
      if (!day || day < today) continue;
      const left = dayDiff(today, day);
      if (left <= within) out.push({ p, x, day, left });
    }
  }
  return out.sort((a, b) => a.left - b.left);
}

// 礼尚往来：账本里给他 / 他给的（tx.who），加上自己记的送礼、收礼（log.gift）。近的在前
export function giftsWith(data, ledger, id) {
  const p = data.people.find((x) => x.id === id);
  const out = [];
  for (const t of ledger?.tx || []) {
    if (t.who !== id) continue;
    const cat = ledger.categories?.find((c) => c.id === t.category)?.name || '';
    out.push({ day: t.date, dir: t.type === 'income' ? 'in' : 'out', text: [t.what || cat, t.note].filter(Boolean).join(' · '), amount: t.cny ?? t.amount });
  }
  for (const l of p?.log || []) if (l.gift) out.push({ day: l.day, dir: l.gift, text: l.text });
  return out.sort((a, b) => b.day.localeCompare(a.day));
}
// 一句话：以前来回送过多少，随礼的时候参考
export function giftSummary(gifts, pronoun = '他') {
  const sum = (dir) => gifts.filter((g) => g.dir === dir && g.amount).reduce((a, g) => a + g.amount, 0);
  const last = (dir) => gifts.find((g) => g.dir === dir);
  const parts = [];
  const o = last('out'); const i = last('in');
  if (o) parts.push(`上次你给${pronoun}：${o.text}${o.amount ? ` ¥${Math.round(o.amount)}` : ''}（${o.day.slice(0, 7)}）`);
  if (i) parts.push(`上次${pronoun}给你：${i.text}${i.amount ? ` ¥${Math.round(i.amount)}` : ''}（${i.day.slice(0, 7)}）`);
  if (gifts.filter((g) => g.amount).length > 2) parts.push(`一共：你给出 ¥${Math.round(sum('out'))}，收到 ¥${Math.round(sum('in'))}`);
  return parts.join('；');
}

// 和账本名单对上：账本里新加的人搬过来（还没分组）；这边的名字、归档同步到账本
export function ledgerSync(people, ledgerPeople = []) {
  const mine = new Map(people.map((p) => [p.id, p]));
  const theirs = new Map(ledgerPeople.map((p) => [p.id, p]));
  const imports = ledgerPeople.filter((p) => !mine.has(p.id) && !people.some((x) => x.name === p.name)).map((p) => ({ id: p.id, name: p.name }));
  // 同名的（账本里先有、这边又手动加了一个）：认成同一个人，换成账本的 id
  const merges = ledgerPeople.filter((p) => !mine.has(p.id)).map((p) => ({ from: people.find((x) => x.name === p.name && !theirs.has(x.id))?.id, to: p.id })).filter((x) => x.from);
  const merged = new Set(merges.map((x) => x.from));
  const pushes = people.filter((p) => !merged.has(p.id)).filter((p) => {
    const t = theirs.get(p.id);
    return !t || t.name !== p.name || Boolean(t.archived) !== Boolean(p.archived);
  }).map((p) => ({ id: p.id, name: p.name, archived: Boolean(p.archived) }));
  return { imports, merges, pushes };
}

// 和他之间的钱（和账本 personStatus 一样算）：> 0 他欠我，< 0 我欠他
export function moneyWith(ledger, id) {
  let n = 0;
  for (const t of ledger?.tx || []) {
    if (t.person !== id) continue;
    const v = t.cny ?? t.amount;
    if (t.type === 'advance' || t.type === 'payback') n += v;
    else if (t.type === 'repay' || (t.type === 'expense' && !t.account)) n -= v;
  }
  return Math.round(n * 100) / 100;
}

const yuan = (n) => `¥${Math.round(n * 100) / 100}`;
// 来往：自己记的、一起去的地方、人情、账本里和他有关的钱，按日子倒着排
export function timeline(data, ledger, id) {
  const out = [];
  const p = data.people.find((x) => x.id === id);
  const pr = ta(p);
  for (const l of p?.log || []) out.push({ day: l.day, kind: 'log', text: l.text, log: l });
  for (const pl of data.places || []) {
    for (const v of pl.visits || []) if (v.with?.includes(id)) out.push({ day: v.day, kind: 'place', text: `一起去了${pl.name}`, href: `#/place/${pl.id}` });
  }
  for (const f of ledger?.favors || []) {
    if (f.person !== id) continue;
    out.push({ day: f.date, kind: 'favor', text: `${f.dir === 'owe' ? `欠${pr}一个人情` : `${pr}欠你一个人情`}：${f.text}`, favor: f });
    if (f.status === 'done' && f.doneAt) {
      const tx = f.doneTx && ledger.tx?.find((t) => t.id === f.doneTx);
      out.push({ day: f.doneAt, kind: 'favor', text: `${f.dir === 'owe' ? '还了人情' : `${pr}还了人情`}：${f.text}${tx ? `（${yuan(tx.cny ?? tx.amount)}）` : f.doneNote ? `（${f.doneNote}）` : ''}` });
    }
  }
  for (const g of giftsWith(data, ledger, id)) {
    if (g.amount == null) continue; // 自己记的送礼收礼已经在 log 里
    out.push({ day: g.day, kind: 'gift', text: `${g.dir === 'out' ? `送${pr}` : `${pr}送你`}：${g.text} ¥${Math.round(g.amount * 100) / 100}` });
  }
  for (const x of p?.dates || []) if (!x.yearly) out.push({ day: x.day, kind: 'date', text: x.title });
  for (const t of ledger?.tx || []) {
    if (t.person !== id) continue;
    const v = yuan(t.cny ?? t.amount);
    const text = t.type === 'advance' ? `你帮${pr}付了 ${v}` : t.type === 'repay' ? `${pr}还你 ${v}` : t.type === 'payback' ? `你还${pr} ${v}` : t.type === 'expense' && !t.account ? `${pr}帮你付了 ${v}` : null;
    if (text) out.push({ day: t.date, kind: 'money', text: t.note ? `${text} · ${t.note}` : text });
  }
  return out.sort((a, b) => b.day.localeCompare(a.day));
}
