"""每个用例独立库：默认临时 SQLite。指定库仅认 ``TEST_DATABASE_URL``（勿用 ``DATABASE_URL``，避免误连开发库）。"""

import os
from collections.abc import AsyncIterator
from functools import lru_cache
from pathlib import Path

import pytest
import pytest_asyncio
from alembic.config import Config
from alembic.script import ScriptDirectory
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

import app.main as app_main
from app.core.settings import settings
from app.db import session as db_session


def _test_database_url(tmp_path_db: Path) -> str:
    return os.environ.get("TEST_DATABASE_URL") or f"sqlite+aiosqlite:///{tmp_path_db}"


def _uses_explicit_test_database_url() -> bool:
    return bool(os.environ.get("TEST_DATABASE_URL"))


@lru_cache(maxsize=1)
def _alembic_head_revision() -> str:
    """与 ``alembic heads`` 当前 head 一致，供 ``check_db_health`` 校验。"""
    backend_root = Path(__file__).resolve().parent.parent
    cfg = Config(str(backend_root / "alembic.ini"))
    script = ScriptDirectory.from_config(cfg)
    head = script.get_current_head()
    if head is None:
        msg = "alembic script directory has no head revision"
        raise RuntimeError(msg)
    return head


async def _stamp_alembic_version(engine: AsyncEngine) -> None:
    """测试库用 metadata.create_all，需补写 alembic_version 以满足启动时迁移校验。"""
    revision = _alembic_head_revision()
    async with engine.begin() as conn:
        await conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS alembic_version (
                    version_num VARCHAR(32) NOT NULL,
                    CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num)
                )
                """
            )
        )
        await conn.execute(text("DELETE FROM alembic_version"))
        await conn.execute(
            text("INSERT INTO alembic_version (version_num) VALUES (:rev)"),
            {"rev": revision},
        )


async def _prepare_schema(engine: AsyncEngine) -> None:
    async with engine.begin() as conn:
        if _uses_explicit_test_database_url():
            await conn.run_sync(db_session.Base.metadata.drop_all)
        await conn.run_sync(db_session.Base.metadata.create_all)
    await _stamp_alembic_version(engine)


@pytest_asyncio.fixture
async def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> AsyncIterator[TestClient]:
    db_file = tmp_path / "api_test.db"
    url = _test_database_url(db_file)
    test_engine = create_async_engine(url, future=True, echo=False)
    test_session_maker = async_sessionmaker(bind=test_engine, expire_on_commit=False, class_=AsyncSession)

    monkeypatch.setattr(db_session, "engine", test_engine)
    monkeypatch.setattr(db_session, "AsyncSessionLocal", test_session_maker)
    monkeypatch.setattr(app_main, "AsyncSessionLocal", test_session_maker)
    monkeypatch.setattr(settings, "LOG_ENABLE_FILE", False)
    monkeypatch.setattr(settings, "INIT_BUILTIN_ROLES_ON_START", False)

    await _prepare_schema(test_engine)

    with TestClient(app_main.create_app()) as test_client:
        yield test_client

    await test_engine.dispose()


@pytest_asyncio.fixture
async def async_db_session(tmp_path: Path) -> AsyncIterator[AsyncSession]:
    db_file = tmp_path / "service_test.db"
    url = _test_database_url(db_file)
    test_engine = create_async_engine(url, future=True, echo=False)
    test_session_maker = async_sessionmaker(bind=test_engine, expire_on_commit=False, class_=AsyncSession)

    await _prepare_schema(test_engine)

    async with test_session_maker() as session:
        yield session

    await test_engine.dispose()
