"""推送文字的规则（tools/life_push.py 的 message）：python tests/test_push.py"""

import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "tools"))
from life_push import message  # noqa: E402

SAT = datetime(2026, 10, 10, 22, 31)  # 周六
SUN = datetime(2026, 10, 11, 22, 31)  # 周日

m = message({"days": {}}, SAT)
assert m["title"] == "睡前" and m["body"] == "今天的一句话还没写；然后是今晚的 2 分钟" and m["url"].endswith("#/night"), m
m = message({"days": {"2026-10-10": {"mood": 6}}}, SAT)
assert m["body"] == "今晚的 2 分钟" and m["url"].endswith("#/pray/go"), m
assert message({"days": {"2026-10-10": {"note": "x", "prayer": {"night": {"at": "x"}}}}}, SAT) is None
m = message({"days": {"2026-10-11": {"mood": 6, "prayer": {"night": {"at": "x"}}}}}, SUN)
assert m["body"] == "周日了，写一下这周的感恩" and m["url"].endswith("#/pray"), m
assert message({"days": {"2026-10-11": {"mood": 6, "prayer": {"night": {"at": "x"}}}}, "weeks": {"2026-10-05": {"thanks": "x"}}}, SUN) is None
# 凌晨 1 点还算前一天
m = message({"days": {"2026-10-10": {"mood": 6, "prayer": {"night": {"at": "x"}}}}}, datetime(2026, 10, 11, 1, 0))
assert m is None, m
# 锁屏上看不出私事
for d in [{"days": {}}, {"days": {}, "events": [{"type": "p"}]}]:
    m = message(d, SUN)
    assert "小记" not in m["body"], m
print("推送规则 ✓")
