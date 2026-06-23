from __future__ import annotations

from langchain_core.globals import set_debug
from langchain_openai import ChatOpenAI
from pydantic import SecretStr

from app.core.config import settings

set_debug(settings.DEBUG)


def get_chat_model(*, temperature: float = 0.7, streaming: bool = False) -> ChatOpenAI:
    return ChatOpenAI(
        base_url=f"{settings.MODEL_BASE_URL.rstrip('/')}",
        api_key=SecretStr(settings.MODEL_API_KEY or "EMPTY"),
        model=settings.MODEL_NAME,
        temperature=temperature,
        streaming=streaming,
    )
