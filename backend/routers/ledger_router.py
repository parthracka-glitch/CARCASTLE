"""Ledger + finance + reminders routes."""
from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional
from datetime import datetime, timezone
from models import LedgerCreate, LedgerPayment, new_id, now_iso
from deps import get_db, get_current_user, require_super_admin, log_activity
from reminders import send_reminder, format_message

router = APIRouter(prefix="/ledger", tags=["ledger"])


@router.get("")
async def list_ledger(
    user: dict = Depends(require_super_admin),
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    status: Optional[str] = None,
):
    db = get_db()
    q = {}
    if entity_type:
        q["entity_type"] = entity_type
    if entity_id:
        q["entity_id"] = entity_id
    if status:
        q["status"] = status
    entries = await db.ledger.find(q, {"_id": 0}).sort("created_at", -1).to_list(2000)

    owner_map = {o["id"]: o for o in await db.car_owners.find({}, {"_id": 0}).to_list(500)}
    agent_map = {a["id"]: a for a in await db.agents.find({}, {"_id": 0}).to_list(500)}
    for e in entries:
        if e["entity_type"] == "owner":
            e["entity_name"] = owner_map.get(e["entity_id"], {}).get("name", "—")
            e["entity_contact"] = owner_map.get(e["entity_id"], {}).get("contact", "")
        else:
            e["entity_name"] = agent_map.get(e["entity_id"], {}).get("name", "—")
            e["entity_contact"] = agent_map.get(e["entity_id"], {}).get("contact", "")
    return entries


@router.post("")
async def create_ledger(payload: LedgerCreate, user: dict = Depends(require_super_admin)):
    """Manually add a ledger entry (e.g. adjustment)."""
    db = get_db()
    doc = {
        "id": new_id(),
        **payload.model_dump(),
        "amount_paid": 0.0,
        "status": "pending",
        "reminders_sent": 0,
        "last_reminder_at": None,
        "payments": [],
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.ledger.insert_one(doc)
    col = "car_owners" if payload.entity_type == "owner" else "agents"
    await db[col].update_one({"id": payload.entity_id},
                             {"$inc": {"total_owed": float(payload.amount)}})
    await log_activity(db, user, "create", "ledger", doc["id"], {"amount": payload.amount})
    doc.pop("_id", None)
    return doc


@router.post("/{ledger_id}/pay")
async def record_payment(ledger_id: str, payload: LedgerPayment, user: dict = Depends(require_super_admin)):
    db = get_db()
    entry = await db.ledger.find_one({"id": ledger_id})
    if not entry:
        raise HTTPException(404, "Ledger not found")
    amount_paid = float(payload.amount_paid)
    if amount_paid <= 0:
        raise HTTPException(400, "Amount must be > 0")

    new_paid = float(entry["amount_paid"]) + amount_paid
    if new_paid > float(entry["amount"]) + 0.001:
        raise HTTPException(400, "Payment exceeds owed amount")

    if abs(new_paid - float(entry["amount"])) < 0.01:
        status = "paid"
    elif new_paid > 0:
        status = "partial"
    else:
        status = "pending"

    payment_record = {"amount": amount_paid, "note": payload.note or "",
                      "at": now_iso(), "by": user["email"]}
    await db.ledger.update_one(
        {"id": ledger_id},
        {"$set": {"amount_paid": new_paid, "status": status, "updated_at": now_iso()},
         "$push": {"payments": payment_record}},
    )
    col = "car_owners" if entry["entity_type"] == "owner" else "agents"
    await db[col].update_one({"id": entry["entity_id"]},
                             {"$inc": {"total_paid": amount_paid}})
    await log_activity(db, user, "payment", "ledger", ledger_id,
                       {"amount_paid": amount_paid, "new_status": status})
    return {"ok": True, "status": status, "amount_paid": new_paid}


@router.post("/{ledger_id}/remind")
async def send_ledger_reminder(ledger_id: str, user: dict = Depends(require_super_admin)):
    db = get_db()
    entry = await db.ledger.find_one({"id": ledger_id})
    if not entry:
        raise HTTPException(404, "Ledger not found")
    settings = await db.settings.find_one({"id": "default"}) or {}
    col = "car_owners" if entry["entity_type"] == "owner" else "agents"
    entity = await db.car_owners.find_one({"id": entry["entity_id"]}) if entry["entity_type"] == "owner" \
        else await db.agents.find_one({"id": entry["entity_id"]})
    if not entity:
        raise HTTPException(404, "Entity not found")

    tpl = settings.get(f"reminder_template_{entry['entity_type']}", "Reminder: ₹{amount} pending.")
    outstanding = float(entry["amount"]) - float(entry["amount_paid"])
    msg = format_message(tpl, name=entity.get("name", ""), amount=f"{outstanding:,.0f}")
    await send_reminder(db, entry["entity_type"], entity, msg, ledger_id=ledger_id,
                        booking_id=entry.get("booking_id"))
    await log_activity(db, user, "reminder", "ledger", ledger_id, {"channel": "mock"})
    return {"ok": True, "message": msg}


# ---------- Finance & Savings ----------
finance_router = APIRouter(prefix="/finance", tags=["finance"])


def _month_key(iso_str: str) -> str:
    return iso_str[:7]  # YYYY-MM


def compute_booking_financials(b: dict) -> dict:
    car_income = float(b.get("customer_rate") or 0.0)
    has_transfer = bool(b.get("transfer_type") and b.get("transfer_type") != "none")
    transfer_income = float(b.get("transfer_cost") or 0.0) if has_transfer else 0.0
    total_income = car_income + transfer_income

    owner_cost = float(b.get("cost_rate") or 0.0)

    driver_paid = 0.0
    if has_transfer:
        handled_by = b.get("transfer_handled_by")
        if handled_by == "driver":
            driver_paid = float(b.get("transfer_driver_share") if b.get("transfer_driver_share") is not None else (b.get("driver_fee") or 0.0))
        elif handled_by != "self":
            d_name = (b.get("driver_name") or "").lower()
            if d_name and "owner" not in d_name and "self" not in d_name:
                driver_paid = float(b.get("transfer_driver_share") if b.get("transfer_driver_share") is not None else (b.get("driver_fee") or 0.0))

    agent_fee = float(b.get("agent_fee") or 0.0)
    car_profit = car_income - owner_cost
    transfer_profit = transfer_income - driver_paid
    margin = car_profit + transfer_profit
    net_profit = margin - agent_fee

    return {
        "car_income": car_income,
        "transfer_income": transfer_income,
        "total_income": total_income,
        "owner_cost": owner_cost,
        "driver_paid": driver_paid,
        "agent_fee": agent_fee,
        "car_profit": car_profit,
        "transfer_profit": transfer_profit,
        "margin": margin,
        "net_profit": net_profit,
    }


@finance_router.get("/summary")
async def finance_summary(user: dict = Depends(require_super_admin)):
    db = get_db()
    bookings = await db.bookings.find({}, {"_id": 0}).to_list(5000)
    settings = await db.settings.find_one({"id": "default"}) or {"savings_percent": 10}
    savings_pct = float(settings.get("savings_percent", 10))

    fin_list = [compute_booking_financials(b) for b in bookings]

    total_car_income = sum(f["car_income"] for f in fin_list)
    total_transfer_income = sum(f["transfer_income"] for f in fin_list)
    total_income = sum(f["total_income"] for f in fin_list)

    total_owner_cost = sum(f["owner_cost"] for f in fin_list)
    total_driver_paid = sum(f["driver_paid"] for f in fin_list)
    total_agent_fee = sum(f["agent_fee"] for f in fin_list)

    total_car_profit = sum(f["car_profit"] for f in fin_list)
    total_transfer_profit = sum(f["transfer_profit"] for f in fin_list)
    total_margin = sum(f["margin"] for f in fin_list)
    total_net_profit = sum(f["net_profit"] for f in fin_list)
    savings_accrued = total_net_profit * (savings_pct / 100.0)

    # Cash vs Online payment methods
    total_cash_income = sum(f["total_income"] for b, f in zip(bookings, fin_list) if b.get("payment_method") != "online")
    total_online_income = sum(f["total_income"] for b, f in zip(bookings, fin_list) if b.get("payment_method") == "online")

    # Security Deposits
    total_deposit_held = sum(float(b.get("deposit_amount", 0)) for b in bookings if b.get("deposit_status") == "received")
    total_deposit_refunded = sum(float(b.get("deposit_amount", 0)) for b in bookings if b.get("deposit_status") == "refunded")

    # ledger snapshots
    owners = await db.car_owners.find({}, {"_id": 0}).to_list(500)
    agents = await db.agents.find({}, {"_id": 0}).to_list(500)
    owner_pending = sum(float(o["total_owed"]) - float(o["total_paid"]) for o in owners)
    agent_pending = sum(float(a["total_owed"]) - float(a["total_paid"]) for a in agents)

    # By month
    by_month = {}
    for b, f in zip(bookings, fin_list):
        m = _month_key(b.get("start_date", b["created_at"]))
        by_month.setdefault(m, {
            "income": 0.0, "car_income": 0.0, "transfer_income": 0.0,
            "owner_cost": 0.0, "driver_paid": 0.0, "agent_fee": 0.0,
            "car_profit": 0.0, "transfer_profit": 0.0,
            "margin": 0.0, "net_profit": 0.0, "bookings": 0
        })
        by_month[m]["income"] += f["total_income"]
        by_month[m]["car_income"] += f["car_income"]
        by_month[m]["transfer_income"] += f["transfer_income"]
        by_month[m]["owner_cost"] += f["owner_cost"]
        by_month[m]["driver_paid"] += f["driver_paid"]
        by_month[m]["agent_fee"] += f["agent_fee"]
        by_month[m]["car_profit"] += f["car_profit"]
        by_month[m]["transfer_profit"] += f["transfer_profit"]
        by_month[m]["margin"] += f["margin"]
        by_month[m]["net_profit"] += f["net_profit"]
        by_month[m]["bookings"] += 1

    months = [{"month": k, **v, "savings": v["net_profit"] * (savings_pct / 100.0)}
              for k, v in sorted(by_month.items())]

    return {
        "total_income": total_income,
        "total_car_income": total_car_income,
        "total_transfer_income": total_transfer_income,
        "total_cash_income": total_cash_income,
        "total_online_income": total_online_income,
        "total_deposit_held": total_deposit_held,
        "total_deposit_refunded": total_deposit_refunded,
        "total_owner_cost": total_owner_cost,
        "total_driver_paid": total_driver_paid,
        "total_agent_fee": total_agent_fee,
        "total_car_profit": total_car_profit,
        "total_transfer_profit": total_transfer_profit,
        "total_margin": total_margin,
        "total_net_profit": total_net_profit,
        "savings_accrued": savings_accrued,
        "savings_percent": savings_pct,
        "owner_pending": owner_pending,
        "agent_pending": agent_pending,
        "booking_count": len(bookings),
        "by_month": months,
    }


@finance_router.get("/margin-timeseries")
async def margin_timeseries(
    user: dict = Depends(require_super_admin),
    granularity: str = Query("day", pattern="^(day|week|month)$"),
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    car_id: Optional[str] = None,
    owner_id: Optional[str] = None,
):
    db = get_db()
    q = {}
    if from_date and to_date:
        q["start_date"] = {"$gte": from_date, "$lte": to_date}
    if car_id:
        q["car_id"] = car_id
    if owner_id:
        q["owner_id"] = owner_id
    bookings = await db.bookings.find(q, {"_id": 0}).to_list(5000)

    buckets = {}
    for b in bookings:
        d = (b.get("start_date") or b["created_at"])[:10]
        if granularity == "month":
            key = d[:7]
        elif granularity == "week":
            try:
                dt = datetime.fromisoformat(d)
                yr, wk, _ = dt.isocalendar()
                key = f"{yr}-W{wk:02d}"
            except Exception:
                key = d[:7]
        else:
            key = d
        f = compute_booking_financials(b)
        buckets.setdefault(key, {"margin": 0.0, "net_profit": 0.0, "car_profit": 0.0, "transfer_profit": 0.0, "bookings": 0})
        buckets[key]["margin"] += f["margin"]
        buckets[key]["net_profit"] += f["net_profit"]
        buckets[key]["car_profit"] += f["car_profit"]
        buckets[key]["transfer_profit"] += f["transfer_profit"]
        buckets[key]["bookings"] += 1

    return [{"bucket": k, **v} for k, v in sorted(buckets.items())]


# ---------- Settings ----------
settings_router = APIRouter(prefix="/settings", tags=["settings"])


@settings_router.get("")
async def get_settings(user: dict = Depends(get_current_user)):
    db = get_db()
    s = await db.settings.find_one({"id": "default"}, {"_id": 0})
    if not s:
        s = {"id": "default", "savings_percent": 10.0}
    if user["role"] == "operator":
        # Operators only see reminder templates, not savings config
        return {k: s.get(k) for k in ["reminder_template_owner", "reminder_template_agent",
                                       "reminder_template_transfer", "reminder_interval_days"]}
    return s


@settings_router.put("")
async def update_settings(payload: dict, user: dict = Depends(require_super_admin)):
    db = get_db()
    allowed_keys = {"savings_percent", "reminder_template_owner",
                    "reminder_template_agent", "reminder_template_transfer",
                    "reminder_interval_days"}
    updates = {k: v for k, v in payload.items() if k in allowed_keys and v is not None}
    if not updates:
        raise HTTPException(400, "No valid keys to update")
    await db.settings.update_one({"id": "default"}, {"$set": updates}, upsert=True)
    await log_activity(db, user, "update", "settings", "default", {"updated": updates})
    s = await db.settings.find_one({"id": "default"}, {"_id": 0})
    return s
