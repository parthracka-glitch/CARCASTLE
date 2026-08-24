"""Car Castle Goa — Backend API integration tests.

Covers: auth, role gating, owners/agents/cars CRUD, bookings with ledger side-effects,
transfers, ledger payments/reminders, finance summary/timeseries, PDF/XLSX reports,
settings, and activity log. Uses live REACT_APP_BACKEND_URL from frontend/.env.
"""
import os
import io
import time
import uuid
import pytest
import requests
from pathlib import Path

# Read backend URL from frontend/.env or fallback to localhost:8000
FRONTEND_ENV = Path(__file__).resolve().parent.parent.parent / "frontend" / ".env"
if not FRONTEND_ENV.exists():
    FRONTEND_ENV = Path("/app/frontend/.env")

BASE_URL = "http://localhost:8000"
if FRONTEND_ENV.exists():
    for line in FRONTEND_ENV.read_text().splitlines():
        if line.startswith("REACT_APP_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
            break

API = f"{BASE_URL}/api"

SUPER = {"email": "admin@carcastlegoa.com", "password": "admin123"}
OP1 = {"email": "operator1@carcastlegoa.com", "password": "operator123"}
OP2 = {"email": "operator2@carcastlegoa.com", "password": "operator123"}


# -------- helpers --------
def login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, f"login failed for {creds['email']}: {r.status_code} {r.text}"
    body = r.json()
    assert "access_token" in body
    assert body["email"] == creds["email"]
    return body["access_token"], r.cookies


def hdr(token):
    return {"Authorization": f"Bearer {token}"}


# -------- fixtures --------
@pytest.fixture(scope="session")
def super_token():
    tok, _ = login(SUPER)
    return tok


@pytest.fixture(scope="session")
def op_token():
    tok, _ = login(OP1)
    return tok


# ==================== AUTH ====================
class TestAuth:
    def test_login_super_admin(self):
        r = requests.post(f"{API}/auth/login", json=SUPER)
        assert r.status_code == 200
        data = r.json()
        assert data["role"] == "super_admin"
        assert data["email"] == SUPER["email"]
        assert isinstance(data["access_token"], str) and len(data["access_token"]) > 20
        # httpOnly cookie set
        assert "access_token" in r.cookies

    def test_login_operator(self):
        r = requests.post(f"{API}/auth/login", json=OP1)
        assert r.status_code == 200
        assert r.json()["role"] == "operator"
        assert "access_token" in r.cookies

    def test_login_invalid_credentials(self):
        r = requests.post(f"{API}/auth/login",
                          json={"email": "admin@carcastlegoa.com", "password": "wrongpass"})
        assert r.status_code == 401

    def test_me_with_bearer(self, super_token):
        r = requests.get(f"{API}/auth/me", headers=hdr(super_token))
        assert r.status_code == 200
        assert r.json()["email"] == SUPER["email"]

    def test_me_no_auth(self):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401

    def test_logout(self):
        # login → logout with cookies session
        s = requests.Session()
        r = s.post(f"{API}/auth/login", json=SUPER)
        assert r.status_code == 200
        # Use cookie session for logout
        r2 = s.post(f"{API}/auth/logout")
        assert r2.status_code == 200
        assert r2.json().get("ok") is True


# ==================== ROLE GATING (operator forbidden) ====================
class TestRoleGating:
    RESTRICTED_GET = [
        "/ledger",
        "/finance/summary",
        "/finance/margin-timeseries",
        "/activity",
        "/rate-history",
    ]

    @pytest.mark.parametrize("path", RESTRICTED_GET)
    def test_operator_forbidden_get(self, op_token, path):
        r = requests.get(f"{API}{path}", headers=hdr(op_token))
        assert r.status_code == 403, f"expected 403 for {path}, got {r.status_code}"

    def test_operator_forbidden_reports(self, op_token):
        for path in ["/reports/monthly.pdf?month=2025-01", "/reports/monthly.xlsx?month=2025-01"]:
            r = requests.get(f"{API}{path}", headers=hdr(op_token))
            assert r.status_code == 403, f"{path} → {r.status_code}"

    def test_operator_forbidden_owners_mutations(self, op_token):
        r = requests.post(f"{API}/owners",
                          json={"name": "TEST_op", "contact": "9999"},
                          headers=hdr(op_token))
        assert r.status_code == 403

    def test_operator_forbidden_agents(self, op_token):
        # listing agents is allowed (get_current_user), but creating not
        r = requests.post(f"{API}/agents",
                          json={"name": "TEST_agent_op", "contact": "9"},
                          headers=hdr(op_token))
        assert r.status_code == 403

    def test_operator_forbidden_cars_create(self, op_token):
        r = requests.post(f"{API}/cars",
                          json={"registration_no": "TEST-XX-01", "model": "X",
                                "owner_id": "any", "default_cost_rate": 100},
                          headers=hdr(op_token))
        assert r.status_code == 403


# ==================== OWNERS ====================
class TestOwners:
    def test_owner_crud(self, super_token):
        # CREATE
        payload = {"name": f"TEST_Owner_{uuid.uuid4().hex[:6]}", "contact": "9000000001"}
        r = requests.post(f"{API}/owners", json=payload, headers=hdr(super_token))
        assert r.status_code == 200, r.text
        owner = r.json()
        assert owner["name"] == payload["name"]
        assert "id" in owner
        assert owner["total_owed"] == 0.0
        oid = owner["id"]

        # GET single (with cars & bookings_count)
        r = requests.get(f"{API}/owners/{oid}", headers=hdr(super_token))
        assert r.status_code == 200
        got = r.json()
        assert got["name"] == payload["name"]
        assert "cars" in got and isinstance(got["cars"], list)
        assert "bookings_count" in got

        # UPDATE
        r = requests.put(f"{API}/owners/{oid}",
                         json={"name": payload["name"] + "_U", "contact": "9111111111"},
                         headers=hdr(super_token))
        assert r.status_code == 200
        r = requests.get(f"{API}/owners/{oid}", headers=hdr(super_token))
        assert r.json()["name"].endswith("_U")

        # DELETE
        r = requests.delete(f"{API}/owners/{oid}", headers=hdr(super_token))
        assert r.status_code == 200
        r = requests.get(f"{API}/owners/{oid}", headers=hdr(super_token))
        assert r.status_code == 404


# ==================== AGENTS ====================
class TestAgents:
    def test_agent_crud(self, super_token):
        p = {"name": f"TEST_Agent_{uuid.uuid4().hex[:6]}", "contact": "9500000001"}
        r = requests.post(f"{API}/agents", json=p, headers=hdr(super_token))
        assert r.status_code == 200
        aid = r.json()["id"]

        r = requests.get(f"{API}/agents/{aid}", headers=hdr(super_token))
        assert r.status_code == 200
        assert r.json()["name"] == p["name"]

        r = requests.put(f"{API}/agents/{aid}",
                         json={"name": p["name"] + "_U", "contact": p["contact"]},
                         headers=hdr(super_token))
        assert r.status_code == 200

        r = requests.delete(f"{API}/agents/{aid}", headers=hdr(super_token))
        assert r.status_code == 200


# ==================== CARS + RATE HISTORY ====================
class TestCars:
    def test_car_dup_registration_rejected(self, super_token):
        # create owner
        o = requests.post(f"{API}/owners",
                          json={"name": f"TEST_CO_{uuid.uuid4().hex[:6]}", "contact": "9"},
                          headers=hdr(super_token)).json()
        reg = f"TEST-DUP-{uuid.uuid4().hex[:5]}"
        r1 = requests.post(f"{API}/cars",
                           json={"registration_no": reg, "model": "Test",
                                 "owner_id": o["id"], "default_cost_rate": 1000},
                           headers=hdr(super_token))
        assert r1.status_code == 200
        r2 = requests.post(f"{API}/cars",
                           json={"registration_no": reg, "model": "Test2",
                                 "owner_id": o["id"], "default_cost_rate": 1200},
                           headers=hdr(super_token))
        assert r2.status_code == 400

        # cleanup
        requests.delete(f"{API}/cars/{r1.json()['id']}", headers=hdr(super_token))
        requests.delete(f"{API}/owners/{o['id']}", headers=hdr(super_token))

    def test_car_rate_change_creates_history(self, super_token):
        o = requests.post(f"{API}/owners",
                          json={"name": f"TEST_RH_{uuid.uuid4().hex[:6]}", "contact": "9"},
                          headers=hdr(super_token)).json()
        reg = f"TEST-RH-{uuid.uuid4().hex[:5]}"
        car = requests.post(f"{API}/cars",
                            json={"registration_no": reg, "model": "RH",
                                  "owner_id": o["id"], "default_cost_rate": 1000},
                            headers=hdr(super_token)).json()
        # change rate
        r = requests.put(f"{API}/cars/{car['id']}",
                         json={"registration_no": reg, "model": "RH",
                               "owner_id": o["id"], "default_cost_rate": 1500},
                         headers=hdr(super_token))
        assert r.status_code == 200

        # rate-history entry present
        r = requests.get(f"{API}/rate-history", headers=hdr(super_token))
        assert r.status_code == 200
        entries = r.json()
        matching = [e for e in entries if e.get("entity_id") == car["id"]]
        assert len(matching) >= 1
        e = matching[0]
        assert e["old_rate"] == 1000
        assert e["new_rate"] == 1500

        # cleanup
        requests.delete(f"{API}/cars/{car['id']}", headers=hdr(super_token))
        requests.delete(f"{API}/owners/{o['id']}", headers=hdr(super_token))


# ==================== BOOKINGS + LEDGER SIDE EFFECTS ====================
@pytest.fixture(scope="class")
def booking_setup(super_token):
    """Create owner, car, agent — return their IDs. Cleanup at end."""
    o = requests.post(f"{API}/owners",
                      json={"name": f"TEST_BK_Own_{uuid.uuid4().hex[:5]}", "contact": "9"},
                      headers=hdr(super_token)).json()
    car = requests.post(f"{API}/cars",
                        json={"registration_no": f"TEST-BK-{uuid.uuid4().hex[:5]}",
                              "model": "Swift", "owner_id": o["id"],
                              "default_cost_rate": 1000},
                        headers=hdr(super_token)).json()
    ag = requests.post(f"{API}/agents",
                       json={"name": f"TEST_BK_Ag_{uuid.uuid4().hex[:5]}", "contact": "9"},
                       headers=hdr(super_token)).json()
    yield {"owner": o, "car": car, "agent": ag}
    # cleanup — delete remaining bookings referencing this car
    bks = requests.get(f"{API}/bookings", headers=hdr(super_token)).json()
    for b in bks:
        if b.get("car_id") == car["id"]:
            requests.delete(f"{API}/bookings/{b['id']}", headers=hdr(super_token))
    requests.delete(f"{API}/cars/{car['id']}", headers=hdr(super_token))
    requests.delete(f"{API}/agents/{ag['id']}", headers=hdr(super_token))
    requests.delete(f"{API}/owners/{o['id']}", headers=hdr(super_token))


class TestBookings:
    def test_create_booking_computes_margin_and_ledgers(self, super_token, booking_setup):
        car = booking_setup["car"]
        agent = booking_setup["agent"]
        payload = {
            "customer_name": "TEST_Cust1",
            "customer_contact": "8888",
            "car_id": car["id"],
            "start_date": "2025-05-10",
            "end_date": "2025-05-12",
            "pickup_location": "GOI",
            "drop_location": "Baga",
            "cost_rate": 2000.0,
            "customer_rate": 3500.0,
            "transfer_type": "airport_pickup",
            "assigned_agent_id": agent["id"],
            "agent_fee": 500.0,
        }
        r = requests.post(f"{API}/bookings", json=payload, headers=hdr(super_token))
        assert r.status_code == 200, r.text
        b = r.json()
        assert b["margin"] == 1500.0
        assert b["net_profit"] == 1000.0
        assert b["owner_id"] == booking_setup["owner"]["id"]
        assert b["transfer_status"] == "scheduled"
        bid = b["id"]

        # Ledger side-effect: 2 entries (owner + agent)
        r = requests.get(f"{API}/ledger?booking_id_not_used=1", headers=hdr(super_token))
        assert r.status_code == 200
        # filter by booking
        entries = [e for e in r.json() if e.get("booking_id") == bid]
        assert len(entries) == 2, f"expected 2 ledger entries, got {len(entries)}"
        kinds = sorted([e["entity_type"] for e in entries])
        assert kinds == ["agent", "owner"]

        # Owner total_owed grew by cost_rate
        o_after = requests.get(f"{API}/owners/{booking_setup['owner']['id']}",
                               headers=hdr(super_token)).json()
        assert o_after["total_owed"] >= 2000.0

        # save for other tests
        TestBookings.saved_bid = bid
        TestBookings.saved_owner_ledger = next(e for e in entries if e["entity_type"] == "owner")
        TestBookings.saved_agent_ledger = next(e for e in entries if e["entity_type"] == "agent")

    def test_update_booking_recomputes_margin(self, super_token):
        bid = TestBookings.saved_bid
        r = requests.put(f"{API}/bookings/{bid}",
                         json={"customer_rate": 4000.0},
                         headers=hdr(super_token))
        assert r.status_code == 200
        b = r.json()
        assert b["customer_rate"] == 4000.0
        assert b["margin"] == 2000.0  # 4000-2000
        assert b["net_profit"] == 1500.0  # 2000-500

    def test_operator_get_hides_financials(self, op_token):
        bid = TestBookings.saved_bid
        r = requests.get(f"{API}/bookings/{bid}", headers=hdr(op_token))
        assert r.status_code == 200
        b = r.json()
        for k in ["cost_rate", "margin", "net_profit", "agent_fee"]:
            assert k not in b, f"{k} should be hidden for operator"

    def test_operator_list_hides_financials(self, op_token):
        r = requests.get(f"{API}/bookings", headers=hdr(op_token))
        assert r.status_code == 200
        for b in r.json():
            for k in ["cost_rate", "margin", "net_profit", "agent_fee"]:
                assert k not in b

    def test_operator_put_status_only(self, op_token):
        bid = TestBookings.saved_bid
        r = requests.put(f"{API}/bookings/{bid}",
                         json={"status": "car_received", "cost_rate": 9999.0},
                         headers=hdr(op_token))
        assert r.status_code == 200
        b = r.json()
        # returned sanitized
        assert "cost_rate" not in b
        # verify with super_admin that cost_rate NOT changed
        super_tok, _ = login(SUPER)
        r2 = requests.get(f"{API}/bookings/{bid}", headers=hdr(super_tok))
        assert r2.json()["cost_rate"] == 2000.0
        assert r2.json()["status"] == "car_received"

    def test_operator_create_returns_sanitized(self, op_token, booking_setup):
        car = booking_setup["car"]
        payload = {
            "customer_name": "TEST_OpCreate",
            "customer_contact": "7",
            "car_id": car["id"],
            "start_date": "2025-06-01", "end_date": "2025-06-02",
            "pickup_location": "A", "drop_location": "B",
            "cost_rate": 500.0, "customer_rate": 900.0,
        }
        r = requests.post(f"{API}/bookings", json=payload, headers=hdr(op_token))
        assert r.status_code == 200
        b = r.json()
        for k in ["cost_rate", "margin", "net_profit", "agent_fee"]:
            assert k not in b
        # cleanup
        super_tok, _ = login(SUPER)
        requests.delete(f"{API}/bookings/{b['id']}", headers=hdr(super_tok))

    def test_operator_cannot_delete_booking(self, op_token):
        bid = TestBookings.saved_bid
        r = requests.delete(f"{API}/bookings/{bid}", headers=hdr(op_token))
        assert r.status_code == 403

    def test_delete_booking_reverses_ledger(self, super_token, booking_setup):
        # capture owner totals before delete
        oid = booking_setup["owner"]["id"]
        aid = booking_setup["agent"]["id"]
        o_before = requests.get(f"{API}/owners/{oid}", headers=hdr(super_token)).json()
        a_before = requests.get(f"{API}/agents/{aid}", headers=hdr(super_token)).json()
        bid = TestBookings.saved_bid
        # current booking cost_rate=2000, agent_fee=500
        r = requests.delete(f"{API}/bookings/{bid}", headers=hdr(super_token))
        assert r.status_code == 200
        o_after = requests.get(f"{API}/owners/{oid}", headers=hdr(super_token)).json()
        a_after = requests.get(f"{API}/agents/{aid}", headers=hdr(super_token)).json()
        # totals decreased
        assert o_after["total_owed"] == pytest.approx(o_before["total_owed"] - 2000.0)
        assert a_after["total_owed"] == pytest.approx(a_before["total_owed"] - 500.0)
        # ledger entries removed
        entries = [e for e in requests.get(f"{API}/ledger",
                                           headers=hdr(super_token)).json()
                   if e.get("booking_id") == bid]
        assert entries == []


# ==================== TRANSFERS ====================
class TestTransfers:
    def test_transfers_list_and_status(self, super_token, booking_setup):
        car = booking_setup["car"]
        r = requests.post(f"{API}/bookings",
                          json={
                              "customer_name": "TEST_Transfer",
                              "customer_contact": "8",
                              "car_id": car["id"],
                              "start_date": "2025-07-01", "end_date": "2025-07-02",
                              "pickup_location": "GOI", "drop_location": "hotel",
                              "cost_rate": 1000.0, "customer_rate": 1800.0,
                              "transfer_type": "airport_drop",
                          },
                          headers=hdr(super_token))
        assert r.status_code == 200
        bid = r.json()["id"]

        r = requests.get(f"{API}/transfers", headers=hdr(super_token))
        assert r.status_code == 200
        found = [b for b in r.json() if b["id"] == bid]
        assert len(found) == 1

        # valid status
        r = requests.put(f"{API}/transfers/{bid}/status", json={"status": "en_route"},
                         headers=hdr(super_token))
        assert r.status_code == 200
        assert r.json()["status"] == "en_route"

        # invalid status
        r = requests.put(f"{API}/transfers/{bid}/status", json={"status": "bogus"},
                         headers=hdr(super_token))
        assert r.status_code == 400

        # cleanup
        requests.delete(f"{API}/bookings/{bid}", headers=hdr(super_token))


# ==================== LEDGER PAYMENTS + REMINDERS ====================
class TestLedgerPayments:
    def test_ledger_partial_then_paid_and_overpay(self, super_token, booking_setup):
        car = booking_setup["car"]
        # create booking to have a ledger entry
        b = requests.post(f"{API}/bookings",
                          json={
                              "customer_name": "TEST_Pay",
                              "customer_contact": "8",
                              "car_id": car["id"],
                              "start_date": "2025-08-01", "end_date": "2025-08-02",
                              "pickup_location": "A", "drop_location": "B",
                              "cost_rate": 1000.0, "customer_rate": 1500.0,
                          },
                          headers=hdr(super_token)).json()
        bid = b["id"]

        entries = [e for e in requests.get(f"{API}/ledger",
                                           headers=hdr(super_token)).json()
                   if e.get("booking_id") == bid]
        assert len(entries) == 1
        lid = entries[0]["id"]
        owner_id = entries[0]["entity_id"]

        # partial payment
        r = requests.post(f"{API}/ledger/{lid}/pay",
                         json={"amount_paid": 400.0}, headers=hdr(super_token))
        assert r.status_code == 200
        assert r.json()["status"] == "partial"

        # owner total_paid increased
        o = requests.get(f"{API}/owners/{owner_id}", headers=hdr(super_token)).json()
        assert o["total_paid"] >= 400.0

        # overpayment (400 already paid, 700 more would exceed 1000)
        r = requests.post(f"{API}/ledger/{lid}/pay",
                         json={"amount_paid": 700.0}, headers=hdr(super_token))
        assert r.status_code == 400

        # full pay remaining 600
        r = requests.post(f"{API}/ledger/{lid}/pay",
                         json={"amount_paid": 600.0}, headers=hdr(super_token))
        assert r.status_code == 200
        assert r.json()["status"] == "paid"

        # remind
        r = requests.post(f"{API}/ledger/{lid}/remind", headers=hdr(super_token))
        assert r.status_code == 200
        assert r.json().get("ok") is True

        # reminders_sent incremented
        entries2 = [e for e in requests.get(f"{API}/ledger",
                                            headers=hdr(super_token)).json()
                    if e["id"] == lid]
        assert entries2[0]["reminders_sent"] >= 1

        # cleanup
        requests.delete(f"{API}/bookings/{bid}", headers=hdr(super_token))


# ==================== FINANCE ====================
class TestFinance:
    def test_finance_summary(self, super_token):
        r = requests.get(f"{API}/finance/summary", headers=hdr(super_token))
        assert r.status_code == 200
        data = r.json()
        for k in ["total_income", "total_owner_cost", "total_agent_fee",
                  "total_margin", "total_net_profit", "savings_accrued",
                  "owner_pending", "agent_pending", "by_month"]:
            assert k in data, f"missing {k}"
        assert isinstance(data["by_month"], list)

    @pytest.mark.parametrize("g", ["day", "week", "month"])
    def test_margin_timeseries(self, super_token, g):
        r = requests.get(f"{API}/finance/margin-timeseries?granularity={g}",
                         headers=hdr(super_token))
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        if data:
            assert "bucket" in data[0]
            assert "margin" in data[0]


# ==================== REPORTS ====================
class TestReports:
    def test_pdf_report(self, super_token):
        r = requests.get(f"{API}/reports/monthly.pdf?month=2025-05",
                         headers=hdr(super_token))
        assert r.status_code == 200
        assert r.headers["content-type"].startswith("application/pdf")
        assert r.content.startswith(b"%PDF")
        assert len(r.content) > 500

    def test_xlsx_report(self, super_token):
        r = requests.get(f"{API}/reports/monthly.xlsx?month=2025-05",
                         headers=hdr(super_token))
        assert r.status_code == 200
        # xlsx is application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
        assert "spreadsheetml" in r.headers["content-type"]
        # xlsx is zip container starting with PK
        assert r.content[:2] == b"PK"


# ==================== SETTINGS ====================
class TestSettings:
    def test_settings_super_full(self, super_token):
        r = requests.get(f"{API}/settings", headers=hdr(super_token))
        assert r.status_code == 200
        assert "savings_percent" in r.json()

    def test_settings_operator_limited(self, op_token):
        r = requests.get(f"{API}/settings", headers=hdr(op_token))
        assert r.status_code == 200
        data = r.json()
        assert "savings_percent" not in data
        assert "reminder_template_owner" in data

    def test_update_savings_percent(self, super_token):
        r = requests.put(f"{API}/settings", json={"savings_percent": 12.5},
                         headers=hdr(super_token))
        assert r.status_code == 200
        r = requests.get(f"{API}/settings", headers=hdr(super_token))
        assert float(r.json()["savings_percent"]) == 12.5
        # restore
        requests.put(f"{API}/settings", json={"savings_percent": 10.0},
                     headers=hdr(super_token))


# ==================== ACTIVITY LOG ====================
class TestActivity:
    def test_activity_lists(self, super_token):
        r = requests.get(f"{API}/activity", headers=hdr(super_token))
        assert r.status_code == 200
        assert isinstance(r.json(), list)
        assert len(r.json()) > 0  # login events already present

    def test_activity_grows_on_owner_create(self, super_token):
        before = len(requests.get(f"{API}/activity", headers=hdr(super_token)).json())
        o = requests.post(f"{API}/owners",
                          json={"name": f"TEST_Act_{uuid.uuid4().hex[:5]}", "contact": "9"},
                          headers=hdr(super_token)).json()
        after = len(requests.get(f"{API}/activity", headers=hdr(super_token)).json())
        assert after > before
        # cleanup
        requests.delete(f"{API}/owners/{o['id']}", headers=hdr(super_token))
