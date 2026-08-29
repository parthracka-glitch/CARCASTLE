"""Test monthly vehicle contracts, retainer posting, and month-filtered settlement summary."""
import os
import sys
import asyncio
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

import httpx
from server import app, _startup


async def run_monthly_tests():
    await _startup()
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        # Login as admin
        login_res = await client.post("/api/auth/login", json={
            "email": "admin@carcastlegoa.com",
            "password": "admin123"
        })
        assert login_res.status_code == 200, login_res.text
        token = login_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 1. Create owner
        owner_res = await client.post("/api/owners", json={
            "name": "Monthly Fleet Partner (Vikas)",
            "contact": "+91 98888 77777",
            "notes": "Monthly attached Ertiga"
        }, headers=headers)
        assert owner_res.status_code == 200
        owner = owner_res.json()
        owner_id = owner["id"]

        # 2. Add car with billing_type = "monthly" and monthly_cost_rate = 32000
        car_res = await client.post("/api/cars", json={
            "registration_no": f"GA-07-MTH-{owner_id[:4].upper()}",
            "model": "Ertiga ZXi Plus",
            "owner_id": owner_id,
            "billing_type": "monthly",
            "monthly_cost_rate": 32000.0,
            "billing_cycle_day": 1
        }, headers=headers)
        assert car_res.status_code == 200
        car = car_res.json()
        assert car["billing_type"] == "monthly"
        assert car["monthly_cost_rate"] == 32000.0
        car_id = car["id"]

        # 3. Post monthly retainer for August 2026
        retainer_res = await client.post(f"/api/owners/{owner_id}/post-monthly-rent", json={
            "car_id": car_id,
            "month": "2026-08",
            "amount": 32000.0,
            "notes": "Full month lease contract"
        }, headers=headers)
        assert retainer_res.status_code == 200
        ledger_entry = retainer_res.json()
        assert ledger_entry["amount"] == 32000.0
        assert "Monthly Lease (2026-08)" in ledger_entry["description"]

        # Check duplicate protection
        dup_res = await client.post(f"/api/owners/{owner_id}/post-monthly-rent", json={
            "car_id": car_id,
            "month": "2026-08",
            "amount": 32000.0
        }, headers=headers)
        assert dup_res.status_code == 400, "Should prevent duplicate monthly rent posting for same month"

        # 4. Add multiple fuel and washing charges across August
        # Fuel 1 (Aug 05)
        await client.post(f"/api/owners/{owner_id}/expenses", json={
            "owner_id": owner_id,
            "car_id": car_id,
            "category": "fuel",
            "amount": 1500.0,
            "description": "Mid-trip fuel top-up",
            "date": "2026-08-05T10:00:00+00:00"
        }, headers=headers)

        # Wash 1 (Aug 10)
        await client.post(f"/api/owners/{owner_id}/expenses", json={
            "owner_id": owner_id,
            "car_id": car_id,
            "category": "wash",
            "amount": 400.0,
            "description": "Full exterior + interior wash",
            "date": "2026-08-10T11:00:00+00:00"
        }, headers=headers)

        # Wash 2 (Aug 20)
        await client.post(f"/api/owners/{owner_id}/expenses", json={
            "owner_id": owner_id,
            "car_id": car_id,
            "category": "wash",
            "amount": 350.0,
            "description": "Weekly foam wash",
            "date": "2026-08-20T16:00:00+00:00"
        }, headers=headers)

        # Expense in next month September (should NOT appear in August filter)
        await client.post(f"/api/owners/{owner_id}/expenses", json={
            "owner_id": owner_id,
            "car_id": car_id,
            "category": "fuel",
            "amount": 2000.0,
            "description": "September fuel",
            "date": "2026-09-02T09:00:00+00:00"
        }, headers=headers)

        # 5. Check August settlement summary
        summary_res = await client.get(f"/api/owners/{owner_id}/settlement-summary?month=2026-08", headers=headers)
        assert summary_res.status_code == 200
        summary = summary_res.json()
        assert summary["filter_month"] == "2026-08"
        assert summary["total_owed"] == 32000.0
        # August expenses: 1500 + 400 + 350 = 2250 (excluding September's 2000)
        assert summary["total_expenses"] == 2250.0
        assert summary["breakdown"]["fuel"] == 1500.0
        assert summary["breakdown"]["wash"] == 750.0
        # Net balance due: 32000 - 2250 = 29750
        assert summary["net_balance_due"] == 29750.0

        # Clean up
        await client.delete(f"/api/owners/{owner_id}", headers=headers)
        print("SUCCESS: All monthly vehicle contract and month-filter tests passed!")


if __name__ == "__main__":
    asyncio.run(run_monthly_tests())
