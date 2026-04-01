from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user
from app.api.schemas.conversation import ConversationOut, ConversationRename, MessageOut
from app.db.models import Message, User
from app.db.session import get_db
from app.services.conversation_service import (
    delete_conversation,
    get_conversation,
    list_conversations,
    rename_conversation,
)

router = APIRouter()


@router.get("/conversations", response_model=list[ConversationOut])
async def list_my_conversations(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[ConversationOut]:
    """获取当前用户的会话列表。"""
    convos = await list_conversations(db, current_user)
    return [ConversationOut.model_validate(c) for c in convos]


@router.delete("/conversations/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_conversation(
    conversation_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    """删除指定会话。"""
    try:
        await delete_conversation(db, current_user, conversation_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/conversations/{conversation_id}/rename", response_model=ConversationOut)
async def rename_conversation_endpoint(
    conversation_id: int,
    payload: ConversationRename,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ConversationOut:
    """重命名指定会话。"""
    try:
        convo = await rename_conversation(db, current_user, conversation_id, payload.title)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return ConversationOut.model_validate(convo)


@router.get("/conversations/{conversation_id}/messages", response_model=list[MessageOut])
async def list_conversation_messages(
    conversation_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[MessageOut]:
    """获取指定会话的消息列表。"""
    try:
        convo = await get_conversation(db, current_user, conversation_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    messages: list[Message] = convo.messages
    return [MessageOut(id=m.id, role=m.role, content=m.content, created_at=m.created_at) for m in messages]
