# 生活 — 给 Claude Code 的说明

用户的个人生活记录网站（第三个，仿照账本 `../ledger`、物品档案 `../inventory`）。用中文交流。界面大白话，每页角落有「?」怎么用（`helpButton`），**不评判、不说教**，没做的那天就空着，不显示「连续 N 天」。

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
                  sleep: { bed, wake, q }, care: { 打卡项id: true }, prayer: { night: { at, mode, near, note, summary }, morning: { at } }, read, readBook } },
  events: [{ id, day, at, type: shower|sport|drink|english|p|p2, kind?, minutes?, km?, level?, note?, mode?, topic?, mistakes?, exprs?, score?, flag?, checks?: { c1, c2, c3 } }],
  look: { direction: [refined|bookish|clean|crisp], steps: { 步骤id: { status: learning|habit, since, habitAt } },
          routine: [{ id, step, name, when: am|pm|shower|week, times?, optional? }], products: { 物品档案id: { opened, verdict, note } }, hide: [物品档案id] },
  notes: [{ id, title, text, track, link, at }],
  periodic: [{ id, name, every, last }],
  weeks: { 周一日期: { skin: { score, tags }, thanks } },
  prayer: { stage: 1|2|3, since, about（ChatGPT 祷告提示词里的自我介绍）, items: [{ id, text, at, answered?, answerNote? }], next: 下一篇诗篇序号, book, pos: { 卷: 下一章序号 } },
  private: { supplies: [{ id, name, low? }], ui: { title, main, alt, score, flag, checks: { c1, c2, c3 }, checksTitle, help, programTitle, sessionStart, safety: [], aftercare: [], … },
             program: { start: 第一周周一, weeks: [{ title, intro, buy?, tasks: [{ id, track: a|b, text, level, note? }] }], pool: [任务 + from 第几周起], draw: 每次抽几张, scenes: [情景], rewards: [文字 | { text, unrule }], penalties: [惩罚], checks: [突击检查], checkEvery: [最少, 最多分钟], levels: [{ name, min, text }] }, rules: [{ id, text, at }], callNames: [称呼], custom: [任务], limits: [字],
             sessions: [{ id, day, start, end, minutes, week, tasks: { id: done|skip }, score, after, note }], media: [{ id, day, title, link, minutes, after, note }], minutes, latest, perWeek },
  sick: { current: null | { id, kind: cold|fever|gut|other, start, temps: [{ at, t }], meds: [{ at, item, name }], water: { 日期: 杯 }, done: { 日期: { 第几项: true } }, gut: { 日期: { d, v } }, suspects: [] },
          history: [同上 + end, how], plans: { kind: [一行一件事] }, meds: { 物品档案id: { dose, gapHours, perDay } }, clinic: { name, address, hours, phone, er } },
  english: { cards: [{ id, kind: mistake|expr, front, back, type?, cn?, at, due, level, seen }], next },
  milestones: { key: 日期, seen: { key: true } },
  places: [{ id, name, kind: spot|walk|shop|food|show|other, district, why, link, cost, season, want 1–3, lat, lng（高德坐标 GCJ-02）, at, visits: [{ id, day, score, note, photo? }] }],
  letters: { w周一 | m月份 | y年份: { at, text, research } } }
```

- **一天从凌晨 4 点开始**（`dayKey`）。周从周一开始，`weeks` 的键是周一。
- 形象路线图 `STEPS`（content.js）：护肤 / 化妆 / 气质三条线，开始学（`startStep`）把这一步的 `routine` 打卡项和 `periodic` 定期提醒加进来，不学了（`stopStep`）拿掉。学满 21 天、15 天以上做到 → 问「算养成了吗」（`readyForHabit`）。「喷香水」在化妆这条线（id 仍是 `g-scent`，老数据兼容）。
- 「我的东西」读物品档案里「洗漱护肤」类的物品（只读），开封日期、好不好用存在 `look.products`。
- 祷告分 3 个阶段（`STAGES`），满 4 周问要不要进下一步（`stageReady`）。带着祷告 `#/pray/go?m=short|full|morning` 一步一页；主祷文、经文是新标点和合本（对照 Bible App 版本 48 核对过）。和 ChatGPT 祷告 / 英语陪练的提示词在 content.js（`prayerPrompt`、`englishPrompt`），网页填好当天的内容给用户复制。
- 读经可以换卷（`BIBLE_BOOKS`、`readingToday`、`markRead`）：诗篇一天一篇（119 篇拆 4 天，进度 `prayer.next`），箴言按几号读第几章，其他一天一章（`prayer.pos`）。链接 bible.com（48 = 新标点和合本简体神版，`bibleVersionEn` 116 = NLT）。
- 鼓励（用户要求「让我感到自信、有激励」）：首页每天一句（`CHEERS` / `CHEER_VERSES`）、做完一件事一句（`CHEER_ON`、`cheerNight` 按心情）、「这周的你」只数做到的（`weekHighlights`）、里程碑（`MILESTONE_TEXT`，首页祝贺 3 天）、状态不对轻轻提一句（`gentleNote`）。温和具体，不喊口号、不说教。
- 小记（`#/p`，首页右上角叶子图标）：单独 6 位密码，PBKDF2 哈希存 `settings.pin`，离开网站就锁。**这一页的文字（名字、按钮、勾选项、说明）都在 `private.ui`，公开代码里只有中性默认值（`P_DEFAULT`），不要把具体用途写进代码、提交说明或这份文件。** 只做中性记录和统计，不要「减少 / 坚持天数」之类；节奏只在这一页提，不推送；别的页面不出现（「问问我的记录」只在这一页开着锁时才带上它的数字）。忘了密码：在数据仓库里删掉 `settings.pin` 让用户重设。这一页还有按周解锁的任务（`programWeek` / `weekTasks`，每周一换；超过最后一周就是最后一周 + 自己写的）和计时的一段时间 `#/p/s`（开始前安全提醒 → 任务一张一张做或跳过，含「绝对不要」里的字的任务不出现 → 收尾清单 + 感受），任务文字里 `{3-6}` 随机整数、`{甲|乙}` 随机选一个（`fillText`，同一次时间里不变）；每次开始抽一个情景；收尾有得分（做到的按强度 10/20/30），全做到抽奖励卡、跳过两张以上抽惩罚卡（可以不做）；任务可以带 `rule`（做到了加进规矩手册 `private.rules`），track 有 a / b / c（显示名 `ui.trackA/B/C`），`{称呼}` 换成 `private.callNames`、`{求}` 换成 `private.begs` 里随机一个（都是用户自己写的）；一段时间里可以开语音（浏览器中文朗读，建议耳机）、黑暗模式（body.dark-session），任务里出现「N 分钟 / N 秒」就有计时按钮，突击检查按 `checkEvery` 随机出现；等级按累计得分（`levels`）；以及 `privateNote`（这周次数超过 `perWeek`、最近几次结束后心情低、老超时 → 只在这一页轻轻提）。任务内容只写在私有仓库。
- 生病（`#/sick`、`#/sick/book`）：体温曲线（37.3 起问切发烧）、喝水 8 杯、预案打勾、什么时候去医院（`RED_FLAGS`，到了自动变红）、药从物品档案「药品急救」读（只读），`MED_KNOWLEDGE` 认成分：同成分 / 两种退烧药提醒、抗生素激素「医生判断」；用户自己抄说明书（`sick.meds`）算下次几点能吃。肠胃从账本读昨天今天吃的（只读）。好了进 `history`，之后 2 天恢复期。**只写常识，不替用户定剂量。**
- 换季：`settings.city` 有经纬度时用 Open-Meteo 查天气（每天一次存 localStorage，`seasonWarning`），睡前推送也加一句。
- 英语：贴回 ChatGPT「wrap up」总结（`parseSummary`）进错句本 / 表达本，`english.next` 写进下一次提示词；复习间隔 1/3/7/14/30/60 天（`reviewCard`）。
- 想去的地方（`#/places`、`#/place/:id`，js/places.js）：小红书分享文字解析（`parseShare`）；地图是 Leaflet（`vendor/leaflet`，按需加载）+ 高德底图（不用密钥），坐标存高德坐标，手机定位用 `wgsToGcj` 转；按区（`settings.city.districts`）、足迹、去过可以打分写话放照片（压缩后存数据仓库 `photos/places/`）。周末去哪（`weekendPicks`）只从自己写的地方挑，周五到周日首页出现，周末下雨先推室内的，周五睡前推送也带上（python 里同样的规则 `weekend_picks`）。
- 分析（`#/stats`，js/stats.js、js/charts.js）：什么在影响我（`influences`：做了 vs 没做，心情记满 21 天才给结论，天数少标「还不太可靠」；天气用 Open-Meteo 历史接口，花钱读账本），走势、作息、规律、护肤完成率、计划完成率、生病前一周。回顾 `#/report?k=week|month|year`：数字 + DeepSeek 写一段存 `letters`（月报加科研回顾）。问问我的记录 `#/ask`：DeepSeek 读最近 60 天，聊天只在内存。DeepSeek 密钥读物品档案仓库 `config/ai.json`。
- 推送：`tools/life_push.py`（公开，规则可测：`tests/test_push.py`），数据仓库 `.github/workflows/push.yml` 每晚 22:31 / 22:43 / 22:57（睡前）和白天 10–20 点每 2 小时（只在生病时：喝水、发烧量体温）下载它运行，`config/push-sent.json` 保证不重复；私钥在 life-data 的 secret `VAPID_PRIVATE_KEY`，公钥在 `js/push.js`（和账本、物品档案不是一对）。推送文字只写「睡前」「照顾自己」这类看不出私事的话。

## 代码

- `js/life.js` 纯计算；`js/places.js` 想去的地方；`js/stats.js` 分析；`js/charts.js` SVG 图表；`js/ai.js` DeepSeek；`js/content.js` 写死的内容；`js/store.js`、`github.js`、`util.js`、`icons.js` 和账本同一套（先存手机、后台上传）；`js/main.js` 路由和页面。语法检查 `node --input-type=module --check < js/main.js`。
- `h()` 的子元素传数组没问题，但 `replaceChildren` 要展开（`...`）并去掉 null。

## 测试

- `python3 tests/test_app.py`：真浏览器 + 本地假 GitHub（同时有编的物品档案 `x/inventory-data`、账本 `test/finance-data`），天气、地图底图、DeepSeek 都是假的。`python3 tests/test_push.py`：推送规则。推送后 GitHub Actions 自动跑。**改了功能就加对应步骤。绝不拿真实数据仓库做写入测试。**

## 计划（分批做）

1. ✅ 骨架、今天、形象、祷告、小记、英语提示词、22:30 推送。
2. ✅ 鼓励的话和里程碑、生病模式、换季提醒、英语错句本表达本和复习、读经换卷。
3. ✅ 想去的地方（地图、按区、足迹、周末去哪）、分析（什么在影响我、走势、作息、规律、回顾、问问我的记录）。
4. 爱好：还没和用户聊。
