"""推送文字的规则（tools/life_push.py 的 message）：python tests/test_push.py"""

import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "tools"))
from life_push import day_message, fetch_key, fetch_message, in_window, message  # noqa: E402

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
# 生病：睡前加一句；白天喝水跟不上、发烧 4 小时没量体温提醒
m = message({"days": {"2026-10-10": {"mood": 6, "prayer": {"night": {"at": "x"}}}}, "sick": {"current": {"kind": "cold"}}}, SAT)
assert m["body"] == "身体在恢复，今晚早点睡" and m["url"].endswith("#/sick"), m
assert day_message({"sick": {"current": None}}, datetime(2026, 10, 10, 14, 7)) is None
ep = {"kind": "fever", "water": {"2026-10-10": 1}, "temps": [{"at": "2026-10-10T03:00:00Z", "t": 38.2}]}  # 北京 11:00 量的
m = day_message({"sick": {"current": ep}}, datetime(2026, 10, 10, 16, 7))
assert m["body"] == "喝杯温水吧；该量一次体温了" and m["title"] == "照顾自己", m
ep = {"kind": "cold", "water": {"2026-10-10": 6}, "temps": [{"at": "2026-10-10T07:00:00Z", "t": 36.8}]}
assert day_message({"sick": {"current": ep}}, datetime(2026, 10, 10, 16, 7)) is None
# 周五：周末去哪
FRI = datetime(2026, 10, 9, 22, 31)
places = [{"name": "编的书店", "want": 3}, {"name": "编的公园", "want": 1}, {"name": "编的面馆", "visits": [{"day": "2026-09-01", "score": 5}]},
          {"name": "刚去过", "visits": [{"day": "2026-10-08", "score": 5}]}]
m = message({"days": {"2026-10-09": {"mood": 6, "prayer": {"night": {"at": "x"}}}}, "places": places}, FRI)
assert m["body"] == "周末可以去：编的书店、编的公园" and m["url"].endswith("#/places"), m
assert message({"days": {"2026-10-10": {"mood": 6, "prayer": {"night": {"at": "x"}}}}, "places": places}, SAT) is None
print("推送规则 ✓")

# 打水：中午、晚上各两次（刚开、快关），这一回打了就不提醒；早上打了算上午这回
D = "2026-10-10"
assert fetch_key(datetime(2026, 10, 10, 10, 7)) is None and fetch_key(datetime(2026, 10, 10, 19, 5)) is None
assert fetch_key(datetime(2026, 10, 10, 11, 20)) == "fetch-mid1" and fetch_key(datetime(2026, 10, 10, 12, 30)) == "fetch-mid2"
m = fetch_message({"days": {}}, datetime(2026, 10, 10, 11, 20))
assert m["title"] == "打水" and "13:00" in m["body"], m
assert fetch_message({"days": {D: {"fetch": {"mid": True}}}}, datetime(2026, 10, 10, 12, 30)) is None
m = fetch_message({"days": {D: {"fetch": {"mid": True}}}}, datetime(2026, 10, 10, 18, 30))
assert m["body"] == "开水房 19:00 关门，水还没打", m
assert fetch_message({"days": {D: {"fetch": {"mid": True, "eve": True}}}}, datetime(2026, 10, 10, 17, 20)) is None
assert fetch_message({"days": {D: {"fetch": {"mid": "skip"}}}}, datetime(2026, 10, 10, 12, 30)) is None  # 点了「不打了」
print("打水提醒 ✓")


# GitHub 定时晚到半夜：不在时间段里就不发（睡前 21–23，白天 9–21）
assert in_window(datetime(2026, 10, 10, 22, 31), 21, 23) and not in_window(datetime(2026, 10, 11, 3, 38), 21, 23)
assert not in_window(datetime(2026, 10, 11, 3, 38), 9, 21) and in_window(datetime(2026, 10, 11, 16, 48), 9, 21)
assert not in_window(datetime(2026, 10, 10, 23, 0), 21, 23)
print("时间段 ✓")
