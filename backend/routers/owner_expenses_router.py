"""Car Owner handover expenses (fuel, wash, maintenance), monthly contracts & settlement calculation router."""
from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional, List
from datetime import datetime, timezone
from models import (
    OwnerExpenseCreate,
    OwnerExpenseUpdate,
    OwnerExpense,
    MonthlyRetainerPost,
    new_id,
    now_iso,
)
from deps import get_db, get_current_user, require_super_admin, log_activity

router = APIRouter(tags=["owner_expenses"])


@router.get("/owners/{owner_id}/expenses")
async def list_owner_expenses(
    owner_id: str,
    is_settled: Optional[bool] = Query(None),
    car_id: Optional[str] = Query(None),
    booking_id: Optional[str] = Query(None),
    month: Optional[str] = Query(None),
    user: dict = Depends(get_current_user),
):
    """List all handover expenses (fuel, wash, etc.) for a specific car owner."""
    db = get_db()
    owner = await db.car_owners.find_one({"id": owner_id})
    if not owner:
        raise HTTPException(404, "Car owner not found")

    q = {"owner_id": owner_id}
    if is_settled is not None:
        q["is_settled"] = is_settled
    if car_id:
        q["car_id"] = car_id
    if booking_id:
        q["booking_id"] = booking_id
    if month:
        q["date"] = {"$regex": f"^{month}"}

    expenses = await db.owner_expenses.find(q, {"_id": 0}).sort("created_at", -1).to_list(1000)

    # Attach car info if missing in old records
    car_ids = [e["car_id"] for e in expenses if e.get("car_id")]
    if car_ids:
        cars = await db.cars.find({"id": {"$in": car_ids}}, {"_id": 0}).to_list(len(car_ids))
        car_map = {c["id"]: c for c in cars}
        for e in expenses:
            cid = e.get("car_id")
            if cid and cid in car_map:
                e["car_model"] = e.get("car_model") or car_map[cid].get("model", "")
                e["car_registration"] = e.get("car_registration") or car_map[cid].get("registration_no", "")

    return expenses


@router.post("/owners/{owner_id}/expenses")
async def create_owner_expense(
    owner_id: str,
    payload: OwnerExpenseCreate,
    user: dict = Depends(get_current_user),
):
    """Record an out-of-pocket handover expense (e.g. fuel, washing) paid by the operator for a car."""
    db = get_db()
    owner = await db.car_owners.find_one({"id": owner_id})
    if not owner:
        raise HTTPException(404, "Car owner not found")

    amount = float(payload.amount)
    if amount <= 0:
        raise HTTPException(400, "Expense amount must be greater than 0")

    car_model = ""
    car_registration = ""
    if payload.car_id:
        car = await db.cars.find_one({"id": payload.car_id})
        if car:
            car_model = car.get("model", "")
            car_registration = car.get("registration_no", "")

    expense_doc = {
        "id": new_id(),
        "owner_id": owner_id,
        "car_id": payload.car_id,
        "car_model": car_model,
        "car_registration": car_registration,
        "booking_id": payload.booking_id,
        "category": payload.category,
        "amount": amount,
        "description": (payload.description or "").strip(),
        "is_settled": False,
        "settlement_type": payload.settlement_type or "deduct_from_payout",
        "settled_at": None,
        "settled_note": "",
        "settled_in_ledger_id": None,
        "date": payload.date or now_iso(),
        "created_by": user.get("email", ""),
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }

    await db.owner_expenses.insert_one(expense_doc)
    await log_activity(
        db, user, "create", "owner_expenses", expense_doc["id"],
        {"owner_id": owner_id, "amount": amount, "category": payload.category}
    )
    expense_doc.pop("_id", None)
    return expense_doc


@router.put("/owners/expenses/{expense_id}/settle")
async def settle_owner_expense(
    expense_id: str,
    payload: dict,
    user: dict = Depends(get_current_user),
):
    """Mark an expense as settled (either deducted from payout or directly paid by owner)."""
    db = get_db()
    exp = await db.owner_expenses.find_one({"id": expense_id})
    if not exp:
        raise HTTPException(404, "Expense record not found")

    is_settled = payload.get("is_settled", True)
    settlement_type = payload.get("settlement_type", exp.get("settlement_type", "deduct_from_payout"))
    settled_note = payload.get("note", "")

    updates = {
        "is_settled": is_settled,
        "settlement_type": settlement_type,
        "settled_at": now_iso() if is_settled else None,
        "settled_note": settled_note,
        "updated_at": now_iso(),
    }

    if payload.get("ledger_id"):
        updates["settled_in_ledger_id"] = payload["ledger_id"]

    await db.owner_expenses.update_one({"id": expense_id}, {"$set": updates})
    await log_activity(
        db, user, "settle", "owner_expenses", expense_id,
        {"is_settled": is_settled, "settlement_type": settlement_type}
    )

    updated = await db.owner_expenses.find_one({"id": expense_id}, {"_id": 0})
    return updated


@router.delete("/owners/expenses/{expense_id}")
async def delete_owner_expense(
    expense_id: str,
    user: dict = Depends(require_super_admin),
):
    """Delete an expense record."""
    db = get_db()
    res = await db.owner_expenses.delete_one({"id": expense_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Expense record not found")

    await log_activity(db, user, "delete", "owner_expenses", expense_id, {})
    return {"ok": True, "message": "Expense deleted successfully"}


@router.post("/owners/{owner_id}/post-monthly-rent")
async def post_monthly_rent(
    owner_id: str,
    payload: MonthlyRetainerPost,
    user: dict = Depends(require_super_admin),
):
    """
    Post a fixed monthly lease / retainer rental fee to the owner's ledger for a given month (YYYY-MM).
    Prevents duplicate posting for the same vehicle in the same month.
    """
    db = get_db()
    owner = await db.car_owners.find_one({"id": owner_id})
    if not owner:
        raise HTTPException(404, "Car owner not found")

    car = await db.cars.find_one({"id": payload.car_id, "owner_id": owner_id})
    if not car:
        raise HTTPException(400, "Selected car does not belong to this owner")

    amount = float(payload.amount)
    if amount <= 0:
        raise HTTPException(400, "Monthly rent amount must be greater than 0")

    month_str = payload.month.strip()[:7]
    booking_key = f"monthly_{car['id']}_{month_str}"

    # Check if already posted
    existing = await db.ledger.find_one({"booking_id": booking_key})
    if existing:
        raise HTTPException(400, f"Monthly retainer for {month_str} already posted for {car.get('model')} ({car.get('registration_no')})")

    ledger_doc = {
        "id": new_id(),
        "entity_type": "owner",
        "entity_id": owner_id,
        "booking_id": booking_key,
        "amount": amount,
        "amount_paid": 0.0,
        "status": "pending",
        "description": f"Monthly Lease ({month_str}) — {car.get('model', 'Vehicle')} ({car.get('registration_no', 'TBD')})" + (f" — {payload.notes}" if payload.notes else ""),
        "due_date": f"{month_str}-28",
        "reminders_sent": 0,
        "last_reminder_at": None,
        "payments": [],
        "created_at": f"{month_str}-01T09:00:00+00:00",
        "updated_at": now_iso(),
    }

    await db.ledger.insert_one(ledger_doc)
    await db.car_owners.update_one(
        {"id": owner_id},
        {"$inc": {"total_owed": amount}}
    )

    await log_activity(
        db, user, "create", "ledger", ledger_doc["id"],
        {"type": "monthly_rent", "owner_id": owner_id, "amount": amount, "month": month_str}
    )

    ledger_doc.pop("_id", None)
    return ledger_doc


@router.get("/owners/{owner_id}/settlement-summary")
async def get_owner_settlement_summary(
    owner_id: str,
    month: Optional[str] = Query(None),
    user: dict = Depends(get_current_user),
):
    """
    Get consolidated financial statement for a car owner:
    - Rental Earnings (Owed)
    - Payouts Made (Paid)
    - Handover Expenses & Deductions (Fuel, Wash, etc.)
    - Net Balance Due to Owner
    Optionally filtered by month (YYYY-MM).
    """
    db = get_db()
    owner = await db.car_owners.find_one({"id": owner_id}, {"_id": 0})
    if not owner:
        raise HTTPException(404, "Car owner not found")

    # Fetch all ledger entries for this owner
    all_ledgers = await db.ledger.find({"entity_type": "owner", "entity_id": owner_id}, {"_id": 0}).to_list(1000)

    if month:
        ledgers = [
            l for l in all_ledgers
            if (l.get("created_at") or "")[:7] == month or (l.get("due_date") or "")[:7] == month
        ]
        # Payments made during this month
        total_owed = sum(float(l.get("amount", 0)) for l in ledgers)
        total_paid = 0.0
        for l in all_ledgers:
            for p in l.get("payments", []):
                if (p.get("at") or "")[:7] == month:
                    total_paid += float(p.get("amount", 0))
    else:
        ledgers = all_ledgers
        total_owed = sum(float(l.get("amount", 0)) for l in ledgers)
        total_paid = sum(float(l.get("amount_paid", 0)) for l in ledgers)
        if not ledgers:
            total_owed = float(owner.get("total_owed", 0))
            total_paid = float(owner.get("total_paid", 0))

    gross_balance = total_owed - total_paid

    # Fetch expenses (filtered by month if specified)
    exp_query = {"owner_id": owner_id}
    if month:
        exp_query["date"] = {"$regex": f"^{month}"}
    expenses = await db.owner_expenses.find(exp_query, {"_id": 0}).sort("date", -1).to_list(1000)

    total_expenses = sum(float(e.get("amount", 0)) for e in expenses)
    unsettled_expenses = sum(float(e.get("amount", 0)) for e in expenses if not e.get("is_settled", False))
    settled_expenses = sum(float(e.get("amount", 0)) for e in expenses if e.get("is_settled", False))

    breakdown = {
        "fuel": sum(float(e.get("amount", 0)) for e in expenses if e.get("category") == "fuel"),
        "wash": sum(float(e.get("amount", 0)) for e in expenses if e.get("category") == "wash"),
        "maintenance": sum(float(e.get("amount", 0)) for e in expenses if e.get("category") == "maintenance"),
        "fastag": sum(float(e.get("amount", 0)) for e in expenses if e.get("category") == "fastag"),
        "challan": sum(float(e.get("amount", 0)) for e in expenses if e.get("category") == "challan"),
        "other": sum(float(e.get("amount", 0)) for e in expenses if e.get("category") == "other"),
    }

    # Net payable to owner:
    net_balance_due = max(0.0, total_owed - unsettled_expenses - total_paid)

    # Cars list
    cars = await db.cars.find({"owner_id": owner_id}, {"_id": 0}).to_list(100)
    monthly_cars = [c for c in cars if c.get("billing_type") == "monthly"]

    m_filter = month[:7] if month and month != "all" else datetime.now(timezone.utc).strftime("%Y-%m")
    monthly_target = sum(float(c.get("monthly_cost_rate") or 0.0) for c in monthly_cars)
    monthly_car_ids = [c["id"] for c in monthly_cars]

    extracted_revenue = 0.0
    extracted_days = 0
    bookings_count = 0

    if monthly_car_ids:
        monthly_bookings = await db.bookings.find({
            "car_id": {"$in": monthly_car_ids},
            "status": {"$ne": "cancelled"},
            "start_date": {"$regex": f"^{m_filter}"}
        }, {"_id": 0}).to_list(1000)

        extracted_revenue = sum(float(b.get("customer_rate") or 0.0) for b in monthly_bookings)
        extracted_days = sum(int(b.get("days") or 1) for b in monthly_bookings)
        bookings_count = len(monthly_bookings)

    is_surplus = extracted_revenue >= monthly_target if monthly_target > 0 else True
    surplus_amount = max(0.0, extracted_revenue - monthly_target) if monthly_target > 0 else extracted_revenue
    pending_amount = max(0.0, monthly_target - extracted_revenue) if monthly_target > 0 else 0.0
    percent_extracted = round((extracted_revenue / monthly_target) * 100, 1) if monthly_target > 0 else 100.0

    monthly_performance = {
        "has_monthly_contract": len(monthly_cars) > 0,
        "month": m_filter,
        "monthly_target": monthly_target,
        "extracted_revenue": extracted_revenue,
        "extracted_days": extracted_days,
        "bookings_count": bookings_count,
        "is_surplus": is_surplus,
        "surplus_amount": surplus_amount,
        "pending_amount": pending_amount,
        "percent_extracted": percent_extracted,
        "monthly_cars": monthly_cars,
    }

    return {
        "owner_id": owner_id,
        "owner_name": owner.get("name", ""),
        "owner_contact": owner.get("contact", ""),
        "filter_month": month,
        "total_owed": total_owed,
        "total_paid": total_paid,
        "gross_balance": gross_balance,
        "total_expenses": total_expenses,
        "unsettled_expenses": unsettled_expenses,
        "settled_expenses": settled_expenses,
        "breakdown": breakdown,
        "net_balance_due": net_balance_due,
        "cars": cars,
        "monthly_performance": monthly_performance,
        "unsettled_items": [e for e in expenses if not e.get("is_settled", False)],
        "recent_expenses": expenses[:15],
    }
