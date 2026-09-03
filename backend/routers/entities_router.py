"""Owner + Agent + Car routers."""
from fastapi import APIRouter, HTTPException, Depends, Query
from typing import List, Optional
from datetime import datetime, timezone
from models import CarOwnerCreate, AgentCreate, CarCreate, RateChangeIn, new_id, now_iso
from deps import get_db, get_current_user, require_super_admin, log_activity

router = APIRouter(tags=["entities"])


# ---------- Car Owners ----------
@router.get("/owners")
async def list_owners(user: dict = Depends(get_current_user)):
    db = get_db()
    docs = await db.car_owners.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    
    # Compute unsettled handover deductions for each owner
    unsettled_list = await db.owner_expenses.find({"is_settled": False}, {"_id": 0}).to_list(2000)
    exp_map = {}
    for exp in unsettled_list:
        oid = exp.get("owner_id")
        exp_map[oid] = exp_map.get(oid, 0.0) + float(exp.get("amount", 0))

    # Fetch cars to calculate monthly lease performance
    all_cars = await db.cars.find({}, {"_id": 0}).to_list(1000)
    curr_month = datetime.now(timezone.utc).strftime("%Y-%m")
    active_bookings = await db.bookings.find({
        "status": {"$ne": "cancelled"},
        "start_date": {"$regex": f"^{curr_month}"}
    }, {"_id": 0}).to_list(2000)

    # Group cars by owner
    owner_cars_map = {}
    for c in all_cars:
        oid = c.get("owner_id")
        owner_cars_map.setdefault(oid, []).append(c)

    # Group bookings by car_id
    car_revenue_map = {}
    for b in active_bookings:
        cid = b.get("car_id")
        if cid:
            car_revenue_map[cid] = car_revenue_map.get(cid, 0.0) + float(b.get("customer_rate") or 0.0)

    for d in docs:
        oid = d["id"]
        d["unsettled_expenses"] = exp_map.get(oid, 0.0)
        d["net_balance"] = max(0.0, float(d.get("total_owed", 0)) - d["unsettled_expenses"] - float(d.get("total_paid", 0)))
        
        # Monthly contract stats
        o_cars = owner_cars_map.get(oid, [])
        m_cars = [c for c in o_cars if c.get("billing_type") == "monthly"]
        d["car_count"] = len(o_cars)
        d["has_monthly_contract"] = len(m_cars) > 0
        
        if m_cars:
            m_target = sum(float(c.get("monthly_cost_rate") or 0.0) for c in m_cars)
            m_extracted = sum(car_revenue_map.get(c["id"], 0.0) for c in m_cars)
            d["monthly_target"] = m_target
            d["extracted_revenue"] = m_extracted
            d["surplus_amount"] = max(0.0, m_extracted - m_target)
            d["pending_amount"] = max(0.0, m_target - m_extracted)
            d["is_surplus"] = m_extracted >= m_target
            d["percent_extracted"] = round((m_extracted / m_target) * 100, 1) if m_target > 0 else 100.0
            d["monthly_car_names"] = ", ".join(f"{c.get('model')} ({c.get('registration_no')})" for c in m_cars)
        else:
            d["monthly_target"] = 0.0
            d["extracted_revenue"] = 0.0
            d["surplus_amount"] = 0.0
            d["pending_amount"] = 0.0
            d["is_surplus"] = False
            d["percent_extracted"] = 0.0
            d["monthly_car_names"] = ""

    return docs


@router.post("/owners")
async def create_owner(payload: CarOwnerCreate, user: dict = Depends(require_super_admin)):
    db = get_db()
    owner_dict = {
        "name": payload.name,
        "contact": payload.contact,
        "notes": payload.notes or "",
    }
    doc = {"id": new_id(), **owner_dict, "total_owed": 0.0,
           "total_paid": 0.0, "created_at": now_iso()}
    await db.car_owners.insert_one(doc)

    # If monthly contract details are supplied, automatically create the vehicle attached to this owner
    if payload.is_monthly_contract and float(payload.monthly_amount or 0) > 0:
        reg_no = payload.car_registration.strip().upper() if payload.car_registration else f"GA-07-M-{doc['id'][:4].upper()}"
        car_model = payload.car_model.strip() if payload.car_model else "Standard Vehicle"
        car_doc = {
            "id": new_id(),
            "registration_no": reg_no,
            "model": car_model,
            "owner_id": doc["id"],
            "billing_type": "monthly",
            "monthly_cost_rate": float(payload.monthly_amount),
            "owner_selling_rate": float(payload.owner_selling_rate or 0.0),
            "billing_cycle_day": 1,
            "created_at": now_iso(),
        }
        await db.cars.insert_one(car_doc)
        await log_activity(db, user, "create", "cars", car_doc["id"], {"auto_created_with_owner": doc["id"]})

    await log_activity(db, user, "create", "car_owners", doc["id"], {"new": payload.model_dump()})
    doc.pop("_id", None)
    return doc


@router.get("/owners/{owner_id}")
async def get_owner(owner_id: str, user: dict = Depends(get_current_user)):
    db = get_db()
    owner = await db.car_owners.find_one({"id": owner_id}, {"_id": 0})
    if not owner:
        raise HTTPException(404, "Owner not found")
    cars = await db.cars.find({"owner_id": owner_id}, {"_id": 0}).to_list(200)
    bookings_count = await db.bookings.count_documents({"owner_id": owner_id})
    unsettled_expenses = sum(
        float(e.get("amount", 0))
        for e in await db.owner_expenses.find({"owner_id": owner_id, "is_settled": False}).to_list(500)
    )
    owner["cars"] = cars
    owner["bookings_count"] = bookings_count
    owner["unsettled_expenses"] = unsettled_expenses
    owner["net_balance"] = max(0.0, float(owner.get("total_owed", 0)) - unsettled_expenses - float(owner.get("total_paid", 0)))
    return owner


@router.put("/owners/{owner_id}")
async def update_owner(owner_id: str, payload: CarOwnerCreate, user: dict = Depends(require_super_admin)):
    db = get_db()
    old = await db.car_owners.find_one({"id": owner_id})
    if not old:
        raise HTTPException(404, "Owner not found")
    await db.car_owners.update_one({"id": owner_id}, {"$set": payload.model_dump()})
    await log_activity(db, user, "update", "car_owners", owner_id,
                       {"before": {k: old.get(k) for k in payload.model_dump()}, "after": payload.model_dump()})
    return {"ok": True}


@router.delete("/owners/{owner_id}")
async def delete_owner(owner_id: str, user: dict = Depends(require_super_admin)):
    db = get_db()
    res = await db.car_owners.delete_one({"id": owner_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Owner not found")
    # Also delete associated cars and expenses belonging to this owner
    await db.cars.delete_many({"owner_id": owner_id})
    await db.owner_expenses.delete_many({"owner_id": owner_id})
    await log_activity(db, user, "delete", "car_owners", owner_id, {})
    return {"ok": True, "message": "Owner, fleet cars, and associated expenses deleted successfully"}


# ---------- Cars ----------
@router.get("/cars")
async def list_cars(user: dict = Depends(get_current_user)):
    db = get_db()
    cars = await db.cars.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    # attach owner name
    owners = {o["id"]: o for o in await db.car_owners.find({}, {"_id": 0}).to_list(500)}
    for c in cars:
        c["owner_name"] = owners.get(c["owner_id"], {}).get("name", "—")
    return cars


@router.post("/cars")
async def create_car(payload: CarCreate, user: dict = Depends(require_super_admin)):
    db = get_db()
    owner = await db.car_owners.find_one({"id": payload.owner_id})
    if not owner:
        raise HTTPException(400, "Owner not found")
    if await db.cars.find_one({"registration_no": payload.registration_no}):
        raise HTTPException(400, "Registration number already exists")
    doc = {"id": new_id(), **payload.model_dump(), "created_at": now_iso()}
    await db.cars.insert_one(doc)
    await log_activity(db, user, "create", "cars", doc["id"], {"new": payload.model_dump()})
    doc.pop("_id", None)
    return doc


@router.put("/cars/{car_id}")
async def update_car(car_id: str, payload: CarCreate, user: dict = Depends(require_super_admin)):
    db = get_db()
    old = await db.cars.find_one({"id": car_id})
    if not old:
        raise HTTPException(404, "Car not found")

    # Rate change logging
    if abs(float(old.get("default_cost_rate", 0)) - float(payload.default_cost_rate or 0)) > 0.001:
        await db.rate_history.insert_one({
            "id": new_id(),
            "entity_type": "car",
            "entity_id": car_id,
            "old_rate": float(old.get("default_cost_rate", 0)),
            "new_rate": float(payload.default_cost_rate or 0),
            "effective_date": now_iso(),
            "changed_by": user["email"],
            "created_at": now_iso(),
        })
    await db.cars.update_one({"id": car_id}, {"$set": payload.model_dump()})
    await log_activity(db, user, "update", "cars", car_id, {})
    return {"ok": True}


@router.delete("/cars/{car_id}")
async def delete_car(car_id: str, user: dict = Depends(require_super_admin)):
    db = get_db()
    res = await db.cars.delete_one({"id": car_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Car not found")
    await log_activity(db, user, "delete", "cars", car_id, {})
    return {"ok": True}


@router.get("/cars/{car_id}/monthly-performance")
async def get_car_monthly_performance(
    car_id: str,
    month: Optional[str] = Query(None),
    user: dict = Depends(get_current_user),
):
    """
    Get live monthly revenue, break-even target, and pure profit generated by a vehicle.
    Especially useful for monthly lease vehicles to see if customer revenue has crossed the owner's fixed lease amount.
    """
    db = get_db()
    car = await db.cars.find_one({"id": car_id}, {"_id": 0})
    if not car:
        raise HTTPException(404, "Car not found")

    m = month[:7] if month else datetime.now(timezone.utc).strftime("%Y-%m")
    monthly_cost = float(car.get("monthly_cost_rate") or 0.0)
    owner_selling_rate = float(car.get("owner_selling_rate") or 0.0)
    breakeven_days = round(monthly_cost / owner_selling_rate, 1) if owner_selling_rate > 0 else 0

    # Query all active/completed bookings for this vehicle in this month
    bookings = await db.bookings.find({
        "car_id": car_id,
        "status": {"$ne": "cancelled"},
        "start_date": {"$regex": f"^{m}"}
    }, {"_id": 0}).to_list(1000)

    total_revenue = sum(float(b.get("customer_rate") or 0.0) for b in bookings)
    total_days_booked = sum(int(b.get("days") or 1) for b in bookings)
    bookings_count = len(bookings)

    is_breakeven_reached = total_revenue >= monthly_cost if monthly_cost > 0 else True
    remaining_to_breakeven = max(0.0, monthly_cost - total_revenue) if monthly_cost > 0 else 0.0
    pure_profit = max(0.0, total_revenue - monthly_cost) if monthly_cost > 0 else total_revenue
    percent_recovered = round((total_revenue / monthly_cost) * 100, 1) if monthly_cost > 0 else 100.0

    return {
        "car_id": car_id,
        "model": car.get("model", ""),
        "registration_no": car.get("registration_no", ""),
        "billing_type": car.get("billing_type", "daily"),
        "month": m,
        "monthly_cost_rate": monthly_cost,
        "owner_selling_rate": owner_selling_rate,
        "breakeven_days": breakeven_days,
        "total_revenue": total_revenue,
        "total_days_booked": total_days_booked,
        "bookings_count": bookings_count,
        "is_breakeven_reached": is_breakeven_reached,
        "remaining_to_breakeven": remaining_to_breakeven,
        "pure_profit": pure_profit,
        "percent_recovered": percent_recovered,
    }



# ---------- Agents ----------
@router.get("/agents")
async def list_agents(user: dict = Depends(get_current_user)):
    db = get_db()
    return await db.agents.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)


@router.post("/agents")
async def create_agent(payload: AgentCreate, user: dict = Depends(require_super_admin)):
    db = get_db()
    doc = {"id": new_id(), **payload.model_dump(), "total_owed": 0.0,
           "total_paid": 0.0, "created_at": now_iso()}
    await db.agents.insert_one(doc)
    await log_activity(db, user, "create", "agents", doc["id"], {"new": payload.model_dump()})
    doc.pop("_id", None)
    return doc


@router.get("/agents/{agent_id}")
async def get_agent(agent_id: str, user: dict = Depends(get_current_user)):
    db = get_db()
    agent = await db.agents.find_one({"id": agent_id}, {"_id": 0})
    if not agent:
        raise HTTPException(404, "Agent not found")
    return agent


@router.put("/agents/{agent_id}")
async def update_agent(agent_id: str, payload: AgentCreate, user: dict = Depends(require_super_admin)):
    db = get_db()
    old = await db.agents.find_one({"id": agent_id})
    if not old:
        raise HTTPException(404, "Agent not found")
    await db.agents.update_one({"id": agent_id}, {"$set": payload.model_dump()})
    await log_activity(db, user, "update", "agents", agent_id, {})
    return {"ok": True}


@router.delete("/agents/{agent_id}")
async def delete_agent(agent_id: str, user: dict = Depends(require_super_admin)):
    db = get_db()
    res = await db.agents.delete_one({"id": agent_id})
    if res.deleted_count == 0:
        raise HTTPException(404, "Agent not found")
    await log_activity(db, user, "delete", "agents", agent_id, {})
    return {"ok": True}


# ---------- Rate History ----------
@router.get("/rate-history")
async def rate_history(user: dict = Depends(require_super_admin)):
    db = get_db()
    entries = await db.rate_history.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    # attach entity name
    car_map = {c["id"]: c for c in await db.cars.find({}, {"_id": 0}).to_list(500)}
    owner_map = {o["id"]: o for o in await db.car_owners.find({}, {"_id": 0}).to_list(500)}
    for e in entries:
        if e["entity_type"] == "car":
            car = car_map.get(e["entity_id"], {})
            e["entity_name"] = f"{car.get('model','')} ({car.get('registration_no','')})"
        else:
            e["entity_name"] = owner_map.get(e["entity_id"], {}).get("name", "—")
    return entries
