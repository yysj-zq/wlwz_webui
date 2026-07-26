from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.middleware import HttpAccessMiddleware
from app.api.router import api_router
from app.core import (
    AsyncSessionLocal,
    check_db_health,
    configure_logging,
    ping_db,
    settings,
)
from app.schemas import ConflictResponse
from app.services import StateVersionConflict, init_builtin_roles_if_enabled

configure_logging()

OPENAPI_TAGS: list[dict[str, str]] = [
    {
        "name": "Auth",
        "description": "用户注册、登录、JWT 鉴权与当前用户信息接口。",
    },
    {
        "name": "Conversation",
        "description": "会话生命周期、世界状态、玩家动作、对话、统一时间线与角色切换接口。",
    },
    {
        "name": "Roles",
        "description": "角色（系统内置 + 用户自定义）的查询、创建、更新、删除与头像管理。",
    },
    {
        "name": "TTS",
        "description": "文本转语音（TTS）合成接口，支持角色默认 speaker 与 Redis 缓存。",
    },
]


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    """应用生命周期钩子：验证数据库连接并（可选）初始化内置角色。"""
    await check_db_health()
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
        openapi_tags=OPENAPI_TAGS,
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

    @app.exception_handler(StateVersionConflict)
    async def _state_version_conflict_handler(_: Request, exc: StateVersionConflict) -> JSONResponse:
        # 乐观锁冲突：409 + ConflictResponse（camelCase），方便前端重渲染。
        body = ConflictResponse(
            code="STATE_VERSION_CONFLICT",
            current_state_version=exc.current_state_version,
            world_state=exc.current_world_state,
        )
        return JSONResponse(
            status_code=409,
            content=body.model_dump(mode="json", by_alias=True),
        )

    @app.get("/")
    async def root() -> dict[str, str]:
        """健康检查接口：验证数据库连接。"""
        try:
            await ping_db()
            return {"status": "ok", "message": "服务正常运行"}
        except RuntimeError as e:
            return {"status": "error", "message": str(e)}

    return app


app = create_app()
