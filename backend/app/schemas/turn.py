from datetime import datetime

from pydantic import Field

from app.schemas._alias import CamelModel
from app.schemas.world import TimelineEntry, WorldEntityPatch, WorldState


class GameActionRequest(CamelModel):
    """玩家动作请求体（game 模式：POST /conversations/{id}/actions）。"""

    conversation_id: int | None = Field(
        default=None,
        description="可选会话 ID（OpenAPI 字段名 conversationId）；为安全考虑必须与路径参数一致，否则返回 422。",
        examples=[1],
    )
    state_version: int = Field(
        ...,
        description=(
            "Expected world state version（OpenAPI 字段名 stateVersion）；if mismatched, returns 409 with current state。"
            "乐观锁：服务端会比对会话当前 stateVersion，不一致则返回 409，"
            "响应体为 ConflictResponse（code=STATE_VERSION_CONFLICT），客户端须读取 currentStateVersion 后重试。"
        ),
        examples=[12, 13],
    )
    # 行动主体 slug；默认 "player" 为注册表默认扮演角色，实际会话应以 worldState.playerActorId 为准。
    actor_id: str = Field(
        default="player",
        description='动作执行者实体 ID（OpenAPI 字段名 actorId，默认 "player"）。实际生效以 worldState.playerActorId 为准。',
        examples=["player", "baizhantang"],
    )
    speak: str | None = Field(default=None, description="本轮要说的话，可选。", examples=["我打开桌上的木盒。"])
    act_patch: list[WorldEntityPatch] = Field(
        default_factory=list,
        description="本轮对世界实体的变更集合（OpenAPI 字段名 actPatch）。",
        examples=[[{"entityId": "player", "position": {"x": 3, "y": 4}}]],
    )
    target_id: str | None = Field(
        default=None,
        description="本轮动作/说话的目标实体 ID（OpenAPI 字段名 targetId）。",
        examples=["table"],
    )


class ChatTurnRequest(CamelModel):
    """玩家对话请求体（chat 模式：POST /conversations/{id}/chat）。"""

    target_actor_id: str = Field(
        ...,
        description="对话目标 NPC 的实体 ID 或角色 slug（OpenAPI 字段名 targetActorId）。",
        examples=["baizhantang", "npc_xiaoyu"],
    )
    content: str = Field(
        ...,
        min_length=1,
        max_length=4096,
        description="本轮要说的话，注入 LLM 后生成目标 NPC 的回复。",
        examples=["堂主，昨夜究竟发生了什么？"],
    )
    state_version: int = Field(
        ...,
        description=(
            "Expected world state version（OpenAPI 字段名 stateVersion）；if mismatched, returns 409 with current state。"
            "乐观锁：服务端会比对会话当前 stateVersion，不一致则返回 409。"
        ),
        examples=[12, 13],
    )


class PlayedRoleRequest(CamelModel):
    """切换扮演角色请求：actorId 为任意 in_game 注册表 slug。"""

    actor_id: str = Field(
        ...,
        description="要切换的 in_game 角色 slug（OpenAPI 字段名 actorId）。",
        examples=["baizhantang", "npc_xiaoyu"],
    )


class EnsureConversationRequest(CamelModel):
    """创建或加载会话请求体。"""

    conversation_id: int | None = Field(
        default=None,
        description="已有会话 ID（OpenAPI 字段名 conversationId）；为空则创建新会话。",
        examples=[1],
    )
    title: str | None = Field(default=None, description="新会话标题（仅创建时生效）。", examples=["百战堂血案"])


class ConversationWorldRead(CamelModel):
    """会话 + 世界状态读模型。"""

    id: int | None = Field(default=None, description="会话主键 ID；首次创建前可能为 null。", examples=[1])
    map_id: str = Field(..., description="世界地图 ID（OpenAPI 字段名 mapId）。", examples=["tongfu_inn"])
    state_version: int = Field(..., description="当前世界状态版本号（OpenAPI 字段名 stateVersion）。", examples=[12])
    world_state: WorldState = Field(..., description="完整世界状态快照（OpenAPI 字段名 worldState）。")
    created_at: datetime | None = Field(default=None, description="创建时间（UTC ISO-8601）。")
    updated_at: datetime | None = Field(default=None, description="最近一次更新时间（UTC ISO-8601）。")


class TurnResponse(CamelModel):
    """单回合（game 动作 / chat 对话）返回体：含新世界状态与时间线增量。"""

    conversation_id: int | None = Field(
        default=None, description="所属会话 ID（OpenAPI 字段名 conversationId）。", examples=[1]
    )
    state_version: int = Field(
        ..., description="提交后的最新世界状态版本号（OpenAPI 字段名 stateVersion）。", examples=[13]
    )
    world_state: WorldState = Field(..., description="本回合后的完整世界状态（OpenAPI 字段名 worldState）。")
    timeline_delta: list[TimelineEntry] = Field(
        default_factory=list,
        description="本回合产生的时间线增量条目（OpenAPI 字段名 timelineDelta）。",
    )
    narration: str | None = Field(
        default=None,
        description="场景/动作的中文旁白摘要（无变更时可能为空）。",
        examples=["木盒被打开，露出里面的一封血书。"],
    )


class ConflictResponse(CamelModel):
    """409 乐观锁冲突响应体：客户端用 ``worldState`` 重渲染。

    - ``code`` 固定为 ``"STATE_VERSION_CONFLICT"``，便于前端 if/else。
    - ``currentStateVersion`` 与 ``worldState.stateVersion`` 同值，
      冗余出来仅为方便客户端单独读这一字段（不必深挖 worldState）。
    """

    code: str = Field(..., description='错误码，固定为 "STATE_VERSION_CONFLICT"。', examples=["STATE_VERSION_CONFLICT"])
    current_state_version: int = Field(
        ...,
        description="服务端当前的世界状态版本号（OpenAPI 字段名 currentStateVersion；与 worldState.stateVersion 同值）。",
        examples=[14],
    )
    world_state: WorldState = Field(
        ...,
        description="服务端当前完整世界状态（OpenAPI 字段名 worldState），客户端应使用此快照重渲染。",
    )
