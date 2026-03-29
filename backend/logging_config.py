"""
应用级 structlog + stdlib logging 配置，供 main 在导入路由之前最先调用 configure_logging()。
"""

from __future__ import annotations

import logging
import logging.handlers
import sys
from pathlib import Path
from typing import Any

import structlog
from structlog.contextvars import merge_contextvars
from structlog.typing import Processor

from config import settings


def _parse_log_level(name: str) -> int:
    return getattr(logging, name.upper(), logging.INFO)


def configure_logging() -> None:
    level = _parse_log_level(settings.LOG_LEVEL)

    renderer: Processor
    if settings.LOG_JSON:
        # 与 stdlib json.dumps 一致，默认 sort_keys=False，保留 event_dict 插入顺序
        renderer = structlog.processors.JSONRenderer(sort_keys=False)
    else:
        # 默认 True 会按字母排序字段，与代码里关键字顺序不一致；False 保留插入顺序
        renderer = structlog.dev.ConsoleRenderer(sort_keys=False)

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
        file_handler = logging.handlers.RotatingFileHandler(
            log_path,
            maxBytes=10 * 1024 * 1024,
            backupCount=5,
            encoding="utf-8",
        )
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
            structlog.processors.TimeStamper(fmt="%Y-%m-%d %H:%M:%S.%03d", utc=False),
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )

    # 勿对 uvicorn.access 清 handler / 设 propagate=True：
    # Uvicorn 在 access_log=False 时会将 uvicorn.access 设为 propagate=False；
    # reload 子进程里先执行 uvicorn.config.configure_logging()，再 import main，
    # 若此处改回 propagate=True，则 hasHandlers() 会沿 root 判为 True，访问日志仍会打。
    for name in ("uvicorn"):
        logging.getLogger(name).handlers.clear()
        logging.getLogger(name).propagate = True

    # 未显式开 SQL echo 时压低 sqlalchemy.*，避免连接池/方言等 INFO 刷屏；SQLALCHEMY_ECHO=true 时保留默认级别以便看 SQL
    if not settings.SQLALCHEMY_ECHO:
        logging.getLogger("sqlalchemy").setLevel(logging.WARNING)


def get_logger(name: str | None = None) -> Any:
    return structlog.get_logger(name)
