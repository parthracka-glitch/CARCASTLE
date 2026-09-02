"""Car Castle Goa — main FastAPI server."""
import sys
from pathlib import Path
from dotenv import load_dotenv

# Ensure backend directory is always in sys.path regardless of execution root
BACKEND_DIR = Path(__file__).parent.resolve()
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

load_dotenv(BACKEND_DIR / ".env")

from fastapi import FastAPI, APIRouter
from starlette.middleware.cors import CORSMiddleware
import os
import logging

from deps import get_db, require_super_admin, check_db_health, log_activity
from seed import seed, create_indexes, seed_demo_data
from routers.auth_router import router as auth_router
from routers.entities_router import router as entities_router
from routers.bookings_router import router as bookings_router, transfers_router
from routers.ledger_router import router as ledger_router, finance_router, settings_router
from routers.reports_router import router as activity_router, reports_router
from routers.owner_expenses_router import router as owner_expenses_router
from routers.enquiries_router import router as enquiries_router
from fastapi import HTTPException, Depends

logging.basicConfig(level=logging.INFO,
                    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
log = logging.getLogger("carcastle")

app = FastAPI(title="Car Castle Goa API", version="1.0.0")

api = APIRouter(prefix="/api")
api.include_router(auth_router)
api.include_router(entities_router)
api.include_router(owner_expenses_router)
api.include_router(bookings_router)
api.include_router(transfers_router)
api.include_router(ledger_router)
api.include_router(finance_router)
api.include_router(settings_router)
api.include_router(activity_router)
api.include_router(reports_router)
api.include_router(enquiries_router)

demo_router = APIRouter(prefix="/demo", tags=["demo"])


def _check_demo_enabled():
    allowed = os.environ.get("ALLOW_DEMO_RESET", "false").strip().lower() in ["true", "1"]
    if not allowed:
        raise HTTPException(
            status_code=403,
            detail="Database reset and demo seeding is disabled to prevent accidental data loss. Set ALLOW_DEMO_RESET=true if intended."
        )


@demo_router.post("/seed")
async def api_seed_demo(admin: dict = Depends(require_super_admin)):
    _check_demo_enabled()
    db = get_db()
    res = await seed_demo_data(db)
    await log_activity(db, admin, "seed_demo", "all", None, {"details": res})
    return {"message": "Demo data seeded successfully", "details": res}


@demo_router.post("/reset")
async def api_reset_demo(admin: dict = Depends(require_super_admin)):
    _check_demo_enabled()
    db = get_db()
    res = await seed_demo_data(db)
    await log_activity(db, admin, "reset_demo", "all", None, {"details": res})
    return {"message": "Demo data reset successfully", "details": res}


api.include_router(demo_router)


@api.get("/")
@api.get("/health")
async def root():
    db_status = await check_db_health()
    return {
        "service": "Car Castle Goa API",
        "status": "ok" if db_status["connected"] else "degraded",
        "healthy": db_status["connected"],
        "database": db_status
    }


@app.get("/health")
@app.get("/")
async def root_health():
    db_status = await check_db_health()
    return {
        "service": "Car Castle Goa API",
        "status": "ok" if db_status["connected"] else "degraded",
        "healthy": db_status["connected"],
        "database": db_status
    }


app.include_router(api)

# CORS — permissive for Vercel, localhost, and custom origins with credentials
cors_origins = os.environ.get("CORS_ORIGINS", "")
origins_list = [o.strip() for o in cors_origins.split(",") if o.strip()]
if not origins_list or "*" in origins_list:
    origins_list = ["http://localhost:3000", "http://127.0.0.1:3000", "https://carcastle-dzcb.vercel.app"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins_list,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

from starlette.middleware.base import BaseHTTPMiddleware

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        if request.url.scheme == "https":
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response

app.add_middleware(SecurityHeadersMiddleware)



@app.on_event("startup")
async def _startup():
    from deps import set_db
    db_name = (os.environ.get("DB_NAME") or "car_castle_goa").strip()
    allow_fallback = os.environ.get("ALLOW_IN_MEMORY_FALLBACK", "false").strip().lower() in ["true", "1"]
    try:
        db = get_db()
        await db.command("ping")
        await create_indexes(db)
        await seed(db)
        log.info("Startup complete — MongoDB Atlas connected, indexes enforced, baseline records seeded.")
    except Exception as e:
        log.error(f"MongoDB Atlas initialization failed ({e}).")
        if allow_fallback:
            log.warning("Falling back to in-memory AsyncMongoMockClient because ALLOW_IN_MEMORY_FALLBACK=true.")
            from mongomock_motor import AsyncMongoMockClient
            db = AsyncMongoMockClient()[db_name]
            set_db(db)
            try:
                await create_indexes(db)
                await seed(db)
            except Exception as mock_err:
                log.error(f"Error seeding fallback DB: {mock_err}")
        else:
            log.critical("FATAL: MongoDB Atlas unavailable and in-memory fallback is disabled to protect against data loss.")
            raise


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("server:app", host="0.0.0.0", port=port)


