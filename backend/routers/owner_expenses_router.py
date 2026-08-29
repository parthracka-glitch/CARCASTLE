"""Car Owner handover expenses (fuel, wash, maintenance) & settlement calculation router."""
from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional, List
from models import (
    OwnerExpenseCreate,
    OwnerExpenseUpdate,
    OwnerExpense,
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


@router.get("/owners/{owner_id}/settlement-summary")
async def get_owner_settlement_summary(
    owner_id: str,
    user: dict = Depends(get_current_user),
):
    """
    Get consolidated financial statement for a car owner:
    - Rental Earnings (Owed)
    - Payouts Made (Paid)
    - Handover Expenses & Deductions (Fuel, Wash, etc.)
    - Net Balance Due to Owner
    """
    db = get_db()
    owner = await db.car_owners.find_one({"id": owner_id}, {"_id": 0})
    if not owner:
        raise HTTPException(404, "Car owner not found")

    # Fetch all ledger entries for this owner
    ledgers = await db.ledger.find({"entity_type": "owner", "entity_id": owner_id}, {"_id": 0}).to_list(1000)
    total_owed = sum(float(l.get("amount", 0)) for l in ledgers)
    total_paid = sum(float(l.get("amount_paid", 0)) for l in ledgers)

    # If ledgers are empty, fallback to owner doc totals
    if not ledgers:
        total_owed = float(owner.get("total_owed", 0))
        total_paid = float(owner.get("total_paid", 0))

    gross_balance = total_owed - total_paid

    # Fetch all expenses
    expenses = await db.owner_expenses.find({"owner_id": owner_id}, {"_id": 0}).sort("date", -1).to_list(1000)

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
    # Gross Rental Owed - Unsettled Expenses (deductions) - Total Paid
    net_balance_due = max(0.0, total_owed - unsettled_expenses - total_paid)

    # Cars list
    cars = await db.cars.find({"owner_id": owner_id}, {"_id": 0}).to_list(100)

    return {
        "owner_id": owner_id,
        "owner_name": owner.get("name", ""),
        "owner_contact": owner.get("contact", ""),
        "total_owed": total_owed,
        "total_paid": total_paid,
        "gross_balance": gross_balance,
        "total_expenses": total_expenses,
        "unsettled_expenses": unsettled_expenses,
        "settled_expenses": settled_expenses,
        "breakdown": breakdown,
        "net_balance_due": net_balance_due,
        "cars": cars,
        "unsettled_items": [e for e in expenses if not e.get("is_settled", False)],
        "recent_expenses": expenses[:10],
    }
