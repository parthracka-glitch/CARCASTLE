"""FastAPI dependencies: auth, roles, db, activity logging."""
import os
import sys
import asyncio
import logging
from datetime import datetime, timezone
from pathlib import Path
from dotenv import load_dotenv
from fastapi import Request, HTTPException, Depends
import jwt as pyjwt
import certifi
from motor.motor_asyncio import AsyncIOMotorClient

BACKEND_DIR = Path(__file__).resolve().parent
load_dotenv(BACKEND_DIR / ".env")

from auth import decode_token

log = logging.getLogger("carcastle")

_client = None
_db = None
_client_loop = None


def get_db():
    global _client, _db, _client_loop
    try:
        current_loop = asyncio.get_running_loop()
    except RuntimeError:
        current_loop = None

    needs_new_client = (
        _db is None or
        _client is None or
        (_client_loop is not None and _client_loop.is_closed()) or
        (current_loop is not None and _client_loop is not None and _client_loop != current_loop)
    )

    if needs_new_client:
        if _client is not None:
            try:
                _client.close()
            except Exception:
                pass
        _client_loop = current_loop
        raw_mongo_url = os.environ.get("MONGO_URL")
        mongo_url = raw_mongo_url.strip() if raw_mongo_url else None
        db_name = (os.environ.get("DB_NAME") or "car_castle_goa").strip()
        allow_fallback = os.environ.get("ALLOW_IN_MEMORY_FALLBACK", "false").strip().lower() in ["true", "1"]
        allow_invalid_tls = os.environ.get("MONGO_TLS_ALLOW_INVALID", "false").strip().lower() in ["true", "1"]
        
        if mongo_url:
            try:
                # Production-hardened MongoDB Motor client options:
                # - TLS verified via certifi CA bundle
                # - Connection pooling: 5 min, 50 max
                # - Resilient timeouts and atomic write retries
                # - Majority write concern to prevent split-brain data loss
                _client = AsyncIOMotorClient(
                    mongo_url,
                    tlsCAFile=certifi.where(),
                    tlsAllowInvalidCertificates=allow_invalid_tls,
                    serverSelectionTimeoutMS=10000,
                    connectTimeoutMS=10000,
                    socketTimeoutMS=45000,
                    maxPoolSize=50,
                    minPoolSize=5,
                    maxIdleTimeMS=45000,
                    waitQueueTimeoutMS=10000,
                    retryWrites=True,
                    retryReads=True,
                    w="majority",
                    wtimeoutMS=5000
                )
                _db = _client[db_name]
            except Exception as e:
                log.error(f"Could not connect to MongoDB Atlas ({e}).")
                if allow_fallback:
                    log.warning("Falling back to in-memory store because ALLOW_IN_MEMORY_FALLBACK=true.")
                    from mongomock_motor import AsyncMongoMockClient
                    _db = AsyncMongoMockClient()[db_name]
                else:
                    raise RuntimeError(f"Database connection failed and in-memory fallback is disabled: {e}")
        else:
            if allow_fallback:
                log.warning("MONGO_URL not configured. Using in-memory database.")
                from mongomock_motor import AsyncMongoMockClient
                _db = AsyncMongoMockClient()[db_name]
            else:
                raise RuntimeError("MONGO_URL not configured and in-memory fallback is disabled.")
            
    return _db


def get_client():
    global _client
    return _client


async def check_db_health():
    """Verify live connectivity, response latency, and storage mode."""
    db = get_db()
    is_mock = "AsyncMongoMockClient" in str(type(db.client)) or "mock" in str(type(db.client)).lower()
    try:
        start_t = datetime.now(timezone.utc)
        await db.command("ping")
        latency_ms = round((datetime.now(timezone.utc) - start_t).total_seconds() * 1000, 2)
        return {
            "status": "healthy",
            "connected": True,
            "is_mock": is_mock,
            "latency_ms": latency_ms,
            "database_name": db.name
        }
    except Exception as err:
        return {
            "status": "unhealthy",
            "connected": False,
            "is_mock": is_mock,
            "error": str(err),
            "database_name": getattr(db, "name", "unknown")
        }


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
