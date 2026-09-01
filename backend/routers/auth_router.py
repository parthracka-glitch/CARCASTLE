import os
import asyncio
from fastapi import APIRouter, Response, Request, HTTPException, Depends
from datetime import datetime, timezone
from models import LoginIn
from auth import verify_password, create_access_token, create_refresh_token, decode_token
from deps import get_db, get_current_user, log_activity

router = APIRouter(prefix="/auth", tags=["auth"])

COOKIE_MAX_AGE = 60 * 60 * 24 * 30  # 30 days session


def _set_cookies(response: Response, access: str, refresh: str):
    env_secure = os.environ.get("SECURE_COOKIES", "").lower() in ["true", "1"]
    is_prod = os.environ.get("ENVIRONMENT", "").lower() in ["production", "prod"]
    use_secure = env_secure or is_prod
    samesite = "none" if use_secure else "lax"
    
    response.set_cookie(
        key="access_token",
        value=access,
        httponly=True,
        secure=use_secure,
        samesite=samesite,
        max_age=COOKIE_MAX_AGE,
        path="/"
    )
    response.set_cookie(
        key="refresh_token",
        value=refresh,
        httponly=True,
        secure=use_secure,
        samesite=samesite,
        max_age=COOKIE_MAX_AGE,
        path="/"
    )


@router.post("/login")
async def login(payload: LoginIn, response: Response):
    db = get_db()
    email = payload.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    is_valid = await asyncio.to_thread(verify_password, payload.password, user["password_hash"])
    if not is_valid:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    access = create_access_token(user["id"], user["email"], user["role"])
    refresh = create_refresh_token(user["id"])
    _set_cookies(response, access, refresh)

    await log_activity(db, user, "login", "users", user["id"], {})

    return {
        "id": user["id"],
        "email": user["email"],
        "name": user["name"],
        "role": user["role"],
        "access_token": access,
    }


@router.post("/logout")
async def logout(response: Response, user: dict = Depends(get_current_user)):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    db = get_db()
    await log_activity(db, user, "logout", "users", user["id"], {})
    return {"ok": True}


@router.get("/me")
async def me(user: dict = Depends(get_current_user)):
    return {
        "id": user["id"],
        "email": user["email"],
        "name": user["name"],
        "role": user["role"],
        "created_at": user.get("created_at"),
    }


@router.post("/refresh")
async def refresh(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if not token:
        try:
            body = await request.json()
            token = body.get("refresh_token")
        except Exception:
            token = None
            
    if not token:
        raise HTTPException(status_code=401, detail="Refresh token missing")

    try:
        payload = decode_token(token)
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=401, detail="Invalid token type")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")

    db = get_db()
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    new_access = create_access_token(user["id"], user["email"], user["role"])
    new_refresh = create_refresh_token(user["id"])
    _set_cookies(response, new_access, new_refresh)

    return {
        "access_token": new_access,
        "token_type": "bearer",
        "user": user,
    }

