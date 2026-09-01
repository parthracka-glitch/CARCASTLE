"""Database cleanup utility for Car Castle Goa.
Wipes all demo/test data (bookings, cars, owners, agents, ledger, reminders, activity logs)
while preserving admin/operator accounts and default settings.
"""
import asyncio
import os
import certifi
from pathlib import Path
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv(Path(__file__).parent / ".env")

from seed import seed_users_and_settings, create_indexes

async def clean_database():
    mongo_url = os.environ.get("MONGO_URL", "").strip()
    db_name = os.environ.get("DB_NAME", "car_castle_goa").strip()
    
    if not mongo_url:
        print("ERROR: MONGO_URL not found in environment.")
        return

    print(f"Connecting to MongoDB Atlas (Database: {db_name})...")
    client = AsyncIOMotorClient(
        mongo_url,
        tlsCAFile=certifi.where(),
        tlsAllowInvalidCertificates=True,
        serverSelectionTimeoutMS=10000
    )
    db = client[db_name]

    # Test ping
    await db.command("ping")
    print("[OK] Successfully connected to MongoDB Atlas.")

    collections_to_clear = [
        "bookings",
        "cars",
        "car_owners",
        "agents",
        "ledger",
        "rate_history",
        "reminders",
        "activity_logs",
        "enquiries",
        "owner_expenses"
    ]

    print("\nCleaning test/demo data collections...")
    for col_name in collections_to_clear:
        res = await db[col_name].delete_many({})
        print(f"  - Cleared '{col_name}': {res.deleted_count} documents deleted.")

    print("\nEnsuring admin accounts, settings, and indexes...")
    await seed_users_and_settings(db)
    await create_indexes(db)
    print("[OK] Admin accounts, settings, and indexes verified.")

    # Print summary counts
    print("\n=== Current Database Status ===")
    for col_name in collections_to_clear + ["users", "settings"]:
        count = await db[col_name].count_documents({})
        print(f"  * {col_name:15}: {count} records")

    print("\n[OK] Database is clean, reset, and ready for admin use!")

if __name__ == "__main__":
    asyncio.run(clean_database())
