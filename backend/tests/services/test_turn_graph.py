"""TurnGraph 端到端：mock langchain ChatOpenAI 的 bind_tools + ainvoke。"""

from __future__ import annotations

import uuid
from typing import Any

import pytest
from langchain_core.messages import AIMessage
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import app.graph.nodes.director as director_node
import app.graph.nodes.npc_subgraph as npc_node
from app.schemas.turn import ChatTurnRequest, GameActionRequest
from app.schemas.world import Position, WorldEntityPatch
from app.models import Timeline, User
from app.services.world_service import WorldController, ensure_conversation_world
from app.graph.turn_graph import run_game, run_chat


class _StubBoundLLM:
    """伪 bind_tools 返回值：ainvoke 直接产出 1 个 tool_call。"""

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
    """伪 ChatOpenAI：bind_tools 返回 _StubBoundLLM。"""

    def __init__(self, tool_name: str, tool_args: dict[str, Any]) -> None:
        self.tool_name = tool_name
        self.tool_args = tool_args

    def bind_tools(self, _tools):
        return _StubBoundLLM(self.tool_name, self.tool_args)


def _patch_director_dispatch(monkeypatch: pytest.MonkeyPatch, dispatch: dict) -> None:
    monkeypatch.setattr(
        director_node, "get_chat_model",
        lambda **_: _StubChat("submit_dispatch", dispatch),
    )


def _patch_npc_response(monkeypatch: pytest.MonkeyPatch, response: dict) -> None:
    monkeypatch.setattr(
        npc_node, "get_chat_model",
        lambda **_: _StubChat("submit_response", response),
    )


async def _make_user(db: AsyncSession, email: str) -> User:
    user = User(email=email, username=email.split("@")[0], password_hash="hash")
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def _make_controller(
    db: AsyncSession, user: User, conversation_id: int | None = None, title: str | None = None,
) -> WorldController:
    conversation, world_state = await ensure_conversation_world(
        db, user, conversation_id, title=title
    )
    return WorldController(db=db, conversation=conversation, world_state=world_state)


@pytest.mark.asyncio
async def test_game_say_triggers_director_then_npc(
    async_db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    user = await _make_user(async_db_session, "g1@example.com")
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

    response = await run_game(await _make_controller(async_db_session, user), GameActionRequest(
            actorId="player",
            targetId="baizhantang",
            speak="老白！",
            stateVersion=1,
        ))

    # 时间线增量含玩家 speak + NPC speak
    speaks = [e for e in response.timeline_delta if e.kind == "speak"]
    assert any(e.actor_id == "player" and e.speak == "老白！" for e in speaks)
    assert any(e.actor_id == "baizhantang" and e.speak == "客官请讲。" for e in speaks)


@pytest.mark.asyncio
async def test_game_move_via_unified_graph(
    async_db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    user = await _make_user(async_db_session, "g2@example.com")
    # Director 给出 move patch、无 perceivers
    _patch_director_dispatch(
        monkeypatch,
        {
            "world_writes": [
                {"entity_id": "player", "position": {"x": 6, "y": 7}, "direction": "south"}
            ],
            "perceivers": [],
        },
    )

    response = await run_game(await _make_controller(async_db_session, user), GameActionRequest(
            actorId="player",
            stateVersion=1,
            act_patch=[WorldEntityPatch(entity_id="player", position=Position(x=6, y=7), direction="south")])
    )
    assert response.world_state.entities["player"].position.x == 6
    assert response.world_state.entities["player"].direction == "south"


@pytest.mark.asyncio
async def test_chat_turn_skips_director(
    async_db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    """chat 路径不应进 director——通过把 director.get_chat_model patch 成 raise 验证。"""
    user = await _make_user(async_db_session, "c1@example.com")

    def _explode(**_: object):
        raise AssertionError("chat 模式不应触达 director")

    monkeypatch.setattr(director_node, "get_chat_model", _explode)
    _patch_npc_response(monkeypatch, {"speak": "佟掌柜在算账。"})

    controller = await _make_controller(async_db_session, user, title="chat 路径")

    response = await run_chat(controller, controller.conversation_id, ChatTurnRequest(
            targetActorId="tongxiangyu",
            content="掌柜的，结账。",
        ))
    speaks = [e for e in response.timeline_delta if e.kind == "speak"]
    assert any(e.actor_id == "tongxiangyu" and e.speak == "佟掌柜在算账。" for e in speaks)
    # 玩家这一条 actor_id 等于 player
    assert any(e.actor_id == "player" and e.speak == "掌柜的，结账。" for e in speaks)


@pytest.mark.asyncio
async def test_actor_mind_isolation(
    async_db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    """两轮分别给 A / B 写不同 memory，render NPC B 的 prompt 不应含 A 的记忆。"""
    user = await _make_user(async_db_session, "iso@example.com")
    # 第一轮：让 baizhantang 写一条记忆"密令X"
    _patch_director_dispatch(
        monkeypatch,
        {
            "world_writes": [],
            "perceivers": [{"actor_id": "baizhantang", "perception_reason": "被直接称呼"}],
        },
    )
    _patch_npc_response(monkeypatch, {"memory_writes": [{"content": "密令X"}]})
    await run_game(
        await _make_controller(async_db_session, user),
        GameActionRequest(targetId="baizhantang", speak="嗨", stateVersion=1),
    )

    # 渲染 guofurong 的 prompt
    from app.graph.prompt_render import render_npc_messages
    from app.services import actor_mind_service

    controller = await _make_controller(async_db_session, user)
    ctx = await controller.load_turn_context()
    entity = controller.world_state.entities["guofurong"]
    mind = await actor_mind_service.load_for_prompt(
        async_db_session, controller.conversation_id, "guofurong"
    )
    msgs = render_npc_messages(ctx, entity, mind, "测试", {})
    body = "\n".join(str(m.content) for m in msgs)
    assert "密令X" not in body


@pytest.mark.asyncio
async def test_npc_silence_creates_no_timeline_entry(
    async_db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    user = await _make_user(async_db_session, "silent@example.com")
    _patch_director_dispatch(
        monkeypatch,
        {
            "world_writes": [],
            "perceivers": [{"actor_id": "baizhantang", "perception_reason": "被直接称呼"}],
        },
    )
    _patch_npc_response(monkeypatch, {})  # 全空 = 沉默

    response = await run_game(await _make_controller(async_db_session, user), GameActionRequest(
            actorId="player",
            targetId="baizhantang",
            speak="…",
            stateVersion=1,
        ))
    npc_entries = [e for e in response.timeline_delta if e.actor_id == "baizhantang"]
    assert npc_entries == []


@pytest.mark.asyncio
async def test_timeline_intra_turn_seq_monotonic(
    async_db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    user = await _make_user(async_db_session, "ord@example.com")
    _patch_director_dispatch(
        monkeypatch,
        {
            "world_writes": [
                {"entity_id": "player", "public_state": {"mood": "calm"}}
            ],
            "perceivers": [
                {"actor_id": "baizhantang", "perception_reason": "被直接称呼"},
                {"actor_id": "guofurong", "perception_reason": "在 2 格内目击"},
            ],
        },
    )
    _patch_npc_response(monkeypatch, {"speak": "嗯。"})

    await run_game(await _make_controller(async_db_session, user), GameActionRequest(targetId="baizhantang", speak="大家好", stateVersion=1))

    rows = (
        await async_db_session.execute(
            select(Timeline)
            .order_by(Timeline.intra_turn_seq)
            .where(Timeline.kind != "scene")  # 排除开场旁白
        )
    ).scalars().all()
    # 同一 turn 内顺序：player=0, director_write=1, npc1=2, npc2=3
    same_turn = [r for r in rows if r.turn_id == rows[-1].turn_id]
    seqs = [r.intra_turn_seq for r in same_turn]
    assert seqs == sorted(seqs)
    assert same_turn[0].actor_id == "player"
