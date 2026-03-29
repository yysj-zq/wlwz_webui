import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path

from config import settings
from logging_config import configure_logging, get_logger

configure_logging()

from middleware import HttpAccessMiddleware
from routers import auth_router, chat_router, conversation_router, roles_router, tts_router
from db import AsyncSessionLocal, init_db
from services.roles_service import init_builtin_roles_if_enabled

# 后端代码所在目录，与启动时工作目录无关，便于前后端分离部署
_BACKEND_DIR = Path(__file__).resolve().parent
_STATIC_DIR = _BACKEND_DIR / "static"

logger = get_logger(__name__)

app = FastAPI(
    title=settings.PROJECT_NAME,
    description=settings.DESCRIPTION,
    version=settings.VERSION,
)

app.add_middleware(HttpAccessMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def on_startup() -> None:
    await init_db()
    async with AsyncSessionLocal() as db:
        await init_builtin_roles_if_enabled(db)

    (_STATIC_DIR / "role-avatars").mkdir(parents=True, exist_ok=True)
    app.mount("/static", StaticFiles(directory=str(_STATIC_DIR)), name="static")


app.include_router(auth_router.router, prefix=settings.API_PREFIX, tags=["认证"])
app.include_router(conversation_router.router, prefix=settings.API_PREFIX, tags=["会话"])
app.include_router(chat_router.router, prefix=settings.API_PREFIX, tags=["聊天"])
app.include_router(roles_router.router, prefix=settings.API_PREFIX, tags=["角色"])
app.include_router(tts_router.router, prefix=settings.API_PREFIX, tags=["语音"])


@app.get("/")
async def root():
    return {"status": "ok", "message": "服务正常运行"}


if __name__ == "__main__":
    logger.info("app_start", address=f"0.0.0.0:{settings.PORT}")
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=settings.PORT,
        reload=True,
        access_log=False,
    )
