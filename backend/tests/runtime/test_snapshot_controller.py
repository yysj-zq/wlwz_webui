"""包 A：SessionSnapshot 分叉 + RuntimeWorldController.commit_turn。"""

from __future__ import annotations

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.runtime import (
    RuntimeWorldController,
    SessionSnapshot,
    build_default_snapshot,
    fork_snapshot,
)
from app.schemas import MemoryWrite, NPCResponse, TimelineEntry, TimelineKind, WorldEntityPatch


@pytest.mark.asyncio
async def test_fork_snapshot_isolation(async_db_session: AsyncSession) -> None:
    base = await build_default_snapshot(async_db_session, seed_id="fork-test")
    children = fork_snapshot(base, n=2)
    assert len(children) == 2

    a, b = children
    assert a.meta.run_id != b.meta.run_id
    assert a.meta.parent_run_id == base.meta.run_id
    assert b.meta.parent_run_id == base.meta.run_id
    assert a.meta.contract_fingerprint == base.meta.contract_fingerprint

    actor_id = next(iter(a.minds))
    a.minds[actor_id].persona = "mutated-persona-a"
    a.world = a.world.model_copy(update={"state_version": 99})
    a.timeline.append(TimelineEntry(turn_id="extra", intra_turn_seq=1, kind=TimelineKind.SCENE, speak="only-a"))

    assert b.minds[actor_id].persona != "mutated-persona-a"
    assert b.world.state_version == base.world.state_version
    assert all(e.speak != "only-a" for e in b.timeline)
    assert base.minds[actor_id].persona != "mutated-persona-a"
    assert base.world.state_version != 99


@pytest.mark.asyncio
async def test_runtime_commit_turn_updates_mind_timeline_version(
    async_db_session: AsyncSession,
) -> None:
    snapshot = await build_default_snapshot(async_db_session, seed_id="commit-test")
    controller = RuntimeWorldController(snapshot)
    await controller.commit(expected_state_version=snapshot.world.state_version)

    player_entry = TimelineEntry(turn_id="t1", actor_id="player", kind=TimelineKind.SPEAK, speak="老白！")
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

    assert committed.world_state.state_version == 2
    assert committed.world_state.entities["baizhantang"].public_state["mood"] == "warm"
    assert controller.world_state.state_version == 2
    assert snapshot.world.state_version == 2

    turn_entries = [e for e in snapshot.timeline if e.turn_id == "t1"]
    assert [e.intra_turn_seq for e in turn_entries] == [0, 1]
    assert turn_entries[1].actor_id == "baizhantang"
    assert turn_entries[1].speak == "客官您吩咐。"

    mind = snapshot.minds["baizhantang"]
    assert mind.memories[-1]["content"] == "玩家叫了我"
    assert mind.memories[-1]["at_version"] == 2

    view = await controller.load_mind_view("baizhantang")
    assert view["recent_memories"][-1]["content"] == "玩家叫了我"


@pytest.mark.asyncio
async def test_runtime_commit_requires_prior_commit(async_db_session: AsyncSession) -> None:
    snapshot = await build_default_snapshot(async_db_session)
    controller = RuntimeWorldController(snapshot)
    with pytest.raises(RuntimeError, match="prior successful commit"):
        await controller.commit_turn(
            turn_id="t0",
            player_entry=TimelineEntry(turn_id="t0", actor_id="player", kind=TimelineKind.SPEAK, speak="hi"),
            director_writes=[],
            npc_responses=[],
            scene_note=None,
        )


@pytest.mark.asyncio
async def test_snapshot_roundtrip_jsonable(async_db_session: AsyncSession) -> None:
    snap = await build_default_snapshot(async_db_session, seed_id="serde")
    restored = SessionSnapshot.from_jsonable(snap.to_jsonable())
    assert restored.meta.seed_id == "serde"
    assert restored.meta.contract_fingerprint == snap.meta.contract_fingerprint
    assert restored.world.map_id == snap.world.map_id
    assert set(restored.minds) == set(snap.minds)
