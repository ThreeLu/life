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
  settings: { rhythmDays, checks, sportKinds, pin: { salt, iter, hash }, city?: { name, lat, lon, districts: [] } },
  days: { 日期: { mood 1–10, note, energy 1–5, stress 1–5, did, plan, planDone: yes|part|no,
                  sleep: { bed, wake, q }, fetch: { am|noon|eve: true|'skip' }（打水，老数据 { mid, eve }）, goals: { 习惯id: true }, affirm（默念了）, care: { 打卡项id: true }, noShower（今晚不洗）, clean: true|'skip'（打扫卫生）, soak（泡脚了 true | 'skip' 今晚不泡）, photo（今天的一张照片的路径，photos/days/日期-xxx.jpg）, prayer: { night: { at, mode, note, summary }, morning: { at } } } },
  events: [{ id, day, at, type: shower|sport|p|p2|advisor, kind?（advisor：wechat|face|meeting|phone）, minutes?, km?, level?, note?, mode?, topic?, mistakes?, exprs?, score?, flag?, flag2?, checks?: { c1, c2, c3 } }],
  look: { routine: [{ id, step?, name, when: am|pm|shower|week, times?, optional? }], 
          老的 direction / steps / identity / moments 不再用 },
  periodic: [{ id, name, every, last }],
  weeks: { 周一日期: { thanks } }（老的 skin 不再用）,
  prayer: { stage: 1|2|3, since, about（ChatGPT 祷告提示词里的自我介绍）, items: [{ id, text, at, answered?, answerNote? }] },
  private: { supplies: [{ id, name, low? }], ui: { title, main, alt, score, flag, flag2, checks: { c1, c2, c3 }, checksTitle, help, … }（2026-10-21 按周的任务、一段时间那一套删掉了，数据仓库里的老数据也清掉了） },
  low: { plans: { down|anxious|lonely|hurt|tired|unclear: [一行一件事] }, notes: [{ id, text, at }]（写给难受时的自己）, log: [{ id, day, at, kind, before 1–10, after, did: [], helped: [], note }] },
  milestones: { key: 日期, seen: { key: true } },
  lights: [{ id, day, at, lat, lng }]（我在这）, metro: [{ id, day, at, from, to }]（坐地铁，站名）,
  places: [{ id, name, kind: spot|walk|shop|food|show|museum|other, district, address?, why, link, cost, season, want 1–3, lat, lng（高德坐标 GCJ-02）, at, visits: [{ id, day, score, with?: [人 id], note, photo? }] }],
  letters: { w周一 | m月份 | y年份: { at, text, research?（老的月报科研回顾，不再写、不显示） } },
  people: [{ id（和账本 people 同一个）, name, sex: m|f, groups: [主要的档, …]（family|relative|primary|middle|high|college|grad）, rel, how, birthday?: { cal: solar|lunar, m, d, y? }, likes, note, tone, greet: [节 key], dates: [{ id, day, title, gift?, yearly? }], stages: [{ id, title, from, to?, text }], log: [{ id, day, text, favor?, gift?: out|in }], at, archived?, archiveNote? }],
  greeted: { '年-节': { 人id: 日期 } },
  goals: [{ id, wish, title, status: talking|active|done|dropped, at, chat, why, key, note, stages: [{ id, title, tasks: [{ id, text, done: 日期|null, buy?: { name, price, query }, wishId? }] }], habits: [{ id, text, perWeek }], doneAt?, droppedAt? }],
  chats: [{ id, day, at, mood?: irritable|down|anxious|hurt|tired|stuck|other, title（空就用内容第一行）, text, from?: pray（晚上祷告完记的） }],
  scales: { w周一: { at, day（哪天填的）, dass: [21 个 0–3] }, m月份: { at, day, pss: [10 个 0–4], swls: [5 个 0–6] } }（心情问卷） }
```

- **一天从凌晨 4 点开始**（`dayKey`）。周从周一开始，`weeks` 的键是周一。
- 回顾页（底栏「回顾」`#/look`，2026-10-27 照账本「总结」改版，用户定的）：顶上「周 | 月 | 年 | 分析」（`lookTabs`，分析页也有），**默认是周**；`#/look?mode=week|month|year&day=日期`，老链接 `#/report?k=&d=` 也打开这里。刊头和账本一样（`.mast`：左边宋体大字 第 44 周 / 10 月 / 2026，右边日期范围 + 还剩几天 / 上周 / 几个月前），左右箭头翻，最早翻到 `startDate`。每份最上面一张 `lookHead`（护肤做完 N / 7 天（月：/ 当月天数，年：/ 记了的天数）+ 进度条 + 三个小数 + 上一段一行）。
  - 周：这周每天的格子（`weekGrid`，一列一天、一行一件事：早上 / 晚上护肤、洗澡、运动、祷告、心情（m1–m5 带分数）；点星期几打开那天）→ 每天的心情（柱子 + 心情精力压力和上周比）→ 作息 → 想做到的事（`goalWeekCard`）→ 这周的感恩（`weeks[周一].thanks`）→ 去了的地方 → 看的是这周时：护肤 · 最近两周（`careDataCard`，「改打卡项」在这）和一年前的今天 → 照片和每天的一句话 → 写给你的话。
  - 月：月历（`dotMonth`，切护肤 / 心情 / 运动，**点一天打开 `#/day/日期` 看和补记**）→ 走势（`seriesRange`）→ 作息 → 每一项护肤做了几天（`careInRange`）→ 洗澡和运动（`gaps` 平均隔几天、运动种类）→ 和上个月比（上个月还没开始记就不出现）→ 去了的地方、这个月的照片（链到 `#/photos?m=`）、每天的一句话（折起来）→ 写给你的话 → 复制给 ChatGPT。
  - 年：一年的日历（`yearCalendar`，和账本年历同一个样子，切护肤 / 心情）→ 每个月（护肤、祷告、运动、平均心情柱子，`yearData`）→ 这一年（去过的地方、心情最好的几天、做到的事、里程碑）→ 写给你的话 → 复制给 ChatGPT。
  - 写给你的话（`letterCard`）：DeepSeek 写一段存 `letters`（w周一 / m月份 / y年份）。小记、科研、钱都不进回顾；不放角落那句话。
- 回顾页的点点（2026-10-15 用户选「安静的点点」）：月历圆点（今天带圈）；护肤最近两周每项一天一个点（`careDots`），不显示百分比。
- 护肤数据（2026-10-06 用户要求大改形象页）：**只放数据、不放口号、不涉及钱**（钱在账本看）。这个月（护肤做完几天 `lookMonth`、洗澡、洗澡后 / 每周的项各几次、月历：早晚都做完深紫、做一部分浅紫）、护肤（最近 30 天每一项做到多少 `careItemRates`、记满一周说最常忘的；「改打卡项」直接加 / 改 / 删 `look.routine`）。已经删掉：路线图和每一步的说明、我的方向、我是这样的人和精致时刻、每周皮肤打分（首页周末提醒和分析里的图也删了）、我学到的、身材、衣服（在物品档案看）、形象页角落那句话。老数据里的 `steps`、`direction`、`identity`、`moments`、`notes` 留着不用。
- 护肤品（2026-10-24 用户说全都不要了）：开封日期、好不好用、开封后多久用完、「快用完了」进物品档案购物清单，整块删掉；`migrate` 删掉 `look.products`、`look.hide`。不要再加回来。
- 定期打理（`#/periodic`，入口在「生活」页，不在回顾页）：做了从那天重新数；到期后每天出现在「今天」直到点「做了」（`periodicDue`），前一天出现「明天该……了」（`periodicTomorrow`），其余时候不出现，不推送（用户 2026-10-06 定）。擦鞋、修眉这类以后由用户自己在「改打卡项」或定期打理里加；`migrate` 会拿掉老的「擦鞋」定期项。
- 祷告（2026-10-06 重做，同日又分成白天 / 晚上）：页面只有一个「开始祷告」（`prayView`：今天的经文 + 金色小十字 + 按钮 + 最近有祷告的那一天几点祷告了几次、写过的那句 + 和 ChatGPT 聊过的 + 难受的时候）。**白天的祷告**（早上 / 下午 / 傍晚，`dayPrayName`）`#/pray/go?m=quick`：两种方式切换——「和 ChatGPT 说」（`quickPrayerPrompt`，两三分钟，**不读经文**、不讲道，只把现在的事交给神）或「写一句」（一句话 →「阿们」，存进 `times[].text`；提示「所有的事，都有神在帮助我」）。**晚上的祷告** `?m=night`（2026-10-14 改）：`prayerPrompt` 让 ChatGPT 当懂信仰的**长辈**，**聊天和开导**为主（问问题、理清想法、先理解再给具体看法），圣经合适的时候带一两句，不讲道、不替神传话；我说「差不多了」它为今天聊的事做简短祷告；回来「祷告完了」直接记下，**不念主祷文**（`LORDS_PRAYER` 留在 content.js 不用）。都不要 ChatGPT 写小结。记在 `days[日].prayer.times: [{ at, kind: quick|night, text? }]`，晚上那次同时写 `prayer.night`（统计、推送、圆满章都看它）。晚上 8 点后第一次默认是晚上那次，可以切换。晚上不让打字；不问「近了 / 远了」。阶段、晨祷、祷告事项、每周感恩、周日感恩推送都拿掉了，老数据留着。设计：彩窗透光的淡紫到暖金光晕、角落很淡的十字、经文宋体加金色「」、金色分隔线。
- 每周的打卡项（面膜等 `when: 'week'`）：首页只在**周六晚上**出现（别的日子做过的那天也显示）。「明天要做」（2026-10-06）：睡前复盘单独一块，什么都能写；第二天早上那张清单顶上只提一句「今天要做：…」，不打勾、不算进度；做到没有只在第二天的睡前复盘问（`planDone`）。
- 读经（2026-10-15 用户说删掉）：读经卡、换一卷、统计 / 回顾 / 分析里的读经都去掉了；2026-10-24 老数据也删了（`migrate` 去掉 `days[].read/readBook`、`prayer.book/pos/next`）。不要再加回来。
- 和 ChatGPT 聊过的（2026-10-15，用户烦躁、心情有波动时会和 ChatGPT 聊，想留下来）：祷告页「难受的时候」上面一块（`chatsCard`：最近两段 + 记一段），`#/chats` 按月列、按心情挑、能搜，`#/chat/new` 先给一段 `CHAT_RECORD_PROMPT`（复制后回那次聊天发送，让 ChatGPT 把聊的整理成文字），长按复制贴回来；心情 `CHAT_MOODS` 可不选，「聊了什么」可不写。晚上祷告点「祷告完了」后弹一句「把今晚聊的记下来？」（`askRecordChat`，「不用了」就算了），记一段进 `#/chat/new?from=pray`，存 `from: 'pray'`，列表和详情标「晚上祷告」。`#/chat/:id` 看、复制、改、删（能撤销）。只存不分析：不进统计、回顾、「问问我的记录」，不发给 DeepSeek。
- 鼓励（用户要求「让我感到自信、有激励」）：首页每天一句（`CHEERS` / `CHEER_VERSES`）、做完一件事一句（`CHEER_ON`、`cheerNight` 按心情）、里程碑（`MILESTONE_TEXT`，首页祝贺 3 天）、状态不对轻轻提一句（`gentleNote`）。温和具体，不喊口号、不说教。
- 小记（`#/p`，首页右上角叶子图标）：单独 6 位密码，PBKDF2 哈希存 `settings.pin`，离开网站就锁。**这一页的文字（名字、按钮、勾选项、说明）都在 `private.ui`，公开代码里只有中性默认值（`P_DEFAULT`），不要把具体用途写进代码、提交说明或这份文件。** 只做中性记录和统计，不要「减少 / 坚持天数」之类；节奏只在这一页提，不推送；别的页面不出现（「问问我的记录」只在这一页开着锁时才带上它的数字）。忘了密码：在数据仓库里删掉 `settings.pin` 让用户重设。按周的任务、计时的一段时间和跟它相关的一切（2026-10-21 用户说全部删掉）都去掉了，不要再加回来。
- 生病（2026-10-24 用户说记了这么久没什么用，全部删掉）：生病模式、生病手册、首页「我不舒服」、「＋」里的生病、白天喝水 / 量体温推送、睡前推送「早点睡」、回顾和问问我的记录里的生病次数都去掉了；`migrate` 删掉 `sick`。换季（降温提醒）留着。不要再加回来。
- 活出自己（用户想摆脱唯唯诺诺、老好人，「活出我自己、清晰明了的人生」；他明确说不要功能，只要话）：每页最下面角落一句 `SELF_LINES`（`whisper`，按日期 + 页面挑，同一天不变；小记、`/low/go`、`/pray/go`、设置不放）。标准放在「真的、对的、我在乎的」，不是换一套外面给的规矩；不说教。回顾页也不放。
- 难受的时候（`#/low`、`#/low/go`，用户说「很关键」，平时不占地方）：祷告页最下面一行，心情低时首页提醒一行；一步一页：呼吸（吸 4 呼 6，6 次）→ 有多难受 1–10（9 以上马上给热线 `HOTLINES`）→ 哪一种（`LOW_KINDS`）→ 预案清单（`LOW_PLANS`，可改；`lowLessons` 说以前什么最管用）→ 给你的话（先自己写的 `low.notes`，再是心情 8 分以上那天写的 `goodDays`、经文 `LOW_VERSES`）→ 现在呢 + 哪些有用 → 存进 `low.log`。心情 8 分以上且两周没写过，首页请他写一句给难受时的自己。不推送、不进「问问我的记录」。
- 泡脚、每天一张照片（2026-10-16 用户要的）：晚上清单顺序 打水 → **泡脚**（每天泡，算进度，点一下 `soak: true`；右边「今晚不泡」= `'skip'`，也算做完了，和打扫卫生一样）→ 洗澡 → 护肤 → 睡前复盘 → 祷告。**今天的一张照片**不是清单里的一行，是睡前复盘页里的一块（`photoCard`，「明天要做」下面，用户 2026-10-16 说的）：`dayPhotoSheet` 选或拍一张，压到 1600 边 0.8 质量 + 400 边小图（`t-` 前缀），传到私有仓库 `photos/days/`，`days[日].photo`；选好就存，不用点「记好了」；不算进度。换 / 删会把原图和小图一起删。照片墙 `#/photos`（「生活」页「照片」）按月排。
- 打水（2026-10-15 改）：一天一桶，**早上不打**。中午那段一直有一行「打水」（开水房 11–13）；中午点「不打了」或 13 点过了还没打，晚上那段再出一行（17–19），中午那行变成虚线「中午不打了，晚上打」（`waterItem`、`fetchRows`）。老数据的 `am` / `{ mid, eve }` 由 `fetchState`（python 里 `fetch_state`）换算，`am: true` 也算打了。推送 `fetch_message`：今天没打、这一回没点不打了，就在刚开（11:05 / 17:05）和快关（12:20 / 18:20）各提醒一次。
- **导师找我（2026-10-25 用户要的）**：预测导师哪天会问进度。记录：被找了在「＋」里点「导师找我了」（`advisorSheet`：日子默认今天、可以改成以前补记，怎么找的 微信 / 当面 / 组会 / 电话 可不选，一天只算一次），`events` 里 `type: 'advisor'`；**不每天问**，没记的日子就是没找。模型 `js/advisor.js`（纯计算）：离散时间风险模型 = 贝叶斯逻辑回归，每天一行 x = [1, ln(离上次几天), 离上次几天/7, 周几 one-hot]，先验 β ~ N(0, 2²)、γ ~ N(0, 1)，拉普拉斯近似（牛顿法 + 海森逆），预测用 MacKay 近似 σ(μ/√(1+πs²/8))；不到 3 次不预测；没有随机数。可能 ≥ `ADVISOR_REMIND` 25%（用户定的；用户原想 40%，试算过 40% 一次都不会提醒）且今天没记：「今天」提醒一行（`alertRows`，点了去 `#/advisor`），早上 7:30–10:00 推送一次「导师今天可能会问进度（可能 N%）」（用户选的写清楚、带概率）。`tools/life_push.py` 的 `advisor_*` 是**同一个模型的 Python 版**，两边数要一样（`tests/test_push.py` 用 node 跑网页版对数），改一边就改另一边。提醒、推送、「?」说明里不写模型名（用户 2026-10-25 说的），方法只在「怎么算的」里。页面 `#/advisor`（入口「生活」页）：今天的可能、往后两周（假设在那之前都没被找）、记下的（能删）、「怎么算的」（公式、β、各个星期几的几率倍数）。用户 2026-10-25 给的以前的日子已经导入 life-data（日子只在数据仓库，不写进公开仓库）。Chronos-2 没用在这里：0/1 的稀疏事件不是它擅长的（和用户说过）。
- **状态预报（2026-10-26 用户要的）**：把今天的心情、精力预报成天气。模型 `js/forecast.js`（纯计算）：贝叶斯线性回归（正态-逆伽马共轭），心情、精力各一个，每个记了的日子一行 x = [1, 睡了几小时−7, 睡得怎样−3, 昨天的分, 昨天运动, 昨晚祷告, 今天下雨 ≥1mm, 大晴天 日照 ≥6h, 周末]，除常数项都减训练日子的平均，**不知道的（睡眠没记、天气查不到、往后几天）填 0 当是平时**；先验 τ² 常数 1、其余 0.25（σ² 单位），a₀ = 3、b₀ = 2·s₀²（心情 s₀ 1.5、精力 0.7）；只用最近 180 天。预测方差 σ̂²(1 + xᵀVx)，「低落的可能」= P(心情 ≤ 4)（正态，`normCdf` 用 A–S 7.1.26，Python 同一个公式）。天气按和自己平时比（z = (预测 − 平均)/标准差）：≥0.5 晴、≥0 晴间多云、≥−0.5 多云、≥−1 阴、更低或低落可能过半 小雨。心情记满 7 天才预报，21 天前只说天气「还在认识你」，不说分。**首页问候下面一张小卡**（`forecastCard`，7 天前不出现）：天气、心情几分左右 · 精力词、低落的可能；晚上记了心情「预报 · 实际」；没记睡眠「记了睡眠会更准」；阴 / 小雨时附一句（`forecastTip`，只从 `influences` 里自己的规律挑：睡够 7 小时、运动、祷告、计划做到，差得够多、两边各 ≥5 天才说，没有就不说）。页面 `#/forecast`（入口「生活」页）：大卡、往后 6 天（只靠星期几和天气预报）、准不准（最近 30 天每天只用那天以前的记录回测，平均差几分、差 1 分以内的比例、和「每天猜平时」比，折线 = 预报、点 = 实际）、怎么算的。天气：Open-Meteo `past_days=92&forecast_days=7` 的降水和日照，一天查一次存 `localStorage['life-fc-weather']`。**早上推送和导师合成一条**（用户定的）：`tools/life_push.py` 的 `morning_message`（7:30–10:00，`once("morning")`）先说「今天晴间多云，心情 7 分左右，精力还行」，导师可能 ≥ 25% 再加一句；`forecast_*` 是同一个模型的 Python 版（`tests/test_push.py` 用 node 对数），天气在 Actions 里现查（`fetch_weather`）。说明、推送里不写模型名。
- **心情问卷（2026-10-28 用户要的）**：`js/scales.js`（纯计算，题目逐字照已发表的中文版，出处写在文件头）。每周日一份 **DASS-21**（过去一周，抑郁 / 焦虑 / 压力各 7 题 × 2，0–42），每个月**最后一个周日**再加 **PSS-10**（过去一个月，4、5、7、8 题反向，0–40）和 **SWLS**（5–35），用户选的推荐方案。`scaleDue`：周日出现在「今天」（`scaleAlerts`），没填挂到周二（`SCALE_KEEP_DAYS`），再晚就作废不追；键 `w周一` / `m月份`（月份按那个周日算），每周的结果按**周日**归到哪个月（`scalesIn`）。`#/scale?k=` 一题一屏，点了就到下一题，能「上一题」，中途离开存在 `localStorage['life-scale-draft']` 接着填；填完只说一句，不当场给分数段。**分数段只放在「?」里**（`SCALE_HELP`，用户定的），页面上只写数字和「比上次高 / 低」。分数偏高（`scaleHigh`：DASS 任一项到中度，或 PSS ≥ 27）**只说「这几天多出去转转，走一走，放松一下」**（用户定的，不给热线、不说病名）：填完那页、「今天」里填完 3 天内一行（点了去想去的地方）、周 / 月回顾卡里。回顾周（`scaleWeekCard`）、月（`scaleMonthCard`）、分析（`scaleStatsCard`，最近 12 周走势）、全部问卷 `#/scales`。**进 DeepSeek**：`periodSummary` 带 `scales`，`summaryText` 加 `scalesText`（周报月报年报、复制给 ChatGPT），「问问我的记录」也带最近 60 天的；`LETTER_SYSTEM` 说不下诊断。推送：周日 19–22 点 `once("scale")` 一次「这周的问卷还没填」（`scale_message`，数据仓库定时周日 19:05 / 19:35，加上每天 20:07 那次），睡前那条周日还没填再带一句「问卷还没填」；`scale_due` 和网页 `scaleDue` 同一个规则（`tests/test_push.py` 用 node 对）。
- 打扫卫生（2026-10-15）：中午那段一行，`days[日].clean = true | 'skip'`，「不弄了」就是今天不弄了。
- 洗澡（2026-10-14 改）：不是每天，晚上那段有一行「洗澡」（不算进度）；点了（或底部「＋」）先弹「洗澡了吗」（`showerSheet`），顺便勾洗澡后的项，点「洗好了」才记，「取消」什么都不记，记了能撤销、也能在「今天记下的」里删。
- 换季：`settings.city` 有经纬度时用 Open-Meteo 查天气（每天一次存 localStorage，`seasonWarning`），首页写在天气标签下面一句小字（`wx-note`，左边一条琥珀色细线，不是可点的提醒行；日子说今天 / 明天 / 后天），睡前推送也加一句。
- 打开 ChatGPT（`chatgptButton`，祷告、想做到的事）：链接 `https://chatgpt.com/?prompt=<提示词>`——ChatGPT 的通用链接里根路径只认带 `prompt` / `q` 参数的，这样 iPhone 上直接打开 App 并带上提示词；同时悄悄复制一份，没带上就粘贴。
- 英语陪练（2026-10-15 用户说不要了）：页面、首页复习、统计、回顾、里程碑里的英语都去掉了；2026-10-24 老数据也删了（`english`、`english` 事件、`english-*` 里程碑）。不要再加回来。
- 咖啡奶茶茶（2026-10-24 用户说全部删掉）：「＋」里的「喝了一杯」、分析、回顾、问问我的记录里都去掉了，`migrate` 删掉 `drink` 事件和 `settings.drinkKinds`。不要再加回来。
- 想去的地方（`#/places`、`#/place/:id`，js/places.js）：新建时第一个框什么都能放（2026-10-06）：小红书 / 大众点评 / 美团 / 高德的分享、「店名 + 地址」、一句话；`parseShare` 只认小红书标题和别的 App 里括起来的店名，认不出就留空；「一键补全」（DeepSeek）（`findPlace(name, text)`，用户点了才问，链接不发）认出是哪里，给名字（名字是用户自己写的就不换）、类型、区、地址、高德坐标，有地址按地址定位。**不填人均、营业时间**（用户不要），`cleanCandidates` 只留已有的类型和区、离城市 80 公里以外的坐标不要；连锁店列出每一家，地图标号勾选，新建时勾几家就分开记几个；坐标是估计的，提示用户在地图上核对；地图是 Leaflet（`vendor/leaflet`，按需加载）+ 高德底图（不用密钥），坐标存高德坐标，手机定位用 `wgsToGcj` 转；按区（`settings.city.districts`）、足迹、去过可以打分写话放照片（压缩后存数据仓库 `photos/places/`）。周末去哪（`weekendPicks`）只从自己写的地方挑，周五到周日首页出现，周末下雨先推室内的，周五睡前推送也带上（python 里同样的规则 `weekend_picks`）。
- **点亮地图（2026-10-26 用户要的）**：「想去的地方」多一个「点亮」切换（列表 / 地图 / 点亮 / 按区 / 足迹）。主城区**只盖历下、市中、槐荫、天桥、历城五个区**（用户定的），边界和地铁站在 `js/jinan.js`（DataV 高德坐标、OSM 站点换成高德坐标，公开数据，生成脚本没留：要重做就重新下载 `370100_full.json` 和 Overpass 的 `route=subway`）。`js/fog.js`（纯计算）：本地等距投影，尖顶六边形对边 1 公里（`HEX_KM`），中心落在哪个区就算哪个区（约 2400 格）。点亮：想去的地方每次「去过了」→ 那一格 + 周围 6 格；「我在这」→ 只那一格（`lights: [{ id, day, at, lat, lng }]`，高德坐标，不在主城区也记）；地铁 → **只算进出过的站**（用户定的，路过不算），`metro: [{ id, day, at, from, to }]` 站名（换乘站几条线都算）。进度按区和主城区合计；地铁每条线 x/y，点开看站。地图：没亮的格子拼成一块紫色的雾（`.fog`，`fill-rule: nonzero` + 格子放大 1.04 倍 + `smoothFactor: 0`，不然格子间有缝），这台设备没看过的新亮格子（`localStorage['life-lit-seen']`）上面再盖一层慢慢散开（`.fog-new`，第一次打开不放）。开通的线：1、2、3、4、8 号线和 6 号线东段，以后开新线（6 号线西段）要加进 `jinan.js`。
- 分析（`#/stats`，js/stats.js、js/charts.js；2026-10-24 改版）：**是回顾的副页**——回顾页和分析页顶上都有「周 | 月 | 年 | 分析」切换（`lookTabs`），底栏亮「回顾」（`/stats`、`/report`、`/ask` 都算回顾），「生活」页不再有入口。从上到下：心情月历（`moodMonthCard`，越好越深 `m1`–`m5`，可以翻月）、走势（用户喜欢，别动）、作息（用户喜欢，别动）、一周里哪天状态好（`weekdayMood`，最近 90 天，某个星期几不到 2 次就空着）、规律（只有洗澡、运动）、什么在影响我（`influences`：做了 vs 没做，心情记满 21 天才给结论，天数少标「还不太可靠」；天气用 Open-Meteo 历史接口，花钱读账本）、最下面问问我的记录（周报月报年报的入口在回顾页）。去掉了：护肤完成率（和形象页重复）、计划完成率、生病前一周、咖啡奶茶茶。**科研不展示**：睡前复盘里科研那格照记（`did`），但分析、回顾里都不出现，回顾也不发给 DeepSeek（问问我的记录还带着）。问问我的记录 `#/ask`：DeepSeek 读最近 60 天，聊天只在内存。DeepSeek 密钥读物品档案仓库 `config/ai.json`。
- 想做到的事（`#/goals`、`#/goal/:id`，入口在「生活」页，2026-10-06）：写一句心愿 → 复制 `goalPrompt`（content.js）和 ChatGPT **语音**聊，说「整理一下」写固定格式小结 → 贴回来 → DeepSeek（`goalPlan`）拆成 2–4 阶段、每阶段 2–5 件能勾掉的小事、每周习惯、要买的东西（`buy.query` 搜索词）→ `applyGoalPlan` 存（重新整理时同样文字的事保留「做了」）。DeepSeek 带上物品档案（`goalInventory`：衣服鞋子写风格季节穿的次数备注，看不了照片；其他东西只写名字类别）和账本里没买的心愿。要买的：小红书 / 淘宝搜索链接；「放进心愿单」确认名字价格后直接提交到账本仓库 finance.json 的 `wishes`（`addLedgerWish`，记 `wishId`）。首页每个在做的目标一行进度（`goalLines`），周报有一张卡（`goalWeekCard`），做到了 3 天内首页里程碑（`goal-<id>` 记在 `milestones.seen`）。不推送。
- 身边的人（`#/people`、`#/person/:id`、`/new`、`/edit`，js/people.js，入口在「生活」页，2026-10-06）：只记名字（不记昵称、手机号、微信）；男 / 女必选（`sex`，页面上的他 / 她跟着变，`ta()`）；分组（`PEOPLE_GROUPS`）家人、亲戚、小学、初中、高中、本科、研究生，一个人可以在几档、第一个是主要的；关系 `rel`（家人亲戚写具体称呼，研究生写导师 / 师兄师姐 / 同门 / 同事……，`relChoices`）；生日公历或农历（`js/cal.js`，和账本同一份），年份可空，前一天和当天「今天」里一行；新建时写一段话「一键补全」（`personFromText`，DeepSeek 只填说到的）；来往时间线（`timeline`：自己记的 `log`、想去的地方里 `with` 他的、账本里的人情和钱）；「记成人情」/「记一个人情」直接提交账本 `favors`；「想想送什么」（`giftIdeas`）→ 小红书 / 淘宝搜索、放进账本心愿单（`kind: gift`，`targetDate` 下一次生日）；不再来往的归档不删（`archived`，列表最下面），因为以后聊天会提到。**不要**远近圈、关系打分、关系图、很久没联系提醒、周回顾里的来往（用户说的）。列表是头像墙（2026-10-06 用户选的，嫌一行一个太占地方、太呆）：圆里是名字最后一个字、按主要的档上色，下面写**全名**（不要简称），一行 5 个；上面一排切换全部 / 各档 / 还没分组 / 不再来往，人多了有「找人」；「全部」按主要的档分块（家人、亲戚、研究生、本科、高中、初中、小学），不再来往的淡淡放最后；7 天内过生日或有重要日子的头像上有小红点；辈分（`rankOf`：`rank` 没选过就按关系 `guessRank` 猜）导师 mentor / 领导 · 师长 leader / 长辈 elder / 同辈 peer / 晚辈 junior（老数据的 senior 按关系换成 leader 或 elder），「全部」最上面「导师」单独一块，每块里按辈分分行（只有一种辈分不写小标题），DeepSeek 也拿到辈分；更亲近的 `close` 头像多一圈金边、排在那一行前面（用户 2026-10-06 要的，不是打分，只有是 / 否）；不再来往在「全部」里收成一行（一叠小灰圆 + 人数），点了切到那一档。资料里先问「知道生日吗」，知道才展开（不知道记 `noBirthday`）。
- 选人（两个网站所有填人名的地方，`js/picker.js` 两边同一份）：输入一个字出补全（名字、`hint`「本科 · 舍友」都能搜），空着时出「最近」5 个，没有就「＋ 新加」；不要一大排人名按钮。`hint` 由 `syncPeople` 写进账本 people。和账本名单：`syncPeople` 打开时把账本里新加的人搬过来（还没分组，同名的认成同一个），名字和归档写到账本（`ledgerSync`）；账本那边不改名字。节假日人情（`peopleAlerts`）：放假前一天到假期结束，「今天」里问欠的人情这次还不还（写账本 `favors` 的 `plan` / `skip`，规则和账本 `holidayFavors` 一样）。改账本统一用 `updateLedger`；读账本缓存 5 分钟 `ledgerSnap`。
- 人情和关系（2026-10-06 第二批）：「我们的经历」`stages`（一段一段，`stagesFromTextSheet` 写一大段话 DeepSeek 按时间分段，只加不改已有的）；重要的日子 `dates`（婚礼乔迁满月……，前一天和当天「今天」一行，只写「明天：某某的婚礼」（2026-10-27 用户定的，以前来回送过多少 `giftSummary` 点进人的页面看，首页不放）；`yearly` 每年）；礼尚往来（`giftsWith`：账本 tx 的 `who` + 自己记的 `log.gift`）；怎么还人情（`repayIdeas`，请吃饭从「想去的地方」挑，`place` 只认清单里的 id）；过节问候（资料里 `greet` 勾元旦 / 春节 / 端午 / 中秋 / 教师节，`cal.js` 的 `festivalsAround`：节日前一天和当天「今天」一行 → `#/greet/:年-节` 一个个「起个头」（`greetDraft`，按关系和 `tone`「怎么称呼、怎么说话」调整语气）→ 复制 → 「发了」记 `greeted`）。发给 DeepSeek 的「这个人」统一用 `personContext`。要准备的钱：「记一个人情」和要随礼的日子有「他为我花了多少」「大概要准备多少」+「估一个」（`estimateFields`，`js/renqing.js` 和账本同一份）；要随礼、不是每年的日子同步成账本里一个有日子的人情（`syncDateFavor`，id `fd-日子id`，删了 / 不随礼了就拿掉没还的），账本按 300 分大小额算进日常或存款目标。
- 推送：`tools/life_push.py`（公开，规则可测：`tests/test_push.py`），数据仓库 `.github/workflows/push.yml` 每晚 22:31 / 22:43 / 22:57（睡前）、打水的时间、早上 7:35 / 8:05 / 8:35 / 9:15（状态预报 + 导师找我，一条）下载它运行（白天每 2 小时那几次原来是生病提醒，现在只看打水），`config/push-sent.json` 保证不重复；私钥在 life-data 的 secret `VAPID_PRIVATE_KEY`，公钥在 `js/push.js`（和账本、物品档案不是一对）。推送文字只写「睡前」「打水」这类看不出私事的话。**只在时间段里发**（2026-10-07：GitHub 定时实测晚 6 小时，凌晨三四点才跑）：睡前 21–23 点、打水按 `FETCH_REMIND`，不在时间段里就跳过、不记成发过（`once` / `in_window`）；定时和外部触发（workflow_dispatch）都按这个规则，只有测试推送不受限。pywebpush 固定 2.5.0。
- 「我的故事」的简介（2026-10-06）：`js/profile.js`（物品档案、账本、生活三边同一份）读 `story-data/profile.json`（一天一次，缓存 localStorage `story-profile`，读不到就不带），`js/ai.js` 的 `askJson` 每次都把它加在 system 后面（`withProfile`）。令牌要授权 story-data。
- 人的页面里「在我的故事里」（`storyCard` / `storySnap`）：读 `story-data/story.json` 里 `people` 带这个人的事和阶段（只读，存 5 分钟），点了打开 `../story/#/event/:id`。
- 提示（toast）一次只出一条，新的换掉旧的；底部有「撤销」时普通提示放在它上面（`.toast.raised`）。四个网站一样。

## 代码

- `js/life.js` 纯计算；`js/forecast.js` 状态预报、`js/advisor.js` 导师找我（都是纯计算，Python 版在推送脚本里）；`js/places.js` 想去的地方；`js/people.js` 身边的人；`js/cal.js` 节假日、农历、生日（和账本同一份）；`js/stats.js` 分析；`js/charts.js` SVG 图表；`js/ai.js` DeepSeek；`js/content.js` 写死的内容；`js/store.js`、`github.js`、`util.js`、`icons.js` 和账本同一套（先存手机、后台上传）；`js/main.js` 路由和页面。语法检查 `node --input-type=module --check < js/main.js`。
- `h()` 的子元素传数组没问题，但 `replaceChildren` 要展开（`...`）并去掉 null。

## 测试

- `python3 tests/test_app.py`：真浏览器 + 本地假 GitHub（同时有编的物品档案 `x/inventory-data`、账本 `test/finance-data`），天气、地图底图、DeepSeek 都是假的。`python3 tests/test_push.py`：推送规则。推送后 GitHub Actions 自动跑。**改了功能就加对应步骤。绝不拿真实数据仓库做写入测试。**

## 计划（分批做）

1. ✅ 骨架、今天、形象、祷告、小记、英语提示词、22:30 推送。
2. ✅ 鼓励的话和里程碑、生病模式、换季提醒、英语错句本表达本和复习、读经换卷（英语、读经后来都去掉了）。
3. ✅ 想去的地方（地图、按区、足迹、周末去哪）、分析（什么在影响我、走势、作息、规律、回顾、问问我的记录）；2026-10-24 分析挪到形象的副页并改版；同日「形象」改成「回顾」，生病整个删掉；2026-10-27 回顾照账本总结改成周 / 月 / 年。
4. 爱好：2026-10-06 聊过，用户决定不做。
- 首页提醒（2026-10-07）：`alertRows` 的几条合在一张卡里（`.alerts` 分组列表，行间细线），不再一条一张卡，每行前面的小点都是藤紫（2026-10-27 去掉了绿 / 红 / 琥珀）；「今天 洗澡 跑步…」那一行（`logLine`）是一张淡白卡片；分析和月回顾的压力记了不到 5 天只写一行，不画图（`stressChart`）；问候语一行写完（`clamp` 字号 + 不折行）。按下去的手感在 `app.css` 最后（四个网站同一段）。
