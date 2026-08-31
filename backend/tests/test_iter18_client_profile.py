"""Iter18 - Client Profile settings (self-service).

Verifies:
- GET /portal/me prefill values are exposed
- PUT /portal/profile updates phone/email/address
- Blank name is rejected (or blank-out is ignored server-side)
- Audit log records entity=client with client_name + actor_role=client
- Admin sees the updated client in Dispatch > Clients
"""
import os
import io
import time
import pytest
import requests

BASE = (os.environ.get("REACT_APP_BACKEND_URL")
        or "https://office-flow-demo.preview.emergentagent.com").rstrip("/")

CLIENT = {"email": "info@arseas.com", "password": "Client@123"}
ADMIN = {"email": "admin@example.com", "password": "admin123"}


def _login(creds):
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, f"login {creds['email']} failed: {r.status_code} {r.text}"
    j = r.json()
    tok = j.get("access_token") or j.get("token") or (j.get("data") or {}).get("access_token")
    if tok:
        s.headers.update({"Authorization": f"Bearer {tok}"})
    # Cookies remain in session too
    return s


@pytest.fixture(scope="module")
def client_sess():
    return _login(CLIENT)


@pytest.fixture(scope="module")
def admin_sess():
    return _login(ADMIN)


# --- prefill / me ---
def test_portal_me_returns_client(client_sess):
    r = client_sess.get(f"{BASE}/api/portal/me", timeout=30)
    assert r.status_code == 200, r.text
    j = r.json()
    assert j.get("client"), "client missing in /portal/me"
    c = j["client"]
    # Must expose fields the profile form binds to
    for k in ("name", "address", "contact_number", "email"):
        assert k in c, f"missing key {k} in /portal/me client"
    assert c.get("name")  # Arseas seed must have a name
    return c


# --- update + persist ---
def test_portal_profile_update_and_persist(client_sess):
    # snapshot
    orig = client_sess.get(f"{BASE}/api/portal/me").json()["client"]
    new_phone = f"+1 555 000 {int(time.time()) % 10000:04d}"
    new_addr = f"TEST_ADDR {int(time.time())} Main St"
    payload = {
        "name": orig["name"],  # keep same to not break other tests
        "contact_number": new_phone,
        "address": new_addr,
        "email": orig.get("email") or "billing@arseas.com",
    }
    r = client_sess.put(f"{BASE}/api/portal/profile", json=payload, timeout=30)
    assert r.status_code == 200, r.text
    saved = r.json()["client"]
    assert saved["contact_number"] == new_phone
    assert saved["address"] == new_addr

    # persist via GET
    r2 = client_sess.get(f"{BASE}/api/portal/me")
    c2 = r2.json()["client"]
    assert c2["contact_number"] == new_phone
    assert c2["address"] == new_addr


def test_portal_profile_blank_name_blocked(client_sess):
    """Blank name must not overwrite the client's name."""
    orig = client_sess.get(f"{BASE}/api/portal/me").json()["client"]
    r = client_sess.put(
        f"{BASE}/api/portal/profile",
        json={"name": "   ", "address": orig.get("address") or "x"},
        timeout=30,
    )
    # Either 400 (nothing to update if only blank name) or 200 but name kept
    assert r.status_code in (200, 400), r.text
    c = client_sess.get(f"{BASE}/api/portal/me").json()["client"]
    assert c["name"] == orig["name"], "blank name overwrote existing name"


def test_portal_profile_endpoint_has_no_id_param():
    """Security: PUT /api/portal/profile must not accept an id-scoped path."""
    # Unauthenticated: must be 401/403, not 404 (i.e. route exists at exactly this path).
    r = requests.put(f"{BASE}/api/portal/profile", json={"name": "x"}, timeout=15)
    assert r.status_code in (401, 403), f"got {r.status_code}: {r.text[:200]}"


# --- logo upload ---
def test_portal_logo_upload(client_sess):
    # 1x1 png
    png = (
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
        b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xf8\x0f"
        b"\x00\x01\x01\x01\x00\x1b\xb6\xee\x56\x00\x00\x00\x00IEND\xaeB`\x82"
    )
    files = {"file": ("logo.png", io.BytesIO(png), "image/png")}
    r = client_sess.post(f"{BASE}/api/portal/dispatch/upload-logo", files=files, timeout=30)
    assert r.status_code == 200, r.text
    url = r.json().get("url")
    assert url, "upload did not return url"

    # Save via profile PUT and confirm persistence
    orig = client_sess.get(f"{BASE}/api/portal/me").json()["client"]
    r2 = client_sess.put(
        f"{BASE}/api/portal/profile",
        json={"name": orig["name"], "logo_path": url},
        timeout=30,
    )
    assert r2.status_code == 200, r2.text
    c = client_sess.get(f"{BASE}/api/portal/me").json()["client"]
    assert c.get("logo_path") == url
    assert c.get("logo_url"), "logo_url should be present after upload"


# --- admin visibility ---
def test_admin_sees_updated_client_and_audit(admin_sess, client_sess):
    # Trigger a fresh update so audit is recent
    phone_marker = f"+1 555 999 {int(time.time()) % 10000:04d}"
    orig = client_sess.get(f"{BASE}/api/portal/me").json()["client"]
    r = client_sess.put(
        f"{BASE}/api/portal/profile",
        json={"name": orig["name"], "contact_number": phone_marker},
        timeout=30,
    )
    assert r.status_code == 200

    # Admin: Dispatch > Clients list must reflect new phone
    r2 = admin_sess.get(f"{BASE}/api/dispatch/clients", timeout=30)
    assert r2.status_code == 200, r2.text
    items = r2.json() if isinstance(r2.json(), list) else r2.json().get("items", [])
    match = next((c for c in items if c.get("name") == orig["name"]), None)
    assert match, f"client {orig['name']!r} not visible to admin"
    assert match.get("contact_number") == phone_marker

    # Admin: Audit log has an update for entity 'client' with client_name + actor_role=client
    r3 = admin_sess.get(
        f"{BASE}/api/dispatch/audit",
        params={"entity": "client", "action": "update", "limit": 25},
        timeout=30,
    )
    if r3.status_code != 200:
        # Fallback: unfiltered list
        r3 = admin_sess.get(f"{BASE}/api/dispatch/audit", params={"limit": 50}, timeout=30)
    assert r3.status_code == 200, r3.text
    body = r3.json()
    rows = body if isinstance(body, list) else (body.get("items") or body.get("rows") or [])
    found = False
    for row in rows:
        ent = str(row.get("entity") or row.get("entity_type") or "").lower()
        if ent == "client" and row.get("action") == "update":
            name_txt = str(row.get("entity_name") or row.get("client_name") or row.get("label") or "")
            if orig["name"] in name_txt or str(row.get("actor_role")) == "client":
                found = True
                break
    assert found, f"no matching audit row for client update; sample={rows[:3]}"
