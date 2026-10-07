"""端到端测试：真浏览器打开「生活」网页，连本地的假 GitHub（tests/fake_github.py），把主要功能走一遍。

    pip install playwright && python -m playwright install chromium
    python tests/test_app.py            # 全部
    python tests/test_app.py 祷告 小记    # 只跑名字里含这些字的步骤（前面的「开始记录」总会跑）

不联网、不需要令牌。失败时截图在 tests/artifacts/。测试里只用编的内容。
"""

import json
import re
import sys
import threading
import traceback
from datetime import datetime, timedelta
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

sys.path.insert(0, str(Path(__file__).parent))
from fake_github import FakeRepo, serve  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
ART = ROOT / "tests" / "artifacts"
APP_PORT, API_PORT = 8785, 8786
URL = f"http://127.0.0.1:{APP_PORT}/"
API = f"http://127.0.0.1:{API_PORT}"
REPO = "test/life-data"


def day_key(dt=None):
    """和网页一样：凌晨 4 点前算前一天"""
    return ((dt or datetime.now()) - timedelta(hours=4)).date().isoformat()


TODAY = day_key()
YESTERDAY = (datetime.fromisoformat(TODAY) - timedelta(days=1)).date().isoformat()

STEPS = []
LAST_AI = []  # 发给 DeepSeek 的请求（检查发了什么）


def step(name):
    def wrap(fn):
        STEPS.append((name, fn))
        return fn
    return wrap


class Ctx:
    def __init__(self, page, repo):
        self.page, self.repo = page, repo

    def data(self):
        # 修改是先存手机、后台上传的：等上传队列清空再读仓库
        self.page.wait_for_function(
            "() => { try { const q = JSON.parse(localStorage.getItem('life-queue')); return !q || !q.items.length; } catch { return true; } }",
            timeout=15000)
        return json.loads(self.repo.read("life.json"))

    def wait(self, check, what):
        for _ in range(60):
            try:
                if check(self.data()):
                    return
            except (KeyError, TypeError, IndexError):
                pass
            self.page.wait_for_timeout(200)
        raise AssertionError(f"等不到：{what}\n{json.dumps(self.data(), ensure_ascii=False)[:2000]}")

    def go(self, hash_):
        same = self.page.url == URL + hash_
        self.page.goto(URL + hash_)
        if same:
            self.page.reload()

    def write(self, mutate):
        """模拟另一台设备改了数据"""
        d = json.loads(self.repo.read("life.json"))
        mutate(d)
        self.repo.external_write("life.json", json.dumps(d, ensure_ascii=False).encode())

    def sheet(self):
        return self.page.locator(".sheet")

    def period(self, name):
        """首页按时间只展开现在这一段；别的时段点下面的按钮展开。返回那一段的清单"""
        card = self.page.locator(".card.period", has=self.page.locator("h3", has_text=name))
        if not card.count():
            self.page.locator(".other-p", has_text=name).click()
        expect(card).to_be_visible()
        return card


def events(d, type_):
    return [e for e in d["events"] if e["type"] == type_]


# ---------- 测试步骤 ----------

@step("开始记录：用物品档案的令牌连上，建好空记录")
def _(c):
    p = c.page
    p.goto(URL)
    p.evaluate(f"""() => {{
        localStorage.clear();
        localStorage.setItem('life-api-base', '{API}');
        localStorage.setItem('inventory-settings', JSON.stringify({{ repo: 'x/inventory-data', token: 'test-token' }}));
        localStorage.setItem('life-settings', JSON.stringify({{ repo: '{REPO}' }}));
    }}""")
    p.goto(URL)
    expect(p.get_by_role("heading", name="开始记录")).to_be_visible()
    p.get_by_role("button", name="开始", exact=True).click()
    expect(p.locator(".today-head")).to_be_visible()
    d = c.data()
    assert d["startDate"] == TODAY, d["startDate"]
    assert d["prayer"]["stage"] == 1
    expect(p.locator(".card.period").first).to_be_visible()


@step("形象：改打卡项（加、改名、删了可以撤销），打卡项进到今天")
def _(c):
    p = c.page
    c.go("#/look")
    expect(p.get_by_text("下一步可以是这个")).to_have_count(0)  # 没有路线图了
    def add(name, when):
        p.get_by_role("button", name="改打卡项").click()
        c.sheet().get_by_role("button", name="＋ 加一项").click()
        c.sheet().get_by_label("打卡项名字").fill(name)
        c.sheet().get_by_role("group", name="什么时候").get_by_role("button", name=when).click()
        c.sheet().get_by_role("button", name="好了").click()
    add("洗脸", "早上")
    add("洗脸", "晚上")
    add("身体乳", "洗澡后")
    c.wait(lambda d: [(r["name"], r["when"]) for r in d["look"]["routine"]] == [("洗脸", "am"), ("洗脸", "pm"), ("身体乳", "shower")], "加打卡项")
    # 改名字：写上用的什么
    p.get_by_role("button", name="改打卡项").click()
    c.sheet().get_by_role("button", name="改").first.click()
    c.sheet().get_by_label("打卡项名字").fill("洗脸（洗面奶甲）")
    c.sheet().get_by_role("button", name="好了").click()
    c.wait(lambda d: d["look"]["routine"][0]["name"] == "洗脸（洗面奶甲）", "改名")
    # 每周几次
    add("面膜", "每周")
    c.wait(lambda d: any(r["name"] == "面膜" and r["when"] == "week" and r["times"] == 1 for r in d["look"]["routine"]), "面膜")
    expect(p.locator(".care-rate", has_text="面膜")).to_contain_text("这周 0/1")
    # 删掉可以撤销
    p.get_by_role("button", name="改打卡项").click()
    c.sheet().locator(".event-row", has_text="面膜").get_by_role("button", name="改").click()
    c.sheet().get_by_role("button", name="删掉这项").click()
    c.wait(lambda d: not any(r["name"] == "面膜" for r in d["look"]["routine"]), "删面膜")
    p.get_by_role("button", name="撤销").click()
    c.wait(lambda d: any(r["name"] == "面膜" for r in d["look"]["routine"]), "撤销删面膜")
    # 今天：点早上的洗脸
    c.go("#/")
    am = c.period("早上")
    am.get_by_role("button", name="洗脸（洗面奶甲）").click()
    c.wait(lambda d: len(d["days"][TODAY]["care"]) == 1, "早上洗脸打卡")
    expect(c.period("早上").get_by_role("button", name="洗脸（洗面奶甲）")).to_have_attribute("aria-pressed", "true")
    # 再点一下取消
    c.period("早上").get_by_role("button", name="洗脸（洗面奶甲）").click()
    c.wait(lambda d: not d["days"][TODAY]["care"], "取消打卡")


@step("随手记：洗澡顺便问身体乳、运动、喝的（可以撤销）")
def _(c):
    p = c.page
    c.go("#/")
    p.get_by_role("button", name="记一下").click()
    c.sheet().get_by_role("button", name="洗澡").click()
    expect(c.sheet().get_by_text("洗完澡了")).to_be_visible()
    c.sheet().get_by_role("button", name="身体乳").click()
    c.sheet().get_by_role("button", name="好了").click()
    c.wait(lambda d: len(events(d, "shower")) == 1 and any(r["id"] in d["days"][TODAY]["care"] for r in d["look"]["routine"] if r["name"] == "身体乳"), "洗澡 + 身体乳")
    # 洗过澡：晚上多一行身体乳，晚上的洗脸划掉
    pm = c.period("晚上")
    expect(pm.locator(".mini.off")).to_have_text("洗脸 · 洗澡时洗过了")
    expect(pm.locator(".it.done", has_text="身体乳")).to_be_visible()
    p.get_by_role("button", name="记一下").click()
    c.sheet().get_by_role("button", name="运动").click()
    c.sheet().get_by_role("button", name="跑步").click()
    c.sheet().get_by_label("多少分钟").fill("30")
    c.sheet().get_by_label("多少公里").fill("3.5")
    c.sheet().get_by_role("button", name="适中").click()
    c.sheet().get_by_role("button", name="记好了").click()
    c.wait(lambda d: events(d, "sport") and events(d, "sport")[0]["km"] == 3.5, "跑步")
    e = events(c.data(), "sport")[0]
    assert e["minutes"] == 30 and e["level"] == "mid" and e["kind"] == "跑步", e
    expect(p.get_by_text("跑步 · 30 分钟 · 3.5 公里 · 适中")).to_be_visible()
    p.get_by_role("button", name="记一下").click()
    c.sheet().get_by_role("button", name="喝了一杯").click()
    c.sheet().get_by_role("button", name="咖啡").click()
    c.wait(lambda d: len(events(d, "drink")) == 1, "咖啡")
    p.get_by_role("button", name="撤销").click()
    c.wait(lambda d: len(events(d, "drink")) == 0, "撤销咖啡")
    # 中间的「＋」
    p.get_by_role("button", name="记一下").click()
    c.sheet().get_by_role("button", name="喝了一杯").click()
    c.sheet().get_by_role("button", name="茶", exact=True).click()
    c.wait(lambda d: events(d, "drink") and events(d, "drink")[0]["kind"] == "茶", "茶")


@step("睡眠：用「＋」记几点睡几点起")
def _(c):
    p = c.page
    c.go("#/")
    p.get_by_role("button", name="记一下").click()
    c.sheet().get_by_role("button", name="睡眠").click()
    c.sheet().get_by_label("几点睡").fill("23:40")
    c.sheet().get_by_label("几点起").fill("07:30")
    c.sheet().get_by_role("button", name="不错").click()
    c.sheet().get_by_role("button", name="记好了").click()
    c.wait(lambda d: d["days"][TODAY]["sleep"] == {"bed": "23:40", "wake": "07:30", "q": 4}, "睡眠")
    expect(c.period("早上").get_by_text("7 小时 50 分")).to_be_visible()


@step("睡前复盘：心情、一句话、科研；明天首页问计划做到没有")
def _(c):
    p = c.page
    c.go("#/night")
    p.get_by_role("group", name="心情").get_by_role("button", name="7", exact=True).click()
    p.get_by_role("group", name="精力").get_by_role("button", name="不错").click()
    p.get_by_role("group", name="压力").get_by_role("button", name="有点大").click()
    p.get_by_label("今天的一句话").fill("测试的一天，还不错")
    p.get_by_label("今天科研做了什么").fill("读了一篇论文")
    p.get_by_label("明天要做什么").fill("写完第三节")
    p.get_by_role("button", name="记好了").click()
    c.wait(lambda d: d["days"][TODAY].get("plan") == "写完第三节", "复盘")
    r = c.data()["days"][TODAY]
    assert (r["mood"], r["energy"], r["stress"], r["note"], r["did"]) == (7, 4, 4, "测试的一天，还不错", "读了一篇论文"), r
    expect(p.get_by_text("接下来")).to_be_visible()
    expect(p.get_by_role("link", name="去祷告")).to_be_visible()
    # 昨天写的计划：今天首页问
    c.write(lambda d: d["days"].setdefault(YESTERDAY, {}).update(plan="编的计划乙"))
    c.go("#/")
    p.reload()
    am = c.period("早上")
    expect(am.get_by_text("编的计划乙")).to_be_visible()
    am.get_by_role("button", name="一部分").click()
    c.wait(lambda d: d["days"][TODAY].get("planDone") == "part", "计划做了一部分")
    expect(c.period("晚上").get_by_text("心情 7 · 测试的一天，还不错")).to_be_visible()


@step("祷告：和 ChatGPT 一起（复制提示词、祷告完了），一天可以很多次；晚上那次念主祷文；不用写字；只显示最近一天")
def _(c):
    p = c.page
    c.write(lambda d: d["days"].setdefault(YESTERDAY, {}).update(prayer={"times": [{"at": YESTERDAY + "T21:00:00.000Z", "kind": "quick"}]}))
    c.go("#/pray")
    p.reload()
    hero = p.locator(".pray-hero")
    expect(hero.locator(".pray-verse")).to_be_visible()
    expect(hero.get_by_role("link", name="开始祷告")).to_be_visible()
    expect(p.locator(".pray-recent")).to_contain_text("祷告了 1 次")  # 今天还没有，显示昨天
    expect(p.locator("textarea")).to_have_count(0)
    # 随时的：几分钟
    c.go("#/pray/go?m=quick")
    p.get_by_role("button", name="复制").click()
    prompt = p.evaluate("navigator.clipboard.readText()")
    assert "简短的祷告" in prompt and "和合本" in prompt and "不用写小结" in prompt, prompt
    expect(p.get_by_role("link", name="打开 ChatGPT")).to_have_attribute("href", "https://chatgpt.com/")
    p.get_by_role("button", name="祷告完了").click()
    p.wait_for_function("location.hash === '#/pray'")
    c.wait(lambda d: [x["kind"] for x in d["days"][TODAY]["prayer"]["times"]] == ["quick"], "随时的祷告")
    assert "night" not in c.data()["days"][TODAY]["prayer"]
    # 晚上那次：祷告完了 → 主祷文 → 阿们
    c.go("#/pray/go?m=night")
    p.wait_for_timeout(400)
    p.screenshot(path=ART / "pray-go.png", full_page=True)
    p.get_by_role("button", name="复制").click()
    prompt = p.evaluate("navigator.clipboard.readText()")
    assert "主祷文我最后自己念" in prompt and "今晚" in prompt, prompt
    p.get_by_role("button", name="祷告完了").click()
    lines = p.locator(".lords-lines .pray-line")
    expect(lines).to_have_count(8)
    expect(lines.first).to_have_text("我们在天上的父：")
    expect(lines.last).to_have_text(re.compile("阿们！$"))
    p.wait_for_timeout(400)
    p.screenshot(path=ART / "pray-lords.png", full_page=True)
    p.get_by_role("button", name="阿们").click()
    p.wait_for_function("location.hash === '#/pray'")
    c.wait(lambda d: d["days"][TODAY]["prayer"].get("night", {}).get("mode") == "chatgpt", "晚上的祷告")
    assert [x["kind"] for x in c.data()["days"][TODAY]["prayer"]["times"]] == ["quick", "night"]
    recent = p.locator(".pray-recent")
    expect(recent).to_contain_text("今天")
    expect(recent).to_contain_text("祷告了 2 次")
    expect(recent).to_contain_text("晚上 · 主祷文")
    expect(p.get_by_text("第 1 阶段")).to_have_count(0)
    p.wait_for_timeout(400)
    p.screenshot(path=ART / "pray.png", full_page=True)


@step("读经：今天读诗篇第 1 篇，点读了")
def _(c):
    p = c.page
    c.go("#/pray")
    expect(p.get_by_text("今天：诗篇第 1 篇")).to_be_visible()
    assert p.get_by_role("link", name="打开 Bible App").get_attribute("href") == "https://www.bible.com/bible/48/PSA.1"
    p.get_by_role("button", name="读了").click()
    c.wait(lambda d: d["prayer"]["next"] == 1 and d["days"][TODAY]["read"] == 0, "读经")
    expect(p.get_by_text("下一次：诗篇第 2 篇")).to_be_visible()
    # 换成箴言：几号读第几章；诗篇读到哪还记着
    p.get_by_role("button", name="换一卷").click()
    c.sheet().get_by_role("button", name="箴言").click()
    c.sheet().get_by_role("checkbox").check()
    c.sheet().get_by_role("button", name="好了").click()
    c.wait(lambda d: d["prayer"]["book"] == "PRO" and d["settings"]["bibleVersionEn"] == 116, "换箴言")
    dom = int(TODAY[8:])
    expect(p.get_by_text("今天读过了 ✓")).to_be_visible()  # 今天已经读过诗篇
    assert p.get_by_role("link", name="英文版").get_attribute("href") == f"https://www.bible.com/bible/116/PRO.{dom}"


@step("小记：设密码、记一次、三项勾选、锁上再解锁；文字从数据里读")
def _(c):
    p = c.page
    c.go("#/")
    p.get_by_role("link", name="小记").click()
    expect(p.get_by_text("给这一页设一个密码")).to_be_visible()
    p.get_by_label("密码").fill("123456")
    p.get_by_label("再输一遍").fill("123456")
    p.get_by_role("button", name="好").click()
    expect(p.get_by_role("heading", name="小记")).to_be_visible()
    d = c.data()
    assert d["settings"]["pin"]["hash"] and "123456" not in json.dumps(d), d["settings"]
    # 这一页的文字在私有数据里（这里用编的）
    c.write(lambda d: d["private"].update(ui={"title": "编的标题", "main": "编的按钮", "alt": "编的另一种", "checks": {"c1": "勾甲", "c2": "勾乙", "c3": "勾丙"}, "checksTitle": "编的勾选"}))
    p.reload()
    p.get_by_label("密码").fill("123456")
    expect(p.get_by_role("heading", name="编的标题")).to_be_visible()
    expect(p.get_by_text("还没有记录")).to_be_visible()
    p.get_by_role("button", name="编的按钮").click()
    c.sheet().get_by_role("group", name="评分").get_by_role("button", name="4").click()
    c.sheet().get_by_role("button", name="是", exact=True).click()
    c.sheet().get_by_role("button", name="记好了").click()
    expect(c.sheet().get_by_role("heading", name="编的勾选")).to_be_visible()
    for k in ["勾甲", "勾乙", "勾丙"]:
        c.sheet().get_by_role("button", name=k).click()
    c.sheet().get_by_role("button", name="好了").click()
    c.wait(lambda d: events(d, "p") and events(d, "p")[0].get("checks", {}).get("c3"), "小记 + 勾选")
    e = events(c.data(), "p")[0]
    assert e["score"] == 4 and e["flag"] is True and e["checks"] == {"c1": True, "c2": True, "c3": True}, e
    expect(p.get_by_text("距离上次 1 小时")).to_be_visible()
    expect(p.get_by_text("编的勾选 ✓")).to_be_visible()
    p.get_by_role("button", name="编的另一种").click()
    c.wait(lambda d: len(events(d, "p2")) == 1, "另一种")
    # 其他页面看不到
    c.go("#/history")
    expect(p.locator("main")).not_to_contain_text("编的")
    # 锁上：要输密码
    c.go("#/p")
    p.get_by_role("button", name="锁上").click()
    c.go("#/p")
    expect(p.get_by_text("输入密码")).to_be_visible()
    p.get_by_label("密码").fill("654321")
    expect(p.get_by_text("密码不对")).to_be_visible()
    p.get_by_label("密码").fill("123456")
    expect(p.get_by_role("heading", name="编的标题")).to_be_visible()
    p.get_by_label("新的用品").fill("编的用品")
    p.get_by_label("新的用品").locator("..").get_by_role("button", name="加", exact=True).click()
    c.wait(lambda d: d["private"]["supplies"][0]["name"] == "编的用品", "用品")


@step("小记：按周解锁的任务、开始一段时间（安全提醒、一张一张做或跳过、绝对不要的不出现、收尾）、音频记录、超过一周一次轻轻提")
def _(c):
    p = c.page
    mon = (datetime.fromisoformat(TODAY) - timedelta(days=datetime.fromisoformat(TODAY).weekday())).date().isoformat()
    def seed(d):
        d["private"]["program"] = {"start": mon, "weeks": [
            {"title": "编的第一周", "intro": "编的介绍", "buy": {"name": "编的东西", "price": "¥10"}, "tasks": [
                {"id": "t1", "track": "a", "text": "编的任务一 {3-3} 次，{只有这个}", "level": 1},
                {"id": "t2", "track": "b", "text": "编的任务二（含忌讳词）", "level": 2},
                {"id": "t3", "track": "b", "text": "编的任务三", "level": 1, "note": "编的安全提示"}]},
            {"title": "编的第二周", "tasks": [{"id": "t4", "track": "a", "text": "编的任务四"}]}],
            "pool": [{"id": "p1", "track": "b", "text": "编的池子任务", "from": 1}, {"id": "p2", "track": "b", "text": "编的以后才有", "from": 5}], "draw": 1,
            "scenes": ["编的情景 {甲|甲}"], "rewards": ["编的奖励"], "penalties": ["编的惩罚"]}
        d["private"]["limits"] = ["忌讳词"]
        d["private"]["ui"].update(sessionStart="编的开始", safety=["编的安全一"], aftercare=["编的收尾一", "编的收尾二"])
    c.write(seed)
    c.go("#/p")
    p.reload()
    p.get_by_label("密码").fill("123456")
    expect(p.locator(".program")).to_contain_text("第 1 周 / 2")
    expect(p.locator(".program")).to_contain_text("编的第一周")
    expect(p.locator(".program")).to_contain_text("这周可以买：编的东西")
    expect(p.locator("main")).not_to_contain_text("编的任务一")  # 开始以后才出现
    p.get_by_role("link", name="编的开始").click()
    expect(p.get_by_text("编的安全一")).to_be_visible()
    expect(p.get_by_text("忌讳词")).to_be_visible()
    p.get_by_role("button", name="准备好了").click()
    expect(p.locator(".task-text")).to_have_text("编的情景 甲")
    p.get_by_role("button", name="开始", exact=True).click()
    expect(p.locator(".task-text")).to_have_text("编的任务一 3 次，{只有这个}")
    p.get_by_role("button", name="做到了").click()
    expect(p.locator(".task-text")).to_have_text("编的池子任务")  # 从任务池抽的（第 5 周以后的不会抽到），含「绝对不要」的跳过了
    p.get_by_role("button", name="做到了").click()
    expect(p.locator(".task-text")).to_have_text("编的任务三")
    expect(p.get_by_text("编的安全提示")).to_be_visible()
    p.get_by_role("button", name="跳过").click()
    expect(p.get_by_text("收尾", exact=True)).to_be_visible()
    expect(p.locator(".big-num")).to_have_text("20")  # 做到的两张，各 1 级
    expect(p.get_by_text("编的奖励")).to_have_count(0)  # 有跳过就没有奖励
    expect(p.get_by_text("编的惩罚")).to_have_count(0)  # 只跳过一张，没有惩罚
    p.get_by_role("button", name="编的收尾一").click()
    p.get_by_role("group", name="结束后的心情").get_by_role("button", name="不错").click()
    p.get_by_role("checkbox").check()
    p.get_by_role("button", name="结束").click()
    c.wait(lambda d: d["private"]["sessions"], "一段时间")
    ss = c.data()["private"]["sessions"][0]
    assert ss["tasks"] == {"t1": "done", "p1": "done", "t3": "skip"} and ss["after"] == 4 and ss["week"] == 1 and ss["points"] == 20 and ss["scene"] == "编的情景 甲", ss
    assert any(e.get("session") == ss["id"] for e in c.data()["events"]), "也记一次"
    expect(p.locator(".card", has_text="（最近）")).to_contain_text("任务 2/3")
    # 音频
    p.get_by_role("button", name="＋ 记一个").click()
    c.sheet().get_by_label("名字").fill("编的音频")
    c.sheet().get_by_label("多少分钟").fill("20")
    c.sheet().get_by_role("button", name="不错").click()
    c.sheet().get_by_role("button", name="记好了").click()
    c.wait(lambda d: d["private"]["media"] and d["private"]["media"][0]["minutes"] == 20, "音频")
    # 这周第二次：轻轻提
    c.write(lambda d: d["private"]["sessions"].append({**d["private"]["sessions"][0], "id": "ss2"}))
    p.reload()
    p.get_by_label("密码").fill("123456")
    expect(p.get_by_text("这周已经是第 2 次了")).to_be_visible()
    # 别的地方都看不到
    c.go("#/stats")
    expect(p.locator("main")).not_to_contain_text("编的")


@step("小记：语音和计时、规矩手册（做到了加规矩）、突击检查、称呼、等级、黑暗模式")
def _(c):
    p = c.page
    mon = (datetime.fromisoformat(TODAY) - timedelta(days=datetime.fromisoformat(TODAY).weekday())).date().isoformat()
    def seed(d):
        d["private"]["program"] = {"start": mon, "weeks": [{"title": "编的周", "tasks": [
            {"id": "k1", "track": "c", "text": "{称呼}，保持 2 秒，{求}", "level": 1, "rule": "编的规矩甲"},
            {"id": "k2", "track": "b", "text": "编的第二张", "level": 2}]}],
            "checks": ["编的突击命令"], "checkEvery": [0.1, 0.1],
            "levels": [{"name": "编的一级", "min": 0}, {"name": "编的二级", "min": 30, "text": "编的升级仪式"}],
            "rewards": [{"text": "编的奖励撤规矩", "unrule": True}]}
        d["private"]["callNames"] = ["编的称呼"]
        d["private"]["begs"] = ["编的求"]
        d["private"]["sessions"] = []
        d["private"]["ui"]["trackC"] = "编的宠物"
    c.write(seed)
    c.go("#/p")
    p.reload()
    # 有时候还开着锁（同一个标签页里），有密码框才填
    lock = p.get_by_label("密码")
    p.locator(".card", has_text="规矩手册").or_(lock).first.wait_for()
    if lock.count():
        lock.fill("123456")
    expect(p.locator(".card", has_text="规矩手册")).to_contain_text("编的一级 · 0 分")
    p.get_by_role("link", name="编的开始").click()
    p.get_by_role("checkbox", name="黑暗模式（关灯，只听口令）").check()
    p.get_by_role("button", name="准备好了").click()
    expect(p.locator("body.dark-session")).to_have_count(1)
    # 突击检查（测试里间隔设成 6 秒）
    expect(p.locator(".check-card")).to_contain_text("编的突击命令", timeout=12000)
    p.get_by_role("button", name="做到了").click()
    expect(p.locator(".task-text")).to_have_text("编的称呼，保持 2 秒，编的求")
    expect(p.locator(".task-card")).to_contain_text("编的宠物")
    expect(p.get_by_text("这条会加进规矩手册：编的规矩甲")).to_be_visible()
    p.get_by_role("button", name="开始计时").click()
    expect(p.get_by_role("button", name="停", exact=True)).to_be_visible()
    expect(p.get_by_role("button", name="开始计时")).to_be_visible(timeout=4000)  # 2 秒到了，计时器回到开始
    p.get_by_role("button", name="做到了").click()
    c.wait(lambda d: d["private"].get("rules") and d["private"]["rules"][0]["text"] == "编的规矩甲", "加规矩")
    for _ in range(6):  # 剩下的任务和随时可能来的突击检查
        if p.get_by_text("收尾", exact=True).count():
            break
        p.get_by_role("button", name="做到了").click()
        p.wait_for_timeout(300)
    expect(p.get_by_text("收尾", exact=True)).to_be_visible()
    expect(p.get_by_text("升级了")).to_be_visible()
    expect(p.get_by_text("编的升级仪式")).to_be_visible()
    expect(p.get_by_text("编的奖励撤规矩")).to_be_visible()
    p.get_by_role("button", name="撤销一条规矩").click()
    c.sheet().get_by_role("button", name="编的规矩甲").click()
    c.wait(lambda d: not d["private"]["rules"], "撤销规矩")
    p.get_by_role("button", name="结束").click()
    c.wait(lambda d: d["private"]["sessions"] and d["private"]["sessions"][0]["checks"] >= 1, "突击检查记下来")
    expect(p.locator("body.dark-session")).to_have_count(0)
    # 称呼可以自己加、删
    p.get_by_label("新的称呼").fill("编的第二个称呼")
    p.get_by_label("新的称呼").locator("..").get_by_role("button", name="加", exact=True).click()
    c.wait(lambda d: d["private"]["callNames"] == ["编的称呼", "编的第二个称呼"], "称呼")
    # 语音设置：语速音调存在这台设备上
    p.get_by_label("语速").fill("0.8")
    p.get_by_label("语速").dispatch_event("change")
    p.get_by_role("button", name="试听").click()
    assert p.evaluate("JSON.parse(localStorage.getItem('life-voice')).rate") == 0.8


@step("打水：中午那回点了、晚上那回不打了（有清单的时段才显示）")
def _(c):
    p = c.page
    c.go("#/")
    noon = c.period("中午")
    row = noon.locator(".it", has_text="打水")
    row.locator(".it-main").click()
    c.wait(lambda d: d["days"][TODAY].get("fetch") == {"mid": True}, "打水")
    expect(c.period("中午").locator(".it.done", has_text="打水")).to_be_visible()
    hour = p.evaluate("new Date().getHours()")
    if 4 <= hour < 19:
        c.period("晚上").locator(".it", has_text="打水").get_by_role("button", name="不打了").click()
        c.wait(lambda d: d["days"][TODAY].get("fetch") == {"mid": True, "eve": "skip"}, "晚上不打了")
        expect(c.period("晚上").locator(".it.skipped", has_text="今天不打了")).to_be_visible()


@step("定期打理：到日子出现在今天，点做了；前一天预告；入口在「生活」")
def _(c):
    p = c.page
    c.go("#/")
    p.locator(".alert-line", has_text="剪指甲").click()  # 好几件该做了：一行，点进定期打理
    p.locator(".per-row", has_text="剪指甲").get_by_role("button", name="做了").click()
    c.wait(lambda d: next(x for x in d["periodic"] if x["id"] == "pd-nails")["last"] == TODAY, "剪指甲")
    c.go("#/periodic")
    p.get_by_role("button", name="＋ 加一项").click()
    c.sheet().get_by_label("名字").fill("编的打理")
    c.sheet().get_by_label("几天一次").fill("10")
    c.sheet().get_by_role("button", name="好了").click()
    c.wait(lambda d: any(x["name"] == "编的打理" and x["every"] == 10 for x in d["periodic"]), "加定期")
    # 前一天先说一声；其他时候不出现；入口在「生活」里，不在形象页
    p.locator(".per-row", has_text="编的打理").locator(".per-main").click()
    c.sheet().get_by_label("上次做").fill((datetime.fromisoformat(TODAY) - timedelta(days=9)).date().isoformat())
    c.sheet().get_by_role("button", name="好了").click()
    c.wait(lambda d: next(x for x in d["periodic"] if x["name"] == "编的打理")["last"], "改上次")
    c.go("#/")
    expect(p.locator(".alert-line", has_text="明天该编的打理了")).to_be_visible()
    expect(p.locator(".alert-line", has_text="剪指甲")).to_have_count(0)
    c.go("#/more")
    expect(p.get_by_role("link", name="定期打理")).to_be_visible()
    c.go("#/look")
    expect(p.locator(".section-title", has_text="定期打理")).to_have_count(0)


@step("形象：这个月做了什么（护肤做完几天、月历、每一项做到多少）；护肤品开封多久、快用完了进物品档案购物清单")
def _(c):
    p = c.page
    c.go("#/look")
    expect(p.locator(".stat", has_text="护肤做完")).to_be_visible()
    expect(p.locator(".month-grid")).to_be_visible()
    expect(p.locator(".care-rate", has_text="洗脸（洗面奶甲）")).to_be_visible()
    expect(p.get_by_text("我学到的")).to_have_count(0)
    expect(p.get_by_text("我的方向")).to_have_count(0)
    expect(p.locator(".whisper")).to_have_count(0)  # 形象页不放角落那句话
    p.get_by_role("button", name="编的洗面奶").click()
    c.sheet().get_by_label("开封日期").fill((datetime.fromisoformat(TODAY) - timedelta(days=350)).date().isoformat())
    c.sheet().get_by_role("button", name="好用").click()
    c.sheet().get_by_role("button", name="好了").click()
    c.wait(lambda d: d["look"]["products"].get("inv-1", {}).get("verdict") == "good", "护肤品")
    assert "pao" not in c.data()["look"]["products"]["inv-1"]  # 默认 12 个月不存
    expect(p.locator(".product-row", has_text="编的洗面奶")).to_contain_text("快到时间了")
    expect(p.locator("main")).not_to_contain_text("编的零食")  # 不是洗漱护肤类的不显示
    # 快用完了 → 物品档案里标上（进购物清单）
    p.get_by_role("button", name="编的洗面奶").click()
    c.sheet().get_by_role("button", name="快用完了 → 放进购物清单").click()
    expect(p.locator(".product-row", has_text="编的洗面奶")).to_contain_text("在购物清单上")
    it = next(i for i in json.loads(INVENTORY.read("inventory.json"))["items"] if i["id"] == "inv-1")
    assert it.get("runningLow") == TODAY, it


@step("英语陪练：复制提示词、练完了记一次")
def _(c):
    p = c.page
    c.go("#/english")
    box = p.get_by_label("英语提示词").input_value()
    assert "Today's mode: Chat" in box and "wrap up" in box, box[:200]
    p.get_by_role("button", name="美国生活").click()
    assert "Today's mode: Life in the US" in p.get_by_label("英语提示词").input_value()
    p.get_by_role("button", name="复制").click()
    p.get_by_role("button", name="只记练了一次").click()
    c.wait(lambda d: events(d, "english") and events(d, "english")[0]["mode"] == "us", "英语")
    expect(p.get_by_text("这周练了 1 次")).to_be_visible()


@step("最近的记录：看以前某一天、补记")
def _(c):
    p = c.page
    c.go("#/history")
    p.get_by_role("link", name="昨天").first.click()
    expect(p.get_by_role("heading", name="昨天")).to_be_visible()
    c.period("中午").get_by_role("button", name="洗澡").click()
    c.sheet().get_by_role("button", name="待会儿再说").click()
    c.wait(lambda d: any(e["day"] == YESTERDAY for e in events(d, "shower")), "补记昨天洗澡")


@step("两台设备：另一台刚改过，这台的修改合并进去")
def _(c):
    p = c.page
    c.go("#/")
    c.write(lambda d: d["notes"].append({"id": "n-other", "title": "别的设备记的", "text": "", "track": None, "link": "", "at": TODAY}))
    p.get_by_role("button", name="记一下").click()
    c.sheet().get_by_role("button", name="喝了一杯").click()
    c.sheet().get_by_role("button", name="奶茶").click()
    c.wait(lambda d: any(e.get("kind") == "奶茶" for e in d["events"]) and any(n["id"] == "n-other" for n in d["notes"]), "合并")


@step("做完一句短话、第一次做完一天护肤有里程碑（一行提醒）、圆满章")
def _(c):
    p = c.page
    c.go("#/")
    d = c.data()
    am = [r for r in d["look"]["routine"] if r["when"] == "am" and not r.get("optional")]
    pm = [r for r in d["look"]["routine"] if r["when"] == "pm" and not r.get("optional")]
    care = d["days"][TODAY].get("care", {})
    for r in am:
        if not care.get(r["id"]):
            c.period("早上").get_by_role("button", name=r["name"]).click()
            c.wait(lambda d, r=r: d["days"][TODAY]["care"].get(r["id"]), "早上打卡")
    expect(p.get_by_text("早上的护肤好了。")).to_be_visible()
    for r in pm:
        btn = c.period("晚上").get_by_role("button", name=r["name"], exact=True)
        if btn.count():  # 洗过澡的晚上，洗脸划掉了
            btn.click()
            c.wait(lambda d, r=r: d["days"][TODAY]["care"].get(r["id"]), "晚上打卡")
    c.wait(lambda d: "care-1" in d["milestones"], "里程碑")
    line = p.locator(".alert-line", has_text="第一次把一天的护肤都做好了")
    expect(line).to_be_visible()
    line.get_by_role("button", name="好").click()
    c.wait(lambda d: d["milestones"].get("seen", {}).get("care-1"), "看过里程碑")
    expect(p.locator(".seal")).to_be_visible()  # 护肤、复盘、祷告都做了
    c.go("#/history")
    expect(p.get_by_text("这周的你")).to_be_visible()


@step("生病：感冒→量到 37.8 切发烧、喝水、预案打勾、吃药（说明书、下次几点、同成分提醒）、去医院的情况变红、好了进手册")
def _(c):
    p = c.page
    c.go("#/")
    p.get_by_role("button", name="我不舒服").click()
    c.sheet().get_by_role("button", name="感冒").click()
    expect(p.get_by_role("heading", name="🤧 感冒")).to_be_visible()
    c.wait(lambda d: d["sick"]["current"]["kind"] == "cold", "开始感冒")
    expect(p.get_by_text("这是第一次在这里记感冒")).to_be_visible()
    p.locator(".card", has_text="今天哪里不舒服").get_by_role("button", name="嗓子疼").click()
    c.wait(lambda d: d["sick"]["current"].get("sym", {}).get(TODAY) == ["嗓子疼"], "症状")
    p.get_by_label("体温", exact=True).fill("37.8")
    p.get_by_role("button", name="记", exact=True).click()
    c.wait(lambda d: d["sick"]["current"]["temps"][0]["t"] == 37.8, "体温")
    p.get_by_role("button", name="切到发烧模式").click()
    c.wait(lambda d: d["sick"]["current"]["kind"] == "fever" and [x["kind"] for x in d["sick"]["current"]["path"]] == ["cold", "fever"], "切发烧")
    p.get_by_role("button", name="喝了一杯").click()
    c.wait(lambda d: d["sick"]["current"]["water"][TODAY] == 1, "喝水")
    p.get_by_role("button", name="多喝水（发烧很耗水）").click()
    c.wait(lambda d: d["sick"]["current"]["done"][TODAY] == {"多喝水（发烧很耗水）": True}, "预案打勾")
    p.get_by_label("还做了").fill("编的姜汤")
    p.locator(".card", has_text="今天要做").get_by_role("button", name="加", exact=True).click()
    c.wait(lambda d: d["sick"]["current"].get("extra") == ["编的姜汤"] and d["sick"]["current"]["done"][TODAY].get("编的姜汤"), "还做了")
    # 药：从物品档案读；先抄说明书
    row = p.locator(".med-row", has_text="编的感冒灵颗粒")
    row.get_by_role("button", name="说明书").click()
    c.sheet().get_by_label("一次多少").fill("1 袋")
    c.sheet().get_by_label("几小时一次").fill("6")
    c.sheet().get_by_label("一天最多几次").fill("3")
    c.sheet().get_by_role("button", name="存好").click()
    c.wait(lambda d: d["sick"]["meds"]["inv-m2"] == {"dose": "1 袋", "gapHours": 6, "perDay": 3}, "说明书")
    p.locator(".med-row", has_text="编的感冒灵颗粒").get_by_role("button", name="吃了").click()
    c.wait(lambda d: len(d["sick"]["current"]["meds"]) == 1, "吃药")
    expect(p.locator(".med-row", has_text="编的感冒灵颗粒")).to_contain_text("下次最早")
    expect(p.locator(".med-row", has_text="编的感冒灵颗粒")).to_contain_text("今天还能吃 2 次")
    # 再吃感康：同成分提醒
    p.locator(".med-row", has_text="编的感康").get_by_role("button", name="吃了").click()
    expect(c.sheet()).to_contain_text("对乙酰氨基酚")
    c.sheet().get_by_role("button", name="先不吃").click()
    assert len(c.data()["sick"]["current"]["meds"]) == 1
    # 抗生素标「医生判断」，放在「其他药」里
    p.get_by_text("其他药（2）").click()
    expect(p.locator(".med-row", has_text="编的左氧氟沙星")).to_contain_text("医生判断")
    # 39.2：去医院那条变红
    p.get_by_label("体温", exact=True).fill("39.2")
    p.get_by_role("button", name="记", exact=True).click()
    expect(p.locator(".card.alert")).to_contain_text("39°C 以上")
    # 首页：生病卡片
    c.go("#/")
    expect(p.locator(".alert-line.red")).to_contain_text("发烧 · 第 1 天")
    expect(p.get_by_role("button", name="我不舒服")).to_have_count(0)
    # 好了
    c.go("#/sick")
    p.get_by_role("button", name="好了").first.click()
    c.sheet().get_by_role("button", name="编的姜汤").click()
    c.sheet().get_by_label("怎么好的").fill("编的办法")
    c.sheet().get_by_role("button", name="好了").click()
    c.wait(lambda d: d["sick"]["current"] is None and d["sick"]["history"][0]["how"] == "编的办法" and d["sick"]["history"][0]["helped"] == ["编的姜汤"], "好了")
    expect(p.get_by_text("恢复期还有")).to_be_visible()
    c.go("#/sick/book")
    expect(p.get_by_text("最高 39.2°C")).to_be_visible()
    expect(p.get_by_text("写的：编的办法")).to_be_visible()
    expect(p.locator(".lessons", has_text="感冒")).to_contain_text("1 次里 1 次转成了发烧")
    expect(p.locator(".lessons", has_text="感冒")).to_contain_text("编的姜汤（1/1）")
    expect(p.get_by_text("看病去哪")).to_have_count(0)
    # 改预案
    p.get_by_role("button", name="🤧 感冒").click()
    c.sheet().get_by_label("预案").fill("编的做法一\n编的做法二")
    c.sheet().get_by_role("button", name="存好").click()
    c.wait(lambda d: d["sick"]["plans"]["cold"] == ["编的做法一", "编的做法二"], "预案")
    # 再感冒一次：以前的经验、最像的一次、把管用的加进预案
    c.go("#/sick")
    p.get_by_role("button", name="🤧 感冒").click()
    c.wait(lambda d: d["sick"]["current"] and d["sick"]["current"]["kind"] == "cold", "又感冒")
    lessons = p.locator(".lessons")
    expect(lessons).to_contain_text("1 次感冒里有 1 次后来发烧了，一般在第 1 天")
    expect(lessons).to_contain_text("编的姜汤")
    p.locator(".card", has_text="今天哪里不舒服").get_by_role("button", name="嗓子疼").click()
    expect(lessons).to_contain_text("最像的一次")
    lessons.get_by_role("button", name="把「编的姜汤」加进预案").click()
    c.wait(lambda d: d["sick"]["plans"]["cold"] == ["编的做法一", "编的做法二", "编的姜汤"], "加进预案")
    p.get_by_role("button", name="好了").first.click()
    c.sheet().get_by_role("button", name="好了").click()
    c.wait(lambda d: d["sick"]["current"] is None and len(d["sick"]["history"]) == 2, "又好了")


@step("肠胃：记次数，从账本里找昨天吃了什么，点可能是这个")
def _(c):
    p = c.page
    c.go("#/sick")
    p.get_by_role("button", name="肠胃不舒服").click()
    c.wait(lambda d: d["sick"]["current"]["kind"] == "gut", "肠胃")
    p.get_by_role("button", name="拉肚子 0 次").click()
    c.wait(lambda d: d["sick"]["current"]["gut"][TODAY]["d"] == 1, "拉肚子")
    p.get_by_role("button", name="昨天午餐：编的盖饭").click()
    c.wait(lambda d: d["sick"]["current"]["suspects"] == ["昨天午餐：编的盖饭"], "可疑的")
    expect(p.locator(".med-row", has_text="编的蒙脱石散")).to_be_visible()
    p.get_by_role("button", name="好了").first.click()
    c.sheet().get_by_role("button", name="好了").click()
    c.wait(lambda d: d["sick"]["current"] is None, "肠胃好了")
    c.go("#/sick/book")
    expect(p.get_by_text("午餐：编的盖饭")).to_be_visible()


@step("换季：要降温了写在首页天气下面")
def _(c):
    p = c.page
    c.write(lambda d: d["settings"].update(city={"name": "编的城", "lat": 1, "lon": 2}))
    p.evaluate("localStorage.removeItem('life-weather')")
    c.go("#/")
    p.reload()
    expect(p.locator(".today-head .wx-note")).to_contain_text("比今天低 10°C")
    expect(p.locator(".alert-line", has_text="降温")).to_have_count(0)


@step("英语：贴回总结存进错句本表达本、下次注意写进提示词、复习")
def _(c):
    p = c.page
    c.go("#/english")
    p.get_by_label("ChatGPT 的总结").fill("""=== SUMMARY ===
MISTAKES
- I said: I go there yesterday | Better: I went there yesterday | Type: tense
- I said: He have a cat | Better: He has a cat | Type: grammar
EXPRESSIONS
- grab a coffee | 去喝杯咖啡 | Want to grab a coffee later?
NEXT TIME
- Use past tense for stories.
=== END ===""")
    p.get_by_role("button", name="存进本子").click()
    c.wait(lambda d: len(d["english"]["cards"]) == 3 and d["english"]["next"] == "Use past tense for stories.", "存进本子")
    assert events(c.data(), "english")[-1]["mistakes"] == 2
    expect(p.get_by_text("上次 ChatGPT 说下次注意：Use past tense for stories.")).to_be_visible()
    assert "Last time you told me to focus on: Use past tense for stories." in p.get_by_label("英语提示词").input_value()
    # 明天才复习：改成今天到期
    c.write(lambda d: [x.update(due=TODAY) for x in d["english"]["cards"]])
    c.go("#/")
    p.reload()
    c.go("#/")
    c.period("中午").locator(".it", has_text="英语复习").get_by_role("link").click()
    p.get_by_role("button", name="看答案").click()
    expect(p.locator(".card-back")).to_have_text("I went there yesterday")
    p.get_by_role("button", name="记住了").click()
    p.get_by_role("button", name="看答案").click()
    p.get_by_role("button", name="还没记住").click()
    p.get_by_role("button", name="看答案").click()
    p.get_by_role("button", name="记住了").click()
    expect(p.get_by_text("今天的复习做完了")).to_be_visible()
    cards = c.data()["english"]["cards"]
    assert sorted(x["level"] for x in cards) == [0, 1, 1] and all(x["due"] > TODAY for x in cards), cards


@step("想去的地方：粘贴小红书、选类型和区、地图上点位置；去过了打分写话放照片；列表、地图、按区、足迹、周末去哪")
def _(c):
    p = c.page
    c.write(lambda d: d["settings"].update(city={"name": "编的城", "lat": 36.66, "lon": 117.02, "districts": ["甲区", "乙区"]}))
    c.go("#/places")
    p.reload()
    expect(p.get_by_text("还没有地方")).to_be_visible()
    p.get_by_role("link", name="＋ 加一个").click()
    p.get_by_label("粘贴或写下地方").fill("【编的书店 - 编的作者 | 小红书 - 你的生活指南】 😆 AbCdEfGh12 😆 http://xhslink.com/a/abc123 复制本条信息，打开【小红书】App查看精彩内容！")
    expect(p.get_by_label("名字")).to_have_value("编的书店")
    expect(p.get_by_label("链接")).to_have_value("http://xhslink.com/a/abc123")
    p.get_by_role("group", name="类型").get_by_role("button", name="店").click()
    p.get_by_role("group", name="区").get_by_role("button", name="甲区").click()
    p.get_by_role("group", name="有多想去").get_by_role("button", name="★★★").click()
    p.locator(".map-box .leaflet-container, .map-box.leaflet-container").first.wait_for()
    p.locator(".map-box").click(position={"x": 120, "y": 100})
    p.get_by_label("为什么想去").fill("编的理由")
    p.locator(".detail-row", has_text="大概花多少").get_by_role("button", name="免费").click()
    expect(p.locator(".detail-row", has_text="大概花多少").get_by_role("button", name="免费")).to_have_attribute("aria-pressed", "true")
    p.locator(".detail-row", has_text="什么时候去最好").get_by_role("button", name="秋天").click()
    p.locator(".detail-row", has_text="什么时候去最好").get_by_role("button", name="晚上").click()
    expect(p.get_by_label("什么时候去最好")).to_have_value("秋天、晚上")
    p.get_by_role("button", name="存好").click()
    c.wait(lambda d: d["places"] and d["places"][0]["name"] == "编的书店", "加地方")
    pl = c.data()["places"][0]
    assert pl["kind"] == "shop" and pl["district"] == "甲区" and pl["want"] == 3 and pl["lat"] and pl["link"].startswith("http://xhslink"), pl
    assert pl["cost"] == 0 and pl["season"] == "秋天、晚上", pl
    expect(p.get_by_text("想去（1）")).to_be_visible()
    # 周末去哪：想去页一直有
    expect(p.locator(".weekend")).to_contain_text("编的书店")
    expect(p.locator(".weekend")).to_contain_text("想去还没去")
    # 去过了：打分、一句话、照片
    p.locator(".list-card").get_by_role("link", name="编的书店").click()
    p.get_by_role("button", name="去过了").click()
    c.sheet().get_by_role("button", name="5 ★").click()
    c.sheet().get_by_label("一句话").fill("编的感受")
    png = ROOT / "icon-180.png"
    c.sheet().get_by_label("照片").set_input_files(str(png))
    c.sheet().get_by_role("button", name="存好").click()
    c.wait(lambda d: d["places"][0].get("visits") and d["places"][0]["visits"][0].get("photo"), "去过了")
    v = c.data()["places"][0]["visits"][0]
    assert v["score"] == 5 and v["note"] == "编的感受" and c.repo.read(v["photo"]), v
    expect(p.locator(".visit-photo")).to_be_visible()
    expect(p.get_by_text("去过 1 次")).to_be_visible()
    # 又加一个，不标位置
    c.go("#/place/new")
    p.get_by_label("名字").fill("编的面馆")
    p.get_by_role("group", name="类型").get_by_role("button", name="吃的").click()
    p.get_by_role("button", name="存好").click()
    c.wait(lambda d: len(d["places"]) == 2, "第二个")
    p.get_by_role("button", name="地图").click()
    expect(p.locator(".leaflet-interactive")).to_have_count(1)
    expect(p.get_by_text("还有 1 个地方没标位置")).to_be_visible()
    p.get_by_role("button", name="按区").click()
    expect(p.locator(".area-row", has_text="甲区")).to_contain_text("1/1")
    p.get_by_role("button", name="足迹").click()
    expect(p.get_by_text(f"{TODAY[:4]} 年 · 去了 1 个地方、1 次")).to_be_visible()
    # DeepSeek 帮我填：只有一个 → 直接填好类型、区、位置
    c.go("#/place/new")
    p.get_by_label("名字").fill("编的博物馆")
    p.get_by_role("button", name="一键补全").click()
    expect(p.get_by_role("group", name="类型").get_by_role("button", name="博物馆")).to_have_attribute("aria-pressed", "true")
    expect(p.get_by_role("group", name="区").get_by_role("button", name="乙区")).to_have_attribute("aria-pressed", "true")
    expect(p.get_by_text("位置是它估计的")).to_be_visible()
    p.get_by_role("button", name="存好").click()
    c.wait(lambda d: len(d["places"]) == 3, "博物馆")
    mu = c.data()["places"][2]
    assert mu["kind"] == "museum" and mu["district"] == "乙区" and mu["lat"] == 36.661 and mu["address"] == "编的路 1 号", mu
    # 店名 + 地址：DeepSeek 认出名字、按地址定位置；链接不发
    c.go("#/place/new")
    p.get_by_label("粘贴或写下地方").fill("编的咖啡 甲区编的路 9 号")
    expect(p.get_by_label("名字")).to_have_value("")
    p.get_by_role("button", name="一键补全").click()
    expect(p.get_by_label("名字")).to_have_value("编的咖啡（编的路店）")
    expect(p.get_by_role("group", name="类型").get_by_role("button", name="吃的")).to_have_attribute("aria-pressed", "true")
    assert "他写的：编的咖啡 甲区编的路 9 号" in LAST_AI[-1], LAST_AI[-1][-300:]
    p.get_by_role("link", name="取消").click()
    # 大众点评的分享：认出店名、链接
    c.go("#/place/new")
    p.get_by_label("粘贴或写下地方").fill("【大众点评】推荐给你「编的面馆(编的店)」，地址：乙区编的街 3 号 https://m.dianping.com/shopshare/x1")
    expect(p.get_by_label("名字")).to_have_value("编的面馆(编的店)")
    expect(p.get_by_label("链接")).to_have_value("https://m.dianping.com/shopshare/x1")
    p.get_by_role("link", name="取消").click()
    # 不认识 → 说一声
    c.go("#/place/new")
    p.get_by_label("名字").fill("编的不存在")
    p.get_by_role("button", name="一键补全").click()
    expect(p.get_by_text("DeepSeek 不认识这个地方")).to_be_visible()
    # 连锁店：列出几家，勾两家 → 分开记两个；太远的坐标不要
    p.get_by_label("名字").fill("编的连锁")
    p.get_by_role("button", name="一键补全").click()
    expect(c.sheet()).to_contain_text("找到 3 个")
    expect(c.sheet().locator(".cand", has_text="远店")).to_contain_text("没有位置")
    c.sheet().get_by_label("编的连锁（一店）").check()
    c.sheet().get_by_label("编的连锁（二店）").check()
    c.sheet().get_by_role("button", name="加这 2 个").click()
    c.wait(lambda d: len(d["places"]) == 5, "连锁两家")
    two = c.data()["places"][3:]
    assert [x["name"] for x in two] == ["编的连锁（一店）", "编的连锁（二店）"] and two[1]["district"] == "乙区" and two[0]["lat"] == 36.67, two
    p.get_by_role("button", name="列表").click()
    expect(p.get_by_text("想去（4）")).to_be_visible()
    # 改一下
    c.go(f"#/place/{pl['id']}")
    p.get_by_role("link", name="改一下").click()
    p.get_by_label("大概花多少").fill("50")
    p.get_by_role("button", name="存好").click()
    c.wait(lambda d: d["places"][0].get("cost") == 50 and d["places"][0]["visits"], "改地方")


@step("分析：什么在影响我（攒够天数）、走势、作息、规律、护肤、计划")
def _(c):
    p = c.page
    c.go("#/stats")
    expect(p.get_by_text("就开始有结论了")).to_be_visible()
    # 编 30 天：运动的日子心情 8、不运动 5；睡够 7 小时精力高
    def seed(d):
        for i in range(1, 31):
            day = (datetime.fromisoformat(TODAY) - timedelta(days=i)).date().isoformat()
            sport = i % 2 == 0
            r = d["days"].setdefault(day, {})
            r.update(mood=8 if sport else 5, energy=4 if i % 3 else 2, note=f"编的第{i}天", did=f"编的科研{i}", planDone="yes" if i % 2 else "part",
                     sleep={"bed": "23:30" if i % 3 else "01:30", "wake": "07:30"})
            if sport:
                d["events"].append({"id": f"s{i}", "day": day, "at": f"{day}T10:00:00Z", "type": "sport", "kind": "跑步", "minutes": 30})
            d["events"].append({"id": f"w{i}", "day": day, "at": f"{day}T12:00:00Z", "type": "shower"})
    c.write(seed)
    p.reload()
    expect(p.locator(".inf-row", has_text="运动了的日子，当天心情平均 7.9，其他日子 5")).to_be_visible()
    expect(p.locator(".inf-row", has_text="睡够 7 小时")).to_have_count(2)
    expect(p.locator("svg[aria-label='心情']")).to_be_visible()
    expect(p.locator("svg[aria-label='每天几点睡几点起']")).to_be_visible()
    p.get_by_role("button", name="运动", exact=True).click()
    expect(p.locator("svg[aria-label='星期几']")).to_be_visible()
    expect(p.locator("svg[aria-label='每周计划完成率']")).to_be_visible()


@step("回顾：周报月报（DeepSeek 写一段、存下来、月报有科研回顾）、年报")
def _(c):
    p = c.page
    c.go(f"#/report?k=month&d={YESTERDAY}")
    p.get_by_role("button", name="请 DeepSeek 写一段").click()
    expect(p.get_by_text("编的回顾正文")).to_be_visible()
    expect(p.get_by_text("编的科研回顾")).to_be_visible()
    key = f"m{YESTERDAY[:7]}"
    c.wait(lambda d: d["letters"][key]["text"] == "编的回顾正文", "月报存下来")
    sent = LAST_AI[-1]
    assert "编的科研" in sent and "科研回顾" in sent, sent[:500]
    p.get_by_role("link", name="周", exact=True).click()
    expect(p.locator(".period-nav")).to_contain_text("这周（")
    p.get_by_role("link", name="年", exact=True).click()
    expect(p.locator(".stat-grid")).to_contain_text("运动")


@step("问问我的记录：带着最近的记录问 DeepSeek；状态不对首页轻轻提一句")
def _(c):
    p = c.page
    c.go("#/ask")
    p.get_by_role("button", name="我最近为什么总是累？").click()
    expect(p.locator(".msg.ai")).to_have_text("编的回答")
    sent = LAST_AI[-1]
    assert "编的第1天" in sent and "运动跑步30分" in sent, sent[:600]
    assert "小记" not in sent  # 小记那一页没开着锁，不带上
    # 连续 3 天心情低
    def low(d):
        for i in (1, 2, 3):
            day = (datetime.fromisoformat(TODAY) - timedelta(days=i)).date().isoformat()
            d["days"][day]["mood"] = 3
    c.write(low)
    c.go("#/")
    p.reload()
    expect(p.locator(".alert-line", has_text="心情有点低")).to_be_visible()


@step("难受的时候：首页进去、写给难受时的自己、呼吸→有多难受→哪一种→清单→给你的话→现在呢、记下来、以前的经验")
def _(c):
    p = c.page
    c.go("#/")
    p.locator(".alert-line", has_text="心情有点低").click()
    expect(p.get_by_role("heading", name="难受的时候")).to_be_visible()
    expect(p.get_by_text("400-161-9995")).to_be_visible()
    p.get_by_role("button", name="＋ 写一句").click()
    c.sheet().get_by_label("写给难受时的自己").fill("编的给自己的话")
    c.sheet().get_by_role("button", name="存好").click()
    c.wait(lambda d: d["low"]["notes"][0]["text"] == "编的给自己的话", "写一句")
    # 改预案
    p.get_by_role("button", name="🌙 孤单").click()
    c.sheet().get_by_label("预案").fill("编的办法甲\n编的办法乙")
    c.sheet().get_by_role("button", name="存好").click()
    c.wait(lambda d: d["low"]["plans"]["lonely"] == ["编的办法甲", "编的办法乙"], "难受的预案")
    for round_ in (1, 2):
        p.get_by_role("link", name="现在开始").click()
        expect(p.get_by_role("heading", name="先慢慢呼吸")).to_be_visible()
        expect(p.locator(".breath-circle")).to_be_visible()
        p.get_by_role("button", name="跳过").click()
        p.get_by_role("group", name="有多难受").get_by_role("button", name="9", exact=True).click()
        expect(p.locator(".hotline")).to_be_visible()  # 9 分以上马上给热线
        p.get_by_role("button", name="下一步").click()
        p.get_by_role("button", name="🌙 孤单").click()
        if round_ == 2:
            expect(p.get_by_text("以前这种时候，「编的办法乙」最管用")).to_be_visible()
        p.get_by_role("button", name="编的办法乙").click()
        p.get_by_role("button", name="下一步").click()
        expect(p.locator(".words")).to_be_visible()
        p.get_by_role("button", name="下一步").click()
        p.get_by_role("group", name="现在有多难受").get_by_role("button", name="5", exact=True).click()
        p.locator(".card", has_text="哪些有点用").get_by_role("button", name="编的办法乙").click()
        p.get_by_role("button", name="记下").click()
        c.wait(lambda d: len(d["low"]["log"]) == round_, "记一次")
        expect(p.get_by_text("从 9 到 5")).to_be_visible()
        if round_ == 1:
            p.get_by_role("link", name="回到今天").click()
            c.go("#/pray")
            p.get_by_role("link", name="难受的时候 ›").click()
    x = c.data()["low"]["log"][0]
    assert x["kind"] == "lonely" and x["before"] == 9 and x["after"] == 5 and x["helped"] == ["编的办法乙"], x
    c.go("#/low")
    expect(p.get_by_text("做完平均好了 4 分")).to_be_visible()
    # 给你的话里有写给自己的那句（多翻几句一定会出现）
    p.get_by_role("link", name="现在开始").click()
    p.get_by_role("button", name="跳过").click()
    p.get_by_role("button", name="下一步").click()
    p.get_by_role("button", name="🌧️ 低落、提不起劲").click()
    p.get_by_role("button", name="下一步").click()
    texts = set()
    for _ in range(12):
        texts.add(p.locator(".words-text").inner_text())
        p.get_by_role("button", name="再看一句 ›").click()
    assert "编的给自己的话" in texts, texts


@step("角落的话、问候、祷告页的难受入口")
def _(c):
    p = c.page
    c.go("#/")
    # 角落里的一句话：首页有，小记那一页没有
    expect(p.locator(".whisper")).to_have_count(1)
    # 首页开头：问候 + 节气；护肤圆环
    expect(p.locator(".today-head .greet")).to_have_text(re.compile("好|夜深"))
    expect(p.locator(".head-tags .tag").first).to_have_text(re.compile("时节|还有|今天"))
    # 祷告页最下面：难受的时候
    c.go("#/pray")
    expect(p.get_by_role("link", name="难受的时候 ›")).to_be_visible()
    c.go("#/more")
    expect(p.get_by_role("heading", name="生活")).to_be_visible()
    c.go("#/p")
    expect(p.locator(".whisper")).to_have_count(0)


@step("想做到的事：写心愿、复制 ChatGPT 提示词、贴回小结让 DeepSeek 整理（带上衣橱和心愿单）、勾掉、习惯、搜索按钮、放进账本心愿单、首页一行进度、周报、做到了进里程碑")
def _(c):
    p = c.page
    c.go("#/more")
    p.get_by_role("link", name="想做到的事").click()
    p.get_by_role("button", name="＋ 写一个心愿").click()
    c.sheet().get_by_label("心愿").fill("编的心愿：生活和工作分开")
    c.sheet().get_by_role("button", name="下一步").click()
    expect(p.get_by_role("heading", name="和 ChatGPT 聊聊")).to_be_visible()
    p.get_by_role("button", name="复制提示词").click()
    clip = p.evaluate("navigator.clipboard.readText()")
    assert "编的心愿：生活和工作分开" in clip and "整理一下" in clip and "语音" in clip, clip
    p.get_by_label("ChatGPT 的小结").fill("心愿：编的\n为什么：编的\n先做：编的小事甲\n要买的：编的外套 200")
    p.get_by_role("button", name="让 DeepSeek 整理").click()
    expect(p.get_by_role("heading", name="编的目标")).to_be_visible()
    body = LAST_AI[-1]
    assert "编的格子衬衫" in body and "休闲" in body and "编的衣服备注" in body, body[-800:]
    assert "编的小事甲" not in body.split("ChatGPT 的小结")[0]  # 小结在 user 里
    g = c.data()["goals"][0]
    assert g["status"] == "active" and g["chat"].startswith("心愿：编的") and len(g["stages"]) == 2 and g["habits"][0]["perWeek"] == 2, g
    # 搜索按钮
    expect(p.get_by_role("link", name="小红书")).to_have_attribute("href", re.compile("xiaohongshu.com/search_result\\?keyword=.*%E5%A4%96%E5%A5%97"))
    expect(p.get_by_role("link", name="淘宝")).to_have_attribute("href", re.compile("s.taobao.com/search\\?q="))
    # 勾掉一件
    p.get_by_role("button", name="编的小事甲").first.click()
    c.wait(lambda d: d["goals"][0]["stages"][0]["tasks"][0]["done"] == TODAY, "勾掉")
    # 习惯
    p.locator(".goal-habit").get_by_role("button", name="今天做了").click()
    c.wait(lambda d: any((d["days"].get(TODAY, {}).get("goals") or {}).values()), "习惯")
    expect(p.locator(".goal-habit")).to_contain_text("这周 1 次")
    # 放进账本心愿单：确认名字价格
    p.get_by_role("button", name="放进心愿单").click()
    expect(c.sheet().get_by_label("价格")).to_have_value("199")
    c.sheet().get_by_role("button", name="放进去").click()
    expect(p.get_by_text("在心愿单里了")).to_be_visible()
    w = json.loads(LEDGER.read("finance.json"))["wishes"][-1]
    assert w["name"] == "编的外套" and w["price"] == 199 and w["status"] == "open" and w["reason"] == "为了：编的目标", w
    c.wait(lambda d: d["goals"][0]["stages"][0]["tasks"][1].get("wishId") == w["id"], "记下放进心愿单")
    # 首页一行进度
    c.go("#/")
    expect(p.locator(".goal-line")).to_contain_text("编的目标 · 第 1 阶段 1/2")
    # 周报
    c.go(f"#/report?k=week&d={TODAY}")
    expect(p.locator(".card", has_text="想做到的事")).to_contain_text("编的小事甲")
    # 做到了 → 里程碑
    c.go(f"#/goal/{g['id']}")
    p.get_by_role("button", name="做到了").click()
    c.sheet().get_by_role("button", name="做到了").click()
    c.wait(lambda d: d["goals"][0]["status"] == "done", "做到了")
    c.go("#/")
    expect(p.locator(".alert-line", has_text="做到了：编的目标")).to_be_visible()
    expect(p.locator(".goal-line")).to_have_count(0)


@step("身边的人：账本里的人搬过来、一段话一键补全、主要的档、来往、记成人情（进账本）、想想送什么进心愿单、改名同步账本、生日和节假日人情在今天、和谁去的地方、归档")
def _(c):
    p = c.page
    sh = c.sheet()
    f = json.loads(LEDGER.read("finance.json"))
    f.setdefault("people", []).append({"id": "p-led", "name": "编的甲"})
    LEDGER.external_write("finance.json", json.dumps(f, ensure_ascii=False).encode())
    c.go("#/more")
    p.get_by_role("link", name="身边的人").click()
    expect(p.locator(".av-block", has_text="还没分组")).to_contain_text("编的甲")
    c.wait(lambda d: any(x["id"] == "p-led" and x["groups"] == [] for x in d["people"]), "账本里的人搬过来")
    # 一段话一键补全
    p.get_by_role("link", name="加一个人").click()
    p.get_by_label("写一段话").fill("编的乙，本科同学，后来是研究生同门，喜欢喝茶，农历八月十五生日")
    p.get_by_role("button", name="一键补全").click()
    expect(p.get_by_label("名字", exact=True)).to_have_value("编的乙")
    groups = p.get_by_role("group", name="分组")
    expect(groups.get_by_role("button", name="本科 · 主要")).to_have_attribute("aria-pressed", "true")
    expect(groups.get_by_role("button", name="研究生")).to_have_attribute("aria-pressed", "true")
    p.get_by_role("group", name="主要的档").get_by_role("button", name="研究生").click()
    expect(groups.get_by_role("button", name="研究生 · 主要")).to_be_visible()
    p.get_by_role("group", name="关系").get_by_role("button", name="同门").click()
    expect(p.get_by_role("group", name="公历还是农历").get_by_role("button", name="农历")).to_have_attribute("aria-pressed", "true")
    expect(p.get_by_label("喜欢什么")).to_have_value("编的喜欢喝茶")
    expect(p.get_by_role("group", name="男女").get_by_role("button", name="男")).to_have_attribute("aria-pressed", "true")
    p.get_by_role("button", name="存好").click()
    c.wait(lambda d: any(x["name"] == "编的乙" for x in d["people"]), "存好一个人")
    me = next(x for x in c.data()["people"] if x["name"] == "编的乙")
    assert me["sex"] == "m" and me["groups"] == ["grad", "college"] and me["rel"] == "同门" and me["birthday"] == {"cal": "lunar", "m": 8, "d": 15}, me
    pid = me["id"]
    for _ in range(50):
        if any(x["id"] == pid for x in json.loads(LEDGER.read("finance.json"))["people"]):
            break
        p.wait_for_timeout(200)
    assert any(x["id"] == pid and x["name"] == "编的乙" for x in json.loads(LEDGER.read("finance.json"))["people"]), "名单同步到账本"
    expect(p.locator(".person-card")).to_contain_text("农历八月十五")
    # 来往 → 记成人情
    p.get_by_role("button", name="记一笔来往").click()
    sh.get_by_label("发生了什么").fill("编的帮我改论文")
    sh.get_by_role("button", name="存好").click()
    expect(p.locator(".tl-row", has_text="编的帮我改论文")).to_be_visible()
    p.locator(".tl-row", has_text="编的帮我改论文").get_by_role("button", name="记成人情").click()
    expect(sh.get_by_role("group", name="谁欠谁").get_by_role("button", name="我欠他")).to_have_attribute("aria-pressed", "true")
    sh.get_by_label("哪天").fill("2026-09-01")
    sh.get_by_role("button", name="记好了").click()
    expect(p.locator(".tl-row.favor", has_text="欠他一个人情")).to_be_visible()
    fav = json.loads(LEDGER.read("finance.json"))["favors"][-1]
    assert fav["person"] == pid and fav["dir"] == "owe" and fav["text"] == "编的帮我改论文" and fav["status"] == "open", fav
    c.wait(lambda d: next(x for x in d["people"] if x["id"] == pid)["log"][0]["favor"] == fav["id"], "来往记上人情")
    expect(p.locator(".tl-row", has_text="编的帮我改论文").get_by_role("button", name="记成人情")).to_have_count(0)
    # 想想送什么 → 心愿单（送人）
    p.get_by_role("button", name="想想送什么").click()
    gift = p.locator(".gift-card")
    expect(gift).to_contain_text("编的茶具")
    assert "编的喜欢喝茶" in LAST_AI[-1]
    expect(gift.get_by_role("link", name="淘宝")).to_have_attribute("href", re.compile("taobao.com.*%E7%BC%96"))
    gift.get_by_role("button", name="放进心愿单").click()
    sh.get_by_role("button", name="放进去").click()
    expect(gift.get_by_text("在心愿单里了")).to_be_visible()
    p.wait_for_timeout(500)
    p.screenshot(path=ART / "person.png", full_page=True)
    w = json.loads(LEDGER.read("finance.json"))["wishes"][-1]
    assert w["kind"] == "gift" and w["name"] == "编的茶具" and w["price"] == 88 and w["reason"].startswith("送编的乙"), w
    # 账本里来的人：分进家人、写妈妈、改名字、生日是明天 → 账本名单跟着改，今天里有生日
    tomorrow = (datetime.fromisoformat(TODAY) + timedelta(days=1)).date()
    c.go("#/person/p-led/edit")
    p.get_by_role("group", name="分组").get_by_role("button", name="家人").click()
    p.get_by_role("group", name="关系").get_by_role("button", name="妈妈").click()
    p.get_by_label("名字", exact=True).fill("编的丙")
    p.get_by_role("button", name="存好").click()
    expect(p.locator(".toast", has_text="选一下男还是女")).to_be_visible()
    p.get_by_role("group", name="男女").get_by_role("button", name="女").click()
    expect(p.get_by_text("关于她")).to_be_visible()
    expect(p.get_by_label("生日月")).to_have_count(0)  # 先问知不知道生日
    expect(p.get_by_role("group", name="辈分").get_by_role("button", name="长辈")).to_have_attribute("aria-pressed", "true")  # 妈妈 → 长辈
    p.get_by_role("group", name="知道生日吗").get_by_role("button", name="知道", exact=True).click()
    p.get_by_label("生日月").select_option(str(tomorrow.month))
    p.get_by_label("生日日").select_option(str(tomorrow.day))
    p.get_by_role("button", name="存好").click()
    c.wait(lambda d: next(x for x in d["people"] if x["id"] == "p-led")["name"] == "编的丙", "改名")
    for _ in range(50):
        if any(x["name"] == "编的丙" for x in json.loads(LEDGER.read("finance.json"))["people"]):
            break
        p.wait_for_timeout(200)
    assert any(x["id"] == "p-led" and x["name"] == "编的丙" for x in json.loads(LEDGER.read("finance.json"))["people"]), "改名同步到账本"
    c.go("#/")
    expect(p.locator(".alert-line", has_text="明天是编的丙的生日")).to_be_visible()
    c.go("#/people")
    expect(p.locator(".birthday-card")).to_contain_text("编的丙")
    expect(p.locator(".av-block", has=p.locator(".av-head", has_text="家人"))).to_contain_text("编的丙")
    expect(p.locator(".av.close")).to_have_count(0)
    expect(p.locator(".av-block", has=p.locator(".av-head", has_text="研究生")).locator(".av-c")).to_have_text("乙")
    p.get_by_role("group", name="分组").get_by_role("button", name="本科").click()
    expect(p.locator(".av")).to_have_count(1)
    expect(p.locator(".av")).to_contain_text("编的乙")
    p.get_by_role("group", name="分组").get_by_role("button", name="全部").click()
    p.wait_for_timeout(500)
    p.screenshot(path=ART / "people.png", full_page=True)
    # 和谁一起去的
    c.write(lambda d: d["places"].append({"id": "pl-friend", "name": "编的公园", "kind": "walk", "visits": [], "at": TODAY}))
    c.go("#/places")
    p.reload()
    p.locator("a", has_text="编的公园").first.click()
    p.get_by_role("button", name="去过了").click()
    sh.get_by_label("和谁一起去的").fill("乙")
    expect(sh.locator(".picker-list")).not_to_contain_text("null")
    sh.get_by_role("option", name=re.compile("编的乙")).click()
    expect(sh.locator(".picker-token")).to_have_text("编的乙×")
    sh.get_by_role("button", name="存好").click()
    c.wait(lambda d: next(x for x in d["places"] if x["id"] == "pl-friend")["visits"][0]["with"] == [pid], "和谁去的")
    expect(p.locator(".visit")).to_contain_text("和 编的乙 一起")
    p.locator(".visit").get_by_role("link", name="编的乙").click()
    expect(p.locator(".tl-row", has_text="一起去了编的公园")).to_be_visible()
    # 节假日（国庆前一天）：今天里问欠的人情这次还不还
    p.clock.set_fixed_time("2026-09-30T12:00:00")
    c.go("#/")
    line = p.locator(".alert-line", has_text="明天开始放国庆了")
    expect(line).to_contain_text("还欠编的乙一个人情：编的帮我改论文")
    line.get_by_role("button", name="这次还").click()
    expect(p.locator(".alert-line", has_text="这个假期要还")).to_contain_text("编的乙")
    assert json.loads(LEDGER.read("finance.json"))["favors"][-1]["plan"] == "2026-国庆"
    p.clock.set_fixed_time(datetime.now().isoformat(timespec="seconds"))
    # 归档：不再来往，账本里也标上
    c.go("#/person/p-led")
    p.get_by_role("button", name="不再来往了").click()
    sh.get_by_label("为什么").fill("编的原因")
    sh.get_by_role("button", name="归档").click()
    expect(p.get_by_text("起不再来往：编的原因")).to_be_visible()
    for _ in range(50):
        if any(x["id"] == "p-led" and x.get("archived") for x in json.loads(LEDGER.read("finance.json"))["people"]):
            break
        p.wait_for_timeout(200)
    assert any(x["id"] == "p-led" and x.get("archived") for x in json.loads(LEDGER.read("finance.json"))["people"]), "归档同步到账本"
    c.go("#/people")
    expect(p.locator(".av-gone-row")).to_contain_text("不再来往 1 人")
    expect(p.locator(".av", has_text="编的丙")).to_have_count(0)
    expect(p.locator(".av-head", has_text="家人")).to_have_count(0)
    p.get_by_role("group", name="分组").get_by_role("button", name="不再来往").click()
    expect(p.locator(".av")).to_have_count(1)


@step("人情和关系：我们的经历（DeepSeek 分段）、重要的日子（随礼提醒以前来回多少）、礼尚往来（账本给谁的 + 自己记的礼）、怎么还人情（挑想去的地方）、过节问候（起个头、发了）")
def _(c):
    p = c.page
    sh = c.sheet()
    pid = next(x for x in c.data()["people"] if x["name"] == "编的乙")["id"]
    tomorrow = (datetime.fromisoformat(TODAY) + timedelta(days=1)).date().isoformat()
    f = json.loads(LEDGER.read("finance.json"))
    f["categories"].append({"id": "c-hongbao", "name": "红包", "group": "daily"})
    f["tx"].append({"id": "t-g1", "type": "expense", "date": "2025-05-01", "category": "c-hongbao", "amount": 200, "who": pid, "note": "编的婚礼"})
    LEDGER.external_write("finance.json", json.dumps(f, ensure_ascii=False).encode())
    c.write(lambda d: d["places"].append({"id": "pl-food", "name": "编的饭馆", "kind": "food", "visits": [], "at": TODAY}))
    c.go(f"#/person/{pid}")
    p.reload()
    # 我们的经历
    p.get_by_role("button", name="写一段话整理").click()
    sh.get_by_label("写一段话").fill("编的：本科住一个宿舍，后来一起读研")
    sh.get_by_role("button", name="整理").click()
    stages = p.locator(".stages-card")
    expect(stages).to_contain_text("编的本科同宿舍")
    expect(stages).to_contain_text("2019-09 – 2023-06")
    expect(stages).to_contain_text("2023-09 起")
    c.wait(lambda d: len(next(x for x in d["people"] if x["id"] == pid)["stages"]) == 2, "经历存好")
    stages.get_by_role("button", name=re.compile("编的读研")).click()
    sh.get_by_label("发生了什么").fill("编的经历乙改")
    sh.get_by_role("button", name="存好").click()
    expect(stages).to_contain_text("编的经历乙改")
    # 礼尚往来：账本里给他的红包 + 自己记的礼
    p.get_by_role("button", name="记一笔来往").click()
    sh.get_by_label("发生了什么").fill("编的送我一本书")
    sh.get_by_role("group", name="这是").get_by_role("button", name="他送我的礼").click()
    sh.get_by_role("button", name="存好").click()
    book = p.locator(".card", has=p.locator("h3", has_text="礼尚往来"))
    expect(book).to_contain_text("上次你给他：红包 · 编的婚礼 ¥200（2025-05）")
    expect(book).to_contain_text("上次他给你：编的送我一本书")
    expect(p.locator(".tl-row.gift", has_text="送他：红包")).to_be_visible()
    # 重要的日子：明天，要随礼
    p.get_by_role("button", name="＋ 一个日子").click()
    sh.get_by_role("button", name="婚礼").click()
    sh.get_by_label("哪天").fill(tomorrow)
    sh.get_by_role("button", name="估一个").click()
    expect(sh.get_by_label("预计要准备多少")).to_have_value("150")
    expect(sh.get_by_text("DeepSeek：编的估法")).to_be_visible()
    assert "上次" not in LAST_AI[-1] and "¥200" in LAST_AI[-1]  # 带上以前来回的钱
    sh.get_by_label("预计要准备多少").fill("600")
    sh.get_by_role("button", name="存好").click()
    c.wait(lambda d: next(x for x in d["people"] if x["id"] == pid).get("dates", [{}])[0].get("gift") is True, "日子存好")
    did = next(x for x in c.data()["people"] if x["id"] == pid)["dates"][0]["id"]
    for _ in range(50):
        if any(f["id"] == f"fd-{did}" for f in json.loads(LEDGER.read("finance.json")).get("favors", [])):
            break
        p.wait_for_timeout(200)
    fd = next(f for f in json.loads(LEDGER.read("finance.json"))["favors"] if f["id"] == f"fd-{did}")
    assert fd["due"] == tomorrow and fd["estimate"] == 600 and fd["kind"] == "date" and fd["person"] == pid and fd["text"] == "婚礼", fd
    expect(p.locator(".date-row")).to_contain_text("随礼约 ¥600")
    c.go("#/")
    expect(p.locator(".alert-line", has_text="明天：编的乙 婚礼")).to_contain_text("上次你给他：红包 · 编的婚礼 ¥200")
    # 怎么还人情：从想去的地方里挑
    c.go(f"#/person/{pid}")
    p.locator(".favor-item", has_text="编的帮我改论文").get_by_role("button", name="怎么还").click()
    ideas = p.locator(".repay-ideas")
    expect(ideas).to_contain_text("请编的乙吃饭")
    expect(ideas.get_by_role("link", name="看看 编的饭馆 ›")).to_have_attribute("href", "#/place/pl-food")
    expect(ideas.get_by_role("link")).to_have_count(1)
    assert "编的饭馆" in LAST_AI[-1] and "编的经历甲" in LAST_AI[-1]
    p.wait_for_timeout(500)
    p.screenshot(path=ART / "person-full.png", full_page=True)
    # 过节问候：资料里勾中秋、写怎么称呼；中秋前一天今天里一行 → 起个头、发了
    c.go(f"#/person/{pid}/edit")
    p.get_by_role("group", name="过节要问候").get_by_role("button", name="中秋").click()
    p.get_by_label("怎么称呼").fill("编的：叫师兄，随便聊")
    p.get_by_label("更亲近").check()
    p.get_by_role("button", name="存好").click()
    c.wait(lambda d: next(x for x in d["people"] if x["id"] == pid).get("greet") == ["mid"], "过节要问候")
    assert next(x for x in c.data()["people"] if x["id"] == pid)["close"] is True
    c.write(lambda d: d["people"].append({"id": "p-boss", "name": "编的导师", "sex": "m", "groups": ["grad"], "rel": "导师", "log": [], "at": TODAY}))
    c.go("#/people")
    p.reload()
    expect(p.locator(".av-block.mentors")).to_contain_text("编的导师")
    expect(p.locator(".av.close", has_text="编的乙")).to_be_visible()
    p.clock.set_fixed_time("2026-09-24T12:00:00")
    c.go("#/")
    line = p.locator(".alert-line", has_text="明天中秋")
    expect(line).to_contain_text("给编的乙发个问候")
    line.click()
    card = p.locator(".greet-card", has_text="编的乙")
    card.get_by_role("button", name="起个头").click()
    expect(card.get_by_label("给编的乙的问候")).to_have_value("编的问候：中秋快乐")
    assert "叫师兄，随便聊" in LAST_AI[-1] and "中秋" in LAST_AI[-1]
    card.get_by_role("button", name="发了").click()
    expect(card.get_by_role("button", name="发了 ✓")).to_be_visible()
    c.wait(lambda d: d["greeted"]["2026-mid"][pid], "问候发了")
    c.go("#/")
    expect(p.locator(".alert-line", has_text="明天中秋")).to_have_count(0)
    p.clock.set_fixed_time(datetime.now().isoformat(timespec="seconds"))


def inventory_seed():
    inv = {
        "version": 1, "locations": [{"id": "L1", "name": "洗手池 Sink"}], "tags": ["洗漱护肤", "零食食品"],
        "items": [
            {"id": "inv-1", "name": "编的洗面奶", "location": "L1", "tags": ["洗漱护肤"], "quantity": 1, "archived": False},
            {"id": "inv-2", "name": "编的零食", "location": "L1", "tags": ["零食食品"], "quantity": 1, "archived": False},
            {"id": "inv-m1", "name": "编的布洛芬片", "location": "L1", "tags": ["药品急救"], "quantity": 1, "archived": False, "fields": {"保质期": "2030-01"}},
            {"id": "inv-m2", "name": "编的感冒灵颗粒", "location": "L1", "tags": ["药品急救"], "quantity": 1, "archived": False},
            {"id": "inv-m3", "name": "编的感康片", "location": "L1", "tags": ["药品急救"], "quantity": 1, "archived": False},
            {"id": "inv-m4", "name": "编的左氧氟沙星片", "location": "L1", "tags": ["药品急救"], "quantity": 1, "archived": False},
            {"id": "inv-m5", "name": "编的蒙脱石散", "location": "L1", "tags": ["药品急救"], "quantity": 1, "archived": False},
            {"id": "inv-c1", "name": "编的格子衬衫", "location": "L1", "tags": ["衣服"], "quantity": 1, "archived": False,
             "fields": {"风格": "休闲", "季节": "春秋"}, "description": "编的衣服备注", "worn": ["2026-01-01", "2026-01-08"]},
        ],
    }
    return {"inventory.json": json.dumps(inv, ensure_ascii=False).encode(), "config/ai.json": b'{"deepseek": {"key": "test-key", "model": "test"}}'}


def ledger_seed():
    f = {"categories": [{"id": "c-lunch", "name": "午餐", "group": "food"}, {"id": "c-bus", "name": "公交地铁", "group": "daily"}],
         "tx": [{"id": "t1", "type": "expense", "date": YESTERDAY, "category": "c-lunch", "amount": 15, "note": "编的盖饭"},
                {"id": "t2", "type": "expense", "date": YESTERDAY, "category": "c-bus", "amount": 2, "note": "编的公交"}]}
    return {"finance.json": json.dumps(f, ensure_ascii=False).encode()}


def fake_weather(page):
    """天气接口用假数据：后天比今天冷 10°C"""
    import datetime as dt
    days = [(datetime.fromisoformat(TODAY) + dt.timedelta(days=i)).date().isoformat() for i in range(5)]
    body = json.dumps({"daily": {"time": days, "temperature_2m_min": [15, 12, 5, 6, 7], "temperature_2m_max": [24, 20, 12, 13, 14]}})
    page.route("https://api.open-meteo.com/**", lambda route: route.fulfill(status=200, content_type="application/json", body=body, headers={"Access-Control-Allow-Origin": "*"}))


def fake_externals(page):
    """地图底图不联网；DeepSeek 用假回答"""
    page.route("https://webrd0*.is.autonavi.com/**", lambda route: route.fulfill(status=404, body=""))
    page.route("https://archive-api.open-meteo.com/**", lambda route: route.fulfill(status=200, content_type="application/json", headers={"Access-Control-Allow-Origin": "*"},
                                                                                  body=json.dumps({"daily": {"time": [], "precipitation_sum": [], "sunshine_duration": []}})))

    def ai(route):
        body = route.request.post_data or ""
        LAST_AI.append(body)
        if "估一下" in body:
            content = {"estimate": 150, "why": "编的估法"}
        elif "微信问候" in body:
            content = {"text": "编的问候：中秋快乐"}
        elif "怎么还一个人情" in body:
            content = {"ideas": [{"text": "请编的乙吃饭", "why": "编的理由", "place": "pl-food"}, {"text": "帮他一个忙", "why": "", "place": "pl-nope"}]}
        elif "他和一个人之间的经历" in body:
            content = {"stages": [{"title": "编的本科同宿舍", "from": "2019-09", "to": "2023-06", "text": "编的经历甲"}, {"title": "编的读研", "from": "2023-09", "to": "", "text": "编的经历乙"}]}
        elif "想送身边的人什么礼物" in body:
            content = {"ideas": [{"name": "编的茶具", "price": 88, "why": "编的理由", "query": "编的 茶具"}]}
        elif "整理他身边的人" in body:
            content = {"name": "编的乙", "sex": "m", "groups": ["college", "grad"], "rel": "同学", "birthday": {"cal": "lunar", "m": 8, "d": 15, "y": None},
                       "how": "", "likes": "编的喜欢喝茶", "note": ""}
        elif "能一步一步做到的目标" in body:
            content = {"title": "编的目标", "why": "编的为什么", "key": "编的关键", "note": "",
                       "stages": [{"title": "编的第一步", "tasks": [{"text": "编的小事甲"}, {"text": "买一件编的外套", "buy": {"name": "编的外套", "price": 199, "query": "编的 外套 秋季"}}]},
                                  {"title": "编的第二步", "tasks": [{"text": "编的小事乙"}]}],
                       "habits": [{"text": "编的习惯", "perWeek": 2}]}
        elif "标在地图上" in body:
            if "编的连锁" in body:
                content = {"places": [
                    {"name": "编的连锁（一店）", "address": "编的商场一楼", "district": "甲区", "kind": "shop", "lat": 36.67, "lng": 117.03, "sure": True},
                    {"name": "编的连锁（二店）", "address": "编的广场", "district": "乙区", "kind": "shop", "lat": 36.65, "lng": 117.05, "sure": False},
                    {"name": "编的连锁（远店）", "address": "很远", "district": "丙区", "kind": "店", "lat": 39.9, "lng": 116.4}]}
            elif "编的咖啡" in body:
                content = {"places": [{"name": "编的咖啡（编的路店）", "address": "甲区编的路 9 号", "district": "甲区", "kind": "food", "lat": 36.662, "lng": 117.022, "sure": True}]}
            elif "编的博物馆" in body:
                content = {"places": [{"name": "编的博物馆", "address": "编的路 1 号", "district": "乙区", "kind": "museum", "lat": 36.661, "lng": 117.021, "sure": True}]}
            else:
                content = {"places": []}
        elif "问题" in body or "answer" in body:
            content = {"answer": "编的回答"}
        else:
            content = {"letter": "编的回顾正文", "research": "编的科研回顾"}
        route.fulfill(status=200, content_type="application/json", headers={"Access-Control-Allow-Origin": "*"},
                      body=json.dumps({"choices": [{"finish_reason": "stop", "message": {"content": json.dumps(content, ensure_ascii=False)}}]}))
    page.route("https://api.deepseek.com/**", ai)


@step("身边的人：「我的故事」里和他有关的事；DeepSeek 带上「我的故事」的简介")
def _(c):
    p = c.page
    pid = next(x["id"] for x in c.data()["people"] if not x.get("archived"))
    STORY.external_write("story.json", json.dumps({"stages": [{"id": "s1", "title": "编的阶段", "people": [pid]}],
        "events": [{"id": "e1", "date": "2015-09", "title": "编的往事", "people": [pid]}]}, ensure_ascii=False).encode())
    STORY.external_write("profile.json", json.dumps({"text": "编的简介：他喜欢编的东西"}, ensure_ascii=False).encode())
    p.evaluate("localStorage.removeItem('story-profile')")
    c.go(f"#/person/{pid}")
    card = p.locator(".story-card")
    expect(card).to_contain_text("编的阶段的时候在身边")
    expect(card.locator(".story-row")).to_contain_text("2015.9 编的往事")
    LAST_AI.clear()
    p.get_by_role("button", name="想想送什么").click()
    p.wait_for_function("() => document.querySelector('.gift-card, .card')")
    for _ in range(50):
        if LAST_AI:
            break
        p.wait_for_timeout(100)
    assert LAST_AI and "编的简介：他喜欢编的东西" in LAST_AI[-1], LAST_AI[-1][:300] if LAST_AI else "没有请求"


LEDGER = FakeRepo(ledger_seed())
STORY = FakeRepo({"README.md": b"# story-data\n"})
INVENTORY = FakeRepo(inventory_seed())


def main():
    only = sys.argv[1:]
    ART.mkdir(exist_ok=True)
    repo = FakeRepo({"README.md": b"# life-data\n"})
    serve({REPO: repo, "x/inventory-data": INVENTORY, "test/finance-data": LEDGER, "test/story-data": STORY}, API_PORT)
    class Quiet(SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass
    handler = partial(Quiet, directory=str(ROOT))
    app = ThreadingHTTPServer(("127.0.0.1", APP_PORT), handler)
    threading.Thread(target=app.serve_forever, daemon=True).start()

    failed, errors, ran = [], [], 0
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        ctx = browser.new_context(viewport={"width": 390, "height": 844}, locale="zh-CN")
        ctx.grant_permissions(["clipboard-read", "clipboard-write"], origin=URL.rstrip("/"))
        ctx.set_default_timeout(10000)
        page = ctx.new_page()
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("dialog", lambda d: d.accept())
        fake_weather(page)
        fake_externals(page)
        c = Ctx(page, repo)
        for i, (name, fn) in enumerate(STEPS):
            if i and only and not any(k in name for k in only):
                continue
            ran += 1
            try:
                fn(c)
                print(f"  ✓ {name}")
            except Exception:
                failed.append(name)
                page.screenshot(path=ART / f"fail-{i:02d}.png", full_page=True)
                print(f"  ✗ {name}\n{traceback.format_exc()}")
                if i == 0:
                    break
        browser.close()
    if errors:
        print("页面报错：", *errors, sep="\n  ")
    print(f"\n{ran - len(failed)}/{ran} 通过" + ("" if ran == len(STEPS) else f"（共 {len(STEPS)} 项，没跑完）"))
    sys.exit(1 if failed or errors else 0)


if __name__ == "__main__":
    main()
