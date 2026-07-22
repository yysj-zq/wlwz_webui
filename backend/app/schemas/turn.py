from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.world import TimelineEntry, WorldEntityPatch, WorldState


class GameActionRequest(BaseModel):
    conversationId: int | None = None
    stateVersion: int | None = None
    # 行动主体 slug；默认 "player" 为注册表默认扮演角色，实际会话应以 world_state.player_actor_id 为准。
    actorId: str = "player"
    speak: str | None = None
    act_patch: list[WorldEntityPatch] = Field(default_factory=list)
    targetId: str | None = None


class ChatTurnRequest(BaseModel):
    targetActorId: str
    content: str


class PlayedRoleRequest(BaseModel):
    """切换扮演角色请求：actorId 为任意 in_game 注册表 slug。"""

    actorId: str


class EnsureConversationRequest(BaseModel):
    conversationId: int | None = None
    title: str | None = None


class ConversationWorldRead(BaseModel):
    id: int | None
    map_id: str
    state_version: int
    world_state: WorldState
    created_at: datetime | None = None
    updated_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class TurnResponse(BaseModel):
    conversationId: int | None
    stateVersion: int
    world_state: WorldState
    timeline_delta: list[TimelineEntry] = Field(default_factory=list)
    narration: str | None = None
