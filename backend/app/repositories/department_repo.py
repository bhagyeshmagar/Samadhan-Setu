import uuid
from typing import Optional, List
from sqlalchemy import select, func
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
        cat_clean = category.strip()
        # 1. Check database CategoryMapping first
        mapping_stmt = (
            select(CategoryMapping)
            .options(selectinload(CategoryMapping.department))
            .where(func.lower(CategoryMapping.category) == cat_clean.lower())
        )
        mapping_res = await self.session.execute(mapping_stmt)
        mapping = mapping_res.scalars().first()
        if mapping and mapping.department and mapping.department.is_active:
            return mapping.department

        # 2. Fallback to Department.categories_handled
        stmt = (
            select(Department)
            .options(selectinload(Department.category_mappings))
            .where(Department.is_active == True)
        )
        result = await self.session.execute(stmt)
        departments = result.scalars().all()
        cat_lower = cat_clean.lower()
        for dept in departments:
            handled = [c.lower().strip() for c in (dept.categories_handled or [])]
            if cat_lower in handled:
                return dept
        return None

    async def get_sla_hours(self, category: Optional[str], priority: str) -> int:
        """
        Resolve SLA resolution hours with explicit precedence:
        1. Category + Priority specific rule
        2. Category-only rule (where priority IS NULL)
        3. Priority-only rule (where category IS NULL)
        4. Statutory default fallback: Critical=72h, High=120h, Medium=168h, Low=504h
        """
        priority_clean = priority.strip().lower()

        # 1. Category + Priority rule
        if category:
            res = await self.session.execute(
                select(SLARule)
                .where(
                    SLARule.category.ilike(category.strip()),
                    SLARule.priority.ilike(priority_clean),
                )
                .order_by(SLARule.id.asc())
            )
            rule = res.scalars().first()
            if rule and rule.resolution_hours:
                return rule.resolution_hours

            # 2. Category-only rule (where priority IS NULL)
            res = await self.session.execute(
                select(SLARule)
                .where(
                    SLARule.category.ilike(category.strip()),
                    SLARule.priority.is_(None),
                )
                .order_by(SLARule.id.asc())
            )
            rule = res.scalars().first()
            if rule and rule.resolution_hours:
                return rule.resolution_hours

        # 3. Priority-only rule (strictly where category IS NULL)
        res = await self.session.execute(
            select(SLARule)
            .where(
                SLARule.category.is_(None),
                SLARule.priority.ilike(priority_clean),
            )
            .order_by(SLARule.id.asc())
        )
        rule = res.scalars().first()
        if rule and rule.resolution_hours:
            return rule.resolution_hours

        # 4. Standard statutory fallback defaults:
        if priority_clean == "critical":
            return 72
        elif priority_clean == "high":
            return 120
        elif priority_clean == "medium":
            return 168
        else:
            return 504
