"""真实图/工具：导演写入先于 NPC 查询，统一到最终提交。"""

from __future__ import annotations

import json
from typing import Any

import pytest
from langchain_core.messages import AIMessage, ToolMessage
from sqlalchemy.ext.asyncio import AsyncSession

from app.graph.turn_graph import TURN_GRAPH
from app.models import User
from app.runtime import open_default_world
from app.schemas import GameActionRequest, Position, TurnMode, WorldState
from app.services import WorldController, ensure_conversation_world


def _tool_payload(message: ToolMessage) -> Any:
    assert isinstance(message.content, str)
    return json.loads(message.content)


class _Director:
    def bind_tools(self, _tools: object, **_kwargs: object) -> _Director:
        return self

    async def ainvoke(self, messages: list[Any]) -> AIMessage:
        if not isinstance(messages[-1], ToolMessage):
            return AIMessage(
                content="", tool_calls=[{"name": "query_entity", "args": {"actor_id": "door"}, "id": "before"}]
            )
        assert _tool_payload(messages[-1])["public_state"]["open"] is False
        return AIMessage(
            content="",
            tool_calls=[
                {
                    "name": "submit_dispatch",
                    "id": "dispatch",
                    "args": {
                        "world_writes": [
                            {"entity_id": "door", "public_state": {"open": True}, "position": {"x": 0, "y": 0}}
                        ],
                        "narration": "门打开了",
                        "perceivers": [
                            {"actor_id": actor, "perception_reason": "目击门打开"}
                            for actor in ("baizhantang", "guofurong")
                        ],
                    },
                }
            ],
        )


class _Npc:
    def __init__(self, close_door: bool) -> None:
        self.close_door = close_door
        self.observations: list[bool] = []

    def bind_tools(self, _tools: object, **_kwargs: object) -> _Npc:
        return self

    async def ainvoke(self, messages: list[Any]) -> AIMessage:
        if not isinstance(messages[-1], ToolMessage):
            assert any(m.content == "【门打开了】" for m in messages)
            return AIMessage(
                content="",
                tool_calls=[
                    {"name": "query_entity", "args": {"actor_id": "door"}, "id": "door-query"},
                    {"name": "query_neighbors", "args": {"actor_id": "door", "radius": 0}, "id": "neighbors"},
                ],
            )
        entity = next(m for m in messages if isinstance(m, ToolMessage) and m.tool_call_id == "door-query")
        observed = _tool_payload(entity)
        self.observations.append(observed["public_state"]["open"])
        assert observed["position"] == {"x": 0, "y": 0}
        neighbors = _tool_payload(messages[-1])
        assert "counter" in neighbors  # counter 位于新位置，不在门的旧位置。
        return AIMessage(
            content="",
            tool_calls=[
                {
                    "name": "submit_response",
                    "id": "response",
                    "args": {
                        "speak": "门打开了" if observed["public_state"]["open"] else "门仍关着",
                        "act_patch": [{"entity_id": "door", "public_state": {"open": False}}]
                        if self.close_door
                        else [],
                        "narration": "把门关上了" if self.close_door else None,
                        "memory_writes": [],
                        "inventory_ops": [],
                    },
                }
            ],
        )


@pytest.mark.asyncio
@pytest.mark.parametrize("production", [False, True], ids=["headless", "production"])
@pytest.mark.parametrize("close_door", [False, True], ids=["stays-open", "npc-closes"])
async def test_director_writes_visible_before_npc_commit(
    async_db_session: AsyncSession,
    production: bool,
    close_door: bool,
) -> None:
    director, npc = _Director(), _Npc(close_door)

    def factory(*, temperature: float, streaming: bool = False) -> Any:
        return npc if temperature >= 0.75 else director

    session = await open_default_world(async_db_session, chat_model_factory=factory)
    world = session.snapshot.world
    world.entities["door"] = world.entities["table"].model_copy(
        update={
            "id": "door",
            "name": "门",
            "public_state": {"open": False},
            "position": Position(x=20, y=20),
        }
    )
    world.entities["counter"] = world.entities["counter"].model_copy(update={"position": Position(x=0, y=0)})
    action = GameActionRequest(actor_id="player", speak="推门", state_version=1)
    conversation = None
    if production:
        user = User(email="visibility@example.com", username="visibility", password_hash="hash")
        async_db_session.add(user)
        await async_db_session.commit()
        conversation, _ = await ensure_conversation_world(async_db_session, user, None)
        assert conversation is not None
        conversation.world_state_json = world.model_dump(mode="json")
        await async_db_session.commit()
        controller = WorldController(async_db_session, conversation, world)
        await controller.commit(expected_state_version=1)
        state = await TURN_GRAPH.ainvoke(
            {},
            config={
                "configurable": {
                    "mode": TurnMode.GAME,
                    "game_request": action,
                    "controller": controller,
                    "chat_model_factory": factory,
                }
            },
        )
        result = state["committed_turn"]
        final_world = result.world_state
        await async_db_session.refresh(conversation)
        assert WorldState.model_validate(conversation.world_state_json) == final_world
    else:
        result = await session.step(action)
        final_world = result.world
        observations = session.trajectory.list(event_type="tool_observation")
        door_queries = [e for e in observations if e.tool_name == "query_entity"]
        assert len(door_queries) == 3
        assert all(e.status == "success" for e in door_queries)

    assert npc.observations == [True, True]
    assert final_world.entities["door"].public_state["open"] is (not close_door)
    assert final_world.state_version == 2
    scenes = [e for e in result.timeline_delta if e.actor_id is None]
    assert len(scenes) == 1
    assert scenes[0].narration == "门打开了"
    assert [e.intra_turn_seq for e in result.timeline_delta] == [0, 1, 2, 3]
    assert all(e.speak == "门打开了" for e in result.timeline_delta[2:])


@pytest.mark.asyncio
@pytest.mark.parametrize("cancel", [False, True], ids=["error", "cancel"])
async def test_failed_npc_restores_headless_snapshot(async_db_session: AsyncSession, cancel: bool) -> None:
    import asyncio

    session = await open_default_world(async_db_session)
    snapshot = session.snapshot
    world = snapshot.world
    world.entities["door"] = world.entities["table"].model_copy(
        update={"id": "door", "public_state": {"open": False}, "position": Position(x=20, y=20)}
    )
    world.entities["counter"] = world.entities["counter"].model_copy(update={"position": Position(x=0, y=0)})
    before = snapshot.model_copy(deep=True)
    parent = session.fork(1)[0]
    entered = asyncio.Event()

    class FailingNpc:
        def bind_tools(self, _tools: object, **_kwargs: object) -> FailingNpc:
            return self

        async def ainvoke(self, messages: list[Any]) -> AIMessage:
            assert session.snapshot.world.entities["door"].public_state["open"] is True
            assert session.snapshot.world.state_version == 1
            if cancel:
                entered.set()
                await asyncio.Future()
            raise RuntimeError("NPC failure after director writes")

    director = _Director()

    def failing_factory(*, temperature: float, streaming: bool = False) -> Any:
        return FailingNpc() if temperature >= 0.75 else director

    task = asyncio.create_task(
        session.step(
            {
                "actor_id": "player",
                "speak": "推门",
                "act_patch": [{"entity_id": "player", "position": {"x": 0, "y": 0}}],
            },
            chat_model_factory=failing_factory,
        )
    )
    if cancel:
        await asyncio.wait_for(entered.wait(), timeout=5)
        task.cancel()
    with pytest.raises(asyncio.CancelledError if cancel else RuntimeError):
        await task
    assert session.snapshot is snapshot
    assert snapshot == before
    assert parent.snapshot.world == before.world
    assert session.fork(1)[0].snapshot.world == before.world
    assert not session.trajectory.list(event_type="turn_committed")

    npc = _Npc(False)

    def recovery_factory(*, temperature: float, streaming: bool = False) -> Any:
        return npc if temperature >= 0.75 else director

    result = await session.step({"actor_id": "player", "speak": "重试"}, chat_model_factory=recovery_factory)
    assert npc.observations == [True, True]
    assert result.world.state_version == 2
    assert len(session.trajectory.list(event_type="turn_committed")) == 1
    assert len(result.timeline_delta) == 4


@pytest.mark.asyncio
async def test_failed_npc_does_not_persist_production_writes(async_db_session: AsyncSession) -> None:
    from app.services import timeline_service

    user = User(email="failed-visibility@example.com", username="failed-visibility", password_hash="hash")
    async_db_session.add(user)
    await async_db_session.commit()
    conversation, world = await ensure_conversation_world(async_db_session, user, None)
    assert conversation is not None
    world.entities["door"] = world.entities["table"].model_copy(update={"id": "door", "public_state": {"open": False}})
    conversation.world_state_json = world.model_dump(mode="json")
    await async_db_session.commit()
    timeline_before = await timeline_service.list_timeline(async_db_session, conversation.id)
    controller = WorldController(async_db_session, conversation, world)
    await controller.commit(expected_state_version=1)
    director = _Director()

    class FailingNpc:
        def bind_tools(self, _tools: object, **_kwargs: object) -> FailingNpc:
            return self

        async def ainvoke(self, messages: list[Any]) -> AIMessage:
            assert controller.world_state.entities["door"].public_state["open"] is True
            assert controller.world_state.state_version == 1
            raise RuntimeError("NPC failure")

    def factory(*, temperature: float, streaming: bool = False) -> Any:
        return FailingNpc() if temperature >= 0.75 else director

    with pytest.raises(RuntimeError, match="NPC failure"):
        await TURN_GRAPH.ainvoke(
            {},
            config={
                "configurable": {
                    "controller": controller,
                    "mode": TurnMode.GAME,
                    "game_request": GameActionRequest(actor_id="player", speak="推门", state_version=1),
                    "chat_model_factory": factory,
                }
            },
        )
    await async_db_session.rollback()
    await async_db_session.refresh(conversation)
    assert WorldState.model_validate(conversation.world_state_json) == world
    assert conversation.state_version == 1
    assert await timeline_service.list_timeline(async_db_session, conversation.id) == timeline_before
    # 下一次生产请求会重新走 commit，从 DB 刷新内存快照。
    await controller.commit(expected_state_version=1)
    assert controller.world_state.entities["door"].public_state["open"] is False
