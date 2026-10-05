"""每晚 22:30 左右（北京时间）：今天的一句话还没写、还没祷告就提醒；周日加一句写这周的感恩；生病时加一句早点睡；
要降温了加一句。合成一条推送，都做了就不发。
白天（10–20 点每 2 小时一次）：只在生病时提醒喝水、发烧时提醒量体温。

在数据仓库 life-data 的定时任务里运行（那边的 workflow 每次从公开仓库下载这个文件）：
订阅在 config/push.json，私钥在 secret VAPID_PRIVATE_KEY。规则和网页 js/life.js 一致（一天从凌晨 4 点开始）。
锁屏上能看到推送内容，所以文字只写「睡前」这类看不出私事的话。
"""

import json
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
        url = url or f"{APP}#/pray/go"
    if today.weekday() == 6:
        monday = (today - timedelta(days=6)).isoformat()
        if not ((data.get("weeks") or {}).get(monday) or {}).get("thanks"):
            lines.append("周日了，写一下这周的感恩")
            url = url or f"{APP}#/pray"
    if (data.get("sick") or {}).get("current"):
        lines.append("身体在恢复，今晚早点睡")
        url = url or f"{APP}#/sick"
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


FEVER_FROM = 37.3
WATER_GOAL = 8


def day_message(data, now):
    """白天生病时：喝水跟不上就提醒；发烧了 4 小时没量体温就提醒。没生病返回 None"""
    ep = (data.get("sick") or {}).get("current")
    if not ep:
        return None
    t = day_key(now).isoformat()
    lines = []
    expected = WATER_GOAL * max(0, min(1, (now.hour - 8) / 14))
    if (ep.get("water") or {}).get(t, 0) + 1 < expected:
        lines.append("喝杯温水吧")
    temps = sorted(ep.get("temps") or [], key=lambda x: x["at"])
    feverish = ep.get("kind") == "fever" or (temps and temps[-1]["t"] >= FEVER_FROM)
    if feverish:
        last = datetime.fromisoformat(temps[-1]["at"].replace("Z", "+00:00")) + timedelta(hours=8) if temps else None
        if not last or (now - last.replace(tzinfo=None)) >= timedelta(hours=4):
            lines.append("该量一次体温了")
    if not lines:
        return None
    return {"title": "照顾自己", "body": "；".join(lines), "url": f"{APP}#/sick", "tag": f"life-day-{t}-{now.hour}"}


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


def once(key, now, latest_hour):
    """GitHub 的定时任务不准时，整点高峰还会整次跳过，所以一晚上排了几次触发：
    今天已经发过就不再发；太晚了（过了 latest_hour 点）也不发。手动运行不受影响。
    只有真的发了（或者今晚不用发）才记下来，免得早一点的那次还没到时间就把今天占掉。"""
    if os.environ.get("GITHUB_EVENT_NAME") != "schedule":
        return True
    if now.hour >= latest_hour:
        print(f"已经 {now:%H:%M} 了，今天不发了")
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
    if os.environ.get("GITHUB_EVENT_NAME") != "schedule":
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
    key = "night" if night else f"day{now.hour // 2}"
    if not once(key, now, 23):
        return
    data = json.load(open("life.json", encoding="utf-8"))
    if os.environ.get("TEST") == "true":
        msg = {"title": "测试推送", "body": "看到这条说明「生活」的提醒能用了", "url": APP, "tag": "life-test"}
    elif night:
        msg = message(data, now)
        extra = season_line(data, now)
        if extra:
            msg = msg or {"title": "睡前", "body": "", "url": f"{APP}#/", "tag": f"life-{day_key(now)}"}
            msg["body"] = "；".join(x for x in [msg["body"], extra] if x)
    else:
        msg = day_message(data, now)
        if not msg:
            print("没生病，白天不提醒")
            return
    mark_sent(key, now)
    if not msg:
        print("今晚不用提醒")
        return
    print(msg["title"], "|", msg["body"])
    send(msg)


if __name__ == "__main__":
    sys.exit(main())
