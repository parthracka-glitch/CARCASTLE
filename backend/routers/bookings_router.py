"""Bookings + Transfers router."""
from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional
from datetime import datetime, timezone
from models import BookingCreate, BookingUpdate, new_id, now_iso
from deps import get_db, get_current_user, require_super_admin, log_activity

router = APIRouter(prefix="/bookings", tags=["bookings"])


def _sanitize_for_operator(b: dict) -> dict:
    """Hide financial data from operator role."""
    return {k: v for k, v in b.items()
            if k not in {"cost_rate", "margin", "net_profit", "agent_fee"}}


async def _add_ledger_entries_for_booking(db, booking: dict, user: dict):
    """Create ledger entries for owner + optional agent."""
    days = booking.get("days", 1)
    daily_cost = booking.get("daily_cost_rate", booking["cost_rate"] / max(1, days))
    days_note = f" ({days} days @ ₹{int(daily_cost):,}/day)" if days > 1 else ""

    # Owner payable
    owner_ledger = {
        "id": new_id(),
        "entity_type": "owner",
        "entity_id": booking["owner_id"],
        "booking_id": booking["id"],
        "amount": float(booking["cost_rate"]),
        "amount_paid": 0.0,
        "status": "pending",
        "description": f"Booking {booking['id'][:8]} — {booking['customer_name']}{days_note}",
        "due_date": booking["end_date"],
        "reminders_sent": 0,
        "last_reminder_at": None,
        "payments": [],
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.ledger.insert_one(owner_ledger)
    await db.car_owners.update_one(
        {"id": booking["owner_id"]},
        {"$inc": {"total_owed": float(booking["cost_rate"])}},
    )

    # Agent payable (if present)
    if booking.get("assigned_agent_id") and float(booking.get("agent_fee", 0)) > 0:
        agent_ledger = {
            "id": new_id(),
            "entity_type": "agent",
            "entity_id": booking["assigned_agent_id"],
            "booking_id": booking["id"],
            "amount": float(booking["agent_fee"]),
            "amount_paid": 0.0,
            "status": "pending",
            "description": f"Transfer for booking {booking['id'][:8]}",
            "due_date": booking["end_date"],
            "reminders_sent": 0,
            "last_reminder_at": None,
            "payments": [],
            "created_at": now_iso(),
            "updated_at": now_iso(),
        }
        await db.ledger.insert_one(agent_ledger)
        await db.agents.update_one(
            {"id": booking["assigned_agent_id"]},
            {"$inc": {"total_owed": float(booking["agent_fee"])}},
        )


@router.get("")
async def list_bookings(
    user: dict = Depends(get_current_user),
    status: Optional[str] = None,
    owner_id: Optional[str] = None,
    car_id: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    is_transfer: Optional[bool] = None,
):
    db = get_db()
    q = {}
    if status:
        q["status"] = status
    if owner_id:
        q["owner_id"] = owner_id
    if car_id:
        q["car_id"] = car_id
    if from_date and to_date:
        q["start_date"] = {"$gte": from_date, "$lte": to_date}
    if is_transfer:
        q["transfer_type"] = {"$ne": "none"}

    bookings = await db.bookings.find(q, {"_id": 0}).sort("start_date", -1).to_list(1000)

    # attach car + customer info
    car_map = {c["id"]: c for c in await db.cars.find({}, {"_id": 0}).to_list(1000)}
    owner_map = {o["id"]: o for o in await db.car_owners.find({}, {"_id": 0}).to_list(1000)}
    agent_map = {a["id"]: a for a in await db.agents.find({}, {"_id": 0}).to_list(1000)}

    for b in bookings:
        car = car_map.get(b["car_id"], {})
        b["car_model"] = car.get("model", "—")
        b["car_registration"] = car.get("registration_no", "—")
        b["owner_name"] = owner_map.get(b.get("owner_id", ""), {}).get("name", "—")
        if b.get("assigned_agent_id"):
            b["agent_name"] = agent_map.get(b["assigned_agent_id"], {}).get("name", "—")
        else:
            b["agent_name"] = None

    if user["role"] == "operator":
        bookings = [_sanitize_for_operator(b) for b in bookings]

    return bookings


@router.post("")
async def create_booking(payload: BookingCreate, user: dict = Depends(get_current_user)):
    db = get_db()
    car = await db.cars.find_one({"id": payload.car_id})
    if not car:
        raise HTTPException(400, "Car not found")

    if payload.assigned_agent_id:
        agent = await db.agents.find_one({"id": payload.assigned_agent_id})
        if not agent:
            raise HTTPException(400, "Assigned agent not found")

    # Compute duration in days
    calc_days = 1
    try:
        s_dt = datetime.fromisoformat(str(payload.start_date)[:10])
        e_dt = datetime.fromisoformat(str(payload.end_date)[:10])
        diff = (e_dt - s_dt).days
        calc_days = diff if diff > 0 else 1
    except Exception:
        calc_days = payload.days or 1

    days = payload.days if (payload.days and payload.days > 0) else calc_days

    daily_cost = float(payload.daily_cost_rate or 0)
    daily_customer = float(payload.daily_customer_rate or 0)

    cost_rate = float(payload.cost_rate)
    customer_rate = float(payload.customer_rate)

    # If daily rates provided, ensure total rates match daily_rate * days
    if daily_cost > 0 and (cost_rate == daily_cost or cost_rate == 0):
        cost_rate = daily_cost * days
    elif cost_rate > 0 and daily_cost == 0:
        daily_cost = cost_rate / days

    if daily_customer > 0 and (customer_rate == daily_customer or customer_rate == 0):
        customer_rate = daily_customer * days
    elif customer_rate > 0 and daily_customer == 0:
        daily_customer = customer_rate / days

    agent_fee = float(payload.agent_fee or 0)
    margin = customer_rate - cost_rate
    net_profit = margin - agent_fee

    booking_dict = payload.model_dump()
    booking_dict["days"] = days
    booking_dict["daily_cost_rate"] = daily_cost
    booking_dict["daily_customer_rate"] = daily_customer
    booking_dict["cost_rate"] = cost_rate
    booking_dict["customer_rate"] = customer_rate

    booking = {
        "id": new_id(),
        **booking_dict,
        "owner_id": car["owner_id"],
        "margin": margin,
        "net_profit": net_profit,
        "status": "reserved",
        "transfer_status": "scheduled" if payload.transfer_type != "none" else "none",
        "created_by": user["id"],
        "created_by_email": user["email"],
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.bookings.insert_one(booking)
    await _add_ledger_entries_for_booking(db, booking, user)
    await log_activity(db, user, "create", "bookings", booking["id"],
                       {"customer": payload.customer_name, "days": days, "margin": margin})

    booking.pop("_id", None)
    if user["role"] == "operator":
        booking = _sanitize_for_operator(booking)
    return booking


@router.get("/{booking_id}")
async def get_booking(booking_id: str, user: dict = Depends(get_current_user)):
    db = get_db()
    b = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not b:
        raise HTTPException(404, "Booking not found")
    car = await db.cars.find_one({"id": b["car_id"]}, {"_id": 0}) or {}
    b["car_model"] = car.get("model", "—")
    b["car_registration"] = car.get("registration_no", "—")
    owner = await db.car_owners.find_one({"id": b.get("owner_id")}, {"_id": 0}) or {}
    b["owner_name"] = owner.get("name", "—")
    if b.get("assigned_agent_id"):
        agent = await db.agents.find_one({"id": b["assigned_agent_id"]}, {"_id": 0}) or {}
        b["agent_name"] = agent.get("name", "—")
    if user["role"] == "operator":
        b = _sanitize_for_operator(b)
    return b


@router.put("/{booking_id}")
async def update_booking(booking_id: str, payload: BookingUpdate, user: dict = Depends(get_current_user)):
    db = get_db()
    old = await db.bookings.find_one({"id": booking_id})
    if not old:
        raise HTTPException(404, "Booking not found")

    updates = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}

    # Operators can only update status + transfer_status
    if user["role"] == "operator":
        allowed = {"status", "transfer_status", "notes"}
        updates = {k: v for k, v in updates.items() if k in allowed}
        if not updates:
            raise HTTPException(403, "Operators cannot modify these fields")

    # Recompute margin if rates changed
    new_cost = float(updates.get("cost_rate", old["cost_rate"]))
    new_customer = float(updates.get("customer_rate", old["customer_rate"]))
    new_agent_fee = float(updates.get("agent_fee", old.get("agent_fee", 0)))
    updates["margin"] = new_customer - new_cost
    updates["net_profit"] = updates["margin"] - new_agent_fee
    updates["updated_at"] = now_iso()

    await db.bookings.update_one({"id": booking_id}, {"$set": updates})
    await log_activity(db, user, "update", "bookings", booking_id,
                       {"before": {k: old.get(k) for k in updates}, "after": updates})
    b = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if user["role"] == "operator":
        b = _sanitize_for_operator(b)
    return b


@router.delete("/{booking_id}")
async def delete_booking(booking_id: str, user: dict = Depends(require_super_admin)):
    db = get_db()
    b = await db.bookings.find_one({"id": booking_id})
    if not b:
        raise HTTPException(404, "Booking not found")

    # Reverse ledger effect
    ledgers = await db.ledger.find({"booking_id": booking_id}).to_list(20)
    for lg in ledgers:
        if lg["entity_type"] == "owner":
            await db.car_owners.update_one(
                {"id": lg["entity_id"]},
                {"$inc": {"total_owed": -float(lg["amount"]),
                          "total_paid": -float(lg["amount_paid"])}},
            )
        else:
            await db.agents.update_one(
                {"id": lg["entity_id"]},
                {"$inc": {"total_owed": -float(lg["amount"]),
                          "total_paid": -float(lg["amount_paid"])}},
            )
    await db.ledger.delete_many({"booking_id": booking_id})
    await db.bookings.delete_one({"id": booking_id})
    await log_activity(db, user, "delete", "bookings", booking_id, {})
    return {"ok": True}


# ---------- Transfers view ----------
transfers_router = APIRouter(prefix="/transfers", tags=["transfers"])


@transfers_router.get("")
async def list_transfers(user: dict = Depends(get_current_user)):
    db = get_db()
    q = {"transfer_type": {"$ne": "none"}}
    bookings = await db.bookings.find(q, {"_id": 0}).sort("start_date", -1).to_list(500)
    agent_map = {a["id"]: a for a in await db.agents.find({}, {"_id": 0}).to_list(500)}
    car_map = {c["id"]: c for c in await db.cars.find({}, {"_id": 0}).to_list(500)}
    owner_map = {o["id"]: o for o in await db.car_owners.find({}, {"_id": 0}).to_list(500)}
    for b in bookings:
        if b.get("assigned_agent_id"):
            b["agent_name"] = agent_map.get(b["assigned_agent_id"], {}).get("name", "—")
        car = car_map.get(b["car_id"], {})
        b["car_model"] = car.get("model", "—")
        b["car_registration"] = car.get("registration_no", "—")
        b["owner_name"] = owner_map.get(b.get("owner_id", ""), {}).get("name", "—")
        # Ensure default values for driver fields
        b["driver_name"] = b.get("driver_name") or "Owner (Self)"
        b["driver_fee"] = float(b.get("driver_fee") or 0.0)
        b["driver_fee_paid"] = float(b.get("driver_fee_paid") or 0.0)
        b["driver_fee_pending"] = max(0.0, b["driver_fee"] - b["driver_fee_paid"])
    if user["role"] == "operator":
        bookings = [_sanitize_for_operator(b) for b in bookings]
    return bookings


@transfers_router.get("/drivers-summary")
async def get_drivers_summary(user: dict = Depends(get_current_user)):
    db = get_db()
    q = {"transfer_type": {"$ne": "none"}}
    bookings = await db.bookings.find(q, {"_id": 0}).sort("start_date", -1).to_list(1000)
    
    drivers_map = {}
    total_agreed = 0.0
    total_paid = 0.0

    for b in bookings:
        driver = b.get("driver_name") or "Owner (Self)"
        fee = float(b.get("driver_fee") or 0.0)
        paid = float(b.get("driver_fee_paid") or 0.0)
        pending = max(0.0, fee - paid)

        total_agreed += fee
        total_paid += paid

        if driver not in drivers_map:
            drivers_map[driver] = {
                "driver_name": driver,
                "total_transfers": 0,
                "total_fee": 0.0,
                "total_paid": 0.0,
                "total_pending": 0.0,
                "transfers": [],
            }

        drivers_map[driver]["total_transfers"] += 1
        drivers_map[driver]["total_fee"] += fee
        drivers_map[driver]["total_paid"] += paid
        drivers_map[driver]["total_pending"] += pending
        drivers_map[driver]["transfers"].append({
            "booking_id": b["id"],
            "customer_name": b["customer_name"],
            "start_date": b["start_date"],
            "transfer_type": b["transfer_type"],
            "transfer_status": b["transfer_status"],
            "fee": fee,
            "paid": paid,
            "pending": pending,
        })

    return {
        "summary": {
            "total_transfers": len(bookings),
            "total_agreed_fee": total_agreed,
            "total_paid": total_paid,
            "total_pending": max(0.0, total_agreed - total_paid),
        },
        "drivers": list(drivers_map.values()),
    }


@transfers_router.put("/{booking_id}/status")
async def update_transfer_status(booking_id: str, payload: dict, user: dict = Depends(get_current_user)):
    db = get_db()
    new_status = payload.get("status")
    if new_status not in {"scheduled", "en_route", "completed", "cancelled"}:
        raise HTTPException(400, "Invalid status")
    old = await db.bookings.find_one({"id": booking_id})
    if not old:
        raise HTTPException(404, "Booking not found")
    await db.bookings.update_one(
        {"id": booking_id},
        {"$set": {"transfer_status": new_status, "updated_at": now_iso()}},
    )
    await log_activity(db, user, "transfer_status", "bookings", booking_id,
                       {"from": old.get("transfer_status"), "to": new_status})
    return {"ok": True, "status": new_status}


@transfers_router.put("/{booking_id}/driver")
async def update_transfer_driver(booking_id: str, payload: dict, user: dict = Depends(get_current_user)):
    db = get_db()
    old = await db.bookings.find_one({"id": booking_id})
    if not old:
        raise HTTPException(404, "Booking not found")

    driver_name = payload.get("driver_name", old.get("driver_name", "Owner (Self)"))
    driver_fee = float(payload.get("driver_fee", old.get("driver_fee", 0.0)))
    driver_fee_paid = float(payload.get("driver_fee_paid", old.get("driver_fee_paid", 0.0)))
    transfer_status = payload.get("transfer_status", old.get("transfer_status", "scheduled"))
    transfer_type = payload.get("transfer_type", old.get("transfer_type", "airport_drop"))
    flight_time = payload.get("flight_time", old.get("flight_time", ""))
    transfer_pickup_point = payload.get("transfer_pickup_point", old.get("transfer_pickup_point", ""))
    notes = payload.get("notes", old.get("notes", ""))

    updates = {
        "driver_name": driver_name,
        "driver_fee": driver_fee,
        "driver_fee_paid": driver_fee_paid,
        "transfer_status": transfer_status,
        "transfer_type": transfer_type,
        "flight_time": flight_time,
        "transfer_pickup_point": transfer_pickup_point,
        "notes": notes,
        "updated_at": now_iso(),
    }

    await db.bookings.update_one({"id": booking_id}, {"$set": updates})
    await log_activity(db, user, "update_transfer_driver", "bookings", booking_id, updates)
    
    updated = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    return updated
