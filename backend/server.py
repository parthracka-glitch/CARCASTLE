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
from routers.owner_expenses_router import router as owner_expenses_router
from routers.enquiries_router import router as enquiries_router

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
@api.get("/health")
async def root():
    return {"service": "Car Castle Goa", "status": "ok", "healthy": True}


@app.get("/health")
@app.get("/")
async def root_health():
    return {"service": "Car Castle Goa", "status": "ok", "healthy": True}


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


@app.on_event("startup")
async def _startup():
    from deps import set_db
    db = get_db()
    db_name = (os.environ.get("DB_NAME") or "car_castle_goa").strip()
    try:
        await db.command("ping")
        await create_indexes(db)
        await seed(db)
    except Exception as e:
        log.warning(f"MongoDB Atlas initialization failed ({e}). Falling back to in-memory AsyncMongoMockClient.")
        from mongomock_motor import AsyncMongoMockClient
        db = AsyncMongoMockClient()[db_name]
        set_db(db)
        try:
            await create_indexes(db)
            await seed(db)
        except Exception as mock_err:
            log.error(f"Error seeding fallback DB: {mock_err}")
            
    log.info("Startup complete — admins seeded, indexes ensured.")


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("server:app", host="0.0.0.0", port=port)

