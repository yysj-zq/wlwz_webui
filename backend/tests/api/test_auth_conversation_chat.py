"""认证、会话列表、chat 路径端到端测试。

chat 现在走 TurnGraph：发请求时 mock director + npc 的 get_chat_model。
"""

from typing import Any, cast

import httpx
import pytest
from langchain_core.messages import AIMessage

import app.graph.nodes.director as director_node
import app.graph.nodes.npc as npc_node


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


async def _register_and_login(client: httpx.AsyncClient) -> str:
    register_resp = await client.post(
        "/api/auth/register",
        json={"email": "tester@example.com", "password": "pwd123456", "username": "tester"},
    )
    assert register_resp.status_code == 200
    login_resp = await client.post(
        "/api/auth/login",
        json={"email": "tester@example.com", "password": "pwd123456"},
    )
    assert login_resp.status_code == 200
    login_data = cast(dict[str, Any], login_resp.json())
    return cast(str, login_data["accessToken"])


async def test_auth_register_login_me(client: httpx.AsyncClient) -> None:
    token = await _register_and_login(client)
    me_resp = await client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_resp.status_code == 200
    data = me_resp.json()
    assert data["email"] == "tester@example.com"
    assert data["isAdmin"] is False


async def test_chat_runs_through_unified_turn_graph(client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    # chat 不走 director；patch 成 explode 验证
    def _explode(**_: object) -> object:
        raise AssertionError("chat 模式不应触达 director")

    monkeypatch.setattr(director_node, "get_chat_model", _explode)
    monkeypatch.setattr(
        npc_node,
        "get_chat_model",
        lambda **_: _StubChat(
            "submit_response", {"speak": "我滴个神啊。", "act_patch": [], "memory_writes": [], "inventory_ops": []}
        ),
    )
    token = await _register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}

    # 创建 conversation（自带世界）
    sess_resp = await client.post("/api/conversations", headers=headers, json={"title": "同福客栈"})
    conversation_id = sess_resp.json()["id"]

    chat_resp = await client.post(
        f"/api/conversations/{conversation_id}/chat",
        json={"targetActorId": "tongxiangyu", "content": "掌柜的", "stateVersion": 1},
        headers=headers,
    )
    assert chat_resp.status_code == 200
    delta = chat_resp.json()["timelineDelta"]
    assert delta, "timelineDelta must be non-empty"
    assert all(isinstance(e.get("id"), int) for e in delta), "timelineDelta entries must carry persisted ids"
    assert any(e["actorId"] == "tongxiangyu" and e["speak"] == "我滴个神啊。" for e in delta)

    timeline_resp = await client.get(f"/api/conversations/{conversation_id}/timeline", headers=headers)
    entries = timeline_resp.json()
    # 应同时含玩家 speak + NPC speak（外加 turn 0 scene）
    assert any(e["actorId"] == "player" and e["speak"] == "掌柜的" for e in entries)
    assert any(e["actorId"] == "tongxiangyu" for e in entries)

    rename_resp = await client.post(
        f"/api/conversations/{conversation_id}/rename",
        json={"title": "新的标题"},
        headers=headers,
    )
    assert rename_resp.status_code == 200
    assert rename_resp.json()["title"] == "新的标题"
