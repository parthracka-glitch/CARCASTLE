"""Sample data seed script — run manually to demo all flows.

Usage:  cd /app/backend && python seed_demo.py
"""
import asyncio
import os
import random
from datetime import datetime, timezone, timedelta
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent / ".env")

from motor.motor_asyncio import AsyncIOMotorClient
from models import new_id, now_iso


async def main():
    raw_url = os.environ.get("MONGO_URL", "")
    client = AsyncIOMotorClient(raw_url.strip())
    db = client[os.environ.get("DB_NAME", "car_castle_goa").strip()]

    # Wipe demo data (not users)
    for col in ["car_owners", "agents", "cars", "bookings", "ledger",
                "rate_history", "reminders", "activity_logs"]:
        await db[col].delete_many({})
    print("Cleared demo collections.")

    # Owners
    owners = []
    for name, contact in [
        ("Ravi Naik", "+91 98220 11111"),
        ("Sanjay Kamat", "+91 98220 22222"),
        ("Priya Fernandes", "+91 98220 33333"),
    ]:
        o = {"id": new_id(), "name": name, "contact": contact, "notes": "",
             "total_owed": 0.0, "total_paid": 0.0, "created_at": now_iso()}
        owners.append(o)
        await db.car_owners.insert_one(o)

    # Agents
    agents = []
    for name, contact in [
        ("Anwar Transfers", "+91 98220 44444"),
        ("Goa Airport Cabs", "+91 98220 55555"),
    ]:
        a = {"id": new_id(), "name": name, "contact": contact, "notes": "",
             "total_owed": 0.0, "total_paid": 0.0, "created_at": now_iso()}
        agents.append(a)
        await db.agents.insert_one(a)

    # Cars
    cars = []
    car_specs = [
        ("GA-01-AB-1234", "Maruti Swift", 800),
        ("GA-01-AB-5678", "Hyundai i20", 1000),
        ("GA-02-CD-1122", "Honda City", 1500),
        ("GA-03-EF-9988", "Mahindra Thar", 2500),
        ("GA-05-GH-7766", "Toyota Innova", 2800),
    ]
    for i, (reg, model, cost) in enumerate(car_specs):
        c = {"id": new_id(), "registration_no": reg, "model": model,
             "owner_id": owners[i % len(owners)]["id"],
             "default_cost_rate": cost, "created_at": now_iso()}
        cars.append(c)
        await db.cars.insert_one(c)

    # Users (super_admin for created_by)
    from seed import seed
    await seed(db)
    super_admin = await db.users.find_one({"role": "super_admin"})

    # Bookings — spread across the past 90 days
    customers = [
        ("Amit Sharma", "+91 90000 11111"),
        ("Neha Gupta", "+91 90000 22222"),
        ("Rohan Mehta", "+91 90000 33333"),
        ("Kavya Iyer", "+91 90000 44444"),
        ("Arjun Rao", "+91 90000 55555"),
        ("Diya Kapoor", "+91 90000 66666"),
        ("Vikram Bhat", "+91 90000 77777"),
        ("Meera Joshi", "+91 90000 88888"),
        ("Sameer Khan", "+91 90000 99999"),
        ("Ananya Singh", "+91 90000 10000"),
    ]
    random.seed(42)
    now = datetime.now(timezone.utc)
    for i in range(18):
        car = random.choice(cars)
        cust = random.choice(customers)
        start = now - timedelta(days=random.randint(0, 90))
        days = random.randint(2, 7)
        end = start + timedelta(days=days)
        cost_rate = car["default_cost_rate"] * days
        markup = random.uniform(1.35, 1.75)
        customer_rate = round(cost_rate * markup / 50) * 50  # round to nearest 50
        transfer = random.choice(["none", "none", "airport_pickup", "airport_drop"])
        agent_id = None
        agent_fee = 0
        transfer_status = "none"
        if transfer != "none":
            if random.random() < 0.7:
                agent_id = random.choice(agents)["id"]
                agent_fee = random.choice([500, 700, 900, 1200])
            transfer_status = random.choice(["scheduled", "en_route", "completed"])
        margin = customer_rate - cost_rate
        net_profit = margin - agent_fee
        status = random.choice(["reserved", "car_received", "with_customer", "returned"])
        booking = {
            "id": new_id(),
            "customer_name": cust[0], "customer_contact": cust[1],
            "customer_id_proof": "AADH-XXXX", "car_id": car["id"],
            "owner_id": car["owner_id"],
            "start_date": start.isoformat()[:10],
            "end_date": end.isoformat()[:10],
            "pickup_location": random.choice(["Panjim Hotel", "Calangute Beach", "Goa Airport"]),
            "drop_location": random.choice(["Goa Airport", "Panjim", "Baga"]),
            "cost_rate": cost_rate, "customer_rate": customer_rate,
            "margin": margin, "net_profit": net_profit,
            "status": status,
            "transfer_type": transfer,
            "transfer_status": transfer_status,
            "flight_time": "" if transfer == "none" else "18:30",
            "transfer_pickup_point": "" if transfer == "none" else "Terminal 1, Goa Airport",
            "assigned_agent_id": agent_id, "agent_fee": agent_fee,
            "notes": "",
            "created_by": super_admin["id"],
            "created_by_email": super_admin["email"],
            "created_at": start.isoformat(),
            "updated_at": start.isoformat(),
        }
        await db.bookings.insert_one(booking)

        # Ledger entry for owner
        paid = 0
        if random.random() < 0.5:
            paid = cost_rate  # some paid
            ledger_status = "paid"
        elif random.random() < 0.4:
            paid = cost_rate * 0.5
            ledger_status = "partial"
        else:
            ledger_status = "pending"

        owner_ledger = {
            "id": new_id(), "entity_type": "owner", "entity_id": car["owner_id"],
            "booking_id": booking["id"], "amount": cost_rate, "amount_paid": paid,
            "status": ledger_status,
            "description": f"Booking {booking['id'][:8]} — {cust[0]}",
            "due_date": booking["end_date"], "reminders_sent": 0,
            "last_reminder_at": None, "payments": [],
            "created_at": booking["created_at"], "updated_at": booking["created_at"],
        }
        if paid > 0:
            owner_ledger["payments"] = [{"amount": paid, "note": "Cash", "at": booking["created_at"],
                                          "by": super_admin["email"]}]
        await db.ledger.insert_one(owner_ledger)
        await db.car_owners.update_one({"id": car["owner_id"]},
                                       {"$inc": {"total_owed": cost_rate, "total_paid": paid}})

        # Agent ledger
        if agent_id and agent_fee > 0:
            apaid = 0
            if random.random() < 0.4:
                apaid = agent_fee
                ags = "paid"
            elif random.random() < 0.3:
                apaid = agent_fee * 0.5
                ags = "partial"
            else:
                ags = "pending"
            await db.ledger.insert_one({
                "id": new_id(), "entity_type": "agent", "entity_id": agent_id,
                "booking_id": booking["id"], "amount": agent_fee, "amount_paid": apaid,
                "status": ags, "description": f"Transfer for {booking['id'][:8]}",
                "due_date": booking["end_date"], "reminders_sent": 0,
                "last_reminder_at": None,
                "payments": [{"amount": apaid, "note": "UPI", "at": booking["created_at"],
                              "by": super_admin["email"]}] if apaid > 0 else [],
                "created_at": booking["created_at"], "updated_at": booking["created_at"],
            })
            await db.agents.update_one({"id": agent_id},
                                       {"$inc": {"total_owed": agent_fee, "total_paid": apaid}})

    # A rate change event for demo
    await db.rate_history.insert_one({
        "id": new_id(), "entity_type": "car", "entity_id": cars[0]["id"],
        "old_rate": 750, "new_rate": 800,
        "effective_date": (now - timedelta(days=45)).isoformat(),
        "changed_by": super_admin["email"], "created_at": (now - timedelta(days=45)).isoformat(),
    })

    print(f"Seeded {len(owners)} owners, {len(agents)} agents, {len(cars)} cars, 18 bookings.")


if __name__ == "__main__":
    asyncio.run(main())
