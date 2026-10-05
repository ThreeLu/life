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
  settings: { rhythmDays, checks, bibleVersion, sportKinds, drinkKinds, pin: { salt, iter, hash } },
  days: { 日期: { mood 1–10, note, energy 1–5, stress 1–5, did, plan, planDone: yes|part|no,
                  sleep: { bed, wake, q }, care: { 打卡项id: true }, prayer: { night: { at, mode, near, note, summary }, morning: { at } }, read: 诗篇序号 } },
  events: [{ id, day, at, type: shower|sport|drink|english|p|p2, kind?, minutes?, km?, level?, note?, mode?, topic?, score?, flag?, checks?: { c1, c2, c3 } }],
  look: { direction: [refined|bookish|clean|crisp], steps: { 步骤id: { status: learning|habit, since, habitAt } },
          routine: [{ id, step, name, when: am|pm|shower|week, times?, optional? }], products: { 物品档案id: { opened, verdict, note } }, hide: [物品档案id] },
  notes: [{ id, title, text, track, link, at }],
  periodic: [{ id, name, every, last }],
  weeks: { 周一日期: { skin: { score, tags }, thanks } },
  prayer: { stage: 1|2|3, since, about（ChatGPT 祷告提示词里的自我介绍）, items: [{ id, text, at, answered?, answerNote? }], next: 下一篇诗篇序号 },
  private: { supplies: [{ id, name, low? }], ui: { title, main, alt, score, flag, checks: { c1, c2, c3 }, checksTitle, help, … } } }
```

- **一天从凌晨 4 点开始**（`dayKey`）。周从周一开始，`weeks` 的键是周一。
- 形象路线图 `STEPS`（content.js）：护肤 / 化妆 / 气质三条线，开始学（`startStep`）把这一步的 `routine` 打卡项和 `periodic` 定期提醒加进来，不学了（`stopStep`）拿掉。学满 21 天、15 天以上做到 → 问「算养成了吗」（`readyForHabit`）。
- 「我的东西」读物品档案里「洗漱护肤」类的物品（只读），开封日期、好不好用存在 `look.products`。
- 祷告分 3 个阶段（`STAGES`），满 4 周问要不要进下一步（`stageReady`）。带着祷告 `#/pray/go?m=short|full|morning` 一步一页；主祷文、经文是新标点和合本（对照 Bible App 版本 48 核对过）。和 ChatGPT 祷告 / 英语陪练的提示词在 content.js（`prayerPrompt`、`englishPrompt`），网页填好当天的内容给用户复制。
- 读经：诗篇一天一篇（119 篇拆 4 天，`PSALMS`），链接到 bible.com（`settings.bibleVersion`，48 = 新标点和合本简体神版）。
- 小记（`#/p`，首页右上角叶子图标）：单独 6 位密码，PBKDF2 哈希存 `settings.pin`，离开网站就锁。**这一页的文字（名字、按钮、勾选项、说明）都在 `private.ui`，公开代码里只有中性默认值（`P_DEFAULT`），不要把具体用途写进代码、提交说明或这份文件。** 只做中性记录和统计，不要「减少 / 坚持天数」之类；节奏只在这一页提，不推送；别的页面不出现。忘了密码：在数据仓库里删掉 `settings.pin` 让用户重设。
- 推送：`tools/life_push.py`（公开，规则可测：`tests/test_push.py`），数据仓库 `.github/workflows/push.yml` 每晚 22:31 / 22:43 / 22:57 下载它运行，`config/push-sent.json` 保证一天一条；私钥在 life-data 的 secret `VAPID_PRIVATE_KEY`，公钥在 `js/push.js`（和账本、物品档案不是一对）。推送文字只写「睡前」这类看不出私事的话。

## 代码

- `js/life.js` 纯计算；`js/content.js` 写死的内容；`js/store.js`、`github.js`、`util.js`、`icons.js` 和账本同一套（先存手机、后台上传）；`js/main.js` 路由和页面。语法检查 `node --input-type=module --check < js/main.js`。
- `h()` 的子元素传数组没问题，但 `replaceChildren` 要展开（`...`）并去掉 null。

## 测试

- `python3 tests/test_app.py`：真浏览器 + 本地假 GitHub（同时有编的物品档案 `x/inventory-data`）。`python3 tests/test_push.py`：推送规则。推送后 GitHub Actions 自动跑。**改了功能就加对应步骤。绝不拿真实数据仓库做写入测试。**

## 计划（分批做）

1. ✅ 骨架、今天（睡眠、护肤打卡、洗澡运动喝的、睡前复盘、昨天的计划、定期打理、每周皮肤、一年前的今天）、形象（方向、路线图、我的东西、我学到的）、祷告（阶段、带着祷告、ChatGPT 提示词、祷告事项、每周安静时间、读经）、小记、英语提示词、22:30 推送。
2. 生病模式（感冒 / 发烧 / 肠胃 + 换季预防 + 生病手册，药从物品档案读，同成分别一起吃）、英语错句本表达本（贴回 ChatGPT 总结）、读经计划细化。
3. 想去的地方（本地为主、小红书粘贴、高德地图、按区看进度、周末推荐只从自己写的地方挑）、分析（影响状态的因素、作息、规律、周报月报年报、问问我的记录）。爱好以后再聊。
