"""
应用级 structlog + stdlib logging 配置，供 main 在导入路由之前最先调用 configure_logging()。
"""
from __future__ import annotations

import logging
import sys
from pathlib import Path
from typing import Any

import structlog
from structlog.contextvars import merge_contextvars
from structlog.typing import Processor

from config import settings


def _parse_log_level(name: str) -> int:
    return getattr(logging, name.upper(), logging.INFO)


def _build_shared_processors() -> list[Processor]:
    return [
        merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.TimeStamper(fmt="iso"),
    ]


def configure_logging() -> None:
    level = _parse_log_level(settings.LOG_LEVEL)

    shared = _build_shared_processors()
    renderer: Processor
    if settings.LOG_JSON:
        renderer = structlog.processors.JSONRenderer()
    else:
        renderer = structlog.dev.ConsoleRenderer()

    formatter = structlog.stdlib.ProcessorFormatter(
        processor=renderer,
        foreign_pre_chain=[
            merge_contextvars,
            structlog.stdlib.add_log_level,
            structlog.stdlib.add_logger_name,
        ],
    )

    handlers: list[logging.Handler] = []
    stream_handler = logging.StreamHandler(sys.stdout)
    stream_handler.setFormatter(formatter)
    handlers.append(stream_handler)

    if settings.LOG_ENABLE_FILE:
        log_path = Path(settings.LOG_FILE)
        log_path.parent.mkdir(parents=True, exist_ok=True)
        file_handler = logging.FileHandler(log_path, encoding="utf-8")
        file_handler.setFormatter(formatter)
        handlers.append(file_handler)

    root = logging.getLogger()
    root.handlers.clear()
    for h in handlers:
        root.addHandler(h)
    root.setLevel(level)

    structlog.configure(
        processors=[
            merge_contextvars,
            structlog.stdlib.filter_by_level,
            structlog.stdlib.add_logger_name,
            structlog.stdlib.add_log_level,
            structlog.stdlib.PositionalArgumentsFormatter(),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )

    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        logging.getLogger(name).handlers.clear()
        logging.getLogger(name).propagate = True


def get_logger(name: str | None = None) -> Any:
    return structlog.get_logger(name)
