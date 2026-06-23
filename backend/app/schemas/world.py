from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.enums import Direction, EntityKind, MemoryScope, TimelineKind

PLAYER = "player"


class Position(BaseModel):
    x: int
    y: int


class WorldEntity(BaseModel):
    id: str
    name: str
    kind: EntityKind
    position: Position
    asset_key: str | None = None
    direction: Direction | None = None
    public_state: dict[str, Any] = Field(default_factory=dict)
    interactable: bool = False


class WorldState(BaseModel):
    map_id: str
    state_version: int
    player_actor_id: str = PLAYER
    entities: dict[str, WorldEntity]


class WorldEntityPatch(BaseModel):
    entity_id: str = Field(description="要修改的实体 id，如 baizhantang、player、table")
    position: Position | None = Field(default=None, description="新坐标 {x, y}，不移动则不传")
    direction: Direction | None = Field(default=None, description="新朝向，不改则不传")
    interactable: bool | None = Field(default=None, description="是否可交互")
    public_state: dict[str, Any] | None = Field(default=None, description="要更新的公开状态，如 {\"mood\": \"happy\"}")

    model_config = ConfigDict(extra="forbid")


class TimelineEntry(BaseModel):
    id: int | None = None
    turn_id: str
    intra_turn_seq: int = -1
    actor_id: str | None = None
    kind: TimelineKind | None = None
    speak: str | None = None
    act_patch: list[WorldEntityPatch] = Field(default_factory=list)
    target_id: str | None = None
    created_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)

    @model_validator(mode="after")
    def _fill_kind(self) -> "TimelineEntry":
        if self.kind is not None:
            return self
        if self.actor_id is None:
            self.kind = TimelineKind.SCENE
            return self
        if self.speak and self.act_patch:
            self.kind = TimelineKind.SPEAK_AND_ACT
        elif self.act_patch:
            self.kind = TimelineKind.ACT
        else:
            self.kind = TimelineKind.SPEAK
        return self


class Perceiver(BaseModel):
    actor_id: str
    perception_reason: str


class DirectorDispatch(BaseModel):
    world_writes: list[WorldEntityPatch] = Field(default_factory=list)
    perceivers: list[Perceiver] = Field(default_factory=list)


class MemoryWrite(BaseModel):
    content: str = Field(description="要记住的事实，一句话")
    importance: int = Field(default=1, ge=1, le=5, description="重要程度 1-5")
    scope: MemoryScope = Field(default=MemoryScope.SHORT_TERM, description="short_term 或 long_term")


class GoalPatch(BaseModel):
    current: str | None = Field(default=None, description="当前目标描述")
    strategy: str | None = Field(default=None, description="达成目标的策略")
    priority: int = Field(default=1, ge=1, le=5, description="优先级 1-5")


class InventoryOp(BaseModel):
    item_id: str = Field(description="物品 id")
    delta: int = Field(description="数量变化，正数获得负数失去")
    reason: str | None = Field(default=None, description="原因")


class NPCResponse(BaseModel):
    speak: str | None = None
    act_patch: list[WorldEntityPatch] = Field(default_factory=list)
    memory_writes: list[MemoryWrite] = Field(default_factory=list)
    goal_update: GoalPatch | None = None
    inventory_ops: list[InventoryOp] = Field(default_factory=list)


class TurnContext(BaseModel):
    digest: str
    timeline: list[TimelineEntry] = Field(default_factory=list)


class CommittedTurn(BaseModel):
    world_state: WorldState
    timeline_delta: list[TimelineEntry] = Field(default_factory=list)
    narration: str | None = None
