# 生活 — 给 Claude Code 的说明

用户的个人生活记录网站（第三个，仿照账本 `../ledger`、物品档案 `../inventory`）。用中文交流。

外观（用户 2026-10 选的）：无印良品底色 + 藤紫、白卡片柔阴影不变；标题（页面大标题、卡片小标题）用宋体 `--serif`，正文苹方；首页开头 `todayHeader`：日期 → 问候（按时间）→ 节气（`solarTerm`，寿星公式；账本、物品档案的 `js/solar.js` 是同一份，改了三边一起改）和今天天气两个小标签，护肤、复盘、祷告都做了盖「圆满」章（`dayComplete`）；角落那句话是带引号的淡紫小卡（`SELF_LINES`，安静的短句）；打勾弹一下（`.pop`）、换页淡入（`#view.enter`）、浅色时底色随节气微变（`html[data-season]`）。界面大白话，每页角落有「?」怎么用（`helpButton`），**不评判、不说教**，没做的那天就空着，不显示「连续 N 天」。

## 结构

- **本仓库 `ThreeLu/life`（公开）**：纯静态网页，GitHub Pages 发布在 https://threelu.github.io/life/ 。推送到 main 自动上线。
- **数据仓库 `ThreeLu/life-data`（私有）**：`life.json`。和物品档案、账本同一个 fine-grained 令牌（要额外授权 life-data），没有自己的令牌时用 `localStorage['inventory-settings']` / `['ledger-settings']` 的。
- **代码公开：绝不写个人信息**。用的什么产品、祷告事项、小记的内容和文字、密码（只存哈希）都只在 `life.json`。`content.js` 里只放通用知识（护肤路线、经文、提示词）。测试只用编的内容。
- 用户不想在本地留数据：不要把数据仓库 clone 到本地长期保存。

## 数据格式（life.json）

```
{ version, startDate,
  settings: { rhythmDays, checks, bibleVersion, bibleVersionEn?, sportKinds, drinkKinds, pin: { salt, iter, hash }, city?: { name, lat, lon, districts: [] } },
  days: { 日期: { mood 1–10, note, energy 1–5, stress 1–5, did, plan, planDone: yes|part|no,
                  sleep: { bed, wake, q }, fetch: { mid, eve }（打水）, goals: { 习惯id: true }, affirm（默念了）, care: { 打卡项id: true }, prayer: { night: { at, mode, note, summary }, morning: { at } }, read, readBook } },
  events: [{ id, day, at, type: shower|sport|drink|english|p|p2, kind?, minutes?, km?, level?, note?, mode?, topic?, mistakes?, exprs?, score?, flag?, checks?: { c1, c2, c3 } }],
  look: { routine: [{ id, step?, name, when: am|pm|shower|week, times?, optional? }], products: { 物品档案id: { opened, verdict, note, pao? } }, hide: [物品档案id],
          老的 direction / steps / identity / moments 不再用 },
  periodic: [{ id, name, every, last }],
  weeks: { 周一日期: { thanks } }（老的 skin 不再用）,
  prayer: { stage: 1|2|3, since, about（ChatGPT 祷告提示词里的自我介绍）, items: [{ id, text, at, answered?, answerNote? }], next: 下一篇诗篇序号, book, pos: { 卷: 下一章序号 } },
  private: { supplies: [{ id, name, low? }], ui: { title, main, alt, score, flag, checks: { c1, c2, c3 }, checksTitle, help, programTitle, sessionStart, safety: [], aftercare: [], … },
             program: { start: 第一周周一, weeks: [{ title, intro, buy?, tasks: [{ id, track: a|b, text, level, note? }] }], pool: [任务 + from 第几周起], draw: 每次抽几张, scenes: [情景], rewards: [文字 | { text, unrule }], penalties: [惩罚], checks: [突击检查], checkEvery: [最少, 最多分钟], levels: [{ name, min, text }] }, rules: [{ id, text, at }], callNames: [称呼], begs: [求的话], voiceLines: { before: [], after: [] }, custom: [任务], limits: [字],
             sessions: [{ id, day, start, end, minutes, week, tasks: { id: done|skip }, score, after, note }], media: [{ id, day, title, link, minutes, after, note }], minutes, latest, perWeek },
  low: { plans: { down|anxious|lonely|hurt|tired|unclear: [一行一件事] }, notes: [{ id, text, at }]（写给难受时的自己）, log: [{ id, day, at, kind, before 1–10, after, did: [], helped: [], note }] },
  sick: { current: null | { id, kind: cold|fever|gut|other, start, path?: [{ day, kind }]（换过种类才有）, temps: [{ at, t }], meds: [{ at, item, name }], water: { 日期: 杯 },
                            sym: { 日期: [症状] }, done: { 日期: { 做的事文字: true } }（老数据键是预案序号）, extra: [自己加的事], gut: { 日期: { d, v } }, suspects: [] },
          history: [同上 + end, helped: [觉得管用的], how], plans: { kind: [一行一件事] }, meds: { 物品档案id: { dose, gapHours, perDay } } },
  english: { cards: [{ id, kind: mistake|expr, front, back, type?, cn?, at, due, level, seen }], next },
  milestones: { key: 日期, seen: { key: true } },
  places: [{ id, name, kind: spot|walk|shop|food|show|museum|other, district, address?, why, link, cost, season, want 1–3, lat, lng（高德坐标 GCJ-02）, at, visits: [{ id, day, score, with?: [人 id], note, photo? }] }],
  letters: { w周一 | m月份 | y年份: { at, text, research } },
  people: [{ id（和账本 people 同一个）, name, sex: m|f, groups: [主要的档, …]（family|relative|primary|middle|high|college|grad）, rel, how, birthday?: { cal: solar|lunar, m, d, y? }, likes, note, tone, greet: [节 key], dates: [{ id, day, title, gift?, yearly? }], stages: [{ id, title, from, to?, text }], log: [{ id, day, text, favor?, gift?: out|in }], at, archived?, archiveNote? }],
  greeted: { '年-节': { 人id: 日期 } },
  goals: [{ id, wish, title, status: talking|active|done|dropped, at, chat, why, key, note, stages: [{ id, title, tasks: [{ id, text, done: 日期|null, buy?: { name, price, query }, wishId? }] }], habits: [{ id, text, perWeek }], doneAt?, droppedAt? }] }
```

- **一天从凌晨 4 点开始**（`dayKey`）。周从周一开始，`weeks` 的键是周一。
- 形象页（2026-10-06 用户要求大改）：**只放数据、不放口号、不涉及钱**（钱在账本看）。这个月（护肤做完几天 `lookMonth`、洗澡、洗澡后 / 每周的项各几次、月历：早晚都做完深紫、做一部分浅紫）、护肤（最近 30 天每一项做到多少 `careItemRates`、记满一周说最常忘的；「改打卡项」直接加 / 改 / 删 `look.routine`）、护肤品。已经删掉：路线图和每一步的说明、我的方向、我是这样的人和精致时刻、每周皮肤打分（首页周末提醒和分析里的图也删了）、我学到的、身材、衣服（在物品档案看）、形象页角落那句话。老数据里的 `steps`、`direction`、`identity`、`moments`、`notes` 留着不用。
- 护肤品：读物品档案里「洗漱护肤」类的物品，开封日期、好不好用、开封后多久用完（`pao` 月，默认按名字 `paoMonths`：香水 36、睫毛膏 6、其他 12，默认值不存）存在 `look.products`；快到 / 过了标出来（`openedStatus`）。「快用完了」直接提交物品档案 inventory.json 的 `runningLow`（`updateInventoryItem`），会进那边的购物清单。
- 定期打理（`#/periodic`，入口在「生活」页，不在形象页）：做了从那天重新数；到期后每天出现在「今天」直到点「做了」（`periodicDue`），前一天出现「明天该……了」（`periodicTomorrow`），其余时候不出现，不推送（用户 2026-10-06 定）。擦鞋、修眉这类以后由用户自己在「改打卡项」或定期打理里加；`migrate` 会拿掉老的「擦鞋」定期项。
- 祷告分 3 个阶段（`STAGES`），满 4 周问要不要进下一步（`stageReady`）。带着祷告 `#/pray/go?m=short|full|morning` 一步一页；主祷文、经文是新标点和合本（对照 Bible App 版本 48 核对过）。祷告完只记一句话（可以不写），**不问「近了 / 远了」**（用户 2026-10-06 说奇怪，旧数据已删）。和 ChatGPT 祷告 / 英语陪练的提示词在 content.js（`prayerPrompt`、`englishPrompt`），网页填好当天的内容给用户复制。
- 读经可以换卷（`BIBLE_BOOKS`、`readingToday`、`markRead`）：诗篇一天一篇（119 篇拆 4 天，进度 `prayer.next`），箴言按几号读第几章，其他一天一章（`prayer.pos`）。链接 bible.com（48 = 新标点和合本简体神版，`bibleVersionEn` 116 = NLT）。
- 鼓励（用户要求「让我感到自信、有激励」）：首页每天一句（`CHEERS` / `CHEER_VERSES`）、做完一件事一句（`CHEER_ON`、`cheerNight` 按心情）、「这周的你」只数做到的（`weekHighlights`）、里程碑（`MILESTONE_TEXT`，首页祝贺 3 天）、状态不对轻轻提一句（`gentleNote`）。温和具体，不喊口号、不说教。
- 小记（`#/p`，首页右上角叶子图标）：单独 6 位密码，PBKDF2 哈希存 `settings.pin`，离开网站就锁。**这一页的文字（名字、按钮、勾选项、说明）都在 `private.ui`，公开代码里只有中性默认值（`P_DEFAULT`），不要把具体用途写进代码、提交说明或这份文件。** 只做中性记录和统计，不要「减少 / 坚持天数」之类；节奏只在这一页提，不推送；别的页面不出现（「问问我的记录」只在这一页开着锁时才带上它的数字）。忘了密码：在数据仓库里删掉 `settings.pin` 让用户重设。这一页还有按周解锁的任务（`programWeek` / `weekTasks`，每周一换；超过最后一周就是最后一周 + 自己写的）和计时的一段时间 `#/p/s`（开始前安全提醒 → 任务一张一张做或跳过，含「绝对不要」里的字的任务不出现 → 收尾清单 + 感受），任务文字里 `{3-6}` 随机整数、`{甲|乙}` 随机选一个（`fillText`，同一次时间里不变）；每次开始抽一个情景；收尾有得分（做到的按强度 10/20/30），全做到抽奖励卡、跳过两张以上抽惩罚卡（可以不做）；任务可以带 `rule`（做到了加进规矩手册 `private.rules`），track 有 a / b / c（显示名 `ui.trackA/B/C`），`{称呼}` 换成 `private.callNames`、`{求}` 换成 `private.begs` 里随机一个（都是用户自己写的）；一段时间里可以开语音（浏览器中文朗读，建议耳机；声音、语速、音调在小记页面选，存在这台设备的 localStorage `life-voice`，默认挑女声；任务和突击检查前后会随机加 `private.voiceLines.before/after` 里的一句）、黑暗模式（body.dark-session），任务里出现「N 分钟 / N 秒」就有计时按钮，突击检查按 `checkEvery` 随机出现；等级按累计得分（`levels`）；以及 `privateNote`（这周次数超过 `perWeek`、最近几次结束后心情低、老超时 → 只在这一页轻轻提）。任务内容只写在私有仓库。
- 生病（`#/sick`、`#/sick/book`）：体温曲线（37.3 起问切发烧）、喝水 8 杯、预案打勾、什么时候去医院（`RED_FLAGS`，到了自动变红）、药从物品档案「药品急救」读（只读），`MED_KNOWLEDGE` 认成分：同成分 / 两种退烧药提醒、抗生素激素「医生判断」；用户自己抄说明书（`sick.meds`）算下次几点能吃。肠胃从账本读昨天今天吃的（只读）。好了进 `history`（勾哪些管用 → `helped`），之后 2 天恢复期。**只写常识，不替用户定剂量。** 攒经验（用户要的「记多了，下次同样情况就有预案」）：每天点症状（`SYMPTOMS`）、做了什么（预案 + `extra`），`sickLessons` 按种类算几天好、感冒几次转发烧第几天、常见症状、管用的（n/做过次数），`similarSick` 找症状最像的一次，`planMissing` 一键加进预案；生病页最上面「以前的经验」、手册「我的经验」。不要「看病去哪」（用户说不需要），只留急救 120。
- 活出自己（用户想摆脱唯唯诺诺、老好人，「活出我自己、清晰明了的人生」；他明确说不要功能，只要话）：每页最下面角落一句 `SELF_LINES`（`whisper`，按日期 + 页面挑，同一天不变；小记、`/low/go`、`/pray/go`、设置不放）。标准放在「真的、对的、我在乎的」，不是换一套外面给的规矩；不说教。形象页也不放。
- 难受的时候（`#/low`、`#/low/go`，用户说「很关键」，平时不占地方）：祷告页最下面一行，心情低时首页提醒一行；一步一页：呼吸（吸 4 呼 6，6 次）→ 有多难受 1–10（9 以上马上给热线 `HOTLINES`）→ 哪一种（`LOW_KINDS`）→ 预案清单（`LOW_PLANS`，可改；`lowLessons` 说以前什么最管用）→ 给你的话（先自己写的 `low.notes`，再是心情 8 分以上那天写的 `goodDays`、经文 `LOW_VERSES`）→ 现在呢 + 哪些有用 → 存进 `low.log`。心情 8 分以上且两周没写过，首页请他写一句给难受时的自己。不推送、不进「问问我的记录」。
- 打水：开水房早上 7–8、中午 11–13、晚上 17–19；两个暖壶，一天两回：上午或中午一回（`mid`，早上打了中午就不用）、晚上一回（`eve`）。首页清单里的「打水」行（`waterItem`、`boilerStatus`）；推送 `fetch_message`：这一回没打就在刚开（11:05 / 17:05）和快关（12:20 / 18:20）各提醒一次。
- 换季：`settings.city` 有经纬度时用 Open-Meteo 查天气（每天一次存 localStorage，`seasonWarning`），睡前推送也加一句。
- 英语：贴回 ChatGPT「wrap up」总结（`parseSummary`）进错句本 / 表达本，`english.next` 写进下一次提示词；复习间隔 1/3/7/14/30/60 天（`reviewCard`）。
- 想去的地方（`#/places`、`#/place/:id`，js/places.js）：新建时第一个框什么都能放（2026-10-06）：小红书 / 大众点评 / 美团 / 高德的分享、「店名 + 地址」、一句话；`parseShare` 只认小红书标题和别的 App 里括起来的店名，认不出就留空；「一键补全」（DeepSeek）（`findPlace(name, text)`，用户点了才问，链接不发）认出是哪里，给名字（名字是用户自己写的就不换）、类型、区、地址、高德坐标，有地址按地址定位。**不填人均、营业时间**（用户不要），`cleanCandidates` 只留已有的类型和区、离城市 80 公里以外的坐标不要；连锁店列出每一家，地图标号勾选，新建时勾几家就分开记几个；坐标是估计的，提示用户在地图上核对；地图是 Leaflet（`vendor/leaflet`，按需加载）+ 高德底图（不用密钥），坐标存高德坐标，手机定位用 `wgsToGcj` 转；按区（`settings.city.districts`）、足迹、去过可以打分写话放照片（压缩后存数据仓库 `photos/places/`）。周末去哪（`weekendPicks`）只从自己写的地方挑，周五到周日首页出现，周末下雨先推室内的，周五睡前推送也带上（python 里同样的规则 `weekend_picks`）。
- 分析（`#/stats`，js/stats.js、js/charts.js）：什么在影响我（`influences`：做了 vs 没做，心情记满 21 天才给结论，天数少标「还不太可靠」；天气用 Open-Meteo 历史接口，花钱读账本），走势、作息、规律、护肤完成率、计划完成率、生病前一周。回顾 `#/report?k=week|month|year`：数字 + DeepSeek 写一段存 `letters`（月报加科研回顾）。问问我的记录 `#/ask`：DeepSeek 读最近 60 天，聊天只在内存。DeepSeek 密钥读物品档案仓库 `config/ai.json`。
- 想做到的事（`#/goals`、`#/goal/:id`，入口在「生活」页，2026-10-06）：写一句心愿 → 复制 `goalPrompt`（content.js）和 ChatGPT **语音**聊，说「整理一下」写固定格式小结 → 贴回来 → DeepSeek（`goalPlan`）拆成 2–4 阶段、每阶段 2–5 件能勾掉的小事、每周习惯、要买的东西（`buy.query` 搜索词）→ `applyGoalPlan` 存（重新整理时同样文字的事保留「做了」）。DeepSeek 带上物品档案（`goalInventory`：衣服鞋子写风格季节穿的次数备注，看不了照片；其他东西只写名字类别）和账本里没买的心愿。要买的：小红书 / 淘宝搜索链接；「放进心愿单」确认名字价格后直接提交到账本仓库 finance.json 的 `wishes`（`addLedgerWish`，记 `wishId`）。首页每个在做的目标一行进度（`goalLines`），周报有一张卡（`goalWeekCard`），做到了 3 天内首页里程碑（`goal-<id>` 记在 `milestones.seen`）。不推送。
- 身边的人（`#/people`、`#/person/:id`、`/new`、`/edit`，js/people.js，入口在「生活」页，2026-10-06）：只记名字（不记昵称、手机号、微信）；男 / 女必选（`sex`，页面上的他 / 她跟着变，`ta()`）；分组（`PEOPLE_GROUPS`）家人、亲戚、小学、初中、高中、本科、研究生，一个人可以在几档、第一个是主要的；关系 `rel`（家人亲戚写具体称呼，研究生写导师 / 师兄师姐 / 同门 / 同事……，`relChoices`）；生日公历或农历（`js/cal.js`，和账本同一份），年份可空，前一天和当天「今天」里一行；新建时写一段话「一键补全」（`personFromText`，DeepSeek 只填说到的）；来往时间线（`timeline`：自己记的 `log`、想去的地方里 `with` 他的、账本里的人情和钱）；「记成人情」/「记一个人情」直接提交账本 `favors`；「想想送什么」（`giftIdeas`）→ 小红书 / 淘宝搜索、放进账本心愿单（`kind: gift`，`targetDate` 下一次生日）；不再来往的归档不删（`archived`，列表最下面），因为以后聊天会提到。**不要**远近圈、关系打分、关系图、很久没联系提醒、周回顾里的来往（用户说的）。列表是头像墙（2026-10-06 用户选的，嫌一行一个太占地方、太呆）：圆里是名字最后一个字、按主要的档上色，下面写**全名**（不要简称），一行 5 个；上面一排切换全部 / 各档 / 还没分组 / 不再来往，人多了有「找人」；「全部」按主要的档分块（家人、亲戚、研究生、本科、高中、初中、小学），不再来往的淡淡放最后；7 天内过生日或有重要日子的头像上有小红点；师长（`rankOf`：`rank` 没选过就按关系 `guessRank` 猜，导师老师长辈 senior / 同辈 peer / 晚辈 junior）圆外多一圈细环、排在每块前面，DeepSeek 也拿到辈分；不再来往在「全部」里收成一行（一叠小灰圆 + 人数），点了切到那一档。资料里先问「知道生日吗」，知道才展开（不知道记 `noBirthday`）。
- 选人（两个网站所有填人名的地方，`js/picker.js` 两边同一份）：输入一个字出补全（名字、`hint`「本科 · 舍友」都能搜），空着时出「最近」5 个，没有就「＋ 新加」；不要一大排人名按钮。`hint` 由 `syncPeople` 写进账本 people。和账本名单：`syncPeople` 打开时把账本里新加的人搬过来（还没分组，同名的认成同一个），名字和归档写到账本（`ledgerSync`）；账本那边不改名字。节假日人情（`peopleAlerts`）：放假前一天到假期结束，「今天」里问欠的人情这次还不还（写账本 `favors` 的 `plan` / `skip`，规则和账本 `holidayFavors` 一样）。改账本统一用 `updateLedger`；读账本缓存 5 分钟 `ledgerSnap`。
- 人情和关系（2026-10-06 第二批）：「我们的经历」`stages`（一段一段，`stagesFromTextSheet` 写一大段话 DeepSeek 按时间分段，只加不改已有的）；重要的日子 `dates`（婚礼乔迁满月……，前一天和当天「今天」一行，`gift` 的带上 `giftSummary` 以前来回送过多少；`yearly` 每年）；礼尚往来（`giftsWith`：账本 tx 的 `who` + 自己记的 `log.gift`）；怎么还人情（`repayIdeas`，请吃饭从「想去的地方」挑，`place` 只认清单里的 id）；过节问候（资料里 `greet` 勾元旦 / 春节 / 端午 / 中秋 / 教师节，`cal.js` 的 `festivalsAround`：节日前一天和当天「今天」一行 → `#/greet/:年-节` 一个个「起个头」（`greetDraft`，按关系和 `tone`「怎么称呼、怎么说话」调整语气）→ 复制 → 「发了」记 `greeted`）。发给 DeepSeek 的「这个人」统一用 `personContext`。
- 推送：`tools/life_push.py`（公开，规则可测：`tests/test_push.py`），数据仓库 `.github/workflows/push.yml` 每晚 22:31 / 22:43 / 22:57（睡前）、白天 10–20 点每 2 小时（只在生病时：喝水、发烧量体温）和打水的时间下载它运行，`config/push-sent.json` 保证不重复；私钥在 life-data 的 secret `VAPID_PRIVATE_KEY`，公钥在 `js/push.js`（和账本、物品档案不是一对）。推送文字只写「睡前」「照顾自己」这类看不出私事的话。

## 代码

- `js/life.js` 纯计算；`js/places.js` 想去的地方；`js/people.js` 身边的人；`js/cal.js` 节假日、农历、生日（和账本同一份）；`js/stats.js` 分析；`js/charts.js` SVG 图表；`js/ai.js` DeepSeek；`js/content.js` 写死的内容；`js/store.js`、`github.js`、`util.js`、`icons.js` 和账本同一套（先存手机、后台上传）；`js/main.js` 路由和页面。语法检查 `node --input-type=module --check < js/main.js`。
- `h()` 的子元素传数组没问题，但 `replaceChildren` 要展开（`...`）并去掉 null。

## 测试

- `python3 tests/test_app.py`：真浏览器 + 本地假 GitHub（同时有编的物品档案 `x/inventory-data`、账本 `test/finance-data`），天气、地图底图、DeepSeek 都是假的。`python3 tests/test_push.py`：推送规则。推送后 GitHub Actions 自动跑。**改了功能就加对应步骤。绝不拿真实数据仓库做写入测试。**

## 计划（分批做）

1. ✅ 骨架、今天、形象、祷告、小记、英语提示词、22:30 推送。
2. ✅ 鼓励的话和里程碑、生病模式、换季提醒、英语错句本表达本和复习、读经换卷。
3. ✅ 想去的地方（地图、按区、足迹、周末去哪）、分析（什么在影响我、走势、作息、规律、回顾、问问我的记录）。
4. 爱好：2026-10-06 聊过，用户决定不做。
