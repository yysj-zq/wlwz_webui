import asyncio
import json
from collections.abc import AsyncIterator

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sse_starlette.sse import EventSourceResponse

from app.api.dependencies import get_current_user_optional
from app.api.schemas import ChatRequest
from app.core.logging import get_logger
from app.db.models import User
from app.db.session import get_db
from app.services.chat_service import generate_response, generate_response_stream
from app.services.conversation_service import append_messages, create_conversation, get_conversation

router = APIRouter()
logger = get_logger(__name__)


@router.post("/chat")
async def chat(
    request: ChatRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
) -> dict[str, str | int | None]:
    """执行非流式聊天对话。

    匿名用户不会创建会话；已登录用户会在需要时创建/复用会话并持久化消息。

    Args:
        request: 对话请求体。
        db: 数据库会话（依赖注入）。
        current_user: 当前用户（可为空，表示匿名）。

    Returns:
        包含模型响应文本与（如适用）会话 ID 的字典。

    Raises:
        HTTPException: 发生未预期错误时抛出 500。
    """
    is_anonymous = current_user is None
    conversation_id_in: int | None = request.conversationId
    try:
        if current_user is None:
            response = await generate_response(
                messages=request.messages,
                user_role=request.userRole,
                assistant_role=request.assistantRole,
            )
            return {"content": response, "response": response, "conversationId": None}

        conversation_id: int | None = request.conversationId
        if conversation_id is None:
            first_user_msg = next((m for m in request.messages if m.role != request.assistantRole), None)
            title = (
                (first_user_msg.content[:30] + ("..." if len(first_user_msg.content) > 30 else ""))
                if first_user_msg
                else "新的对话"
            )
            convo = await create_conversation(db, current_user, title)
            conversation_id = convo.id
        else:
            convo = await get_conversation(db, current_user, conversation_id)

        await append_messages(db, convo, [{"role": m.role, "content": m.content} for m in request.messages])
        response = await generate_response(
            messages=request.messages,
            user_role=request.userRole,
            assistant_role=request.assistantRole,
        )
        await append_messages(db, convo, [{"role": request.assistantRole, "content": response}])
        return {"content": response, "response": response, "conversationId": conversation_id}
    except Exception as e:
        logger.exception("[router] chat-error", is_anonymous=is_anonymous, conversation_id=conversation_id_in)
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.post("/chat/stream")
async def chat_stream(
    request: ChatRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_current_user_optional),
) -> EventSourceResponse:
    """执行流式聊天对话（SSE）。

    Args:
        request: 对话请求体。
        db: 数据库会话（依赖注入）。
        current_user: 当前用户（可为空，表示匿名）。

    Returns:
        SSE 响应，事件包括：message/done/error。
    """

    async def event_generator() -> AsyncIterator[dict[str, str]]:
        is_anonymous = current_user is None
        conversation_id_in: int | None = request.conversationId
        try:
            if current_user is None:
                async for text_chunk in generate_response_stream(
                    messages=request.messages,
                    user_role=request.userRole,
                    assistant_role=request.assistantRole,
                ):
                    if await asyncio.sleep(0.01, result=True):
                        yield {"event": "message", "data": json.dumps({"content": text_chunk})}
                yield {"event": "done", "data": json.dumps({"content": "", "conversationId": None})}
                return

            conversation_id = request.conversationId
            if conversation_id is None:
                first_user_msg = next((m for m in request.messages if m.role != request.assistantRole), None)
                title = (
                    (first_user_msg.content[:30] + ("..." if len(first_user_msg.content) > 30 else ""))
                    if first_user_msg
                    else "新的对话"
                )
                convo = await create_conversation(db, current_user, title)
                conversation_id_local = convo.id
            else:
                convo = await get_conversation(db, current_user, conversation_id)
                conversation_id_local = convo.id

            await append_messages(db, convo, [{"role": m.role, "content": m.content} for m in request.messages])
            collected_response: list[str] = []
            async for text_chunk in generate_response_stream(
                messages=request.messages,
                user_role=request.userRole,
                assistant_role=request.assistantRole,
            ):
                if await asyncio.sleep(0.01, result=True):
                    collected_response.append(text_chunk)
                    yield {"event": "message", "data": json.dumps({"content": text_chunk})}

            full_content = "".join(collected_response)
            if full_content:
                await append_messages(db, convo, [{"role": request.assistantRole, "content": full_content}])
            yield {"event": "done", "data": json.dumps({"content": "", "conversationId": conversation_id_local})}
        except Exception as e:
            logger.exception(
                "[router] chat_stream-error", is_anonymous=is_anonymous, conversation_id=conversation_id_in
            )
            yield {"event": "error", "data": json.dumps({"error": str(e)})}

    return EventSourceResponse(event_generator())
