"""WorldController.commit_turn 终态测试：乐观锁、白名单、单事务。"""

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.world import (
    DirectorDispatch,
    MemoryWrite,
    NPCResponse,
    Perceiver,
    TimelineEntry,
    WorldEntityPatch,
)
from app.models import ActorMind, Timeline, User
from app.services.world_service import WorldController, ensure_conversation_world


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
