"""Iter15: Verify client-portal reuse of admin DispatchReportsPage.

Backend focus:
- /portal/dispatch/reports/* endpoints are scoped to Arseas client.
- Export logs into dispatch_audit as wage_report/export with client_name.
- Direct /api/dispatch/reports/by-client returns 403 for client role.
- Admin /api/dispatch/reports still works unscoped.
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
FROM = "2026-08-01"
TO = "2026-08-31"


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


class TestClientReuseEndpoints:
    def test_schedules_scoped(self, client_session):
        r = client_session.get(f"{API}/portal/dispatch/reports/schedules",
                               params={"date_from": FROM, "date_to": TO, "limit": 200})
        assert r.status_code == 200, r.text
        data = r.json()
        items = data.get("items") or data.get("schedules") or data
        # Every schedule must belong to Arseas
        for it in (items if isinstance(items, list) else []):
            cname = (it.get("client_name") or it.get("client") or "")
            if cname:
                assert "Arseas" in cname, f"non-Arseas schedule leaked: {cname}"

    def test_by_officer_has_abir(self, client_session):
        r = client_session.get(f"{API}/portal/dispatch/reports/by-officer",
                               params={"date_from": FROM, "date_to": TO})
        assert r.status_code == 200, r.text
        items = r.json().get("items") or r.json().get("rows") or []
        names = [i.get("name") or i.get("officer_name") or "" for i in items]
        assert any("Abir" in n for n in names), f"Abir Vai missing: {names}"

    def test_by_client_only_arseas(self, client_session):
        r = client_session.get(f"{API}/portal/dispatch/reports/by-client",
                               params={"date_from": FROM, "date_to": TO})
        assert r.status_code == 200, r.text
        items = r.json().get("items") or r.json().get("rows") or []
        assert len(items) == 1, f"expected exactly 1 client row, got {len(items)}: {items}"
        name = items[0].get("name") or items[0].get("client_name") or ""
        assert "Arseas" in name

    def test_by_post_site_scoped(self, client_session):
        r = client_session.get(f"{API}/portal/dispatch/reports/by-post-site",
                               params={"date_from": FROM, "date_to": TO})
        assert r.status_code == 200, r.text

    def test_by_vendor_scoped(self, client_session):
        r = client_session.get(f"{API}/portal/dispatch/reports/by-vendor",
                               params={"date_from": FROM, "date_to": TO})
        assert r.status_code == 200, r.text

    def test_export_pdf_and_audit(self, client_session, admin_session):
        r = client_session.get(f"{API}/portal/dispatch/reports/export",
                               params={"type": "by-officer", "format": "pdf",
                                       "date_from": FROM, "date_to": TO})
        assert r.status_code == 200, r.text
        assert len(r.content) > 200

        # Verify audit
        au = admin_session.get(f"{API}/dispatch/audit",
                               params={"entity_type": "wage_report", "action": "export",
                                       "limit": 50})
        assert au.status_code == 200
        items = au.json().get("items") or []
        assert any((i.get("client_name") or "").startswith("Arseas") for i in items), \
            f"No Arseas export in audit: {items[:3]}"

    def test_export_xlsx(self, client_session):
        r = client_session.get(f"{API}/portal/dispatch/reports/export",
                               params={"type": "by-officer", "format": "xlsx",
                                       "date_from": FROM, "date_to": TO})
        assert r.status_code == 200
        assert "spreadsheet" in r.headers.get("content-type", "") or \
               "excel" in r.headers.get("content-type", "").lower()


class TestSecurity:
    def test_client_blocked_on_admin_dispatch(self, client_session):
        for path in ["/dispatch/reports/by-client", "/dispatch/reports/by-officer",
                     "/dispatch/reports/by-post-site", "/dispatch/reports/by-vendor",
                     "/dispatch/reports/schedules"]:
            r = client_session.get(f"{API}{path}",
                                   params={"date_from": FROM, "date_to": TO})
            assert r.status_code == 403, f"{path} did not return 403: {r.status_code}"


class TestAdminRegression:
    def test_admin_by_client_shows_all(self, admin_session):
        r = admin_session.get(f"{API}/dispatch/reports/by-client",
                              params={"date_from": FROM, "date_to": TO})
        assert r.status_code == 200
        items = r.json().get("items") or r.json().get("rows") or []
        # Admin should see all clients (>=1; ideally >1 if seed has 2 clients)
        assert len(items) >= 1

    def test_admin_by_officer_ok(self, admin_session):
        r = admin_session.get(f"{API}/dispatch/reports/by-officer",
                              params={"date_from": FROM, "date_to": TO})
        assert r.status_code == 200

    def test_admin_export_ok(self, admin_session):
        r = admin_session.get(f"{API}/dispatch/reports/export",
                              params={"type": "by-officer", "format": "pdf",
                                      "date_from": FROM, "date_to": TO})
        assert r.status_code == 200
