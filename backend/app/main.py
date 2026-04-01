from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.logging import configure_logging
from app.core.settings import settings
from app.db.session import AsyncSessionLocal, init_db
from app.api.middleware import HttpAccessMiddleware
from app.services.roles_service import init_builtin_roles_if_enabled

configure_logging()


@asynccontextmanager
async def lifespan(_: FastAPI):
    await init_db()
    async with AsyncSessionLocal() as db:
        await init_builtin_roles_if_enabled(db)
    yield


def create_app() -> FastAPI:
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
    async def root():
        return {"status": "ok", "message": "服务正常运行"}

    return app


app = create_app()
