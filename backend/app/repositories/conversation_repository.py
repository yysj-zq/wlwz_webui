from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Conversation
from app.repositories.base import BaseRepository


class ConversationRepository(BaseRepository[Conversation]):
    async def list_by_user(self, db: AsyncSession, user_id: int) -> list[Conversation]:
        stmt = select(Conversation).where(Conversation.user_id == user_id).order_by(Conversation.updated_at.desc())
        return list((await db.execute(stmt)).scalars().all())

    async def get_by_user(self, db: AsyncSession, user_id: int, conversation_id: int) -> Conversation | None:
        stmt = select(Conversation).where(Conversation.id == conversation_id, Conversation.user_id == user_id)
        return (await db.execute(stmt)).scalar_one_or_none()

    async def create_with_world(
        self,
        db: AsyncSession,
        user_id: int,
        title: str,
        *,
        description: str | None = None,
        map_id: str,
        state_version: int,
        world_state_json: dict[str, Any],
    ) -> Conversation:
        convo = Conversation(
            user_id=user_id,
            title=title or "新的对话",
            description=description,
            map_id=map_id,
            state_version=state_version,
            world_state_json=world_state_json,
        )
        db.add(convo)
        await db.flush()
        return convo


conversation_repository = ConversationRepository(Conversation)
