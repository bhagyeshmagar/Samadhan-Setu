"""
Citizens Router for Samadhan Setu Phase 1+2.
Handles complaint submission, tracking, status history, and uploads.
Phase 2: Triggers AI pipeline as background task on submission.
"""
from typing import List, Optional, Any
from datetime import datetime, timedelta
import os
import uuid
import shutil
from fastapi import APIRouter, Depends, HTTPException, status, Query, File, UploadFile, BackgroundTasks


from ..database import get_db
from ..auth import get_current_user, require_citizen
from ..models import (
    User, UserRole, Complaint, ComplaintStatus, ComplaintPriority,
    ComplaintStatusLog, Department, CategoryMapping, SLARule
)
from ..schemas import ComplaintCreate, ComplaintResponse, ComplaintAIResponse, StatusLogResponse, ComplaintFeedback

from ..services.ai_bridge import ai_bridge
from ..ai.priority import calculate_priority
from ..services.task_router import generate_tasks_for_complaint
from ..services.audit_service import write_audit_log
from ..services.state_machine import is_valid_transition

CITIZEN_UPLOAD_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads", "citizen"
)
os.makedirs(CITIZEN_UPLOAD_DIR, exist_ok=True)

router = APIRouter(prefix="/api/complaints", tags=["Citizens"])


@router.post("/", response_model=ComplaintResponse, status_code=status.HTTP_201_CREATED)
async def submit_complaint(
    complaint_data: ComplaintCreate,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Any = Depends(get_db),
):
    """
    Submit a new complaint.
    System classifies category, calculates priority, generates tasks, and logs everything.
    """
    # AI classification
    classification = ai_bridge.classify_complaint(complaint_data.description)
    category = complaint_data.category or classification["category"]

    # Priority calculation using 6-factor formula
    priority_result = calculate_priority(
        complaint_data.description, category, upvotes=0
    )

    # Resolve department from category mapping
    cat_docs = (
        db.collection("category_mappings")
        .where("category", "==", category)
        .limit(1)
        .get()
    )
    department_id = None
    if cat_docs:
        cat_map = CategoryMapping.from_firestore(cat_docs[0])
        department_id = cat_map.department_id

    priority_map = {"Low": ComplaintPriority.LOW, "Medium": ComplaintPriority.MEDIUM, "High": ComplaintPriority.HIGH}

    # SLA calculation
    default_hours = {"High": 24, "Medium": 72, "Low": 168}
    sla_hours = priority_result.get("sla_hours", default_hours.get(priority_result["priority"], 72))

    now = datetime.utcnow()
    new_complaint = Complaint(
        user_id=current_user.id,
        title=complaint_data.title,
        category=category,
        description=complaint_data.description,
        location=complaint_data.location,
        ward=complaint_data.ward,
        latitude=complaint_data.latitude,
        longitude=complaint_data.longitude,
        priority=priority_map.get(priority_result["priority"], ComplaintPriority.LOW),
        priority_score=priority_result["score"],
        urgency_score=priority_result["breakdown"]["urgency"],
        ai_confidence=classification["confidence"],
        status=ComplaintStatus.SUBMITTED,
        department_id=department_id,
        is_public=complaint_data.is_public,
        upvotes=0,
        attachments=[],
        created_at=now,
        updated_at=now,
        deadline=now + timedelta(hours=sla_hours),
    )

    # Save complaint
    comp_ref = db.collection("complaints").document()
    new_complaint.id = comp_ref.id
    comp_ref.set(new_complaint.to_firestore())

    # Status history entry
    status_log = ComplaintStatusLog(
        complaint_id=new_complaint.id,
        from_status=None,
        to_status=ComplaintStatus.SUBMITTED.value,
        remarks="Complaint submitted and auto-classified by system",
        updated_by=current_user.id,
    )
    db.collection("complaint_status_logs").add(status_log.to_firestore())

    # Audit log
    write_audit_log(
        db,
        action="complaint_created",
        entity_type="complaint",
        entity_id=new_complaint.id,
        actor_id=current_user.id,
        actor_role=current_user.role.value,
        details={
            "category": category,
            "priority": priority_result["priority"],
            "priority_score": priority_result["score"],
            "ai_confidence": classification["confidence"],
        },
    )

    # Generate tasks based on category routing
    tasks = generate_tasks_for_complaint(
        db,
        complaint_id=new_complaint.id,
        primary_category=category,
        description=complaint_data.description,
        actor_id=current_user.id,
        actor_role=current_user.role.value,
    )

    # If tasks were created, transition to ASSIGNED
    if tasks:
        new_complaint.status = ComplaintStatus.ASSIGNED
        comp_ref.update({"status": ComplaintStatus.ASSIGNED.value, "updated_at": datetime.utcnow()})

        assign_log = ComplaintStatusLog(
            complaint_id=new_complaint.id,
            from_status=ComplaintStatus.SUBMITTED.value,
            to_status=ComplaintStatus.ASSIGNED.value,
            remarks=f"Auto-assigned to {len(tasks)} department(s)",
            updated_by="system",
        )
        db.collection("complaint_status_logs").add(assign_log.to_firestore())

    # Phase 2: Trigger AI pipeline as background task
    try:
        from ..services.ai_pipeline import run_ai_pipeline
        background_tasks.add_task(run_ai_pipeline, new_complaint.id, db)
    except Exception:
        pass  # AI pipeline failure must not block complaint submission

    return ComplaintResponse.model_validate(new_complaint)


@router.post("/{complaint_id}/upload-images")
async def upload_complaint_images(
    complaint_id: str,
    files: List[UploadFile] = File(...),
    current_user: User = Depends(get_current_user),
    db: Any = Depends(get_db),
):
    """Upload evidence images for a complaint. Only the complaint owner can upload."""
    doc_ref = db.collection("complaints").document(complaint_id)
    doc = doc_ref.get()

    if not doc.exists:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Complaint not found")

    complaint = Complaint.from_firestore(doc)

    if complaint.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the complaint owner can upload images")

    existing = complaint.attachments or []
    if len(existing) + len(files) > 5:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Maximum 5 images allowed. Currently have {len(existing)}",
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
    doc_ref.update({"attachments": updated_attachments})

    write_audit_log(
        db,
        action="file_uploaded",
        entity_type="complaint",
        entity_id=complaint_id,
        actor_id=current_user.id,
        actor_role=current_user.role.value,
        details={"files_count": len(uploaded_files), "total_attachments": len(updated_attachments)},
    )

    return {"message": f"Successfully uploaded {len(uploaded_files)} image(s)", "attachments": updated_attachments}


@router.get("/preview-ai", response_model=ComplaintAIResponse)
async def preview_ai_classification(
    description: str = Query(..., min_length=10, description="Complaint description"),
    current_user: User = Depends(get_current_user),
):
    """Preview AI classification before submission."""
    classification = ai_bridge.classify_complaint(description)
    priority_result = calculate_priority(description, classification["category"], 0)

    return ComplaintAIResponse(
        category=classification["category"],
        priority=priority_result["priority"],
        priority_score=priority_result["score"],
        urgency_score=priority_result["breakdown"]["urgency"],
        confidence=classification["confidence"],
        department_id=None,
    )


@router.get("/my", response_model=List[ComplaintResponse])
async def get_my_complaints(
    status_filter: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Any = Depends(get_db),
):
    """Get complaints submitted by the current citizen."""
    query = db.collection("complaints").where("user_id", "==", current_user.id)
    if status_filter:
        query = query.where("status", "==", status_filter)

    docs = query.get()
    raw_complaints = [Complaint.from_firestore(doc) for doc in docs]
    complaints = [c for c in raw_complaints if c is not None]
    complaints.sort(key=lambda x: x.created_at, reverse=True)

    return [ComplaintResponse.model_validate(c) for c in complaints]


@router.get("/public/feed", response_model=List[ComplaintResponse])
async def get_public_complaints(
    category: Optional[str] = None,
    sort_by: str = Query("recent", enum=["recent", "priority"]),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: Any = Depends(get_db),
):
    """Public feed of complaints. No auth required."""
    query = db.collection("complaints").where("is_public", "==", True)
    if category:
        query = query.where("category", "==", category)

    docs = query.get()
    raw_complaints = [Complaint.from_firestore(doc) for doc in docs]
    complaints = [c for c in raw_complaints if c is not None]

    if sort_by == "priority":
        priority_order = {"High": 3, "Medium": 2, "Low": 1}
        complaints.sort(key=lambda x: (priority_order.get(x.priority.value, 0), x.created_at), reverse=True)
    else:
        complaints.sort(key=lambda x: x.created_at, reverse=True)

    offset = (page - 1) * per_page
    paginated = complaints[offset : offset + per_page]

    return [ComplaintResponse.model_validate(c) for c in paginated]


@router.get("/{complaint_id}", response_model=ComplaintResponse)
async def get_complaint(
    complaint_id: str,
    current_user: User = Depends(get_current_user),
    db: Any = Depends(get_db),
):
    """Get complaint detail with status history and tasks."""
    doc = db.collection("complaints").document(complaint_id).get()
    if not doc.exists:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Complaint not found")

    complaint = Complaint.from_firestore(doc)

    # Access check: owner, public, officer, or admin
    if not (
        complaint.user_id == current_user.id
        or complaint.is_public
        or current_user.role in [UserRole.OFFICER, UserRole.ADMIN]
    ):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    response = ComplaintResponse.model_validate(complaint)

    # Attach status history
    history_docs = db.collection("complaint_status_logs").where("complaint_id", "==", complaint_id).get()
    logs = [ComplaintStatusLog.from_firestore(d) for d in history_docs]
    logs.sort(key=lambda x: x.created_at)
    response.status_history = [StatusLogResponse.model_validate(l) for l in logs]

    # Attach tasks
    task_docs = db.collection("tasks").where("complaint_id", "==", complaint_id).get()
    tasks = []
    for td in task_docs:
        task_data = td.to_dict()
        task_data["id"] = td.id
        tasks.append(task_data)
    response.tasks = tasks

    return response


@router.get("/{complaint_id}/history", response_model=List[StatusLogResponse])
async def get_complaint_history(
    complaint_id: str,
    current_user: User = Depends(get_current_user),
    db: Any = Depends(get_db),
):
    """Get status timeline for a complaint. Available to owner, officers, and admins."""
    # Verify complaint exists and user has access
    doc = db.collection("complaints").document(complaint_id).get()
    if not doc.exists:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Complaint not found")

    complaint = Complaint.from_firestore(doc)
    if not (
        complaint.user_id == current_user.id
        or current_user.role in [UserRole.OFFICER, UserRole.ADMIN]
    ):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    docs = db.collection("complaint_status_logs").where("complaint_id", "==", complaint_id).get()
    logs = [ComplaintStatusLog.from_firestore(d) for d in docs]
    logs.sort(key=lambda x: x.created_at)

    return [StatusLogResponse.model_validate(l) for l in logs]


@router.post("/{complaint_id}/feedback", response_model=ComplaintResponse)
async def submit_feedback(
    complaint_id: str,
    feedback_data: ComplaintFeedback,
    current_user: User = Depends(get_current_user),
    db: Any = Depends(get_db),
):
    """Submit rating and feedback for a resolved complaint."""
    doc_ref = db.collection("complaints").document(complaint_id)
    doc = doc_ref.get()
    
    if not doc.exists:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Complaint not found")
        
    complaint = Complaint.from_firestore(doc)
    if complaint.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
        
    if complaint.status not in [ComplaintStatus.RESOLVED, ComplaintStatus.CLOSED]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Feedback can only be submitted for resolved complaints")
        
    # Update firestore
    updates = {
        "citizen_rating": feedback_data.rating,
        "feedback_text": feedback_data.feedback_text,
        "updated_at": datetime.utcnow()
    }
    doc_ref.update(updates)
    
    # Reload and return
    updated_doc = doc_ref.get()
    updated_complaint = Complaint.from_firestore(updated_doc)
    
    # Log audit
    write_audit_log(
        db,
        action="SUBMIT_FEEDBACK",
        entity_type="complaint",
        entity_id=complaint_id,
        actor_id=current_user.id,
        actor_role=current_user.role.value if hasattr(current_user.role, 'value') else current_user.role,
        details={"rating": feedback_data.rating, "feedback_text": feedback_data.feedback_text},
    )
    
    return ComplaintResponse.model_validate(updated_complaint)




@router.post("/{complaint_id}/upvote")
async def upvote_complaint(
    complaint_id: str,
    current_user: User = Depends(get_current_user),
    db: Any = Depends(get_db),
):
    """
    Upvote a public complaint. Increments count but does NOT change priority.
    Priority is system-computed and independent of upvotes.
    """
    doc_ref = db.collection("complaints").document(complaint_id)
    doc = doc_ref.get()

    if not doc.exists:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Complaint not found")

    complaint = Complaint.from_firestore(doc)
    if not complaint.is_public:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Complaint not public")

    new_upvotes = complaint.upvotes + 1
    doc_ref.update({"upvotes": new_upvotes})

    return {"message": "Upvoted successfully", "upvotes": new_upvotes}
