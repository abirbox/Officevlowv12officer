"""Iter17: Client-portal reuse of admin DispatchInvoicesPage (Invoices).

Verifies:
- Client can list/preview/create/download invoices via /portal/dispatch/invoices/*.
- Created invoices are stamped generated_by_role='client' + generated_by_client_name.
- Admin sees ALL invoices in one list; client-generated ones carry the flag.
- Audit rows are recorded for create + export with entity_type='invoice' + client_name.
- Direct /api/dispatch/invoices/* returns 403 for role=client.
- Client cannot fetch a non-owned/bogus invoice (404).
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


class TestClientInvoiceScoping:
    def test_client_list_only_own(self, client_session):
        r = client_session.get(f"{API}/portal/dispatch/invoices", params={"limit": 200})
        assert r.status_code == 200, r.text
        data = r.json()
        items = data.get("items") if isinstance(data, dict) else data
        assert isinstance(items, list)
        # Check seed invoices exist (5250, 5251)
        nums = [str(i.get("invoice_number")) for i in items]
        assert "5250" in nums, f"seed 5250 missing: {nums}"
        assert "5251" in nums, f"seed 5251 missing: {nums}"
        # All must be flagged client-generated for client's own view (seed data)
        for it in items:
            if str(it.get("invoice_number")) in ("5250", "5251"):
                assert it.get("generated_by_role") == "client"

    def test_client_vendors_only_theirs(self, client_session):
        r = client_session.get(f"{API}/portal/dispatch/vendors")
        assert r.status_code == 200
        names = [v.get("name", "") for v in r.json()]
        assert any("Protos" in n for n in names), f"Protos Security missing: {names}"

    def test_client_next_number(self, client_session):
        r = client_session.get(f"{API}/portal/dispatch/invoices/next-number")
        assert r.status_code == 200, r.text
        n = r.json()
        num = n.get("invoice_number") or n.get("next") or n
        assert num, n

    def test_client_bogus_invoice_404(self, client_session):
        r = client_session.get(f"{API}/portal/dispatch/invoices/000000000000000000000000")
        assert r.status_code == 404


class TestClientInvoiceCreate:
    _created_id = None
    _created_num = None

    def test_create_invoice_flow(self, client_session, admin_session):
        # Find Arseas client id
        r = client_session.get(f"{API}/portal/dispatch/clients")
        assert r.status_code == 200
        clients = r.json()
        assert len(clients) == 1
        arseas_id = clients[0]["id"]

        # Find Protos vendor
        r = client_session.get(f"{API}/portal/dispatch/vendors")
        vendors = r.json()
        vendor = next((v for v in vendors if "Protos" in v.get("name", "")), None)
        assert vendor, f"Protos Security not found: {[v.get('name') for v in vendors]}"
        vendor_id = vendor["id"]

        # Get next number
        r = client_session.get(f"{API}/portal/dispatch/invoices/next-number")
        num = r.json().get("invoice_number") or r.json().get("next")
        assert num
        TestClientInvoiceCreate._created_num = str(num)

        # Preview first
        payload = {
            "client_id": arseas_id,
            "vendor_id": vendor_id,
            "invoice_number": str(num),
            "invoice_date": "2026-09-01",
            "billing_period_from": "2026-08-01",
            "billing_period_to": "2026-08-31",
            "line_items": [],
            "notes": "TEST_iter17 client-generated invoice",
        }
        r = client_session.post(f"{API}/portal/dispatch/invoices/preview", json=payload)
        assert r.status_code == 200, f"preview failed: {r.status_code} {r.text}"
        preview = r.json()
        line_items = preview.get("line_items") or []
        # Attach preview data to payload for save
        payload["line_items"] = line_items
        payload["total_hours"] = preview.get("total_hours")
        payload["total_amount"] = preview.get("total_amount")
        payload["client_snapshot"] = preview.get("client_snapshot")
        payload["vendor_snapshot"] = preview.get("vendor_snapshot")

        # CREATE
        r = client_session.post(f"{API}/portal/dispatch/invoices", json=payload)
        assert r.status_code in (200, 201), f"create failed: {r.status_code} {r.text}"
        created = r.json()
        inv_id = created.get("id") or created.get("_id")
        assert inv_id
        assert created.get("generated_by_role") == "client"
        assert "Arseas" in (created.get("generated_by_client_name") or "")
        TestClientInvoiceCreate._created_id = inv_id

        # GET verify persistence
        r = client_session.get(f"{API}/portal/dispatch/invoices/{inv_id}")
        assert r.status_code == 200
        got = r.json()
        assert got.get("generated_by_role") == "client"
        assert str(got.get("invoice_number")) == str(num)

    def test_download_pdf(self, client_session):
        inv_id = TestClientInvoiceCreate._created_id
        assert inv_id, "prior create test failed"
        r = client_session.get(f"{API}/portal/dispatch/invoices/{inv_id}/pdf")
        assert r.status_code == 200, r.text
        assert r.content[:4] == b"%PDF", f"Not a PDF: {r.content[:20]}"
        assert len(r.content) > 500

    def test_admin_sees_client_generated(self, admin_session):
        num = TestClientInvoiceCreate._created_num
        assert num
        r = admin_session.get(f"{API}/dispatch/invoices",
                              params={"invoice_number": num, "limit": 50})
        assert r.status_code == 200, r.text
        data = r.json()
        items = data.get("items") if isinstance(data, dict) else data
        target = next((i for i in items if str(i.get("invoice_number")) == num), None)
        assert target, f"admin missing invoice #{num}: {items}"
        assert target.get("generated_by_role") == "client"
        assert "Arseas" in (target.get("generated_by_client_name") or "")

    def test_admin_seed_invoices_flagged(self, admin_session):
        for num in ("5250", "5251"):
            r = admin_session.get(f"{API}/dispatch/invoices",
                                  params={"invoice_number": num, "limit": 10})
            assert r.status_code == 200
            data = r.json()
            items = data.get("items") if isinstance(data, dict) else data
            target = next((i for i in items if str(i.get("invoice_number")) == num), None)
            assert target, f"seed #{num} missing"
            assert target.get("generated_by_role") == "client", \
                f"seed #{num} not flagged client: {target}"

    def test_audit_has_create_and_export(self, admin_session):
        num = TestClientInvoiceCreate._created_num
        r = admin_session.get(f"{API}/dispatch/audit",
                              params={"entity_type": "invoice", "limit": 200})
        assert r.status_code == 200
        items = r.json().get("items") or []
        arseas = [i for i in items if (i.get("client_name") or "").startswith("Arseas")]
        assert arseas, f"No Arseas invoice audit rows: {items[:3]}"
        actions = {i.get("action") for i in arseas}
        assert "create" in actions, f"missing create: {actions}"
        assert "export" in actions, f"missing export: {actions}"

    def test_cleanup_delete_created(self, client_session):
        inv_id = TestClientInvoiceCreate._created_id
        if not inv_id:
            pytest.skip("nothing to cleanup")
        r = client_session.delete(f"{API}/portal/dispatch/invoices/{inv_id}")
        assert r.status_code in (200, 204), r.text


class TestSecurity:
    def test_direct_admin_endpoint_403_for_client(self, client_session):
        for path in ["/dispatch/invoices",
                     "/dispatch/invoices/next-number"]:
            r = client_session.get(f"{API}{path}")
            assert r.status_code == 403, f"{path}: {r.status_code} {r.text[:120]}"

    def test_admin_regression_can_create(self, admin_session):
        # Admin lists clients and creates a normal invoice (no client flag)
        r = admin_session.get(f"{API}/dispatch/clients")
        assert r.status_code == 200
        clients = r.json()
        # Pick any client that has a vendor with schedules; try Arseas first
        arseas = next((c for c in clients if "Arseas" in c.get("name", "")), clients[0])
        cid = arseas["id"]
        r = admin_session.get(f"{API}/dispatch/vendors", params={"client_id": cid})
        vendors = r.json()
        vendors = vendors.get("items") if isinstance(vendors, dict) else vendors
        vendor = next((v for v in vendors if "Protos" in v.get("name", "")), None)
        if not vendor:
            pytest.skip("No Protos vendor for admin regression test")
        r = admin_session.get(f"{API}/dispatch/invoices/next-number")
        num = r.json().get("invoice_number") or r.json().get("next")

        payload = {
            "client_id": cid, "vendor_id": vendor["id"],
            "invoice_number": str(num), "invoice_date": "2026-09-02",
            "billing_period_from": "2026-08-01", "billing_period_to": "2026-08-31",
            "line_items": [], "notes": "TEST_iter17 admin invoice",
        }
        r = admin_session.post(f"{API}/dispatch/invoices/preview", json=payload)
        assert r.status_code == 200, r.text
        pv = r.json()
        payload["line_items"] = pv.get("line_items") or []
        payload["total_hours"] = pv.get("total_hours")
        payload["total_amount"] = pv.get("total_amount")
        payload["client_snapshot"] = pv.get("client_snapshot")
        payload["vendor_snapshot"] = pv.get("vendor_snapshot")

        r = admin_session.post(f"{API}/dispatch/invoices", json=payload)
        assert r.status_code in (200, 201), r.text
        created = r.json()
        inv_id = created.get("id")
        assert not created.get("generated_by_role"), \
            f"admin-created should have no client flag: {created.get('generated_by_role')}"

        # cleanup
        admin_session.delete(f"{API}/dispatch/invoices/{inv_id}")
