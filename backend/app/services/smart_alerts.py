from datetime import datetime, timedelta
from typing import List, Dict, Any
from collections import defaultdict
import uuid
from ..models import Complaint, ComplaintStatus, ComplaintPriority

def generate_smart_alerts(db: Any, days: int = 7) -> List[Dict[str, Any]]:
    """
    Generate heuristic-based smart alerts for administrators and departments.
    Evaluates complaints over the last X days to find anomalies.
    """
    cutoff_date = datetime.utcnow() - timedelta(days=days)
    
    docs = db.collection('complaints').where('created_at', '>=', cutoff_date).get()
    
    complaints = []
    for doc in docs:
        try:
            complaints.append(Complaint(**{**doc.to_dict(), "id": doc.id}))
        except Exception:
            pass
            
    alerts = []
    
    # 1. Hotspot Spike Detection
    # If a ward has >5 unresolved complaints of the same category in the last 7 days.
    ward_category_counts = defaultdict(list)
    for c in complaints:
        if c.status not in [ComplaintStatus.RESOLVED, ComplaintStatus.CLOSED] and c.ward and c.category:
            ward_category_counts[(c.ward, c.category)].append(c)
            
    for (ward, category), group in ward_category_counts.items():
        if len(group) >= 5:
            alerts.append({
                "alert_id": str(uuid.uuid4()),
                "type": "SPIKE",
                "severity": "HIGH",
                "title": f"Spike in {category} issues in {ward}",
                "message": f"There are {len(group)} unresolved {category} complaints reported in {ward} recently. Immediate attention recommended.",
                "ward": ward,
                "category": category,
                "related_complaint_ids": [c.id for c in group[:5]],
                "generated_at": datetime.utcnow().isoformat()
            })
            
    # 2. Escalation Risk (Critical issue untouched for 24h)
    escalation_cutoff = datetime.utcnow() - timedelta(hours=24)
    for c in complaints:
        if c.priority in [ComplaintPriority.CRITICAL, ComplaintPriority.HIGH] and c.status == ComplaintStatus.SUBMITTED:
            if c.created_at.replace(tzinfo=None) < escalation_cutoff:
                alerts.append({
                    "alert_id": str(uuid.uuid4()),
                    "type": "ESCALATION_RISK",
                    "severity": "CRITICAL",
                    "title": f"Escalation Risk: Untouched Critical Issue",
                    "message": f"A high-priority {c.category} complaint has been sitting unassigned for over 24 hours.",
                    "ward": c.ward,
                    "category": c.category,
                    "related_complaint_ids": [c.id],
                    "generated_at": datetime.utcnow().isoformat()
                })
                
    return sorted(alerts, key=lambda x: 1 if x["severity"] == "CRITICAL" else 2)
