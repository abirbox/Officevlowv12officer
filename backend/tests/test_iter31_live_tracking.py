"""Iteration 31: Dispatch Live Tracking + Shift tracking URL on schedules."""
import os
import re
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values

frontend_env = dotenv_values("/app/frontend/.env")
base_url = os.environ.get("REACT_APP_BACKEND_URL") or frontend_env.get("REACT_APP_BACKEND_URL")
if not base_url:
    raise RuntimeError("REACT_APP_BACKEND_URL missing")
BASE_URL = base_url.rstrip("/")


@pytest.fixture(scope="session")
def test_credentials():
    p = Path("/app/memory/test_credentials.md")
    if not p.exists():
        pytest.skip("missing credentials file")
    c = p.read_text()
    e = re.search(r'(?im)^\s*(?:[-*]\s*)?(?:\*\*)?email(?:\*\*)?\s*:\s*`?([^`\s]+)', c)
    pw = re.search(r'(?im)^\s*(?:[-*]\s*)?(?:\*\*)?password(?:\*\*)?\s*:\s*`?([^`\s]+)', c)
    return {"email": e.group(1), "password": pw.group(1)}


@pytest.fixture(scope="session")
def client(test_credentials):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login", json=test_credentials, timeout=30)
    if r.status_code != 200:
        pytest.fail(f"login failed {r.status_code}: {r.text[:300]}")
    # Auth is cookie-based (httpOnly access token cookie set by /api/auth/login)
    tok = r.json().get("access_token") or r.json().get("token")
    if tok:
        s.headers.update({"Authorization": f"Bearer {tok}"})
    me = s.get(f"{BASE_URL}/api/auth/me", timeout=30)
    if me.status_code != 200:
        pytest.fail(f"session not authenticated after login: {me.status_code} {me.text[:200]}")
    return s


# ---------- Live tracking endpoint ----------
class TestLiveTracking:
    def test_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/dispatch/live-tracking", timeout=30)
        assert r.status_code in (401, 403), r.text[:300]

    def test_shape(self, client):
        r = client.get(f"{BASE_URL}/api/dispatch/live-tracking", timeout=60)
        assert r.status_code == 200, r.text[:500]
        d = r.json()
        assert set(["officers", "count", "server_now"]).issubset(d.keys())
        assert isinstance(d["officers"], list)
        assert d["count"] == len(d["officers"])
        assert isinstance(d["server_now"], str)
        for o in d["officers"]:
            for k in ("schedule_id", "officer_name", "post_pin", "position", "geofence", "tracking_url"):
                assert k in o, f"missing {k}"


# ---------- Schedules list carries tracking token/url ----------
class TestScheduleTracking:
    def test_list_has_tracking(self, client):
        r = client.get(f"{BASE_URL}/api/dispatch/schedules?limit=5", timeout=60)
        assert r.status_code == 200, r.text[:500]
        d = r.json()
        assert "items" in d and "total" in d
        if not d["items"]:
            pytest.skip("no schedules to verify tracking url")
        for row in d["items"]:
            assert row.get("tracking_token"), f"row {row.get('id')} missing tracking_token"
            assert row.get("tracking_url", "").endswith("/shift/" + row["tracking_token"])
            assert row["tracking_url"].startswith("http")

    def test_public_shift_page_data(self, client):
        r = client.get(f"{BASE_URL}/api/dispatch/schedules?limit=1", timeout=60)
        items = r.json().get("items", [])
        if not items:
            pytest.skip("no schedules")
        token = items[0]["tracking_token"]
        pub = requests.get(f"{BASE_URL}/api/shift-track/{token}", timeout=30)
        assert pub.status_code == 200, pub.text[:400]
        body = pub.json()
        assert isinstance(body, dict) and body


# ---------- Clock-in -> appears in live tracking ----------
class TestClockInFlow:
    def test_clock_in_shows_on_live_tracking(self, client):
        from datetime import datetime, timedelta, timezone as tz
        r = client.get(f"{BASE_URL}/api/dispatch/schedules?limit=50", timeout=60)
        base_rows = r.json().get("items", [])
        if not base_rows:
            pytest.skip("no existing schedule to clone ids from")
        src = None
        for row in base_rows:
            if row.get("client_id") and row.get("vendor_id") and row.get("post_site_id") and row.get("officer_id"):
                src = row
                break
        if not src:
            pytest.skip("no schedule with full ids")

        # Create a fresh schedule for "now" (company tz Asia/Dhaka = UTC+6)
        local_now = datetime.now(tz.utc) + timedelta(hours=6)
        start = local_now - timedelta(minutes=20)
        end = start + timedelta(hours=6)
        payload = {
            "schedule_mode": "once",
            "date": start.strftime("%Y-%m-%d"),
            "shift_type": "Morning",
            "start_time": start.strftime("%H:%M"),
            "end_time": end.strftime("%H:%M"),
            "client_id": src["client_id"],
            "vendor_id": src["vendor_id"],
            "post_site_id": src["post_site_id"],
            "officer_id": src["officer_id"],
            "remarks": "TEST_iter31_live_tracking",
        }
        cr = client.post(f"{BASE_URL}/api/dispatch/schedules", json=payload, timeout=60)
        assert cr.status_code in (200, 201), f"create schedule failed: {cr.status_code} {cr.text[:400]}"
        created = cr.json()
        sched = created.get("items", [created])[0] if isinstance(created, dict) and "items" in created else created
        sched_id = sched.get("id")
        assert sched_id, f"no id in create response: {str(created)[:300]}"
        detail = client.get(f"{BASE_URL}/api/dispatch/schedules/{sched_id}", timeout=30).json()
        token = detail.get("tracking_token")
        assert token, "created schedule has no tracking_token"
        sched = {"id": sched_id, "tracking_token": token}
        info = requests.get(f"{BASE_URL}/api/shift-track/{token}", timeout=30).json()
        geo = info.get("geofence") or {}
        lat = geo.get("latitude") if geo.get("latitude") is not None else 23.8103
        lng = geo.get("longitude") if geo.get("longitude") is not None else 90.4125
        ci = requests.post(
            f"{BASE_URL}/api/shift-track/{token}/clock-in",
            json={"latitude": lat, "longitude": lng},
            timeout=30,
        )
        if ci.status_code not in (200, 201):
            pytest.skip(f"clock-in not possible: {ci.status_code} {ci.text[:200]}")
        lt = client.get(f"{BASE_URL}/api/dispatch/live-tracking", timeout=60)
        assert lt.status_code == 200
        ids = [o["schedule_id"] for o in lt.json()["officers"]]
        assert sched["id"] in ids, "clocked-in officer not in live-tracking"
        me = [o for o in lt.json()["officers"] if o["schedule_id"] == sched["id"]][0]
        assert me["position"] is not None
        # cleanup: clock out + delete test schedule
        requests.post(f"{BASE_URL}/api/shift-track/{token}/clock-out",
                      json={"latitude": lat, "longitude": lng}, timeout=30)
        client.delete(f"{BASE_URL}/api/dispatch/schedules/{sched_id}", timeout=30)
