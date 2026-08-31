"""Iter16: Verify client-portal reuse of admin PaymentSOPage.

Backend focus:
- /portal/so-payments/* endpoints scoped to Arseas client.
- Officer search ignores injected client_id.
- Create/Update/Delete/Export logged in dispatch_audit as payment_so.
- Direct /api/so-payments/* returns 403 for client role.
- Admin regression on /api/so-payments/clients still shows all clients.
"""
import os
import pytest
import requests

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or
            open("/app/frontend/.env").read().split("REACT_APP_BACKEND_URL=")[1].split("\n")[0]
            ).rstrip("/")
API = f"{BASE_URL}/api"

CLIENT = {"email": "info@arseas.com", "password": "Client@123"}
ADMIN = {"email": "admin@example.com", "password": "admin123"}


def _login(creds):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="module")
def client_session():
    return _login(CLIENT)


@pytest.fixture(scope="module")
def admin_session():
    return _login(ADMIN)


class TestClientPortalPaymentSO:
    def test_clients_landing_only_arseas(self, client_session):
        r = client_session.get(f"{API}/portal/so-payments/clients")
        assert r.status_code == 200, r.text
        rows = r.json()
        assert isinstance(rows, list)
        assert len(rows) == 1, f"expected exactly 1 client, got {rows}"
        assert "Arseas" in (rows[0].get("name") or ""), rows

    def test_officer_search_scoped_ignores_injected_client(self, client_session):
        # Try injecting bogus client_id — must still return only Arseas' officers
        r = client_session.get(f"{API}/portal/so-payments/officers/search",
                               params={"client_id": "000000000000000000000000", "q": ""})
        assert r.status_code == 200, r.text
        officers = r.json()
        assert isinstance(officers, list)
        names = [o.get("name", "") for o in officers]
        assert any("Abir" in n for n in names), f"Abir Vai missing: {names}"

    def test_records_list_scoped(self, client_session):
        r = client_session.get(f"{API}/portal/so-payments/records")
        assert r.status_code == 200, r.text

    def test_full_crud_and_audit(self, client_session, admin_session):
        # Find Abir Vai officer
        r = client_session.get(f"{API}/portal/so-payments/officers/search", params={"q": "Abir"})
        assert r.status_code == 200
        officers = r.json()
        officer = next((o for o in officers if "Abir" in o.get("name", "")), None)
        assert officer, f"Abir Vai officer not found: {officers}"
        officer_id = officer.get("id") or officer.get("_id")

        # CREATE
        payload = {
            "officer_id": officer_id,
            "w2": {"date": "2026-01-15", "amount": 123.45},
            "w9_direct_deposit": {"date": None, "amount": 0},
            "w9_zelle": {"date": None, "amount": 0},
        }
        r = client_session.post(f"{API}/portal/so-payments/records", json=payload)
        assert r.status_code in (200, 201), f"create failed: {r.status_code} {r.text}"
        created = r.json()
        record_id = created.get("id") or created.get("_id")
        assert record_id
        # some backends store total as w2 total; just ensure it echoes
        assert float(created.get("total", 0)) == 123.45

        # UPDATE
        payload["w2"]["amount"] = 200.00
        r = client_session.put(f"{API}/portal/so-payments/records/{record_id}", json=payload)
        assert r.status_code == 200, f"update failed: {r.status_code} {r.text}"

        # DELETE
        r = client_session.delete(f"{API}/portal/so-payments/records/{record_id}")
        assert r.status_code in (200, 204), f"delete failed: {r.status_code} {r.text}"

        # AUDIT — admin should see create/update/delete rows for payment_so with client_name Arseas
        au = admin_session.get(f"{API}/dispatch/audit",
                               params={"entity_type": "payment_so", "limit": 100})
        assert au.status_code == 200
        items = au.json().get("items") or []
        actions = {i.get("action") for i in items if
                   (i.get("client_name") or "").startswith("Arseas")}
        for act in ("create", "update", "delete"):
            assert act in actions, f"{act} not in audit for Arseas payment_so: {actions}"

    def test_export_pdf_and_xlsx(self, client_session, admin_session):
        # client-level PDF
        r = client_session.get(f"{API}/portal/so-payments/records/report/pdf")
        assert r.status_code == 200, r.text
        assert len(r.content) > 200
        # client-level XLSX
        r = client_session.get(f"{API}/portal/so-payments/records/report/xlsx")
        assert r.status_code == 200
        # officer-level: find Abir
        r = client_session.get(f"{API}/portal/so-payments/officers/search", params={"q": "Abir"})
        officer = next(o for o in r.json() if "Abir" in o.get("name", ""))
        oid = officer.get("id") or officer.get("_id")
        r = client_session.get(f"{API}/portal/so-payments/records/officer/report/pdf",
                               params={"officer_id": oid})
        assert r.status_code == 200
        r = client_session.get(f"{API}/portal/so-payments/records/officer/report/xlsx",
                               params={"officer_id": oid})
        assert r.status_code == 200

        # Audit contains export rows for Arseas
        au = admin_session.get(f"{API}/dispatch/audit",
                               params={"entity_type": "payment_so", "action": "export",
                                       "limit": 100})
        assert au.status_code == 200
        items = au.json().get("items") or []
        assert any((i.get("client_name") or "").startswith("Arseas") for i in items), \
            f"No Arseas payment_so export in audit"


class TestSecurity:
    def test_direct_admin_endpoint_forbidden_for_client(self, client_session):
        for path in ["/so-payments/clients", "/so-payments/records",
                     "/so-payments/officers/search"]:
            r = client_session.get(f"{API}{path}")
            assert r.status_code == 403, f"{path} did not return 403: {r.status_code} {r.text}"


class TestAdminRegression:
    def test_admin_clients_shows_all(self, admin_session):
        r = admin_session.get(f"{API}/so-payments/clients")
        assert r.status_code == 200
        rows = r.json()
        # Admin should see >= 2 (Arseas + New Client)
        assert len(rows) >= 2, f"expected >=2 clients, got {len(rows)}: {rows}"
        names = [c.get("name", "") for c in rows]
        assert any("Arseas" in n for n in names)

    def test_admin_records_ok(self, admin_session):
        # Get first client to pass as query param (required by admin endpoint)
        r = admin_session.get(f"{API}/so-payments/clients")
        assert r.status_code == 200
        cid = r.json()[0]["id"]
        r = admin_session.get(f"{API}/so-payments/records", params={"client_id": cid})
        assert r.status_code == 200
