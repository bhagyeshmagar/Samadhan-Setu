"""
Department/Officer Router for Samadhan Setu Phase 1.
Handles officer task workflows: viewing tasks, updating task/complaint status,
resolution proofs, and complaint history.
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
    ComplaintStatusLog, Department, Task, TaskStatus, TaskStatusLog,
)
from ..schemas import (
    ComplaintResponse, ComplaintUpdate, StatusLogResponse,
    TaskResponse, TaskUpdate,
)
from ..services.state_machine import is_valid_transition
from ..services.task_state_machine import is_valid_task_transition
from ..services.audit_service import write_audit_log

UPLOAD_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads", "proof"
)
os.makedirs(UPLOAD_DIR, exist_ok=True)

router = APIRouter(prefix="/api/department", tags=["Department"])


# ==================== TASK ENDPOINTS ====================

@router.get("/tasks", response_model=List[TaskResponse])
async def get_officer_tasks(
    status_filter: Optional[str] = None,
    current_user: User = Depends(require_officer),
    db: Any = Depends(get_db),
):
    """Get tasks assigned to the officer's department."""
    if current_user.role == UserRole.OFFICER and current_user.department_id:
        query = db.collection("tasks").where("department_id", "==", current_user.department_id)
    else:
        query = db.collection("tasks")

    if status_filter:
        query = query.where("status", "==", status_filter)

    docs = query.get()
    tasks = [Task.from_firestore(doc) for doc in docs]
    tasks.sort(key=lambda x: x.created_at, reverse=True)

    # Enrich with complaint context
    result = []
    for task in tasks:
        resp = TaskResponse.model_validate(task)
        comp_doc = db.collection("complaints").document(task.complaint_id).get()
        if comp_doc.exists:
            comp = comp_doc.to_dict()
            resp.complaint_title = comp.get("title", "")
            resp.complaint_description = comp.get("description", "")[:200]
            resp.complaint_status = comp.get("status", "")
            resp.complaint_priority = comp.get("priority", "")
            resp.complaint_location = comp.get("location", "")
        result.append(resp)

    return result


@router.get("/tasks/{task_id}", response_model=TaskResponse)
async def get_task_detail(
    task_id: str,
    current_user: User = Depends(require_officer),
    db: Any = Depends(get_db),
):
    """Get detailed view of a task with complaint context."""
    doc = db.collection("tasks").document(task_id).get()
    if not doc.exists:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    task = Task.from_firestore(doc)

    # Department access check
    if (
        current_user.role == UserRole.OFFICER
        and current_user.department_id
        and task.department_id != current_user.department_id
    ):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied - task belongs to another department")

    resp = TaskResponse.model_validate(task)
    comp_doc = db.collection("complaints").document(task.complaint_id).get()
    if comp_doc.exists:
        comp = comp_doc.to_dict()
        resp.complaint_title = comp.get("title", "")
        resp.complaint_description = comp.get("description", "")
        resp.complaint_status = comp.get("status", "")
        resp.complaint_priority = comp.get("priority", "")
        resp.complaint_location = comp.get("location", "")

    return resp


@router.put("/tasks/{task_id}/status")
async def update_task_status(
    task_id: str,
    update_data: TaskUpdate,
    current_user: User = Depends(require_officer),
    db: Any = Depends(get_db),
):
    """Update task status with state machine validation."""
    doc_ref = db.collection("tasks").document(task_id)
    doc = doc_ref.get()

    if not doc.exists:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    task = Task.from_firestore(doc)

    if (
        current_user.role == UserRole.OFFICER
        and current_user.department_id
        and task.department_id != current_user.department_id
    ):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    updates = {"updated_at": datetime.utcnow()}

    if update_data.status:
        new_status = TaskStatus(update_data.status)
        if not is_valid_task_transition(task.status, new_status):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid task status transition: {task.status.value} → {new_status.value}",
            )
        old_status = task.status
        updates["status"] = new_status.value

        if new_status == TaskStatus.COMPLETED:
            updates["completed_at"] = datetime.utcnow()

        # Log task status change
        task_log = TaskStatusLog(
            task_id=task_id,
            from_status=old_status.value,
            to_status=new_status.value,
            remarks=update_data.notes or f"Status changed to {new_status.value}",
            updated_by=current_user.id,
        )
        db.collection("task_status_logs").add(task_log.to_firestore())

        write_audit_log(
            db,
            action="task_status_updated",
            entity_type="task",
            entity_id=task_id,
            actor_id=current_user.id,
            actor_role=current_user.role.value,
            details={
                "from_status": old_status.value,
                "to_status": new_status.value,
                "complaint_id": task.complaint_id,
            },
        )

        # Auto-sync complaint status when all tasks are complete
        _sync_complaint_status(db, task.complaint_id, current_user)

    if update_data.notes:
        updates["notes"] = update_data.notes
    if update_data.resolution_notes:
        updates["resolution_notes"] = update_data.resolution_notes
    if update_data.assigned_officer_id:
        updates["assigned_officer_id"] = update_data.assigned_officer_id

    doc_ref.update(updates)

    return {"message": "Task updated successfully", "task_id": task_id}


@router.post("/tasks/{task_id}/assign")
async def assign_task(
    task_id: str,
    officer_id: str = Query(..., description="Officer user ID to assign to"),
    current_user: User = Depends(require_officer),
    db: Any = Depends(get_db),
):
    """Assign a task to a specific officer."""
    doc_ref = db.collection("tasks").document(task_id)
    doc = doc_ref.get()

    if not doc.exists:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    task = Task.from_firestore(doc)

    # Verify the target officer exists and belongs to the right department
    officer_doc = db.collection("users").document(officer_id).get()
    if not officer_doc.exists:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Officer not found")

    updates = {
        "assigned_officer_id": officer_id,
        "status": TaskStatus.ASSIGNED.value,
        "updated_at": datetime.utcnow(),
    }
    doc_ref.update(updates)

    task_log = TaskStatusLog(
        task_id=task_id,
        from_status=task.status.value,
        to_status=TaskStatus.ASSIGNED.value,
        remarks=f"Assigned to officer {officer_id}",
        updated_by=current_user.id,
    )
    db.collection("task_status_logs").add(task_log.to_firestore())

    write_audit_log(
        db,
        action="task_assigned",
        entity_type="task",
        entity_id=task_id,
        actor_id=current_user.id,
        actor_role=current_user.role.value,
        details={"assigned_officer_id": officer_id, "complaint_id": task.complaint_id},
    )

    return {"message": "Task assigned successfully", "task_id": task_id, "assigned_to": officer_id}


# ==================== COMPLAINT ENDPOINTS ====================

@router.get("/complaints", response_model=List[ComplaintResponse])
async def get_department_complaints(
    status_filter: Optional[str] = None,
    priority_filter: Optional[str] = None,
    sort_by: str = Query("priority", enum=["priority", "recent", "oldest"]),
    current_user: User = Depends(require_officer),
    db: Any = Depends(get_db),
):
    """Get complaints assigned to the officer's department."""
    query = db.collection("complaints")

    if current_user.role == UserRole.OFFICER and current_user.department_id:
        query = query.where("department_id", "==", current_user.department_id)

    if status_filter:
        query = query.where("status", "==", status_filter)
    if priority_filter:
        query = query.where("priority", "==", priority_filter)

    docs = query.get()
    complaints = [Complaint.from_firestore(doc) for doc in docs]

    if sort_by == "priority":
        priority_order = {"High": 3, "Medium": 2, "Low": 1}
        complaints.sort(key=lambda x: (priority_order.get(x.priority.value, 0), x.created_at), reverse=True)
    elif sort_by == "oldest":
        complaints.sort(key=lambda x: x.created_at)
    else:
        complaints.sort(key=lambda x: x.created_at, reverse=True)

    return [ComplaintResponse.model_validate(c) for c in complaints]


@router.get("/complaints/{complaint_id}", response_model=ComplaintResponse)
async def get_complaint_detail(
    complaint_id: str,
    current_user: User = Depends(require_officer),
    db: Any = Depends(get_db),
):
    """Get detailed view of a complaint with history and tasks."""
    doc = db.collection("complaints").document(complaint_id).get()
    if not doc.exists:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Complaint not found")

    complaint = Complaint.from_firestore(doc)

    if (
        current_user.role == UserRole.OFFICER
        and current_user.department_id
        and complaint.department_id != current_user.department_id
    ):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    response = ComplaintResponse.model_validate(complaint)

    # Status history
    history_docs = db.collection("complaint_status_logs").where("complaint_id", "==", complaint_id).get()
    logs = [ComplaintStatusLog.from_firestore(d) for d in history_docs]
    logs.sort(key=lambda x: x.created_at)
    response.status_history = [StatusLogResponse.model_validate(l) for l in logs]

    # Tasks
    task_docs = db.collection("tasks").where("complaint_id", "==", complaint_id).get()
    response.tasks = [{**td.to_dict(), "id": td.id} for td in task_docs]

    return response


@router.put("/complaints/{complaint_id}/status")
async def update_complaint_status(
    complaint_id: str,
    update_data: ComplaintUpdate,
    current_user: User = Depends(require_officer),
    db: Any = Depends(get_db),
):
    """Update complaint status with state machine validation."""
    doc_ref = db.collection("complaints").document(complaint_id)
    doc = doc_ref.get()

    if not doc.exists:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Complaint not found")

    complaint = Complaint.from_firestore(doc)

    if (
        current_user.role == UserRole.OFFICER
        and current_user.department_id
        and complaint.department_id != current_user.department_id
    ):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    updates = {"updated_at": datetime.utcnow()}

    if update_data.status:
        if not is_valid_transition(complaint.status, update_data.status):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid status transition: {complaint.status.value} → {update_data.status.value}",
            )

        old_status = complaint.status
        updates["status"] = update_data.status.value

        if update_data.status == ComplaintStatus.RESOLVED:
            updates["resolved_at"] = datetime.utcnow()

        status_log = ComplaintStatusLog(
            complaint_id=complaint_id,
            from_status=old_status.value,
            to_status=update_data.status.value,
            remarks=update_data.remarks or f"Status changed from {old_status.value} to {update_data.status.value}",
            updated_by=current_user.id,
        )
        db.collection("complaint_status_logs").add(status_log.to_firestore())

        write_audit_log(
            db,
            action="complaint_status_updated",
            entity_type="complaint",
            entity_id=complaint_id,
            actor_id=current_user.id,
            actor_role=current_user.role.value,
            details={"from_status": old_status.value, "to_status": update_data.status.value},
        )

    if update_data.assigned_officer_id:
        updates["assigned_officer_id"] = update_data.assigned_officer_id

    doc_ref.update(updates)

    return {"message": "Complaint updated successfully", "complaint_id": complaint_id}


@router.get("/complaints/{complaint_id}/history", response_model=List[StatusLogResponse])
async def get_complaint_history(
    complaint_id: str,
    current_user: User = Depends(require_officer),
    db: Any = Depends(get_db),
):
    """Get status history for a complaint."""
    docs = db.collection("complaint_status_logs").where("complaint_id", "==", complaint_id).get()
    logs = [ComplaintStatusLog.from_firestore(doc) for doc in docs]
    logs.sort(key=lambda x: x.created_at)

    return [StatusLogResponse.model_validate(l) for l in logs]


@router.post("/complaints/{complaint_id}/upload-proof")
async def upload_resolution_proof(
    complaint_id: str,
    files: List[UploadFile] = File(...),
    current_user: User = Depends(require_officer),
    db: Any = Depends(get_db),
):
    """Upload proof images for complaint resolution."""
    doc_ref = db.collection("complaints").document(complaint_id)
    doc = doc_ref.get()

    if not doc.exists:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Complaint not found")

    complaint = Complaint.from_firestore(doc)

    if (
        current_user.role == UserRole.OFFICER
        and current_user.department_id
        and complaint.department_id != current_user.department_id
    ):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    if len(files) > 5:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Maximum 5 files allowed")

    uploaded_files = []
    for file in files:
        if not file.content_type.startswith("image/"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"File {file.filename} is not an image",
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
            "uploaded_at": datetime.utcnow().isoformat(),
        })

    existing_proof = complaint.resolution_proof or []
    updated_proof = existing_proof + uploaded_files
    doc_ref.update({"resolution_proof": updated_proof, "updated_at": datetime.utcnow()})

    write_audit_log(
        db,
        action="file_uploaded",
        entity_type="complaint",
        entity_id=complaint_id,
        actor_id=current_user.id,
        actor_role=current_user.role.value,
        details={"type": "resolution_proof", "files_count": len(uploaded_files)},
    )

    return {"message": f"Uploaded {len(uploaded_files)} proof image(s)", "files": uploaded_files}


@router.get("/dashboard/metrics")
async def get_officer_dashboard_metrics(
    current_user: User = Depends(require_officer),
    db: Any = Depends(get_db),
):
    """Get dashboard metrics for the officer's department."""
    query = db.collection("tasks")
    if current_user.role == UserRole.OFFICER and current_user.department_id:
        query = query.where("department_id", "==", current_user.department_id)

    docs = query.get()
    tasks = [Task.from_firestore(doc) for doc in docs]

    pending = sum(1 for t in tasks if t.status == TaskStatus.PENDING)
    assigned = sum(1 for t in tasks if t.status == TaskStatus.ASSIGNED)
    in_progress = sum(1 for t in tasks if t.status == TaskStatus.IN_PROGRESS)
    completed = sum(1 for t in tasks if t.status == TaskStatus.COMPLETED)
    rejected = sum(1 for t in tasks if t.status == TaskStatus.REJECTED)

    return {
        "total_tasks": len(tasks),
        "pending": pending,
        "assigned": assigned,
        "in_progress": in_progress,
        "completed": completed,
        "rejected": rejected,
    }


def _sync_complaint_status(db, complaint_id: str, current_user: User):
    """
    If all tasks for a complaint are COMPLETED, auto-transition complaint to RESOLVED.
    """
    task_docs = db.collection("tasks").where("complaint_id", "==", complaint_id).get()
    if not task_docs:
        return

    tasks = [Task.from_firestore(d) for d in task_docs]
    all_complete = all(t.status in [TaskStatus.COMPLETED, TaskStatus.REJECTED] for t in tasks)
    any_completed = any(t.status == TaskStatus.COMPLETED for t in tasks)

    if all_complete and any_completed:
        comp_ref = db.collection("complaints").document(complaint_id)
        comp_doc = comp_ref.get()
        if not comp_doc.exists:
            return

        complaint = Complaint.from_firestore(comp_doc)
        if complaint.status in [ComplaintStatus.ASSIGNED, ComplaintStatus.IN_PROGRESS]:
            now = datetime.utcnow()
            comp_ref.update({
                "status": ComplaintStatus.RESOLVED.value,
                "resolved_at": now,
                "updated_at": now,
            })

            status_log = ComplaintStatusLog(
                complaint_id=complaint_id,
                from_status=complaint.status.value,
                to_status=ComplaintStatus.RESOLVED.value,
                remarks="All tasks completed — complaint auto-resolved",
                updated_by="system",
            )
            db.collection("complaint_status_logs").add(status_log.to_firestore())

            write_audit_log(
                db,
                action="complaint_status_updated",
                entity_type="complaint",
                entity_id=complaint_id,
                actor_id="system",
                actor_role="system",
                details={"from_status": complaint.status.value, "to_status": ComplaintStatus.RESOLVED.value, "reason": "all_tasks_complete"},
            )
