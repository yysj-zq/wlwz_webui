from typing import Any, Generic, TypeVar

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import Base

ModelT = TypeVar("ModelT", bound=Base)


class BaseRepository(Generic[ModelT]):
    def __init__(self, model: type[ModelT]) -> None:
        self.model = model

    async def get(self, db: AsyncSession, id: Any) -> ModelT | None:
        return await db.get(self.model, id)

    async def get_multi(
        self, db: AsyncSession, *, offset: int = 0, limit: int = 100
    ) -> list[ModelT]:
        stmt = select(self.model).offset(offset).limit(limit)
        return list((await db.execute(stmt)).scalars().all())

    async def create(self, db: AsyncSession, obj: ModelT, *, flush: bool = False) -> ModelT:
        db.add(obj)
        if flush:
            await db.flush()
        return obj

    async def delete(self, db: AsyncSession, obj: ModelT) -> None:
        await db.delete(obj)
