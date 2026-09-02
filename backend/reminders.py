"""Reminder engine (MOCK). Single service reused for owner/agent/transfer reminders.

For MVP: logs the reminder to console + stores a reminder record in the DB. When wired
to Twilio/WhatsApp later, only the `_dispatch` function needs to change.
"""
import logging
from datetime import datetime, timezone
from models import new_id

log = logging.getLogger("reminder")


async def _dispatch(channel: str, to: str, message: str):
    # MOCKED — replace with Twilio/WhatsApp Business API call.
    log.info("[MOCK-REMINDER][%s] -> %s :: %s", channel, to, message)
    return {"status": "mock_sent", "channel": channel, "to": to}


async def send_reminder(db, kind: str, entity: dict, message: str,
                        ledger_id: str = None, booking_id: str = None):
    """kind: 'owner' | 'agent' | 'transfer'"""
    contact = entity.get("contact") or entity.get("customer_contact") or ""
    await _dispatch("whatsapp_mock", contact, message)

    record = {
        "id": new_id(),
        "kind": kind,
        "entity_id": entity.get("id"),
        "entity_name": entity.get("name") or entity.get("customer_name"),
        "contact": contact,
        "message": message,
        "ledger_id": ledger_id,
        "booking_id": booking_id,
        "sent_at": datetime.now(timezone.utc).isoformat(),
        "status": "mock_sent",
    }
    await db.reminders.insert_one(record)
    record.pop("_id", None)

    if ledger_id:
        await db.ledger.update_one(
            {"id": ledger_id},
            {"$inc": {"reminders_sent": 1},
             "$set": {"last_reminder_at": record["sent_at"]}},
        )
    return record


def format_message(template: str, **kwargs) -> str:
    try:
        return template.format(**kwargs)
    except KeyError:
        return template
