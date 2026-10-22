import uuid
from typing import Optional, List
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.orm import Department, CategoryMapping, SLARule

class DepartmentRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def list_all(self, active_only: bool = True) -> List[Department]:
        query = select(Department).order_by(Department.name.asc())
        if active_only:
            query = query.where(Department.is_active == True)
        res = await self.session.execute(query)
        return list(res.scalars().all())

    async def get_by_id(self, dept_id: uuid.UUID) -> Optional[Department]:
        res = await self.session.execute(
            select(Department)
            .options(selectinload(Department.officers))
            .where(Department.id == dept_id)
        )
        return res.scalar_one_or_none()

    async def get_by_code(self, code: str) -> Optional[Department]:
        res = await self.session.execute(
            select(Department).where(Department.code == code)
        )
        return res.scalar_one_or_none()

    async def get_by_category(self, category: str) -> Optional[Department]:
        stmt = select(Department).where(Department.is_active == True)
        result = await self.session.execute(stmt)
        departments = result.scalars().all()
        cat_lower = category.lower().strip()
        for dept in departments:
            handled = [c.lower().strip() for c in (dept.categories_handled or [])]
            if cat_lower in handled:
                return dept
        return None

    async def get_sla_hours(self, category: Optional[str], priority: str) -> int:
        """Resolve SLA resolution hours based on rules or defaults."""
        # 1. Category-specific rule
        if category:
            res = await self.session.execute(
                select(SLARule).where(SLARule.category.ilike(category))
            )
            rule = res.scalars().first()
            if rule:
                return rule.resolution_hours

        # 2. Priority-specific rule
        res = await self.session.execute(
            select(SLARule).where(SLARule.priority.ilike(priority))
        )
        rule = res.scalars().first()
        if rule:
            return rule.resolution_hours

        # 3. Standard fallback defaults matching statutory deadlines:
        # Critical = 3 days (72h), High = 5 days (120h), Medium = 7 days (168h), Low = 21 days (504h)
        priority_lower = priority.lower()
        if priority_lower == "critical":
            return 72
        elif priority_lower == "high":
            return 120
        elif priority_lower == "medium":
            return 168
        else:
            return 504
