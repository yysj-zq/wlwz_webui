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
        "resolve_chat_model",
        lambda *_a, **_k: _StubChat("submit_dispatch", dispatch),
    )


def _patch_npc_response(monkeypatch: pytest.MonkeyPatch, response: dict[str, Any]) -> None:
    full = {"act_patch": [], "memory_writes": [], "inventory_ops": [], **response}
    monkeypatch.setattr(
        npc_node,
        "resolve_chat_model",
        lambda *_a, **_k: _StubChat("submit_response", full),
    )


def _teacher_factory_for(
    *,
    director_dispatch: dict[str, Any],
    npc_response: dict[str, Any],
) -> Any:
    """模拟 G2 注入教师：按 temperature 区分 director(0.7) / npc(0.8)。"""

    npc_full = {"act_patch": [], "memory_writes": [], "inventory_ops": [], **npc_response}

    def factory(*, temperature: float = 0.7, streaming: bool = False) -> _StubChat:
        _ = streaming
        if temperature >= 0.75:
            return _StubChat("submit_response", npc_full)
        return _StubChat("submit_dispatch", director_dispatch)

    return factory


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

    director_inputs = session.trajectory.list(turn_id=result.turn_id, actor_id="director", event_type="llm_input")
    npc_inputs = session.trajectory.list(turn_id=result.turn_id, actor_id="baizhantang", event_type="llm_input")
    assert len(director_inputs) == 1
    assert len(npc_inputs) == 1
    assert director_inputs[0].messages
    assert director_inputs[0].messages[0]["role"] == "system"
    assert npc_inputs[0].messages
    assert npc_inputs[0].messages[0]["role"] == "system"
    director_seq = [e.seq for e in session.trajectory.list(turn_id=result.turn_id, actor_id="director")]
    assert director_seq[0] == director_inputs[0].seq

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


@pytest.mark.asyncio
async def test_chat_model_factory_injection_without_monkeypatch(async_db_session: AsyncSession) -> None:
    """G2/G3/G5：经 open_*/step 注入 factory，不依赖 monkeypatch get_chat_model。"""
    factory = _teacher_factory_for(
        director_dispatch={
            "world_writes": [],
            "perceivers": [{"actor_id": "baizhantang", "perception_reason": "教师采集"}],
        },
        npc_response={"speak": "教师台词", "memory_writes": [{"content": "teacher-mem"}]},
    )
    session = await open_default_world(
        async_db_session,
        seed_id="teacher-inject",
        chat_model_factory=factory,
    )
    assert session.controller is session._controller
    assert session.chat_model_factory is factory

    result = await session.step({"actor_id": "player", "target_id": "baizhantang", "speak": "喂"})
    assert any(e.actor_id == "baizhantang" and e.speak == "教师台词" for e in result.timeline_delta)
    assert session.snapshot.minds["baizhantang"].memories[-1]["content"] == "teacher-mem"

    child = session.fork(1)[0]
    assert child.chat_model_factory is factory
    result2 = await child.step({"actor_id": "player", "target_id": "baizhantang", "speak": "再喂"})
    assert any(e.speak == "教师台词" for e in result2.timeline_delta)


class _QueueChat:
    def __init__(self, responses: list[AIMessage]) -> None:
        self._responses = responses

    def bind_tools(self, _tools: object, **_kwargs: object) -> _QueueChat:
        return self

    async def ainvoke(self, _messages: list[Any]) -> AIMessage:
        return self._responses.pop(0)


@pytest.mark.asyncio
async def test_llm_input_once_across_reject_retry(async_db_session: AsyncSession) -> None:
    """打回重试再调 LLM 时，同一 actor 仍只有一条 llm_input。"""
    dispatch = {
        "world_writes": [],
        "perceivers": [{"actor_id": "baizhantang", "perception_reason": "被点名"}],
    }
    director = _QueueChat(
        [
            AIMessage(content="先不交"),
            AIMessage(
                content="",
                tool_calls=[{"name": "submit_dispatch", "args": dispatch, "id": "d1"}],
            ),
        ]
    )
    npc = _StubChat(
        "submit_response",
        {"speak": "在。", "act_patch": [], "memory_writes": [], "inventory_ops": []},
    )

    def factory(*, temperature: float = 0.7, streaming: bool = False) -> _QueueChat | _StubChat:
        _ = streaming
        if temperature >= 0.75:
            return npc
        return director

    session = await open_default_world(async_db_session, seed_id="llm-input-once", chat_model_factory=factory)
    result = await session.step({"actor_id": "player", "speak": "老白"})

    director_events = session.trajectory.list(turn_id=result.turn_id, actor_id="director")
    assert [e.event_type for e in director_events] == [
        "llm_input",
        "llm_output",
        "reject",
        "llm_output",
        "tool_observation",
    ]
    assert director_events[0].messages
    assert director_events[0].messages[0]["role"] == "system"
    assert director_events[-1].status == "success"


@pytest.mark.asyncio
async def test_tool_observation_records_error_status(async_db_session: AsyncSession) -> None:
    """未知工具名由 ToolNode 回 status=error；随后合法 submit 为 success。"""
    dispatch = {
        "world_writes": [],
        "perceivers": [{"actor_id": "baizhantang", "perception_reason": "被点名"}],
    }
    director = _QueueChat(
        [
            AIMessage(
                content="",
                tool_calls=[{"name": "not_a_tool", "args": {}, "id": "bad"}],
            ),
            AIMessage(
                content="",
                tool_calls=[{"name": "submit_dispatch", "args": dispatch, "id": "ok"}],
            ),
        ]
    )
    npc = _StubChat(
        "submit_response",
        {"speak": "在。", "act_patch": [], "memory_writes": [], "inventory_ops": []},
    )

    def factory(*, temperature: float = 0.7, streaming: bool = False) -> _QueueChat | _StubChat:
        _ = streaming
        if temperature >= 0.75:
            return npc
        return director

    session = await open_default_world(async_db_session, seed_id="tool-status", chat_model_factory=factory)
    result = await session.step({"actor_id": "player", "speak": "老白"})
    observations = session.trajectory.list(turn_id=result.turn_id, actor_id="director", event_type="tool_observation")
    assert [e.tool_name for e in observations] == ["not_a_tool", "submit_dispatch"]
    assert [e.status for e in observations] == ["error", "success"]
