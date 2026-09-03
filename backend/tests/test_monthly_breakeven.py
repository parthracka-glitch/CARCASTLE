import asyncio
import httpx
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

from server import app, _startup

async def test_monthly_breakeven_and_profit():
    await _startup()
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        # Login
        login_res = await client.post("/api/auth/login", json={
            "email": "admin@carcastlegoa.com",
            "password": "admin123"
        })
        assert login_res.status_code == 200
        token = login_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 1. Create owner
        owner_res = await client.post("/api/owners", json={
            "name": "Test Monthly Owner (Manoj Partner)",
            "contact": "+91 99999 88888",
            "notes": "Test monthly break-even"
        }, headers=headers)
        assert owner_res.status_code == 200
        owner = owner_res.json()
        owner_id = owner["id"]

        # 2. Create monthly car with benchmark selling rate
        car_res = await client.post("/api/cars", json={
            "registration_no": f"GA-08-TEST-{owner_id[:4].upper()}",
            "model": "Innova Crysta Monthly",
            "owner_id": owner_id,
            "billing_type": "monthly",
            "monthly_cost_rate": 30000.0,
            "owner_selling_rate": 2500.0,
            "billing_cycle_day": 1
        }, headers=headers)
        assert car_res.status_code == 200
        car = car_res.json()
        car_id = car["id"]
        assert car["billing_type"] == "monthly"
        assert car["monthly_cost_rate"] == 30000.0
        assert car["owner_selling_rate"] == 2500.0

        # 3. Check initial monthly performance
        perf_res = await client.get(f"/api/cars/{car_id}/monthly-performance?month=2026-09", headers=headers)
        assert perf_res.status_code == 200
        perf = perf_res.json()
        assert perf["total_revenue"] == 0.0
        assert perf["monthly_cost_rate"] == 30000.0
        assert perf["breakeven_days"] == 12.0
        assert perf["is_breakeven_reached"] == False
        assert perf["remaining_to_breakeven"] == 30000.0
        assert perf["pure_profit"] == 0.0

        # 4. Create Booking 1 (4 days @ 2500 = 10,000)
        b1_res = await client.post("/api/bookings", json={
            "customer_name": "Tourist John",
            "customer_contact": "+91 98765 00001",
            "car_id": car_id,
            "start_date": "2026-09-05",
            "end_date": "2026-09-09",
            "pickup_time": "09:00",
            "drop_time": "09:00",
            "pickup_location": "MOPA Airport",
            "drop_location": "Calangute",
            "daily_cost_rate": 0.0,
            "daily_customer_rate": 2500.0,
            "cost_rate": 0.0,
            "customer_rate": 10000.0,
            "advance_payment": 2000.0,
            "deposit_amount": 3000.0,
        }, headers=headers)
        assert b1_res.status_code == 200
        b1 = b1_res.json()
        b1_id = b1["id"]

        # Check owner ledger - should NOT have an entry for this booking because billing_type is monthly
        owner_ledger = await client.get(f"/api/owners/{owner_id}/settlement-summary", headers=headers)
        assert owner_ledger.status_code == 200
        # total_owed should remain 0 because booking doesn't add per-trip cost
        assert owner_ledger.json()["total_owed"] == 0.0

        # Check performance after Booking 1
        perf1 = (await client.get(f"/api/cars/{car_id}/monthly-performance?month=2026-09", headers=headers)).json()
        assert perf1["total_revenue"] == 10000.0
        assert perf1["remaining_to_breakeven"] == 20000.0
        assert perf1["is_breakeven_reached"] == False
        assert perf1["pure_profit"] == 0.0

        # 5. Create Booking 2 (10 days @ 2500 = 25,000). Total revenue becomes 35,000 -> CROSSES 30,000!
        b2_res = await client.post("/api/bookings", json={
            "customer_name": "Tourist Jane",
            "customer_contact": "+91 98765 00002",
            "car_id": car_id,
            "start_date": "2026-09-12",
            "end_date": "2026-09-22",
            "pickup_time": "09:00",
            "drop_time": "09:00",
            "pickup_location": "Panjim",
            "drop_location": "Dabolim Airport",
            "daily_cost_rate": 0.0,
            "daily_customer_rate": 2500.0,
            "cost_rate": 0.0,
            "customer_rate": 25000.0,
            "advance_payment": 5000.0,
            "deposit_amount": 3000.0,
        }, headers=headers)
        assert b2_res.status_code == 200
        b2 = b2_res.json()
        b2_id = b2["id"]

        # Check performance after Booking 2: threshold crossed!
        perf2 = (await client.get(f"/api/cars/{car_id}/monthly-performance?month=2026-09", headers=headers)).json()
        assert perf2["total_revenue"] == 35000.0
        assert perf2["is_breakeven_reached"] == True
        assert perf2["remaining_to_breakeven"] == 0.0
        assert perf2["pure_profit"] == 5000.0
        assert perf2["percent_recovered"] == 116.7

        # Clean up test data
        await client.delete(f"/api/bookings/{b1_id}", headers=headers)
        await client.delete(f"/api/bookings/{b2_id}", headers=headers)
        await client.delete(f"/api/cars/{car_id}", headers=headers)
        await client.delete(f"/api/owners/{owner_id}", headers=headers)
        print("ALL MONTHLY BREAK-EVEN AND PROFIT THRESHOLD TESTS PASSED SUCCESSFULLY!")

if __name__ == "__main__":
    asyncio.run(test_monthly_breakeven_and_profit())
