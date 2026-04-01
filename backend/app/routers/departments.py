"""
Department Router for Samadhan Setu
Handles department officer workflows - viewing and updating complaints
"""
from typing import List, Optional, Any
from datetime import datetime
import os
import shutil
import uuid
from fastapi import APIRouter, Depends, HTTPException, status, Query, File, UploadFile

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
    db: Any = Depends(get_db)
):
    """
    Get complaints assigned to the officer's department
    Sorted by priority by default (High first)
    """
    query = db.collection('complaints')
    
    if current_user.role == UserRole.OFFICER and current_user.department_id:
        query = query.where('department_id', '==', current_user.department_id)
        
    if status_filter:
        query = query.where('status', '==', status_filter.value)
    if priority_filter:
        query = query.where('priority', '==', priority_filter.value)
        
    docs = query.get()
    complaints = [Complaint.from_firestore(doc) for doc in docs]
    
    if sort_by == "priority":
        priority_order = {"High": 3, "Medium": 2, "Low": 1}
        complaints.sort(key=lambda x: (priority_order.get(x.priority.value, 0), x.created_at), reverse=True)
    elif sort_by == "oldest":
        complaints.sort(key=lambda x: x.created_at)
    else:  # recent
        complaints.sort(key=lambda x: x.created_at, reverse=True)
        
    return [ComplaintResponse.model_validate(c) for c in complaints]


@router.get("/complaints/pending-count")
async def get_pending_count(
    current_user: User = Depends(require_officer),
    db: Any = Depends(get_db)
):
    """
    Get count of pending complaints for dashboard
    """
    query = db.collection('complaints').where('status', 'in', [ComplaintStatus.PENDING.value, ComplaintStatus.IN_PROGRESS.value])
    
    if current_user.role == UserRole.OFFICER and current_user.department_id:
        query = query.where('department_id', '==', current_user.department_id)
        
    docs = query.get()
    
    pending = 0
    in_progress = 0
    
    for doc in docs:
        status = doc.to_dict().get('status')
        if status == ComplaintStatus.PENDING.value:
            pending += 1
        elif status == ComplaintStatus.IN_PROGRESS.value:
            in_progress += 1
            
    return {
        "pending": pending,
        "in_progress": in_progress,
        "total_active": pending + in_progress
    }


@router.get("/complaints/{complaint_id}", response_model=ComplaintResponse)
async def get_complaint_detail(
    complaint_id: str,
    current_user: User = Depends(require_officer),
    db: Any = Depends(get_db)
):
    """
    Get detailed view of a single complaint
    """
    doc = db.collection('complaints').document(complaint_id).get()
    
    if not doc.exists:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Complaint not found"
        )
        
    complaint = Complaint.from_firestore(doc)
    
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
    complaint_id: str,
    update_data: ComplaintUpdate,
    current_user: User = Depends(require_officer),
    db: Any = Depends(get_db)
):
    """
    Update complaint status and add remarks
    Creates an audit log entry
    """
    doc_ref = db.collection('complaints').document(complaint_id)
    doc = doc_ref.get()
    
    if not doc.exists:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Complaint not found"
        )
        
    complaint = Complaint.from_firestore(doc)
    
    if (
        current_user.role == UserRole.OFFICER and
        current_user.department_id and
        complaint.department_id != current_user.department_id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )
        
    updates = {"updated_at": datetime.utcnow()}
    
    if update_data.status:
        old_status = complaint.status
        complaint.status = update_data.status
        updates["status"] = update_data.status.value
        
        if update_data.status == ComplaintStatus.RESOLVED:
            updates["resolved_at"] = datetime.utcnow()
            complaint.resolved_at = updates["resolved_at"]
            
        status_log = ComplaintStatusLog(
            complaint_id=complaint.id,
            status=update_data.status,
            remarks=update_data.remarks or f"Status changed from {old_status.value} to {update_data.status.value}",
            updated_by=current_user.id
        )
        db.collection('complaint_status_logs').add(status_log.to_firestore())
        
    if update_data.assigned_officer_id:
        updates["assigned_officer_id"] = update_data.assigned_officer_id
        complaint.assigned_officer_id = update_data.assigned_officer_id
        
    doc_ref.update(updates)
    complaint.updated_at = updates["updated_at"]
    
    return {
        "message": "Complaint updated successfully",
        "complaint": ComplaintResponse.model_validate(complaint)
    }


@router.post("/complaints/{complaint_id}/remarks")
async def add_remarks(
    complaint_id: str,
    remarks: str,
    current_user: User = Depends(require_officer),
    db: Any = Depends(get_db)
):
    """
    Add remarks to a complaint without changing status
    """
    doc = db.collection('complaints').document(complaint_id).get()
    
    if not doc.exists:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Complaint not found"
        )
        
    complaint = Complaint.from_firestore(doc)
    
    status_log = ComplaintStatusLog(
        complaint_id=complaint.id,
        status=complaint.status,
        remarks=remarks,
        updated_by=current_user.id
    )
    db.collection('complaint_status_logs').add(status_log.to_firestore())
    
    return {"message": "Remarks added successfully"}


@router.get("/complaints/{complaint_id}/history", response_model=List[StatusLogResponse])
async def get_complaint_history(
    complaint_id: str,
    current_user: User = Depends(require_officer),
    db: Any = Depends(get_db)
):
    """
    Get status history for a complaint
    """
    docs = db.collection('complaint_status_logs').where('complaint_id', '==', complaint_id).get()
    logs = [ComplaintStatusLog.from_firestore(doc) for doc in docs]
    logs.sort(key=lambda x: x.created_at)
    
    return [StatusLogResponse.model_validate(log) for log in logs]


@router.post("/complaints/{complaint_id}/upload-proof")
async def upload_resolution_proof(
    complaint_id: str,
    files: List[UploadFile] = File(...),
    current_user: User = Depends(require_officer),
    db: Any = Depends(get_db)
):
    """
    Upload proof images for complaint resolution
    """
    doc_ref = db.collection('complaints').document(complaint_id)
    doc = doc_ref.get()
    
    if not doc.exists:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Complaint not found"
        )
        
    complaint = Complaint.from_firestore(doc)
    
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
        if not file.content_type.startswith("image/"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"File {file.filename} is not an image"
            )
            
        ext = os.path.splitext(file.filename)[1]
        unique_name = f"{complaint_id}_{uuid.uuid4().hex}{ext}"
        file_path = os.path.join(UPLOAD_DIR, unique_name)
        
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        uploaded_files.append({
            "filename": unique_name,
            "original_name": file.filename,
            "path": f"/uploads/proof/{unique_name}",
            "uploaded_at": datetime.utcnow().isoformat()
        })
        
    existing_proof = complaint.resolution_proof or []
    updated_proof = existing_proof + uploaded_files
    
    doc_ref.update({
        'resolution_proof': updated_proof,
        'updated_at': datetime.utcnow()
    })
    
    return {
        "message": f"Successfully uploaded {len(uploaded_files)} proof image(s)",
        "files": uploaded_files
    }


@router.post("/complaints/{complaint_id}/resolve")
async def resolve_complaint_with_proof(
    complaint_id: str,
    remarks: str = Query(..., description="Resolution remarks"),
    current_user: User = Depends(require_officer),
    db: Any = Depends(get_db)
):
    """
    Mark complaint as resolved with remarks
    """
    doc_ref = db.collection('complaints').document(complaint_id)
    doc = doc_ref.get()
    
    if not doc.exists:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Complaint not found"
        )
        
    complaint = Complaint.from_firestore(doc)
    
    if (
        current_user.role == UserRole.OFFICER and
        current_user.department_id and
        complaint.department_id != current_user.department_id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )
        
    resolved_time = datetime.utcnow()
    
    doc_ref.update({
        'status': ComplaintStatus.RESOLVED.value,
        'resolution_remarks': remarks,
        'resolved_at': resolved_time,
        'updated_at': resolved_time
    })
    
    complaint.status = ComplaintStatus.RESOLVED
    complaint.resolution_remarks = remarks
    complaint.resolved_at = resolved_time
    complaint.updated_at = resolved_time
    
    status_log = ComplaintStatusLog(
        complaint_id=complaint.id,
        status=ComplaintStatus.RESOLVED,
        remarks=remarks,
        updated_by=current_user.id
    )
    db.collection('complaint_status_logs').add(status_log.to_firestore())
    
    return {
        "message": "Complaint resolved successfully",
        "complaint": ComplaintResponse.model_validate(complaint)
    }
