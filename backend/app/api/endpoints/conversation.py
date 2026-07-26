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

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user
from app.core import get_db
from app.graph import run_chat, run_game
from app.models import User
from app.schemas import (
    ChatTurnRequest,
    ConflictResponse,
    ConversationOut,
    ConversationRename,
    ConversationWorldRead,
    EnsureConversationRequest,
    GameActionRequest,
    PlayedRoleRequest,
    TimelineEntry,
    TurnResponse,
    WorldState,
)
from app.services import (
    WorldController,
    delete_conversation,
    ensure_chat_target_entity,
    ensure_conversation_world,
    get_conversation,
    list_conversations,
    rename_conversation,
    switch_played_role,
    timeline_service,
)

router = APIRouter()


@router.post(
    "/conversations",
    response_model=ConversationWorldRead,
    response_model_by_alias=True,
    tags=["Conversation"],
    summary="创建或加载会话（带世界状态）",
    description=(
        "幂等创建/加载会话。\n\n"
        "- 若 `conversationId` 为空则创建新会话，并同步生成初始世界（场景、NPC、心智、开门旁白）。\n"
        "- 若 `conversationId` 不为空则加载该会话及其当前世界状态。\n"
        "- 若 `conversationId` 不存在或不属于当前用户：返回 404。\n\n"
        "返回体同时携带会话基本信息与世界快照，前端可直接定位玩家 actor 与世界状态版本。"
    ),
    response_description="会话信息与当前世界状态快照。",
    responses={
        404: {"description": "指定 conversationId 不存在或不属于当前用户。"},
        422: {"description": "请求体字段类型不合法。"},
    },
)
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
            conversation_id=payload.conversation_id,
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


@router.get(
    "/conversations",
    response_model=list[ConversationOut],
    response_model_by_alias=True,
    tags=["Conversation"],
    summary="列出当前用户所有会话",
    description="返回当前登录用户拥有的全部会话（不含会话体内容），按更新时间倒序。",
    response_description="会话摘要列表。",
    responses={
        401: {"description": "未提供有效 JWT。"},
    },
)
async def list_my_conversations(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[ConversationOut]:
    convos = await list_conversations(db, current_user)
    return [ConversationOut.model_validate(c) for c in convos]


@router.delete(
    "/conversations/{conversation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["Conversation"],
    summary="删除指定会话",
    description=(
        "硬删除当前用户的指定 conversation，连带其世界状态、时间线、记忆一并清理。\n\n"
        "若 conversationId 不存在或不属于当前用户：返回 404。"
    ),
    response_description="删除成功，无响应体。",
    responses={
        204: {"description": "删除成功。"},
        404: {"description": "指定 conversationId 不存在或不属于当前用户。"},
    },
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
    "/conversations/{conversation_id}/rename",
    response_model=ConversationOut,
    response_model_by_alias=True,
    tags=["Conversation"],
    summary="重命名会话",
    description="更新指定会话的标题。若会话不存在或不属于当前用户：返回 404。",
    response_description="更新后的会话摘要。",
    responses={
        404: {"description": "指定 conversationId 不存在或不属于当前用户。"},
        422: {"description": "请求体字段类型不合法。"},
    },
)
async def rename_conversation_endpoint(
    conversation_id: int,
    payload: ConversationRename,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ConversationOut:
    try:
        convo = await rename_conversation(db, current_user, conversation_id, payload.title)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return ConversationOut.model_validate(convo)


@router.get(
    "/conversations/{conversation_id}/world",
    response_model=ConversationWorldRead,
    response_model_by_alias=True,
    tags=["Conversation"],
    summary="获取会话世界状态快照",
    description=(
        "返回会话当前世界视图，包含 `mapId`、`stateVersion`、完整 `worldState`（实体、坐标、\n"
        "公开状态）以及会话时间戳。前端可用于首屏渲染世界场景与位置。"
    ),
    response_description="会话世界状态快照。",
    responses={
        404: {"description": "指定 conversationId 不存在或不属于当前用户。"},
    },
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
        world_state=WorldState.model_validate(convo.world_state_json),
        created_at=convo.created_at,
        updated_at=convo.updated_at,
    )


@router.post(
    "/conversations/{conversation_id}/played-role",
    response_model=ConversationWorldRead,
    response_model_by_alias=True,
    tags=["Conversation"],
    summary="切换会话中的扮演角色",
    description=(
        "将 `player_actor_id` 切换为指定 actor（须为 in_game 注册表中的合法 slug），\n"
        "并就地翻转该实体的 kind（player/npc），保留会话现有世界状态。\n\n"
        "- 不重建世界，已有时间线 / 记忆 / 心智不受影响。\n"
        "- 若 conversationId 不存在或不属于当前用户：返回 404。\n"
        "- 若 actorId 不在 in_game 注册表中：返回 400。"
    ),
    response_description="切换后的会话世界快照（包含新 player_actor_id）。",
    responses={
        400: {"description": "actorId 不在 in_game 注册表或请求体不合法。"},
        404: {"description": "指定 conversationId 不存在或不属于当前用户。"},
    },
)
async def set_played_role_endpoint(
    conversation_id: int,
    payload: PlayedRoleRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ConversationWorldRead:
    """切换扮演角色：更新 player_actor_id 并就地翻转实体 kind，保留会话境况（不重建世界）。"""
    try:
        convo = await get_conversation(db, current_user, conversation_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    try:
        world_state = await switch_played_role(db, convo, payload.actor_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return ConversationWorldRead(
        id=convo.id,
        map_id=convo.map_id,
        state_version=convo.state_version,
        world_state=world_state,
        created_at=convo.created_at,
        updated_at=convo.updated_at,
    )


@router.get(
    "/conversations/{conversation_id}/timeline",
    response_model=list[TimelineEntry],
    response_model_by_alias=True,
    tags=["Conversation"],
    summary="获取会话统一时间线",
    description=(
        "返回该会话的时间线增量（按 id 升序），混含 `speak` / `act` / `speak_and_act` / `scene` 四类条目。\n\n"
        "- `afterId`（可选）仅返回 id > afterId 的条目，用于增量轮询。\n"
        "- `limit`（可选）限制返回条数上限。\n"
        "- 前端按 `kind` 过滤后渲染不同视觉样式。\n"
        "- 条目类型与 TurnResponse.timelineDelta 一致：`TimelineEntry`（含强类型 `actPatch`）。"
    ),
    response_description="时间线条目列表（TimelineEntry[]）。",
    responses={
        404: {"description": "指定 conversationId 不存在或不属于当前用户。"},
        422: {"description": "afterId / limit 参数类型不合法。"},
    },
)
async def list_conversation_timeline(
    conversation_id: int,
    after_id: int | None = Query(None, alias="afterId"),
    limit: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[TimelineEntry]:
    """统一时间线：chat speak / game act / scene 旁白共表。前端按 kind 过滤。"""
    try:
        await get_conversation(db, current_user, conversation_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return await timeline_service.list_timeline(db, conversation_id, after_id=after_id, limit=limit)


@router.post(
    "/conversations/{conversation_id}/actions",
    response_model=TurnResponse,
    response_model_by_alias=True,
    tags=["Conversation"],
    summary="玩家动作（game 模式）",
    description=(
        "玩家在 game 模式下的一次动作提交。流程：Director 调度 → fan_out_npcs → commit。\n\n"
        "请求体支持：\n"
        "- `speak`：本轮要说的话。\n"
        "- `actPatch`：本轮对世界实体的变更（移动、改坐标、改 publicState 等）。\n"
        "- `stateVersion`（必填）：乐观锁版本。若与当前服务端 stateVersion 不一致，\n"
        "  返回 **409**，响应体为 ConflictResponse（`code` / `currentStateVersion` / `worldState`），"
        "客户端应读取 `currentStateVersion` 后重试。\n"
        '- `targetId` / `actorId`：目标实体与动作主体（默认 `"player"`）。\n\n'
        "常见错误：\n"
        "- 404：会话不存在或不属于当前用户（懒加载时也会自动创建）。\n"
        "- 409：stateVersion 冲突（仅 STATE_VERSION_CONFLICT）。\n"
        "- 422：Director 拒绝的世界变更（如越界、非法 patch）、`conversationId` 与路径不一致，或字段类型错误。"
    ),
    response_description="本轮动作提交后的世界状态与时间线增量。",
    responses={
        401: {"description": "未提供有效 JWT。"},
        404: {"description": "指定 conversationId 不存在或不属于当前用户。"},
        409: {
            "model": ConflictResponse,
            "description": (
                "STATE_VERSION_CONFLICT：stateVersion 与服务端不一致。"
                "响应体为 ConflictResponse（camelCase：code / currentStateVersion / worldState）。"
            ),
        },
        422: {"description": "Director 拒绝本轮 worldWrites、conversationId 与路径不一致，或字段类型不合法。"},
    },
)
async def game_action_endpoint(
    conversation_id: int,
    payload: GameActionRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TurnResponse:
    """玩家动作（game 模式）：经 TurnGraph 完整 director → fan_out_npcs → commit。

    乐观锁：客户端必须传 ``stateVersion``，与 DB 当前版本不一致则 409。
    """
    if payload.conversation_id not in (None, conversation_id):
        raise HTTPException(status_code=422, detail="payload.conversationId 与路径不一致")
    request = payload.model_copy(update={"conversation_id": conversation_id})
    try:
        conversation, world_state = await ensure_conversation_world(
            db, current_user, conversation_id, title="新的游戏会话"
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    if conversation is None:
        raise HTTPException(status_code=401, detail="需要登录")
    controller = WorldController(db=db, conversation=conversation, world_state=world_state)
    # 跑图前乐观锁：版本不一致直接 409，不再开 director / LLM 浪费预算。
    await controller.commit(expected_state_version=payload.state_version)
    try:
        return await run_game(controller, request)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post(
    "/conversations/{conversation_id}/chat",
    response_model=TurnResponse,
    response_model_by_alias=True,
    tags=["Conversation"],
    summary="对话回合（chat 模式）",
    description=(
        "玩家在 chat 模式下的普通对话回合。与 game 模式的区别：\n"
        "- 不走 Director，直接构造 `dispatch_override` 交由 ingest → fan_out_npcs → commit。\n"
        "- 若 `targetActorId` 是当前用户合法注册表角色但当前不在世界实体中（典型为自定义角色），\n"
        "  会惰性补入 NPC 实体并播种心智，避免 npc 节点静默空回复。\n\n"
        "错误：\n"
        "- 400：targetActorId 不在合法注册表中。\n"
        "- 401：未登录。\n"
        "- 404：会话不存在或不属于当前用户。\n"
        "- 409：stateVersion 冲突；响应体为 ConflictResponse"
        "（`code` / `currentStateVersion` / `worldState`）。\n"
        "- 422：回合处理拒绝（非法 patch 等），或请求体字段类型不合法。"
    ),
    response_description="本轮对话回合后的世界状态与时间线增量。",
    responses={
        400: {"description": "targetActorId 不在用户合法角色注册表中。"},
        401: {"description": "未提供有效 JWT。"},
        404: {"description": "指定 conversationId 不存在或不属于当前用户。"},
        409: {
            "model": ConflictResponse,
            "description": (
                "STATE_VERSION_CONFLICT：stateVersion 与服务端不一致。"
                "响应体为 ConflictResponse（camelCase：code / currentStateVersion / worldState）。"
            ),
        },
        422: {"description": "回合处理拒绝（非法 patch 等），或请求体字段类型不合法。"},
    },
)
async def chat_endpoint(
    conversation_id: int,
    payload: ChatTurnRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TurnResponse:
    """对话（chat 模式）：ingest 节点直接构造 dispatch_override，跳过 Director。

    chat 目标健壮化：若 targetActorId 是该用户合法注册表角色但当前不在世界实体中
    （典型为自定义角色），先惰性补入 NPC 实体并播种心智，避免 npc 节点静默空回复。

    乐观锁：客户端必须传 ``stateVersion``，与 DB 当前版本不一致则 409。
    """
    try:
        conversation, world_state = await ensure_conversation_world(db, current_user, conversation_id, title="新的对话")
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    if conversation is None:
        raise HTTPException(status_code=401, detail="需要登录")
    controller = WorldController(db=db, conversation=conversation, world_state=world_state)
    # 先乐观锁刷新内存 world（commit 会用 DB 覆盖）；再惰性补实体，否则补入会被冲掉。
    await controller.commit(expected_state_version=payload.state_version)
    try:
        await ensure_chat_target_entity(db, current_user, controller, payload.target_actor_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    try:
        return await run_chat(controller, conversation_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
