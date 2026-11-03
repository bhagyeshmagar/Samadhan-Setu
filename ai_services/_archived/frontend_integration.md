# Frontend Integration Guide: AI Services

This guide helps frontend developers integrate the AI capabilities into the Grievance Reporting UI.

## Overview
We have **three** AI-powered features available:
1.  **Similarity Detection**: Finds duplicate complaints.
2.  **Auto-Classification**: Suggests the complaint category.
3.  **Transparent Priority**: Calculates urgency, severity, and SLA deadlines.
4.  **AI-Generated Insights**: Detects recurring patterns/clusters (Admin only).

---

## Feature 1: Similarity Detection
... (stays same) ...

---

## Feature 2: Auto-Categorization
... (stays same) ...

---

## Feature 3: Priority & SLA Assessment

**Goal**: Show users and officers the calculated priority and expected resolution time.

**Endpoint**: `POST /api/complaints/verify-priority`
```json
// Request
{ 
  "urgency": "High", 
  "severity": "Medium", 
  "upvotes": 5 
}

// Response
{
  "score": 2.7,
  "priority": "High",
  "sla_hours": 24,
  "breakdown": { "urgency_val": 3, "severity_val": 2, "crowd_val": 1.5 }
}
```

---

## Complete AI Hook Example

```javascript
// hooks/useAIServices.js

export function useAIServices() {
  const classify = async (text) => { /* ... */ };
  
  const getPriority = async (urgency, severity, upvotes) => {
    const res = await fetch('/api/complaints/priority-check', {
      method: 'POST',
      body: JSON.stringify({ urgency, severity, upvotes })
    });
    return await res.json();
  };

  return { classify, getPriority };
}
```

---

## Feature 4: AI-Generated Insights (Admin)

**Goal**: Show administrators recurring patterns (e.g., systemic water issues in a specific ward).

**Endpoint**: `GET /api/admin/insights/clusters`
```json
// Response (Array of Insights)
[
  {
    "insight_name": "Recurring Water & Leakage patterns in Ward 5",
    "category": "Water Supply",
    "support_count": 3,
    "locations": ["Ward 5"],
    "complaint_ids": [1, 2, 3],
    "top_keywords": ["water", "leakage", "pipe", "market"]
  }
]
```


