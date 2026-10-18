from datetime import datetime, timedelta
from typing import List, Dict, Any
from google.cloud import firestore
from ..models import Complaint, ComplaintStatus

def get_department_performance(db: Any, days: int = 30) -> List[Dict[str, Any]]:
    """
    Calculate performance metrics for all departments over the last X days.
    """
    cutoff_date = datetime.utcnow() - timedelta(days=days)
    
    # Get all departments
    dept_docs = db.collection('departments').get()
    departments = {d.id: d.to_dict().get('name', 'Unknown') for d in dept_docs}
    
    # Get complaints in period
    complaints_query = db.collection('complaints').where('created_at', '>=', cutoff_date).get()
    
    metrics = {
        dept_id: {
            "department_id": dept_id,
            "department_name": name,
            "total_complaints": 0,
            "resolved_complaints": 0,
            "response_times": [],
            "resolution_times": [],
            "sla_breaches": 0,
            "ratings": [],
        }
        for dept_id, name in departments.items()
    }
    
    for doc in complaints_query:
        try:
            c = Complaint(**{**doc.to_dict(), "id": doc.id})
        except Exception:
            continue
            
        dept_id = c.department_id
        if not dept_id or dept_id not in metrics:
            continue
            
        m = metrics[dept_id]
        m["total_complaints"] += 1
        
        # Calculate response time (time until assigned or in_progress)
        # For simplicity, if it's assigned, assume response time = updated_at - created_at (if status is ASSIGNED)
        # A more robust way is querying status logs, but for performance we'll use a heuristic.
        
        if c.status in [ComplaintStatus.RESOLVED, ComplaintStatus.CLOSED]:
            m["resolved_complaints"] += 1
            if c.resolved_at and c.created_at:
                res_time = (c.resolved_at.replace(tzinfo=None) - c.created_at.replace(tzinfo=None)).total_seconds() / 3600.0
                m["resolution_times"].append(max(0, res_time))
                
            if c.citizen_rating:
                m["ratings"].append(c.citizen_rating)
                
        if c.deadline and c.resolved_at and c.resolved_at > c.deadline:
            m["sla_breaches"] += 1
        elif c.deadline and c.status not in [ComplaintStatus.RESOLVED, ComplaintStatus.CLOSED] and datetime.utcnow() > c.deadline.replace(tzinfo=None):
             m["sla_breaches"] += 1

    # Finalize
    results = []
    for m in metrics.values():
        total = m["total_complaints"]
        res_times = m["resolution_times"]
        ratings = m["ratings"]
        
        results.append({
            "department_id": m["department_id"],
            "department_name": m["department_name"],
            "total_complaints": total,
            "resolved_complaints": m["resolved_complaints"],
            "avg_response_time_hours": 0.0, # Placeholder until logs are fully parsed
            "avg_resolution_time_hours": round(sum(res_times) / len(res_times), 2) if res_times else 0.0,
            "sla_breach_rate": round((m["sla_breaches"] / total * 100), 2) if total > 0 else 0.0,
            "avg_citizen_rating": round(sum(ratings) / len(ratings), 2) if ratings else 0.0,
            "feedback_count": len(ratings)
        })
        
    return sorted(results, key=lambda x: x['total_complaints'], reverse=True)
