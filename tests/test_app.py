"""端到端测试：真浏览器打开「生活」网页，连本地的假 GitHub（tests/fake_github.py），把主要功能走一遍。

    pip install playwright && python -m playwright install chromium
    python tests/test_app.py            # 全部
    python tests/test_app.py 祷告 小记    # 只跑名字里含这些字的步骤（前面的「开始记录」总会跑）

不联网、不需要令牌。失败时截图在 tests/artifacts/。测试里只用编的内容。
"""

import json
from urllib.parse import unquote
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
    expect(p.locator(".care-rate", has_text="面膜").locator(".dots i")).to_have_count(1)
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


@step("随手记：洗澡先问一句（能取消、能撤销）顺便问身体乳、运动、喝的")
def _(c):
    p = c.page
    c.go("#/")
    # 没洗澡：晚上有一行「洗澡」
    c.period("晚上").locator(".it", has_text="洗澡").locator(".it-main").click()
    expect(c.sheet().get_by_role("heading", name="洗澡了吗")).to_be_visible()
    c.sheet().get_by_role("button", name="取消").click()
    expect(p.locator(".sheet")).to_have_count(0)
    assert not events(c.data(), "shower")
    # 今晚不洗：这一行变成「今晚不洗了」，能撤销；后来又洗了照样能记
    c.period("晚上").get_by_role("button", name="今晚不洗").click()
    c.wait(lambda d: d["days"][TODAY].get("noShower") is True, "今晚不洗")
    expect(c.period("晚上").locator(".it.skipped", has_text="今晚不洗了")).to_be_visible()
    p.locator(".toast").get_by_role("button", name="撤销").click()
    c.wait(lambda d: not d["days"].get(TODAY, {}).get("noShower"), "撤销今晚不洗")
    c.period("晚上").get_by_role("button", name="今晚不洗").click()
    c.wait(lambda d: d["days"][TODAY].get("noShower") is True, "又不洗")
    # 点了「洗好了」也能撤销
    p.get_by_role("button", name="记一下").click()
    c.sheet().get_by_role("button", name="洗澡").click()
    c.sheet().get_by_role("button", name="洗好了").click()
    c.wait(lambda d: len(events(d, "shower")) == 1 and not d["days"][TODAY].get("noShower"), "洗澡")
    p.locator(".toast").get_by_role("button", name="撤销").click()
    c.wait(lambda d: not events(d, "shower"), "撤销洗澡")
    p.get_by_role("button", name="记一下").click()
    c.sheet().get_by_role("button", name="洗澡").click()
    c.sheet().get_by_role("button", name="身体乳").click()
    c.sheet().get_by_role("button", name="洗好了").click()
    c.wait(lambda d: len(events(d, "shower")) == 1 and any(r["id"] in d["days"][TODAY]["care"] for r in d["look"]["routine"] if r["name"] == "身体乳"), "洗澡 + 身体乳")
    # 洗过澡：晚上多一行身体乳，晚上的洗脸划掉
    pm = c.period("晚上")
    expect(pm.locator(".mini.off")).to_have_text("洗脸 · 洗澡时洗过了")
    expect(pm.locator(".it.done", has_text="身体乳")).to_be_visible()
    expect(pm.locator(".it.done.pop", has_text="身体乳")).to_have_count(1)  # 刚打上的勾动一下
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
    # 咖啡奶茶茶去掉了
    p.get_by_role("button", name="记一下").click()
    expect(c.sheet().get_by_role("button", name="睡眠")).to_be_visible()
    expect(c.sheet().get_by_role("button", name="喝了一杯")).to_have_count(0)
    c.sheet().get_by_role("button", name="关闭").click()


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


@step("睡前复盘：心情、一句话、科研、明天要做；第二天早上提一句，睡前复盘问做到没有")
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
    # 昨天写的计划：今天早上只提一句（不打勾），睡前复盘问做到没有
    c.write(lambda d: d["days"].setdefault(YESTERDAY, {}).update(plan="编的计划乙"))
    c.go(f"#/day/{TODAY}")
    p.reload()
    am = c.period("早上")
    expect(am.locator(".today-plan")).to_have_text("今天要做：编的计划乙")
    expect(am.get_by_role("button", name="一部分")).to_have_count(0)
    c.go("#/night")
    expect(p.get_by_text("今天要做：编的计划乙")).to_be_visible()
    p.get_by_role("group", name="做到了吗").get_by_role("button", name="做了一部分").click()
    p.get_by_role("button", name="记好了").click()
    c.wait(lambda d: d["days"][TODAY].get("planDone") == "part", "计划做了一部分")
    c.go("#/")
    expect(c.period("晚上").get_by_text("心情 7 · 测试的一天，还不错")).to_be_visible()


@step("每周的（面膜）只在周六晚上出现")
def _(c):
    p = c.page
    sat = (datetime.fromisoformat(TODAY) + timedelta(days=(5 - datetime.fromisoformat(TODAY).weekday()) % 7 - 7)).date().isoformat()
    fri = (datetime.fromisoformat(sat) - timedelta(days=1)).date().isoformat()
    c.go(f"#/day/{sat}")
    expect(c.period("晚上").get_by_role("button", name="面膜 0/1")).to_be_visible()
    c.go(f"#/day/{fri}")
    expect(c.period("晚上").get_by_text("这周", exact=True)).to_have_count(0)


@step("祷告：白天和 ChatGPT 简短说（不读经文）或写一句；晚上 ChatGPT 聊天开导、最后为我祷告（不念主祷文）；只显示最近一天")
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
    # 白天的：和 ChatGPT 几分钟，不读经文
    c.go("#/pray/go?m=quick")
    expect(p.locator(".pray-verse")).to_have_count(0)
    p.get_by_role("button", name="复制").click()
    prompt = p.evaluate("navigator.clipboard.readText()")
    assert "简短的祷告" in prompt and "不用读经文" in prompt and "和合本" not in prompt and "不用写小结" in prompt, prompt
    href = p.get_by_role("link", name="打开 ChatGPT").get_attribute("href")
    assert href.startswith("https://chatgpt.com/?prompt=") and unquote(href.split("=", 1)[1]) == prompt, href
    p.get_by_role("button", name="祷告完了").click()
    p.wait_for_function("location.hash === '#/pray'")
    c.wait(lambda d: [x["kind"] for x in d["days"][TODAY]["prayer"]["times"]] == ["quick"], "白天的祷告")
    assert "night" not in c.data()["days"][TODAY]["prayer"]
    # 白天的：写一句
    c.go("#/pray/go?m=quick")
    p.get_by_role("group", name="怎么祷告").get_by_role("button", name="写一句").click()
    p.get_by_label("祷告的话").fill("主，编的一句祷告")
    p.get_by_role("button", name="阿们").click()
    p.wait_for_function("location.hash === '#/pray'")
    c.wait(lambda d: d["days"][TODAY]["prayer"]["times"][-1].get("text") == "主，编的一句祷告", "写一句的祷告")
    expect(p.locator(".pray-recent")).to_contain_text("主，编的一句祷告")
    # 晚上那次：聊天开导，最后它为我祷告；祷告完了就记下（没有主祷文）
    c.go("#/pray/go?m=night")
    p.wait_for_timeout(400)
    p.screenshot(path=ART / "pray-go.png", full_page=True)
    p.get_by_role("button", name="复制").click()
    prompt = p.evaluate("navigator.clipboard.readText()")
    assert "开导" in prompt and "一两句圣经" in prompt and "为我今天聊到的事做一个简短的祷告" in prompt and "主祷文" not in prompt and "牧师" not in prompt, prompt
    p.get_by_role("button", name="祷告完了").click()
    expect(p.locator(".lords-lines")).to_have_count(0)
    p.wait_for_function("location.hash === '#/pray'")
    # 祷告完问要不要记下今晚聊的，这次不用
    expect(c.sheet()).to_contain_text("把今晚聊的记下来？")
    c.sheet().get_by_role("button", name="不用了").click()
    c.wait(lambda d: d["days"][TODAY]["prayer"].get("night", {}).get("mode") == "chatgpt", "晚上的祷告")
    assert [x["kind"] for x in c.data()["days"][TODAY]["prayer"]["times"]] == ["quick", "quick", "night"]
    recent = p.locator(".pray-recent")
    expect(recent).to_contain_text("今天")
    expect(recent).to_contain_text("祷告了 3 次")
    expect(recent).not_to_contain_text("主祷文")
    expect(p.get_by_text("第 1 阶段")).to_have_count(0)
    p.wait_for_timeout(400)
    p.screenshot(path=ART / "pray.png", full_page=True)


@step("聊过的：祷告页没有读经；记一段和 ChatGPT 聊的，按心情挑、搜、改、删")
def _(c):
    p = c.page
    c.go("#/pray")
    expect(p.get_by_text("读经")).to_have_count(0)
    expect(p.get_by_role("link", name="打开 Bible App")).to_have_count(0)
    p.get_by_role("link", name="记一段").click()
    p.wait_for_function("location.hash === '#/chat/new'")
    p.wait_for_timeout(400)
    p.screenshot(path=ART / "chat-new.png", full_page=True)
    p.get_by_role("button", name="复制这段话").click()
    prompt = p.evaluate("navigator.clipboard.readText()")
    assert "整理成一份文字记录" in prompt and "保留原话" in prompt, prompt
    p.get_by_role("button", name="存好").click()
    expect(p.get_by_text("先把聊的内容贴进来")).to_be_visible()
    p.get_by_role("group", name="那时候的心情").get_by_role("button", name="烦躁").click()
    p.get_by_label("聊天内容").fill("编的一次聊天\n我：编的烦心事\nChatGPT：编的建议")
    p.get_by_role("button", name="存好").click()
    c.wait(lambda d: len(d["chats"]) == 1 and d["chats"][0]["mood"] == "irritable" and d["chats"][0]["day"] == TODAY and d["chats"][0]["title"] == "", "记一段")
    cid = c.data()["chats"][0]["id"]
    p.wait_for_function(f"location.hash === '#/chat/{cid}'")
    expect(p.locator("h1")).to_have_text("编的一次聊天")  # 没写聊了什么，用第一行
    expect(p.get_by_text("ChatGPT：编的建议")).to_be_visible()
    # 改：换个题目、不选心情
    p.get_by_role("link", name="改一下").click()
    p.get_by_label("聊了什么").fill("编的题目")
    p.get_by_role("group", name="那时候的心情").get_by_role("button", name="烦躁").click()
    p.get_by_role("button", name="存好").click()
    c.wait(lambda d: d["chats"][0]["title"] == "编的题目" and "mood" not in d["chats"][0], "改")
    # 再记一段（昨天，低落），列表按心情挑、能搜
    c.write(lambda d: d["chats"].append({"id": "ct-old", "day": YESTERDAY, "at": YESTERDAY + "T12:00:00.000Z", "mood": "down", "title": "编的旧的", "text": "编的旧内容"}))
    c.go("#/pray")
    p.reload()
    expect(p.get_by_role("link", name="编的题目")).to_be_visible()
    expect(p.get_by_role("link", name="编的旧的")).to_be_visible()
    c.go("#/chats")
    p.get_by_role("group", name="按心情").get_by_role("button", name="低落").click()
    expect(p.get_by_role("link", name="编的旧的")).to_be_visible()
    expect(p.get_by_role("link", name="编的题目")).to_have_count(0)
    p.get_by_role("group", name="按心情").get_by_role("button", name="低落").click()
    expect(p.get_by_role("link", name="编的题目")).to_be_visible()
    p.wait_for_timeout(400)
    p.screenshot(path=ART / "chats.png", full_page=True)
    # 删掉
    p.get_by_role("link", name="编的旧的").click()
    p.get_by_role("button", name="删掉").click()
    c.wait(lambda d: [x["id"] for x in d["chats"]] == [cid], "删掉")
    p.wait_for_function("location.hash === '#/chats'")
    # 晚上祷告完直接记一段，标上「晚上祷告」
    c.go("#/pray/go?m=night")
    p.get_by_role("button", name="祷告完了").click()
    c.sheet().get_by_role("button", name="记一段").click()
    p.wait_for_function("location.hash === '#/chat/new?from=pray'")
    expect(p.get_by_text("晚上祷告时聊的")).to_be_visible()
    p.get_by_label("聊天内容").fill("编的祷告时聊的")
    p.get_by_role("button", name="存好").click()
    c.wait(lambda d: any(x.get("from") == "pray" and x["text"] == "编的祷告时聊的" for x in d["chats"]), "祷告完记一段")
    expect(p.locator(".sub")).to_contain_text("晚上祷告")


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


@step("打水：中午一行，中午不打了晚上再出一行；打扫卫生中午做，可以不弄")
def _(c):
    p = c.page
    hour = p.evaluate("new Date().getHours()")
    c.go("#/")
    expect(c.period("早上").locator(".it", has_text="打水")).to_have_count(0)  # 早上不打
    if hour < 13:
        c.period("中午").locator(".it", has_text="打水").get_by_role("button", name="不打了").click()
        c.wait(lambda d: d["days"][TODAY].get("fetch") == {"noon": "skip"}, "中午不打了")
    expect(c.period("中午").locator(".it.skipped", has_text="打水")).to_contain_text("晚上打")
    if 4 <= hour < 19:
        eve = c.period("晚上").locator(".it", has_text="打水")
        eve.locator(".it-main").click()
        c.wait(lambda d: d["days"][TODAY].get("fetch", {}).get("eve") is True, "晚上打了")
        expect(c.period("中午").locator(".it.skipped", has_text="晚上打了")).to_be_visible()
        c.period("晚上").locator(".it.done", has_text="晚上打好了").locator(".it-main").click()
        c.wait(lambda d: True not in d["days"][TODAY].get("fetch", {}).values(), "取消打水")
    # 中午改主意又打了：晚上那行就没了
    c.period("中午").locator(".it", has_text="打水").locator(".it-main").click()
    c.wait(lambda d: d["days"][TODAY].get("fetch", {}).get("noon") is True, "中午打了")
    expect(c.period("晚上").locator(".it", has_text="打水")).to_have_count(0)
    # 打扫卫生
    row = c.period("中午").locator(".it", has_text="打扫卫生")
    row.get_by_role("button", name="不弄了").click()
    c.wait(lambda d: d["days"][TODAY].get("clean") == "skip", "今天不弄了")
    expect(c.period("中午").locator(".it.skipped", has_text="今天不弄了")).to_be_visible()
    c.period("中午").locator(".it", has_text="打扫卫生").locator(".it-main").click()
    c.wait(lambda d: d["days"][TODAY].get("clean") is True, "打扫好了")


@step("晚上：泡脚点一下算进度；「今天的一张照片」在睡前复盘页里，选一张直接存进仓库，能换能删，晚上清单里没有这一行")
def _(c):
    c.go("#/")
    eve = c.period("晚上")
    names = eve.locator(".it .t").all_inner_texts()
    heads = [n.split("\n")[0] for n in names]
    at = lambda *ks: next(i for i, n in enumerate(heads) if n.startswith(ks))  # noqa: E731
    assert at("洗澡", "身体乳") < at("泡脚") < at("晚上护肤") < at("睡前复盘") < at("祷告"), heads
    assert not any(h.startswith("今天的一张照片") for h in heads), heads  # 先洗澡再泡脚
    eve.locator(".it", has_text="泡脚").locator(".it-main").click()
    c.wait(lambda d: d["days"][TODAY].get("soak") is True, "泡脚了")
    eve.locator(".it", has_text="泡脚").locator(".it-main").click()
    c.wait(lambda d: not d["days"][TODAY].get("soak"), "取消泡脚")
    eve.locator(".it", has_text="泡脚").get_by_role("button", name="今晚不泡").click()
    c.wait(lambda d: d["days"][TODAY].get("soak") == "skip", "今晚不泡")
    expect(eve.locator(".it.skipped", has_text="今晚不泡了")).to_be_visible()
    eve.locator(".it", has_text="泡脚").locator(".it-main").click()  # 改主意又泡了
    c.wait(lambda d: d["days"][TODAY].get("soak") is True, "又泡了")
    eve.locator(".it", has_text="泡脚").locator(".it-main").click()
    c.wait(lambda d: not d["days"][TODAY].get("soak"), "取消泡脚")
    c.go("#/night")
    # 先填了还没点「记好了」，存照片以后填的还在
    c.page.get_by_role("group", name="心情").get_by_role("button", name="3", exact=True).click()
    c.page.get_by_role("group", name="压力").get_by_role("button", name="很大").click()
    c.page.get_by_label("今天的一句话").fill("还没存的一句")
    c.page.get_by_role("button", name="选一张或拍一张").click()
    c.sheet().get_by_label("照片").set_input_files(str(ROOT / "icon-180.png"))
    c.sheet().get_by_role("button", name="存好").click()
    c.wait(lambda d: str(d["days"][TODAY].get("photo", "")).startswith("photos/days/"), "存了照片")
    expect(c.page.get_by_role("group", name="心情").get_by_role("button", name="3", exact=True)).to_have_attribute("aria-pressed", "true")
    expect(c.page.get_by_role("group", name="压力").get_by_role("button", name="很大")).to_have_attribute("aria-pressed", "true")
    expect(c.page.get_by_label("今天的一句话")).to_have_value("还没存的一句")
    # iPhone 拍照时常把网页整个重新打开：重新打开以后填的也还在
    c.page.get_by_label("明天要做什么").fill("还没存的明天")
    c.page.reload()
    expect(c.page.get_by_role("group", name="心情").get_by_role("button", name="3", exact=True)).to_have_attribute("aria-pressed", "true")
    expect(c.page.get_by_label("今天的一句话")).to_have_value("还没存的一句")
    expect(c.page.get_by_label("明天要做什么")).to_have_value("还没存的明天")
    c.page.get_by_label("明天要做什么").fill("")
    c.page.get_by_role("group", name="心情").get_by_role("button", name="7", exact=True).click()  # 改回原来的，后面分析要用
    c.page.get_by_role("group", name="压力").get_by_role("button", name="有点大").click()
    c.page.get_by_role("button", name="记好了").click()
    c.wait(lambda d: d["days"][TODAY].get("note") == "还没存的一句" and d["days"][TODAY].get("stress") == 4, "照片后点记好了")
    path = c.data()["days"][TODAY]["photo"]
    assert c.repo.read(path) and c.repo.read(path.replace("photos/days/", "photos/days/t-"))  # 原图和小图
    expect(c.page.locator(".photo-line .day-thumb")).to_be_visible()  # 睡前复盘页里带小图
    # 照片墙：这个月一张，点开能看大图
    c.go("#/photos")
    expect(c.page.locator(".photo-cell")).to_have_count(1)
    expect(c.page.locator(".photo-cell img")).to_be_visible()
    c.page.locator(".photo-cell").click()
    expect(c.sheet().locator("img")).to_be_visible()
    c.sheet().get_by_role("button", name="关闭").click()
    c.go("#/night")
    c.page.locator(".photo-line").click()
    c.sheet().get_by_role("button", name="删掉这张").click()
    c.wait(lambda d: not d["days"][TODAY].get("photo"), "删掉照片")


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


@step("形象：这个月做了什么（护肤做完几天、月历、每一项做到多少）；不再有护肤品")
def _(c):
    p = c.page
    c.go("#/look")
    expect(p.locator(".look-big")).to_be_visible()
    expect(p.locator(".dot-month .md.today")).to_have_count(1)
    expect(p.locator(".care-rate", has_text="洗脸（洗面奶甲）").locator(".dots i")).to_have_count(14)
    expect(p.get_by_text("我学到的")).to_have_count(0)
    expect(p.get_by_text("我的方向")).to_have_count(0)
    expect(p.locator(".whisper")).to_have_count(0)  # 形象页不放角落那句话
    expect(p.locator("main")).not_to_contain_text("护肤品")
    expect(p.locator("main")).not_to_contain_text("编的洗面奶")
    d = c.data()
    assert "products" not in d["look"] and "hide" not in d["look"], d["look"].keys()  # 老数据清掉
    p.screenshot(path=ART / "look.png", full_page=True)


@step("最近的记录：看以前某一天、补记")
def _(c):
    p = c.page
    c.go("#/history")
    p.get_by_role("link", name="昨天").first.click()
    expect(p.get_by_role("heading", name="昨天")).to_be_visible()
    c.period("晚上").locator(".it", has_text="洗澡").locator(".it-main").click()
    c.sheet().get_by_role("button", name="洗好了").click()
    c.wait(lambda d: any(e["day"] == YESTERDAY for e in events(d, "shower")), "补记昨天洗澡")


@step("两台设备：另一台刚改过，这台的修改合并进去")
def _(c):
    p = c.page
    c.go("#/")
    c.write(lambda d: d["notes"].append({"id": "n-other", "title": "别的设备记的", "text": "", "track": None, "link": "", "at": TODAY}))
    p.get_by_role("button", name="记一下").click()
    c.sheet().get_by_role("button", name="运动").click()
    c.sheet().get_by_role("button", name="健身").click()
    c.sheet().get_by_role("button", name="记好了").click()
    c.wait(lambda d: any(e.get("kind") == "健身" for e in d["events"]) and any(n["id"] == "n-other" for n in d["notes"]), "合并")


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


@step("分析：形象页顶上切换进来；心情月历、走势、作息、一周里哪天、规律（洗澡运动）、什么在影响我；没有科研、护肤、咖啡")
def _(c):
    p = c.page
    c.go("#/look")
    p.get_by_role("group", name="形象").get_by_role("link", name="分析").click()
    expect(p).to_have_url(re.compile(r"#/stats$"))
    expect(p.locator("#nav a.active")).to_have_text("形象")
    expect(p.get_by_text("就开始有结论了")).to_be_visible()
    # 编 30 天：运动的日子心情 8、不运动 5；睡够 7 小时精力高。顺便放一些老数据（咖啡、英语、读经），之后存一次就清掉
    def seed(d):
        for i in range(1, 31):
            day = (datetime.fromisoformat(TODAY) - timedelta(days=i)).date().isoformat()
            sport = i % 2 == 0
            r = d["days"].setdefault(day, {})
            r.update(mood=8 if sport else 5, energy=4 if i % 3 else 2, note=f"编的第{i}天", did=f"编的科研{i}", planDone="yes" if i % 2 else "part",
                     sleep={"bed": "23:30" if i % 3 else "01:30", "wake": "07:30"}, read=True)
            if sport:
                d["events"].append({"id": f"s{i}", "day": day, "at": f"{day}T10:00:00Z", "type": "sport", "kind": "跑步", "minutes": 30})
            d["events"].append({"id": f"w{i}", "day": day, "at": f"{day}T12:00:00Z", "type": "shower"})
        d["events"].append({"id": "old-drink", "day": YESTERDAY, "at": f"{YESTERDAY}T08:00:00Z", "type": "drink", "kind": "咖啡"})
        d["events"].append({"id": "old-en", "day": YESTERDAY, "at": f"{YESTERDAY}T09:00:00Z", "type": "english", "minutes": 10})
        d["english"] = {"cards": [{"id": "x"}], "next": ""}
        d["prayer"]["book"] = "PSA"
        d["prayer"]["pos"] = {"JHN": 3}
        d["milestones"]["english-10"] = TODAY
    c.write(seed)
    p.reload()
    expect(p.locator(".inf-row", has_text="运动了的日子，当天心情平均 7.9，其他日子 5")).to_be_visible()
    expect(p.locator(".inf-row", has_text="睡够 7 小时")).to_have_count(2)
    expect(p.locator(".inf-row", has_text="咖啡")).to_have_count(0)
    expect(p.locator("[aria-label='心情月历'] .md.mood")).not_to_have_count(0)
    expect(p.locator("[aria-label='心情月历'] .md.m4")).not_to_have_count(0)  # 8 分
    expect(p.locator("svg[aria-label='心情']")).to_be_visible()
    expect(p.locator("svg[aria-label='每天几点睡几点起']")).to_be_visible()
    expect(p.locator("svg[aria-label='星期几的心情']")).to_be_visible()
    expect(p.locator("svg[aria-label='星期几的精力']")).to_be_visible()
    expect(p.get_by_role("button", name="咖啡奶茶茶")).to_have_count(0)
    p.screenshot(path=ART / "stats.png", full_page=True)
    p.get_by_role("button", name="运动", exact=True).click()
    expect(p.locator("svg[aria-label='星期几']")).to_be_visible()
    for gone in ["每周计划完成率", "科研", "护肤（最近 30 天", "生病前一周"]:
        expect(p.get_by_text(gone)).to_have_count(0)
    # 上个月的心情
    p.get_by_role("button", name="上个月").click()
    expect(p.locator(".period-nav h3")).to_contain_text("月的心情")
    p.get_by_role("button", name="下个月").click()
    # 「生活」页不再有分析的入口；形象页切回来
    c.go("#/more")
    expect(p.get_by_text("分析和回顾")).to_have_count(0)
    c.go("#/stats")
    p.get_by_role("group", name="形象").get_by_role("link", name="这个月").click()
    expect(p.locator(".look-month")).to_be_visible()


@step("回顾：周报月报（DeepSeek 写一段、存下来、不再有科研回顾）、年报；老的咖啡、英语、读经数据清掉")
def _(c):
    p = c.page
    c.go("#/stats")
    p.get_by_role("link", name="这个月的回顾").click()
    c.go(f"#/report?k=month&d={YESTERDAY}")
    p.get_by_role("button", name="请 DeepSeek 写一段").click()
    expect(p.get_by_text("编的回顾正文")).to_be_visible()
    expect(p.get_by_text("编的科研回顾")).to_have_count(0)
    expect(p.get_by_text("科研")).to_have_count(0)
    key = f"m{YESTERDAY[:7]}"
    c.wait(lambda d: d["letters"][key]["text"] == "编的回顾正文", "月报存下来")
    sent = LAST_AI[-1]
    assert "编的科研" not in sent and "科研回顾" not in sent and "咖啡奶茶茶" not in sent, sent[:500]
    d = c.data()
    assert not any(e["type"] in ("drink", "english") for e in d["events"]), "老的咖啡、英语清掉"
    assert "english" not in d and "book" not in d["prayer"] and "pos" not in d["prayer"], d["prayer"]
    assert not any("read" in r for r in d["days"].values()), "读经清掉"
    assert "english-10" not in d["milestones"]
    assert any(r.get("did") for r in d["days"].values()), "科研那格照记"
    expect(p.locator("#nav a.active")).to_have_text("形象")
    p.get_by_role("link", name="周", exact=True).click()
    expect(p.locator(".period-nav")).to_contain_text("这周（")
    p.get_by_role("link", name="年", exact=True).click()
    expect(p.locator(".stat-grid")).to_contain_text("运动")
    expect(p.locator(".stat-grid")).not_to_contain_text("咖啡")
    p.get_by_role("link", name="‹ 分析").click()
    expect(p).to_have_url(re.compile(r"#/stats$"))


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
            {"id": "inv-k1", "name": "编的热水壶", "location": "L1", "tags": ["洗漱护肤"], "quantity": 1, "archived": False},
            {"id": "inv-k2", "name": "编的电动剃须刀", "location": "L1", "tags": ["洗漱护肤"], "quantity": 1, "archived": False},
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
            content = {"letter": "编的回顾正文"}
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
