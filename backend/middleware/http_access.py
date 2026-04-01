"""HTTP 访问日志中间件：request_id + 结束时 method/path/status/耗时。"""
from __future__ import annotations

import time
from typing import Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response, StreamingResponse

from logging_config import get_logger
from utils.request_context import clear_request_context, new_request_id, set_request_id

logger = get_logger(__name__)


class HttpAccessMiddleware(BaseHTTPMiddleware):
    """
    HTTP 边界：注入 request_id；请求结束时记录 method/path/status/耗时。
    不记录请求体与流式正文（由业务层或网关负责）。
    """

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        set_request_id(new_request_id())
        start_time = time.perf_counter()
        method = request.method
        path = str(request.url)

        if method in ("POST", "PUT", "PATCH"):
            try:
                body = await request.body()
                if body:

                    async def receive():
                        return {"type": "http.request", "body": body}

                    request._receive = receive
            except Exception as e:
                logger.error(
                    "http_read_body_failed",
                    method=method,
                    path=path,
                    error=str(e),
                    exc_info=True,
                )
                clear_request_context()
                raise

        try:
            response = await call_next(request)
        except Exception as e:
            duration_s = time.perf_counter() - start_time
            logger.error(
                "http_access_error",
                method=method,
                path=path,
                duration_s=round(duration_s, 4),
                error=str(e),
                exc_info=True,
            )
            clear_request_context()
            raise

        if isinstance(response, StreamingResponse):
            return await self._wrap_streaming_response(
                response, method, path, start_time
            )

        duration_s = time.perf_counter() - start_time
        logger.info(
            "http_access",
            method=method,
            path=path,
            status_code=response.status_code,
            duration_s=round(duration_s, 4),
            streaming=False,
        )
        clear_request_context()
        return response

    async def _wrap_streaming_response(
        self,
        response: StreamingResponse,
        method: str,
        path: str,
        start_time: float,
    ) -> StreamingResponse:
        media_type = response.media_type or ""
        is_sse = media_type.startswith("text/event-stream")

        async def log_and_stream():
            chunk_count = 0
            try:
                async for chunk in response.body_iterator:
                    chunk_count += 1
                    yield chunk
                duration_s = time.perf_counter() - start_time
                logger.info(
                    "http_access",
                    method=method,
                    path=path,
                    status_code=response.status_code,
                    duration_s=round(duration_s, 4),
                    streaming=True,
                    chunk_count=chunk_count,
                    media_type=media_type,
                    sse=is_sse,
                )
            except Exception as e:
                duration_s = time.perf_counter() - start_time
                logger.error(
                    "http_stream_error",
                    method=method,
                    path=path,
                    duration_s=round(duration_s, 4),
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
