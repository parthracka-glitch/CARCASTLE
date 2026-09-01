"""Test Enquiry Tracker endpoints and analytics in Car Castle Goa."""
import os
import sys
import asyncio
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

import httpx
from server import app, _startup


async def _run_enquiry_tests():
    await _startup()
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Login
        login_res = await client.post("/api/auth/login", json={
            "email": "admin@carcastlegoa.com",
            "password": "admin123"
        })
        assert login_res.status_code == 200, login_res.text
        token = login_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 2. Test Invalid Phone validation
        bad_payload = {
            "name": "Invalid Customer",
            "phone": "12345",  # not 10 digits
            "city": "Mumbai",
            "state": "Maharashtra",
            "car_model": "Thar 4x4",
        }
        res = await client.post("/api/enquiries", json=bad_payload, headers=headers)
        assert res.status_code == 400

        # 3. Create Valid Enquiries
        enq1_payload = {
            "name": "Rahul Sharma",
            "phone": "9876543210",
            "email": "rahul.sharma@example.com",
            "city": "Mumbai",
            "state": "Maharashtra",
            "car_model": "Thar 4x4",
            "enquiry_date": "2026-09-01T10:00:00",
            "notes": "Looking for Thar 4x4 for North Goa trip",
            "status": "new"
        }
        res1 = await client.post("/api/enquiries", json=enq1_payload, headers=headers)
        assert res1.status_code == 201, res1.text
        enq1 = res1.json()
        assert enq1["id"] is not None
        assert enq1["name"] == "Rahul Sharma"
        assert enq1["phone"] == "9876543210"
        assert enq1["city"] == "Mumbai"

        enq2_payload = {
            "name": "Pooja Hegde",
            "phone": "9123456789",
            "email": "pooja@example.com",
            "city": "Bengaluru",
            "state": "Karnataka",
            "car_model": "Creta AT",
            "enquiry_date": "2026-09-01T11:00:00",
            "notes": "Airport pickup enquiry",
            "status": "converted"
        }
        res2 = await client.post("/api/enquiries", json=enq2_payload, headers=headers)
        assert res2.status_code == 201
        enq2 = res2.json()

        # 4. List Enquiries with Search
        list_res = await client.get("/api/enquiries?search=Rahul", headers=headers)
        assert list_res.status_code == 200
        list_data = list_res.json()
        assert list_data["total"] >= 1
        assert any(e["id"] == enq1["id"] for e in list_data["enquiries"])

        # 5. List Enquiries with Status Filter
        status_res = await client.get("/api/enquiries?status=converted", headers=headers)
        assert status_res.status_code == 200
        assert any(e["id"] == enq2["id"] for e in status_res.json()["enquiries"])

        # 6. Update Enquiry (e.g. Rahul converts)
        upd_res = await client.put(f"/api/enquiries/{enq1['id']}", json={
            "status": "converted",
            "notes": "Confirmed booking for 3 days"
        }, headers=headers)
        assert upd_res.status_code == 200
        upd_data = upd_res.json()
        assert upd_data["status"] == "converted"
        assert upd_data["notes"] == "Confirmed booking for 3 days"

        # 7. Check Analytics Summary
        summary_res = await client.get("/api/enquiries/analytics/summary", headers=headers)
        assert summary_res.status_code == 200
        summary = summary_res.json()
        assert summary["total"] >= 2
        assert summary["converted"] >= 2
        assert summary["conversionRate"] > 0
        assert summary["byStatus"]["converted"] >= 2

        # 8. Check Analytics by Location
        loc_res = await client.get("/api/enquiries/analytics/by-location", headers=headers)
        assert loc_res.status_code == 200
        loc_data = loc_res.json()
        assert len(loc_data) >= 1
        assert any(item["city"] in ["Mumbai", "Bengaluru"] for item in loc_data)

        # 9. Check Analytics by Car
        car_res = await client.get("/api/enquiries/analytics/by-car", headers=headers)
        assert car_res.status_code == 200
        car_data = car_res.json()
        assert len(car_data) >= 1
        assert any(item["modelName"] in ["Thar 4x4", "Creta AT"] for item in car_data)

        # 10. Delete Enquiry
        del_res = await client.delete(f"/api/enquiries/{enq1['id']}", headers=headers)
        assert del_res.status_code == 200

        # Verify not found after delete
        get_res = await client.get(f"/api/enquiries/{enq1['id']}", headers=headers)
        assert get_res.status_code == 404
        print("ALL ENQUIRY TESTS PASSED!")


def test_enquiry_lifecycle_and_analytics():
    asyncio.run(_run_enquiry_tests())


if __name__ == "__main__":
    asyncio.run(_run_enquiry_tests())
