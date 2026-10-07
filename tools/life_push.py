"""每晚 22:30 左右（北京时间）：今天的一句话还没写、还没有晚上的祷告就提醒；生病时加一句早点睡；
要降温了加一句。合成一条推送，都做了就不发。
白天（10–20 点每 2 小时一次）：只在生病时提醒喝水、发烧时提醒量体温。
打水：开水房中午 11–13、晚上 17–19 开，这一回还没打就在刚开的时候和快关的时候各提醒一次。

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
        url = url or f"{APP}#/pray/go?m=night"
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


# 打水：(第几回, 提醒几, 从几点几分, 到几点几分, 文字)。上午 / 中午算一回（早上 7–8 打了，中午就不提醒）
FETCH_REMIND = [
    ("mid", 1, (11, 0), (12, 15), "开水房开着（到 13:00），记得打水"),
    ("mid", 2, (12, 15), (12, 50), "开水房 13:00 关门，水还没打"),
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


def fetch_message(data, now):
    """这一回还没打水就提醒；打了返回 None"""
    key = fetch_key(now)
    if not key:
        return None
    t = day_key(now).isoformat()
    done = ((data.get("days") or {}).get(t) or {}).get("fetch") or {}
    for slot, n, _, _, text in FETCH_REMIND:
        if key == f"fetch-{slot}{n}":
            if done.get(slot):
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
        fkey = fetch_key(now)
        if fkey and once(fkey, now, 0, 24):
            msg = fetch_message(data, now)
            mark_sent(fkey, now)
            if msg:
                print(msg["title"], "|", msg["body"])
                send(msg)
            else:
                print("水打过了")
    key = "night" if night else f"day{now.hour // 2}"
    # 睡前那条 21–23 点；白天（只在生病时）9–21 点，半夜不吵
    if not (once(key, now, 21, 23) if night else once(key, now, 9, 21)):
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
