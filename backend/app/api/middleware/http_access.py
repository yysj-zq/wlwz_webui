from __future__ import annotations

import time
from collections.abc import AsyncIterator, Awaitable, Callable

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response, StreamingResponse

from app.common.request_context import clear_request_context, new_request_id, set_request_id
from app.core.logging import get_logger

logger = get_logger(__name__)


class HttpAccessMiddleware(BaseHTTPMiddleware):
    """记录 HTTP 访问信息并为请求设置 request_id。"""

    async def dispatch(self, request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
        set_request_id(new_request_id())
        start_time = time.perf_counter()
        method = request.method
        path = str(request.url)

        if method in ("POST", "PUT", "PATCH"):
            body = await request.body()
            if body:

                async def receive() -> dict[str, object]:
                    return {"type": "http.request", "body": body}

                request._receive = receive

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
            return await self._wrap_streaming_response(response, method, path, start_time)

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

        async def log_and_stream() -> AsyncIterator[bytes]:
            chunk_count = 0
            try:
                async for chunk in response.body_iterator:
                    chunk_count += 1
                    if isinstance(chunk, str):
                        yield chunk.encode()
                    else:
                        yield bytes(chunk)
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
            finally:
                clear_request_context()

        return StreamingResponse(
            log_and_stream(),
            status_code=response.status_code,
            headers=response.headers,
            media_type=response.media_type,
        )
