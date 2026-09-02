"""Security & Database Hardening Verification Test Suite."""
import os
import sys
import asyncio
import pytest
from pathlib import Path
import httpx

BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from server import app
from deps import get_db, check_db_health


def test_security_demo_reset_unauthenticated_blocked():
    """Verify that unauthenticated callers cannot trigger demo resets (anti-data-loss)."""
    async def run():
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.post("/api/demo/reset")
            assert res.status_code == 401, f"Expected 401 Unauthorized, got {res.status_code}"
    asyncio.run(run())


def test_security_demo_reset_operator_forbidden():
    """Verify operator accounts are strictly forbidden from resetting the database."""
    async def run():
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            login_res = await client.post("/api/auth/login", json={
                "email": "operator1@carcastlegoa.com",
                "password": "operator123"
            })
            assert login_res.status_code == 200
            op_token = login_res.json()["access_token"]

            res = await client.post("/api/demo/reset", headers={"Authorization": f"Bearer {op_token}"})
            assert res.status_code == 403, f"Expected 403 Forbidden for operator, got {res.status_code}"
    asyncio.run(run())


def test_security_demo_reset_flag_protection():
    """Verify that even super admin is blocked when ALLOW_DEMO_RESET is false/unset."""
    async def run():
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            login_res = await client.post("/api/auth/login", json={
                "email": "admin@carcastlegoa.com",
                "password": "admin123"
            })
            assert login_res.status_code == 200
            admin_token = login_res.json()["access_token"]

            # Ensure env flag is disabled
            os.environ["ALLOW_DEMO_RESET"] = "false"
            res = await client.post("/api/demo/reset", headers={"Authorization": f"Bearer {admin_token}"})
            assert res.status_code == 403, f"Expected 403 Forbidden when ALLOW_DEMO_RESET=false, got {res.status_code}"
            assert "disabled to prevent accidental data loss" in res.json()["detail"]
    asyncio.run(run())


def test_security_headers():
    """Verify all HTTP responses include critical security headers."""
    async def run():
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.get("/api/health")
            assert res.status_code == 200
            assert res.headers.get("X-Content-Type-Options") == "nosniff"
            assert res.headers.get("X-Frame-Options") == "DENY"
            assert res.headers.get("Referrer-Policy") == "strict-origin-when-cross-origin"
    asyncio.run(run())


def test_database_health_endpoint():
    """Verify /api/health reports live database status."""
    async def run():
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.get("/api/health")
            assert res.status_code == 200
            body = res.json()
            assert body["healthy"] is True
            assert body["status"] == "ok"
            assert "database" in body
            assert body["database"]["connected"] is True
            assert body["database"]["latency_ms"] >= 0
    asyncio.run(run())


def test_database_connection_pool_and_indexes():
    """Verify database indexes are present across all primary collections."""
    async def run():
        db = get_db()
        health = await check_db_health()
        assert health["connected"] is True

        # Check that owner_expenses has indexes
        oe_indexes = await db.owner_expenses.index_information()
        assert "owner_id_1" in oe_indexes
        assert "is_settled_1" in oe_indexes

        # Check bookings indexes
        b_indexes = await db.bookings.index_information()
        assert "car_id_1" in b_indexes
        assert "status_1" in b_indexes
    asyncio.run(run())


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
