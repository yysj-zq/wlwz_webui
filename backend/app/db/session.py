from collections.abc import AsyncGenerator

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.logging import get_logger
from app.core.settings import settings

logger = get_logger(__name__)


class Base(DeclarativeBase):
    """SQLAlchemy declarative base."""


engine = create_async_engine(
    settings.DATABASE_URL,
    future=True,
    echo=settings.SQLALCHEMY_ECHO,
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    expire_on_commit=False,
    class_=AsyncSession,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        yield session


async def ping_db() -> None:
    """Lightweight DB connectivity check for health endpoints."""
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
    except Exception as e:  # noqa: BLE001
        raise RuntimeError(f"database_unreachable: {e}") from e


async def check_db_health() -> None:
    """Verify database connectivity and migration state.

    Raises:
        RuntimeError: if database is unreachable or not migrated.
    """
    await ping_db()

    try:
        async with engine.connect() as conn:
            result = await conn.execute(text("SELECT version_num FROM alembic_version LIMIT 1"))
            row = result.first()
            if row is None:
                raise RuntimeError("database_unmigrated: run ``alembic upgrade head`` before starting the app")
            logger.info("db_health_check_ok", alembic_version=row[0])
    except Exception as e:  # noqa: BLE001
        if "no such table" in str(e).lower():
            raise RuntimeError("database_unmigrated: run ``alembic upgrade head`` before starting the app") from e
        raise RuntimeError(f"database_version_check_failed: {e}") from e
