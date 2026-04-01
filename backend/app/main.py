from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.middleware import HttpAccessMiddleware
from app.api.router import api_router
from app.core.logging import configure_logging
from app.core.settings import settings
from app.db.session import AsyncSessionLocal, init_db
from app.services.roles_service import init_builtin_roles_if_enabled

configure_logging()


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    """应用生命周期钩子：初始化数据库并（可选）初始化内置角色。"""
    await init_db()
    async with AsyncSessionLocal() as db:
        await init_builtin_roles_if_enabled(db)
    yield


def create_app() -> FastAPI:
    """创建并配置 FastAPI 应用实例。"""
    app = FastAPI(
        title=settings.PROJECT_NAME,
        description=settings.DESCRIPTION,
        version=settings.VERSION,
        lifespan=lifespan,
    )
    app.add_middleware(HttpAccessMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list(),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(api_router, prefix=settings.API_PREFIX)

    @app.get("/")
    async def root() -> dict[str, str]:
        """健康检查接口。"""
        return {"status": "ok", "message": "服务正常运行"}

    return app


app = create_app()
