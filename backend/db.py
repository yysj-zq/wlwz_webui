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


async def _migrate_add_avatar_url(conn) -> None:
    """若 role_profiles 表存在但缺少 avatar_url 列则添加（兼容已有库）。"""
    from sqlalchemy import text
    dialect = conn.dialect.name
    if dialect == "postgresql":
        await conn.execute(text(
            "ALTER TABLE role_profiles ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(512)"
        ))
    elif dialect == "sqlite":
        try:
            await conn.execute(text(
                "ALTER TABLE role_profiles ADD COLUMN avatar_url VARCHAR(512)"
            ))
        except Exception as e:
            if "duplicate column" not in str(e).lower():
                raise
    # 其他数据库可在此扩展


async def init_db() -> None:
    """
    初始化数据库结构。

    在未引入 Alembic 之前，可在应用启动时调用该函数创建所有表；
    并执行简单迁移（如补充 avatar_url 列）。
    后续如接入 Alembic 迁移，可将结构演进交给迁移脚本管理。
    """
    # 为避免循环依赖，这里在函数内部导入模型
    from models import db_models  # noqa: F401

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await _migrate_add_avatar_url(conn)

