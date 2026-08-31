import os, requests, uuid, datetime
from bson import ObjectId
from pymongo import MongoClient

API = os.environ.get("REACT_APP_BACKEND_URL", "https://officeflow-v11.preview.emergentagent.com").rstrip("/") + "/api"
mc = MongoClient(os.environ["MONGO_URL"]); db = mc[os.environ["DB_NAME"]]
s = requests.Session()

def jp(r, name):
    if r.status_code >= 400:
        print(f"  !! {name} -> {r.status_code}: {r.text[:200]}")
        raise SystemExit(1)
    return r.json()

print("login", s.post(API+"/auth/login", json={"email":"admin@example.com","password":"admin123"}).status_code)
cli = jp(s.post(API+"/dispatch/clients", json={"name":"SI Client","code":"SIC","email":"sic@t.com"}), "client")
ven = jp(s.post(API+"/dispatch/vendors", json={"name":"SI Vendor"}), "vendor")
ps = jp(s.post(API+"/dispatch/post-sites", json={"post_pin":"SIP"+uuid.uuid4().hex[:5],"name":"SI Post","location":"Loc","client_id":cli["id"],"vendor_id":ven["id"],"latitude":23.8,"longitude":90.4,"geofence_radius_m":150}), "postsite")
off = jp(s.post(API+"/dispatch/officers", json={"name":"SI Officer","contact_number":"123","client_id":cli["id"]}), "officer")

today = datetime.date.today().isoformat()
sd = jp(s.post(API+"/dispatch/schedules", json={"schedule_mode":"once","date":today,"shift_type":"Morning","start_time":"08:00","end_time":"16:00","client_id":cli["id"],"vendor_id":ven["id"],"post_site_id":ps["id"],"officer_id":off["id"],"site_instruction":"Patrol gate every hour. Report to front desk."}), "schedule")
print("  site_instruction on create:", repr(sd.get("site_instruction")))
assert sd.get("site_instruction") == "Patrol gate every hour. Report to front desk."
tok = sd.get("tracking_token")

row = jp(s.get(API+"/dispatch/schedules", params={"client_id":cli["id"]}), "list")["items"][0]
print("  site_instruction in list row:", repr(row.get("site_instruction")))
assert row.get("site_instruction") == "Patrol gate every hour. Report to front desk."

p = requests.get(API+"/shift-track/"+tok).json()
print("  site_instruction in shift payload:", repr(p.get("site_instruction")))
assert p.get("site_instruction") == "Patrol gate every hour. Report to front desk."

# emergency clock-out remark surfaces on the schedule row
db.dispatch_schedules.update_one({"tracking_token":tok}, {"$set":{"shift_status":"Clocked In","clock_in_at":datetime.datetime.utcnow()}})
er = requests.post(API+"/shift-track/"+tok+"/emergency-clock-out", json={"latitude":23.8,"longitude":90.4,"remark":"Medical emergency, left post."})
print("  emergency clock-out status", er.status_code)
assert er.status_code == 200
eco = jp(s.get(API+"/dispatch/schedules", params={"client_id":cli["id"]}), "list2")["items"][0].get("emergency_clock_out")
print("  emergency remark in list row:", repr(eco.get("remark") if eco else None))
assert eco and eco.get("remark") == "Medical emergency, left post."

# cleanup
db.dispatch_schedules.delete_many({"client_id":cli["id"]})
db.dispatch_post_sites.delete_one({"_id":ObjectId(ps["id"])})
db.dispatch_officers.delete_many({"name":"SI Officer"})
db.dispatch_clients.delete_many({"name":{"$regex":"^SI Client"}})
db.dispatch_vendors.delete_many({"name":"SI Vendor"})
print("\nALL ASSERTIONS PASSED. cleanup done.")
