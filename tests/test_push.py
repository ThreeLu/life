"""推送文字的规则（tools/life_push.py 的 message）：python tests/test_push.py"""

import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "tools"))
from life_push import fetch_key, fetch_message, in_window, message  # noqa: E402

SAT = datetime(2026, 10, 10, 22, 31)  # 周六
SUN = datetime(2026, 10, 11, 22, 31)  # 周日

m = message({"days": {}}, SAT)
assert m["title"] == "睡前" and m["body"] == "今天的一句话还没写；然后是今晚的 2 分钟" and m["url"].endswith("#/night"), m
m = message({"days": {"2026-10-10": {"mood": 6}}}, SAT)
assert m["body"] == "今晚的 2 分钟" and m["url"].endswith("#/pray/go?m=night"), m
assert message({"days": {"2026-10-10": {"note": "x", "prayer": {"night": {"at": "x"}}}}}, SAT) is None
assert message({"days": {"2026-10-11": {"mood": 6, "prayer": {"night": {"at": "x"}}}}}, SUN) is None  # 周日不再提醒写感恩
# 凌晨 1 点还算前一天
m = message({"days": {"2026-10-10": {"mood": 6, "prayer": {"night": {"at": "x"}}}}}, datetime(2026, 10, 11, 1, 0))
assert m is None, m
# 锁屏上看不出私事
for d in [{"days": {}}, {"days": {}, "events": [{"type": "p"}]}]:
    m = message(d, SUN)
    assert "小记" not in m["body"], m
# 周五：周末去哪
FRI = datetime(2026, 10, 9, 22, 31)
places = [{"name": "编的书店", "want": 3}, {"name": "编的公园", "want": 1}, {"name": "编的面馆", "visits": [{"day": "2026-09-01", "score": 5}]},
          {"name": "刚去过", "visits": [{"day": "2026-10-08", "score": 5}]}]
m = message({"days": {"2026-10-09": {"mood": 6, "prayer": {"night": {"at": "x"}}}}, "places": places}, FRI)
assert m["body"] == "周末可以去：编的书店、编的公园" and m["url"].endswith("#/places"), m
assert message({"days": {"2026-10-10": {"mood": 6, "prayer": {"night": {"at": "x"}}}}, "places": places}, SAT) is None
print("推送规则 ✓")

# 打水：一天一次。中午、晚上各两次（刚开、快关）；今天打过就都不提醒；「不打了」只管那一回
D = "2026-10-10"
assert fetch_key(datetime(2026, 10, 10, 10, 7)) is None and fetch_key(datetime(2026, 10, 10, 19, 5)) is None
assert fetch_key(datetime(2026, 10, 10, 11, 20)) == "fetch-noon1" and fetch_key(datetime(2026, 10, 10, 12, 30)) == "fetch-noon2"
m = fetch_message({"days": {}}, datetime(2026, 10, 10, 11, 20))
assert m["title"] == "打水" and "13:00" in m["body"], m
for f in ({"am": True}, {"noon": True}, {"mid": True}):  # 早上或中午打了：中午、晚上都不提醒
    assert fetch_message({"days": {D: {"fetch": f}}}, datetime(2026, 10, 10, 12, 30)) is None, f
    assert fetch_message({"days": {D: {"fetch": f}}}, datetime(2026, 10, 10, 18, 30)) is None, f
assert fetch_message({"days": {D: {"fetch": {"am": "skip"}}}}, datetime(2026, 10, 10, 11, 20))  # 早上不打了，中午还提醒
assert fetch_message({"days": {D: {"fetch": {"noon": "skip"}}}}, datetime(2026, 10, 10, 12, 30)) is None  # 中午点了「不打了」
m = fetch_message({"days": {D: {"fetch": {"noon": "skip"}}}}, datetime(2026, 10, 10, 18, 30))
assert m["body"] == "开水房 19:00 关门，水还没打", m  # 中午不打了，晚上还提醒
assert fetch_message({"days": {D: {"fetch": {"eve": "skip"}}}}, datetime(2026, 10, 10, 17, 20)) is None
print("打水提醒 ✓")


# GitHub 定时晚到半夜：不在时间段里就不发（睡前 21–23，白天 9–21）
assert in_window(datetime(2026, 10, 10, 22, 31), 21, 23) and not in_window(datetime(2026, 10, 11, 3, 38), 21, 23)
assert not in_window(datetime(2026, 10, 11, 3, 38), 9, 21) and in_window(datetime(2026, 10, 11, 16, 48), 9, 21)
assert not in_window(datetime(2026, 10, 10, 23, 0), 21, 23)
print("时间段 ✓")


# 导师找我：和网页 js/advisor.js 同一个模型，同样的记录算出同样的数
import json as _json  # noqa: E402
import shutil  # noqa: E402
import subprocess  # noqa: E402

from life_push import advisor_fit, advisor_message, advisor_prob  # noqa: E402

ADV = [f"2025-{x}" for x in ["03-03", "03-11", "03-14", "03-24", "04-02", "04-07", "04-21", "04-25", "05-05", "05-09", "05-16", "05-26"]]  # 编的
f = advisor_fit(ADV, "2025-05-27")
p27, p_mon = advisor_prob(f, "2025-05-27"), advisor_prob(f, "2025-06-02")
assert abs(p27 - 0.07145) < 1e-4 and abs(p_mon - 0.34860) < 1e-4, (p27, p_mon)
assert advisor_fit(ADV[:2], "2025-05-27") is None  # 不到 3 次不预测
data = {"events": [{"day": d, "type": "advisor"} for d in ADV]}
assert advisor_message(data, datetime(2025, 6, 1, 8, 0)) is None  # 不到 25%
m = advisor_message(data, datetime(2025, 6, 2, 8, 0))  # 那天用的是 6 月 1 日以前的记录
assert m["body"] == "导师今天可能会问进度（可能 35%）" and m["url"].endswith("#/advisor"), m
data["events"].append({"day": "2025-06-02", "type": "advisor"})
assert advisor_message(data, datetime(2025, 6, 2, 9, 0)) is None  # 今天已经记了
if shutil.which("node"):
    js = ("const a = await import(process.argv[1]); const days = JSON.parse(process.argv[2]);"
          "const f = a.advisorFit(days, '2025-05-27'); console.log(JSON.stringify([a.advisorProb(f, '2025-05-27'), a.advisorProb(f, '2025-06-02')]));")
    out = subprocess.run(["node", "--input-type=module", "-e", js, str(Path(__file__).resolve().parent.parent / "js" / "advisor.js"), _json.dumps(ADV)],
                         capture_output=True, text=True, check=True).stdout
    w27, wmon = _json.loads(out)
    assert abs(w27 - p27) < 1e-9 and abs(wmon - p_mon) < 1e-9, (w27, p27, wmon, p_mon)
print("导师找我 ✓")
