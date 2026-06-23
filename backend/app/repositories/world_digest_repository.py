from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Conversation, WorldDigest
from app.repositories.base import BaseRepository


class WorldDigestRepository(BaseRepository[WorldDigest]):
    async def get_by_conversation(
        self, db: AsyncSession, conversation_id: int
    ) -> WorldDigest | None:
        stmt = select(WorldDigest).where(WorldDigest.conversation_id == conversation_id)
        return (await db.execute(stmt)).scalar_one_or_none()

    async def upsert(
        self,
        db: AsyncSession,
        conversation_id: int,
        at_version: int,
        summary_text: str,
    ) -> WorldDigest:
        row = await self.get_by_conversation(db, conversation_id)
        if row is None:
            row = WorldDigest(
                conversation_id=conversation_id,
                at_version=at_version,
                summary_text=summary_text,
            )
            db.add(row)
        else:
            row.at_version = at_version
            row.summary_text = summary_text
        return row

    async def get_conversation(
        self, db: AsyncSession, conversation_id: int
    ) -> Conversation | None:
        stmt = select(Conversation).where(Conversation.id == conversation_id)
        return (await db.execute(stmt)).scalar_one_or_none()


world_digest_repository = WorldDigestRepository(WorldDigest)
