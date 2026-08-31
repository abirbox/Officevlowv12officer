"""Backend tests for client-portal Wage Report edit/export + Payment SO CRUD/export
and the admin audit-log integration (client_name, entity_type payment_so/wage_report,
action=export).
"""
import os
import io
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


# ---------- WAGE REPORT ----------
class TestWageReport:
    def test_get_wage_report(self, client_session):
        r = client_session.get(f"{API}/portal/wage-report",
                               params={"date_from": "2026-08-01", "date_to": "2026-08-31"})
        assert r.status_code == 200
        data = r.json()
        assert "items" in data and "totals" in data
        assert len(data["items"]) >= 1
        officer = data["items"][0]
        assert officer["officer_name"]
        assert "rate" in officer and "wage" in officer

    def test_edit_rate_recalculates_wage(self, client_session):
        params = {"date_from": "2026-08-01", "date_to": "2026-08-31"}
        r = client_session.get(f"{API}/portal/wage-report", params=params)
        officer = r.json()["items"][0]
        oid = officer["officer_id"]
        # set rate to 30
        put = client_session.put(
            f"{API}/portal/wage-report/officer/{oid}/rate",
            json={"rate": 30, "date_from": params["date_from"], "date_to": params["date_to"]},
        )
        assert put.status_code == 200, put.text
        assert put.json()["rate"] == 30
        # verify recomputed
        r2 = client_session.get(f"{API}/portal/wage-report", params=params)
        item = next(x for x in r2.json()["items"] if x["officer_id"] == oid)
        assert item["rate"] == 30
        assert item["wage"] == round(item["total_hours"] * 30, 2)

    def test_export_pdf(self, client_session):
        r = client_session.get(f"{API}/portal/wage-report/report/pdf",
                               params={"date_from": "2026-08-01", "date_to": "2026-08-31"})
        assert r.status_code == 200
        assert r.headers["content-type"].startswith("application/pdf")
        assert len(r.content) > 500

    def test_export_xlsx(self, client_session):
        r = client_session.get(f"{API}/portal/wage-report/report/xlsx",
                               params={"date_from": "2026-08-01", "date_to": "2026-08-31"})
        assert r.status_code == 200
        assert "spreadsheet" in r.headers["content-type"]
        assert len(r.content) > 500

    def test_officer_payslip_pdf(self, client_session):
        params = {"date_from": "2026-08-01", "date_to": "2026-08-31"}
        r = client_session.get(f"{API}/portal/wage-report", params=params)
        oid = r.json()["items"][0]["officer_id"]
        pay = client_session.get(f"{API}/portal/officers/{oid}/payslip",
                                 params={**params, "format": "pdf"})
        assert pay.status_code == 200
        assert pay.headers["content-type"].startswith("application/pdf")


# ---------- PAYMENT (SO) ----------
class TestPaymentSO:
    def test_officer_search_scoped(self, client_session):
        r = client_session.get(f"{API}/portal/payments/officers/search", params={"q": ""})
        assert r.status_code == 200
        results = r.json()
        assert len(results) >= 1
        assert all("id" in o and "name" in o for o in results)

    def test_full_payment_crud(self, client_session):
        r = client_session.get(f"{API}/portal/payments/officers/search", params={"q": ""})
        officer_id = r.json()[0]["id"]
        # CREATE
        body = {
            "officer_id": officer_id,
            "w2": {"date": "2026-08-15", "amount": 500},
            "w9_direct_deposit": {"date": "2026-08-15", "amount": 200},
            "w9_zelle": {"date": "2026-08-15", "amount": 100},
        }
        cr = client_session.post(f"{API}/portal/payments/records", json=body)
        assert cr.status_code == 200, cr.text
        rec = cr.json()
        assert rec["total"] == 800.0
        rid = rec["id"]

        # GET via officer context
        ctx = client_session.get(f"{API}/portal/payments/officer/{officer_id}")
        assert ctx.status_code == 200
        assert any(x["id"] == rid for x in ctx.json()["records"])

        # UPDATE
        body["w2"]["amount"] = 700
        upd = client_session.put(f"{API}/portal/payments/records/{rid}", json=body)
        assert upd.status_code == 200
        assert upd.json()["total"] == 1000.0

        # EXPORT (officer report)
        ex_pdf = client_session.get(f"{API}/portal/payments/officer/{officer_id}/report/pdf")
        assert ex_pdf.status_code == 200
        ex_xlsx = client_session.get(f"{API}/portal/payments/officer/{officer_id}/report/xlsx")
        assert ex_xlsx.status_code == 200

        # EXPORT (client-level)
        cl_pdf = client_session.get(f"{API}/portal/payments/report/pdf")
        assert cl_pdf.status_code == 200

        # DELETE
        dl = client_session.delete(f"{API}/portal/payments/records/{rid}")
        assert dl.status_code == 200
        ctx2 = client_session.get(f"{API}/portal/payments/officer/{officer_id}")
        assert not any(x["id"] == rid for x in ctx2.json()["records"])


# ---------- ADMIN AUDIT ----------
class TestAdminAudit:
    def test_audit_lists_include_new_entities_and_export(self, admin_session):
        r = admin_session.get(f"{API}/dispatch/audit", params={"limit": 1})
        assert r.status_code == 200
        data = r.json()
        assert "payment_so" in data["entity_types"]
        assert "wage_report" in data["entity_types"]
        assert "export" in data["actions"]

    def test_audit_shows_client_actions(self, admin_session):
        # After the previous tests, there should be entries from Arseas with client_name.
        r = admin_session.get(f"{API}/dispatch/audit",
                              params={"entity_type": "wage_report", "limit": 20})
        assert r.status_code == 200
        items = r.json()["items"]
        assert len(items) >= 1
        assert any(i.get("client_name") for i in items), "no client_name on wage_report audit rows"

        r2 = admin_session.get(f"{API}/dispatch/audit",
                               params={"entity_type": "payment_so", "limit": 20})
        assert r2.status_code == 200
        items2 = r2.json()["items"]
        assert len(items2) >= 1
        assert any(i.get("action") == "export" for i in items2), "no export action on payment_so audit"
        assert any(i.get("client_name") for i in items2), "no client_name on payment_so audit rows"
