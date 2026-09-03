import asyncio
import httpx
import sys
import uuid
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

from server import app, _startup

async def test_owner_monthly_extraction():
    await _startup()
    test_uid = str(uuid.uuid4())[:6].upper()
    car_reg = f"GA-07-M-{test_uid}"
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        # Login
        login_res = await client.post("/api/auth/login", json={
            "email": "admin@carcastlegoa.com",
            "password": "admin123"
        })
        assert login_res.status_code == 200
        headers = {"Authorization": f"Bearer {login_res.json()['access_token']}"}

        owner_id = None
        car_id = None
        b1_id = None
        b2_id = None
        try:
            # 1. Add owner with monthly contract directly from the owner section
            owner_res = await client.post("/api/owners", json={
                "name": f"Prashant Partner {test_uid}",
                "contact": "+91 91234 56789",
                "notes": "Fixed monthly lease partner",
                "is_monthly_contract": True,
                "monthly_amount": 30000.0,
                "car_model": "Innova Crysta Monthly Partner",
                "car_registration": car_reg,
                "owner_selling_rate": 2500.0
            }, headers=headers)
            assert owner_res.status_code == 200
            owner = owner_res.json()
            owner_id = owner["id"]

            # 2. Check /api/owners list - should find auto-created monthly car and monthly stats
            owners_list = (await client.get("/api/owners", headers=headers)).json()
            target_owner = next(o for o in owners_list if o["id"] == owner_id)
            assert target_owner["has_monthly_contract"] == True
            assert target_owner["monthly_target"] == 30000.0
            assert target_owner["extracted_revenue"] == 0.0
            assert target_owner["pending_amount"] == 30000.0
            assert target_owner["surplus_amount"] == 0.0

            # Find the auto-created car
            cars_res = await client.get(f"/api/cars", headers=headers)
            all_cars = cars_res.json()
            owner_car = next(c for c in all_cars if c.get("owner_id") == owner_id)
            assert owner_car["model"] == "Innova Crysta Monthly Partner"
            assert owner_car["billing_type"] == "monthly"
            assert owner_car["monthly_cost_rate"] == 30000.0
            car_id = owner_car["id"]

            # 3. Create Booking 1: 10 days @ 2500 = 25,000 (pending = 5,000)
            b1_res = await client.post("/api/bookings", json={
                "customer_name": "Goa Tourist A",
                "customer_contact": "+91 99999 11111",
                "car_id": car_id,
                "start_date": "2026-09-02",
                "end_date": "2026-09-12",
                "pickup_time": "10:00",
                "drop_time": "10:00",
                "pickup_location": "Airport",
                "drop_location": "Calangute",
                "daily_cost_rate": 0.0,
                "daily_customer_rate": 2500.0,
                "cost_rate": 0.0,
                "customer_rate": 25000.0,
            }, headers=headers)
            assert b1_res.status_code == 200
            b1_id = b1_res.json()["id"]

            # Check settlement summary for owner
            sum1 = (await client.get(f"/api/owners/{owner_id}/settlement-summary?month=2026-09", headers=headers)).json()
            perf1 = sum1["monthly_performance"]
            assert perf1["has_monthly_contract"] == True
            assert perf1["monthly_target"] == 30000.0
            assert perf1["extracted_revenue"] == 27500.0
            assert perf1["pending_amount"] == 2500.0
            assert perf1["surplus_amount"] == 0.0
            assert perf1["is_surplus"] == False

            # 4. Create Booking 2: 3 days (15 to 17 = 3 days @ 2500 = 7500). Total extracted = 35,000 (Surplus = 5,000)
            b2_res = await client.post("/api/bookings", json={
                "customer_name": "Goa Tourist B",
                "customer_contact": "+91 99999 22222",
                "car_id": car_id,
                "start_date": "2026-09-15",
                "end_date": "2026-09-17",
                "pickup_time": "10:00",
                "drop_time": "10:00",
                "pickup_location": "Airport",
                "drop_location": "Panjim",
                "daily_cost_rate": 0.0,
                "daily_customer_rate": 2500.0,
                "cost_rate": 0.0,
                "customer_rate": 7500.0,
            }, headers=headers)
            assert b2_res.status_code == 200
            b2_id = b2_res.json()["id"]

            # Check settlement summary again
            sum2 = (await client.get(f"/api/owners/{owner_id}/settlement-summary?month=2026-09", headers=headers)).json()
            perf2 = sum2.get("monthly_performance", {})
            print("PERF2 DEBUG:", perf2)
            assert perf2["extracted_revenue"] == 35000.0
            assert perf2["is_surplus"] == True
            assert perf2["surplus_amount"] == 5000.0
            assert perf2["pending_amount"] == 0.0
            assert perf2["percent_extracted"] == 116.7
            print("ALL OWNER MONTHLY LEASE EXTRACTION AND SURPLUS TESTS PASSED!")
        finally:
            # Clean up test records
            if b1_id:
                await client.delete(f"/api/bookings/{b1_id}", headers=headers)
            if b2_id:
                await client.delete(f"/api/bookings/{b2_id}", headers=headers)
            if car_id:
                await client.delete(f"/api/cars/{car_id}", headers=headers)
            if owner_id:
                await client.delete(f"/api/owners/{owner_id}", headers=headers)

if __name__ == "__main__":
    asyncio.run(test_owner_monthly_extraction())
