from __future__ import annotations

import uuid

from structlog.contextvars import bind_contextvars, clear_contextvars, get_contextvars


def new_request_id() -> str:
    return str(uuid.uuid4())


def set_request_id(rid: str) -> None:
    bind_contextvars(request_id=rid)


def clear_request_context() -> None:
    clear_contextvars()


def get_request_id() -> str | None:
    return get_contextvars().get("request_id")
