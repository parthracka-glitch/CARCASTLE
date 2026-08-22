"""FastAPI dependencies: auth, roles, db, activity logging."""
import os
import logging
from datetime import datetime, timezone
from fastapi import Request, HTTPException, Depends
import jwt as pyjwt
import certifi
from motor.motor_asyncio import AsyncIOMotorClient

from auth import decode_token

log = logging.getLogger("carcastle")

_client = None
_db = None


def get_db():
    global _client, _db
    if _db is None:
        mongo_url = os.environ.get("MONGO_URL")
        db_name = os.environ.get("DB_NAME", "car_castle_goa")
        
        if mongo_url:
            try:
                _client = AsyncIOMotorClient(
                    mongo_url,
                    tlsCAFile=certifi.where(),
                    tlsAllowInvalidCertificates=True,
                    serverSelectionTimeoutMS=3000
                )
                _db = _client[db_name]
            except Exception as e:
                log.warning(f"Could not connect to MongoDB ({e}). Falling back to in-memory store.")
                from mongomock_motor import AsyncMongoMockClient
                _db = AsyncMongoMockClient()[db_name]
        else:
            log.warning("MONGO_URL not configured. Using in-memory database.")
            from mongomock_motor import AsyncMongoMockClient
            _db = AsyncMongoMockClient()[db_name]
            
    return _db


def set_db(new_db):
    global _db
    _db = new_db


async def get_current_user(request: Request):
    token = request.cookies.get("access_token")
    if not token:
        header = request.headers.get("Authorization", "")
        if header.startswith("Bearer "):
            token = header[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except pyjwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

    db = get_db()
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def require_super_admin(user: dict = Depends(get_current_user)):
    if user.get("role") != "super_admin":
        raise HTTPException(status_code=403, detail="Super admin access required")
    return user


async def log_activity(db, user: dict, action: str, target_collection: str,
                       target_id: str = None, diff: dict = None):
    doc = {
        "id": __import__("uuid").uuid4().hex,
        "admin_id": user["id"],
        "admin_email": user["email"],
        "admin_name": user.get("name", ""),
        "action": action,
        "target_collection": target_collection,
        "target_id": target_id,
        "diff": diff or {},
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.activity_logs.insert_one(doc)
