# ruff: noqa: E402
import asyncio
import sys
from collections.abc import AsyncIterator, Iterator
from pathlib import Path

import pytest
import pytest_asyncio
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

import app.main as app_main
from app.core.settings import settings
from app.db import session as db_session


@pytest.fixture
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[TestClient]:
    db_file = tmp_path / "api_test.db"
    test_engine = create_async_engine(f"sqlite+aiosqlite:///{db_file}", future=True, echo=False)
    test_session_maker = async_sessionmaker(bind=test_engine, expire_on_commit=False, class_=AsyncSession)

    monkeypatch.setattr(db_session, "engine", test_engine)
    monkeypatch.setattr(db_session, "AsyncSessionLocal", test_session_maker)
    monkeypatch.setattr(app_main, "AsyncSessionLocal", test_session_maker)
    monkeypatch.setattr(settings, "LOG_ENABLE_FILE", False)
    monkeypatch.setattr(settings, "INIT_BUILTIN_ROLES_ON_START", False)

    with TestClient(app_main.create_app()) as test_client:
        yield test_client

    asyncio.run(test_engine.dispose())


@pytest_asyncio.fixture
async def async_db_session(tmp_path: Path) -> AsyncIterator[AsyncSession]:
    db_file = tmp_path / "service_test.db"
    test_engine = create_async_engine(f"sqlite+aiosqlite:///{db_file}", future=True, echo=False)
    test_session_maker = async_sessionmaker(bind=test_engine, expire_on_commit=False, class_=AsyncSession)

    async with test_engine.begin() as conn:
        await conn.run_sync(db_session.Base.metadata.create_all)

    async with test_session_maker() as session:
        yield session

    await test_engine.dispose()
