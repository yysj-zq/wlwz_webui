from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ActorMind
from app.repositories.base import BaseRepository


class ActorMindRepository(BaseRepository[ActorMind]):
    async def get_by_conversation_actor(
        self, db: AsyncSession, conversation_id: int, actor_id: str
    ) -> ActorMind | None:
        stmt = select(ActorMind).where(
            ActorMind.conversation_id == conversation_id, ActorMind.actor_id == actor_id
        )
        return (await db.execute(stmt)).scalar_one_or_none()

    async def get_or_create(
        self,
        db: AsyncSession,
        conversation_id: int,
        actor_id: str,
        *,
        defaults: dict[str, Any] | None = None,
    ) -> ActorMind:
        existing = await self.get_by_conversation_actor(db, conversation_id, actor_id)
        if existing is not None:
            return existing
        seed = defaults or {}
        mind = ActorMind(
            conversation_id=conversation_id,
            actor_id=actor_id,
            persona=seed.get("persona", ""),
            relations_json=seed.get("relations", {}),
            memories_json=[],
            goal_json=seed.get("goal", {}),
            inventory_json={},
        )
        db.add(mind)
        return mind


actor_mind_repository = ActorMindRepository(ActorMind)
