# Samadhan Setu

> **AI-Powered Grievance Redressal Platform for Public Governance**

An intelligent, governance-first complaint management system that uses AI to assist — not replace — human decision-making. Officers lead; AI suggests.

---

## Overview

Samadhan Setu is a full-stack civic grievance redressal platform that combines a robust workflow engine with an AI intelligence layer to improve complaint triage, routing, duplicate detection, and priority scoring across municipal departments.

**Core Philosophy:** AI must suggest, officers must decide. Every AI-generated suggestion is advisory, auditable, and overridable.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    FRONTEND (Next.js 14)                     │
│  Citizen Portal │ Officer Dashboard │ Admin Oversight Panel  │
└───────────────────────────┬─────────────────────────────────┘
                            │ REST API
┌───────────────────────────┴─────────────────────────────────┐
│                    BACKEND (FastAPI)                        │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐  │
│  │ Auth Module  │  │ Workflow     │  │ AI Pipeline        │ │
│  │ JWT + RBAC   │  │ State Machine│  │ (Background Tasks) │ │
│  └─────────────┘  └──────────────┘  └────────────────────┘  │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐  │
│  │ Task Router  │  │ Audit Logger │  │ Priority Engine    │ │
│  │ Multi-dept   │  │ Full history │  │ 6-factor formula   │ │
│  └─────────────┘  └──────────────┘  └────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────┐│
│  │                AI Intelligence Layer                      ││
│  │  DistilBERT │ SBERT │ YOLOv8 │ Fusion │ Routing Engine  ││
│  └──────────────────────────────────────────────────────────┘│
└───────────────────────────┬─────────────────────────────────┘
                            │
┌───────────────────────────┴─────────────────────────────────┐
│                 Firebase Firestore (Database)                 │
│  complaints │ tasks │ users │ audit_logs │ ai_results        │
└─────────────────────────────────────────────────────────────┘
```

---

## Features

### Phase 1 — Workflow Engine

- **Explicit State Machine**: Complaint lifecycle (Submitted → Verified → Assigned → In Progress → Resolved → Closed) with validated transitions
- **Multi-Department Task Routing**: One complaint generates tasks for multiple departments based on text analysis
- **Role-Based Access Control**: Citizens, Officers, and Admins with distinct permissions
- **Full Audit Trail**: Every status change, assignment, and action is logged with actor, timestamp, and reason
- **SLA Tracking**: Deadline estimation based on priority and category
- **Citizen Transparency**: Status timeline with complete history visible to the complainant

### Phase 2 — AI Intelligence Layer

- **DistilBERT Classification**: Zero-shot text classification for complaint categorization with confidence scoring (automatic rule-based fallback)
- **SBERT Duplicate Detection**: Semantic similarity using `all-MiniLM-L6-v2` embeddings with advisory linking (officers approve merges)
- **YOLOv8 Image Validation**: Object detection on evidence images with category-relevance scoring and visual severity estimation
- **Multi-Modal Severity Fusion**: Combines text severity + image severity with adaptive weighting based on text length and image relevance
- **6-Factor Priority Engine**: `0.30×Urgency + 0.30×Severity + 0.15×CrowdImpact + 0.10×SLARisk + 0.10×LocationCriticality + 0.05×History`
  - Upvotes are bounded and do not control final priority
  - "Critical" priority band (≥2.5) with 12-hour SLA
  - Full explainability for every score
- **AI-Assisted Routing**: Suggests department, officer assignment (least-loaded), and urgency band — all overridable
- **SLA Risk Engine**: Real-time risk scoring from complaint age, deadline proximity, and department backlog
- **Complaint Clustering**: Ward/category-based hotspot detection for systemic issue identification
- **Officer AI Queue**: Tasks ranked by composite priority score with urgency/severity/SLA badges
- **Admin Model Health**: Live dashboard showing model availability, fallback rate, latency, and override statistics
- **Inference Logging**: Every AI pipeline run is logged for auditability and performance monitoring

### Frontend

- **Citizen Portal**: Complaint submission with auto-location, real-time AI classification preview, duplicate radar, image upload
- **Citizen Tracker**: Status timeline, department task progress, AI insights panel (category confidence, urgency/severity, similar reports, priority score)
- **Officer Dashboard**: Task management with status transitions, AI-Ranked Priority Queue toggle, urgency/SLA badges
- **Admin Oversight**: System telemetry, category distribution, neural insights, model health monitoring, AI override statistics
- **Dark/Light Mode**: Full theme support with responsive design

---

## Tech Stack

| Layer | Technology |
| ------- | ----------- |
| Frontend | Next.js 14, React 18, Lucide Icons |
| Backend | FastAPI, Python 3.11+ |
| Database | Firebase Firestore |
| Auth | JWT (python-jose) + Argon2 hashing |
| AI: Classification | DistilBERT (zero-shot, HuggingFace Transformers) |
| AI: Similarity | SBERT (all-MiniLM-L6-v2, sentence-transformers) |
| AI: Vision | YOLOv8n (Ultralytics) |
| AI: Priority | Custom 6-factor weighted formula |
| Testing | pytest (82 tests across Phase 1 + Phase 2) |

---

## Project Structure

```
Samadhan-Setu/
├── backend/
│   ├── app/
│   │   ├── ai/
│   │   │   ├── __init__.py           # AI module entry point
│   │   │   ├── distilbert_classifier.py  # Zero-shot classification
│   │   │   ├── sbert_engine.py       # Embedding engine with caching
│   │   │   ├── yolo_validator.py     # Image detection + relevance
│   │   │   ├── text_intelligence.py  # Unified text analysis
│   │   │   ├── fusion.py            # Multi-modal severity fusion
│   │   │   ├── priority.py          # 6-factor priority calculator
│   │   │   ├── classifier.py        # Rule-based fallback classifier
│   │   │   └── text_processor.py    # Text cleaning utilities
│   │   ├── models/
│   │   │   ├── complaint.py          # Complaint model + state machine
│   │   │   ├── task.py               # Task model + status
│   │   │   ├── user.py              # User model + roles
│   │   │   └── audit.py             # Audit log model
│   │   ├── routers/
│   │   │   ├── auth.py              # Login/register/profile
│   │   │   ├── citizens.py          # Complaint CRUD + AI pipeline trigger
│   │   │   ├── departments.py       # Officer task management
│   │   │   ├── admin.py             # Admin operations
│   │   │   ├── analytics.py         # Maps + summary endpoints
│   │   │   ├── ai_insights.py       # Phase 2 AI endpoints (12 routes)
│   │   │   └── assignments.py       # Task assignments
│   │   ├── services/
│   │   │   ├── ai_pipeline.py       # 9-step AI orchestrator
│   │   │   ├── ai_routing.py        # Department + officer suggestions
│   │   │   ├── similarity_service.py # SBERT duplicate detection + linking
│   │   │   ├── image_analysis_service.py  # YOLO orchestration
│   │   │   ├── task_router.py       # Multi-department detection
│   │   │   ├── audit_service.py     # Audit logging
│   │   │   ├── complaint_clustering.py   # Hotspot detection
│   │   │   ├── state_machine.py     # Complaint state transitions
│   │   │   └── task_state_machine.py # Task state transitions
│   │   ├── schemas/
│   │   │   ├── ai.py                # AI response schemas
│   │   │   └── complaint.py         # Complaint schemas
│   │   ├── auth.py                  # JWT + RBAC
│   │   ├── config.py               # Settings + environment
│   │   ├── database.py             # Firebase init
│   │   └── main.py                 # FastAPI app
│   ├── tests/
│   │   ├── test_phase1.py          # 36 tests (workflow, state, priority)
│   │   └── test_phase2.py          # 49 tests (AI, fusion, SBERT, YOLO)
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── app/
│       │   ├── citizen/             # Lodge + Track + Community pages
│       │   ├── department/          # Officer dashboard
│       │   └── admin/               # Admin oversight
│       ├── components/              # Reusable UI components
│       ├── hooks/                   # Custom React hooks
│       └── lib/                     # API client + auth context
└── PROJECT_DOCUMENTATION.txt
```

---

## API Endpoints

### Auth

| Method | Endpoint | Description |
| -------- | ---------- | ------------- |
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login (returns JWT) |
| GET | `/api/auth/me` | Get current user profile |

### Citizens

| Method | Endpoint | Description |
| -------- | ---------- | ------------- |
| POST | `/api/complaints/` | Submit complaint (triggers AI pipeline) |
| GET | `/api/complaints/my` | Get citizen's complaints |
| GET | `/api/complaints/{id}` | Get complaint detail + tasks + history |
| POST | `/api/complaints/{id}/upload` | Upload evidence images |

### Officers (Department)

| Method | Endpoint | Description |
| -------- | ---------- | ------------- |
| GET | `/api/department/tasks` | Get department tasks |
| PATCH | `/api/department/tasks/{id}/status` | Update task status |
| GET | `/api/department/stats` | Department statistics |

### AI Insights (Phase 2)

| Method | Endpoint | Description |
| -------- | ---------- | ------------- |
| GET | `/api/ai/complaint/{id}/summary` | Full AI analysis summary |
| POST | `/api/ai/complaint/{id}/rerun` | Re-run AI pipeline |
| GET | `/api/ai/complaint/{id}/similar` | Similar complaints + links |
| GET | `/api/ai/complaint/{id}/cluster` | Cluster membership |
| GET | `/api/ai/complaint/{id}/priority-explanation` | Priority score breakdown |
| GET | `/api/ai/complaint/{id}/sla-risk` | SLA risk assessment |
| GET | `/api/ai/complaint/{id}/image-analysis` | YOLO image results |
| GET | `/api/ai/complaint/{id}/routing` | AI routing suggestion |
| POST | `/api/ai/complaint/{id}/routing/override` | Officer override |
| GET | `/api/ai/officer/queue` | AI-ranked task queue |
| GET | `/api/ai/admin/model-health` | Model availability metrics |
| GET | `/api/ai/admin/hotspots` | Complaint hotspots |
| GET | `/api/ai/admin/override-stats` | Override statistics |

### Admin

| Method | Endpoint | Description |
| -------- | ---------- | ------------- |
| GET | `/api/admin/stats` | System-wide statistics |
| GET | `/api/admin/departments` | List departments |
| POST | `/api/admin/departments` | Create department |

---

## Setup

### Prerequisites

- Python 3.11+
- Node.js 18+
- Firebase project with Firestore enabled
- Firebase service account JSON key

### Backend Setup

```bash
cd backend
pip install -r requirements.txt

# Environment variables (.env)
# FIREBASE_CREDENTIALS_PATH=path/to/serviceAccountKey.json
# SECRET_KEY=your-secret-key-change-in-production
# CLASSIFICATION_MODEL_NAME=facebook/bart-large-mnli
# SBERT_MODEL_NAME=sentence-transformers/all-MiniLM-L6-v2
# SIMILARITY_THRESHOLD=0.75
# EMBEDDING_BATCH_SIZE=32

# Run backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

### Running Tests

```bash
cd backend
python -m pytest tests/ -v
```

---

## Priority Formula

```
Score = 0.30 × Urgency(1-3)
      + 0.30 × Severity(1-3)
      + 0.15 × CrowdImpact(1-3, bounded)
      + 0.10 × SLARisk(1-3)
      + 0.10 × LocationCriticality(1-3)
      + 0.05 × History(1-3)

Priority Bands:
  Critical (≥2.5) → 12h SLA
  High     (≥2.0) → 24h SLA
  Medium   (≥1.5) → 72h SLA
  Low      (<1.5) → 168h SLA (7 days)
```

**Crowd Impact is bounded.** Upvotes contribute logarithmically (capped at 1.5). Ward density and semantic similarity count provide additional bounded contributions. No vote brigading can force a Critical priority.

---

## AI Fallback Strategy

Every AI model is designed to degrade gracefully:

| Model | Primary | Fallback |
| ------- | --------- | ---------- |
| DistilBERT | Zero-shot classification | Keyword-based rule engine |
| SBERT | Semantic embeddings | Jaccard keyword similarity |
| YOLOv8 | Object detection | Skipped (image analysis unavailable) |
| Fusion | Text + Image severity | Text-only severity |

All fallbacks are logged. Officers can see whether a result came from ML or rule-based fallback.

---

## Security Notes

- `SECRET_KEY` in `config.py` is for development only. **Rotate in production.**
- All passwords are hashed with Argon2.
- JWT tokens expire after configured `ACCESS_TOKEN_EXPIRE_MINUTES`.
- File uploads are validated for size (5MB max) and type.
- AI model inference runs in background tasks to prevent request timeout.

---

## License

This project is developed as an AI-powered grievance redressal platform for public governance improvement.
