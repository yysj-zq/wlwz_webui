from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from config import settings


class Base(DeclarativeBase):
    """SQLAlchemy 基类"""


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
    """FastAPI 依赖注入使用的异步 Session 生成器"""
    async with AsyncSessionLocal() as session:
        yield session


async def init_db() -> None:
    """
    初始化数据库结构。

    在未引入 Alembic 之前，可在应用启动时调用该函数创建所有表；
    不做任何兼容/迁移逻辑（不补列、不改表）。
    """
    # 为避免循环依赖，这里在函数内部导入模型
    from models import db_models  # noqa: F401

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

