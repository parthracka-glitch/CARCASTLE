"""Enquiries Router — Car Castle Goa enquiry tracking & analytics."""
import re
import math
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query

from deps import get_db, get_current_user, log_activity
from models import (
    Enquiry,
    EnquiryCreate,
    EnquiryUpdate,
    new_id,
    now_iso,
)

router = APIRouter(prefix="/enquiries", tags=["enquiries"])


def _date_filter(from_date: Optional[str], to_date: Optional[str]) -> Dict[str, Any]:
    filter_dict: Dict[str, Any] = {}
    if from_date or to_date:
        date_cond: Dict[str, Any] = {}
        if from_date:
            date_cond["$gte"] = f"{from_date}T00:00:00" if "T" not in from_date else from_date
        if to_date:
            date_cond["$lte"] = f"{to_date}T23:59:59.999Z" if "T" not in to_date else to_date
        filter_dict["enquiry_date"] = date_cond
    return filter_dict


@router.get("")
@router.get("/")
async def list_enquiries(
    page: int = Query(1, ge=1),
    limit: int = Query(25, ge=1, le=500),
    from_date: Optional[str] = Query(None, alias="from"),
    to_date: Optional[str] = Query(None, alias="to"),
    city: Optional[str] = None,
    car: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
    user: dict = Depends(get_current_user),
):
    """List enquiries with pagination, filters, and debounced text search."""
    db = get_db()
    query: Dict[str, Any] = {}

    # Date range filter
    if from_date or to_date:
        query.update(_date_filter(from_date, to_date))

    if city and city.strip():
        query["city"] = {"$regex": f"^{re.escape(city.strip())}$", "$options": "i"}

    if status and status.strip() and status != "all":
        query["status"] = status.strip()

    if car and car.strip():
        query["$or"] = [
            {"car_id": car.strip()},
            {"car_model": {"$regex": re.escape(car.strip()), "$options": "i"}},
        ]

    if search and search.strip():
        term = re.escape(search.strip())
        regex = {"$regex": term, "$options": "i"}
        search_or = [
            {"name": regex},
            {"phone": regex},
            {"email": regex},
            {"city": regex},
            {"state": regex},
            {"car_model": regex},
            {"notes": regex},
        ]
        if "$or" in query:
            query = {"$and": [{"$or": query["$or"]}, {"$or": search_or}]}
        else:
            query["$or"] = search_or

    skip = (page - 1) * limit
    total = await db.enquiries.count_documents(query)
    cursor = db.enquiries.find(query, {"_id": 0}).sort("enquiry_date", -1).skip(skip).limit(limit)
    enquiries = await cursor.to_list(length=limit)

    pages = math.ceil(total / limit) if limit > 0 else 1

    return {
        "enquiries": enquiries,
        "total": total,
        "page": page,
        "pages": pages,
    }


@router.get("/analytics/summary")
async def get_analytics_summary(
    from_date: Optional[str] = Query(None, alias="from"),
    to_date: Optional[str] = Query(None, alias="to"),
    user: dict = Depends(get_current_user),
):
    """Return high-level summary KPIs (total, converted, conversion rate, top city, top car)."""
    db = get_db()
    match_stage = _date_filter(from_date, to_date)
    pipeline = []
    if match_stage:
        pipeline.append({"$match": match_stage})

    pipeline.append({
        "$facet": {
            "total": [{"$count": "count"}],
            "byStatus": [{"$group": {"_id": "$status", "count": {"$sum": 1}}}],
            "topCar": [
                {"$match": {"car_model": {"$exists": True, "$ne": ""}}},
                {"$group": {"_id": "$car_model", "count": {"$sum": 1}}},
                {"$sort": {"count": -1}},
                {"$limit": 1},
            ],
            "topCity": [
                {"$match": {"city": {"$exists": True, "$ne": ""}}},
                {"$group": {"_id": "$city", "count": {"$sum": 1}}},
                {"$sort": {"count": -1}},
                {"$limit": 1},
            ],
        }
    })

    results = await db.enquiries.aggregate(pipeline).to_list(1)
    result = results[0] if results else {"total": [], "byStatus": [], "topCar": [], "topCity": []}

    total = result["total"][0]["count"] if result.get("total") else 0
    by_status_list = result.get("byStatus", [])
    by_status = {s["_id"]: s["count"] for s in by_status_list if s.get("_id")}

    # Ensure all statuses exist
    for st in ["new", "contacted", "converted", "lost"]:
        if st not in by_status:
            by_status[st] = 0

    converted = by_status.get("converted", 0)
    conversion_rate = round((converted / total * 100), 1) if total > 0 else 0.0

    top_car = None
    if result.get("topCar") and len(result["topCar"]) > 0:
        top_car = {
            "modelName": result["topCar"][0]["_id"],
            "count": result["topCar"][0]["count"],
        }

    top_city = None
    if result.get("topCity") and len(result["topCity"]) > 0:
        top_city = {
            "city": result["topCity"][0]["_id"],
            "count": result["topCity"][0]["count"],
        }

    return {
        "total": total,
        "converted": converted,
        "conversionRate": conversion_rate,
        "topCar": top_car,
        "topCity": top_city,
        "byStatus": by_status,
    }


@router.get("/analytics/by-location")
async def get_analytics_by_location(
    from_date: Optional[str] = Query(None, alias="from"),
    to_date: Optional[str] = Query(None, alias="to"),
    user: dict = Depends(get_current_user),
):
    """Aggregate enquiries grouped by city & state."""
    db = get_db()
    match_stage = _date_filter(from_date, to_date)
    pipeline = []
    if match_stage:
        pipeline.append({"$match": match_stage})

    pipeline.extend([
        {"$match": {"city": {"$exists": True, "$ne": ""}}},
        {"$group": {"_id": {"city": "$city", "state": "$state"}, "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 50},
        {"$project": {"_id": 0, "city": "$_id.city", "state": "$_id.state", "count": 1}},
    ])

    return await db.enquiries.aggregate(pipeline).to_list(50)


@router.get("/analytics/by-car")
async def get_analytics_by_car(
    from_date: Optional[str] = Query(None, alias="from"),
    to_date: Optional[str] = Query(None, alias="to"),
    user: dict = Depends(get_current_user),
):
    """Aggregate enquiries grouped by car model."""
    db = get_db()
    match_stage = _date_filter(from_date, to_date)
    pipeline = []
    if match_stage:
        pipeline.append({"$match": match_stage})

    pipeline.extend([
        {"$match": {"car_model": {"$exists": True, "$ne": ""}}},
        {"$group": {"_id": "$car_model", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 50},
        {"$project": {"_id": 0, "modelName": "$_id", "count": 1}},
    ])

    return await db.enquiries.aggregate(pipeline).to_list(50)


@router.post("", status_code=201)
@router.post("/", status_code=201)
async def create_enquiry(
    body: EnquiryCreate,
    user: dict = Depends(get_current_user),
):
    """Log a new customer enquiry."""
    db = get_db()
    if not body.name.strip() or not body.phone.strip() or not body.city.strip() or not body.state.strip():
        raise HTTPException(status_code=400, detail="Name, phone, city, and state are required")

    phone_clean = re.sub(r"\D", "", body.phone)
    if len(phone_clean) != 10:
        raise HTTPException(status_code=400, detail="Phone must be exactly 10 digits")

    car_model = (body.car_model or "").strip()
    if body.car_id and not car_model:
        car_doc = await db.cars.find_one({"id": body.car_id})
        if car_doc:
            car_model = car_doc.get("model", "")

    doc = {
        "id": new_id(),
        "name": body.name.strip(),
        "phone": phone_clean,
        "email": (body.email or "").strip().lower(),
        "city": body.city.strip(),
        "state": body.state.strip(),
        "car_id": body.car_id,
        "car_model": car_model,
        "enquiry_date": body.enquiry_date or now_iso(),
        "notes": (body.notes or "").strip(),
        "status": body.status or "new",
        "created_by": user.get("name", user.get("email", "")),
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }

    await db.enquiries.insert_one(doc)
    await log_activity(db, user, "create_enquiry", "enquiries", doc["id"], {"name": doc["name"], "phone": doc["phone"]})

    # Exclude MongoDB _id from response
    doc.pop("_id", None)
    return doc


@router.get("/{enquiry_id}")
async def get_enquiry(
    enquiry_id: str,
    user: dict = Depends(get_current_user),
):
    """Retrieve single enquiry by id."""
    db = get_db()
    doc = await db.enquiries.find_one({"id": enquiry_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Enquiry not found")
    return doc


@router.put("/{enquiry_id}")
async def update_enquiry(
    enquiry_id: str,
    body: EnquiryUpdate,
    user: dict = Depends(get_current_user),
):
    """Update enquiry fields or status."""
    db = get_db()
    existing = await db.enquiries.find_one({"id": enquiry_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Enquiry not found")

    updates: Dict[str, Any] = {}
    if body.name is not None:
        updates["name"] = body.name.strip()
    if body.phone is not None:
        phone_clean = re.sub(r"\D", "", body.phone)
        if len(phone_clean) != 10:
            raise HTTPException(status_code=400, detail="Phone must be exactly 10 digits")
        updates["phone"] = phone_clean
    if body.email is not None:
        updates["email"] = body.email.strip().lower()
    if body.city is not None:
        updates["city"] = body.city.strip()
    if body.state is not None:
        updates["state"] = body.state.strip()
    if body.car_id is not None:
        updates["car_id"] = body.car_id
    if body.car_model is not None:
        updates["car_model"] = body.car_model.strip()
    elif body.car_id is not None:
        car_doc = await db.cars.find_one({"id": body.car_id})
        if car_doc:
            updates["car_model"] = car_doc.get("model", "")
    if body.enquiry_date is not None:
        updates["enquiry_date"] = body.enquiry_date
    if body.notes is not None:
        updates["notes"] = body.notes.strip()
    if body.status is not None:
        updates["status"] = body.status

    if updates:
        updates["updated_at"] = now_iso()
        await db.enquiries.update_one({"id": enquiry_id}, {"$set": updates})
        await log_activity(db, user, "update_enquiry", "enquiries", enquiry_id, updates)

    updated = await db.enquiries.find_one({"id": enquiry_id}, {"_id": 0})
    return updated


@router.delete("/{enquiry_id}")
async def delete_enquiry(
    enquiry_id: str,
    user: dict = Depends(get_current_user),
):
    """Delete enquiry by id."""
    db = get_db()
    existing = await db.enquiries.find_one({"id": enquiry_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Enquiry not found")

    await db.enquiries.delete_one({"id": enquiry_id})
    await log_activity(db, user, "delete_enquiry", "enquiries", enquiry_id, {"name": existing.get("name")})
    return {"message": "Enquiry deleted successfully", "id": enquiry_id}
