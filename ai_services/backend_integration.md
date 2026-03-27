# Backend Integration Guide: AI Services

This guide explains how to hook up **all three** AI-powered features.

**Key Concept**: Always import from `app.services.ai_bridge`, never directly from `AI-services`.

---

## 1. Import the Bridge

```python
from app.services.ai_bridge import (
    get_similar_complaints,
    classify_complaint,
    get_urgency_severity,
    get_complaint_patterns  # NEW: Bridge to Task #8
)
from app.ai.priority import calculate_hybrid_priority # NEW: Formula Logic
```

---

## 2. Feature 1 & 2
... (stays same) ...

---

## 3. Feature 3: Transparent Priority Scoring

The logic is split into two steps:
1.  **AI Detection**: Gets categorical levels (Urgency/Severity).
2.  **Weighted Formula**: Calculates score and SLA.

### Workflow Example

```python
@router.post("/complaints")
def create_complaint(complaint: ComplaintCreate):
    # Step 1: Detect Levels using AI
    # returns {"urgency": "High", "severity": "Medium", ...}
    ai_levels = get_urgency_severity(complaint.description)
    
    # Step 2: Calculate Priority & SLA using transparent formula
    # returns {"score": 2.7, "priority": "High", "sla_hours": 24, ...}
    priority_data = calculate_hybrid_priority(
        ai_levels["urgency"], 
        ai_levels["severity"], 
        complaint.upvotes
    )
    
    # Final Output
    return {
        **ai_levels,
        **priority_data
    }
```

---

## Logic Summary
- **Weights**: 40% Urgency | 40% Severity | 20% Crowd.
- **Guardrail**: "Low/Low" cases are capped and cannot become "High" priority.
- **SLA**: 24h (High) | 72h (Medium) | 7 Days (Low).

---

## 4. Feature 4: AI-Generated Insights (Clustering)

Used in the Admin Dashboard for strategic oversight.

```python
# In routers/admin.py
@router.get("/insights")
def fetch_trends(db: Session = Depends(get_db)):
    complaints = db.query(Complaint).all()
    # Prepare data for AI Bridge
    data = [{"id": c.id, "text": c.description, ...} for c in complaints]
    
    # Get patterns from AI
    insights = get_complaint_patterns(data)
    return insights
```


