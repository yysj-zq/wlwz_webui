from __future__ import annotations

import re
from typing import Any, Protocol

from langchain_core.globals import set_debug
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.runnables import RunnableConfig
from langchain_openai import ChatOpenAI
from pydantic import SecretStr

from app.core.config import settings

set_debug(settings.DEBUG)

_THINK_RE = re.compile(r"<think>.*?</think>", re.DOTALL)

# RunnableConfig.configurable 键：无头 / 评测 / RL 注入教师或学生模型。
CHAT_MODEL_FACTORY_KEY = "chat_model_factory"


class ChatModelFactory(Protocol):
    """与 ``get_chat_model`` 同签名；G2/G3/G5 注入教师或被测模型。"""

    def __call__(self, *, temperature: float = 0.7, streaming: bool = False) -> BaseChatModel: ...


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


def resolve_chat_model(
    config: RunnableConfig | dict[str, Any] | None,
    *,
    temperature: float,
    streaming: bool = False,
) -> BaseChatModel:
    """从图 ``configurable`` 取 ``chat_model_factory``；缺省回落 ``get_chat_model``（HTTP 热路径）。"""
    factory: ChatModelFactory | None = None
    if config is not None:
        configurable = config.get("configurable") if hasattr(config, "get") else None
        if isinstance(configurable, dict):
            raw = configurable.get(CHAT_MODEL_FACTORY_KEY)
            if callable(raw):
                factory = raw
    if factory is not None:
        return factory(temperature=temperature, streaming=streaming)
    return get_chat_model(temperature=temperature, streaming=streaming)
