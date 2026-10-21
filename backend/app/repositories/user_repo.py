import uuid
from datetime import datetime, timezone
from typing import Optional, List
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.orm import User, UserRole, Officer

class UserRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_id(self, user_id: uuid.UUID) -> Optional[User]:
        res = await self.session.execute(
            select(User)
            .options(selectinload(User.officer_profile))
            .where(User.id == user_id)
        )
        return res.scalar_one_or_none()

    async def get_by_email(self, email: str) -> Optional[User]:
        res = await self.session.execute(
            select(User)
            .options(selectinload(User.officer_profile))
            .where(User.email == email.strip().lower())
        )
        return res.scalar_one_or_none()

    async def get_by_phone(self, phone: str) -> Optional[User]:
        if not phone:
            return None
        res = await self.session.execute(
            select(User)
            .options(selectinload(User.officer_profile))
            .where(User.phone == phone.strip())
        )
        return res.scalar_one_or_none()

    async def create(
        self,
        email: str,
        name: str,
        password_hash: str,
        role: UserRole = UserRole.CITIZEN,
        phone: Optional[str] = None,
        ward: Optional[str] = None,
        city: Optional[str] = None,
        state: str = "Maharashtra",
        pincode: Optional[str] = None,
        is_verified: bool = False,
    ) -> User:
        user = User(
            id=uuid.uuid4(),
            email=email.strip().lower(),
            name=name.strip(),
            password_hash=password_hash,
            role=role,
            phone=phone,
            ward=ward,
            city=city,
            state=state,
            pincode=pincode,
            is_verified=is_verified,
        )
        self.session.add(user)
        await self.session.flush()
        return user

    async def update_last_login(self, user_id: uuid.UUID) -> None:
        await self.session.execute(
            update(User)
            .where(User.id == user_id)
            .values(last_login_at=datetime.now(timezone.utc))
        )

    async def update_fcm_token(self, user_id: uuid.UUID, fcm_token: str) -> None:
        await self.session.execute(
            update(User)
            .where(User.id == user_id)
            .values(fcm_token=fcm_token)
        )

    async def get_officer_by_user_id(self, user_id: uuid.UUID) -> Optional[Officer]:
        res = await self.session.execute(
            select(Officer).where(Officer.user_id == user_id)
        )
        return res.scalar_one_or_none()

    async def get_officer_by_id(self, officer_id: uuid.UUID) -> Optional[Officer]:
        res = await self.session.execute(
            select(Officer)
            .options(selectinload(Officer.user), selectinload(Officer.department))
            .where(Officer.id == officer_id)
        )
        return res.scalar_one_or_none()
