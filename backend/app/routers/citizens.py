"""
Citizens Router for Samadhan Setu
Handles complaint submission, tracking, and community features
"""
from typing import List, Optional
from datetime import datetime
import os
import uuid
import shutil
from fastapi import APIRouter, Depends, HTTPException, status, Query, File, UploadFile
from sqlalchemy.orm import Session
from sqlalchemy import desc

from ..database import get_db
from ..auth import get_current_user, require_citizen
from ..models import (
    User, UserRole, Complaint, ComplaintStatus, ComplaintPriority,
    ComplaintStatusLog, Department, CategoryMapping
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
    db: Session = Depends(get_db)
):
    """
    Submit a new complaint (citizens only)
    AI automatically classifies category and assigns priority
    """
    # AI Processing
    # 1. Classify
    classification = ai_bridge.classify_complaint(complaint_data.description)
    ai_result = {
        'category': classification['category'],
        'confidence': classification['confidence']
    }
    
    # 2. Detect Levels
    levels = ai_bridge.get_urgency_severity(complaint_data.description)
    
    # 3. Calculate Priority
    priority_data = calculate_hybrid_priority(
        levels['urgency'],
        levels['severity'],
        0 # New complaints have 0 upvotes
    )
    
    # Find department for routing
    category_mapping = db.query(CategoryMapping).filter(
        CategoryMapping.category == ai_result['category']
    ).first()
    
    department_id = category_mapping.department_id if category_mapping else None
    
    # Map priority string to enum
    priority_map = {
        'Low': ComplaintPriority.LOW,
        'Medium': ComplaintPriority.MEDIUM,
        'High': ComplaintPriority.HIGH
    }
    
    # Create complaint
    new_complaint = Complaint(
        user_id=current_user.id,
        category=ai_result['category'],
        description=complaint_data.description,
        location=complaint_data.location,
        ward=complaint_data.ward,
        latitude=complaint_data.latitude,
        longitude=complaint_data.longitude,
        priority=priority_map.get(priority_data['priority'], ComplaintPriority.LOW),
        urgency_score=int(priority_data['score'] * 3.33), # Map 3.0 scale to ~10 scale roughly or just store raw
        ai_confidence=ai_result['confidence'],
        status=ComplaintStatus.PENDING,
        department_id=department_id,
        is_public=complaint_data.is_public,
        upvotes=0
    )
    
    db.add(new_complaint)
    db.commit()
    db.refresh(new_complaint)
    
    # Calculate SLA deadline based on priority
    from datetime import timedelta
    from ..models.sla import SLARule
    
    # Lookup SLA rule (priority-specific first, then fallback to default)
    sla_rule = db.query(SLARule).filter(
        (SLARule.priority == new_complaint.priority) | (SLARule.priority == None)
    ).order_by(SLARule.priority.desc().nullslast()).first()
    
    # Default resolution hours based on priority if no SLA rule found
    default_hours = {'High': 24, 'Medium': 48, 'Low': 72}
    resolution_hours = sla_rule.resolution_hours if sla_rule else default_hours.get(new_complaint.priority.value, 72)
    
    new_complaint.deadline = new_complaint.created_at + timedelta(hours=resolution_hours)
    db.commit()
    db.refresh(new_complaint)
    
    # AI Team Assignment (Feature 1)
    from ..services.assignment_optimizer import assign_complaint
    assignment_result = assign_complaint(db, new_complaint)
    # Log assignment result (non-blocking, doesn't fail submission)
    if assignment_result.get("success"):
        print(f"AI Assignment: Complaint #{new_complaint.id} -> Team {assignment_result.get('team_name')}")
    
    # Create initial status log
    status_log = ComplaintStatusLog(
        complaint_id=new_complaint.id,
        status=ComplaintStatus.PENDING,
        remarks="Complaint submitted and auto-classified by AI",
        updated_by=current_user.id
    )
    db.add(status_log)
    db.commit()
    
    ComplaintAIResponse.model_validate(new_complaint)
    return ComplaintResponse.model_validate(new_complaint)

@router.post("/verify-priority")
async def verify_priority_check(
    urgency: str = Query(..., enum=["Low", "Medium", "High"]),
    severity: str = Query(..., enum=["Low", "Medium", "High"]),
    upvotes: int = Query(0, ge=0)
):
    """
    Check priority score and SLA based on inputs (Transparent AI)
    """
    return calculate_hybrid_priority(urgency, severity, upvotes)


@router.post("/check-similar")
async def check_similar_complaints(
    description: str = Query(..., min_length=10, description="Complaint description to check"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Check for similar existing complaints before submission.
    Uses AI-powered semantic similarity (SBERT) to find potential duplicates.
    
    Returns:
        List of similar complaints if found (similarity > 75%)
    """
    # Fetch recent complaints from DB (last 100 for efficiency)
    existing_complaints = db.query(Complaint).order_by(desc(Complaint.created_at)).limit(100).all()
    
    # Prepare data for AI Bridge
    existing_data = [
        {"id": c.id, "text": c.description}
        for c in existing_complaints
    ]
    
    # Call AI Bridge for similarity detection
    similar = ai_bridge.get_similar_complaints(description, existing_data)
    
    # Enrich results with complaint details
    enriched_results = []
    for result in similar[:5]:  # Limit to top 5
        complaint = db.query(Complaint).filter(Complaint.id == result["complaint_id"]).first()
        if complaint:
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
    complaint_id: int,
    files: List[UploadFile] = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Upload images for a complaint (only by complaint owner)
    Accepts up to 5 images, max 10MB each
    """
    complaint = db.query(Complaint).filter(Complaint.id == complaint_id).first()
    
    if not complaint:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Complaint not found"
        )
    
    # Only owner can upload
    if complaint.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the complaint owner can upload images"
        )
    
    # Validate file count
    existing = complaint.attachments or []
    if len(existing) + len(files) > 5:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Maximum 5 images allowed. Currently have {len(existing)}"
        )
    
    uploaded_files = []
    for file in files:
        # Validate file type
        if not file.content_type.startswith("image/"):
            continue
        
        # Validate file size (10MB max)
        content = await file.read()
        if len(content) > 10 * 1024 * 1024:
            continue
        await file.seek(0)
        
        # Generate unique filename
        ext = os.path.splitext(file.filename)[1] or ".jpg"
        unique_name = f"{complaint_id}_{uuid.uuid4().hex[:8]}{ext}"
        file_path = os.path.join(CITIZEN_UPLOAD_DIR, unique_name)
        
        # Save file
        with open(file_path, "wb") as f:
            shutil.copyfileobj(file.file, f)
        
        uploaded_files.append(f"/uploads/citizen/{unique_name}")
    
    # Update complaint attachments
    complaint.attachments = existing + uploaded_files
    db.commit()
    
    return {
        "message": f"Successfully uploaded {len(uploaded_files)} image(s)",
        "attachments": complaint.attachments
    }

@router.get("/preview-ai", response_model=ComplaintAIResponse)
async def preview_ai_classification(
    description: str = Query(..., min_length=10, description="Complaint description"),
    current_user: User = Depends(get_current_user)
):
    """
    Preview AI classification before submitting
    Useful for showing real-time category detection in the form
    """
    # 1. Classify
    classification = ai_bridge.classify_complaint(description)
    
    # 2. Detect Levels
    levels = ai_bridge.get_urgency_severity(description)
    
    # 3. Calculate Priority
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
    db: Session = Depends(get_db)
):
    """
    Get current user's complaints with status history
    """
    query = db.query(Complaint).filter(Complaint.user_id == current_user.id)
    
    if status_filter:
        query = query.filter(Complaint.status == status_filter)
    
    complaints = query.order_by(desc(Complaint.created_at)).all()
    
    return [ComplaintResponse.model_validate(c) for c in complaints]


@router.get("/public", response_model=List[ComplaintResponse])
async def get_public_complaints(
    category: Optional[str] = None,
    sort_by: str = Query("recent", enum=["recent", "upvotes", "priority"]),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db)
):
    """
    Get public community complaints feed
    Can be accessed without authentication
    """
    query = db.query(Complaint).filter(Complaint.is_public == True)
    
    if category:
        query = query.filter(Complaint.category == category)
    
    # Sorting
    if sort_by == "upvotes":
        query = query.order_by(desc(Complaint.upvotes))
    elif sort_by == "priority":
        # Order by priority (High > Medium > Low)
        query = query.order_by(
            desc(Complaint.priority == ComplaintPriority.HIGH),
            desc(Complaint.priority == ComplaintPriority.MEDIUM),
            desc(Complaint.created_at)
        )
    else:  # recent
        query = query.order_by(desc(Complaint.created_at))
    
    # Pagination
    offset = (page - 1) * per_page
    complaints = query.offset(offset).limit(per_page).all()
    
    return [ComplaintResponse.model_validate(c) for c in complaints]


@router.get("/{complaint_id}", response_model=ComplaintResponse)
async def get_complaint(
    complaint_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get a specific complaint by ID
    Citizens can only view their own or public complaints
    """
    complaint = db.query(Complaint).filter(Complaint.id == complaint_id).first()
    
    if not complaint:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Complaint not found"
        )
    
    # Check access: owner, public, or officer/admin
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
    complaint_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Upvote a public complaint
    """
    complaint = db.query(Complaint).filter(
        Complaint.id == complaint_id,
        Complaint.is_public == True
    ).first()
    
    if not complaint:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Complaint not found or not public"
        )
    
    # Increment upvotes
    complaint.upvotes += 1
    
    # Recalculate priority based on new upvotes
    new_priority, urgency = calculate_priority(
        complaint.description,
        complaint.category,
        complaint.upvotes
    )
    
    priority_map = {
        'Low': ComplaintPriority.LOW,
        'Medium': ComplaintPriority.MEDIUM,
        'High': ComplaintPriority.HIGH
    }
    complaint.priority = priority_map.get(new_priority, complaint.priority)
    complaint.urgency_score = urgency
    
    db.commit()
    
    return {"message": "Upvoted successfully", "upvotes": complaint.upvotes}


@router.post("/{complaint_id}/rate-resolution")
async def rate_resolution(
    complaint_id: int,
    rating: str = Query(..., enum=["satisfied", "unsatisfied"], description="Resolution rating"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Rate a resolved complaint.
    Only the complaint owner can rate. If unsatisfied votes exceed satisfied, 
    the complaint is marked for reconsideration.
    """
    complaint = db.query(Complaint).filter(Complaint.id == complaint_id).first()
    
    if not complaint:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Complaint not found"
        )
    
    # Only complaint owner can rate
    if complaint.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the complaint owner can rate the resolution"
        )
    
    # Only resolved complaints can be rated
    if complaint.status != ComplaintStatus.RESOLVED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only resolved complaints can be rated"
        )
    
    # Update ratings
    if rating == "satisfied":
        complaint.resolution_upvotes = (complaint.resolution_upvotes or 0) + 1
    else:
        complaint.resolution_downvotes = (complaint.resolution_downvotes or 0) + 1
    
    # Check if needs reconsideration (downvotes > upvotes)
    if (complaint.resolution_downvotes or 0) > (complaint.resolution_upvotes or 0):
        complaint.needs_reconsideration = True
        # Optionally reopen the complaint
        complaint.status = ComplaintStatus.IN_PROGRESS
        
        # Add status log
        status_log = ComplaintStatusLog(
            complaint_id=complaint.id,
            status=ComplaintStatus.IN_PROGRESS,
            remarks="Reopened due to citizen dissatisfaction - needs reconsideration",
            updated_by=None
        )
        db.add(status_log)
    else:
        complaint.needs_reconsideration = False
    
    db.commit()
    
    return {
        "message": "Rating submitted successfully",
        "resolution_upvotes": complaint.resolution_upvotes,
        "resolution_downvotes": complaint.resolution_downvotes,
        "needs_reconsideration": complaint.needs_reconsideration,
        "status": complaint.status.value
    }
