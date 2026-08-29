"""Test Car Owner handover expenses & settlement calculations using httpx AsyncClient."""
import os
import sys
import asyncio
from pathlib import Path

# Add backend directory to sys.path
BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

import httpx
from server import app, _startup


async def run_async_tests():
    # Trigger app startup to ensure indexes & seeds are ready
    await _startup()
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        # Login
        login_res = await client.post("/api/auth/login", json={
            "email": "admin@carcastlegoa.com",
            "password": "admin123"
        })
        assert login_res.status_code == 200, login_res.text
        token = login_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 1. Create a test owner
        owner_payload = {
            "name": "Test Goa Owner (Rajesh)",
            "contact": "+91 98221 11222",
            "notes": "Fleet supplier for Calangute"
        }
        r = await client.post("/api/owners", json=owner_payload, headers=headers)
        assert r.status_code == 200, r.text
        owner = r.json()
        owner_id = owner["id"]

        # 2. Create a car for this owner
        car_payload = {
            "registration_no": f"GA-07-TEST-{owner_id[:4].upper()}",
            "model": "Swift ZXi",
            "owner_id": owner_id,
            "default_cost_rate": 1500.0
        }
        r = await client.post("/api/cars", json=car_payload, headers=headers)
        assert r.status_code == 200, r.text
        car = r.json()
        car_id = car["id"]

        # 3. Create a fuel handover expense
        fuel_exp = {
            "owner_id": owner_id,
            "car_id": car_id,
            "category": "fuel",
            "amount": 1200.0,
            "description": "12L Petrol filled at Shell Porvorim before handover",
            "settlement_type": "deduct_from_payout"
        }
        r = await client.post(f"/api/owners/{owner_id}/expenses", json=fuel_exp, headers=headers)
        assert r.status_code == 200, r.text
        fuel_data = r.json()
        assert fuel_data["amount"] == 1200.0
        assert fuel_data["category"] == "fuel"
        assert fuel_data["is_settled"] is False
        assert fuel_data["car_registration"] == car_payload["registration_no"]
        fuel_id = fuel_data["id"]

        # 4. Create a washing handover expense
        wash_exp = {
            "owner_id": owner_id,
            "car_id": car_id,
            "category": "wash",
            "amount": 350.0,
            "description": "Full foam wash & vacuum at Calangute",
            "settlement_type": "deduct_from_payout"
        }
        r = await client.post(f"/api/owners/{owner_id}/expenses", json=wash_exp, headers=headers)
        assert r.status_code == 200, r.text
        wash_data = r.json()
        assert wash_data["amount"] == 350.0
        assert wash_data["category"] == "wash"
        wash_id = wash_data["id"]

        # 5. List expenses for this owner
        r = await client.get(f"/api/owners/{owner_id}/expenses", headers=headers)
        assert r.status_code == 200, r.text
        expenses_list = r.json()
        assert len(expenses_list) == 2
        assert any(e["id"] == fuel_id for e in expenses_list)
        assert any(e["id"] == wash_id for e in expenses_list)

        # 6. Check settlement summary before settlement
        r = await client.get(f"/api/owners/{owner_id}/settlement-summary", headers=headers)
        assert r.status_code == 200, r.text
        summary = r.json()
        assert summary["total_expenses"] == 1550.0
        assert summary["unsettled_expenses"] == 1550.0
        assert summary["breakdown"]["fuel"] == 1200.0
        assert summary["breakdown"]["wash"] == 350.0

        # 7. Settle the washing expense (owner paid cash on spot)
        r = await client.put(f"/api/owners/expenses/{wash_id}/settle", json={
            "is_settled": True,
            "settlement_type": "paid_by_owner",
            "note": "Paid cash ₹350 by Rajesh at handover"
        }, headers=headers)
        assert r.status_code == 200, r.text
        settled_wash = r.json()
        assert settled_wash["is_settled"] is True

        # 8. Check updated settlement summary (fuel remains unsettled)
        r = await client.get(f"/api/owners/{owner_id}/settlement-summary", headers=headers)
        assert r.status_code == 200, r.text
        summary2 = r.json()
        assert summary2["total_expenses"] == 1550.0
        assert summary2["unsettled_expenses"] == 1200.0

        # 9. Create a booking and test booking handover-intake endpoint
        booking_payload = {
            "customer_name": "Goa Tourist Customer",
            "customer_contact": "+91 99999 11111",
            "car_id": car_id,
            "start_date": "2026-09-10",
            "end_date": "2026-09-13",
            "pickup_location": "Airport",
            "drop_location": "Airport",
            "cost_rate": 4500.0,
            "customer_rate": 7500.0
        }
        r = await client.post("/api/bookings", json=booking_payload, headers=headers)
        assert r.status_code == 200, r.text
        booking = r.json()
        booking_id = booking["id"]

        # Intake with fuel + wash charges
        intake_payload = {
            "status": "car_received",
            "fuel_amount": 800.0,
            "wash_amount": 250.0,
            "notes": "Dirty floor mats and quarter tank"
        }
        r = await client.post(f"/api/bookings/{booking_id}/handover-intake", json=intake_payload, headers=headers)
        assert r.status_code == 200, r.text
        intake_res = r.json()
        assert intake_res["booking"]["status"] == "car_received"
        assert len(intake_res["expenses"]) == 2

        # Clean up test owner and associated cars/expenses
        await client.delete(f"/api/owners/{owner_id}", headers=headers)
        await client.delete(f"/api/bookings/{booking_id}", headers=headers)
        print("SUCCESS: All owner expenses and handover intake tests passed!")


if __name__ == "__main__":
    asyncio.run(run_async_tests())
