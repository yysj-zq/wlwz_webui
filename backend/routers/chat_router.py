from fastapi import APIRouter, HTTPException
from typing import Dict, Any, Optional
from sse_starlette.sse import EventSourceResponse
import asyncio
import json

from services.models import ChatRequest
from services.chat_service import generate_response, generate_response_stream

router = APIRouter()

@router.post("/chat")
async def chat(request: ChatRequest):
    """
    处理普通聊天请求
    """
    try:
        response = await generate_response(
            messages=request.messages,
            user_role=request.userRole,
            assistant_role=request.assistantRole
        )
        return {
            "content": response,
            "response": response,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/chat/stream")
async def chat_stream(request: ChatRequest):
    """
    处理流式聊天请求
    """
    async def event_generator():
        try:
            async for text_chunk in generate_response_stream(
                messages=request.messages,
                user_role=request.userRole,
                assistant_role=request.assistantRole
            ):
                if await asyncio.sleep(0.01, result=True):  # 非阻塞等待
                    yield {
                        "event": "message",
                        "data": json.dumps({"content": text_chunk})
                    }

            # 发送完成信号
            yield {
                "event": "done",
                "data": json.dumps({"content": ""})
            }
        except Exception as e:
            yield {
                "event": "error",
                "data": json.dumps({"error": str(e)})
            }

    return EventSourceResponse(event_generator())
