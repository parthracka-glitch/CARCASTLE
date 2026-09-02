# 🚗 Car Castle Goa — Fleet Management & Operations System

Car Castle Goa is a full-stack fleet operations, car rental management, and financial reconciliation platform built for car rental agencies.

## 🌟 Key Features
- **Fleet & Vehicle Management**: Real-time vehicle availability, owner registration, default cost rates, and status monitoring.
- **Intelligent Booking Engine**: 9 AM grace-period calculation, security deposit escrow tracking, custom transfer splits, and instant WhatsApp booking summaries.
- **Monthly Vehicle Contracts**: Retainer lease agreements, duplicate invoice protection, and month-filtered owner settlements.
- **Enquiry Pipeline**: Full lead lifecycle management, status transitions, follow-up reminders, and PDF/Excel lead reporting.
- **Financial Ledger & Reports**: Double-entry ledger, owner expense deductions, handover intake repairs, and automated monthly P&L statements.
- **Security & Reliability**: Secure TLS bundle verification, connection pooling, majority write concern, RBAC with session protection, and automated JSON database backups.

## 🛠 Tech Stack
- **Backend**: FastAPI (Python), Motor (Async MongoDB), Pydantic, ReportLab, OpenPyXL.
- **Frontend**: React 19, TailwindCSS, Radix UI, Recharts, Lucide Icons.
- **Database**: MongoDB Atlas.

## 🚀 Getting Started

### Backend Setup
```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
uvicorn server:app --reload --port 8000
```

### Frontend Setup
```bash
cd frontend
yarn install
yarn start
```
