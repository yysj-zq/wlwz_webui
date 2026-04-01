from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Conversation, Message, User


async def list_conversations(db: AsyncSession, user: User) -> list[Conversation]:
    stmt = select(Conversation).where(Conversation.user_id == user.id).order_by(Conversation.updated_at.desc())
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_conversation(db: AsyncSession, user: User, conversation_id: int) -> Conversation:
    stmt = select(Conversation).where(Conversation.id == conversation_id, Conversation.user_id == user.id)
    result = await db.execute(stmt)
    convo = result.scalar_one_or_none()
    if convo is None:
        raise ValueError("会话不存在或无权访问")
    return convo


async def create_conversation(
    db: AsyncSession,
    user: User,
    title: str,
    description: Optional[str] = None,
) -> Conversation:
    convo = Conversation(user_id=user.id, title=title or "新的对话", description=description)
    db.add(convo)
    await db.commit()
    await db.refresh(convo)
    return convo


async def delete_conversation(db: AsyncSession, user: User, conversation_id: int) -> None:
    convo = await get_conversation(db, user, conversation_id)
    await db.delete(convo)
    await db.commit()


async def rename_conversation(db: AsyncSession, user: User, conversation_id: int, new_title: str) -> Conversation:
    convo = await get_conversation(db, user, conversation_id)
    convo.title = new_title or convo.title
    await db.commit()
    await db.refresh(convo)
    return convo


async def append_messages(db: AsyncSession, conversation: Conversation, messages: list[dict]) -> None:
    stmt = select(func.max(Message.sequence)).where(Message.conversation_id == conversation.id)
    result = await db.execute(stmt)
    max_seq = result.scalar_one()
    next_seq = (max_seq or 0) + 1

    for msg in messages:
        db.add(
            Message(
                conversation_id=conversation.id,
                role=msg["role"],
                content=msg["content"],
                sequence=next_seq,
            )
        )
        next_seq += 1

    await db.commit()
    await db.refresh(conversation)
