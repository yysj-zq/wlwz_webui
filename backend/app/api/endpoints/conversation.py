"""Conversation 域 router：CRUD + timeline + world 视图 + 玩家动作 + chat。

终态 URL（chat / actions 共用同一 conversation，都经 TurnGraph）：
- POST   /conversations                       创建（自带初始世界）
- GET    /conversations                       列表
- DELETE /conversations/{id}
- POST   /conversations/{id}/rename
- GET    /conversations/{id}/world            世界状态视图
- GET    /conversations/{id}/timeline         统一时间线
- POST   /conversations/{id}/actions          玩家动作（game 模式，走 Director）
- POST   /conversations/{id}/chat             对话（chat 模式，跳过 Director）
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user
from app.schemas import (
    ChatTurnRequest,
    ConversationOut,
    ConversationRename,
    ConversationWorldRead,
    EnsureConversationRequest,
    GameActionRequest,
    TimelineEntryOut,
    TurnResponse,
)
from app.models import User
from app.core.database import get_db
from app.services import timeline_service
from app.services.conversation_service import (
    delete_conversation,
    get_conversation,
    list_conversations,
    rename_conversation,
)
from app.graph.runner import run_game, run_chat
from app.services.world_service import (
    WorldController,
    deserialize_world_state,
    ensure_conversation_world,
)

router = APIRouter()


@router.post("/conversations", response_model=ConversationWorldRead)
async def create_or_load_conversation(
    payload: EnsureConversationRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ConversationWorldRead:
    """创建或加载 conversation；首次创建时同步播种 NPC 心智 + 开场旁白。"""
    try:
        conversation, world_state = await ensure_conversation_world(
            db=db,
            user=current_user,
            conversation_id=payload.conversationId,
            title=payload.title,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return ConversationWorldRead(
        id=conversation.id if conversation else None,
        map_id=world_state.map_id,
        state_version=world_state.state_version,
        world_state=world_state,
        created_at=conversation.created_at if conversation else None,
        updated_at=conversation.updated_at if conversation else None,
    )


@router.get("/conversations", response_model=list[ConversationOut])
async def list_my_conversations(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[ConversationOut]:
    convos = await list_conversations(db, current_user)
    return [ConversationOut.model_validate(c) for c in convos]


@router.delete(
    "/conversations/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def remove_conversation(
    conversation_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    try:
        await delete_conversation(db, current_user, conversation_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post(
    "/conversations/{conversation_id}/rename", response_model=ConversationOut
)
async def rename_conversation_endpoint(
    conversation_id: int,
    payload: ConversationRename,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ConversationOut:
    try:
        convo = await rename_conversation(
            db, current_user, conversation_id, payload.title
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return ConversationOut.model_validate(convo)


@router.get(
    "/conversations/{conversation_id}/world", response_model=ConversationWorldRead
)
async def read_conversation_world(
    conversation_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ConversationWorldRead:
    try:
        convo = await get_conversation(db, current_user, conversation_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return ConversationWorldRead(
        id=convo.id,
        map_id=convo.map_id,
        state_version=convo.state_version,
        world_state=deserialize_world_state(convo.world_state_json),
        created_at=convo.created_at,
        updated_at=convo.updated_at,
    )


@router.get(
    "/conversations/{conversation_id}/timeline",
    response_model=list[TimelineEntryOut],
)
async def list_conversation_timeline(
    conversation_id: int,
    after_id: int | None = None,
    limit: int | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[TimelineEntryOut]:
    """统一时间线：chat speak / game act / scene 旁白共表。前端按 kind 过滤。"""
    try:
        await get_conversation(db, current_user, conversation_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    entries = await timeline_service.list_timeline(
        db, conversation_id, after_id=after_id, limit=limit
    )
    return [
        TimelineEntryOut(
            id=e.id or 0,
            turn_id=e.turn_id,
            intra_turn_seq=e.intra_turn_seq,
            actor_id=e.actor_id,
            kind=e.kind or "speak",
            speak=e.speak,
            target_id=e.target_id,
            act_patch=e.act_patch.model_dump(mode="json") if e.act_patch else None,
            created_at=e.created_at,  # type: ignore[arg-type]
        )
        for e in entries
    ]


@router.post(
    "/conversations/{conversation_id}/actions",
    response_model=TurnResponse,
)
async def game_action_endpoint(
    conversation_id: int,
    payload: GameActionRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TurnResponse:
    """玩家动作（game 模式）：经 TurnGraph 完整 director → fan_out_npcs → commit。"""
    if payload.conversationId not in (None, conversation_id):
        raise HTTPException(status_code=422, detail="payload.conversationId 与路径不一致")
    request = payload.model_copy(update={"conversationId": conversation_id})
    try:
        conversation, world_state = await ensure_conversation_world(
            db, current_user, conversation_id, title="新的游戏会话"
        )
        controller = WorldController(db=db, conversation=conversation, world_state=world_state)
        return await run_game(controller, request)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.post(
    "/conversations/{conversation_id}/chat",
    response_model=TurnResponse,
)
async def chat_endpoint(
    conversation_id: int,
    payload: ChatTurnRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TurnResponse:
    """对话（chat 模式）：ingest 节点直接构造 dispatch_override，跳过 Director。"""
    try:
        conversation, world_state = await ensure_conversation_world(
            db, current_user, conversation_id, title="新的对话"
        )
        controller = WorldController(db=db, conversation=conversation, world_state=world_state)
        return await run_chat(controller, conversation_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
