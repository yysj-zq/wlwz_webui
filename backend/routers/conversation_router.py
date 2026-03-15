from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from db import get_db
from models.db_models import Conversation, Message, User
from services.models import ConversationOut, ConversationRename, MessageOut
from services.conversation_service import (
    append_messages,
    create_conversation,
    delete_conversation,
    get_conversation,
    list_conversations,
    rename_conversation,
)
from utils.security import get_current_user


router = APIRouter()


@router.get("/conversations", response_model=List[ConversationOut])
async def list_my_conversations(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> List[ConversationOut]:
    convos = await list_conversations(db, current_user)
    return [ConversationOut.model_validate(c) for c in convos]


@router.delete("/conversations/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_conversation(
    conversation_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    try:
        await delete_conversation(db, current_user, conversation_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.post("/conversations/{conversation_id}/rename", response_model=ConversationOut)
async def rename_conversation_endpoint(
    conversation_id: int,
    payload: ConversationRename,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ConversationOut:
    try:
        convo = await rename_conversation(
            db,
            current_user,
            conversation_id,
            payload.title,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return ConversationOut.model_validate(convo)


@router.get(
    "/conversations/{conversation_id}/messages",
    response_model=list[MessageOut],
)
async def list_conversation_messages(
    conversation_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[MessageOut]:
    try:
        convo = await get_conversation(db, current_user, conversation_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    messages: list[Message] = convo.messages
    return [
        MessageOut(
            id=m.id,
            role=m.role,
            content=m.content,
            created_at=m.created_at,
        )
        for m in messages
    ]

