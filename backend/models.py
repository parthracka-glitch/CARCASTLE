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
CarBillingType = Literal["daily", "monthly"]


class CarCreate(BaseModel):
    registration_no: str
    model: str
    owner_id: str
    default_cost_rate: Optional[float] = 0.0
    billing_type: Optional[CarBillingType] = "daily"
    monthly_cost_rate: Optional[float] = 0.0
    billing_cycle_day: Optional[int] = 1


class Car(BaseModel):
    id: str = Field(default_factory=new_id)
    registration_no: str
    model: str
    owner_id: str
    default_cost_rate: float = 0.0
    billing_type: CarBillingType = "daily"
    monthly_cost_rate: float = 0.0
    billing_cycle_day: int = 1
    created_at: str = Field(default_factory=now_iso)


# ---------- Bookings ----------
BookingStatus = Literal["reserved", "car_received", "with_customer", "returned", "cancelled"]
TransferStatus = Literal["none", "scheduled", "en_route", "completed", "cancelled"]
TransferType = Literal["none", "airport_pickup", "airport_drop", "both"]
PaymentMethod = Literal["cash", "online"]
DepositStatus = Literal["none", "received", "refunded"]


def calculate_9am_days(start_date: str, end_date: str, pickup_time: str = "09:00", drop_time: str = "09:00") -> int:
    """
    Calculate chargeable rental days using the 9:00 AM -> 9:30 AM rule.
    - A standard booking day runs 9:00 AM to 9:00 AM.
    - If the car is returned after 9:30 AM on the return day (drop_time > '09:30'), charge +1 extra day (T+1).
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
        
        # If returned after 09:30 AM on return day, charge one additional full day (T+1)
        if d_time > "09:30":
            return base_days + 1
        return max(1, base_days)
    except Exception:
        return 1


class BookingCreate(BaseModel):
    customer_name: str
    customer_contact: str
    customer_id_proof: Optional[str] = ""
    car_id: Optional[str] = None
    owner_id: Optional[str] = None
    owner_name: Optional[str] = ""
    owner_contact: Optional[str] = ""
    car_model: Optional[str] = ""
    car_registration: Optional[str] = "TBD"
    start_date: str  # ISO date
    end_date: str
    pickup_time: Optional[str] = "09:00"
    drop_time: Optional[str] = "09:00"
    days: Optional[int] = None
    daily_cost_rate: Optional[float] = 0.0
    daily_customer_rate: Optional[float] = 0.0
    pickup_location: str
    pickup_price: Optional[float] = 0.0
    drop_location: str
    drop_price: Optional[float] = 0.0
    cost_rate: float  # total paid to owner (₹)
    customer_rate: float  # total charged to customer (₹)
    advance_payment: Optional[float] = 0.0  # advance paid by client
    balance_due: Optional[float] = 0.0  # remaining amount client needs to pay
    payment_method: Optional[PaymentMethod] = "cash"
    deposit_amount: Optional[float] = 0.0
    deposit_status: Optional[DepositStatus] = "none"
    deposit_refunded_at: Optional[str] = None
    transfer_type: TransferType = "none"
    transfer_status: Optional[TransferStatus] = "scheduled"
    transfer_handled_by: Optional[str] = None  # None | "self" | "driver"
    transfer_cost: Optional[float] = 1000.0
    transfer_driver_share: Optional[float] = None
    transfer_driver_paid: Optional[bool] = False
    transfer_manoj_share: Optional[float] = None
    transfer_manoj_paid: Optional[bool] = False
    flight_time: Optional[str] = ""
    transfer_pickup_point: Optional[str] = ""
    assigned_agent_id: Optional[str] = None
    agent_fee: float = 0.0
    driver_name: Optional[str] = "Owner (Self)"
    driver_contact: Optional[str] = ""
    driver_fee: Optional[float] = 0.0  # Decided/Agreed fee for driver
    driver_fee_paid: Optional[float] = 0.0  # Amount paid to driver so far
    notes: Optional[str] = ""


class BookingUpdate(BaseModel):
    customer_name: Optional[str] = None
    customer_contact: Optional[str] = None
    customer_id_proof: Optional[str] = None
    car_id: Optional[str] = None
    owner_id: Optional[str] = None
    owner_name: Optional[str] = None
    car_model: Optional[str] = None
    car_registration: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    pickup_time: Optional[str] = None
    drop_time: Optional[str] = None
    days: Optional[int] = None
    daily_cost_rate: Optional[float] = None
    daily_customer_rate: Optional[float] = None
    pickup_location: Optional[str] = None
    pickup_price: Optional[float] = None
    drop_location: Optional[str] = None
    drop_price: Optional[float] = None
    cost_rate: Optional[float] = None
    customer_rate: Optional[float] = None
    advance_payment: Optional[float] = None
    balance_due: Optional[float] = None
    payment_method: Optional[PaymentMethod] = None
    deposit_amount: Optional[float] = None
    deposit_status: Optional[DepositStatus] = None
    deposit_refunded_at: Optional[str] = None
    status: Optional[BookingStatus] = None
    transfer_type: Optional[TransferType] = None
    transfer_status: Optional[TransferStatus] = None
    transfer_handled_by: Optional[str] = None
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
    driver_contact: Optional[str] = None
    driver_fee: Optional[float] = None
    driver_fee_paid: Optional[float] = None
    notes: Optional[str] = None


class AssignCarIn(BaseModel):
    car_id: Optional[str] = None
    car_model: Optional[str] = None
    car_registration: Optional[str] = None
    owner_id: Optional[str] = None
    owner_name: Optional[str] = None


class HandoverIntakeIn(BaseModel):
    status: Optional[BookingStatus] = "car_received"
    fuel_amount: Optional[float] = 0.0
    wash_amount: Optional[float] = 0.0
    notes: Optional[str] = ""


class Booking(BaseModel):
    id: str = Field(default_factory=new_id)
    customer_name: str
    customer_contact: str
    customer_id_proof: str = ""
    car_id: Optional[str] = None
    car_model: Optional[str] = "—"
    car_registration: Optional[str] = "TBD"
    owner_id: Optional[str] = None
    owner_name: Optional[str] = "—"
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
    transfer_handled_by: str = "self"  # "self" | "driver"
    transfer_cost: float = 1000.0
    transfer_driver_share: float = 0.0
    transfer_driver_paid: bool = False
    transfer_manoj_share: float = 1000.0
    transfer_manoj_paid: bool = False
    flight_time: str = ""
    transfer_pickup_point: str = ""
    assigned_agent_id: Optional[str] = None
    agent_fee: float = 0.0
    driver_name: str = "Owner (Self)"
    driver_contact: str = ""
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


# ---------- Owner Handover Expenses & Deductions ----------
ExpenseCategory = Literal["fuel", "wash", "maintenance", "fastag", "challan", "other"]
ExpenseSettlementType = Literal["deduct_from_payout", "paid_by_owner"]


class OwnerExpenseCreate(BaseModel):
    owner_id: str
    car_id: Optional[str] = None
    booking_id: Optional[str] = None
    category: ExpenseCategory = "fuel"
    amount: float
    description: Optional[str] = ""
    settlement_type: ExpenseSettlementType = "deduct_from_payout"
    date: Optional[str] = None


class OwnerExpenseUpdate(BaseModel):
    category: Optional[ExpenseCategory] = None
    amount: Optional[float] = None
    description: Optional[str] = None
    car_id: Optional[str] = None
    is_settled: Optional[bool] = None
    settlement_type: Optional[ExpenseSettlementType] = None
    settled_at: Optional[str] = None
    settled_note: Optional[str] = None


class OwnerExpense(BaseModel):
    id: str = Field(default_factory=new_id)
    owner_id: str
    car_id: Optional[str] = None
    car_model: Optional[str] = ""
    car_registration: Optional[str] = ""
    booking_id: Optional[str] = None
    category: ExpenseCategory = "fuel"
    amount: float
    description: str = ""
    is_settled: bool = False
    settlement_type: ExpenseSettlementType = "deduct_from_payout"
    settled_at: Optional[str] = None
    settled_note: Optional[str] = ""
    settled_in_ledger_id: Optional[str] = None
    date: str = Field(default_factory=now_iso)
    created_by: Optional[str] = ""
    created_at: str = Field(default_factory=now_iso)
    updated_at: str = Field(default_factory=now_iso)


class MonthlyRetainerPost(BaseModel):
    car_id: str
    month: str  # YYYY-MM
    amount: float
    notes: Optional[str] = ""


# ---------- Enquiries ----------
EnquiryStatus = Literal["new", "contacted", "converted", "lost"]


class EnquiryCreate(BaseModel):
    name: str
    phone: str
    email: Optional[str] = ""
    city: str
    state: str
    car_id: Optional[str] = None
    car_model: Optional[str] = ""
    enquiry_date: Optional[str] = None
    notes: Optional[str] = ""
    status: Optional[EnquiryStatus] = "new"


class EnquiryUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    car_id: Optional[str] = None
    car_model: Optional[str] = None
    enquiry_date: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[EnquiryStatus] = None


class Enquiry(BaseModel):
    id: str = Field(default_factory=new_id)
    name: str
    phone: str
    email: str = ""
    city: str
    state: str
    car_id: Optional[str] = None
    car_model: str = ""
    enquiry_date: str = Field(default_factory=now_iso)
    notes: str = ""
    status: EnquiryStatus = "new"
    created_by: Optional[str] = ""
    created_at: str = Field(default_factory=now_iso)
    updated_at: str = Field(default_factory=now_iso)



