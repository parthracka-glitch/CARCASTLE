"""Owner + Agent + Car routers."""
from fastapi import APIRouter, HTTPException, Depends
from typing import List
from models import CarOwnerCreate, AgentCreate, CarCreate, RateChangeIn, new_id, now_iso
from deps import get_db, get_current_user, require_super_admin, log_activity

router = APIRouter(tags=["entities"])


# ---------- Car Owners ----------
@router.get("/owners")
async def list_owners(user: dict = Depends(get_current_user)):
    db = get_db()
    docs = await db.car_owners.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    return docs


@router.post("/owners")
async def create_owner(payload: CarOwnerCreate, user: dict = Depends(require_super_admin)):
    db = get_db()
    doc = {"id": new_id(), **payload.model_dump(), "total_owed": 0.0,
           "total_paid": 0.0, "created_at": now_iso()}
    await db.car_owners.insert_one(doc)
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
    owner["cars"] = cars
    owner["bookings_count"] = bookings_count
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
    # Also delete associated cars belonging to this owner
    await db.cars.delete_many({"owner_id": owner_id})
    await log_activity(db, user, "delete", "car_owners", owner_id, {})
    return {"ok": True, "message": "Owner and associated fleet cars deleted successfully"}


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
