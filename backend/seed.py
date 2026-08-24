"""Idempotent seeding of admin accounts, baseline settings, and rich demo data for Car Castle Goa."""
import os
import random
from datetime import datetime, timezone, timedelta
from auth import hash_password, verify_password
from models import new_id, now_iso


async def seed_users_and_settings(db):
    """Seed default super admin and operator accounts plus settings."""
    accounts = [
        {
            "email": os.environ.get("SUPER_ADMIN_EMAIL", "admin@carcastlegoa.com").strip(),
            "password": os.environ.get("SUPER_ADMIN_PASSWORD", "admin123").strip(),
            "name": "Super Admin",
            "role": "super_admin",
        },
        {
            "email": os.environ.get("OP1_EMAIL", "operator1@carcastlegoa.com").strip(),
            "password": os.environ.get("OP1_PASSWORD", "operator123").strip(),
            "name": "Operator One",
            "role": "operator",
        },
        {
            "email": os.environ.get("OP2_EMAIL", "operator2@carcastlegoa.com").strip(),
            "password": os.environ.get("OP2_PASSWORD", "operator123").strip(),
            "name": "Operator Two",
            "role": "operator",
        },
    ]

    for acc in accounts:
        existing = await db.users.find_one({"email": acc["email"]})
        if existing is None:
            await db.users.insert_one({
                "id": new_id(),
                "email": acc["email"],
                "name": acc["name"],
                "role": acc["role"],
                "password_hash": hash_password(acc["password"]),
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
        else:
            if not verify_password(acc["password"], existing["password_hash"]):
                await db.users.update_one(
                    {"email": acc["email"]},
                    {"$set": {"password_hash": hash_password(acc["password"]),
                              "role": acc["role"], "name": acc["name"]}},
                )
            elif existing.get("role") != acc["role"]:
                await db.users.update_one(
                    {"email": acc["email"]},
                    {"$set": {"role": acc["role"]}},
                )

    # Seed settings singleton
    existing_settings = await db.settings.find_one({"id": "default"})
    if not existing_settings:
        savings = float(str(os.environ.get("SAVINGS_PERCENT", "10")).strip())
        await db.settings.insert_one({
            "id": "default",
            "savings_percent": savings,
            "reminder_template_owner": "Namaste {name}, this is a reminder that ₹{amount} is pending from Car Castle Goa. Please share settlement details when convenient.",
            "reminder_template_agent": "Hi {name}, ₹{amount} is pending against your recent transfer job. Please confirm payment receipt.",
            "reminder_template_transfer": "Transfer update — Booking {booking_id} is now {status}.",
            "reminder_interval_days": 3,
        })


async def seed_demo_data(db):
    """Seed comprehensive demo dataset across all entities, bookings, transfers, ledger, rate history, and logs."""
    await seed_users_and_settings(db)
    super_admin = await db.users.find_one({"role": "super_admin"})
    admin_id = super_admin["id"] if super_admin else new_id()
    admin_email = super_admin["email"] if super_admin else "admin@carcastlegoa.com"

    # Clear previous demo collections (preserve users)
    for col in ["car_owners", "agents", "cars", "bookings", "ledger", "rate_history", "reminders", "activity_logs"]:
        await db[col].delete_many({})

    # 1. Car Owners
    owners_data = [
        {"name": "Ravi Naik", "contact": "+91 98220 11111", "notes": "Panjim fleet partner (3 vehicles)"},
        {"name": "Sanjay Kamat", "contact": "+91 98220 22222", "notes": "Margao luxury & SUV specialist"},
        {"name": "Priya Fernandes", "contact": "+91 98220 33333", "notes": "Calangute sedan & premium hatchbacks"},
        {"name": "Anthony D'Souza", "contact": "+91 98220 77777", "notes": "Mapusa Thar 4x4 specialist"},
        {"name": "Rajesh Gaonkar", "contact": "+91 98220 88888", "notes": "Vasco EV & economy cars"},
    ]
    owners = []
    for od in owners_data:
        o = {
            "id": new_id(),
            "name": od["name"],
            "contact": od["contact"],
            "notes": od["notes"],
            "total_owed": 0.0,
            "total_paid": 0.0,
            "created_at": now_iso(),
        }
        owners.append(o)
        await db.car_owners.insert_one(o)

    # 2. Transfer Agents / Cab Partners
    agents_data = [
        {"name": "Anwar Transfers", "contact": "+91 98220 44444", "notes": "Airport specialist (MOPA & Dabolim)"},
        {"name": "Goa Airport Cabs", "contact": "+91 98220 55555", "notes": "24/7 airport link service"},
        {"name": "North Goa Express", "contact": "+91 98220 66666", "notes": "Calangute, Baga, Candolim coverage"},
        {"name": "South Star Cabs", "contact": "+91 98220 99999", "notes": "Margao, Colva, Palolem express"},
    ]
    agents = []
    for ad in agents_data:
        a = {
            "id": new_id(),
            "name": ad["name"],
            "contact": ad["contact"],
            "notes": ad["notes"],
            "total_owed": 0.0,
            "total_paid": 0.0,
            "created_at": now_iso(),
        }
        agents.append(a)
        await db.agents.insert_one(a)

    # 3. Cars Fleet
    car_specs = [
        {"reg": "GA-01-AB-1234", "model": "Maruti Swift", "owner_idx": 0, "cost": 800},
        {"reg": "GA-01-AB-5678", "model": "Hyundai i20", "owner_idx": 2, "cost": 1000},
        {"reg": "GA-02-CD-1122", "model": "Honda City", "owner_idx": 1, "cost": 1500},
        {"reg": "GA-03-EF-9988", "model": "Mahindra Thar 4x4", "owner_idx": 3, "cost": 2500},
        {"reg": "GA-05-GH-7766", "model": "Toyota Innova Crysta", "owner_idx": 0, "cost": 2800},
        {"reg": "GA-07-KL-4455", "model": "Kia Seltos", "owner_idx": 2, "cost": 2000},
        {"reg": "GA-08-MN-3322", "model": "Toyota Fortuner 4x4", "owner_idx": 1, "cost": 4500},
        {"reg": "GA-09-PQ-8899", "model": "Tata Nexon EV", "owner_idx": 4, "cost": 1600},
    ]
    cars = []
    for cs in car_specs:
        c = {
            "id": new_id(),
            "registration_no": cs["reg"],
            "model": cs["model"],
            "owner_id": owners[cs["owner_idx"]]["id"],
            "default_cost_rate": cs["cost"],
            "created_at": now_iso(),
        }
        cars.append(c)
        await db.cars.insert_one(c)

    # 4. Bookings & Transfers
    customers = [
        ("Amit Sharma", "+91 90000 11111", "AADH-4829"),
        ("Neha Gupta", "+91 90000 22222", "PAN-8831"),
        ("Rohan Mehta", "+91 90000 33333", "DL-9900"),
        ("Kavya Iyer", "+91 90000 44444", "PASS-1122"),
        ("Arjun Rao", "+91 90000 55555", "AADH-5544"),
        ("Diya Kapoor", "+91 90000 66666", "DL-7788"),
        ("Vikram Bhat", "+91 90000 77777", "PAN-3344"),
        ("Meera Joshi", "+91 90000 88888", "AADH-6677"),
        ("Sameer Khan", "+91 90000 99999", "DL-4433"),
        ("Ananya Singh", "+91 90000 10000", "PASS-8899"),
        ("Karan Verma", "+91 90000 10001", "AADH-2233"),
        ("Pooja Desai", "+91 90000 10002", "DL-6655"),
        ("Siddharth Roy", "+91 90000 10003", "PAN-7788"),
        ("Tanvi Nair", "+91 90000 10004", "AADH-9911"),
        ("Aditya Chopra", "+91 90000 10005", "DL-1100"),
    ]

    # Pre-defined realistic booking scenarios spanning past 90 days to upcoming 14 days
    now = datetime(2026, 8, 23, 12, 0, 0, tzinfo=timezone.utc)
    booking_templates = [
        # Past completed bookings (May, June, July, early Aug)
        {"day_offset": -80, "duration": 4, "car_idx": 0, "cust_idx": 0, "status": "returned", "transfer": "none", "pickup": "Panjim Depot", "drop": "Panjim Depot", "markup": 1.6},
        {"day_offset": -72, "duration": 5, "car_idx": 3, "cust_idx": 3, "status": "returned", "transfer": "airport_pickup", "pickup": "MOPA Airport", "drop": "Calangute", "flight": "14:30 AI-671", "terminal": "MOPA Terminal 1", "driver": "Anwar Sheikh", "driver_fee": 600, "driver_paid": 600, "agent_idx": 0, "markup": 1.55},
        {"day_offset": -65, "duration": 3, "car_idx": 1, "cust_idx": 1, "status": "returned", "transfer": "none", "pickup": "Candolim Beach", "drop": "Candolim Beach", "markup": 1.6},
        {"day_offset": -58, "duration": 6, "car_idx": 4, "cust_idx": 4, "status": "returned", "transfer": "airport_drop", "pickup": "Baga Resort", "drop": "Dabolim Airport", "flight": "18:45 6E-204", "terminal": "Dabolim Terminal 1", "driver": "Rajesh Naik", "driver_fee": 800, "driver_paid": 800, "agent_idx": 1, "markup": 1.5},
        {"day_offset": -50, "duration": 3, "car_idx": 2, "cust_idx": 2, "status": "returned", "transfer": "none", "pickup": "Panjim Marriott", "drop": "Panjim Marriott", "markup": 1.65},
        {"day_offset": -42, "duration": 7, "car_idx": 6, "cust_idx": 6, "status": "returned", "transfer": "airport_pickup", "pickup": "MOPA Airport", "drop": "Morjim Beach", "flight": "11:15 UK-842", "terminal": "MOPA Terminal 1", "driver": "Deepak Patil", "driver_fee": 1200, "driver_paid": 1200, "agent_idx": 0, "markup": 1.45},
        {"day_offset": -35, "duration": 4, "car_idx": 7, "cust_idx": 7, "status": "returned", "transfer": "none", "pickup": "Vasco Depot", "drop": "Vasco Depot", "markup": 1.55},
        {"day_offset": -28, "duration": 5, "car_idx": 0, "cust_idx": 8, "status": "returned", "transfer": "airport_drop", "pickup": "Anjuna Villa", "drop": "MOPA Airport", "flight": "20:30 QP-1302", "terminal": "MOPA Terminal 1", "driver": "Sunil Sawant", "driver_fee": 700, "driver_paid": 700, "agent_idx": 2, "markup": 1.6},
        {"day_offset": -20, "duration": 3, "car_idx": 5, "cust_idx": 9, "status": "returned", "transfer": "none", "pickup": "Calangute Mall", "drop": "Calangute Mall", "markup": 1.6},
        {"day_offset": -15, "duration": 6, "car_idx": 3, "cust_idx": 10, "status": "returned", "transfer": "airport_pickup", "pickup": "Dabolim Airport", "drop": "Palolem Resort", "flight": "09:00 AI-512", "terminal": "Dabolim Terminal 1", "driver": "Deepak Patil", "driver_fee": 1000, "driver_paid": 1000, "agent_idx": 3, "markup": 1.5},
        {"day_offset": -10, "duration": 4, "car_idx": 4, "cust_idx": 11, "status": "returned", "transfer": "none", "pickup": "Margao Station", "drop": "Margao Station", "markup": 1.5},
        {"day_offset": -7, "duration": 5, "car_idx": 2, "cust_idx": 12, "status": "returned", "transfer": "airport_drop", "pickup": "Panjim Hotel", "drop": "MOPA Airport", "flight": "17:15 6E-882", "terminal": "MOPA Terminal 1", "driver": "Anwar Sheikh", "driver_fee": 800, "driver_paid": 400, "agent_idx": 0, "markup": 1.6},

        # Current active bookings (mid-August 2026)
        {"day_offset": -3, "duration": 5, "car_idx": 0, "cust_idx": 0, "status": "with_customer", "transfer": "airport_pickup", "pickup": "MOPA Airport", "drop": "Baga Beach", "flight": "13:45 6E-102", "terminal": "MOPA Terminal 1", "driver": "Rajesh Naik", "driver_fee": 500, "driver_paid": 500, "agent_idx": 0, "transfer_status": "completed", "markup": 1.65},
        {"day_offset": -2, "duration": 4, "car_idx": 1, "cust_idx": 1, "status": "with_customer", "transfer": "none", "pickup": "Calangute Hotel", "drop": "Goa Airport", "markup": 1.6},
        {"day_offset": -1, "duration": 6, "car_idx": 3, "cust_idx": 3, "status": "with_customer", "transfer": "airport_pickup", "pickup": "MOPA Airport", "drop": "Arambol Beach", "flight": "08:30 UK-901", "terminal": "MOPA Terminal 1", "driver": "Deepak Patil", "driver_fee": 1200, "driver_paid": 0, "agent_idx": 0, "transfer_status": "completed", "markup": 1.5},
        {"day_offset": 0, "duration": 4, "car_idx": 5, "cust_idx": 5, "status": "car_received", "transfer": "airport_drop", "pickup": "Candolim Resort", "drop": "MOPA Airport", "flight": "21:00 AI-672", "terminal": "MOPA Terminal 1", "driver": "Sunil Sawant", "driver_fee": 800, "driver_paid": 0, "agent_idx": 2, "transfer_status": "en_route", "markup": 1.55},
        {"day_offset": 0, "duration": 3, "car_idx": 7, "cust_idx": 13, "status": "with_customer", "transfer": "none", "pickup": "Vasco Depot", "drop": "Vasco Depot", "markup": 1.5},

        # Upcoming bookings (late August / early September 2026)
        {"day_offset": 2, "duration": 5, "car_idx": 2, "cust_idx": 2, "status": "reserved", "transfer": "airport_drop", "pickup": "Panjim Marriott", "drop": "MOPA Airport", "flight": "19:30 6E-551", "terminal": "MOPA Terminal 1", "driver": "Anwar Sheikh", "driver_fee": 700, "driver_paid": 0, "agent_idx": 0, "transfer_status": "scheduled", "markup": 1.6},
        {"day_offset": 4, "duration": 7, "car_idx": 4, "cust_idx": 4, "status": "reserved", "transfer": "airport_pickup", "pickup": "MOPA Airport", "drop": "Vasco Station", "flight": "10:15 AI-804", "terminal": "MOPA Terminal 1", "driver": "Rajesh Naik", "driver_fee": 900, "driver_paid": 0, "agent_idx": 1, "transfer_status": "scheduled", "markup": 1.5},
        {"day_offset": 5, "duration": 4, "car_idx": 6, "cust_idx": 14, "status": "reserved", "transfer": "none", "pickup": "Margao Depot", "drop": "Margao Depot", "markup": 1.45},
        {"day_offset": 7, "duration": 6, "car_idx": 3, "cust_idx": 10, "status": "reserved", "transfer": "airport_drop", "pickup": "Siolim Villa", "drop": "MOPA Airport", "flight": "22:15 QP-1504", "terminal": "MOPA Terminal 1", "driver": "Sunil Sawant", "driver_fee": 800, "driver_paid": 0, "agent_idx": 2, "transfer_status": "scheduled", "markup": 1.55},
        {"day_offset": 9, "duration": 3, "car_idx": 1, "cust_idx": 9, "status": "reserved", "transfer": "none", "pickup": "Calangute Circle", "drop": "Calangute Circle", "markup": 1.6},
    ]

    for bt in booking_templates:
        car = cars[bt["car_idx"]]
        cust = customers[bt["cust_idx"]]
        start_dt = now + timedelta(days=bt["day_offset"])
        end_dt = start_dt + timedelta(days=bt["duration"])
        cost_rate = car["default_cost_rate"] * bt["duration"]
        customer_rate = round(cost_rate * bt["markup"] / 50) * 50
        transfer_type = bt.get("transfer", "none")
        agent_id = agents[bt["agent_idx"]]["id"] if "agent_idx" in bt else None
        agent_fee = float(bt.get("driver_fee", 0.0))
        agent_paid = float(bt.get("driver_paid", 0.0))
        driver_name = bt.get("driver", "Owner (Self)")
        margin = customer_rate - cost_rate
        net_profit = margin - agent_fee

        b_id = new_id()
        created_iso = start_dt.isoformat()
        booking = {
            "id": b_id,
            "customer_name": cust[0],
            "customer_contact": cust[1],
            "customer_id_proof": cust[2],
            "car_id": car["id"],
            "owner_id": car["owner_id"],
            "start_date": start_dt.strftime("%Y-%m-%d"),
            "end_date": end_dt.strftime("%Y-%m-%d"),
            "pickup_location": bt["pickup"],
            "drop_location": bt["drop"],
            "cost_rate": float(cost_rate),
            "customer_rate": float(customer_rate),
            "margin": float(margin),
            "net_profit": float(net_profit),
            "status": bt["status"],
            "transfer_type": transfer_type,
            "transfer_status": bt.get("transfer_status", "completed" if bt["status"] == "returned" and transfer_type != "none" else ("scheduled" if transfer_type != "none" else "none")),
            "flight_time": bt.get("flight", ""),
            "transfer_pickup_point": bt.get("terminal", ""),
            "assigned_agent_id": agent_id,
            "agent_fee": agent_fee,
            "driver_name": driver_name,
            "driver_fee": agent_fee,
            "driver_fee_paid": agent_paid,
            "driver_fee_pending": max(0.0, agent_fee - agent_paid),
            "notes": "VIP client" if bt["markup"] > 1.6 else "",
            "created_by": admin_id,
            "created_by_email": admin_email,
            "created_at": created_iso,
            "updated_at": created_iso,
        }
        await db.bookings.insert_one(booking)

        # Owner Ledger entry
        # Past returned bookings are mostly paid, active ones partial or pending
        if bt["status"] == "returned":
            owner_paid = float(cost_rate) if bt["day_offset"] < -25 else float(cost_rate) * 0.5
        elif bt["status"] == "with_customer":
            owner_paid = float(cost_rate) * 0.5 if random.random() < 0.5 else 0.0
        else:
            owner_paid = 0.0

        if owner_paid >= cost_rate:
            owner_l_status = "paid"
        elif owner_paid > 0:
            owner_l_status = "partial"
        else:
            owner_l_status = "pending"

        owner_payments = []
        if owner_paid > 0:
            owner_payments.append({
                "amount": owner_paid,
                "note": "UPI settlement (GPay #84920)" if owner_paid < cost_rate else "Full advance NEFT payout",
                "at": created_iso,
                "by": admin_email,
            })

        owner_ledger = {
            "id": new_id(),
            "entity_type": "owner",
            "entity_id": car["owner_id"],
            "booking_id": b_id,
            "amount": float(cost_rate),
            "amount_paid": float(owner_paid),
            "status": owner_l_status,
            "description": f"Booking {b_id[:8]} — {cust[0]} ({car['model']})",
            "due_date": booking["end_date"],
            "reminders_sent": 1 if owner_l_status == "pending" and bt["day_offset"] < -10 else 0,
            "last_reminder_at": (start_dt + timedelta(days=2)).isoformat() if owner_l_status == "pending" and bt["day_offset"] < -10 else None,
            "payments": owner_payments,
            "created_at": created_iso,
            "updated_at": created_iso,
        }
        await db.ledger.insert_one(owner_ledger)
        await db.car_owners.update_one(
            {"id": car["owner_id"]},
            {"$inc": {"total_owed": float(cost_rate), "total_paid": float(owner_paid)}},
        )

        # Agent Ledger entry
        if agent_id and agent_fee > 0:
            if agent_paid >= agent_fee:
                agent_l_status = "paid"
            elif agent_paid > 0:
                agent_l_status = "partial"
            else:
                agent_l_status = "pending"

            agent_payments = []
            if agent_paid > 0:
                agent_payments.append({
                    "amount": agent_paid,
                    "note": "Cash settlement at airport desk",
                    "at": created_iso,
                    "by": admin_email,
                })

            agent_ledger = {
                "id": new_id(),
                "entity_type": "agent",
                "entity_id": agent_id,
                "booking_id": b_id,
                "amount": float(agent_fee),
                "amount_paid": float(agent_paid),
                "status": agent_l_status,
                "description": f"Airport Transfer for {b_id[:8]} — {cust[0]}",
                "due_date": booking["end_date"],
                "reminders_sent": 0,
                "last_reminder_at": None,
                "payments": agent_payments,
                "created_at": created_iso,
                "updated_at": created_iso,
            }
            await db.ledger.insert_one(agent_ledger)
            await db.agents.update_one(
                {"id": agent_id},
                {"$inc": {"total_owed": float(agent_fee), "total_paid": float(agent_paid)}},
            )

    # 5. Rate History entries
    rate_history_events = [
        {"entity_type": "car", "entity_id": cars[0]["id"], "old_rate": 750, "new_rate": 800, "days_ago": 60},
        {"entity_type": "car", "entity_id": cars[3]["id"], "old_rate": 2200, "new_rate": 2500, "days_ago": 45},
        {"entity_type": "car", "entity_id": cars[4]["id"], "old_rate": 2600, "new_rate": 2800, "days_ago": 30},
        {"entity_type": "car", "entity_id": cars[2]["id"], "old_rate": 1400, "new_rate": 1500, "days_ago": 15},
    ]
    for rhe in rate_history_events:
        evt_dt = (now - timedelta(days=rhe["days_ago"])).isoformat()
        await db.rate_history.insert_one({
            "id": new_id(),
            "entity_type": rhe["entity_type"],
            "entity_id": rhe["entity_id"],
            "old_rate": float(rhe["old_rate"]),
            "new_rate": float(rhe["new_rate"]),
            "effective_date": evt_dt,
            "changed_by": admin_email,
            "created_at": evt_dt,
        })

    # 6. Activity Logs
    activity_events = [
        {"action": "login", "col": "users", "meta": {"ip": "127.0.0.1", "device": "Chrome Windows"}, "minutes_ago": 120},
        {"action": "create", "col": "bookings", "meta": {"customer": "Neha Gupta", "margin": 2000}, "minutes_ago": 90},
        {"action": "transfer_status", "col": "bookings", "meta": {"from": "scheduled", "to": "en_route"}, "minutes_ago": 60},
        {"action": "payment", "col": "ledger", "meta": {"amount_paid": 4000, "new_status": "partial"}, "minutes_ago": 40},
        {"action": "update", "col": "cars", "meta": {"field": "default_cost_rate", "new_value": 800}, "minutes_ago": 25},
        {"action": "update_transfer_driver", "col": "bookings", "meta": {"driver_name": "Anwar Sheikh", "driver_fee": 800}, "minutes_ago": 10},
    ]
    for act in activity_events:
        act_dt = (now - timedelta(minutes=act["minutes_ago"])).isoformat()
        await db.activity_logs.insert_one({
            "id": new_id(),
            "admin_id": admin_id,
            "admin_email": admin_email,
            "action": act["action"],
            "target_collection": act["col"],
            "target_id": new_id(),
            "metadata": act["meta"],
            "created_at": act_dt,
        })

    return {
        "status": "ok",
        "owners": len(owners),
        "agents": len(agents),
        "cars": len(cars),
        "bookings": len(booking_templates),
    }


async def seed(db):
    """Entrypoint called on server startup."""
    await seed_users_and_settings(db)


async def create_indexes(db):
    await db.users.create_index("email", unique=True)
    await db.users.create_index("id", unique=True)
    await db.bookings.create_index("id", unique=True)
    await db.bookings.create_index("created_at")
    await db.bookings.create_index("start_date")
    await db.car_owners.create_index("id", unique=True)
    await db.agents.create_index("id", unique=True)
    await db.cars.create_index("id", unique=True)
    await db.cars.create_index("registration_no", unique=True)
    await db.ledger.create_index("id", unique=True)
    await db.ledger.create_index([("entity_type", 1), ("entity_id", 1)])
    await db.activity_logs.create_index("created_at")
    await db.rate_history.create_index([("entity_type", 1), ("entity_id", 1)])
