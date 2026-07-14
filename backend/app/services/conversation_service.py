from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Conversation, User
from app.repositories import conversation_repository


async def list_conversations(db: AsyncSession, user: User) -> list[Conversation]:
    return await conversation_repository.list_by_user(db, user.id)


async def get_conversation(db: AsyncSession, user: User, conversation_id: int) -> Conversation:
    convo = await conversation_repository.get_by_user(db, user.id, conversation_id)
    if convo is None:
        raise ValueError("会话不存在或无权访问")
    return convo


async def create_conversation(
    db: AsyncSession,
    user: User,
    title: str,
    *,
    description: str | None = None,
    map_id: str,
    state_version: int,
    world_state_json: dict[str, Any],
) -> Conversation:
    return await conversation_repository.create_with_world(
        db,
        user.id,
        title,
        description=description,
        map_id=map_id,
        state_version=state_version,
        world_state_json=world_state_json,
    )


async def delete_conversation(db: AsyncSession, user: User, conversation_id: int) -> None:
    convo = await get_conversation(db, user, conversation_id)
    await db.delete(convo)
    await db.commit()


async def rename_conversation(
    db: AsyncSession, user: User, conversation_id: int, new_title: str
) -> Conversation:
    convo = await get_conversation(db, user, conversation_id)
    convo.title = new_title or convo.title
    await db.commit()
    await db.refresh(convo)
    return convo
