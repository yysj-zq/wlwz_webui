import logging
import time
import json
import asyncio
from typing import Callable, AsyncGenerator
import uvicorn
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import StreamingResponse

from routers import chat_router, roles_router
from config import settings

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('app.log', encoding='utf-8'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

class SSELoggingMiddleware(BaseHTTPMiddleware):
    """支持SSE流式响应的日志记录中间件"""
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        start_time = time.time()
        
        # 获取请求信息
        method = request.method
        url = str(request.url)
        
        # 读取请求体
        request_body = ""
        if method in ["POST", "PUT", "PATCH"]:
            try:
                body = await request.body()
                if body:
                    request_body = body.decode('utf-8')
                    # 重新构建请求
                    async def receive():
                        return {"type": "http.request", "body": body}
                    request._receive = receive
            except Exception as e:
                logger.error(f"读取请求体失败: {e}")
        
        # 记录请求日志
        logger.info(f"[REQUEST] {method} {url}")
        if request_body:
            try:
                formatted_body = json.dumps(json.loads(request_body), ensure_ascii=False, indent=2)
                logger.info(f"[REQUEST BODY]\n{formatted_body}")
            except json.JSONDecodeError:
                logger.info(f"[REQUEST BODY] {request_body}")
        
        try:
            response = await call_next(request)
            
            # 检查是否是流式响应
            if isinstance(response, StreamingResponse):
                # 处理流式响应
                return await self._handle_streaming_response(response, method, url, start_time)
            else:
                # 处理普通响应
                return await self._handle_regular_response(response, method, url, start_time)
                
        except Exception as e:
            process_time = time.time() - start_time
            logger.error(f"[ERROR] {method} {url} - 耗时: {process_time:.3f}s - 错误: {str(e)}")
            raise
    
    async def _handle_streaming_response(self, response: StreamingResponse, method: str, url: str, start_time: float) -> StreamingResponse:
        """处理流式响应"""
        
        # 收集所有流式数据
        collected_chunks = []
        full_content = ""
        
        async def log_and_stream():
            nonlocal full_content
            chunk_count = 0
            
            try:
                async for chunk in response.body_iterator:
                    chunk_count += 1
                    chunk_str = chunk.decode('utf-8') if isinstance(chunk, bytes) else str(chunk)
                    collected_chunks.append(chunk_str)
                    
                    # 解析SSE数据
                    sse_content = self._parse_sse_chunk(chunk_str)
                    if sse_content:
                        full_content += sse_content
                    
                    yield chunk
                
                # 记录完整的流式响应日志
                process_time = time.time() - start_time
                logger.info(f"[STREAMING RESPONSE] {method} {url} - 状态码: {response.status_code} - 耗时: {process_time:.3f}s")
                logger.info(f"[STREAM CHUNKS] 总计: {chunk_count} 个数据块")
                logger.info(f"[STREAM CONTENT] {full_content}")
                
            except Exception as e:
                process_time = time.time() - start_time
                logger.error(f"[STREAMING ERROR] {method} {url} - 耗时: {process_time:.3f}s - 错误: {str(e)}")
                raise
        
        # 创建新的流式响应
        return StreamingResponse(
            log_and_stream(),
            status_code=response.status_code,
            headers=response.headers,
            media_type=response.media_type
        )
    
    async def _handle_regular_response(self, response: Response, method: str, url: str, start_time: float) -> Response:
        """处理普通响应"""
        process_time = time.time() - start_time
        logger.info(f"[RESPONSE] {method} {url} - 状态码: {response.status_code} - 耗时: {process_time:.3f}s")
        return response
    
    def _parse_sse_chunk(self, chunk: str) -> str:
        """解析SSE数据块，提取实际内容"""
        content = ""
        lines = chunk.strip().split('\n')
        
        for line in lines:
            if line.startswith('data: '):
                try:
                    data_str = line[6:]  # 移除 "data: " 前缀
                    if data_str and data_str != '{}':
                        data = json.loads(data_str)
                        if 'content' in data:
                            content += data['content']
                except json.JSONDecodeError:
                    pass
        
        return content

app = FastAPI(
    title=settings.PROJECT_NAME,
    description=settings.DESCRIPTION,
    version=settings.VERSION
)

# 添加日志中间件
app.add_middleware(SSELoggingMiddleware)

# 配置 CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 在生产环境中，应该设置为特定的前端域名
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(chat_router.router, prefix=settings.API_PREFIX, tags=["聊天"])
app.include_router(roles_router.router, prefix=settings.API_PREFIX, tags=["角色"])

@app.get("/")
async def root():
    """健康检查接口"""
    return {"status": "ok", "message": "服务正常运行"}

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
