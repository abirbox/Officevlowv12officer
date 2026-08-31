import asyncio, os, uuid, datetime, json
import requests, websockets
from pymongo import MongoClient
from bson import ObjectId

API = "https://officeflow-v11.preview.emergentagent.com/api"
WS = "wss://officeflow-v11.preview.emergentagent.com/api/ws/dispatch"
mc = MongoClient(os.environ["MONGO_URL"]); db = mc[os.environ["DB_NAME"]]

s = requests.Session()
s.post(API+"/auth/login", json={"email":"admin@example.com","password":"admin123"})
token = s.cookies.get("access_token")

# seed entities
cli = s.post(API+"/dispatch/clients", json={"name":"WS Client","code":"WSC"}).json()
ven = s.post(API+"/dispatch/vendors", json={"name":"WS Vendor"}).json()
ps = s.post(API+"/dispatch/post-sites", json={"post_pin":"WSP"+uuid.uuid4().hex[:5],"name":"WS Post","location":"L","client_id":cli["id"],"vendor_id":ven["id"],"latitude":23.8,"longitude":90.4,"geofence_radius_m":200}).json()
off = s.post(API+"/dispatch/officers", json={"name":"WS Officer","contact_number":"1","client_id":cli["id"]}).json()
now = datetime.datetime.now(datetime.timezone.utc); start = now - datetime.timedelta(minutes=5); end = now + datetime.timedelta(hours=8)
sc = s.post(API+"/dispatch/schedules", json={"schedule_mode":"once","date":start.strftime("%Y-%m-%d"),"start_time":start.strftime("%H:%M"),"end_time":end.strftime("%H:%M"),"shift_type":"Morning","client_id":cli["id"],"vendor_id":ven["id"],"post_site_id":ps["id"],"officer_id":off["id"]}).json()
tok = sc["tracking_token"]

async def main():
    got = []
    async with websockets.connect(WS+"?token="+token, open_timeout=15) as ws:
        async def reader():
            try:
                async for raw in ws:
                    m = json.loads(raw)
                    if m.get("type") == "dispatch_live_update":
                        got.append(m)
            except Exception:
                pass
        rtask = asyncio.create_task(reader())
        await asyncio.sleep(0.5)

        # clock-in inside geofence
        requests.post(API+f"/shift-track/{tok}/clock-in", json={"latitude":23.8001,"longitude":90.4001})
        await asyncio.sleep(2)
        # check-in with a moved position
        requests.post(API+f"/shift-track/{tok}/check-in", json={"latitude":23.8010,"longitude":90.4012})
        await asyncio.sleep(2)
        # clock-out (end already passed? no, end in future) -> force end in past then clock out
        db.dispatch_schedules.update_one({"tracking_token":tok}, {"$set":{"end_time": (now - datetime.timedelta(minutes=1)).strftime("%H:%M"), "date": start.strftime("%Y-%m-%d")}})
        requests.post(API+f"/shift-track/{tok}/clock-out", json={"latitude":23.8010,"longitude":90.4012})
        await asyncio.sleep(2)
        rtask.cancel()

    print("events received:", len(got))
    types = [(m.get("removed"), (m.get("officer") or {}).get("position"), (m.get("officer") or {}).get("position_source")) for m in got]
    for i, t in enumerate(types):
        print(f"  #{i}: removed={t[0]} position={t[1]} source={t[2]}")
    assert len(got) >= 3, "expected >=3 live events (clock-in, check-in, clock-out)"
    assert got[0]["officer"]["position"]["lat"] == 23.8001
    assert got[1]["officer"]["position"]["lat"] == 23.801
    assert got[-1]["removed"] is True
    print("\nLIVE PUSH VERIFIED ✅")

asyncio.run(main())

# cleanup
db.dispatch_schedules.delete_many({"client_id":cli["id"]})
db.dispatch_post_sites.delete_one({"_id":ObjectId(ps["id"])})
db.dispatch_officers.delete_many({"name":"WS Officer"})
db.dispatch_clients.delete_many({"name":"WS Client"})
db.dispatch_vendors.delete_many({"name":"WS Vendor"})
print("cleanup done")
