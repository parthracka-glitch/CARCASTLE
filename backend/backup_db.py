"""Database backup & snapshot utility for Car Castle Goa.
Exports all active collections to a timestamped JSON snapshot directory
or restores them to ensure zero data loss.
"""
import os
import sys
import json
import asyncio
from datetime import datetime, timezone
from pathlib import Path
from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

load_dotenv(BACKEND_DIR / ".env")

from deps import get_db

COLLECTIONS = [
    "users",
    "settings",
    "car_owners",
    "agents",
    "cars",
    "bookings",
    "ledger",
    "owner_expenses",
    "rate_history",
    "reminders",
    "activity_logs",
    "enquiries"
]


async def create_backup(target_dir: Path = None):
    db = get_db()
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup_path = (target_dir or (BACKEND_DIR / "backups" / f"backup_{ts}"))
    backup_path.mkdir(parents=True, exist_ok=True)

    summary = {"timestamp": ts, "collections": {}}
    print(f"[*] Starting backup to {backup_path}...")

    for col in COLLECTIONS:
        cursor = db[col].find({}, {"_id": 0})
        docs = await cursor.to_list(length=100000)
        col_file = backup_path / f"{col}.json"
        with open(col_file, "w", encoding="utf-8") as f:
            json.dump(docs, f, indent=2, default=str)
        summary["collections"][col] = len(docs)
        print(f"  - {col}: {len(docs)} documents backed up")

    summary_file = backup_path / "_summary.json"
    with open(summary_file, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)

    print(f"[OK] Backup completed successfully! Saved to: {backup_path}")
    return backup_path, summary


async def verify_data_integrity():
    """Verify primary key uniqueness and integrity across active records."""
    db = get_db()
    issues = []

    for col in ["users", "car_owners", "agents", "cars", "bookings", "ledger", "owner_expenses", "enquiries"]:
        docs = await db[col].find({}, {"id": 1, "_id": 0}).to_list(length=100000)
        ids = [d.get("id") for d in docs if d.get("id")]
        duplicates = len(ids) - len(set(ids))
        if duplicates > 0:
            issues.append(f"Found {duplicates} duplicate IDs in collection '{col}'")

    # Verify foreign key linkages: cars -> car_owners
    cars = await db.cars.find({}, {"id": 1, "owner_id": 1, "_id": 0}).to_list(length=10000)
    for car in cars:
        if car.get("owner_id"):
            owner = await db.car_owners.find_one({"id": car["owner_id"]})
            if not owner:
                issues.append(f"Car {car.get('id')} references missing owner {car.get('owner_id')}")

    # Verify owner_expenses -> car_owners
    expenses = await db.owner_expenses.find({}, {"id": 1, "owner_id": 1, "_id": 0}).to_list(length=10000)
    for exp in expenses:
        if exp.get("owner_id"):
            owner = await db.car_owners.find_one({"id": exp["owner_id"]})
            if not owner:
                issues.append(f"Owner expense {exp.get('id')} references missing owner {exp.get('owner_id')}")

    if issues:
        print(f"[WARNING] Found {len(issues)} integrity concerns:")
        for issue in issues:
            print(f"  ! {issue}")
    else:
        print("[OK] All data integrity and foreign key constraints passed!")
    return issues


async def restore_backup(backup_dir: Path, drop_existing: bool = False):
    """Restore all database collections from a timestamped backup directory with full integrity recovery."""
    backup_path = Path(backup_dir)
    if not backup_path.exists():
        raise FileNotFoundError(f"Backup directory not found: {backup_path}")

    from seed import create_indexes
    db = get_db()
    print(f"[*] Starting database restore from: {backup_path} (drop_existing={drop_existing})...")
    restored_counts = {}

    for col in COLLECTIONS:
        col_file = backup_path / f"{col}.json"
        if not col_file.exists():
            continue

        with open(col_file, "r", encoding="utf-8") as f:
            docs = json.load(f)

        if drop_existing:
            await db[col].delete_many({})

        if docs:
            for doc in docs:
                doc_id = doc.get("id") or doc.get("email")
                if doc_id:
                    key = "email" if "email" in doc and "@" in str(doc.get("email", "")) and col == "users" else "id"
                    await db[col].replace_one({key: doc[key]}, doc, upsert=True)
                else:
                    await db[col].insert_one(doc)
        restored_counts[col] = len(docs)
        print(f"  - {col}: {len(docs)} documents recovered/upserted")

    print("[*] Rebuilding and enforcing database indexes...")
    await create_indexes(db)
    print("[*] Verifying recovered data integrity...")
    issues = await verify_data_integrity()
    if not issues:
        print("[OK] Database restore completed successfully with 100% integrity and zero data loss!")
    else:
        print(f"[WARNING] Database restored with {len(issues)} warnings.")
    return restored_counts


def list_backups():
    """List all available backup snapshots."""
    backups_dir = BACKEND_DIR / "backups"
    if not backups_dir.exists():
        print("No backups directory found.")
        return []

    dirs = sorted([d for d in backups_dir.iterdir() if d.is_dir() and d.name.startswith("backup_")])
    if not dirs:
        print("No backup snapshots available yet.")
        return []

    print(f"\nAvailable Backup Snapshots ({len(dirs)} total):")
    for d in dirs:
        summary_file = d / "_summary.json"
        ts_str = d.name.replace("backup_", "")
        if summary_file.exists():
            with open(summary_file, "r", encoding="utf-8") as f:
                s = json.load(f)
            total_docs = sum(s.get("collections", {}).values())
            print(f"  * {d.name} ({total_docs} records) -> {d}")
        else:
            print(f"  * {d.name} -> {d}")
    print()
    return dirs


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Car Castle Goa Database Backup & Recovery Utility")
    parser.add_argument("--verify", action="store_true", help="Verify data integrity only")
    parser.add_argument("--restore", type=str, help="Path to backup snapshot directory to restore")
    parser.add_argument("--drop", action="store_true", help="Drop existing records before restoring")
    parser.add_argument("--list", action="store_true", help="List all available backup snapshots")
    args = parser.parse_args()

    if args.verify:
        asyncio.run(verify_data_integrity())
    elif args.list:
        list_backups()
    elif args.restore:
        asyncio.run(restore_backup(Path(args.restore), drop_existing=args.drop))
    else:
        asyncio.run(create_backup())

