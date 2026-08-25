import asyncio
from fastapi import APIRouter, Response, HTTPException, Depends
from datetime import datetime, timezone
from models import LoginIn
from auth import verify_password, create_access_token, create_refresh_token, decode_token
from deps import get_db, get_current_user, log_activity

router = APIRouter(prefix="/auth", tags=["auth"])

COOKIE_MAX_AGE = 60 * 60 * 24 * 30  # 30 days session


def _set_cookies(response: Response, access: str, refresh: str):
    response.set_cookie(key="access_token", value=access, httponly=True,
                        secure=False, samesite="lax", max_age=COOKIE_MAX_AGE, path="/")
    response.set_cookie(key="refresh_token", value=refresh, httponly=True,
                        secure=False, samesite="lax", max_age=COOKIE_MAX_AGE, path="/")


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
        "access_token": access,  # also return so clients that can't use cookies still work
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
async def refresh(response: Response):
    from fastapi import Request
    # accept refresh via cookie only
    # deliberate keep simple: reload user via decoded sub
    raise HTTPException(status_code=501, detail="Not implemented")
