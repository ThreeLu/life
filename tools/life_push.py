"""每晚 22:30 左右（北京时间）：今天的一句话还没写、还没有晚上的祷告就提醒；
要降温了加一句。合成一条推送，都做了就不发。
打水：一天只打一次。今天还没打、这一回也没点「不打了」，就在中午 11–13、晚上 17–19 刚开和快关的时候各提醒一次。
导师找我：早上 7:30–10:00，今天被问进度的可能 ≥ 25%、今天还没记，就提醒一次（模型和网页 js/advisor.js 一模一样，见 advisor_*）。

在数据仓库 life-data 的定时任务里运行（那边的 workflow 每次从公开仓库下载这个文件）：
订阅在 config/push.json，私钥在 secret VAPID_PRIVATE_KEY。规则和网页 js/life.js 一致（一天从凌晨 4 点开始）。
锁屏上能看到推送内容，所以文字只写「睡前」这类看不出私事的话。
"""

import json
import math
import os
import subprocess
import sys
from datetime import date, datetime, timedelta, timezone

APP = "https://threelu.github.io/life/"
DAY_START_HOUR = 4
SENT_FILE = "config/push-sent.json"


def day_key(now):
    return (now - timedelta(hours=DAY_START_HOUR)).date()


def message(data, now):
    """now：北京时间。返回 {title, body, url, tag} 或 None（今晚不用提醒）"""
    today = day_key(now)
    t = today.isoformat()
    rec = (data.get("days") or {}).get(t) or {}
    reviewed = bool(rec.get("mood") or rec.get("note"))
    prayed = bool((rec.get("prayer") or {}).get("night"))
    lines, url = [], None
    if not reviewed:
        lines.append("今天的一句话还没写")
        url = f"{APP}#/night"
    if not prayed:
        lines.append("然后是今晚的 2 分钟" if lines else "今晚的 2 分钟")
        url = url or f"{APP}#/pray/go?m=night"
    if today.weekday() == 4:
        picks = weekend_picks(data.get("places") or [], today)
        if picks:
            lines.append(f"周末可以去：{'、'.join(picks)}")
            url = url or f"{APP}#/places"
    if not lines:
        return None
    return {"title": "睡前", "body": "；".join(lines), "url": url, "tag": f"life-{t}"}


def weekend_picks(places, today, n=2):
    """周末去哪：和网页 places.js 的 weekendPicks 同样的规则（不看天气）：没去过的按想去程度、去过 4 分以上隔了 3 周、60 天没去的"""
    cand = []
    for p in places:
        if p.get("archived"):
            continue
        visits = p.get("visits") or []
        if not visits:
            cand.append((30 + (p.get("want") or 1) * 10, p["name"]))
            continue
        last = max(v["day"] for v in visits)
        gap = (today - date.fromisoformat(last)).days
        best = max((v.get("score") or 0) for v in visits)
        if best >= 4 and gap >= 21:
            cand.append((20 + best * 2, p["name"]))
        elif gap >= 60:
            cand.append((15, p["name"]))
    cand.sort(key=lambda x: (-x[0], x[1]))
    return [name for _, name in cand[:n]]


# 打水：(哪一回, 提醒几, 从几点几分, 到几点几分, 文字)。一天一桶，早上不打；中午打了晚上就不提醒，中午点了不打了晚上 17:00 提醒
FETCH_REMIND = [
    ("noon", 1, (11, 0), (12, 15), "开水房开着（到 13:00），记得打水"),
    ("noon", 2, (12, 15), (12, 50), "开水房 13:00 关门，水还没打"),
    ("eve", 1, (17, 0), (18, 15), "开水房开着（到 19:00），晚上洗漱要用水"),
    ("eve", 2, (18, 15), (18, 50), "开水房 19:00 关门，水还没打"),
]


def fetch_key(now):
    """现在是哪一次打水提醒（不在提醒时间里返回 None）"""
    hm = (now.hour, now.minute)
    for slot, n, start, end, _ in FETCH_REMIND:
        if start <= hm < end:
            return f"fetch-{slot}{n}"
    return None


def fetch_state(f):
    """(今天打了没有, 哪几回点了不打了)。老数据 { mid, eve }：mid 算中午，mid 不打了算早上和中午都不打。规则和网页 fetchState 一样"""
    g = dict(f or {})
    if "mid" in g:
        mid = g.pop("mid")
        if mid is True:
            g.setdefault("noon", True)
        elif mid == "skip":
            g.setdefault("am", "skip")
            g.setdefault("noon", "skip")
    return any(v is True for v in g.values()), {k for k, v in g.items() if v == "skip"}


def fetch_message(data, now):
    """今天还没打水、这一回也没说不打，就提醒；否则返回 None"""
    key = fetch_key(now)
    if not key:
        return None
    t = day_key(now).isoformat()
    got, skip = fetch_state(((data.get("days") or {}).get(t) or {}).get("fetch"))
    if got:
        return None
    for slot, n, _, _, text in FETCH_REMIND:
        if key == f"fetch-{slot}{n}":
            if slot in skip:
                return None
            return {"title": "打水", "body": text, "url": f"{APP}#/", "tag": f"life-{key}-{t}"}
    return None


def season_line(data, now):
    """要降温了（三天内最低温比今天低 8°C 以上）：返回一句话。规则和网页 seasonWarning 一样"""
    city = (data.get("settings") or {}).get("city") or {}
    if not city.get("lat"):
        return None
    try:
        import urllib.request
        url = (f"https://api.open-meteo.com/v1/forecast?latitude={city['lat']}&longitude={city['lon']}"
               "&daily=temperature_2m_max,temperature_2m_min&timezone=Asia%2FShanghai&forecast_days=5")
        j = json.load(urllib.request.urlopen(url, timeout=20))["daily"]
    except Exception as e:  # noqa: BLE001 天气查不到就不提
        print("天气查不到：", e)
        return None
    mins = j["temperature_2m_min"]
    drop = round(mins[0] - min(mins[1:4]))
    return f"这几天要降温 {drop}°C，加件衣服、早点睡" if drop >= 8 else None


# ---------- 导师找我（2026-10-25）：和网页 js/advisor.js 同一个模型，算出来的数要一样，改一边就改另一边 ----------
# 贝叶斯逻辑回归（离散时间风险模型）：logit P = β₀ + β₁·ln(离上次几天) + β₂·(离上次几天 / 7) + γ_周几，
# 先验 β ~ N(0, 2²)、γ ~ N(0, 1)；拉普拉斯近似（牛顿法求众数、Σ = 海森矩阵的逆），预测用 MacKay 近似 σ(μ / √(1 + π s² / 8))。
ADVISOR_REMIND = 0.25
ADVISOR_MIN = 3
ADVISOR_PRIOR_VAR = [4, 4, 4, 1, 1, 1, 1, 1, 1, 1]


def advisor_days(data):
    return sorted({e["day"] for e in data.get("events") or [] if e.get("type") == "advisor"})


def advisor_features(gap, wd):
    x = [1.0, math.log(gap), gap / 7, 0, 0, 0, 0, 0, 0, 0]
    x[3 + wd] = 1.0
    return x


def _solve(A, b):
    """高斯消元（选主元），和网页 solve 一样"""
    n = len(b)
    M = [list(row) + [b[i]] for i, row in enumerate(A)]
    for c in range(n):
        p = c
        for r in range(c + 1, n):
            if abs(M[r][c]) > abs(M[p][c]):
                p = r
        M[c], M[p] = M[p], M[c]
        for r in range(n):
            if r == c:
                continue
            f = M[r][c] / M[c][c]
            for k in range(c, n + 1):
                M[r][k] -= f * M[c][k]
    return [M[i][n] / M[i][i] for i in range(n)]


def _sigmoid(z):
    return 1 / (1 + math.exp(-z))


def advisor_fit(days, up_to):
    """用 up_to（不含）以前的日子拟合；记录太少返回 None"""
    ev = [d for d in days if d < up_to]
    if len(ev) < ADVISOR_MIN:
        return None
    seen = set(ev)
    rows, last = [], date.fromisoformat(ev[0])
    d, end = last + timedelta(days=1), date.fromisoformat(up_to)
    while d < end:
        y = 1 if d.isoformat() in seen else 0
        rows.append((advisor_features((d - last).days, d.weekday()), y))
        if y:
            last = d
        d += timedelta(days=1)
    k = len(ADVISOR_PRIOR_VAR)
    th = [0.0] * k
    th[0] = -2.0
    H = None
    for _ in range(30):
        g = [-t / ADVISOR_PRIOR_VAR[i] for i, t in enumerate(th)]
        H = [[(1 / ADVISOR_PRIOR_VAR[i] if i == j else 0.0) for j in range(k)] for i in range(k)]
        for x, y in rows:
            p = _sigmoid(sum(xi * th[i] for i, xi in enumerate(x)))
            w = p * (1 - p)
            for i in range(k):
                if not x[i]:
                    continue
                g[i] += x[i] * (y - p)
                for j in range(k):
                    if x[j]:
                        H[i][j] += w * x[i] * x[j]
        step = _solve(H, g)
        th = [t + step[i] for i, t in enumerate(th)]
        if max(abs(s) for s in step) < 1e-9:
            break
    return {"theta": th, "H": H, "last": ev[-1]}


def advisor_prob(fit, day):
    if not fit:
        return None
    d = date.fromisoformat(day)
    x = advisor_features((d - date.fromisoformat(fit["last"])).days, d.weekday())
    mu = sum(xi * fit["theta"][i] for i, xi in enumerate(x))
    v = _solve(fit["H"], x)
    s2 = sum(xi * v[i] for i, xi in enumerate(x))
    return _sigmoid(mu / math.sqrt(1 + math.pi * s2 / 8))


def advisor_message(data, now):
    """今天被问进度的可能 ≥ 25%、今天还没记：返回推送；否则 None。文字是用户 2026-10-25 选的（写清楚、带上可能）"""
    t = day_key(now).isoformat()
    days = advisor_days(data)
    if t in days:
        return None
    p = advisor_prob(advisor_fit(days, t), t)
    if p is None or p < ADVISOR_REMIND:
        return None
    return {"title": "今天", "body": f"导师今天可能会问进度（可能 {int(p * 100 + 0.5)}%）", "url": f"{APP}#/advisor", "tag": f"life-advisor-{t}"}


def send(msg):
    from pywebpush import WebPushException, webpush

    try:
        cfg = json.load(open("config/push.json", encoding="utf-8"))
    except FileNotFoundError:
        print("还没有设备开启推送")
        return
    subs, dead = cfg.get("subscriptions", []), []
    for sub in subs:
        try:
            webpush(subscription_info={"endpoint": sub["endpoint"], "keys": sub["keys"]}, data=json.dumps(msg, ensure_ascii=False),
                    vapid_private_key=os.environ["VAPID_PRIVATE_KEY"], vapid_claims={"sub": "https://threelu.github.io"}, ttl=6 * 3600)
            print(f"已推送：{sub.get('device', '?')}")
        except WebPushException as e:
            status = getattr(e.response, "status_code", None)
            print(f"推送失败（{sub.get('device', '?')}）：{status} {e}")
            if status in (404, 410):
                dead.append(sub["endpoint"])  # 设备取消了订阅
    if dead:
        cfg["subscriptions"] = [s for s in subs if s["endpoint"] not in dead]
        json.dump(cfg, open("config/push.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        git_commit(f"去掉失效的推送订阅（{len(dead)} 个）", ["config/push.json"])


def git_commit(message, paths):
    """把改动提交回数据仓库（网页可能刚提交过，先 rebase 再推）"""
    subprocess.run(["git", "config", "user.name", "github-actions"], check=True)
    subprocess.run(["git", "config", "user.email", "github-actions@users.noreply.github.com"], check=True)
    subprocess.run(["git", "add", *paths], check=True)
    if subprocess.run(["git", "diff", "--cached", "--quiet"]).returncode == 0:
        return
    subprocess.run(["git", "commit", "-qm", message], check=True)
    for _ in range(3):
        if subprocess.run(["git", "pull", "-q", "--rebase"]).returncode == 0 and subprocess.run(["git", "push", "-q"]).returncode == 0:
            return
    print("记录没传上去")


def in_window(now, earliest, latest):
    """现在（北京时间）是不是在 earliest–latest 点之间"""
    return earliest <= now.hour + now.minute / 60 < latest


def once(key, now, earliest, latest):
    """只在北京时间 earliest–latest 点之间发，同一个 key 一天一次。
    GitHub 的定时任务常常晚好几个小时（2026-10 实测晚 6 小时，凌晨三四点才跑），所以不在时间段里就跳过，
    也不记成发过了。定时触发和外部触发（workflow_dispatch）都按这个规则；只有「测试推送」不受限制。
    只有真的发了（或者这一回不用发）才记下来（mark_sent），免得早一点的那次还没到时间就把今天占掉。"""
    if os.environ.get("TEST") == "true":
        return True
    if not in_window(now, earliest, latest):
        print(f"现在 {now:%H:%M}，不在 {earliest:g}–{latest:g} 点之间，不发")
        return False
    try:
        sent = json.load(open(SENT_FILE, encoding="utf-8"))
    except FileNotFoundError:
        sent = {}
    if sent.get(key) == now.date().isoformat():
        print("今天已经处理过了")
        return False
    return True


def mark_sent(key, now):
    if os.environ.get("TEST") == "true":
        return
    try:
        sent = json.load(open(SENT_FILE, encoding="utf-8"))
    except FileNotFoundError:
        sent = {}
    sent[key] = now.date().isoformat()
    os.makedirs(os.path.dirname(SENT_FILE), exist_ok=True)
    json.dump(sent, open(SENT_FILE, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    git_commit(f"推送记录：{key} {now.date().isoformat()}", [SENT_FILE])


def main():
    now = (datetime.now(timezone.utc) + timedelta(hours=8)).replace(tzinfo=None)
    night = now.hour >= 21 or os.environ.get("MODE") == "night"
    if not night and os.environ.get("TEST") != "true":
        data = json.load(open("life.json", encoding="utf-8"))
        # 导师找我：早上 7:30–10:00 一次
        if in_window(now, 7.5, 10) and once("advisor", now, 7.5, 10):
            msg = advisor_message(data, now)
            mark_sent("advisor", now)
            if msg:
                print(msg["title"], "|", msg["body"])
                send(msg)
            else:
                print("今天不用提醒导师的事")
        fkey = fetch_key(now)
        if fkey and once(fkey, now, 0, 24):
            msg = fetch_message(data, now)
            mark_sent(fkey, now)
            if msg:
                print(msg["title"], "|", msg["body"])
                send(msg)
            else:
                print("水打过了")
    # 白天只有导师、打水的提醒；睡前那条 21–23 点
    test = os.environ.get("TEST") == "true"
    if not (night or test) or not once("night", now, 21, 23):
        return
    data = json.load(open("life.json", encoding="utf-8"))
    if test:
        msg = {"title": "测试推送", "body": "看到这条说明「生活」的提醒能用了", "url": APP, "tag": "life-test"}
    else:
        msg = message(data, now)
        extra = season_line(data, now)
        if extra:
            msg = msg or {"title": "睡前", "body": "", "url": f"{APP}#/", "tag": f"life-{day_key(now)}"}
            msg["body"] = "；".join(x for x in [msg["body"], extra] if x)
    mark_sent("night", now)
    if not msg:
        print("今晚不用提醒")
        return
    print(msg["title"], "|", msg["body"])
    send(msg)


if __name__ == "__main__":
    sys.exit(main())
