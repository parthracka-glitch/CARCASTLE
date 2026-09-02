import os
import sys
import pytest
import requests
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

BASE_URL = "http://localhost:8000"

def test_9am_day_calculation_units():
    # Direct math check for 9:30 AM rule (T+1 when drop_time > 09:30)
    from models import calculate_9am_days

    # 25th Aug 09:00 to 27th Aug 09:00 -> exactly 2 days (T)
    assert calculate_9am_days("2026-08-25", "2026-08-27", "09:00", "09:00") == 2
    # 25th Aug 09:00 to 27th Aug 08:30 -> 2 days (T)
    assert calculate_9am_days("2026-08-25", "2026-08-27", "09:00", "08:30") == 2
    # 25th Aug 09:00 to 27th Aug 09:30 -> 2 days (30-min grace period)
    assert calculate_9am_days("2026-08-25", "2026-08-27", "09:00", "09:30") == 2
    # 25th Aug 09:00 to 27th Aug 09:35 -> 3 days (T+1)
    assert calculate_9am_days("2026-08-25", "2026-08-27", "09:00", "09:35") == 3
    # 25th Aug 09:00 to 27th Aug 14:00 -> 3 days (T+1)
    assert calculate_9am_days("2026-08-25", "2026-08-27", "09:00", "14:00") == 3


def test_additive_features_e2e():
    session = requests.Session()
    # Login as admin
    login_res = session.post(f"{BASE_URL}/api/auth/login", json={
        "email": "admin@carcastlegoa.com",
        "password": "admin123"
    })
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Fetch or create available car
    cars_res = session.get(f"{BASE_URL}/api/cars", headers=headers)
    assert cars_res.status_code == 200
    cars = cars_res.json()
    if not cars:
        owner_r = session.post(f"{BASE_URL}/api/owners", json={"name": "Additive Test Owner", "contact": "+91 91111 22222"}, headers=headers)
        assert owner_r.status_code == 200
        owner_id = owner_r.json()["id"]
        car_r = session.post(f"{BASE_URL}/api/cars", json={"registration_no": "GA-07-ADD-9999", "model": "Creta", "owner_id": owner_id, "default_cost_rate": 2000}, headers=headers)
        assert car_r.status_code == 200
        car_id = car_r.json()["id"]
    else:
        car_id = cars[0]["id"]

    # 2. Create booking with 9AM rule (drop_time 14:00 -> +1 extra day), deposit amount ₹3,000, payment method Online, transfer split
    booking_payload = {
        "customer_name": "Test Rohit Sharma",
        "customer_contact": "+91 99999 88888",
        "car_id": car_id,
        "start_date": "2026-09-01",
        "end_date": "2026-09-04",
        "pickup_time": "09:00",
        "drop_time": "14:00",  # After 09:00 -> 3 days + 1 extra = 4 days
        "pickup_location": "MOPA Airport",
        "drop_location": "Panjim",
        "cost_rate": 6000,
        "customer_rate": 10000,
        "payment_method": "online",
        "deposit_amount": 3000,
        "transfer_type": "airport_pickup",
        "transfer_cost": 1000,
        "transfer_driver_share": 500,
        "transfer_manoj_share": 500,
    }
    create_res = session.post(f"{BASE_URL}/api/bookings", json=booking_payload, headers=headers)
    assert create_res.status_code == 200
    b = create_res.json()
    b_id = b["id"]

    assert b["days"] == 4, f"Expected 4 days under 9AM-9AM rule, got {b['days']}"
    assert b["payment_method"] == "online"
    assert b["deposit_amount"] == 3000
    assert b["deposit_status"] == "received"
    assert b["transfer_driver_share"] == 500
    assert b["transfer_manoj_share"] == 500

    # 3. Test Security Deposit Refund
    refund_res = session.put(f"{BASE_URL}/api/bookings/{b_id}/refund-deposit", json={"notes": "Returned clean"}, headers=headers)
    assert refund_res.status_code == 200
    refunded = refund_res.json()
    assert refunded["deposit_status"] == "refunded"
    assert refunded["deposit_refunded_at"] is not None

    # 4. Test Schedule Endpoint
    schedule_res = session.get(f"{BASE_URL}/api/transfers/schedule", headers=headers)
    assert schedule_res.status_code == 200
    sch = schedule_res.json()
    assert "today" in sch
    assert "tomorrow" in sch
    assert "upcoming" in sch

    # 5. Test Driver Reminder Dispatcher
    remind_res = session.post(f"{BASE_URL}/api/transfers/{b_id}/remind-driver", headers=headers)
    assert remind_res.status_code == 200
    assert remind_res.json()["ok"] is True

    # 6. Test ₹1000 Airport Transfer Split Tracking
    split_res = session.put(f"{BASE_URL}/api/transfers/{b_id}/driver", json={
        "transfer_driver_paid": True,
        "transfer_manoj_paid": True,
    }, headers=headers)
    assert split_res.status_code == 200
    updated_tr = split_res.json()
    assert updated_tr["transfer_driver_paid"] is True
    assert updated_tr["transfer_manoj_paid"] is True

    # 7. Check Finance Summary contains Cash/Online and Deposit Totals
    fin_res = session.get(f"{BASE_URL}/api/finance/summary", headers=headers)
    assert fin_res.status_code == 200
    fin = fin_res.json()
    assert "total_cash_income" in fin
    assert "total_online_income" in fin
    assert "total_deposit_held" in fin
    assert "total_deposit_refunded" in fin

    # Clean up test booking
    del_res = session.delete(f"{BASE_URL}/api/bookings/{b_id}", headers=headers)
    assert del_res.status_code == 200


def test_unassigned_car_booking_flow():
    session = requests.Session()
    login_res = session.post(f"{BASE_URL}/api/auth/login", json={
        "email": "admin@carcastlegoa.com",
        "password": "admin123"
    })
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Create booking with Direct Owner (No car_id, plate TBD)
    unassigned_payload = {
        "customer_name": "Vikram Sethi",
        "customer_contact": "+91 91234 56789",
        "owner_name": "Praveen Rane",
        "owner_contact": "+91 99887 76655",
        "car_model": "Ertiga VXI",
        "car_registration": "TBD",
        "start_date": "2026-09-10",
        "end_date": "2026-09-12",
        "pickup_time": "09:00",
        "drop_time": "09:00",
        "pickup_location": "Airport",
        "drop_location": "Candolim",
        "cost_rate": 3000,
        "customer_rate": 5000,
        "payment_method": "cash",
        "deposit_amount": 2000,
    }

    create_res = session.post(f"{BASE_URL}/api/bookings", json=unassigned_payload, headers=headers)
    assert create_res.status_code == 200
    b = create_res.json()
    b_id = b["id"]

    assert b["car_id"] is None
    assert b["car_model"] == "Ertiga VXI"
    assert b["car_registration"] == "TBD"
    assert b["owner_name"] == "Praveen Rane"
    assert b["owner_id"] is not None

    # 2. Check 1-click plate assignment endpoint
    assign_res = session.put(f"{BASE_URL}/api/bookings/{b_id}/assign-car", json={
        "car_registration": "GA-03-W-7788",
        "car_model": "Ertiga ZXI (Assigned)",
    }, headers=headers)
    assert assign_res.status_code == 200
    updated_b = assign_res.json()
    assert updated_b["car_registration"] == "GA-03-W-7788"
    assert updated_b["car_model"] == "Ertiga ZXI (Assigned)"

    # Clean up
    del_res = session.delete(f"{BASE_URL}/api/bookings/{b_id}", headers=headers)
    assert del_res.status_code == 200


def test_pdf_and_excel_exports():
    session = requests.Session()
    login_res = session.post(f"{BASE_URL}/api/auth/login", json={
        "email": "admin@carcastlegoa.com",
        "password": "admin123"
    })
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Test All-Time PDF report
    pdf_res = session.get(f"{BASE_URL}/api/reports/monthly.pdf?month=all", headers=headers)
    assert pdf_res.status_code == 200
    assert pdf_res.headers["content-type"] == "application/pdf"
    assert len(pdf_res.content) > 1000

    # 2. Test All-Time Excel report
    xlsx_res = session.get(f"{BASE_URL}/api/reports/monthly.xlsx?month=all", headers=headers)
    assert xlsx_res.status_code == 200
    assert "spreadsheetml" in xlsx_res.headers["content-type"]
    assert len(xlsx_res.content) > 1000

    # 3. Test Specific Month Excel report
    month_xlsx_res = session.get(f"{BASE_URL}/api/reports/monthly.xlsx?month=2026-08", headers=headers)
    assert month_xlsx_res.status_code == 200
    assert len(month_xlsx_res.content) > 1000


