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

from deps import get_db
from seed import seed, create_indexes, seed_demo_data
from routers.auth_router import router as auth_router
from routers.entities_router import router as entities_router
from routers.bookings_router import router as bookings_router, transfers_router
from routers.ledger_router import router as ledger_router, finance_router, settings_router
from routers.reports_router import router as activity_router, reports_router

logging.basicConfig(level=logging.INFO,
                    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
log = logging.getLogger("carcastle")

app = FastAPI(title="Car Castle Goa API", version="1.0.0")

api = APIRouter(prefix="/api")
api.include_router(auth_router)
api.include_router(entities_router)
api.include_router(bookings_router)
api.include_router(transfers_router)
api.include_router(ledger_router)
api.include_router(finance_router)
api.include_router(settings_router)
api.include_router(activity_router)
api.include_router(reports_router)

demo_router = APIRouter(prefix="/demo", tags=["demo"])

@demo_router.post("/seed")
async def api_seed_demo():
    db = get_db()
    res = await seed_demo_data(db)
    return {"message": "Demo data seeded successfully", "details": res}

@demo_router.post("/reset")
async def api_reset_demo():
    db = get_db()
    res = await seed_demo_data(db)
    return {"message": "Demo data reset successfully", "details": res}

api.include_router(demo_router)


@api.get("/")
async def root():
    return {"service": "Car Castle Goa", "status": "ok"}


app.include_router(api)

# CORS — permissive for internal preview environment
cors_origins = os.environ.get("CORS_ORIGINS", "*")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in cors_origins.split(",")] if cors_origins != "*" else ["*"],
    allow_credentials=True if cors_origins != "*" else False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)


@app.on_event("startup")
async def _startup():
    from deps import set_db
    db = get_db()
    try:
        await db.command("ping")
    except Exception as e:
        log.warning(f"MongoDB Atlas connection failed ({e}). Falling back to in-memory AsyncMongoMockClient.")
        from mongomock_motor import AsyncMongoMockClient
        db = AsyncMongoMockClient()[os.environ.get("DB_NAME", "car_castle_goa")]
        set_db(db)

    await create_indexes(db)
    await seed(db)
    log.info("Startup complete — admins seeded, indexes ensured.")

