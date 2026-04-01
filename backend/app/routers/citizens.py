"""
Citizens Router for Samadhan Setu
Handles complaint submission, tracking, and community features
"""
from typing import List, Optional, Any
from datetime import datetime, timedelta
import os
import uuid
import shutil
from fastapi import APIRouter, Depends, HTTPException, status, Query, File, UploadFile
from google.cloud.firestore import Query as FirestoreQuery

from ..database import get_db
from ..auth import get_current_user, require_citizen
from ..models import (
    User, UserRole, Complaint, ComplaintStatus, ComplaintPriority,
    ComplaintStatusLog, Department, CategoryMapping, SLARule
)
from ..schemas import (
    ComplaintCreate, ComplaintResponse, ComplaintListResponse,
    ComplaintAIResponse
)

from ..ai import process_complaint # Keep for backward compat if needed
from ..services.ai_bridge import ai_bridge
from ..ai.priority import calculate_hybrid_priority

# Create uploads directory for citizen images
CITIZEN_UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads", "citizen")
os.makedirs(CITIZEN_UPLOAD_DIR, exist_ok=True)

router = APIRouter(prefix="/api/complaints", tags=["Citizens"])


@router.post("/", response_model=ComplaintResponse, status_code=status.HTTP_201_CREATED)
async def submit_complaint(
    complaint_data: ComplaintCreate,
    current_user: User = Depends(get_current_user),
    db: Any = Depends(get_db)
):
    """
    Submit a new complaint (citizens only)
    AI automatically classifies category and assigns priority
    """
    classification = ai_bridge.classify_complaint(complaint_data.description)
    ai_result = {
        'category': classification['category'],
        'confidence': classification['confidence']
    }
    
    levels = ai_bridge.get_urgency_severity(complaint_data.description)
    priority_data = calculate_hybrid_priority(
        levels['urgency'],
        levels['severity'],
        0
    )
    
    # Get category mapping from Firestore
    cat_docs = db.collection('category_mappings').where('category', '==', ai_result['category']).limit(1).get()
    department_id = None
    if cat_docs:
        cat_map = CategoryMapping.from_firestore(cat_docs[0])
        department_id = cat_map.department_id
        
    priority_map = {
        'Low': ComplaintPriority.LOW,
        'Medium': ComplaintPriority.MEDIUM,
        'High': ComplaintPriority.HIGH
    }
    
    new_complaint = Complaint(
        user_id=current_user.id,
        category=ai_result['category'],
        description=complaint_data.description,
        location=complaint_data.location,
        ward=complaint_data.ward,
        latitude=complaint_data.latitude,
        longitude=complaint_data.longitude,
        priority=priority_map.get(priority_data['priority'], ComplaintPriority.LOW),
        urgency_score=int(priority_data['score'] * 3.33),
        ai_confidence=ai_result['confidence'],
        status=ComplaintStatus.PENDING,
        department_id=department_id,
        is_public=complaint_data.is_public,
        upvotes=0,
        attachments=[],
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow()
    )
    
    # Calculate SLA from Firestore
    sla_docs = db.collection('sla_rules').where('priority', '==', new_complaint.priority.value).get()
    if not sla_docs:
        sla_docs = db.collection('sla_rules').where('priority', '==', None).get()

    default_hours = {'High': 24, 'Medium': 48, 'Low': 72}
    resolution_hours = default_hours.get(new_complaint.priority.value, 72)
    if sla_docs:
        sla_rule = SLARule.from_firestore(sla_docs[0])
        resolution_hours = sla_rule.resolution_hours
        
    new_complaint.deadline = new_complaint.created_at + timedelta(hours=resolution_hours)
    
    # Save Complaint
    comp_ref = db.collection('complaints').document()
    new_complaint.id = comp_ref.id
    comp_ref.set(new_complaint.to_firestore())

    # Create initial status log
    status_log = ComplaintStatusLog(
        complaint_id=new_complaint.id,
        status=ComplaintStatus.PENDING,
        remarks="Complaint submitted and auto-classified by AI",
        updated_by=current_user.id
    )
    db.collection('complaint_status_logs').add(status_log.to_firestore())
    
    # AI Team Assignment (Feature 1) - Let assignment optimizier handle firestore refactor separately
    try:
        from ..services.assignment_optimizer import assign_complaint
        assignment_result = assign_complaint(db, new_complaint)
        if assignment_result and assignment_result.get("success"):
            print(f"AI Assignment: Complaint #{new_complaint.id} -> Team {assignment_result.get('team_name')}")
    except Exception as e:
        print(f"Team assignment deferred: {e}")
        
    return ComplaintResponse.model_validate(new_complaint)


@router.post("/verify-priority")
async def verify_priority_check(
    urgency: str = Query(..., enum=["Low", "Medium", "High"]),
    severity: str = Query(..., enum=["Low", "Medium", "High"]),
    upvotes: int = Query(0, ge=0)
):
    return calculate_hybrid_priority(urgency, severity, upvotes)


@router.post("/check-similar")
async def check_similar_complaints(
    description: str = Query(..., min_length=10, description="Complaint description to check"),
    current_user: User = Depends(get_current_user),
    db: Any = Depends(get_db)
):
    # Fetch recent complaints from Firestore
    docs = db.collection('complaints').order_by('created_at', direction=FirestoreQuery.DESCENDING).limit(100).get()
    existing_complaints = [Complaint.from_firestore(doc) for doc in docs]
    
    existing_data = [
        {"id": c.id, "text": c.description}
        for c in existing_complaints
    ]
    
    similar = ai_bridge.get_similar_complaints(description, existing_data)
    
    enriched_results = []
    for result in similar[:5]:
        doc = db.collection('complaints').document(result["complaint_id"]).get()
        if doc.exists:
            complaint = Complaint.from_firestore(doc)
            enriched_results.append({
                "complaint_id": complaint.id,
                "similarity_score": result["similarity_score"],
                "category": complaint.category,
                "status": complaint.status.value,
                "description": complaint.description[:150] + "..." if len(complaint.description) > 150 else complaint.description,
                "location": complaint.location,
                "created_at": complaint.created_at.isoformat() if complaint.created_at else None
            })
    
    return {
        "similar_complaints": enriched_results,
        "has_similar": len(enriched_results) > 0
    }


@router.post("/{complaint_id}/upload-images")
async def upload_complaint_images(
    complaint_id: str,
    files: List[UploadFile] = File(...),
    current_user: User = Depends(get_current_user),
    db: Any = Depends(get_db)
):
    doc_ref = db.collection('complaints').document(complaint_id)
    doc = doc_ref.get()
    
    if not doc.exists:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Complaint not found"
        )
        
    complaint = Complaint.from_firestore(doc)
    
    if complaint.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the complaint owner can upload images"
        )
    
    existing = complaint.attachments or []
    if len(existing) + len(files) > 5:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Maximum 5 images allowed. Currently have {len(existing)}"
        )
    
    uploaded_files = []
    for file in files:
        if not file.content_type.startswith("image/"):
            continue
        
        content = await file.read()
        if len(content) > 10 * 1024 * 1024:
            continue
        await file.seek(0)
        
        ext = os.path.splitext(file.filename)[1] or ".jpg"
        unique_name = f"{complaint_id}_{uuid.uuid4().hex[:8]}{ext}"
        file_path = os.path.join(CITIZEN_UPLOAD_DIR, unique_name)
        
        with open(file_path, "wb") as f:
            shutil.copyfileobj(file.file, f)
        
        uploaded_files.append(f"/uploads/citizen/{unique_name}")
    
    updated_attachments = existing + uploaded_files
    doc_ref.update({'attachments': updated_attachments})
    
    return {
        "message": f"Successfully uploaded {len(uploaded_files)} image(s)",
        "attachments": updated_attachments
    }


@router.get("/preview-ai", response_model=ComplaintAIResponse)
async def preview_ai_classification(
    description: str = Query(..., min_length=10, description="Complaint description"),
    current_user: User = Depends(get_current_user)
):
    classification = ai_bridge.classify_complaint(description)
    levels = ai_bridge.get_urgency_severity(description)
    priority_data = calculate_hybrid_priority(
        levels['urgency'],
        levels['severity'],
        0 
    )
    
    return ComplaintAIResponse(
        category=classification['category'],
        priority=priority_data['priority'],
        urgency_score=int(priority_data['score'] * 3.33),
        confidence=classification['confidence'],
        department_id=None
    )


@router.get("/my", response_model=List[ComplaintResponse])
async def get_my_complaints(
    status_filter: Optional[ComplaintStatus] = None,
    current_user: User = Depends(get_current_user),
    db: Any = Depends(get_db)
):
    query = db.collection('complaints').where('user_id', '==', current_user.id)
    if status_filter:
        query = query.where('status', '==', status_filter.value)
        
    docs = query.get()
    complaints = [Complaint.from_firestore(doc) for doc in docs]
    complaints.sort(key=lambda x: x.created_at, reverse=True)
    
    return [ComplaintResponse.model_validate(c) for c in complaints]


@router.get("/public", response_model=List[ComplaintResponse])
async def get_public_complaints(
    category: Optional[str] = None,
    sort_by: str = Query("recent", enum=["recent", "upvotes", "priority"]),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: Any = Depends(get_db)
):
    query = db.collection('complaints').where('is_public', '==', True)
    if category:
        query = query.where('category', '==', category)
        
    docs = query.get()
    complaints = [Complaint.from_firestore(doc) for doc in docs]
    
    if sort_by == "upvotes":
        complaints.sort(key=lambda x: x.upvotes, reverse=True)
    elif sort_by == "priority":
        priority_order = {"High": 3, "Medium": 2, "Low": 1}
        complaints.sort(key=lambda x: (priority_order.get(x.priority.value, 0), x.created_at), reverse=True)
    else:
        complaints.sort(key=lambda x: x.created_at, reverse=True)
        
    offset = (page - 1) * per_page
    paginated_complaints = complaints[offset:offset + per_page]
    
    return [ComplaintResponse.model_validate(c) for c in paginated_complaints]


@router.get("/{complaint_id}", response_model=ComplaintResponse)
async def get_complaint(
    complaint_id: str,
    current_user: User = Depends(get_current_user),
    db: Any = Depends(get_db)
):
    doc = db.collection('complaints').document(complaint_id).get()
    if not doc.exists:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Complaint not found"
        )
        
    complaint = Complaint.from_firestore(doc)
    
    if not (
        complaint.user_id == current_user.id or
        complaint.is_public or
        current_user.role in [UserRole.OFFICER, UserRole.ADMIN]
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )
    
    return ComplaintResponse.model_validate(complaint)


@router.post("/{complaint_id}/upvote")
async def upvote_complaint(
    complaint_id: str,
    current_user: User = Depends(get_current_user),
    db: Any = Depends(get_db)
):
    doc_ref = db.collection('complaints').document(complaint_id)
    doc = doc_ref.get()
    
    if not doc.exists:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Complaint not found or not public"
        )
        
    complaint = Complaint.from_firestore(doc)
    if not complaint.is_public:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Complaint not public"
        )
        
    new_upvotes = complaint.upvotes + 1
    
    # Priority uses 'old' logic from original codebase, stubbing since we don't have calculate_priority imported correctly
    # Falling back to hybrid priority using original scoring
    levels = ai_bridge.get_urgency_severity(complaint.description)
    priority_data = calculate_hybrid_priority(levels['urgency'], levels['severity'], new_upvotes)
    
    priority_map = {
        'Low': ComplaintPriority.LOW,
        'Medium': ComplaintPriority.MEDIUM,
        'High': ComplaintPriority.HIGH
    }
    
    new_priority = priority_map.get(priority_data['priority'], complaint.priority)
    new_urgency = int(priority_data['score'] * 3.33)
    
    doc_ref.update({
        'upvotes': new_upvotes,
        'priority': new_priority.value,
        'urgency_score': new_urgency
    })
    
    return {"message": "Upvoted successfully", "upvotes": new_upvotes}


@router.post("/{complaint_id}/rate-resolution")
async def rate_resolution(
    complaint_id: str,
    rating: str = Query(..., enum=["satisfied", "unsatisfied"], description="Resolution rating"),
    current_user: User = Depends(get_current_user),
    db: Any = Depends(get_db)
):
    doc_ref = db.collection('complaints').document(complaint_id)
    doc = doc_ref.get()
    
    if not doc.exists:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Complaint not found"
        )
        
    complaint = Complaint.from_firestore(doc)
    
    if complaint.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the complaint owner can rate the resolution"
        )
    
    if complaint.status != ComplaintStatus.RESOLVED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only resolved complaints can be rated"
        )
    
    updates = {}
    resolution_upvotes = complaint.resolution_upvotes or 0
    resolution_downvotes = complaint.resolution_downvotes or 0
    
    if rating == "satisfied":
        resolution_upvotes += 1
        updates['resolution_upvotes'] = resolution_upvotes
    else:
        resolution_downvotes += 1
        updates['resolution_downvotes'] = resolution_downvotes
        
    needs_reconsideration = resolution_downvotes > resolution_upvotes
    updates['needs_reconsideration'] = needs_reconsideration
    
    status_value = complaint.status.value
    if needs_reconsideration:
        status_value = ComplaintStatus.IN_PROGRESS.value
        updates['status'] = status_value
        
        status_log = ComplaintStatusLog(
            complaint_id=complaint.id,
            status=ComplaintStatus.IN_PROGRESS,
            remarks="Reopened due to citizen dissatisfaction - needs reconsideration",
            updated_by=current_user.id
        )
        db.collection('complaint_status_logs').add(status_log.to_firestore())
    
    doc_ref.update(updates)
    
    return {
        "message": "Rating submitted successfully",
        "resolution_upvotes": resolution_upvotes,
        "resolution_downvotes": resolution_downvotes,
        "needs_reconsideration": needs_reconsideration,
        "status": status_value
    }
