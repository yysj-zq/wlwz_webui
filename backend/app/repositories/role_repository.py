from sqlalchemy import delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import RoleProfile
from app.repositories.base import BaseRepository


class RoleRepository(BaseRepository[RoleProfile]):
    async def get_builtin_and_user_roles(self, db: AsyncSession, user_id: int | None) -> list[RoleProfile]:
        stmt = select(RoleProfile).where(RoleProfile.is_builtin.is_(True))
        if user_id is not None:
            stmt = select(RoleProfile).where(or_(RoleProfile.is_builtin.is_(True), RoleProfile.user_id == user_id))
        result = await db.execute(stmt)
        return list(result.scalars().unique().all())

    async def get_by_name(self, db: AsyncSession, name: str, *, user_id: int | None = None) -> RoleProfile | None:
        stmt = select(RoleProfile).where(RoleProfile.name == name)
        if user_id is not None:
            stmt = stmt.where(or_(RoleProfile.is_builtin.is_(True), RoleProfile.user_id == user_id))
        else:
            stmt = stmt.where(RoleProfile.is_builtin.is_(True))
        return (await db.execute(stmt)).scalar_one_or_none()

    async def list_builtin(self, db: AsyncSession) -> list[RoleProfile]:
        stmt = select(RoleProfile).where(RoleProfile.is_builtin.is_(True)).order_by(RoleProfile.id)
        result = await db.execute(stmt)
        return list(result.scalars().unique().all())

    async def get_user_role(self, db: AsyncSession, user_id: int, role_id: int) -> RoleProfile | None:
        stmt = select(RoleProfile).where(
            RoleProfile.id == role_id,
            RoleProfile.user_id == user_id,
            RoleProfile.is_builtin.is_(False),
        )
        return (await db.execute(stmt)).scalar_one_or_none()

    async def delete_all_builtin(self, db: AsyncSession) -> None:
        await db.execute(delete(RoleProfile).where(RoleProfile.is_builtin.is_(True)))


role_repository = RoleRepository(RoleProfile)
