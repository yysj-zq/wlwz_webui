"""timeline 排序：必须按写入时序（自增 id），而非 turn_id（UUID 字典序）。"""

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User
from app.repositories import timeline_repository
from app.schemas import TimelineEntry, TimelineKind
from app.services import ensure_conversation_world


async def _new_conversation_id(db: AsyncSession, email: str) -> int:
    user = User(email=email, username=email.split("@")[0], password_hash="hash")
    db.add(user)
    await db.commit()
    await db.refresh(user)
    conversation, _ = await ensure_conversation_world(db, user, conversation_id=None)
    assert conversation is not None
    return conversation.id


@pytest.mark.asyncio
async def test_list_timeline_orders_by_insertion_not_turn_id(
    async_db_session: AsyncSession,
) -> None:
    conversation_id = await _new_conversation_id(async_db_session, "tl@example.com")

    # 先写的 turn_id 字典序更大，后写的更小——模拟 UUID 乱序
    await timeline_repository.append_no_commit(
        async_db_session,
        conversation_id,
        [TimelineEntry(turn_id="zzzz", actor_id="player", kind=TimelineKind.SPEAK, speak="先说的")],
    )
    await async_db_session.commit()
    await timeline_repository.append_no_commit(
        async_db_session,
        conversation_id,
        [TimelineEntry(turn_id="aaaa", actor_id="player", kind=TimelineKind.SPEAK, speak="后说的")],
    )
    await async_db_session.commit()

    entries = await timeline_repository.list_by_conversation(async_db_session, conversation_id)
    assert [e.speak for e in entries if e.actor_id == "player"] == ["先说的", "后说的"]
