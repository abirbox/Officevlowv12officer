import os, uuid, datetime, asyncio
import requests
from pymongo import MongoClient
from bson import ObjectId

API = "https://officeflow-v11.preview.emergentagent.com/api"
mc = MongoClient(os.environ["MONGO_URL"]); db = mc[os.environ["DB_NAME"]]
s = requests.Session()
me = s.post(API+"/auth/login", json={"email":"admin@example.com","password":"admin123"}).json()
admin_id = me["id"]

cli = s.post(API+"/dispatch/clients", json={"name":"OFF Client","code":"OFFC"}).json()
ven = s.post(API+"/dispatch/vendors", json={"name":"OFF Vendor"}).json()
ps = s.post(API+"/dispatch/post-sites", json={"post_pin":"OFF"+uuid.uuid4().hex[:5],"name":"OFF Post","location":"L","client_id":cli["id"],"vendor_id":ven["id"],"latitude":23.80,"longitude":90.40,"geofence_radius_m":150}).json()
off = s.post(API+"/dispatch/officers", json={"name":"OFF Officer","contact_number":"1","client_id":cli["id"]}).json()
now = datetime.datetime.now(datetime.timezone.utc); start = now - datetime.timedelta(minutes=5); end = now + datetime.timedelta(hours=8)
sc = s.post(API+"/dispatch/schedules", json={"schedule_mode":"once","date":start.strftime("%Y-%m-%d"),"start_time":start.strftime("%H:%M"),"end_time":end.strftime("%H:%M"),"shift_type":"Morning","client_id":cli["id"],"vendor_id":ven["id"],"post_site_id":ps["id"],"officer_id":off["id"]}).json()
tok = sc["tracking_token"]; sid = sc["id"]

def notif_count():
    return db.notifications.count_documents({"user_id": admin_id})

n0 = notif_count()
# clock in inside geofence
r = requests.post(API+f"/shift-track/{tok}/clock-in", json={"latitude":23.8001,"longitude":90.4001}); assert r.status_code==200, r.text

# ping OUTSIDE the geofence (~15km away) -> should trigger geofence alert + notification
r = requests.post(API+f"/shift-track/{tok}/ping", json={"latitude":23.90,"longitude":90.50}); assert r.status_code==200, r.text
n1 = notif_count()
print("geofence-exit notification created:", n1 > n0)
assert n1 > n0
# live entry should now show outside + position at ping
row = [o for o in s.get(API+"/dispatch/live-tracking").json()["officers"] if o["schedule_id"]==sid][0]
print("geofence_status:", row.get("geofence_status"), "| position_source:", row.get("position_source"), "| is_offline:", row.get("is_offline"))
assert row["geofence_status"] == "outside"
assert row["position"]["lat"] == 23.90

# OFFLINE: backdate last_seen_at then run the scan (scan needs an async motor db)
db.dispatch_schedules.update_one({"tracking_token":tok}, {"$set":{"last_seen_at": now - datetime.timedelta(minutes=6)}})
from motor.motor_asyncio import AsyncIOMotorClient
from utils.shift_alerts import run_shift_alert_scan
async def _runscan():
    mdb = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    await run_shift_alert_scan(mdb)
asyncio.get_event_loop().run_until_complete(_runscan())
sdoc = db.dispatch_schedules.find_one({"tracking_token":tok})
print("offline_sent flag:", (sdoc.get("tracking_alerts") or {}).get("offline_sent"))
assert (sdoc.get("tracking_alerts") or {}).get("offline_sent") is True
n2 = notif_count()
print("offline notification created:", n2 > n1)
assert n2 > n1
# live entry now offline
row2 = [o for o in s.get(API+"/dispatch/live-tracking").json()["officers"] if o["schedule_id"]==sid][0]
print("is_offline now:", row2.get("is_offline"))
assert row2["is_offline"] is True

# back-online via ping clears offline flag + notifies
r = requests.post(API+f"/shift-track/{tok}/ping", json={"latitude":23.8001,"longitude":90.4001}); assert r.status_code==200
sdoc2 = db.dispatch_schedules.find_one({"tracking_token":tok})
print("offline_sent after ping:", (sdoc2.get("tracking_alerts") or {}).get("offline_sent"))
assert (sdoc2.get("tracking_alerts") or {}).get("offline_sent") is False

print("\nALL OFFLINE/GEOFENCE ASSERTIONS PASSED")
# cleanup
db.dispatch_schedules.delete_many({"client_id":cli["id"]})
db.dispatch_post_sites.delete_one({"_id":ObjectId(ps["id"])})
db.dispatch_officers.delete_many({"name":"OFF Officer"}); db.dispatch_clients.delete_many({"name":"OFF Client"}); db.dispatch_vendors.delete_many({"name":"OFF Vendor"})
db.notifications.delete_many({"user_id":admin_id,"message":{"$regex":"OFF Officer"}})
print("cleanup done")
