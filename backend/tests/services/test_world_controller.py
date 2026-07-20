"""WorldController.commit_turn 终态测试：乐观锁、白名单、单事务。"""

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.world import (
    DirectorDispatch,
    MemoryWrite,
    NPCResponse,
    Perceiver,
    Position,
    TimelineEntry,
    WorldEntityPatch,
)
from app.models import ActorMind, Timeline, User
from app.services import WorldController, ensure_conversation_world


async def _setup_controller(db: AsyncSession, email: str) -> WorldController:
    user = User(email=email, username=email.split("@")[0], password_hash="hash")
    db.add(user)
    await db.commit()
    await db.refresh(user)
    conversation, world_state = await ensure_conversation_world(db, user, conversation_id=None)
    return WorldController(db, conversation, world_state)


@pytest.mark.asyncio
async def test_commit_turn_writes_timeline_and_actor_mind(
    async_db_session: AsyncSession,
) -> None:
    controller = await _setup_controller(async_db_session, "ctl@example.com")

    player_entry = TimelineEntry(
        turn_id="t1", actor_id="player", kind="speak", speak="老白！"
    )
    npc_response = NPCResponse(
        speak="客官您吩咐。",
        act_patch=[WorldEntityPatch(entity_id="baizhantang", public_state={"mood": "warm"})],
        memory_writes=[MemoryWrite(content="玩家叫了我")],
    )
    committed = await controller.commit_turn(
        turn_id="t1",
        player_entry=player_entry,
        director_writes=[],
        npc_responses=[("baizhantang", npc_response)],
        scene_note=None,
    )

    assert committed.world_state.entities["baizhantang"].public_state["mood"] == "warm"
    assert committed.world_state.state_version == 2  # 初始 1 → commit 后 +1
    # timeline 顺序：player=0、npc=1
    rows = (
        await async_db_session.execute(
            select(Timeline)
            .where(Timeline.conversation_id == controller.conversation_id)
            .order_by(Timeline.intra_turn_seq)
        )
    ).scalars().all()
    turn_rows = [r for r in rows if r.turn_id == "t1"]
    assert [r.intra_turn_seq for r in turn_rows] == [0, 1]
    assert turn_rows[1].actor_id == "baizhantang"
    assert turn_rows[1].kind == "speak_and_act"

    mind = (
        await async_db_session.execute(
            select(ActorMind).where(
                ActorMind.actor_id == "baizhantang",
                ActorMind.conversation_id == controller.conversation_id,
            )
        )
    ).scalar_one()
    assert mind.memories_json[-1]["content"] == "玩家叫了我"


@pytest.mark.asyncio
async def test_commit_turn_rejects_private_keys(async_db_session: AsyncSession) -> None:
    controller = await _setup_controller(async_db_session, "reject@example.com")

    bad_response = NPCResponse(
        act_patch=[WorldEntityPatch(entity_id="baizhantang", public_state={"memories": ["不许写"]})]
    )
    with pytest.raises(ValueError, match="不能写入"):
        await controller.commit_turn(
            turn_id="t2",
            player_entry=TimelineEntry(turn_id="t2", actor_id="player", kind="speak", speak="hi"),
            director_writes=[],
            npc_responses=[("baizhantang", bad_response)],
            scene_note=None,
        )


@pytest.mark.asyncio
async def test_commit_turn_silent_npc_skipped(async_db_session: AsyncSession) -> None:
    controller = await _setup_controller(async_db_session, "silent@example.com")

    committed = await controller.commit_turn(
        turn_id="t3",
        player_entry=TimelineEntry(turn_id="t3", actor_id="player", kind="speak", speak="..."),
        director_writes=[],
        npc_responses=[("baizhantang", NPCResponse())],
        scene_note=None,
    )

    rows = (
        await async_db_session.execute(
            select(Timeline)
            .where(
                Timeline.conversation_id == controller.conversation_id,
                Timeline.turn_id == "t3",
            )
        )
    ).scalars().all()
    # 全空 NPC 跳过：只剩玩家这一条
    assert len(rows) == 1
    assert rows[0].actor_id == "player"
    assert committed.world_state.state_version == 2


@pytest.mark.asyncio
async def test_commit_turn_director_writes_merge_single_scene_entry(
    async_db_session: AsyncSession,
) -> None:
    controller = await _setup_controller(async_db_session, "scene@example.com")

    scene_note = "门被推开，一阵冷风灌进屋里"
    director_writes = [WorldEntityPatch(entity_id="table", public_state={"state": "moved"})]
    await controller.commit_turn(
        turn_id="t4",
        player_entry=TimelineEntry(turn_id="t4", actor_id="player", kind="speak", speak="..."),
        director_writes=director_writes,
        npc_responses=[],
        scene_note=scene_note,
    )

    rows = (
        await async_db_session.execute(
            select(Timeline).where(
                Timeline.conversation_id == controller.conversation_id,
                Timeline.turn_id == "t4",
            )
        )
    ).scalars().all()
    # 玩家 + 单条 director SCENE，共 2 条；不再有 actor_id=player 的 ACT 冗余条
    scene_rows = [r for r in rows if r.kind == "scene"]
    assert len(scene_rows) == 1
    scene = scene_rows[0]
    # director 世界变更：narration 承载中文映射（进展示窗口），act_patch 同条携带机器态，speak 为空
    assert scene.narration == scene_note
    assert scene.speak is None
    assert scene.act_patch_json == [ep.model_dump(mode="json") for ep in director_writes]
    # 无 actor_id=player 的 ACT 冗余记录
    assert not any(r.kind == "act" and r.actor_id == "player" for r in rows)


@pytest.mark.asyncio
async def test_commit_turn_no_director_writes_no_scene_entry(
    async_db_session: AsyncSession,
) -> None:
    controller = await _setup_controller(async_db_session, "noscene@example.com")

    # 无世界变更 → 无 narration → 不产 SCENE（narration 不独立存在）
    await controller.commit_turn(
        turn_id="t5",
        player_entry=TimelineEntry(turn_id="t5", actor_id="player", kind="speak", speak="发个呆"),
        director_writes=[],
        npc_responses=[],
        scene_note=None,
    )

    rows = (
        await async_db_session.execute(
            select(Timeline).where(
                Timeline.conversation_id == controller.conversation_id,
                Timeline.turn_id == "t5",
            )
        )
    ).scalars().all()
    assert [r.kind for r in rows] == ["speak"]  # 仅玩家一条
    assert not any(r.kind == "scene" for r in rows)


@pytest.mark.asyncio
async def test_director_dispatch_drops_unknown_fields() -> None:
    """DirectorDispatch 解析时拒绝旧 suggested_focus / intent_briefs。"""
    raw = {
        "world_writes": [],
        "perceivers": [{"actor_id": "baizhantang", "perception_reason": "被直接称呼"}],
        "suggested_focus": "should_be_dropped",  # 旧字段
        "intent_briefs": [],
    }
    dispatch = DirectorDispatch.model_validate(raw)
    assert not hasattr(dispatch, "suggested_focus")
    assert dispatch.perceivers == [Perceiver(actor_id="baizhantang", perception_reason="被直接称呼")]


@pytest.mark.asyncio
async def test_apply_player_action_mutates_world_no_version_bump(
    async_db_session: AsyncSession,
) -> None:
    controller = await _setup_controller(async_db_session, "applyplayer@example.com")
    before_version = controller.world_state.state_version

    controller.apply_player_action(
        [WorldEntityPatch(entity_id="player", position=Position(x=7, y=8), direction="east")]
    )

    player = controller.world_state.entities["player"]
    assert (player.position.x, player.position.y) == (7, 8)
    assert player.direction == "east"
    # 内存落地不 bump version（版本只在 commit_turn 递增）
    assert controller.world_state.state_version == before_version


@pytest.mark.asyncio
async def test_apply_player_action_empty_is_noop(
    async_db_session: AsyncSession,
) -> None:
    controller = await _setup_controller(async_db_session, "applyempty@example.com")
    snapshot = controller.world_state
    controller.apply_player_action([])
    # 空 patch：world_state 引用不变
    assert controller.world_state is snapshot
