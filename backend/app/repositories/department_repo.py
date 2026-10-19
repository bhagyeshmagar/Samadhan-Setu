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

    async def get_by_category(self, category_name: str) -> Optional[Department]:
        """Resolve department using category mapping with fallback to General mapping."""
        res = await self.session.execute(
            select(CategoryMapping)
            .options(selectinload(CategoryMapping.department))
            .where(CategoryMapping.category.ilike(category_name.strip()))
        )
        mapping = res.scalar_one_or_none()
        if mapping:
            return mapping.department

        # Fallback to General
        fallback = await self.session.execute(
            select(CategoryMapping)
            .options(selectinload(CategoryMapping.department))
            .where(CategoryMapping.category == "General")
        )
        general_mapping = fallback.scalar_one_or_none()
        return general_mapping.department if general_mapping else None

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

        # 3. Standard fallback defaults
        priority_lower = priority.lower()
        if priority_lower == "critical":
            return 4
        elif priority_lower == "high":
            return 24
        elif priority_lower == "medium":
            return 72
        else:
            return 168
