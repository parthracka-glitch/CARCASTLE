import requests
import pytest

BASE_URL = "http://127.0.0.1:8000"

def test_flexible_transfers_flow():
    session = requests.Session()
    login_res = session.post(f"{BASE_URL}/api/auth/login", json={
        "email": "admin@carcastlegoa.com",
        "password": "admin123"
    })
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Create booking with Self-Handled Transfer (100% to owner)
    payload_self = {
        "customer_name": "Rohan Deshmukh",
        "customer_contact": "+91 98231 11223",
        "owner_name": "Rohan Fleet",
        "car_model": "Swift ZXI",
        "car_registration": "GA-03-W-9988",
        "start_date": "2026-09-15",
        "end_date": "2026-09-18",
        "pickup_location": "Airport",
        "drop_location": "Airport",
        "cost_rate": 4500,
        "customer_rate": 7500,
        "transfer_type": "airport_pickup",
        "transfer_handled_by": "self",
        "transfer_cost": 1200.0,
        "flight_time": "15:45 6E-441",
        "transfer_pickup_point": "MOPA Terminal 1",
    }
    create_res = session.post(f"{BASE_URL}/api/bookings", json=payload_self, headers=headers)
    assert create_res.status_code == 200, create_res.text
    booking = create_res.json()
    b_id = booking["id"]

    try:
        # Check that self-handled has 0 driver fee and full share to manoj/owner
        assert booking["transfer_handled_by"] == "self"
        assert booking["driver_fee"] == 0.0
        assert booking["transfer_driver_share"] == 0.0
        assert booking["transfer_manoj_share"] == 1200.0
        assert booking["transfer_driver_paid"] is True

        # 2. Update transfer to "Driver on Cut Basis" (e.g. Suresh with ₹350 cut)
        update_payload = {
            "transfer_handled_by": "driver",
            "driver_name": "Suresh Naik",
            "driver_contact": "+91 98221 55667",
            "transfer_cost": 1200.0,
            "transfer_driver_share": 350.0,
            "transfer_manoj_share": 850.0,
            "transfer_driver_paid": False,
            "transfer_manoj_paid": True,
            "flight_time": "15:45 6E-441",
            "transfer_pickup_point": "MOPA Terminal 1",
        }
        driver_res = session.put(f"{BASE_URL}/api/transfers/{b_id}/driver", json=update_payload, headers=headers)
        assert driver_res.status_code == 200, driver_res.text
        updated = driver_res.json()

        assert updated["transfer_handled_by"] == "driver"
        assert updated["driver_name"] == "Suresh Naik"
        assert updated["driver_contact"] == "+91 98221 55667"
        assert updated["driver_fee"] == 350.0
        assert updated["transfer_driver_share"] == 350.0
        assert updated["transfer_manoj_share"] == 850.0
        assert updated["transfer_driver_paid"] is False
        assert updated["transfer_manoj_paid"] is True

        # 3. Check drivers summary ledger
        summary_res = session.get(f"{BASE_URL}/api/transfers/drivers-summary", headers=headers)
        assert summary_res.status_code == 200
        summary_data = summary_res.json()
        
        suresh_driver = next((d for d in summary_data["drivers"] if d["driver_name"] == "Suresh Naik"), None)
        assert suresh_driver is not None
        assert suresh_driver["total_fee"] >= 350.0

        # 4. Settle Suresh's cut
        settle_payload = {
            **update_payload,
            "transfer_driver_paid": True,
            "driver_fee_paid": 350.0,
        }
        settle_res = session.put(f"{BASE_URL}/api/transfers/{b_id}/driver", json=settle_payload, headers=headers)
        assert settle_res.status_code == 200
        assert settle_res.json()["transfer_driver_paid"] is True

    finally:
        # Cleanup
        session.delete(f"{BASE_URL}/api/bookings/{b_id}", headers=headers)


if __name__ == "__main__":
    test_flexible_transfers_flow()
    print("ALL FLEXIBLE TRANSFER TESTS PASSED!")
