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


# 状态预报：和网页 js/forecast.js 同一个模型，同样的记录、同样的天气算出同样的数
from life_push import forecast_fit, forecast_level, forecast_line, forecast_predict, morning_message  # noqa: E402


def fake_days(n=40, start="2026-09-01"):
    """编的记录：睡得多心情好一点；伪随机，不用 random，两边好对"""
    from datetime import date as _d, timedelta as _td
    data, weather, seed = {"days": {}, "events": []}, {}, 7

    def rnd():
        nonlocal seed
        seed = (seed * 16807) % 2147483647
        return seed / 2147483647
    for i in range(n):
        d = (_d.fromisoformat(start) + _td(days=i)).isoformat()
        h = 6 + int(rnd() * 4)
        if rnd() < 0.4:
            data["events"].append({"type": "sport", "day": d})
        mood = max(1, min(10, round(5 + (h - 7) * 0.8 + rnd() * 3 - 1)))
        data["days"][d] = {"mood": mood, "energy": max(1, min(5, round(mood / 2))), "sleep": {"bed": "23:30", "wake": f"0{h - 1}:30", "q": 1 + i % 5}}
        if rnd() < 0.6:
            data["days"][d]["prayer"] = {"night": {"at": "x"}}
        weather[d] = {"rain": 3 if rnd() < 0.2 else 0, "sun": rnd() * 10}
    return data, weather


FD, FW = fake_days()
T = "2026-10-10"
res = {}
for tgt in ["mood", "energy"]:
    fit = forecast_fit(FD, T, tgt, FW)
    res[tgt] = [forecast_predict(fit, FD, d, FW, T) for d in [T, "2026-10-12"]]
mf = forecast_fit(FD, T, "mood", FW)
assert mf["n"] == 39, mf["n"]
assert forecast_fit({"days": {k: v for k, v in list(FD["days"].items())[:6]}, "events": []}, T) is None  # 不到 7 天不预报
line = forecast_line(FD, T, FW)
assert line.startswith("今天") and "心情" in line and "分左右" in line, line
short = {"days": {k: v for k, v in list(FD["days"].items())[:10]}, "events": []}
assert forecast_line(short, "2026-09-11", FW).endswith("（还在认识你）"), forecast_line(short, "2026-09-11", FW)
m = morning_message(FD, datetime(2026, 10, 10, 8, 0), FW)
assert m["title"] == "今天" and m["body"] == line and m["url"].endswith("#/forecast"), m
both = dict(FD, events=FD["events"] + [{"day": d, "type": "advisor"} for d in ADV])
m = morning_message(both, datetime(2025, 6, 2, 8, 0), FW)
assert m["body"] == "导师今天可能会问进度（可能 35%）" and m["url"].endswith("#/advisor"), m  # 那天心情还没记够，只有导师
assert morning_message({"days": {}, "events": []}, datetime(2026, 10, 10, 8, 0)) is None
if shutil.which("node"):
    js = ("const f = await import(process.argv[1]); const [data, w, T] = JSON.parse(process.argv[2]); const out = {};"
          "for (const t of ['mood', 'energy']) { const fit = f.forecastFit(data, T, t, w); out[t] = [T, '2026-10-12'].map((d) => f.forecastPredict(fit, data, d, w, T)); }"
          "out.level = f.levelOf(f.forecastFit(data, T, 'mood', w), out.mood[0]).name; console.log(JSON.stringify(out));")
    out = _json.loads(subprocess.run(["node", "--input-type=module", "-e", js, str(Path(__file__).resolve().parent.parent / "js" / "forecast.js"), _json.dumps([FD, FW, T])],
                                     capture_output=True, text=True, check=True).stdout)
    for tgt in ["mood", "energy"]:
        for a, b in zip(out[tgt], res[tgt]):
            assert abs(a["mean"] - b["mean"]) < 1e-9 and abs(a["sd"] - b["sd"]) < 1e-9, (tgt, a, b)
            if tgt == "mood":
                assert abs(a["pLow"] - b["p_low"]) < 1e-9, (a, b)
    assert out["level"] == forecast_level(mf, res["mood"][0]), out["level"]
print("状态预报 ✓")


# 心情问卷：周日出现、挂到周二；每个月最后一个周日多一份；周日 19 点还没填提醒；网页 js/scales.js 的 scaleDue 规则一样
from datetime import date, timedelta  # noqa: E402
from life_push import scale_due, scale_message  # noqa: E402

assert scale_due({}, date(2026, 11, 1)) == ["w2026-10-26"]  # 周日
assert scale_due({}, date(2026, 11, 3)) == ["w2026-10-26"]  # 周二还在
assert scale_due({}, date(2026, 11, 4)) == []  # 周三没了
assert scale_due({}, date(2026, 10, 31)) == []  # 周六没有
assert scale_due({}, date(2026, 10, 25)) == ["w2026-10-19", "m2026-10"]  # 10 月最后一个周日
assert scale_due({}, date(2026, 10, 27)) == ["w2026-10-19", "m2026-10"]  # 跨不跨月都是 10 月那份
assert scale_due({"scales": {"w2026-10-19": {}}}, date(2026, 10, 25)) == ["m2026-10"]
assert scale_due({"startDate": "2026-11-02"}, date(2026, 11, 1)) == []
m = scale_message({}, datetime(2026, 11, 1, 19, 5))
assert m["body"] == "这周的问卷还没填，大约 3 分钟" and m["url"].endswith("#/scale?k=w2026-10-26"), m
assert "6 分钟" in scale_message({}, datetime(2026, 10, 25, 19, 5))["body"]
assert scale_message({}, datetime(2026, 11, 2, 19, 5)) is None  # 周一不推
assert scale_message({"scales": {"w2026-10-26": {}}}, datetime(2026, 11, 1, 19, 5)) is None
if shutil.which("node"):
    days = [(date(2026, 9, 1) + timedelta(days=i)).isoformat() for i in range(120)]
    seen = {"scales": {"w2026-10-05": {}, "m2026-11": {}}, "startDate": "2026-09-10"}
    js = ("const a = await import(process.argv[1]); const [days, data] = JSON.parse(process.argv[2]);"
          "const all3 = Array(21).fill(3), one = Array(21).fill(0); one[2] = 1;"
          "console.log(JSON.stringify({ due: days.map((d) => a.scaleDue(data, d)), all3: a.dassScore(all3), one: a.dassScore(one),"
          " lv: [a.dassLevel('d', 9), a.dassLevel('d', 10), a.dassLevel('a', 20), a.dassLevel('s', 18)],"
          " pss: [a.pssScore(Array(10).fill(0)), a.pssScore([4,4,4,0,0,4,0,0,4,4])], swls: [a.swlsScore([0,0,0,0,0]), a.swlsScore([6,6,6,6,6])],"
          " high: [a.scaleHigh({ dass: [0,0,0,0,3,0,0,0,0,3,0,0,1,0,0,0,0,0,0,0,0] }), a.scaleHigh({ dass: [0,0,0,0,3,0,0,0,0,3,0,0,0,0,0,0,0,0,0,0,0] }), a.scaleHigh({ pss: Array(10).fill(3).map((v, i) => [3,4,6,7].includes(i) ? 1 : v), swls: [3,3,3,3,3] })] }));")
    out = _json.loads(subprocess.run(["node", "--input-type=module", "-e", js, str(Path(__file__).resolve().parent.parent / "js" / "scales.js"), _json.dumps([days, seen])],
                                     capture_output=True, text=True, check=True).stdout)
    for d, w in zip(days, out["due"]):
        assert w == scale_due(seen, date.fromisoformat(d)), (d, w)
    assert out["all3"] == {"d": 42, "a": 42, "s": 42} and out["one"] == {"d": 2, "a": 0, "s": 0}, out
    assert out["lv"] == [0, 1, 4, 1], out["lv"]
    assert out["pss"] == [16, 40] and out["swls"] == [5, 35], out  # 全选「从未有」：4 道反向题各 4 分
    assert out["high"] == [True, False, True], out["high"]  # 抑郁 14 是中度、12 是轻度；压力知觉 27 是高
print("心情问卷 ✓")
