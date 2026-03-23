"""日志中的简单脱敏（JSON 键、Authorization 头）。"""
from __future__ import annotations

from typing import Any

_REDACT_KEYS = frozenset(
    k.lower()
    for k in (
        "password",
        "access_token",
        "refresh_token",
        "authorization",
        "secret",
        "api_key",
        "apikey",
        "client_secret",
    )
)


def redact_json_obj(obj: Any) -> Any:
    if isinstance(obj, dict):
        out: dict[str, Any] = {}
        for k, v in obj.items():
            if str(k).lower() in _REDACT_KEYS:
                out[k] = "***"
            else:
                out[k] = redact_json_obj(v)
        return out
    if isinstance(obj, list):
        return [redact_json_obj(x) for x in obj]
    return obj
