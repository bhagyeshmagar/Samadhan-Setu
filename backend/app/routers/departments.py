"""
Department Router for Samadhan Setu
Handles department officer workflows - viewing and updating complaints
"""
from typing import List, Optional
from datetime import datetime
import os
import shutil
import uuid
from fastapi import APIRouter, Depends, HTTPException, status, Query, File, UploadFile
from sqlalchemy.orm import Session
from sqlalchemy import desc, asc

from ..database import get_db
from ..auth import get_current_user, require_officer
from ..models import (
    User, UserRole, Complaint, ComplaintStatus, ComplaintPriority,
    ComplaintStatusLog, Department
)
from ..schemas import ComplaintResponse, ComplaintUpdate, StatusLogResponse

# Create uploads directory
UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads", "proof")
os.makedirs(UPLOAD_DIR, exist_ok=True)

router = APIRouter(prefix="/api/department", tags=["Department"])


@router.get("/complaints", response_model=List[ComplaintResponse])
async def get_department_complaints(
    status_filter: Optional[ComplaintStatus] = None,
    priority_filter: Optional[ComplaintPriority] = None,
    sort_by: str = Query("priority", enum=["priority", "recent", "oldest"]),
    current_user: User = Depends(require_officer),
    db: Session = Depends(get_db)
):
    """
    Get complaints assigned to the officer's department
    Sorted by priority by default (High first)
    """
    # Build query
    query = db.query(Complaint)
    
    # Filter by department (officers see their department, admins see all)
    if current_user.role == UserRole.OFFICER and current_user.department_id:
        query = query.filter(Complaint.department_id == current_user.department_id)
    
    # Apply filters
    if status_filter:
        query = query.filter(Complaint.status == status_filter)
    if priority_filter:
        query = query.filter(Complaint.priority == priority_filter)
    
    # Sorting
    if sort_by == "priority":
        # Custom ordering: HIGH > MEDIUM > LOW, then by date
        query = query.order_by(
            desc(Complaint.priority == ComplaintPriority.HIGH),
            desc(Complaint.priority == ComplaintPriority.MEDIUM),
            desc(Complaint.created_at)
        )
    elif sort_by == "oldest":
        query = query.order_by(asc(Complaint.created_at))
    else:  # recent
        query = query.order_by(desc(Complaint.created_at))
    
    complaints = query.all()
    
    return [ComplaintResponse.model_validate(c) for c in complaints]


@router.get("/complaints/pending-count")
async def get_pending_count(
    current_user: User = Depends(require_officer),
    db: Session = Depends(get_db)
):
    """
    Get count of pending complaints for dashboard
    """
    query = db.query(Complaint).filter(
        Complaint.status.in_([ComplaintStatus.PENDING, ComplaintStatus.IN_PROGRESS])
    )
    
    if current_user.role == UserRole.OFFICER and current_user.department_id:
        query = query.filter(Complaint.department_id == current_user.department_id)
    
    pending = query.filter(Complaint.status == ComplaintStatus.PENDING).count()
    in_progress = query.filter(Complaint.status == ComplaintStatus.IN_PROGRESS).count()
    
    return {
        "pending": pending,
        "in_progress": in_progress,
        "total_active": pending + in_progress
    }


@router.get("/complaints/{complaint_id}", response_model=ComplaintResponse)
async def get_complaint_detail(
    complaint_id: int,
    current_user: User = Depends(require_officer),
    db: Session = Depends(get_db)
):
    """
    Get detailed view of a single complaint
    """
    complaint = db.query(Complaint).filter(Complaint.id == complaint_id).first()
    
    if not complaint:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Complaint not found"
        )
    
    # Check department access (officers only see their department)
    if (
        current_user.role == UserRole.OFFICER and
        current_user.department_id and
        complaint.department_id != current_user.department_id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied - complaint belongs to another department"
        )
    
    return ComplaintResponse.model_validate(complaint)


@router.put("/complaints/{complaint_id}/status")
async def update_complaint_status(
    complaint_id: int,
    update_data: ComplaintUpdate,
    current_user: User = Depends(require_officer),
    db: Session = Depends(get_db)
):
    """
    Update complaint status and add remarks
    Creates an audit log entry
    """
    complaint = db.query(Complaint).filter(Complaint.id == complaint_id).first()
    
    if not complaint:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Complaint not found"
        )
    
    # Check department access
    if (
        current_user.role == UserRole.OFFICER and
        current_user.department_id and
        complaint.department_id != current_user.department_id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )
    
    # Update status
    if update_data.status:
        old_status = complaint.status
        complaint.status = update_data.status
        
        # Set resolved timestamp if resolved
        if update_data.status == ComplaintStatus.RESOLVED:
            complaint.resolved_at = datetime.utcnow()
        
        # Create status log
        status_log = ComplaintStatusLog(
            complaint_id=complaint.id,
            status=update_data.status,
            remarks=update_data.remarks or f"Status changed from {old_status.value} to {update_data.status.value}",
            updated_by=current_user.id
        )
        db.add(status_log)
    
    # Update assigned officer
    if update_data.assigned_officer_id:
        complaint.assigned_officer_id = update_data.assigned_officer_id
    
    complaint.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(complaint)
    
    return {
        "message": "Complaint updated successfully",
        "complaint": ComplaintResponse.model_validate(complaint)
    }


@router.post("/complaints/{complaint_id}/remarks")
async def add_remarks(
    complaint_id: int,
    remarks: str,
    current_user: User = Depends(require_officer),
    db: Session = Depends(get_db)
):
    """
    Add remarks to a complaint without changing status
    """
    complaint = db.query(Complaint).filter(Complaint.id == complaint_id).first()
    
    if not complaint:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Complaint not found"
        )
    
    # Create log entry with remarks
    status_log = ComplaintStatusLog(
        complaint_id=complaint.id,
        status=complaint.status,
        remarks=remarks,
        updated_by=current_user.id
    )
    db.add(status_log)
    db.commit()
    
    return {"message": "Remarks added successfully"}


@router.get("/complaints/{complaint_id}/history", response_model=List[StatusLogResponse])
async def get_complaint_history(
    complaint_id: int,
    current_user: User = Depends(require_officer),
    db: Session = Depends(get_db)
):
    """
    Get status history for a complaint
    """
    logs = db.query(ComplaintStatusLog).filter(
        ComplaintStatusLog.complaint_id == complaint_id
    ).order_by(ComplaintStatusLog.created_at).all()
    
    return [StatusLogResponse.model_validate(log) for log in logs]


@router.post("/complaints/{complaint_id}/upload-proof")
async def upload_resolution_proof(
    complaint_id: int,
    files: List[UploadFile] = File(...),
    current_user: User = Depends(require_officer),
    db: Session = Depends(get_db)
):
    """
    Upload proof images for complaint resolution
    Accepts up to 5 images, max 10MB each
    """
    complaint = db.query(Complaint).filter(Complaint.id == complaint_id).first()
    
    if not complaint:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Complaint not found"
        )
    
    # Check department access
    if (
        current_user.role == UserRole.OFFICER and
        current_user.department_id and
        complaint.department_id != current_user.department_id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )
    
    if len(files) > 5:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Maximum 5 files allowed"
        )
    
    uploaded_files = []
    
    for file in files:
        # Validate file type
        if not file.content_type.startswith("image/"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"File {file.filename} is not an image"
            )
        
        # Generate unique filename
        ext = os.path.splitext(file.filename)[1]
        unique_name = f"{complaint_id}_{uuid.uuid4().hex}{ext}"
        file_path = os.path.join(UPLOAD_DIR, unique_name)
        
        # Save file
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        uploaded_files.append({
            "filename": unique_name,
            "original_name": file.filename,
            "path": f"/uploads/proof/{unique_name}",
            "uploaded_at": datetime.utcnow().isoformat()
        })
    
    # Update complaint with proof images
    existing_proof = complaint.resolution_proof or []
    complaint.resolution_proof = existing_proof + uploaded_files
    complaint.updated_at = datetime.utcnow()
    
    db.commit()
    db.refresh(complaint)
    
    return {
        "message": f"Successfully uploaded {len(uploaded_files)} proof image(s)",
        "files": uploaded_files
    }


@router.post("/complaints/{complaint_id}/resolve")
async def resolve_complaint_with_proof(
    complaint_id: int,
    remarks: str = Query(..., description="Resolution remarks"),
    current_user: User = Depends(require_officer),
    db: Session = Depends(get_db)
):
    """
    Mark complaint as resolved with remarks
    """
    complaint = db.query(Complaint).filter(Complaint.id == complaint_id).first()
    
    if not complaint:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Complaint not found"
        )
    
    # Check department access
    if (
        current_user.role == UserRole.OFFICER and
        current_user.department_id and
        complaint.department_id != current_user.department_id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )
    
    # Update complaint
    old_status = complaint.status
    complaint.status = ComplaintStatus.RESOLVED
    complaint.resolution_remarks = remarks
    complaint.resolved_at = datetime.utcnow()
    complaint.updated_at = datetime.utcnow()
    
    # Create status log
    status_log = ComplaintStatusLog(
        complaint_id=complaint.id,
        status=ComplaintStatus.RESOLVED,
        remarks=remarks,
        updated_by=current_user.id
    )
    db.add(status_log)
    
    db.commit()
    db.refresh(complaint)
    
    return {
        "message": "Complaint resolved successfully",
        "complaint": ComplaintResponse.model_validate(complaint)
    }
