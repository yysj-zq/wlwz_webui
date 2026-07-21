"""game_state_service 终态测试：默认世界、apply_world_patches、ensure_conversation_world 播种。"""

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ActorMind, Timeline, User
from app.schemas.world import Position, WorldEntityPatch
from app.services import (
    apply_world_patches,
    build_default_world_state,
    ensure_conversation_world,
)


def test_default_world_state_contains_core_entities() -> None:
    world_state = build_default_world_state()

    assert world_state.map_id == "tongfu_inn"
    assert "player" in world_state.entities
    assert "baizhantang" in world_state.entities
    assert "tongxiangyu" in world_state.entities
    # 终态：world_state 不再含 recent_events / seed_dialogue
    assert not hasattr(world_state, "recent_events")


def test_apply_world_patch_updates_entity_state() -> None:
    world_state = build_default_world_state()

    next_state = apply_world_patches(
        world_state,
        [
            WorldEntityPatch(
                entity_id="baizhantang",
                position=Position(x=9, y=5),
                public_state={"mood": "curious"},
            )
        ],
    )

    # apply_world_patches 不再自增 state_version（由 commit_turn 统一负责）
    assert next_state.state_version == world_state.state_version
    assert next_state.entities["baizhantang"].position.x == 9
    assert next_state.entities["baizhantang"].public_state["mood"] == "curious"


@pytest.mark.asyncio
async def test_ensure_conversation_world_seeds_minds_and_scene(async_db_session: AsyncSession) -> None:
    user = User(email="seed@example.com", username="seed", password_hash="hash")
    async_db_session.add(user)
    await async_db_session.commit()
    await async_db_session.refresh(user)

    conversation, world_state = await ensure_conversation_world(
        async_db_session, user, conversation_id=None, title="同福客栈"
    )
    assert conversation is not None
    assert world_state.entities["baizhantang"].public_state["role"] == "跑堂"

    minds = (
        (await async_db_session.execute(select(ActorMind).where(ActorMind.conversation_id == conversation.id)))
        .scalars()
        .all()
    )
    assert {m.actor_id for m in minds} == {"baizhantang", "guofurong", "tongxiangyu"}

    scenes = (
        (
            await async_db_session.execute(
                select(Timeline).where(Timeline.conversation_id == conversation.id, Timeline.kind == "scene")
            )
        )
        .scalars()
        .all()
    )
    assert len(scenes) == 1
    assert scenes[0].actor_id is None
