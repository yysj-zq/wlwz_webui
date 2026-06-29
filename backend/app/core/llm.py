from __future__ import annotations

import re

from langchain_core.globals import set_debug
from langchain_openai import ChatOpenAI
from pydantic import SecretStr

from app.core.config import settings

set_debug(settings.DEBUG)

_THINK_RE = re.compile(r"<think>.*?</think>", re.DOTALL)


def strip_think(text: str) -> str:
    """剥离推理模型内联在 content 里的 <think>...</think> 块。"""
    return _THINK_RE.sub("", text).strip()


def get_chat_model(*, temperature: float = 0.7, streaming: bool = False) -> ChatOpenAI:
    return ChatOpenAI(
        base_url=f"{settings.MODEL_BASE_URL.rstrip('/')}",
        api_key=SecretStr(settings.MODEL_API_KEY or "EMPTY"),
        model=settings.MODEL_NAME,
        temperature=temperature,
        streaming=streaming,
    )
