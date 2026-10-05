"""端到端测试：真浏览器打开「生活」网页，连本地的假 GitHub（tests/fake_github.py），把主要功能走一遍。

    pip install playwright && python -m playwright install chromium
    python tests/test_app.py            # 全部
    python tests/test_app.py 祷告 小记    # 只跑名字里含这些字的步骤（前面的「开始记录」总会跑）

不联网、不需要令牌。失败时截图在 tests/artifacts/。测试里只用编的内容。
"""

import json
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
    expect(p.get_by_role("heading", name="今天")).to_be_visible()
    d = c.data()
    assert d["startDate"] == TODAY, d["startDate"]
    assert d["prayer"]["stage"] == 1
    expect(p.get_by_text("还没有打卡项")).to_be_visible()


@step("形象：开始学温和洗脸、身体乳，打卡项进到今天")
def _(c):
    p = c.page
    c.go("#/look")
    expect(p.get_by_text("下一步可以是这个").first).to_be_visible()
    p.get_by_role("link", name="温和洗脸").click()
    expect(p.get_by_text("为什么")).to_be_visible()
    p.get_by_role("button", name="开始学").click()
    c.wait(lambda d: d["look"]["steps"]["s-cleanse"]["status"] == "learning", "开始学洗脸")
    d = c.data()
    assert [r["name"] for r in d["look"]["routine"]] == ["洗脸", "洗脸"], d["look"]["routine"]
    # 改名字：写上用的什么
    p.get_by_role("button", name="改名").first.click()
    c.sheet().get_by_label("打卡项名字").fill("洗脸（洗面奶甲）")
    c.sheet().get_by_role("button", name="好了").click()
    c.wait(lambda d: d["look"]["routine"][0]["name"] == "洗脸（洗面奶甲）", "改名")
    c.go("#/step/s-body")
    p.get_by_role("button", name="开始学").click()
    c.wait(lambda d: any(r["when"] == "shower" for r in d["look"]["routine"]), "身体乳")
    c.go("#/step/m-brow")
    p.get_by_role("button", name="开始学").click()
    c.wait(lambda d: any(x["name"] == "修眉" for x in d["periodic"]), "修眉进定期打理")
    # 今天：点早上的洗脸
    c.go("#/")
    p.get_by_role("button", name="洗脸（洗面奶甲）").click()
    c.wait(lambda d: len(d["days"][TODAY]["care"]) == 1, "早上洗脸打卡")
    expect(p.get_by_role("button", name="洗脸（洗面奶甲）")).to_have_attribute("aria-pressed", "true")
    # 再点一下取消
    p.get_by_role("button", name="洗脸（洗面奶甲）").click()
    c.wait(lambda d: not d["days"][TODAY]["care"], "取消打卡")
    # 不学了 → 打卡项拿掉，可以撤销
    c.go("#/step/m-brow")
    p.get_by_role("button", name="不学了").click()
    c.wait(lambda d: "m-brow" not in d["look"]["steps"], "不学修眉")
    p.get_by_role("button", name="撤销").click()
    c.wait(lambda d: "m-brow" in d["look"]["steps"], "撤销不学")


@step("随手记：洗澡顺便问身体乳、运动、喝的（可以撤销）")
def _(c):
    p = c.page
    c.go("#/")
    p.locator(".quick-row").get_by_role("button", name="洗澡").click()
    expect(c.sheet().get_by_text("洗完澡了")).to_be_visible()
    c.sheet().get_by_role("button", name="身体乳").click()
    c.sheet().get_by_role("button", name="好了").click()
    c.wait(lambda d: len(events(d, "shower")) == 1 and any(k.startswith("r-s-body") for k in d["days"][TODAY]["care"]), "洗澡 + 身体乳")
    p.locator(".quick-row").get_by_role("button", name="运动").click()
    c.sheet().get_by_role("button", name="跑步").click()
    c.sheet().get_by_label("多少分钟").fill("30")
    c.sheet().get_by_label("多少公里").fill("3.5")
    c.sheet().get_by_role("button", name="适中").click()
    c.sheet().get_by_role("button", name="记好了").click()
    c.wait(lambda d: events(d, "sport") and events(d, "sport")[0]["km"] == 3.5, "跑步")
    e = events(c.data(), "sport")[0]
    assert e["minutes"] == 30 and e["level"] == "mid" and e["kind"] == "跑步", e
    expect(p.get_by_text("跑步 · 30 分钟 · 3.5 公里 · 适中")).to_be_visible()
    p.locator(".quick-row").get_by_role("button", name="咖啡").click()
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
    expect(p.get_by_text("7 小时 50 分")).to_be_visible()


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
    expect(p.get_by_text("编的计划乙")).to_be_visible()
    p.get_by_role("button", name="做了一部分").click()
    c.wait(lambda d: d["days"][TODAY].get("planDone") == "part", "计划做了一部分")
    expect(p.get_by_text("心情 7 分：测试的一天，还不错")).to_be_visible()


@step("祷告：带着走一遍简短版，记下近了")
def _(c):
    p = c.page
    c.go("#/pray")
    expect(p.get_by_text("第 1 阶段 · 扎根")).to_be_visible()
    p.get_by_role("link", name="开始祷告").click()
    expect(p.get_by_text("深呼吸三次")).to_be_visible()
    for _ in range(20):
        if p.get_by_role("button", name="完成").is_visible():
            break
        btn = p.get_by_role("button", name="阿们") if p.get_by_role("button", name="阿们").is_visible() else p.get_by_role("button", name="下一步")
        btn.click()
    expect(p.get_by_text("今天离神")).to_be_visible()
    p.get_by_role("button", name="近了").click()
    p.get_by_label("祷告后的一句话").fill("编的一句话")
    p.get_by_role("button", name="完成").click()
    c.wait(lambda d: d["days"][TODAY]["prayer"]["night"]["near"] == "near", "祷告")
    n = c.data()["days"][TODAY]["prayer"]["night"]
    assert n["mode"] == "short" and n["note"] == "编的一句话", n
    expect(p.get_by_text("这个月祷告了 1 天")).to_be_visible()


@step("祷告：完整版里有主祷文每一句")
def _(c):
    p = c.page
    c.go("#/pray/go?m=full")
    seen = []
    for _ in range(20):
        if p.get_by_role("button", name="完成").is_visible():
            break
        line = p.locator(".pray-line")
        if line.count():
            seen.append(line.inner_text())
        btn = p.get_by_role("button", name="阿们") if p.get_by_role("button", name="阿们").is_visible() else p.get_by_role("button", name="下一步")
        btn.click()
    assert seen[0] == "我们在天上的父：" and seen[-1].endswith("阿们！") and len(seen) == 8, seen


@step("祷告事项：加、看到回应；和 ChatGPT 祷告的提示词带上事项")
def _(c):
    p = c.page
    c.go("#/pray")
    p.get_by_label("新的祷告事项").fill("编的事项甲")
    p.get_by_role("button", name="加", exact=True).click()
    c.wait(lambda d: d["prayer"]["items"][0]["text"] == "编的事项甲", "加事项")
    p.get_by_role("button", name="和 ChatGPT 一起祷告").click()
    prompt = c.sheet().get_by_label("祷告提示词").input_value()
    assert "编的事项甲" in prompt and "主祷文" in prompt and "写完第三节" in prompt, prompt
    c.sheet().get_by_role("button", name="复制").click()
    assert p.evaluate("navigator.clipboard.readText()") == prompt
    c.sheet().get_by_label("ChatGPT 的小结").fill("感谢：编的\n祈求：编的\n经文：诗篇 23:1")
    c.sheet().get_by_role("button", name="平常").click()
    c.sheet().get_by_role("button", name="记成今晚的祷告").click()
    c.wait(lambda d: d["days"][TODAY]["prayer"]["night"]["mode"] == "chatgpt", "ChatGPT 祷告")
    p.get_by_role("button", name="看到回应").click()
    c.sheet().get_by_label("回应").fill("编的回应")
    c.sheet().get_by_role("button", name="记下").click()
    c.wait(lambda d: d["prayer"]["items"][0].get("answerNote") == "编的回应", "看到回应")
    expect(p.get_by_text("看到回应的（1）")).to_be_visible()


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


@step("每周：感恩、皮肤状态")
def _(c):
    p = c.page
    c.go("#/pray")
    p.get_by_label("这周的感恩").fill("编的感恩")
    p.get_by_role("button", name="存好感恩").click()
    c.wait(lambda d: any(w.get("thanks") == "编的感恩" for w in d["weeks"].values()), "感恩")
    c.go("#/look")
    p.get_by_role("group", name="皮肤状态").get_by_role("button", name="好", exact=True).click()
    p.get_by_role("button", name="长痘").click()
    c.wait(lambda d: any((w.get("skin") or {}).get("tags") == ["长痘"] for w in d["weeks"].values()), "皮肤")
    w = next(w for w in c.data()["weeks"].values() if w.get("skin"))
    assert w["skin"]["score"] == 4, w


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
    p.get_by_label("密码").fill("123456")
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


@step("定期打理：到日子出现在今天，点做了")
def _(c):
    p = c.page
    c.go("#/")
    expect(p.get_by_text("该打理了")).to_be_visible()
    p.locator(".event-row", has_text="剪指甲").get_by_role("button", name="做了").click()
    c.wait(lambda d: next(x for x in d["periodic"] if x["id"] == "pd-nails")["last"] == TODAY, "剪指甲")
    c.go("#/periodic")
    p.get_by_role("button", name="＋ 加一项").click()
    c.sheet().get_by_label("名字").fill("编的打理")
    c.sheet().get_by_label("几天一次").fill("10")
    c.sheet().get_by_role("button", name="好了").click()
    c.wait(lambda d: any(x["name"] == "编的打理" and x["every"] == 10 for x in d["periodic"]), "加定期")


@step("形象：我的东西从物品档案读、我学到的卡片")
def _(c):
    p = c.page
    c.go("#/look")
    p.get_by_role("button", name="编的洗面奶").click()
    c.sheet().get_by_label("开封日期").fill("2026-09-01")
    c.sheet().get_by_role("button", name="好用").click()
    c.sheet().get_by_role("button", name="好了").click()
    c.wait(lambda d: d["look"]["products"]["inv-1"] == {"opened": "2026-09-01", "verdict": "good"}, "我的东西")
    expect(p.locator("main")).not_to_contain_text("编的零食")  # 不是洗漱护肤类的不显示
    p.get_by_role("button", name="＋ 记一张").click()
    c.sheet().get_by_label("标题").fill("编的知识")
    c.sheet().get_by_label("内容").fill("先这样再那样")
    c.sheet().get_by_role("button", name="化妆").click()
    c.sheet().get_by_role("button", name="存好").click()
    c.wait(lambda d: d["notes"][0]["title"] == "编的知识" and d["notes"][0]["track"] == "makeup", "卡片")
    expect(p.get_by_text("先这样再那样")).to_be_visible()
    p.get_by_role("button", name="改", exact=True).click()
    c.sheet().get_by_role("button", name="精致讲究").click()
    c.sheet().get_by_role("button", name="温柔书卷气").click()
    c.sheet().get_by_role("button", name="好了").click()
    c.wait(lambda d: d["look"]["direction"] == ["refined", "bookish"], "方向")
    expect(p.get_by_text("精致讲究 + 温柔书卷气")).to_be_visible()


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
    p.locator(".quick-row").get_by_role("button", name="洗澡").click()
    c.sheet().get_by_role("button", name="待会儿再说").click()
    c.wait(lambda d: any(e["day"] == YESTERDAY for e in events(d, "shower")), "补记昨天洗澡")


@step("两台设备：另一台刚改过，这台的修改合并进去")
def _(c):
    p = c.page
    c.go("#/")
    c.write(lambda d: d["notes"].append({"id": "n-other", "title": "别的设备记的", "text": "", "track": None, "link": "", "at": TODAY}))
    p.locator(".quick-row").get_by_role("button", name="奶茶").click()
    c.wait(lambda d: any(e.get("kind") == "奶茶" for e in d["events"]) and any(n["id"] == "n-other" for n in d["notes"]), "合并")


@step("鼓励：每天一句、早上护肤做完夸一句、第一次做完一天护肤有里程碑")
def _(c):
    p = c.page
    c.go("#/")
    expect(p.locator(".cheer").first).not_to_be_empty()
    d = c.data()
    am = [r for r in d["look"]["routine"] if r["when"] == "am" and not r.get("optional")]
    pm = [r for r in d["look"]["routine"] if r["when"] == "pm" and not r.get("optional")]
    care = d["days"][TODAY].get("care", {})
    for r in am:
        if not care.get(r["id"]):
            p.locator(".care-group", has_text="早上").get_by_role("button", name=r["name"]).click()
            c.wait(lambda d, r=r: d["days"][TODAY]["care"].get(r["id"]), "早上打卡")
    expect(p.get_by_text("早上的护肤做完了")).to_be_visible()
    for r in pm:
        p.locator(".care-group", has_text="晚上").get_by_role("button", name=r["name"]).click()
        c.wait(lambda d, r=r: d["days"][TODAY]["care"].get(r["id"]), "晚上打卡")
    c.wait(lambda d: "care-1" in d["milestones"], "里程碑")
    expect(p.get_by_text("第一次把一天的护肤都做完了")).to_be_visible()
    p.locator(".milestone").get_by_role("button", name="好").click()
    c.wait(lambda d: d["milestones"].get("seen", {}).get("care-1"), "看过里程碑")
    expect(p.get_by_text("这周的你")).to_be_visible()
    # 喷香水在化妆这条线
    c.go("#/look")
    expect(p.locator(".track", has_text="化妆").get_by_role("link", name="喷香水")).to_be_visible()


@step("生病：感冒→量到 37.8 切发烧、喝水、预案打勾、吃药（说明书、下次几点、同成分提醒）、去医院的情况变红、好了进手册")
def _(c):
    p = c.page
    c.go("#/")
    p.get_by_role("button", name="我不舒服").click()
    c.sheet().get_by_role("button", name="感冒").click()
    expect(p.get_by_role("heading", name="🤧 感冒")).to_be_visible()
    c.wait(lambda d: d["sick"]["current"]["kind"] == "cold", "开始感冒")
    p.get_by_label("体温", exact=True).fill("37.8")
    p.get_by_role("button", name="记", exact=True).click()
    c.wait(lambda d: d["sick"]["current"]["temps"][0]["t"] == 37.8, "体温")
    p.get_by_role("button", name="切到发烧模式").click()
    c.wait(lambda d: d["sick"]["current"]["kind"] == "fever", "切发烧")
    p.get_by_role("button", name="喝了一杯").click()
    c.wait(lambda d: d["sick"]["current"]["water"][TODAY] == 1, "喝水")
    p.get_by_role("button", name="多喝水（发烧很耗水）").click()
    c.wait(lambda d: d["sick"]["current"]["done"][TODAY], "预案打勾")
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
    expect(p.locator(".sick-card")).to_contain_text("发烧 · 第 1 天")
    expect(p.get_by_role("button", name="我不舒服")).to_have_count(0)
    # 好了
    c.go("#/sick")
    p.get_by_role("button", name="好了").first.click()
    c.sheet().get_by_label("怎么好的").fill("编的办法")
    c.sheet().get_by_role("button", name="好了").click()
    c.wait(lambda d: d["sick"]["current"] is None and d["sick"]["history"][0]["how"] == "编的办法", "好了")
    expect(p.get_by_text("恢复期还有")).to_be_visible()
    c.go("#/sick/book")
    expect(p.get_by_text("最高 39.2°C")).to_be_visible()
    expect(p.get_by_text("怎么好的：编的办法")).to_be_visible()
    # 改预案、填校医院
    p.get_by_role("button", name="🤧 感冒").click()
    c.sheet().get_by_label("预案").fill("编的做法一\n编的做法二")
    c.sheet().get_by_role("button", name="存好").click()
    c.wait(lambda d: d["sick"]["plans"]["cold"] == ["编的做法一", "编的做法二"], "预案")
    p.locator(".card", has_text="看病去哪").get_by_role("button", name="改").click()
    c.sheet().get_by_label("电话").fill("12345")
    c.sheet().get_by_role("button", name="存好").click()
    c.wait(lambda d: d["sick"]["clinic"]["phone"] == "12345", "校医院")


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


@step("换季：要降温了首页提醒")
def _(c):
    p = c.page
    c.write(lambda d: d["settings"].update(city={"name": "编的城", "lat": 1, "lon": 2}))
    p.evaluate("localStorage.removeItem('life-weather')")
    c.go("#/")
    p.reload()
    expect(p.get_by_text("要降温了")).to_be_visible()
    expect(p.locator(".season")).to_contain_text("比今天低 10°C")


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
    p.get_by_role("link", name="英语复习 3 条").click()
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
    p.get_by_label("小红书分享").fill("【编的书店 - 编的作者 | 小红书 - 你的生活指南】 😆 AbCdEfGh12 😆 http://xhslink.com/a/abc123 复制本条信息，打开【小红书】App查看精彩内容！")
    expect(p.get_by_label("名字")).to_have_value("编的书店")
    expect(p.get_by_label("链接")).to_have_value("http://xhslink.com/a/abc123")
    p.get_by_role("group", name="类型").get_by_role("button", name="店").click()
    p.get_by_role("group", name="区").get_by_role("button", name="甲区").click()
    p.get_by_role("group", name="有多想去").get_by_role("button", name="★★★").click()
    p.locator(".map-box .leaflet-container, .map-box.leaflet-container").first.wait_for()
    p.locator(".map-box").click(position={"x": 120, "y": 100})
    p.get_by_label("为什么想去").fill("编的理由")
    p.get_by_role("button", name="存好").click()
    c.wait(lambda d: d["places"] and d["places"][0]["name"] == "编的书店", "加地方")
    pl = c.data()["places"][0]
    assert pl["kind"] == "shop" and pl["district"] == "甲区" and pl["want"] == 3 and pl["lat"] and pl["link"].startswith("http://xhslink"), pl
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
    expect(p.get_by_text("最近几天心情都不太好")).to_be_visible()


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
        content = {"answer": "编的回答"} if "问题" in body or "answer" in body else {"letter": "编的回顾正文", "research": "编的科研回顾"}
        route.fulfill(status=200, content_type="application/json", headers={"Access-Control-Allow-Origin": "*"},
                      body=json.dumps({"choices": [{"finish_reason": "stop", "message": {"content": json.dumps(content, ensure_ascii=False)}}]}))
    page.route("https://api.deepseek.com/**", ai)


def main():
    only = sys.argv[1:]
    ART.mkdir(exist_ok=True)
    repo = FakeRepo({"README.md": b"# life-data\n"})
    serve({REPO: repo, "x/inventory-data": FakeRepo(inventory_seed()), "test/finance-data": FakeRepo(ledger_seed())}, API_PORT)
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
