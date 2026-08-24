"""Shared Pydantic models and helpers."""
from datetime import datetime, timezone
from typing import Optional, List, Literal
from pydantic import BaseModel, Field, EmailStr, ConfigDict
import uuid


def new_id() -> str:
    return str(uuid.uuid4())


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------- Users / Auth ----------
class UserPublic(BaseModel):
    id: str
    email: EmailStr
    name: str
    role: Literal["super_admin", "operator"]
    created_at: str


class LoginIn(BaseModel):
    email: EmailStr
    password: str


# ---------- Car Owners ----------
class CarOwnerCreate(BaseModel):
    name: str
    contact: str
    notes: Optional[str] = ""


class CarOwner(BaseModel):
    id: str = Field(default_factory=new_id)
    name: str
    contact: str
    notes: str = ""
    total_owed: float = 0.0
    total_paid: float = 0.0
    created_at: str = Field(default_factory=now_iso)


# ---------- Agents ----------
class AgentCreate(BaseModel):
    name: str
    contact: str
    notes: Optional[str] = ""


class Agent(BaseModel):
    id: str = Field(default_factory=new_id)
    name: str
    contact: str
    notes: str = ""
    total_owed: float = 0.0
    total_paid: float = 0.0
    created_at: str = Field(default_factory=now_iso)


# ---------- Cars ----------
class CarCreate(BaseModel):
    registration_no: str
    model: str
    owner_id: str
    default_cost_rate: Optional[float] = 0.0


class Car(BaseModel):
    id: str = Field(default_factory=new_id)
    registration_no: str
    model: str
    owner_id: str
    default_cost_rate: float = 0.0
    created_at: str = Field(default_factory=now_iso)


# ---------- Bookings ----------
BookingStatus = Literal["reserved", "car_received", "with_customer", "returned", "cancelled"]
TransferStatus = Literal["none", "scheduled", "en_route", "completed", "cancelled"]
TransferType = Literal["none", "airport_pickup", "airport_drop", "both"]
PaymentMethod = Literal["cash", "online"]
DepositStatus = Literal["none", "received", "refunded"]


def calculate_9am_days(start_date: str, end_date: str, pickup_time: str = "09:00", drop_time: str = "09:00") -> int:
    """
    Calculate chargeable rental days using the 9:00 AM -> 9:00 AM rule.
    - A booking day runs from 9:00 AM to next 9:00 AM.
    - If the car is returned after 9:00 AM on the return day (drop_time > '09:00'), charge +1 extra day.
    - Minimum is 1 day.
    """
    try:
        s_date = str(start_date)[:10]
        e_date = str(end_date)[:10]
        s_dt = datetime.fromisoformat(s_date)
        e_dt = datetime.fromisoformat(e_date)
        diff_days = (e_dt - s_dt).days
        if diff_days <= 0:
            return 1
            
        base_days = diff_days
        d_time = (drop_time or "09:00").strip()[:5]
        
        # If returned after 09:00 AM on return day, charge one additional full day
        if d_time > "09:00":
            return base_days + 1
        return max(1, base_days)
    except Exception:
        return 1


class BookingCreate(BaseModel):
    customer_name: str
    customer_contact: str
    customer_id_proof: Optional[str] = ""
    car_id: str
    start_date: str  # ISO date
    end_date: str
    pickup_time: Optional[str] = "09:00"
    drop_time: Optional[str] = "09:00"
    days: Optional[int] = None
    daily_cost_rate: Optional[float] = 0.0
    daily_customer_rate: Optional[float] = 0.0
    pickup_location: str
    drop_location: str
    cost_rate: float  # total paid to owner (₹)
    customer_rate: float  # total charged to customer (₹)
    payment_method: Optional[PaymentMethod] = "cash"
    deposit_amount: Optional[float] = 0.0
    deposit_status: Optional[DepositStatus] = "none"
    deposit_refunded_at: Optional[str] = None
    transfer_type: TransferType = "none"
    transfer_status: Optional[TransferStatus] = "scheduled"
    transfer_cost: Optional[float] = 1000.0
    transfer_driver_share: Optional[float] = 500.0
    transfer_driver_paid: Optional[bool] = False
    transfer_manoj_share: Optional[float] = 500.0
    transfer_manoj_paid: Optional[bool] = False
    flight_time: Optional[str] = ""
    transfer_pickup_point: Optional[str] = ""
    assigned_agent_id: Optional[str] = None
    agent_fee: float = 0.0
    driver_name: Optional[str] = "Owner (Self)"
    driver_fee: Optional[float] = 0.0  # Decided/Agreed fee for driver
    driver_fee_paid: Optional[float] = 0.0  # Amount paid to driver so far
    notes: Optional[str] = ""


class BookingUpdate(BaseModel):
    customer_name: Optional[str] = None
    customer_contact: Optional[str] = None
    customer_id_proof: Optional[str] = None
    car_id: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    pickup_time: Optional[str] = None
    drop_time: Optional[str] = None
    days: Optional[int] = None
    daily_cost_rate: Optional[float] = None
    daily_customer_rate: Optional[float] = None
    pickup_location: Optional[str] = None
    drop_location: Optional[str] = None
    cost_rate: Optional[float] = None
    customer_rate: Optional[float] = None
    payment_method: Optional[PaymentMethod] = None
    deposit_amount: Optional[float] = None
    deposit_status: Optional[DepositStatus] = None
    deposit_refunded_at: Optional[str] = None
    status: Optional[BookingStatus] = None
    transfer_type: Optional[TransferType] = None
    transfer_status: Optional[TransferStatus] = None
    transfer_cost: Optional[float] = None
    transfer_driver_share: Optional[float] = None
    transfer_driver_paid: Optional[bool] = None
    transfer_manoj_share: Optional[float] = None
    transfer_manoj_paid: Optional[bool] = None
    flight_time: Optional[str] = None
    transfer_pickup_point: Optional[str] = None
    assigned_agent_id: Optional[str] = None
    agent_fee: Optional[float] = None
    driver_name: Optional[str] = None
    driver_fee: Optional[float] = None
    driver_fee_paid: Optional[float] = None
    notes: Optional[str] = None


class Booking(BaseModel):
    id: str = Field(default_factory=new_id)
    customer_name: str
    customer_contact: str
    customer_id_proof: str = ""
    car_id: str
    owner_id: str
    start_date: str
    end_date: str
    pickup_time: str = "09:00"
    drop_time: str = "09:00"
    days: int = 1
    daily_cost_rate: float = 0.0
    daily_customer_rate: float = 0.0
    pickup_location: str
    drop_location: str
    cost_rate: float
    customer_rate: float
    payment_method: PaymentMethod = "cash"
    deposit_amount: float = 0.0
    deposit_status: DepositStatus = "none"
    deposit_refunded_at: Optional[str] = None
    margin: float  # auto-calc: customer_rate - cost_rate
    status: BookingStatus = "reserved"
    transfer_type: TransferType = "none"
    transfer_status: TransferStatus = "none"
    transfer_cost: float = 1000.0
    transfer_driver_share: float = 500.0
    transfer_driver_paid: bool = False
    transfer_manoj_share: float = 500.0
    transfer_manoj_paid: bool = False
    flight_time: str = ""
    transfer_pickup_point: str = ""
    assigned_agent_id: Optional[str] = None
    agent_fee: float = 0.0
    driver_name: str = "Owner (Self)"
    driver_fee: float = 0.0
    driver_fee_paid: float = 0.0
    net_profit: float  # margin - agent_fee
    notes: str = ""
    created_by: str
    created_at: str = Field(default_factory=now_iso)
    updated_at: str = Field(default_factory=now_iso)


# ---------- Ledger ----------
LedgerStatus = Literal["pending", "partial", "paid"]
EntityType = Literal["owner", "agent"]


class LedgerCreate(BaseModel):
    entity_type: EntityType
    entity_id: str
    amount: float
    description: str
    booking_id: Optional[str] = None
    due_date: Optional[str] = None


class LedgerPayment(BaseModel):
    amount_paid: float
    note: Optional[str] = ""


class LedgerEntry(BaseModel):
    id: str = Field(default_factory=new_id)
    entity_type: EntityType
    entity_id: str
    booking_id: Optional[str] = None
    amount: float  # amount owed
    amount_paid: float = 0.0
    status: LedgerStatus = "pending"
    description: str = ""
    due_date: Optional[str] = None
    reminders_sent: int = 0
    last_reminder_at: Optional[str] = None
    payments: List[dict] = Field(default_factory=list)
    created_at: str = Field(default_factory=now_iso)
    updated_at: str = Field(default_factory=now_iso)


# ---------- Rate History ----------
class RateHistoryEntry(BaseModel):
    id: str = Field(default_factory=new_id)
    entity_type: Literal["car", "owner"]
    entity_id: str
    old_rate: float
    new_rate: float
    effective_date: str
    changed_by: str
    created_at: str = Field(default_factory=now_iso)


class RateChangeIn(BaseModel):
    entity_type: Literal["car", "owner"]
    entity_id: str
    new_rate: float
    effective_date: Optional[str] = None


# ---------- Activity Log ----------
class ActivityLog(BaseModel):
    id: str = Field(default_factory=new_id)
    admin_id: str
    admin_email: str
    action: str  # e.g. "create", "update", "delete", "login"
    target_collection: str
    target_id: Optional[str] = None
    diff: dict = Field(default_factory=dict)
    created_at: str = Field(default_factory=now_iso)


# ---------- Settings ----------
class SettingsModel(BaseModel):
    savings_percent: float = 10.0
    reminder_template_owner: str = "Reminder: ₹{amount} pending for {name}. Please settle at earliest."
    reminder_template_agent: str = "Reminder: ₹{amount} pending for agent {name}."
    reminder_template_transfer: str = "Transfer status update: {status} for booking {booking_id}."
    reminder_interval_days: int = 3


class SettingsUpdate(BaseModel):
    savings_percent: Optional[float] = None
    reminder_template_owner: Optional[str] = None
    reminder_template_agent: Optional[str] = None
    reminder_template_transfer: Optional[str] = None
    reminder_interval_days: Optional[int] = None
