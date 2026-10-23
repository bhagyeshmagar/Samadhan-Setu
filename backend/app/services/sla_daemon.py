"""
Autonomous SLA Governance & Auto-Close Engine
Implements:
1. 75% SLA Warning detection & timeline logging
2. 100% SLA Breach auto-escalation + Dynamic Priority Score boost
3. 7-Day Uncontested ATR Auto-Closure (when citizen does not reply to ATR within 7 days)
"""
import asyncio
import logging
from datetime import datetime, timezone, timedelta
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.db.session import AsyncSessionLocal
from app.models.orm.complaint import Complaint, ComplaintTimeline
from app.models.orm.enums import ComplaintStatus

logger = logging.getLogger("samadhan.sla_daemon")

ACTIVE_STATUSES = [
    ComplaintStatus.SUBMITTED,
    ComplaintStatus.ASSIGNED,
    ComplaintStatus.IN_PROGRESS,
]


async def run_sla_governance_sweep() -> dict:
    """Single sweep of active and resolved complaints for SLA governance."""
    now = datetime.now(timezone.utc)
    warned_count = 0
    breached_count = 0
    auto_closed_count = 0

    async with AsyncSessionLocal() as session:
        # 1. Check active complaints for 75% warning and 100% SLA breach
        stmt = (
            select(Complaint)
            .options(selectinload(Complaint.timeline))
            .where(Complaint.status.in_(ACTIVE_STATUSES))
        )
        active_complaints = (await session.execute(stmt)).scalars().all()

        for c in active_complaints:
            if not c.sla_deadline or not c.created_at:
                continue

            total_window = (c.sla_deadline - c.created_at).total_seconds()
            elapsed = (now - c.created_at).total_seconds()
            if total_window <= 0:
                continue

            ratio = elapsed / total_window

            # 100% SLA Breach -> Mark breached & escalate priority score
            if now >= c.sla_deadline and not c.sla_breached:
                c.sla_breached = True
                c.priority_score = min(3.0, round(float(c.priority_score or 1.5) + 0.35, 2))
                c.updated_at = now
                session.add(
                    ComplaintTimeline(
                        complaint_id=c.id,
                        status_from=c.status.value,
                        status_to=c.status.value,
                        actor_role="sla_engine",
                        notes="[SLA BREACH ESCALATION] 100% SLA deadline exceeded. Dynamic Priority boosted & Nodal Authority alerted.",
                    )
                )
                breached_count += 1

            # 75% SLA Warning -> Emit warning once in timeline
            elif 0.75 <= ratio < 1.0:
                already_warned = any(
                    "[SLA 75% WARNING]" in (t.notes or "") for t in (c.timeline or [])
                )
                if not already_warned:
                    session.add(
                        ComplaintTimeline(
                            complaint_id=c.id,
                            status_from=c.status.value,
                            status_to=c.status.value,
                            actor_role="sla_engine",
                            notes="[SLA 75% WARNING] 75% of SLA window consumed. Immediate field action required.",
                        )
                    )
                    warned_count += 1

        # 2. Check RESOLVED complaints for 7-day auto-close
        resolved_cutoff = now - timedelta(days=7)
        resolved_stmt = select(Complaint).where(
            Complaint.status == ComplaintStatus.RESOLVED,
            Complaint.resolved_at != None,
            Complaint.resolved_at <= resolved_cutoff,
        )
        stale_resolved = (await session.execute(resolved_stmt)).scalars().all()

        for c in stale_resolved:
            c.status = ComplaintStatus.CLOSED
            c.updated_at = now
            session.add(
                ComplaintTimeline(
                    complaint_id=c.id,
                    status_from=ComplaintStatus.RESOLVED.value,
                    status_to=ComplaintStatus.CLOSED.value,
                    actor_role="sla_engine",
                    notes="[AUTO-CLOSED] No citizen objection within 7 days of Action Taken Report (ATR).",
                )
            )
            auto_closed_count += 1

        await session.commit()

    return {
        "timestamp": now.isoformat(),
        "warned_75_pct": warned_count,
        "breached_escalated": breached_count,
        "auto_closed_7d": auto_closed_count,
    }


async def sla_background_loop(interval_seconds: int = 300):
    """Runs continuously in the background while FastAPI is alive."""
    while True:
        try:
            await run_sla_governance_sweep()
        except Exception as exc:
            logger.warning(f"SLA sweep error: {exc}")
        await asyncio.sleep(interval_seconds)
