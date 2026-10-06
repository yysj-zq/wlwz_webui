"""W1.7 冒烟：无头开局 → stub LLM step → 轨迹回读；fork 隔离。"""

from __future__ import annotations

import uuid
from typing import Any

import pytest
from langchain_core.messages import AIMessage
from sqlalchemy.ext.asyncio import AsyncSession

import app.graph.nodes.director as director_node
import app.graph.nodes.npc as npc_node
from app.runtime import (
    ContractFingerprintMismatch,
    HeadlessSession,
    open_default_world,
)
from app.schemas import GameActionRequest


class _StubBoundLLM:
    def __init__(self, tool_name: str, tool_args: dict[str, Any]) -> None:
        self.tool_name = tool_name
        self.tool_args = tool_args

    async def ainvoke(self, _messages: list[Any]) -> AIMessage:
        call_id = uuid.uuid4().hex
        return AIMessage(
            content="",
            tool_calls=[{"name": self.tool_name, "args": self.tool_args, "id": call_id}],
        )


class _StubChat:
    def __init__(self, tool_name: str, tool_args: dict[str, Any]) -> None:
        self.tool_name = tool_name
        self.tool_args = tool_args

    def bind_tools(self, _tools: object, **_kwargs: object) -> _StubBoundLLM:
        return _StubBoundLLM(self.tool_name, self.tool_args)


def _patch_director_dispatch(monkeypatch: pytest.MonkeyPatch, dispatch: dict[str, Any]) -> None:
    monkeypatch.setattr(
        director_node,
        "get_chat_model",
        lambda **_: _StubChat("submit_dispatch", dispatch),
    )


def _patch_npc_response(monkeypatch: pytest.MonkeyPatch, response: dict[str, Any]) -> None:
    full = {"act_patch": [], "memory_writes": [], "inventory_ops": [], **response}
    monkeypatch.setattr(
        npc_node,
        "get_chat_model",
        lambda **_: _StubChat("submit_response", full),
    )


@pytest.mark.asyncio
async def test_open_default_world_step_trajectory(
    async_db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    session = await open_default_world(async_db_session, seed_id="smoke-w17")
    assert isinstance(session, HeadlessSession)
    assert session.snapshot.meta.seed_id == "smoke-w17"

    _patch_director_dispatch(
        monkeypatch,
        {
            "world_writes": [],
            "perceivers": [{"actor_id": "baizhantang", "perception_reason": "被直接称呼"}],
        },
    )
    _patch_npc_response(
        monkeypatch,
        {"speak": "客官请讲。", "memory_writes": [{"content": "玩家叫了我"}]},
    )

    result = await session.step(
        GameActionRequest(actor_id="player", target_id="baizhantang", speak="老白！", state_version=1)
    )

    assert result.turn_id
    assert result.world.state_version == 2
    speaks = [e for e in result.timeline_delta if e.speak]
    assert any(e.actor_id == "player" and e.speak == "老白！" for e in speaks)
    assert any(e.actor_id == "baizhantang" and e.speak == "客官请讲。" for e in speaks)

    events = session.trajectory.list(turn_id=result.turn_id)
    assert events
    types = {e.event_type for e in events}
    assert "turn_committed" in types or "llm_output" in types
    assert any(e.event_type == "turn_committed" for e in result.trajectory)

    by_run = session.trajectory.list(run_id=session.snapshot.meta.run_id)
    assert len(by_run) >= len(events)


@pytest.mark.asyncio
async def test_fork_branches_isolated(async_db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch) -> None:
    base = await open_default_world(async_db_session, seed_id="fork-smoke")
    children = base.fork(2)
    assert len(children) == 2
    a, b = children
    assert a.snapshot.meta.run_id != b.snapshot.meta.run_id
    assert a.snapshot.meta.parent_run_id == base.snapshot.meta.run_id
    assert a.trajectory is not b.trajectory
    assert a.trajectory.run_id == a.snapshot.meta.run_id
    assert b.trajectory.run_id == b.snapshot.meta.run_id

    _patch_director_dispatch(
        monkeypatch,
        {
            "world_writes": [],
            "perceivers": [{"actor_id": "baizhantang", "perception_reason": "分支 A"}],
        },
    )
    _patch_npc_response(
        monkeypatch,
        {"speak": "我是分支A", "memory_writes": [{"content": "memory-A"}]},
    )
    result_a = await a.step({"actor_id": "player", "target_id": "baizhantang", "speak": "A说"})

    _patch_director_dispatch(
        monkeypatch,
        {
            "world_writes": [],
            "perceivers": [{"actor_id": "baizhantang", "perception_reason": "分支 B"}],
        },
    )
    _patch_npc_response(
        monkeypatch,
        {"speak": "我是分支B", "memory_writes": [{"content": "memory-B"}]},
    )
    result_b = await b.step({"actor_id": "player", "target_id": "baizhantang", "speak": "B说"})

    assert result_a.world.state_version == 2
    assert result_b.world.state_version == 2
    assert a.snapshot.world.state_version == 2
    assert b.snapshot.world.state_version == 2

    mind_a = a.snapshot.minds["baizhantang"].memories[-1]["content"]
    mind_b = b.snapshot.minds["baizhantang"].memories[-1]["content"]
    assert mind_a == "memory-A"
    assert mind_b == "memory-B"
    assert "memory-A" not in [m["content"] for m in b.snapshot.minds["baizhantang"].memories]
    assert "memory-B" not in [m["content"] for m in a.snapshot.minds["baizhantang"].memories]

    # 父会话未被污染
    assert base.snapshot.world.state_version == 1
    assert not any(m.get("content") in {"memory-A", "memory-B"} for m in base.snapshot.minds["baizhantang"].memories)

    assert a.trajectory.list(run_id=a.snapshot.meta.run_id)
    assert b.trajectory.list(run_id=b.snapshot.meta.run_id)
    assert not a.trajectory.list(run_id=b.snapshot.meta.run_id)
    assert not b.trajectory.list(run_id=a.snapshot.meta.run_id)


@pytest.mark.asyncio
async def test_step_rejects_fingerprint_mismatch(
    async_db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    session = await open_default_world(async_db_session, seed_id="fp-mismatch")
    session.snapshot.meta.contract_fingerprint = "sha256:" + ("f" * 64)

    with pytest.raises(ContractFingerprintMismatch, match="contract_fingerprint mismatch"):
        await session.step({"actor_id": "player", "speak": "不应推进"})

    # 确认未因指纹失败而误改版本
    assert session.snapshot.world.state_version == 1
