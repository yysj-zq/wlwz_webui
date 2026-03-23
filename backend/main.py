import json
import time
from typing import Callable

import uvicorn
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import StreamingResponse

from config import settings
from logging_config import configure_logging, get_logger

configure_logging()

from routers import auth_router, chat_router, conversation_router, roles_router, tts_router
from db import AsyncSessionLocal, init_db
from services.roles_service import init_builtin_roles_if_enabled
from fastapi.staticfiles import StaticFiles
from pathlib import Path

from utils.log_redact import redact_json_obj
from utils.request_context import clear_request_context, new_request_id, set_request_id

# 后端代码所在目录，与启动时工作目录无关，便于前后端分离部署
_BACKEND_DIR = Path(__file__).resolve().parent
_STATIC_DIR = _BACKEND_DIR / "static"

logger = get_logger(__name__)


class SSELoggingMiddleware(BaseHTTPMiddleware):
    """支持 SSE 流式响应的日志记录中间件；注入 request_id 供 structlog 关联。"""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        rid = new_request_id()
        set_request_id(rid)
        start_time = time.time()
        streaming = False

        method = request.method
        url = str(request.url)

        request_body = ""
        if method in ("POST", "PUT", "PATCH"):
            try:
                body = await request.body()
                if body:
                    request_body = body.decode("utf-8")

                    async def receive():
                        return {"type": "http.request", "body": body}

                    request._receive = receive
            except Exception as e:
                logger.error("http_read_body_failed", error=str(e), exc_info=True)
                clear_request_context()
                raise

        logger.info("http_request_start", method=method, path=request.url.path, url=url)

        if request_body and settings.LOG_REQUEST_BODY:
            try:
                parsed = json.loads(request_body)
                safe = redact_json_obj(parsed)
                formatted = json.dumps(safe, ensure_ascii=False, indent=2)
                logger.info("http_request_body", body=formatted)
            except json.JSONDecodeError:
                preview = request_body if len(request_body) <= 4096 else request_body[:4096] + "…"
                logger.info("http_request_body_raw", body_preview=preview)

        try:
            response = await call_next(request)
        except Exception as e:
            process_time = time.time() - start_time
            logger.error(
                "http_request_error",
                method=method,
                url=url,
                duration_s=round(process_time, 3),
                error=str(e),
                exc_info=True,
            )
            clear_request_context()
            raise

        if isinstance(response, StreamingResponse):
            streaming = True
            return await self._handle_streaming_response(
                response, method, url, start_time
            )

        try:
            return await self._handle_regular_response(
                response, method, url, start_time
            )
        finally:
            clear_request_context()

    async def _handle_streaming_response(
        self,
        response: StreamingResponse,
        method: str,
        url: str,
        start_time: float,
    ) -> StreamingResponse:
        is_sse_response = (response.media_type or "").startswith("text/event-stream")
        full_content = ""

        async def log_and_stream():
            nonlocal full_content
            chunk_count = 0
            try:
                async for chunk in response.body_iterator:
                    chunk_count += 1
                    if is_sse_response:
                        chunk_str = (
                            chunk.decode("utf-8", errors="ignore")
                            if isinstance(chunk, bytes)
                            else str(chunk)
                        )
                        sse_content = self._parse_sse_chunk(chunk_str)
                        if sse_content:
                            full_content += sse_content
                    yield chunk

                process_time = time.time() - start_time
                logger.info(
                    "http_streaming_response",
                    method=method,
                    url=url,
                    status_code=response.status_code,
                    duration_s=round(process_time, 3),
                    chunk_count=chunk_count,
                    media_type=response.media_type,
                )
                if settings.LOG_SSE_CONTENT and is_sse_response:
                    logger.info("http_sse_content", content=full_content)
                elif not is_sse_response:
                    logger.info(
                        "http_stream_non_sse",
                        media_type=response.media_type,
                    )
            except Exception as e:
                process_time = time.time() - start_time
                logger.error(
                    "http_streaming_error",
                    method=method,
                    url=url,
                    duration_s=round(process_time, 3),
                    error=str(e),
                    exc_info=True,
                )
                raise
            finally:
                clear_request_context()

        return StreamingResponse(
            log_and_stream(),
            status_code=response.status_code,
            headers=response.headers,
            media_type=response.media_type,
        )

    async def _handle_regular_response(
        self, response: Response, method: str, url: str, start_time: float
    ) -> Response:
        process_time = time.time() - start_time
        logger.info(
            "http_response",
            method=method,
            url=url,
            status_code=response.status_code,
            duration_s=round(process_time, 3),
        )
        return response

    def _parse_sse_chunk(self, chunk: str) -> str:
        content = ""
        lines = chunk.strip().split("\n")

        for line in lines:
            if line.startswith("data: "):
                try:
                    data_str = line[6:]
                    if data_str and data_str != "{}":
                        data = json.loads(data_str)
                        if "content" in data:
                            content += data["content"]
                except json.JSONDecodeError:
                    pass

        return content


app = FastAPI(
    title=settings.PROJECT_NAME,
    description=settings.DESCRIPTION,
    version=settings.VERSION,
)

app.add_middleware(SSELoggingMiddleware)

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
    logger.info("app_start", port=settings.PORT)
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=settings.PORT,
        reload=True,
        access_log=False,
    )
