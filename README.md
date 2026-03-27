## 🏛️ PS-12: AI for Grievance Redressal in Public Governance

### 📌 Problem Statement

Public governance bodies receive **thousands of citizen grievances every day**, covering a wide range of public services, including:

- Civic infrastructure (roads, drainage, streetlights)
- Sanitation and waste management
- Public safety and utilities (water, electricity)
- Healthcare and education services
- Administrative delays and service inefficiencies

These grievances typically face the following challenges:

- **Unstructured input**: Free-text complaints, informal language, mixed languages
- **Manual review and routing**, leading to heavy human dependency
- **Slow resolution cycles**, causing large operational backlogs
- **Lack of accountability and transparency** in grievance handling
- **Limited data insights**, making it difficult to identify recurring or systemic issues

Due to the absence of intelligent prioritization and automation, **critical grievances are often delayed**, while low-impact issues consume administrative resources. This results in citizen dissatisfaction, inefficient governance, and largely reactive decision-making.

There is a pressing need for an **AI-powered grievance redressal system** that can intelligently understand, categorize, prioritize, and analyze citizen complaints at scale—enabling **faster, fairer, and more transparent public governance**.

---

## 👥 Team

**Team Name:** **Strawhats**  
**Event:** ByteQuest 2025  
**Problem Statement:** PS-12 – AI for Grievance Redressal in Public Governance

---

## Project Name: Samadhan Setu
**AI-Powered Grievance Redressal Platform**

---
## 🎥 Demonstration

📌 **Demo Video & Presentation (PPT):**  
👉 https://drive.google.com/drive/folders/15amJ3RHyh0-A6fI3VCVCXVB1-v-acGHQ

The demo showcases:
- End-to-end grievance submission and tracking
- AI-based classification, prioritization, and duplicate detection
- Officer handling dashboard with proof-of-resolution
- Analytics, heatmaps, and AI-generated insights

---

## 📋 Environment Variables Reference

### Backend Configuration

Create a `.env` file in the `backend` directory:

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://postgres:postgres@localhost:5432/samadhan_setu` | ✅ Yes |
| `SECRET_KEY` | JWT secret key (change in production!) | `samadhan-setu-secret-key-change-in-production` | ✅ Yes |
| `SBERT_MODEL_NAME` | Sentence transformer model | `sentence-transformers/all-MiniLM-L6-v2` | ❌ No |
| `SIMILARITY_THRESHOLD` | Duplicate detection threshold (0-1) | `0.75` | ❌ No |
| `DUPLICATE_THRESHOLD` | Exact duplicate threshold (0-1) | `0.90` | ❌ No |
| `CLASSIFICATION_MODEL_NAME` | Zero-shot classification model | `typeform/distilbert-base-uncased-mnli` | ❌ No |
| `CLASSIFICATION_CONFIDENCE_THRESHOLD` | ML confidence threshold (0-1) | `0.60` | ❌ No |
| `EMBEDDING_BATCH_SIZE` | Batch size for embeddings | `32` | ❌ No |

### Frontend Configuration

Create a `.env.local` file in the `frontend` directory:

| Variable | Description | Example |
|----------|-------------|---------|
| `NEXT_PUBLIC_API_URL` | Backend API URL | `http://localhost:8000` (dev)<br/>`https://api.yourdomain.com` (prod) |


## 🎯 Overview

Samadhan Setu is an intelligent grievance redressal platform that uses AI to automatically classify citizen complaints, prioritize them based on urgency, and route them to the appropriate government departments for swift resolution.

### Key Features

- **🆕 Proof of Resolution**: Officers can upload multiple images as verifiable proof of fixed issues
- **🆕 Handle Dashboard**: Detailed workspace for officers with SLA timers and citizen communication
- **AI-Powered Classification**: Hybrid AI (DistilBERT + Rules) for accurate categorization
- **Similarity Detection**: Prevents duplicate complaints using SBERT Semantic Search
- **🆕 AI Auto-Assignment**: Load-balanced team assignment with SLA-aware reassignment
- **🆕 AI Heatmap Analytics**: Issue density visualization by category and locality
- **Smart Prioritization**: Urgency detection based on keywords and context
- **Real-time Tracking**: Citizens can track their complaint status
- **Department Dashboard**: Officers can manage and resolve assigned complaints
- **Community Upvoting**: Public complaints can be upvoted to boost priority
- **AI-Generated Insights**: Recurring issue detection using semantic clustering (Task #8)
- **Admin Analytics**: Comprehensive statistics and department management

## 🏗️ Architecture

```
├── AI-services/            # AI Microservices
│   ├── classification/     # Hybrid DistilBERT Classifier
│   └── similarity/         # SBERT Similarity Detection
│
├── backend/                 # FastAPI Python Backend
│   ├── app/
│   │   ├── services/       # AI Services (Auto-Assignment, Heatmap, Clustering)
│   │   ├── models/         # SQLAlchemy Models (+ Teams, TaskAssignments)
│   │   ├── routers/        # API Routes (+ Assignments, Analytics)
│   │   ├── schemas/        # Pydantic Schemas
│   │   └── main.py         # FastAPI Application
│   └── seed_data.py        # Demo Data Seeder
│
├── frontend/               # Next.js React Frontend
│   └── src/
│       ├── app/           # App Router Pages
│       ├── components/    # Shared Components
│       └── lib/           # API Client & Auth
```

## 🚀 Quick Start

### Prerequisites

**System Requirements:**
- **Python** 3.9 or higher
- **Node.js** 18 or higher
- **npm** (comes with Node.js)
- **PostgreSQL** 14 or higher
- **Disk Space**: ~3GB (for AI models and dependencies)
- **RAM**: 4GB minimum, 8GB recommended (for AI model inference)

### 1. Setup PostgreSQL Database

**Option A: Using psql (Command Line)**
```bash
# Start PostgreSQL service (Windows)
net start postgresql-x64-14

# Create database
psql -U postgres
CREATE DATABASE samadhan_setu;
\q
```

**Option B: Using pgAdmin (GUI)**
1. Open pgAdmin and connect to your PostgreSQL server
2. Right-click "Databases" → Create → Database
3. Name it `samadhan_setu`

**Configure Database Connection:**
```bash
# Windows
set DATABASE_URL=postgresql://postgres:yourpassword@localhost:5432/samadhan_setu

# Linux/Mac
export DATABASE_URL=postgresql://postgres:yourpassword@localhost:5432/samadhan_setu
```

### 2. Clone & Setup Backend

```bash
cd backend

# Create virtual environment (strongly recommended)
python -m venv venv

# Activate virtual environment
venv\Scripts\activate  # Windows
# source venv/bin/activate  # Linux/Mac

# Install dependencies (first run may take 5-10 minutes for AI models)
pip install -r requirements.txt

# Setup environment variables
copy .env.example .env  # Windows
# cp .env.example .env  # Linux/Mac

# Edit .env file with your database credentials
# DATABASE_URL=postgresql://postgres:yourpassword@localhost:5432/samadhan_setu

# Initialize database schema
python create_db.py

# Seed demo data (optional but recommended for testing)
python seed_data.py

# Start backend server
uvicorn app.main:app --reload
```

✅ Backend will run at: `http://localhost:8000`

📚 API Docs: `http://localhost:8000/docs`

> **Note**: First run will download AI models (~2GB). Ensure stable internet connection.

### 3. Setup Frontend

```bash
cd frontend

# Install dependencies
npm install

# Create environment file (optional for local development)
# For production, set NEXT_PUBLIC_API_URL to your backend URL
echo NEXT_PUBLIC_API_URL=http://localhost:8000 > .env.local

# Start development server
npm run dev
```

✅ Frontend will run at: `http://localhost:3000`

## 🔑 Demo Credentials

| Role | Email | Password |
|------|-------|----------|
| 👤 Citizen | citizen@demo.com | demo123 |
| 👮 Officer (Roads) | officer@roads.gov.in | demo123 |
| 👮 Officer (Water) | officer@water.gov.in | demo123 |
| 🔧 Admin | admin@samadhan.gov.in | demo123 |

## 📱 User Flows

### Citizen Flow
1. Login/Register as citizen
2. Lodge a grievance with description and location
3. AI automatically detects category and priority
4. Track complaint status in "My Status"
5. View and upvote community complaints

### Department Officer Flow
1. Login as department officer
2. View complaints sorted by priority
3. Click "Handle" on a complaint to open the detailed workspace
4. Upload proof images and add resolution remarks
5. Mark as "Resolved" to notify the citizen

### Admin Flow
1. Login as admin
2. View comprehensive statistics dashboard
3. Monitor category breakdown and priority distribution
4. Manage departments and SLA rules

## 🧠 AI Services Modules

We have implemented **two advanced AI services** to make the platform intelligent and efficient:

### 1. Hybrid Classification Service
*   **Goal**: Automatically tag complaints (e.g., "Wire sparking" → "Electricity").
*   **Tech**: **DistilBERT (Zero-Shot)** + **Rule-Based Fallback**.
*   **Logic**:
    1.  Uses `distilbert-base-uncased-mnli` to understand context.
    2.  If confidence < 60%, falls back to keyword rules (Safety Net).
    3.  Ensures **High Accuracy** vs **High Reliability**.

### 2. Similarity Detection Service
*   **Goal**: Detect duplicate complaints in real-time to save officer time.
*   **Tech**: **SBERT (`all-MiniLM-L6-v2`)** + **Cosine Similarity**.
*   **Logic**:
    1.  Converts complaint text into 384-dimensional vector embeddings.
    2.  Compares with existing database embeddings.
    3.  Flags matches with > 75% semantic similarity (e.g., "Water leaking" ≈ "Burst pipe").

### 3. Urgency & Severity Detection Service
*   **Goal**: Intelligently assess time-sensitivity (urgency) and impact (severity) of complaints.
*   **Tech**: **DistilBERT (Zero-Shot)** with **Partial ML Acceptance**.
*   **Logic**:
    1.  Runs two independent zero-shot classifications for urgency and severity.
    2.  Uses ML result if confidence is high (≥65% for urgency, ≥60% for severity).
    3.  Falls back to rule-based scoring when ML is uncertain.

### 4. AI Auto-Assignment Service 🆕
*   **Goal**: Automatically assign complaints to optimal team based on workload.
*   **Tech**: Load-Scoring Algorithm + SLA Awareness.
*   **Logic**:
    ```
    Load Score = (active_tasks / capacity) + priority_weight + deadline_pressure
    ```
    1.  Calculates load score for each available team.
    2.  Assigns to team with lowest score that covers the ward.
    3.  Auto-reassigns if SLA breach risk detected.

### 5. AI Heatmap Analytics Service 🆕
*   **Goal**: Visualize issue density for proactive governance.
*   **Tech**: Aggregation + Semantic Clustering.
*   **Features**:
    *   Category-wise heatmaps (which issues are most common)
    *   Locality-wise heatmaps (which areas have most issues)
    *   Recurring issue detection (identify systemic problems)
    *   Time-trend analysis

### 6. AI-Generated Insights Service (Task #8) 🆕
*   **Goal**: Find hidden "clusters" of problems for proactive governance.
*   **Tech**: **SBERT (`all-MiniLM-L6-v2`)** + **K-Means Clustering**.
*   **Logic**:
    1.  Groups complaints using a dynamic K-Means approach (`K = sqrt(N)`).
    2.  Extracts top keywords and locations from each cluster.
    3.  Generates descriptive summaries like "Recurring Pipe issues in Ward 5".
    4.  Excludes "Isolated Issues" (noise) to highlight meaningful trends.

### Why Hybrid ML + Rule-Based?
> Public governance systems require reliability. ML predictions are used only when confidence is high. Otherwise, deterministic rules ensure safe, explainable decision-making.

### 6. Priority Calculation Logic
Samadhan Setu uses a **transparent, transparent scoring formula** (not a black box) to ensure fairness, accountability, and explainability in public governance.

**The Formula:**
`Priority Score = (0.4 × Urgency) + (0.4 × Severity) + (0.2 × Normalized Crowd Impact)`

*   **Urgency & Severity**: Detected by AI Service #3 (Low=1, Medium=2, High=3).
*   **Normalized Crowd Impact**: Calculated as `min(upvotes, 10) / 10`. This ensures that citizen feedback influences priority but never dominates risk assessment.
*   **Governance Safety Rule**: A hard safety rule prevents any incident flagged as "Low" urgency AND "Low" severity from ever reaching "High" priority, regardless of the number of upvotes. This prevents "popularity gaming" of the system for minor issues.

**Priority Levels & SLA Deadlines:**
| Score Range | Priority Level | SLA Deadline |
| :--- | :--- | :--- |
| Score ≥ 2.5 | **High** | 24 Hours |
| Score ≥ 1.7 | **Medium** | 72 Hours |
| Score < 1.7 | **Low** | 7 Days (168 Hours) |

---


## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 16.1, React 19, Tailwind CSS 4, Lucide Icons |
| Maps | Leaflet, React-Leaflet |
| Backend | FastAPI, SQLAlchemy, Pydantic |
| Database | PostgreSQL 14+ |
| Auth | JWT with Argon2 hashing |
| AI (Classification) | **DistilBERT** (Hugging Face Transformers) |
| AI (Similarity) | **SBERT** (Sentence Transformers) |
| AI (Clustering) | **K-Means** (scikit-learn) |
| ML Framework | PyTorch 2.0+ |

## 🔮 Future Roadmap

- [ ] Mobile app (React Native)
- [ ] Voice complaint submission
- [x] DistilBERT classification model (Implemented)
- [x] Semantic Similarity Detection (Implemented)
- [ ] Government API integrations
- [ ] Multi-city support
- [ ] WhatsApp/SMS notifications

## 🚀 Deployment

### Production Deployment Checklist

**1. Environment Variables**

Create a `.env` file in the `backend` directory with production values:

```bash
# Production Database (use hosted PostgreSQL)
DATABASE_URL=postgresql://user:password@your-db-host:5432/samadhan_setu

# Generate a strong secret key (use: openssl rand -hex 32)
SECRET_KEY=your-super-secure-secret-key-here-change-this

# AI Services (optional overrides)
SBERT_MODEL_NAME=sentence-transformers/all-MiniLM-L6-v2
SIMILARITY_THRESHOLD=0.75
CLASSIFICATION_CONFIDENCE_THRESHOLD=0.60
```

**2. Database Setup**

```bash
# Run migrations on production database
python create_db.py

# Optional: Seed initial data
python seed_data.py
```

**3. Backend Deployment**

**Recommended Platforms:**
- **Railway** (Easy deployment with PostgreSQL addon)
- **Render** (Free tier available)
- **Heroku** (Classic choice)
- **AWS EC2** (Full control)

**Example: Deploy to Railway**
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and initialize
railway login
railway init

# Add PostgreSQL addon in Railway dashboard
# Set environment variables in Railway dashboard

# Deploy
railway up
```

**4. Frontend Deployment**

**Recommended Platform: Vercel** (Optimized for Next.js)

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy from frontend directory
cd frontend
vercel

# Set environment variable in Vercel dashboard:
# NEXT_PUBLIC_API_URL=https://your-backend-url.railway.app
```

**Alternative: Netlify, AWS Amplify, or self-hosted**

**5. Security Considerations**

- ✅ Change `SECRET_KEY` to a strong random value
- ✅ Use environment variables (never commit `.env`)
- ✅ Enable HTTPS for both frontend and backend
- ✅ Configure CORS to allow only your frontend domain
- ✅ Use strong database passwords
- ✅ Enable database SSL connections
- ✅ Set up regular database backups

**6. Performance Optimization**

- Cache AI model predictions for common queries
- Use connection pooling for PostgreSQL
- Enable Next.js image optimization
- Consider CDN for static assets
- Monitor API response times

## 🔧 Troubleshooting

### Database Connection Issues

**Problem: `psycopg2.OperationalError: could not connect to server`**

**Solutions:**
```bash
# 1. Check if PostgreSQL is running (Windows)
net start postgresql-x64-14

# 2. Verify DATABASE_URL format
# Correct: postgresql://username:password@localhost:5432/dbname
# Common mistake: Missing password or wrong port

# 3. Test connection
python test_db_connection.py
```

**Problem: `relation "users" does not exist`**

**Solution:**
```bash
# Initialize database schema
python create_db.py
```

---

### AI Model Loading Issues

**Problem: `OSError: Can't load tokenizer for 'distilbert-base-uncased-mnli'`**

**Solutions:**
```bash
# 1. Ensure internet connection (first run downloads ~2GB models)
# 2. Check disk space (need ~3GB free)
# 3. Clear cache and retry
rm -rf ~/.cache/huggingface  # Linux/Mac
rmdir /s %USERPROFILE%\.cache\huggingface  # Windows
```

**Problem: `RuntimeError: CUDA out of memory`**

**Solution:**
```python
# AI services automatically use CPU if CUDA unavailable
# For faster inference, reduce batch size in config
EMBEDDING_BATCH_SIZE=16  # Default is 32
```

---

### Frontend Build Issues

**Problem: `Error: Cannot find module 'next'`**

**Solution:**
```bash
# Reinstall dependencies
cd frontend
rm -rf node_modules package-lock.json
npm install
```

**Problem: `Error: listen EADDRINUSE: address already in use :::3000`**

**Solution:**
```bash
# Windows: Kill process on port 3000
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# Linux/Mac
lsof -ti:3000 | xargs kill -9

# Or use different port
npm run dev -- -p 3001
```

**Problem: Node version mismatch**

**Solution:**
```bash
# Check Node version (need 18+)
node --version

# Update Node.js from nodejs.org
# Or use nvm (Node Version Manager)
nvm install 18
nvm use 18
```

---

### Backend Startup Issues

**Problem: `ModuleNotFoundError: No module named 'fastapi'`**

**Solution:**
```bash
# Ensure virtual environment is activated
venv\Scripts\activate  # Windows
source venv/bin/activate  # Linux/Mac

# Reinstall dependencies
pip install -r requirements.txt
```

**Problem: `ImportError: cannot import name 'Annotated' from 'typing'`**

**Solution:**
```bash
# Upgrade Python to 3.9+ (Annotated requires Python 3.9+)
python --version

# Or install typing_extensions
pip install typing-extensions
```

**Problem: CORS errors in browser console**

**Solution:**
```python
# backend/app/config.py
# Update CORS_ORIGINS to include your frontend URL
CORS_ORIGINS: list = ["http://localhost:3000", "https://your-frontend.vercel.app"]
```

---

### Common Issues

**Problem: "Duplicate complaints not detected"**

**Check:**
- Similarity threshold might be too high (default: 0.75)
- Ensure complaints are in same category
- Check if embeddings are being generated

**Problem: "AI classification always falls back to rules"**

**Check:**
- Models downloaded successfully
- Internet connection during first run
- Check logs for confidence scores

**Problem: "Slow API responses"**

**Solutions:**
- First request is slow (model loading) - subsequent requests are fast
- Consider caching frequently accessed data
- Use database indexes on frequently queried fields


## 📄 API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login with credentials
- `GET /api/auth/me` - Get current user profile

### Citizens
- `POST /api/complaints` - Submit new complaint
- `GET /api/complaints/my` - Get user's complaints
- `GET /api/complaints/public` - Community feed
- `POST /api/complaints/{id}/upvote` - Upvote complaint

### Department
- `GET /api/department/complaints` - Get assigned complaints
- `PUT /api/department/complaints/{id}/status` - Update status

### Admin
- `GET /api/admin/stats` - Dashboard statistics
- `GET /api/admin/departments` - List departments
- `POST /api/admin/mappings` - Create category mapping

### Assignments 🆕
- `GET /api/assignments/teams` - List all teams


- `GET /api/assignments/team/{id}` - Get team's assignments
- `POST /api/assignments/{id}/override` - Manual override
- `POST /api/assignments/check-reassignments` - Trigger AI check

### Analytics 🆕
- `GET /api/analytics/heatmap/category` - Category heatmap
- `GET /api/analytics/heatmap/locality` - Locality heatmap
- `GET /api/analytics/clusters` - Similar complaint clusters
- `GET /api/analytics/recurring-issues` - Recurring patterns
- `GET /api/analytics/summary` - Dashboard summary

## 👥 Team

**Team Strawhats** - ByteQuest 2025

*Built with ❤️ for better governance and citizen empowerment*

---

**Made for ByteQuest 2025** | AI-Powered Grievance Redressal Platform
