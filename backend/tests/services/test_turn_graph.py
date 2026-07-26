"""TurnGraph 端到端：mock langchain ChatOpenAI 的 bind_tools + ainvoke。"""

from __future__ import annotations

import uuid
from typing import Any

import pytest
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
from langgraph.errors import GraphRecursionError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import app.graph.nodes.director as director_node
import app.graph.nodes.npc as npc_node
from app.graph import run_chat, run_game
from app.models import Timeline, User
from app.schemas import ChatTurnRequest, Direction, GameActionRequest, Position, WorldEntityPatch
from app.services import WorldController, ensure_conversation_world


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

    def bind_tools(self, _tools: object, **_kwargs: object) -> _StubBoundLLM:
        return _StubBoundLLM(self.tool_name, self.tool_args)


def _patch_director_dispatch(monkeypatch: pytest.MonkeyPatch, dispatch: dict[str, Any]) -> None:
    monkeypatch.setattr(
        director_node,
        "get_chat_model",
        lambda **_: _StubChat("submit_dispatch", dispatch),
    )


class _SequencedBoundLLM:
    """按序返回预设 AIMessage；跨多次 bind_tools 调用共享游标与调用记录。"""

    def __init__(self, responses: list[AIMessage], calls: list[list[Any]]) -> None:
        self._responses = responses
        self._calls = calls

    async def ainvoke(self, messages: list[Any]) -> AIMessage:
        self._calls.append(list(messages))
        idx = len(self._calls) - 1
        return self._responses[min(idx, len(self._responses) - 1)]


class _SequencedChat:
    """伪 ChatOpenAI：每次 bind_tools 新建 bound LLM，但共享 responses/calls。"""

    def __init__(self, responses: list[AIMessage], calls: list[list[Any]]) -> None:
        self._responses = responses
        self._calls = calls

    def bind_tools(self, _tools: object, **_kwargs: object) -> _SequencedBoundLLM:
        return _SequencedBoundLLM(self._responses, self._calls)


def _patch_director_sequence(monkeypatch: pytest.MonkeyPatch, responses: list[AIMessage]) -> list[list[Any]]:
    """把 director 的 get_chat_model 换成按序返回 responses 的桩。

    返回 calls 列表：每次 ainvoke 记一条（其内容是该次调用时的 messages 快照）。
    director_step 每次必调 ainvoke 恰一次，故 len(calls) == director_step 调用次数。
    """
    calls: list[list[Any]] = []
    monkeypatch.setattr(
        director_node,
        "get_chat_model",
        lambda **_: _SequencedChat(responses, calls),
    )
    return calls


def _patch_npc_response(monkeypatch: pytest.MonkeyPatch, response: dict[str, Any]) -> None:
    full = {"act_patch": [], "memory_writes": [], "inventory_ops": [], **response}
    monkeypatch.setattr(
        npc_node,
        "get_chat_model",
        lambda **_: _StubChat("submit_response", full),
    )


def _patch_npc_sequence(monkeypatch: pytest.MonkeyPatch, responses: list[AIMessage]) -> list[list[Any]]:
    """把 npc 的 get_chat_model 换成按序返回 responses 的桩（复用 _SequencedChat）。

    返回 calls 列表：每次 npc LLM ainvoke 记一条（其内容是该次调用时的 messages 快照）。
    """
    calls: list[list[Any]] = []
    monkeypatch.setattr(
        npc_node,
        "get_chat_model",
        lambda **_: _SequencedChat(responses, calls),
    )
    return calls


async def _make_user(db: AsyncSession, email: str) -> User:
    user = User(email=email, username=email.split("@")[0], password_hash="hash")
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def _make_controller(
    db: AsyncSession,
    user: User,
    conversation_id: int | None = None,
    title: str | None = None,
    *,
    expected_state_version: int | None = 1,
) -> WorldController:
    """构造 WorldController；默认先走乐观锁入口（与 HTTP 层一致）。

    ``expected_state_version=None`` 时跳过 ``commit``，仅用于只读上下文加载。
    """
    conversation, world_state = await ensure_conversation_world(db, user, conversation_id, title=title)
    assert conversation is not None
    controller = WorldController(db=db, conversation=conversation, world_state=world_state)
    if expected_state_version is not None:
        await controller.commit(expected_state_version=expected_state_version)
    return controller


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

    response = await run_game(
        await _make_controller(async_db_session, user),
        GameActionRequest(
            actor_id="player",
            target_id="baizhantang",
            speak="老白！",
            state_version=1,
        ),
    )

    # 时间线增量含玩家 speak + NPC speak；落库后必须带回持久化 id
    assert response.timeline_delta
    assert all(isinstance(e.id, int) for e in response.timeline_delta)
    speaks = [e for e in response.timeline_delta if e.kind == "speak"]
    assert any(e.actor_id == "player" and e.speak == "老白！" for e in speaks)
    assert any(e.actor_id == "baizhantang" and e.speak == "客官请讲。" for e in speaks)


@pytest.mark.asyncio
async def test_game_move_via_unified_graph(async_db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch) -> None:
    user = await _make_user(async_db_session, "g2@example.com")
    # Director 给出 move patch、无 perceivers
    _patch_director_dispatch(
        monkeypatch,
        {
            "world_writes": [{"entity_id": "player", "position": {"x": 6, "y": 7}, "direction": "south"}],
            "perceivers": [],
        },
    )

    response = await run_game(
        await _make_controller(async_db_session, user),
        GameActionRequest(
            actor_id="player",
            state_version=1,
            act_patch=[WorldEntityPatch(entity_id="player", position=Position(x=6, y=7), direction=Direction.SOUTH)],
        ),
    )
    assert response.world_state.entities["player"].position.x == 6
    assert response.world_state.entities["player"].direction == "south"


@pytest.mark.asyncio
async def test_chat_turn_skips_director(async_db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch) -> None:
    """chat 路径不应进 director——通过把 director.get_chat_model patch 成 raise 验证。"""
    user = await _make_user(async_db_session, "c1@example.com")

    def _explode(**_: object) -> None:
        raise AssertionError("chat 模式不应触达 director")

    monkeypatch.setattr(director_node, "get_chat_model", _explode)
    _patch_npc_response(monkeypatch, {"speak": "佟掌柜在算账。"})

    controller = await _make_controller(async_db_session, user, title="chat 路径")

    response = await run_chat(
        controller,
        controller.conversation_id,
        ChatTurnRequest(
            target_actor_id="tongxiangyu",
            content="掌柜的，结账。",
            state_version=1,
        ),
    )
    speaks = [e for e in response.timeline_delta if e.kind == "speak"]
    assert any(e.actor_id == "tongxiangyu" and e.speak == "佟掌柜在算账。" for e in speaks)
    # 玩家这一条 actor_id 等于 player
    assert any(e.actor_id == "player" and e.speak == "掌柜的，结账。" for e in speaks)


@pytest.mark.asyncio
async def test_actor_mind_isolation(async_db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch) -> None:
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
        GameActionRequest(target_id="baizhantang", speak="嗨", state_version=1),
    )

    # 渲染 guofurong 的 prompt
    from app.graph.prompt_render import render_npc_messages
    from app.services import actor_mind_service

    controller = await _make_controller(async_db_session, user, expected_state_version=None)
    ctx = await controller.load_turn_context()
    entity = controller.world_state.entities["guofurong"]
    mind = await actor_mind_service.load_for_prompt(async_db_session, controller.conversation_id, "guofurong")
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

    response = await run_game(
        await _make_controller(async_db_session, user),
        GameActionRequest(
            actor_id="player",
            target_id="baizhantang",
            speak="…",
            state_version=1,
        ),
    )
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
            "world_writes": [{"entity_id": "player", "public_state": {"mood": "calm"}}],
            "perceivers": [
                {"actor_id": "baizhantang", "perception_reason": "被直接称呼"},
                {"actor_id": "guofurong", "perception_reason": "在 2 格内目击"},
            ],
        },
    )
    _patch_npc_response(monkeypatch, {"speak": "嗯。"})

    await run_game(
        await _make_controller(async_db_session, user),
        GameActionRequest(target_id="baizhantang", speak="大家好", state_version=1),
    )

    rows = (
        (
            await async_db_session.execute(
                select(Timeline).order_by(Timeline.intra_turn_seq).where(Timeline.kind != "scene")  # 排除开场旁白
            )
        )
        .scalars()
        .all()
    )
    # 同一 turn 内顺序：player=0, director_write=1, npc1=2, npc2=3
    same_turn = [r for r in rows if r.turn_id == rows[-1].turn_id]
    seqs = [r.intra_turn_seq for r in same_turn]
    assert seqs == sorted(seqs)
    assert same_turn[0].actor_id == "player"


@pytest.mark.asyncio
async def test_director_retry_on_missing_tool_call(
    async_db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    """无 tool_call 违规 → 打回 director_step 重试，第 2 次合法 submit 正常收尾。"""
    user = await _make_user(async_db_session, "retry@example.com")
    calls = _patch_director_sequence(
        monkeypatch,
        [
            AIMessage(content="我想想…", tool_calls=[]),  # 第 1 次：违规，无 tool_call
            AIMessage(
                content="",
                tool_calls=[
                    {
                        "name": "submit_dispatch",
                        "args": {
                            "world_writes": [{"entity_id": "player", "direction": "north"}],
                            "perceivers": [],
                        },
                        "id": uuid.uuid4().hex,
                    }
                ],
            ),
        ],
    )

    response = await run_game(
        await _make_controller(async_db_session, user),
        GameActionRequest(actor_id="player", target_id="baizhantang", speak="老白", state_version=1),
    )

    # director_step 被调 2 次（每次恰一次 ainvoke）
    assert len(calls) == 2
    # 第 2 次调用前 messages 含反馈消息
    assert any(isinstance(m, HumanMessage) and "submit_dispatch" in str(m.content) for m in calls[1])
    # 最终 commit 出的是第 2 次的 dispatch（direction 只可能来自 director world_writes）
    assert response.world_state.entities["player"].direction == "north"


@pytest.mark.asyncio
async def test_director_query_then_submit(async_db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch) -> None:
    """护栏：query_entity → 结果回灌 → submit，那条回边行为不变。"""
    user = await _make_user(async_db_session, "query@example.com")
    calls = _patch_director_sequence(
        monkeypatch,
        [
            AIMessage(
                content="",
                tool_calls=[
                    {
                        "name": "query_entity",
                        "args": {"actor_id": "baizhantang"},
                        "id": uuid.uuid4().hex,
                    }
                ],
            ),
            AIMessage(
                content="",
                tool_calls=[
                    {
                        "name": "submit_dispatch",
                        "args": {
                            "world_writes": [{"entity_id": "player", "direction": "south"}],
                            "perceivers": [],
                        },
                        "id": uuid.uuid4().hex,
                    }
                ],
            ),
        ],
    )

    response = await run_game(
        await _make_controller(async_db_session, user),
        GameActionRequest(actor_id="player", target_id="baizhantang", speak="附近有谁", state_version=1),
    )

    assert len(calls) == 2
    # 第 2 次调用前 messages 含 query_entity 的执行结果（证明 query 被执行并回灌）
    assert any(isinstance(m, ToolMessage) and m.name == "query_entity" for m in calls[1])
    assert response.world_state.entities["player"].direction == "south"


@pytest.mark.asyncio
async def test_director_illegal_args_never_commit(
    async_db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    """护栏：非法 args 的 submit 永不放行——循环到 recursion_limit 抛 GraphRecursionError，绝不 commit。"""
    user = await _make_user(async_db_session, "illegal@example.com")
    # 恒返回同一非法 submit（bogus_field 触发 WorldEntityPatch 的 extra="forbid"）
    _patch_director_dispatch(
        monkeypatch,
        {
            "world_writes": [{"entity_id": "player", "bogus_field": 1}],
            "perceivers": [],
        },
    )

    with pytest.raises(GraphRecursionError):
        await run_game(
            await _make_controller(async_db_session, user),
            GameActionRequest(actor_id="player", target_id="baizhantang", speak="x", state_version=1),
        )


@pytest.mark.asyncio
async def test_npc_retry_on_missing_tool_call(async_db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch) -> None:
    """NPC 无 tool_call 违规 → 打回 npc_step 重试（与 director 同构），第 2 次合法 submit 正常收尾。"""
    user = await _make_user(async_db_session, "npcretry@example.com")
    _patch_director_dispatch(
        monkeypatch,
        {
            "world_writes": [],
            "perceivers": [{"actor_id": "baizhantang", "perception_reason": "被直接称呼"}],
        },
    )
    calls = _patch_npc_sequence(
        monkeypatch,
        [
            AIMessage(content="（沉默地擦着柜台，没有开口）", tool_calls=[]),  # 第 1 次：违规，无 tool_call
            AIMessage(
                content="",
                tool_calls=[
                    {
                        "name": "submit_response",
                        "args": {
                            "speak": "客官请讲。",
                            "act_patch": [],
                            "memory_writes": [],
                            "inventory_ops": [],
                        },
                        "id": uuid.uuid4().hex,
                    }
                ],
            ),
        ],
    )

    response = await run_game(
        await _make_controller(async_db_session, user),
        GameActionRequest(
            actor_id="player",
            target_id="baizhantang",
            speak="老白？",
            state_version=1,
        ),
    )

    # npc_step 被调 2 次（第 1 次违规打回，第 2 次合法 submit）
    assert len(calls) == 2
    # 第 2 次调用前 messages 含反馈消息
    assert any(isinstance(m, HumanMessage) and "submit_response" in str(m.content) for m in calls[1])
    # 最终该 NPC 正常产出 speak 条目
    assert any(
        e.actor_id == "baizhantang" and e.speak == "客官请讲。" for e in response.timeline_delta if e.kind == "speak"
    )
