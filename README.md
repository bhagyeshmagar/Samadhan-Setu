# Samadhan Setu (समाधान सेतु)

> **AI-Powered Civic Grievance Redressal & Governance Platform**

An intelligent, governance-first civic complaint management ecosystem that leverages multi-modal AI to assist — never replace — human decision-making. Officers lead; AI suggests.

---

## Overview

**Samadhan Setu** is an enterprise-grade civic grievance redressal and decision-support platform designed for municipal corporations and public administration bodies. It combines an asynchronous workflow engine, role-based access control, and an explainable AI pipeline to streamline complaint ingestion, semantic deduplication, multi-modal severity grading, automated department routing, and SLA risk forecasting.

**Core Philosophy:** *AI advises, officers decide.* Every AI-generated prediction (classification, severity, routing, and priority) is transparent, fully explainable, auditable, and overridable by authorized personnel.

---

## System Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                   FRONTEND (Next.js 16 • React 19)                    │
│   Citizen Portal   │   Officer Workflows   │   Admin Oversight Suite   │
│   • Lodge / Track  │   • AI Task Queue     │   • Department / Officer  │
│   • GIS Issues Map │   • Status Transitions│     CRUD Management       │
│   • Community Feed │   • Proof Uploads     │   • Model Health Telemetry│
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ REST API / JWT Bearer
┌───────────────────────────────────┴────────────────────────────────────┐
│                       BACKEND (FastAPI • Python 3.11+)                 │
│  ┌───────────────────────┐  ┌─────────────────┐  ┌──────────────────┐  │
│  │ Authentication & RBAC │  │ Workflow State  │  │ Async Repository │  │
│  │ JWT + Argon2 Hashing  │  │ Machine (FSM)   │  │ Layer (SQLAlchemy│  │
│  └───────────────────────┘  └─────────────────┘  └──────────────────┘  │
│  ┌───────────────────────┐  ┌─────────────────┐  ┌──────────────────┐  │
│  │ Multi-Dept Router     │  │ Audit Logger    │  │ 6-Factor Priority│  │
│  │ Parallel Sub-Tasks    │  │ Immutable Trail │  │ Engine           │  │
│  └───────────────────────┘  └─────────────────┘  └──────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │                     AI Intelligence Pipeline                     │  │
│  │  DistilBERT (Zero-Shot) │ SBERT (MiniLM Embeddings) │ YOLOv8n    │  │
│  │  Multi-Modal Fusion     │ Hotspot Clustering       │ SLA Risk    │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ AsyncPG / SQLAlchemy 2.0
┌───────────────────────────────────┴────────────────────────────────────┐
│                       DATABASE & STORAGE LAYER                         │
│  PostgreSQL (Relational Storage)       │ Alembic (Schema Migrations)   │
│  • Users, Departments, Officers        │ • Version-controlled schema   │
│  • Complaints, Tasks, Audit Trails     │ • Safe automated upgrades     │
└────────────────────────────────────────────────────────────────────────┘
```

---

## Key Features

### 1. Citizen Portal
- **Streamlined Grievance Lodging**: Dynamic category prediction, ward selection, geolocation capture, and multi-image evidence uploads.
- **Transparent Status Tracking**: Real-time lifecycle timeline (Submitted → Verified → Assigned → In Progress → Resolved → Closed).
- **Resolution Verification & Feedback**: Citizens rate officer resolutions (1-5 stars) and submit remarks before closure.
- **Community Grievance Feed**: Public issue visibility with upvoting and category-based filtering to reduce duplicate submissions.

### 2. Department & Officer Workflows
- **AI-Ranked Task Queue**: Officer tasks dynamically sorted by multi-factor composite priority, urgency, and SLA deadline.
- **Resolution Proof Upload**: Officers can submit resolution notes and after-action photographic proof.
- **Interactive Spatial GIS Map**: Geographic visualization of complaints with priority/category color-coding and ward boundaries.

### 3. Administrative Control & Oversight
- **Officer Management (CRUD)**: Create, view, search, update department assignments, and toggle officer active status.
- **Department Management (CRUD)**: Full control over municipal departments, contact info, lead assignments, and safe deactivation rules.
- **System Telemetry & AI Model Health**: Real-time monitoring of classifier fallbacks, inference latency, and officer override ratios.
- **Geographic Hotspot Analytics**: Ward-level cluster detection for identifying chronic civic bottlenecks.

### 4. AI Intelligence Layer
- **Zero-Shot Categorization (DistilBERT/BART)**: Classifies unstructured grievance text into civic categories with confidence scoring.
- **Semantic Duplicate Radar (SBERT)**: Vector embeddings (`all-MiniLM-L6-v2`) identify similar complaints to prevent duplicate investigations.
- **Visual Evidence Inspection (YOLOv8)**: Detects civic hazards (potholes, garbage, water leaks, wiring) and evaluates image severity.
- **Multi-Modal Severity Fusion**: Combines text urgency and visual evidence into a balanced, adaptive severity metric.
- **6-Factor Priority Calculator**:
  $$\text{Score} = 0.30U + 0.30S + 0.15C + 0.10R + 0.10L + 0.05H$$
  *(Urgency, Severity, Bounded Crowd Impact, SLA Risk, Location Criticality, History).*
  - **Bounded Crowd Impact**: Vote brigading cannot force an artificial Critical priority.
  - **Explainability**: Complete factor breakdown visible to officers and admins.
- **Automated Graceful Fallback**: Rule-based classifiers guarantee system continuity if machine learning models are offline or loading.

---

## Technology Stack

| Layer | Technology | Details |
| --- | --- | --- |
| **Frontend Framework** | **Next.js 16** (App Router) | High-performance React 19 server and client rendering |
| **UI & Styling** | **Tailwind CSS v4** | Modern CSS variable styling, full light & dark theme support |
| **Icons & Visuals** | **Lucide React** & **Leaflet** | Clean accessible icons and Leaflet GIS mapping |
| **Backend API** | **FastAPI** (Python 3.11+) | Async ASGI web framework with OpenAPI / Swagger documentation |
| **Database & ORM** | **PostgreSQL** + **SQLAlchemy 2.0** | Fully async database operations via `asyncpg` |
| **Database Migrations**| **Alembic** | Versioned, auditable database schema migrations |
| **Authentication** | **JWT** + **Argon2** | Stateless tokens with RBAC (Citizen, Officer, Admin) |
| **AI: NLP** | **Transformers** & **Sentence-Transformers** | Zero-shot DistilBERT classification & SBERT duplicate detection |
| **AI: Computer Vision**| **Ultralytics YOLOv8** | Evidence image inspection and civic hazard verification |

---

## Project Structure

```
Samadhan-Setu/
├── backend/
│   ├── alembic/                      # Database schema migration versions
│   ├── app/
│   │   ├── ai/                       # AI Pipeline Modules
│   │   │   ├── distilbert_classifier.py  # Zero-shot classification
│   │   │   ├── sbert_engine.py           # SBERT embeddings & cache
│   │   │   ├── yolo_validator.py         # YOLOv8 image detection
│   │   │   ├── fusion.py                 # Multi-modal severity fusion
│   │   │   ├── priority.py               # 6-factor priority engine
│   │   │   └── classifier.py             # Rule-based fallback classifier
│   │   ├── models/                   # SQLAlchemy 2.0 ORM Models
│   │   │   ├── user.py                   # User & Role models
│   │   │   ├── department.py             # Department model
│   │   │   ├── complaint.py              # Complaint & ComplaintImage models
│   │   │   ├── task.py                   # Department task & assignment models
│   │   │   └── audit.py                  # Audit log model
│   │   ├── repositories/             # Async Data Access Layer
│   │   │   ├── user_repo.py              # User & Officer queries
│   │   │   ├── department_repo.py        # Department queries
│   │   │   └── complaint_repo.py         # Complaint & Task queries
│   │   ├── routers/                  # API Endpoints
│   │   │   ├── auth.py                   # Registration & JWT Login
│   │   │   ├── citizens.py               # Complaint filing & tracking
│   │   │   ├── departments.py            # Officer workflows
│   │   │   ├── admin.py                  # Officer & Department CRUD, Stats
│   │   │   ├── analytics.py              # Spatial GIS map & telemetry
│   │   │   └── ai_insights.py            # Model health & explainability
│   │   ├── schemas/                  # Pydantic v2 validation models
│   │   ├── services/                 # Business logic & state machine
│   │   ├── auth.py                   # Security, hashing & JWT helpers
│   │   ├── config.py                 # Environment settings
│   │   ├── database.py               # Async engine & session lifecycle
│   │   └── main.py                   # FastAPI application initialization
│   ├── tests/                        # Comprehensive test suite
│   ├── alembic.ini                   # Alembic configuration
│   └── requirements.txt              # Backend dependencies
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── admin/                # Admin oversight, officers, departments, GIS map
│   │   │   ├── citizen/              # Lodge, Track status, Community feed
│   │   │   ├── department/           # Officer dashboard & task handling
│   │   │   ├── login/                # Role-aware authentication
│   │   │   └── layout.js             # Root shell & navigation
│   │   ├── components/               # Navbar, ThemeToggle, IssueMap, Badges
│   │   ├── hooks/                    # Custom hooks (e.g., useAIServices)
│   │   └── lib/                      # API client, Auth, and Theme context
│   ├── package.json
│   └── postcss.config.mjs
└── README.md
```

---

## API Overview

### Authentication (`/api/auth`)
| Method | Endpoint | Description |
| --- | --- | --- |
| `POST` | `/api/auth/register` | Register citizen account |
| `POST` | `/api/auth/login` | Authenticate and obtain JWT token |
| `GET` | `/api/auth/me` | Fetch active user profile and role |

### Citizens (`/api/complaints`)
| Method | Endpoint | Description |
| --- | --- | --- |
| `POST` | `/api/complaints/` | Lodge grievance and initiate async AI pipeline |
| `GET` | `/api/complaints/my` | Retrieve grievances lodged by current citizen |
| `GET` | `/api/complaints/{id}` | Detailed complaint history, sub-tasks, and audit trail |
| `POST` | `/api/complaints/{id}/upload` | Upload evidence images |
| `POST` | `/api/complaints/{id}/feedback` | Submit resolution satisfaction rating & remarks |
| `GET` | `/api/complaints/feed/public` | Public community grievance feed |
| `POST` | `/api/complaints/{id}/upvote` | Upvote a public grievance |

### Department Officers (`/api/department`)
| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/department/tasks` | Fetch department tasks with status filtering |
| `PATCH`| `/api/department/tasks/{id}/status` | Transition task status (Assigned → In Progress → Completed) |
| `GET` | `/api/department/dashboard` | Officer dashboard KPIs and workload metrics |

### Admin & Operations (`/api/admin`)
| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/admin/stats` | City-wide performance metrics and category breakdowns |
| `GET` | `/api/admin/officers` | List all department officers with assignment counts |
| `POST` | `/api/admin/officers` | Register a new officer account |
| `PUT` | `/api/admin/officers/{id}` | Update officer details or department assignment |
| `DELETE`| `/api/admin/officers/{id}` | Deactivate or remove an officer |
| `GET` | `/api/admin/departments` | List municipal departments |
| `POST` | `/api/admin/departments` | Create a municipal department |
| `PUT` | `/api/admin/departments/{id}` | Update department details & contact information |
| `DELETE`| `/api/admin/departments/{id}` | Soft-deactivate an unused department |

### AI Intelligence & Telemetry (`/api/ai`)
| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/ai/complaint/{id}/summary` | Comprehensive AI inference report |
| `GET` | `/api/ai/complaint/{id}/similar` | SBERT semantic duplicate matches |
| `GET` | `/api/ai/complaint/{id}/priority-explanation` | Exact breakdown of 6-factor priority calculation |
| `GET` | `/api/ai/officer/queue` | Dynamically prioritized task queue for officers |
| `GET` | `/api/ai/admin/model-health` | Machine learning model status and fallback telemetry |
| `GET` | `/api/ai/admin/override-stats` | AI decision override frequency and auditing |

---

## Installation & Setup

### Prerequisites
- **Python 3.11+**
- **Node.js 18+** & **npm**
- **PostgreSQL** instance (or SQLite for local development)

---

### Backend Setup

1. **Navigate to the backend directory and activate a virtual environment:**
   ```bash
   cd backend
   python -m venv venv
   # On Windows:
   venv\Scripts\activate
   # On Linux/macOS:
   source venv/bin/activate
   ```

2. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

3. **Configure Environment Variables:**
   Create a `.env` file in the `backend/` directory:
   ```env
   DATABASE_URL=postgresql+asyncpg://postgres:password@localhost:5432/samadhan_setu
   SECRET_KEY=your-secure-random-secret-key
   ACCESS_TOKEN_EXPIRE_MINUTES=1440
   ENVIRONMENT=development
   ```

4. **Run Database Migrations:**
   ```bash
   alembic upgrade head
   ```

5. **Start the FastAPI Server:**
   ```bash
   uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
   ```
   Interactive Swagger documentation will be available at `http://127.0.0.1:8000/docs`.

---

### Frontend Setup

1. **Navigate to the frontend directory:**
   ```bash
   cd frontend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Environment Variables:**
   Create a `.env.local` file:
   ```env
   NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
   ```

4. **Launch the Development Server:**
   ```bash
   npm run dev
   ```
   Access the web application at `http://localhost:3000`.

---

## Running Automated Tests

Run backend unit and integration tests:
```bash
cd backend
python -m pytest tests/ -v
```

Validate frontend code quality and production build:
```bash
cd frontend
npm run lint
npm run build
```

---

## Security & Reliability Standards

- **Department-Scoped Authorization**: Officers can only view and update tasks assigned to their respective department.
- **Cryptographic Password Security**: Passwords hashed using Argon2 with automated salt generation.
- **Strict Hydration & SSR Safety**: State synchronization handled using React 19 `useSyncExternalStore` for flicker-free rendering.
- **Rate-Limiting & Upload Guards**: File upload checks strictly limit attachment extensions and enforce maximum payload sizes.
- **Explainable Audit Logging**: Changes to complaint statuses and task assignments are recorded with actor metadata and timestamps.

---

## License

This project is developed for civic governance enhancement and public service grievance redressal.
