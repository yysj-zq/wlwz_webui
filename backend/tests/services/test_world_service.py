"""world_service 终态测试：注册表派生世界、embody 规则、apply_world_patches、ensure/切换（就地）。"""

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ActorMind, Timeline, User
from app.schemas.world import Position, WorldEntityPatch, WorldState
from app.services import (
    apply_world_patches,
    build_world_state,
    ensure_conversation_world,
    switch_played_role,
)

# conftest 已按 yaml 播种全部 in_game 角色（含外来可扮演角色 player）
_CAST_SLUGS = {
    "tongxiangyu",
    "baizhantang",
    "guofurong",
    "lidazui",
    "lvxiucai",
    "moxiaobei",
    "yanxiaoliu",
    "zhuwushuang",
    "xingyusen",
}
_ALL_SLUGS = _CAST_SLUGS | {"player"}


async def _make_user(db: AsyncSession, email: str) -> User:
    user = User(email=email, username=email.split("@")[0], password_hash="hash")
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@pytest.mark.asyncio
async def test_build_world_state_plays_registry_player(async_db_session: AsyncSession) -> None:
    world_state = await build_world_state(async_db_session, played_actor_id="player")

    assert world_state.map_id == "tongfu_inn"
    assert world_state.player_actor_id == "player"
    assert world_state.entities["player"].kind == "player"
    # 全部其它 in_game 角色作为 NPC 在场
    assert set(world_state.entities) >= _ALL_SLUGS
    assert world_state.entities["baizhantang"].kind == "npc"
    # 物件实体仍在
    assert world_state.entities["counter"].kind == "object"


@pytest.mark.asyncio
async def test_build_world_state_embody_role(async_db_session: AsyncSession) -> None:
    world_state = await build_world_state(async_db_session, played_actor_id="baizhantang")

    assert world_state.player_actor_id == "baizhantang"
    # 附身角色作为玩家实体；外来 player 仍以 NPC 在场
    assert world_state.entities["baizhantang"].kind == "player"
    assert "player" in world_state.entities
    assert world_state.entities["player"].kind == "npc"
    # 其余角色仍为 NPC
    assert world_state.entities["tongxiangyu"].kind == "npc"


@pytest.mark.asyncio
async def test_apply_world_patch_updates_entity_state(async_db_session: AsyncSession) -> None:
    world_state = await build_world_state(async_db_session, played_actor_id="player")

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
    user = await _make_user(async_db_session, "seed@example.com")

    conversation, world_state = await ensure_conversation_world(
        async_db_session, user, conversation_id=None, title="同福客栈"
    )
    assert conversation is not None
    assert world_state.player_actor_id == "player"
    assert world_state.entities["player"].kind == "player"
    assert world_state.entities["baizhantang"].kind == "npc"

    minds = (
        (await async_db_session.execute(select(ActorMind).where(ActorMind.conversation_id == conversation.id)))
        .scalars()
        .all()
    )
    # 建会话全员播种（含当前扮演的 player）
    assert {m.actor_id for m in minds} == _ALL_SLUGS

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


@pytest.mark.asyncio
async def test_switch_played_role_preserves_positions_and_bumps_version(
    async_db_session: AsyncSession,
) -> None:
    user = await _make_user(async_db_session, "switch@example.com")
    conversation, world_before = await ensure_conversation_world(async_db_session, user, conversation_id=None)
    assert conversation is not None
    before_version = conversation.state_version

    # 模拟会话进行中：挪动若干实体离开 spawn
    moved = apply_world_patches(
        world_before,
        [
            WorldEntityPatch(entity_id="player", position=Position(x=12, y=9)),
            WorldEntityPatch(entity_id="guofurong", position=Position(x=2, y=2)),
            WorldEntityPatch(entity_id="baizhantang", position=Position(x=15, y=8)),
        ],
    )
    conversation.world_state_json = moved.model_dump(mode="json")
    await async_db_session.commit()

    world_state = await switch_played_role(async_db_session, conversation, "guofurong")

    assert world_state.player_actor_id == "guofurong"
    assert world_state.state_version == before_version + 1
    assert world_state.entities["guofurong"].kind == "player"
    assert world_state.entities["player"].kind == "npc"
    # 境况保留：坐标未被重置到 spawn
    assert world_state.entities["player"].position == Position(x=12, y=9)
    assert world_state.entities["guofurong"].position == Position(x=2, y=2)
    assert world_state.entities["baizhantang"].position == Position(x=15, y=8)
    assert conversation.state_version == before_version + 1

    minds = (
        (await async_db_session.execute(select(ActorMind).where(ActorMind.conversation_id == conversation.id)))
        .scalars()
        .all()
    )
    # 切换不补播：心智集仍是建会话时的全员
    assert {m.actor_id for m in minds} == _ALL_SLUGS


@pytest.mark.asyncio
async def test_switch_played_role_rejects_invalid_actor(async_db_session: AsyncSession) -> None:
    user = await _make_user(async_db_session, "invalid@example.com")
    conversation, _ = await ensure_conversation_world(async_db_session, user, conversation_id=None)
    assert conversation is not None

    with pytest.raises(ValueError, match="非法扮演角色"):
        await switch_played_role(async_db_session, conversation, "no_such_role")


@pytest.mark.asyncio
async def test_switch_played_role_rejects_absent_entity(async_db_session: AsyncSession) -> None:
    user = await _make_user(async_db_session, "absent@example.com")
    conversation, world = await ensure_conversation_world(async_db_session, user, conversation_id=None)
    assert conversation is not None
    # 人为移除在场实体，模拟残缺世界
    entities = dict(world.entities)
    del entities["guofurong"]
    conversation.world_state_json = WorldState(
        map_id=world.map_id,
        state_version=world.state_version,
        player_actor_id=world.player_actor_id,
        entities=entities,
    ).model_dump(mode="json")
    await async_db_session.commit()

    with pytest.raises(ValueError, match="不在当前世界"):
        await switch_played_role(async_db_session, conversation, "guofurong")
