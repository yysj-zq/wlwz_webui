"""GET /roles 响应形状：强类型 RoleOut 列表，序列化为 camelCase。"""

from typing import Any, cast

import httpx


async def test_get_roles_returns_camel_case_role_out_list(client: httpx.AsyncClient) -> None:
    resp = await client.get("/api/roles")
    assert resp.status_code == 200

    data = cast(list[dict[str, Any]], resp.json())
    assert isinstance(data, list)
    assert len(data) > 0

    first = data[0]
    assert "systemPrompt" in first
    assert "defaultSpeakerId" in first
    assert "avatarUrl" in first
    assert "isBuiltin" in first
    assert "isMine" in first
    assert "inGame" in first
    assert "system_prompt" not in first
    assert "default_speaker_id" not in first
    assert "avatar_url" not in first
    assert "is_builtin" not in first
    assert "is_mine" not in first
    assert "in_game" not in first
