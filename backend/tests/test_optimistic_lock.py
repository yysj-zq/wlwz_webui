"""B1-2 OptimisticLock 端到端测试：state_version 乐观锁。

- test_1：版本匹配 → 通过校验。
- test_2：客户端版本低于当前 → 抛 StateVersionConflict。
- test_3：客户端版本高于当前 → 抛 StateVersionConflict。
- test_4：客户端未传 state_version → 422 校验失败。
- test_5：并发提交（竞态）→ 后到者拿到冲突异常。

测试目标：
- 不依赖外部 LLM（stub 出 director / npc 模型，或仅调用 WorldController.commit
  不真正跑图）。
- 跑 ``python3 -m pytest backend/tests/test_optimistic_lock.py -v`` 全部通过。
"""

from __future__ import annotations

import asyncio
from typing import Any

import httpx
import pytest
from langchain_core.messages import AIMessage
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.endpoints import conversation as conversation_endpoint
from app.graph.nodes import director as director_node
from app.graph.nodes import npc as npc_node
from app.models import User
from app.schemas import (
    ChatTurnRequest,
    GameActionRequest,
    Position,
    TimelineEntry,
    TimelineKind,
    WorldEntityPatch,
    WorldState,
)
from app.services import (
    StateVersionConflict,
    WorldController,
    assert_state_version_matches,
    ensure_conversation_world,
)

# ─────────────────────────────────────────────────────────────────────
# 共享 stub：避免 LLM 真实调用
# ─────────────────────────────────────────────────────────────────────


class _StubBoundLLM:
    def __init__(self, name: str, args: dict[str, Any]) -> None:
        self.name = name
        self.args = args

    async def ainvoke(self, _msgs: list[Any]) -> AIMessage:
        return AIMessage(content="", tool_calls=[{"name": self.name, "args": self.args, "id": "tc1"}])


class _StubChat:
    def __init__(self, name: str, args: dict[str, Any]) -> None:
        self.name = name
        self.args = args

    def bind_tools(self, _tools: object, **_kwargs: object) -> _StubBoundLLM:
        return _StubBoundLLM(self.name, self.args)


def _install_llm_stubs(monkeypatch: pytest.MonkeyPatch) -> None:
    """director 提交一个 perceiver，npc 提交一个空 speak。"""
    monkeypatch.setattr(
        director_node,
        "get_chat_model",
        lambda **_: _StubChat(
            "submit_dispatch",
            {"world_writes": [], "perceivers": [{"actor_id": "baizhantang", "perception_reason": "被点名"}]},
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


async def _make_user_and_controller(db: AsyncSession, email: str) -> tuple[User, WorldController, WorldState]:
    """新建 user + 新建 conversation（state_version=1），返回 (user, controller, world_state)。"""
    user = User(email=email, username=email.split("@")[0], password_hash="hash")
    db.add(user)
    await db.commit()
    await db.refresh(user)
    conversation, world_state = await ensure_conversation_world(db, user, conversation_id=None)
    assert conversation is not None
    return user, WorldController(db, conversation, world_state), world_state


# ─────────────────────────────────────────────────────────────────────
# 单元层：assert_state_version_matches
# ─────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_assert_helper_passes_when_matching() -> None:
    ws = WorldState(
        map_id="tongfu_inn",
        state_version=3,
        player_actor_id="player",
        entities={},
    )
    # 不抛即为通过
    assert_state_version_matches(ws, 3)


# ─────────────────────────────────────────────────────────────────────
# 控制器层：5 个 case
# ─────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_1_matching_version_passes(async_db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch) -> None:
    """test_1：state_version 与 DB 一致 → 校验通过且控制器 world_state 同步刷新。"""
    _install_llm_stubs(monkeypatch)
    user, controller, _ws = await _make_user_and_controller(async_db_session, "lock1@example.com")
    assert controller.world_state.state_version == 1

    # state_version=1，DB 也是 1 → 不应抛
    await controller.commit(expected_state_version=1)
    assert controller.world_state.state_version == 1

    # 跑完整 game 路径：应当落库成功，state_version 升到 2
    request = GameActionRequest(
        conversation_id=None,
        state_version=1,
        actor_id="player",
        target_id="baizhantang",
        speak="老白！",
        act_patch=[WorldEntityPatch(entity_id="player", position=Position(x=6, y=6))],
    )
    response = await conversation_endpoint.game_action_endpoint(
        conversation_id=controller.conversation_id,
        payload=request,
        db=async_db_session,
        current_user=user,
    )
    assert response.state_version == 2


@pytest.mark.asyncio
async def test_2_mismatched_version_lower_raises(
    async_db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    """test_2：客户端 version 低于当前 → 409 + 携带最新 world_state。"""
    _install_llm_stubs(monkeypatch)
    user, controller, _ws = await _make_user_and_controller(async_db_session, "lock2@example.com")

    # 第一次提交：state_version=1 通过，commit_turn 后 DB 升到 2
    request_v1 = GameActionRequest(
        conversation_id=None,
        state_version=1,
        actor_id="player",
        target_id="baizhantang",
        speak="老白！",
    )
    await conversation_endpoint.game_action_endpoint(
        conversation_id=controller.conversation_id,
        payload=request_v1,
        db=async_db_session,
        current_user=user,
    )

    # 第二次提交仍带 state_version=1，但 DB 已经是 2 → 409
    # 直接调控制器层（不走 HTTP）验证异常内容
    from app.services import WorldController as WC

    fresh_controller = WC(async_db_session, controller._conversation, controller.world_state)
    with pytest.raises(StateVersionConflict) as exc_info:
        await fresh_controller.commit(expected_state_version=1)
    assert exc_info.value.current_state_version == 2
    assert exc_info.value.current_world_state.state_version == 2


@pytest.mark.asyncio
async def test_3_mismatched_version_higher_raises(
    async_db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    """test_3：客户端 version 高于当前 → 409 + 携带最新 world_state。"""
    _install_llm_stubs(monkeypatch)
    _user, controller, _ws = await _make_user_and_controller(async_db_session, "lock3@example.com")

    # DB 当前 1，客户端发 999 → 必然冲突
    with pytest.raises(StateVersionConflict) as exc_info:
        await controller.commit(expected_state_version=999)
    assert exc_info.value.current_state_version == 1
    assert exc_info.value.current_world_state.state_version == 1
    # 异常里也带得动最新世界，可直接 dump 给客户端
    dumped = exc_info.value.current_world_state.model_dump(mode="json")
    assert dumped["state_version"] == 1
    assert "baizhantang" in dumped["entities"]


@pytest.mark.asyncio
async def test_4_missing_state_version_rejected() -> None:
    """test_4：未传 state_version → schema 校验失败。"""
    with pytest.raises(ValidationError):
        GameActionRequest.model_validate(
            {
                "conversationId": None,
                "actorId": "player",
                "targetId": "baizhantang",
                "speak": "hi",
            }
        )

    with pytest.raises(ValidationError):
        ChatTurnRequest.model_validate(
            {
                "targetActorId": "tongxiangyu",
                "content": "掌柜的",
            }
        )


@pytest.mark.asyncio
async def test_5_concurrent_commit_second_gets_conflict(
    async_db_session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    """test_5：并发提交，第二个到达的（状态已变）应拿到 StateVersionConflict。

    通过 ``asyncio.Event`` 串行化：A 先做 ``commit_turn``（落库、bump 版本），
    再放行 B 的 ``commit``——B 刷新后会看到新版本，校验失败。
    """
    _install_llm_stubs(monkeypatch)
    user, controller_a, _ws = await _make_user_and_controller(async_db_session, "lock5@example.com")

    # B 用同一段 db，但模拟"独立 session + 独立 conversation 引用"；
    # 简单起见复用 controller_a 的 conversation ORM 引用，但确保 B 拿的是刷新前的
    # 状态——通过在 commit 之前显式 await controller_a.db.refresh() 让其过期。
    conversation = controller_a._conversation

    barrier = asyncio.Event()
    winner_done = asyncio.Event()
    results: dict[str, BaseException | None] = {"a": None, "b": None}

    async def coroutine_a() -> None:
        try:
            # A：等 barrier，避免 B 先动手
            await barrier.wait()
            # A 先 commit 校验（passes，v=1）+ commit_turn（bump 到 v=2）
            await controller_a.commit(expected_state_version=1)
            request = GameActionRequest(
                conversation_id=None,
                state_version=1,
                actor_id="player",
                target_id="baizhantang",
                speak="A 先到",
            )
            await conversation_endpoint.game_action_endpoint(
                conversation_id=controller_a.conversation_id,
                payload=request,
                db=async_db_session,
                current_user=user,
            )
        except BaseException as exc:  # noqa: BLE001
            results["a"] = exc
        finally:
            winner_done.set()

    async def coroutine_b() -> None:
        try:
            await barrier.wait()
            # B 必须在 A 落库后才会去 commit：用 winner_done 同步
            await winner_done.wait()
            # B 此时刷新 DB 会看到 state_version=2
            await async_db_session.refresh(conversation)
            with pytest.raises(StateVersionConflict) as exc_info:
                await controller_a.commit(expected_state_version=1)
            # 把异常挂到 results，便于后续断言
            results["b"] = exc_info.value
        except StateVersionConflict as exc:
            results["b"] = exc
        except BaseException as exc:  # noqa: BLE001
            results["b"] = exc

    # 启动两个协程
    task_a = asyncio.create_task(coroutine_a())
    task_b = asyncio.create_task(coroutine_b())
    # 同时放行：A 抢占第一格
    barrier.set()
    await asyncio.gather(task_a, task_b)

    # A 应当无异常；B 应当拿到 StateVersionConflict，且 current_state_version=2
    assert results["a"] is None, f"A 出错: {results['a']!r}"
    assert isinstance(results["b"], StateVersionConflict)
    assert results["b"].current_state_version == 2
    assert results["b"].current_world_state.state_version == 2


# ─────────────────────────────────────────────────────────────────────
# HTTP 层：验证 409 响应体格式
# ─────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_http_actions_returns_409_with_world_state_on_conflict(
    client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """通过 HTTP 触发乐观锁冲突，验证 409 + STATE_VERSION_CONFLICT body。"""
    _install_llm_stubs(monkeypatch)

    # 注册并登录（使用 stub 后的真实流程）
    register_resp = await client.post(
        "/api/auth/register",
        json={"email": "httplock@example.com", "password": "pwd123456", "username": "httplock"},
    )
    assert register_resp.status_code == 200
    login_resp = await client.post(
        "/api/auth/login",
        json={"email": "httplock@example.com", "password": "pwd123456"},
    )
    assert login_resp.status_code == 200
    token = login_resp.json()["accessToken"]  # camelCase 序列化
    headers = {"Authorization": f"Bearer {token}"}

    # 创建会话
    sess_resp = await client.post("/api/conversations", headers=headers, json={"title": "lock test"})
    assert sess_resp.status_code == 200
    conversation_id = sess_resp.json()["id"]

    # 客户端故意传错 version（当前是 1，发 999） → 409
    action_resp = await client.post(
        f"/api/conversations/{conversation_id}/actions",
        headers=headers,
        json={
            "stateVersion": 999,
            "actorId": "player",
            "targetId": "baizhantang",
            "speak": "老白！",
        },
    )
    assert action_resp.status_code == 409
    body = action_resp.json()
    # 响应体格式（camelCase）：code + currentStateVersion + worldState
    assert body["code"] == "STATE_VERSION_CONFLICT"
    assert body["currentStateVersion"] == 1
    assert body["worldState"]["stateVersion"] == 1
    assert "baizhantang" in body["worldState"]["entities"]


@pytest.mark.asyncio
async def test_http_actions_missing_state_version_returns_422(
    client: httpx.AsyncClient,
) -> None:
    """HTTP 层：缺 stateVersion → 422。"""
    register_resp = await client.post(
        "/api/auth/register",
        json={"email": "httplock422@example.com", "password": "pwd123456", "username": "httplock422"},
    )
    assert register_resp.status_code == 200
    login_resp = await client.post(
        "/api/auth/login",
        json={"email": "httplock422@example.com", "password": "pwd123456"},
    )
    assert login_resp.status_code == 200
    token = login_resp.json()["accessToken"]
    headers = {"Authorization": f"Bearer {token}"}

    sess_resp = await client.post("/api/conversations", headers=headers, json={"title": "lock 422 test"})
    assert sess_resp.status_code == 200
    conversation_id = sess_resp.json()["id"]

    action_resp = await client.post(
        f"/api/conversations/{conversation_id}/actions",
        headers=headers,
        json={
            "actorId": "player",
            "targetId": "baizhantang",
            "speak": "老白！",
        },
    )
    assert action_resp.status_code == 422


@pytest.mark.asyncio
async def test_commit_turn_rechecks_version_after_lock(
    async_db_session: AsyncSession,
) -> None:
    """落库前 FOR UPDATE 再校验：跑图窗口内版本被抬高 → commit_turn 409。"""
    _user, controller, ws = await _make_user_and_controller(async_db_session, "lock-toctou@example.com")
    await controller.commit(expected_state_version=1)

    # 模拟并发写入：DB 版本已升到 2，内存仍按 v=1 回合进行
    bumped = ws.model_copy(update={"state_version": 2})
    controller._conversation.world_state_json = bumped.model_dump(mode="json")
    controller._conversation.state_version = 2
    await async_db_session.commit()

    with pytest.raises(StateVersionConflict) as exc_info:
        await controller.commit_turn(
            turn_id="t-toctou",
            player_entry=TimelineEntry(
                turn_id="t-toctou",
                actor_id="player",
                kind=TimelineKind.SPEAK,
                speak="晚了",
            ),
            director_writes=[],
            npc_responses=[],
            scene_note=None,
        )
    assert exc_info.value.expected_state_version == 1
    assert exc_info.value.current_state_version == 2
    assert "expected 1" in str(exc_info.value)
    assert "current is 2" in str(exc_info.value)
