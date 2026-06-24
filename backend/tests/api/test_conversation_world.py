"""Conversation 即世界：API 端到端覆盖创建播种、玩家动作、conversation 不一致校验。"""

from typing import cast

import httpx
import pytest
from langchain_core.messages import AIMessage

import app.graph.nodes.director as director_node
import app.graph.nodes.npc_subgraph as npc_node


class _StubBoundLLM:
    def __init__(self, name: str, args: dict) -> None:
        self.name = name
        self.args = args

    async def ainvoke(self, _msgs):
        return AIMessage(content="", tool_calls=[{"name": self.name, "args": self.args, "id": "tc1"}])


class _StubChat:
    def __init__(self, name: str, args: dict) -> None:
        self.name = name
        self.args = args

    def bind_tools(self, _tools):
        return _StubBoundLLM(self.name, self.args)


async def _register_and_login(client: httpx.AsyncClient) -> str:
    register_resp = await client.post(
        "/api/auth/register",
        json={"email": "game@example.com", "password": "pwd123456", "username": "game-user"},
    )
    assert register_resp.status_code == 200
    login_resp = await client.post(
        "/api/auth/login",
        json={"email": "game@example.com", "password": "pwd123456"},
    )
    assert login_resp.status_code == 200
    return cast(str, login_resp.json()["access_token"])


async def test_create_conversation_seeds_scene_timeline(client: httpx.AsyncClient) -> None:
    token = await _register_and_login(client)
    resp = await client.post(
        "/api/conversations",
        headers={"Authorization": f"Bearer {token}"},
        json={"conversationId": None, "title": "同福客栈"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data["id"], int)
    assert data["world_state"]["entities"]["baizhantang"]["kind"] == "npc"

    timeline_resp = await client.get(
        f"/api/conversations/{data['id']}/timeline",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert timeline_resp.status_code == 200
    entries = timeline_resp.json()
    assert any(e["actor_id"] is None and e["kind"] == "scene" for e in entries)


async def test_create_conversation_requires_login(client: httpx.AsyncClient) -> None:
    response = await client.post("/api/conversations", json={"title": "匿名游戏"})
    assert response.status_code == 401


async def test_player_action_writes_npc_speak_to_timeline(
    client: httpx.AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        director_node, "get_chat_model",
        lambda **_: _StubChat(
            "submit_dispatch",
            {"world_writes": [], "perceivers": [
                {"actor_id": "baizhantang", "perception_reason": "被直接称呼"}
            ]},
        ),
    )
    monkeypatch.setattr(
        npc_node, "get_chat_model",
        lambda **_: _StubChat("submit_response", {"speak": "客官您吩咐。", "act_patch": [], "memory_writes": [], "inventory_ops": []}),
    )
    token = await _register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}
    sess_resp = await client.post(
        "/api/conversations", headers=headers, json={"title": "同福客栈"}
    )
    conversation_id = sess_resp.json()["id"]

    action_resp = await client.post(
        f"/api/conversations/{conversation_id}/actions",
        headers=headers,
        json={
            "stateVersion": 1,
            "actorId": "player",
            
            "targetId": "baizhantang",
            "speak": "老白，门口是谁？",
        },
    )
    assert action_resp.status_code == 200
    delta = action_resp.json()["timeline_delta"]
    assert any(
        e["actor_id"] == "baizhantang" and e["speak"] == "客官您吩咐。" for e in delta
    )


async def test_player_action_rejects_mismatched_conversation_id(
    client: httpx.AsyncClient,
) -> None:
    token = await _register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}
    sess_resp = await client.post(
        "/api/conversations", headers=headers, json={"title": "同福客栈"}
    )
    conversation_id = sess_resp.json()["id"]

    response = await client.post(
        f"/api/conversations/{conversation_id}/actions",
        headers=headers,
        json={
            "conversationId": conversation_id + 999,
            "stateVersion": 1,
            "actorId": "player",
            
            "act_patch": [{"entity_id": "player", "position": {"x": 6, "y": 6}}],
        },
    )
    assert response.status_code == 422
