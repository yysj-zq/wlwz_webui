import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import User
from app.services.conversation_service import (
    create_conversation,
    get_conversation,
    list_conversations,
    rename_conversation,
)


@pytest.mark.asyncio
async def test_conversation_crud_flow(async_db_session: AsyncSession) -> None:
    user = User(email="svc@example.com", username="svc", password_hash="hash")
    async_db_session.add(user)
    await async_db_session.commit()
    await async_db_session.refresh(user)

    created = await create_conversation(async_db_session, user, "初始标题")
    assert created.title == "初始标题"

    listed = await list_conversations(async_db_session, user)
    assert len(listed) == 1
    assert listed[0].id == created.id

    renamed = await rename_conversation(async_db_session, user, created.id, "改名后标题")
    assert renamed.title == "改名后标题"

    fetched = await get_conversation(async_db_session, user, created.id)
    assert fetched.id == created.id


@pytest.mark.asyncio
async def test_get_conversation_raises_when_not_found(async_db_session: AsyncSession) -> None:
    user = User(email="svc2@example.com", username="svc2", password_hash="hash")
    async_db_session.add(user)
    await async_db_session.commit()
    await async_db_session.refresh(user)

    with pytest.raises(ValueError, match="会话不存在或无权访问"):
        await get_conversation(async_db_session, user, 99999)
