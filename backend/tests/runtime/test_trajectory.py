"""包 B：轨迹旁路 Recorder / Query / 热路径无 recorder 行为不变。"""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest
from langchain_core.messages import AIMessage
from sqlalchemy.ext.asyncio import AsyncSession

import app.graph.nodes.director as director_node
import app.graph.nodes.npc as npc_node
from app.graph import run_game
from app.models import User
from app.runtime.trajectory import (
    TrajectoryQuery,
    TrajectoryRecorder,
    load_events_jsonl,
)
from app.schemas import GameActionRequest
from app.services import WorldController, ensure_conversation_world


class _StubBoundLLM:
    def __init__(self, tool_name: str, tool_args: dict[str, Any]) -> None:
        self.tool_name = tool_name
        self.tool_args = tool_args

    async def ainvoke(self, _messages: list[Any]) -> AIMessage:
        return AIMessage(
            content="",
            tool_calls=[{"name": self.tool_name, "args": self.tool_args, "id": "tc-traj"}],
        )


class _StubChat:
    def __init__(self, tool_name: str, tool_args: dict[str, Any]) -> None:
        self.tool_name = tool_name
        self.tool_args = tool_args

    def bind_tools(self, _tools: object, **_kwargs: object) -> _StubBoundLLM:
        return _StubBoundLLM(self.tool_name, self.tool_args)


def _install_llm_stubs(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        director_node,
        "get_chat_model",
        lambda **_: _StubChat(
            "submit_dispatch",
            {
                "world_writes": [],
                "perceivers": [{"actor_id": "baizhantang", "perception_reason": "被点名"}],
            },
        ),
    )
    monkeypatch.setattr(
        npc_node,
        "get_chat_model",
        lambda **_: _StubChat(
            "submit_response",
            {"speak": "好的。", "act_patch": [], "memory_writes": [], "inventory_ops": []},
        ),
    )


def _make_recorder() -> TrajectoryRecorder:
    return TrajectoryRecorder(
        contract_fingerprint="fp-test",
        seed_id="seed-a",
        run_id="run-1",
        turn_id="turn-1",
    )


def test_record_four_event_types_and_list_filters() -> None:
    rec = _make_recorder()
    rec.record_llm_output(
        actor_type="director",
        actor_id="director",
        content="thinking",
        tool_calls=[{"name": "submit_dispatch", "args": {}, "id": "c1"}],
    )
    rec.record_tool_observation(
        actor_type="director",
        actor_id="director",
        tool_name="submit_dispatch",
        tool_call_id="c1",
        observation="已提交导演决策。",
    )
    rec.record_reject(actor_type="npc", actor_id="baizhantang", reason="必须调用 submit_response")
    rec.record_turn_committed(
        timeline_delta=[{"kind": "speak", "actor_id": "player", "speak": "hi", "act_patch_count": 0}],
        state_version=2,
    )

    assert [e.event_type for e in rec.list()] == [
        "llm_output",
        "tool_observation",
        "reject",
        "turn_committed",
    ]
    assert [e.seq for e in rec.list()] == [1, 2, 3, 4]

    assert len(rec.list(actor_id="director")) == 2
    assert len(rec.list(actor_id="baizhantang")) == 1
    assert len(rec.list(turn_id="turn-1")) == 4
    assert len(rec.list(seed_id="seed-a", run_id="run-1", turn_id="turn-1", actor_id="director")) == 2
    assert rec.list(seed_id="other") == []

    q = TrajectoryQuery(rec)
    assert len(q.list(actor_id="director")) == 2


def test_flush_jsonl_and_read_back(tmp_path: Path) -> None:
    path = tmp_path / "traj.jsonl"
    rec = TrajectoryRecorder(
        contract_fingerprint="fp-test",
        seed_id="seed-a",
        run_id="run-1",
        turn_id="turn-1",
        sink_path=path,
    )
    rec.record_llm_output(actor_type="director", actor_id="director", content="a", tool_calls=[])
    rec.record_tool_observation(
        actor_type="npc",
        actor_id="baizhantang",
        tool_name="query_entity",
        tool_call_id="t1",
        observation="{}",
    )
    assert rec.flush() == path
    assert rec.flush() == path  # 已落盘的不再重复写
    assert len(path.read_text(encoding="utf-8").strip().splitlines()) == 2

    loaded = load_events_jsonl(path)
    assert len(loaded) == 2
    assert loaded[0].event_type == "llm_output"
    assert loaded[1].event_type == "tool_observation"
    assert loaded[1].actor_id == "baizhantang"

    q = TrajectoryQuery(path)
    assert len(q.list(run_id="run-1")) == 2
    assert len(q.list(actor_id="baizhantang")) == 1


@pytest.mark.asyncio
async def test_run_game_without_recorder_unchanged(
    async_db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    """HTTP 热路径不注入 recorder 时，行为与既有 stub 回合一致。"""
    _install_llm_stubs(monkeypatch)
    user = User(email="traj-hot@example.com", username="trajhot", password_hash="hash")
    async_db_session.add(user)
    await async_db_session.commit()
    await async_db_session.refresh(user)

    conversation, world_state = await ensure_conversation_world(async_db_session, user, conversation_id=None)
    assert conversation is not None
    controller = WorldController(db=async_db_session, conversation=conversation, world_state=world_state)
    await controller.commit(expected_state_version=1)

    response = await run_game(
        controller,
        GameActionRequest(
            actor_id="player",
            target_id="baizhantang",
            speak="老白！",
            state_version=1,
        ),
    )

    assert response.state_version == 2
    speaks = [e for e in response.timeline_delta if e.speak]
    assert any(e.actor_id == "player" and e.speak == "老白！" for e in speaks)
    assert any(e.actor_id == "baizhantang" and e.speak == "好的。" for e in speaks)
