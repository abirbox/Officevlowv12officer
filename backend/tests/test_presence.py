import os, uuid, datetime, asyncio, json
import requests, websockets
from pymongo import MongoClient
from bson import ObjectId

API = "https://officeflow-v11.preview.emergentagent.com/api"
WSBASE = "wss://officeflow-v11.preview.emergentagent.com/api/ws/shift/"
mc = MongoClient(os.environ["MONGO_URL"]); db = mc[os.environ["DB_NAME"]]
s = requests.Session(); s.post(API+"/auth/login", json={"email":"admin@example.com","password":"admin123"})

cli = s.post(API+"/dispatch/clients", json={"name":"PRES Client","code":"PRSC"}).json()
ven = s.post(API+"/dispatch/vendors", json={"name":"PRES Vendor"}).json()
ps = s.post(API+"/dispatch/post-sites", json={"post_pin":"PRS"+uuid.uuid4().hex[:5],"name":"PRES Post","location":"L","client_id":cli["id"],"vendor_id":ven["id"],"latitude":23.8,"longitude":90.4,"geofence_radius_m":200}).json()
off = s.post(API+"/dispatch/officers", json={"name":"PRES Officer","contact_number":"1","client_id":cli["id"]}).json()
now = datetime.datetime.now(datetime.timezone.utc); start = now - datetime.timedelta(minutes=5); end = now + datetime.timedelta(hours=8)
sc = s.post(API+"/dispatch/schedules", json={"schedule_mode":"once","date":start.strftime("%Y-%m-%d"),"start_time":start.strftime("%H:%M"),"end_time":end.strftime("%H:%M"),"shift_type":"Morning","client_id":cli["id"],"vendor_id":ven["id"],"post_site_id":ps["id"],"officer_id":off["id"]}).json()
tok = sc["tracking_token"]; sid = sc["id"]

# backdate last_seen so the 60s grace doesn't mask the offline state pre-connect
db.dispatch_schedules.update_one({"tracking_token":tok}, {"$set":{"shift_status":"Clocked In","clock_in_at": now - datetime.timedelta(minutes=5), "last_seen_at": now - datetime.timedelta(minutes=10)}})

def entry():
    rows = [o for o in s.get(API+"/dispatch/live-tracking").json()["officers"] if o["schedule_id"]==sid]
    return rows[0] if rows else None

print("before WS connect -> is_offline:", entry().get("is_offline"))
assert entry().get("is_offline") is True

async def main():
    async with websockets.connect(WSBASE+tok, open_timeout=15) as ws:
        await ws.send(json.dumps({"latitude":23.8005,"longitude":90.4005}))
        await asyncio.sleep(1.5)
        e = entry()
        print("while WS connected -> is_offline:", e.get("is_offline"), "| position:", e.get("position"))
        assert e.get("is_offline") is False
        assert e.get("position", {}).get("lat") == 23.8005
    # after context exit the socket is closed
    await asyncio.sleep(1.5)
    e2 = entry()
    print("after WS disconnect -> is_offline:", e2.get("is_offline"))
    assert e2.get("is_offline") is True

asyncio.run(main())
print("\nPRESENCE ONLINE/OFFLINE VERIFIED")

db.dispatch_schedules.delete_many({"client_id":cli["id"]})
db.dispatch_post_sites.delete_one({"_id":ObjectId(ps["id"])})
db.dispatch_officers.delete_many({"name":"PRES Officer"}); db.dispatch_clients.delete_many({"name":"PRES Client"}); db.dispatch_vendors.delete_many({"name":"PRES Vendor"})
print("cleanup done")
