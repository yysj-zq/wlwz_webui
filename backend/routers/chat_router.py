from fastapi import APIRouter, Depends, HTTPException
from typing import Dict, Any, Optional, List
from sse_starlette.sse import EventSourceResponse
import asyncio
import json

from sqlalchemy.ext.asyncio import AsyncSession

from db import get_db
from models.db_models import User
from services.models import ChatRequest
from services.chat_service import generate_response, generate_response_stream
from services.conversation_service import create_conversation, append_messages, get_conversation
from utils.security import get_current_user_optional

router = APIRouter()

@router.post("/chat")
async def chat(
    request: ChatRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    """
    处理普通聊天请求
    """
    try:
        # 未登录：允许聊天，但不落库、不创建会话
        if current_user is None:
            response = await generate_response(
                messages=request.messages,
                user_role=request.userRole,
                assistant_role=request.assistantRole,
            )
            return {
                "content": response,
                "response": response,
                "conversationId": None,
            }

        # 根据请求和用户创建或获取会话
        conversation_id: Optional[int] = getattr(request, "conversationId", None)
        if conversation_id is None:
            # 使用首条用户消息作为标题
            first_user_msg = next((m for m in request.messages if m.role != request.assistantRole), None)
            title = (first_user_msg.content[:30] + ("..." if len(first_user_msg.content) > 30 else "")) if first_user_msg else "新的对话"
            convo = await create_conversation(db, current_user, title)
            conversation_id = convo.id
        else:
            convo = await get_conversation(db, current_user, conversation_id)

        # 将请求中的消息持久化
        await append_messages(
            db,
            convo,
            [{"role": m.role, "content": m.content} for m in request.messages],
        )

        response = await generate_response(
            messages=request.messages,
            user_role=request.userRole,
            assistant_role=request.assistantRole
        )

        # 追加助手回复到数据库
        await append_messages(
            db,
            convo,
            [{"role": request.assistantRole, "content": response}],
        )
        return {
            "content": response,
            "response": response,
            "conversationId": conversation_id,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/chat/stream")
async def chat_stream(
    request: ChatRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
):
    """
    处理流式聊天请求
    """

    async def event_generator():
        try:
            # 未登录：允许流式聊天，但不落库、不创建会话
            if current_user is None:
                async for text_chunk in generate_response_stream(
                    messages=request.messages,
                    user_role=request.userRole,
                    assistant_role=request.assistantRole,
                ):
                    if await asyncio.sleep(0.01, result=True):  # 非阻塞等待
                        yield {
                            "event": "message",
                            "data": json.dumps({"content": text_chunk}),
                        }
                yield {
                    "event": "done",
                    "data": json.dumps({"content": "", "conversationId": None}),
                }
                return

            # 创建或获取会话，并保存请求消息
            conversation_id: Optional[int] = getattr(request, "conversationId", None)
            if conversation_id is None:
                first_user_msg = next((m for m in request.messages if m.role != request.assistantRole), None)
                title = (first_user_msg.content[:30] + ("..." if len(first_user_msg.content) > 30 else "")) if first_user_msg else "新的对话"
                convo = await create_conversation(db, current_user, title)
                conversation_id_local = convo.id
            else:
                convo = await get_conversation(db, current_user, conversation_id)
                conversation_id_local = convo.id

            await append_messages(
                db,
                convo,
                [{"role": m.role, "content": m.content} for m in request.messages],
            )

            collected_response: List[str] = []
            async for text_chunk in generate_response_stream(
                messages=request.messages,
                user_role=request.userRole,
                assistant_role=request.assistantRole
            ):
                if await asyncio.sleep(0.01, result=True):  # 非阻塞等待
                    collected_response.append(text_chunk)
                    yield {
                        "event": "message",
                        "data": json.dumps({"content": text_chunk})
                    }

            # 发送完成信号
            full_content = "".join(collected_response)
            if full_content:
                await append_messages(
                    db,
                    convo,
                    [{"role": request.assistantRole, "content": full_content}],
                )
            yield {
                "event": "done",
                "data": json.dumps({"content": "", "conversationId": conversation_id_local})
            }
        except Exception as e:
            yield {
                "event": "error",
                "data": json.dumps({"error": str(e)})
            }

    return EventSourceResponse(event_generator())
