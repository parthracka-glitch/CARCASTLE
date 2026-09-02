"""Owner & Business Out-of-Pocket Expenses Router (Fuel, FASTag, Driver Extra Payments, Service, etc.)"""
from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional, List
from pydantic import BaseModel
from deps import get_db, get_current_user, require_super_admin, log_activity
from models import new_id, now_iso

router = APIRouter(prefix="/expenses", tags=["business_expenses"])


class BusinessExpenseIn(BaseModel):
    category: str = "fuel"  # fuel, driver_payment, wash, challan, other (or custom string)
    custom_category: Optional[str] = ""
    amount: float
    date: Optional[str] = None
    car_id: Optional[str] = None
    car_registration: Optional[str] = None
    car_model: Optional[str] = None
    custom_vehicle: Optional[str] = ""
    driver_name: Optional[str] = None
    payment_method: Optional[str] = "cash"  # cash, online
    description: Optional[str] = ""


@router.get("")
async def list_expenses(
    month: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    car_id: Optional[str] = Query(None),
    limit: int = Query(200, le=1000),
    user: dict = Depends(get_current_user),
):
    """List business and out-of-pocket expenses recorded by the owner."""
    db = get_db()
    q = {}
    if month:
        q["date"] = {"$regex": f"^{month}"}
    if category and category != "all":
        q["category"] = category
    if car_id and car_id != "all":
        q["car_id"] = car_id

    expenses = await db.business_expenses.find(q, {"_id": 0}).sort("date", -1).to_list(limit)
    return expenses


@router.get("/summary")
async def get_expenses_summary(
    month: Optional[str] = Query(None),
    user: dict = Depends(get_current_user),
):
    """Get aggregated summary of expenses by category."""
    db = get_db()
    q = {}
    if month:
        q["date"] = {"$regex": f"^{month}"}

    expenses = await db.business_expenses.find(q, {"_id": 0}).to_list(5000)
    total_amount = sum(float(e.get("amount", 0)) for e in expenses)

    by_category = {}
    for e in expenses:
        cat = e.get("category", "other")
        by_category[cat] = by_category.get(cat, 0.0) + float(e.get("amount", 0))

    return {
        "total_expenses": total_amount,
        "count": len(expenses),
        "by_category": by_category,
        "fuel_total": by_category.get("fuel", 0.0),
        "driver_payment_total": by_category.get("driver_payment", 0.0),
        "wash_total": by_category.get("wash", 0.0),
        "challan_total": by_category.get("challan", 0.0),
        "other_total": sum(v for k, v in by_category.items() if k not in ["fuel", "driver_payment", "wash", "challan"]),
    }


@router.post("")
async def create_expense(
    payload: BusinessExpenseIn,
    user: dict = Depends(get_current_user),
):
    """Record a personal or business expense made by the owner."""
    db = get_db()
    amount = float(payload.amount)
    if amount <= 0:
        raise HTTPException(400, "Expense amount must be greater than 0")

    category = payload.category.strip()
    if category == "other" and payload.custom_category and payload.custom_category.strip():
        category = payload.custom_category.strip()

    car_model = payload.car_model or ""
    car_reg = payload.car_registration or ""
    car_id = payload.car_id

    if car_id and car_id not in ["none", "other", "custom"]:
        car = await db.cars.find_one({"id": car_id})
        if car:
            car_model = car.get("model", "")
            car_reg = car.get("registration_no", "")
    elif car_id in ["other", "custom"] or (payload.custom_vehicle and payload.custom_vehicle.strip()):
        car_id = "custom"
        car_reg = (payload.custom_vehicle or "").strip()
        car_model = "Custom Vehicle"
    else:
        car_id = None

    doc = {
        "id": new_id(),
        "category": category,
        "amount": amount,
        "date": payload.date or now_iso()[:10],
        "car_id": car_id,
        "car_model": car_model,
        "car_registration": car_reg,
        "driver_name": (payload.driver_name or "").strip(),
        "payment_method": payload.payment_method or "cash",
        "description": (payload.description or "").strip(),
        "created_by": user.get("email", ""),
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }

    await db.business_expenses.insert_one(doc)
    await log_activity(
        db, user, "create", "business_expenses", doc["id"],
        {"category": category, "amount": amount, "car_reg": car_reg}
    )
    doc.pop("_id", None)
    return doc


@router.delete("/{expense_id}")
async def delete_expense(
    expense_id: str,
    user: dict = Depends(require_super_admin),
):
    """Delete an expense record (super_admin only)."""
    db = get_db()
    res = await db.business_expenses.delete_one({"id": expense_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Expense record not found")

    await log_activity(db, user, "delete", "business_expenses", expense_id, {})
    return {"ok": True, "message": "Expense deleted successfully"}
