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
    p.get_by_role("button", name="加", exact=True).click()
    c.wait(lambda d: d["private"]["supplies"][0]["name"] == "编的用品", "用品")


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
    return {"inventory.json": json.dumps(inv, ensure_ascii=False).encode()}


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
