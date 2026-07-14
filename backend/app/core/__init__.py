"""Core 基础设施层：配置、日志、数据库、安全、LLM、请求上下文。"""

from app.core.config import Settings, settings
from app.core.logging import configure_logging, get_logger
from app.core.database import (
    AsyncSessionLocal,
    Base,
    check_db_health,
    get_db,
    ping_db,
)
from app.core.security import create_access_token, get_password_hash, verify_password
from app.core.llm import get_chat_model, strip_think
from app.core.request_context import (
    clear_request_context,
    get_request_id,
    new_request_id,
    set_request_id,
)
from app.core.prompts import (
    COMPACTOR_SYSTEM_PROMPT,
    DIRECTOR_SYSTEM_PROMPT,
    NPC_SYSTEM_PROMPT_TEMPLATE,
    SUMMARIZER_SYSTEM_PROMPT,
)

__all__ = [
    "AsyncSessionLocal",
    "Base",
    "COMPACTOR_SYSTEM_PROMPT",
    "DIRECTOR_SYSTEM_PROMPT",
    "NPC_SYSTEM_PROMPT_TEMPLATE",
    "SUMMARIZER_SYSTEM_PROMPT",
    "Settings",
    "check_db_health",
    "clear_request_context",
    "configure_logging",
    "create_access_token",
    "get_chat_model",
    "get_db",
    "get_logger",
    "get_password_hash",
    "get_request_id",
    "new_request_id",
    "ping_db",
    "set_request_id",
    "settings",
    "strip_think",
    "verify_password",
]
