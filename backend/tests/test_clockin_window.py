"""Ad-hoc verification of clock-in window + clock-out-at-end logic."""
import os, requests, uuid
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from pymongo import MongoClient

BASE = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/") + "/api"
DHAKA = ZoneInfo("Asia/Dhaka")
mc = MongoClient(os.environ["MONGO_URL"])
db = mc[os.environ["DB_NAME"]]

LAT, LNG = 23.8103, 90.4125  # post coords; ping uses same -> inside geofence

def mk(offset_start_min, duration_h=8):
    """Create post/officer/client/schedule; start = now + offset_start_min (Dhaka)."""
    now = datetime.now(DHAKA)
    start = now + timedelta(minutes=offset_start_min)
    end = start + timedelta(hours=duration_h)
    pin = "PIN" + uuid.uuid4().hex[:6]
    post_id = db.dispatch_post_sites.insert_one({
        "name": "Test Post", "post_pin": pin, "location": "Test", "city": "Dhaka",
        "latitude": LAT, "longitude": LNG, "geofence_radius_m": 150,
    }).inserted_id
    off_id = db.dispatch_officers.insert_one({"name": "Test Officer", "officer_code": "OF1"}).inserted_id
    cli_id = db.dispatch_clients.insert_one({"name": "Test Client", "email": "client@test.com"}).inserted_id
    token = uuid.uuid4().hex
    db.dispatch_schedules.insert_one({
        "tracking_token": token,
        "post_site_id": str(post_id), "officer_id": str(off_id), "client_id": str(cli_id),
        "date": start.strftime("%Y-%m-%d"),
        "start_time": start.strftime("%H:%M"),
        "end_time": end.strftime("%H:%M"),
        "shift_status": "Not Started",
        "clock_in_at": None, "clock_out_at": None, "cancelled_at": None,
    })
    return token

def clock_in(token):
    return requests.post(f"{BASE}/shift-track/{token}/clock-in", json={"latitude": LAT, "longitude": LNG})

def clock_out(token):
    return requests.post(f"{BASE}/shift-track/{token}/clock-out", json={"latitude": LAT, "longitude": LNG})

print("== T1: shift starts in 30 min -> clock-in BLOCKED (window not open) ==")
t = mk(30)
r = clock_in(t)
print(" status", r.status_code, "|", r.json().get("detail"))
assert r.status_code == 400 and "10 minutes before" in r.json().get("detail", "")

print("== T2: shift starts in 5 min (within 10-min window) -> clock-in OK ==")
t = mk(5)
r = clock_in(t)
print(" status", r.status_code, "| shift_status:", r.json().get("shift_status"))
assert r.status_code == 200 and r.json().get("shift_status") == "Clocked In"

print("== T3: clocked-in, end in future -> clock-out BLOCKED ==")
# T2 shift ends in ~8h; try clock-out now
r = clock_out(t)
print(" status", r.status_code, "|", r.json().get("detail"))
assert r.status_code == 400 and "shift end time" in r.json().get("detail", "")

print("== T4: shift started 20 min ago, ends now-ish -> clock-in then clock-out OK ==")
t2 = mk(-20, duration_h=0)  # start 20m ago, end = start (rolls +1 day since end<=start) -> not ideal
# Instead craft end in the past explicitly:
now = datetime.now(DHAKA)
start = now - timedelta(hours=2)
end = now - timedelta(minutes=1)
sched = db.dispatch_schedules.find_one({"tracking_token": t2})
db.dispatch_schedules.update_one({"tracking_token": t2}, {"$set": {
    "date": start.strftime("%Y-%m-%d"),
    "start_time": start.strftime("%H:%M"),
    "end_time": end.strftime("%H:%M"),
}})
r = clock_in(t2)
print(" clock-in status", r.status_code, "| shift_status:", r.json().get("shift_status"))
assert r.status_code == 200
r = clock_out(t2)
print(" clock-out status", r.status_code, "| shift_status:", r.json().get("shift_status"))
assert r.status_code == 200 and r.json().get("shift_status") == "Clocked Out"

print("== T5: payload exposes clock_in_opens_at & clock_out_opens_at ==")
t = mk(60)
p = requests.get(f"{BASE}/shift-track/{t}").json()
w = p["windows"]
print(" clock_in_opens_at:", w.get("clock_in_opens_at"))
print(" shift_start_at:   ", w.get("shift_start_at"))
print(" clock_out_opens_at:", w.get("clock_out_opens_at"))
print(" shift_end_at:     ", w.get("shift_end_at"))
assert w["clock_out_opens_at"] == w["shift_end_at"], "clock-out should open exactly at end"
# clock_in_opens should be 10 min before start
so = datetime.fromisoformat(w["clock_in_opens_at"]); ss = datetime.fromisoformat(w["shift_start_at"])
assert abs((ss - so).total_seconds() - 600) < 2, "clock-in should open 10 min before start"

print("\nALL ASSERTIONS PASSED ✅")

# cleanup created test data
db.dispatch_post_sites.delete_many({"name": "Test Post"})
db.dispatch_officers.delete_many({"name": "Test Officer"})
db.dispatch_clients.delete_many({"name": "Test Client"})
db.dispatch_schedules.delete_many({"tracking_token": {"$exists": True}, "post_site_id": {"$exists": True}, "officer_id": {"$exists": True}, "client_id": {"$exists": True}, "start_time": {"$exists": True}, "shift_status": {"$in": ["Not Started", "Clocked In", "Clocked Out"]}, "date": {"$regex": "^20"}})
print("cleanup done")
