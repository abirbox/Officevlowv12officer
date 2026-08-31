"""Seed one clocked-in officer for Live Tracking UI testing. Usage:
   python seed_iter31_live.py seed   -> creates schedule for now + clocks in (prints ids)
   python seed_iter31_live.py clean <sched_id> <token>
"""
import sys
from datetime import datetime, timedelta, timezone as tz

import requests
from dotenv import dotenv_values

B = dotenv_values("/app/frontend/.env")["REACT_APP_BACKEND_URL"].rstrip("/")


def login():
    s = requests.Session()
    s.post(f"{B}/api/auth/login", json={"email": "admin@example.com", "password": "admin123"}, timeout=30)
    return s


def seed():
    s = login()
    rows = s.get(f"{B}/api/dispatch/schedules?limit=50", timeout=60).json().get("items", [])
    src = next(r for r in rows if r.get("post_site_id") and r.get("officer_id"))
    local_now = datetime.now(tz.utc) + timedelta(hours=6)
    start = local_now - timedelta(minutes=20)
    end = start + timedelta(hours=6)
    payload = {
        "schedule_mode": "once", "date": start.strftime("%Y-%m-%d"),
        "shift_type": "Morning", "start_time": start.strftime("%H:%M"),
        "end_time": end.strftime("%H:%M"),
        "client_id": src["client_id"], "vendor_id": src["vendor_id"],
        "post_site_id": src["post_site_id"], "officer_id": src["officer_id"],
        "remarks": "TEST_iter31_ui",
    }
    cr = s.post(f"{B}/api/dispatch/schedules", json=payload, timeout=60)
    sid = cr.json().get("id")
    detail = s.get(f"{B}/api/dispatch/schedules/{sid}", timeout=30).json()
    token = detail["tracking_token"]
    info = requests.get(f"{B}/api/shift-track/{token}", timeout=30).json()
    geo = info["geofence"]
    ci = requests.post(f"{B}/api/shift-track/{token}/clock-in",
                       json={"latitude": geo["latitude"], "longitude": geo["longitude"]}, timeout=30)
    print("schedule", sid, "token", token, "clockin", ci.status_code, ci.text[:200])
    lt = s.get(f"{B}/api/dispatch/live-tracking", timeout=60).json()
    print("live count", lt["count"], [o["schedule_id"] for o in lt["officers"]])


def clean(sid, token):
    s = login()
    info = requests.get(f"{B}/api/shift-track/{token}", timeout=30).json()
    geo = info.get("geofence") or {}
    print(requests.post(f"{B}/api/shift-track/{token}/clock-out",
                        json={"latitude": geo.get("latitude"), "longitude": geo.get("longitude")},
                        timeout=30).status_code)
    print(s.delete(f"{B}/api/dispatch/schedules/{sid}", timeout=30).status_code)


if __name__ == "__main__":
    if sys.argv[1] == "seed":
        seed()
    else:
        clean(sys.argv[2], sys.argv[3])
