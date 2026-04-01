from typing import Any, cast

import pytest
from fastapi.testclient import TestClient

import app.api.routers.chat as chat_router


def _register_and_login(client: TestClient) -> str:
    register_resp = client.post(
        "/api/auth/register",
        json={"email": "tester@example.com", "password": "pwd123456", "username": "tester"},
    )
    assert register_resp.status_code == 200

    login_resp = client.post(
        "/api/auth/login",
        json={"email": "tester@example.com", "password": "pwd123456"},
    )
    assert login_resp.status_code == 200
    login_data = cast(dict[str, Any], login_resp.json())
    return cast(str, login_data["access_token"])


def test_auth_register_login_me(client: TestClient) -> None:
    token = _register_and_login(client)
    me_resp = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_resp.status_code == 200
    data = me_resp.json()
    assert data["email"] == "tester@example.com"
    assert data["is_admin"] is False


def test_chat_creates_and_renames_conversation(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    async def _fake_generate_response(**_: object) -> str:
        return "mock-reply"

    monkeypatch.setattr(chat_router, "generate_response", _fake_generate_response)
    token = _register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}

    chat_resp = client.post(
        "/api/chat",
        json={
            "messages": [{"role": "郭芙蓉", "content": "今天生意如何？"}],
            "userRole": "郭芙蓉",
            "assistantRole": "佟湘玉",
            "conversationId": None,
        },
        headers=headers,
    )
    assert chat_resp.status_code == 200
    chat_data = chat_resp.json()
    assert chat_data["content"] == "mock-reply"
    assert isinstance(chat_data["conversationId"], int)
    conversation_id = chat_data["conversationId"]

    list_resp = client.get("/api/conversations", headers=headers)
    assert list_resp.status_code == 200
    conversations = list_resp.json()
    assert any(item["id"] == conversation_id for item in conversations)

    rename_resp = client.post(
        f"/api/conversations/{conversation_id}/rename",
        json={"title": "新的标题"},
        headers=headers,
    )
    assert rename_resp.status_code == 200
    assert rename_resp.json()["title"] == "新的标题"
