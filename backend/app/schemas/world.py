from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import ConfigDict, Field, model_validator

from app.schemas._alias import CamelModel
from app.schemas.enums import Direction, EntityKind, MemoryScope, TimelineKind


class Position(CamelModel):
    """世界实体在地图上的坐标。"""

    x: int = Field(..., description="Tile x 坐标（当前地图的瓦片坐标系，原点左上，x 向右增长）。", examples=[3])
    y: int = Field(..., description="Tile y 坐标（当前地图的瓦片坐标系，原点左上，y 向下增长）。", examples=[4])


class WorldEntity(CamelModel):
    """世界实体：player / npc / object 之一。"""

    id: str = Field(
        ..., description="实体唯一 ID，在同一 WorldState 内唯一。", examples=["baizhantang", "player", "table"]
    )
    name: str = Field(..., description="展示用中文名，供时间线与 UI 渲染使用。", examples=["百战堂", "玩家"])
    kind: EntityKind = Field(
        ..., description="实体类型：player（主角）/ npc（LLM 驱动）/ object（物件）。", examples=["npc"]
    )
    position: Position = Field(..., description="Tile coordinates (x, y) in the current map。")
    asset_key: str | None = Field(
        default=None,
        description="Asset key for sprite/atlas lookup; null uses default placeholder。",
        examples=["sprite/baizhantang.png"],
    )
    direction: Direction | None = Field(
        default=None,
        description="当前朝向（北/南/东/西）；未设置时渲染层使用默认朝南。",
        examples=["north"],
    )
    public_state: dict[str, Any] = Field(
        default_factory=dict,
        description='对所有角色可见的公开状态，如 {"mood": "angry", "hp": 80}。',
        examples=[{"mood": "happy"}],
    )
    interactable: bool = Field(default=False, description="是否可被玩家交互（点击/对话/使用）。", examples=[True])


class WorldState(CamelModel):
    """完整世界状态：地图 + 实体表 + 元信息。"""

    map_id: str = Field(..., description="世界地图 ID（OpenAPI 字段名 mapId）。", examples=["tongfu_inn"])
    state_version: int = Field(
        ...,
        description="Monotonically increasing world state version（OpenAPI 字段名 stateVersion）；clients use this for optimistic locking。",
        examples=[12],
    )
    # 当前人类可控 actor 的 slug，须为 in_game 注册表条目（默认 "player" 亦须在注册表中）。
    player_actor_id: str = Field(
        default="player",
        description="当前人类可控 actor 的 slug（OpenAPI 字段名 playerActorId），须为 in_game 注册表条目。",
        examples=["player"],
    )
    entities: dict[str, WorldEntity] = Field(
        ...,
        description="实体 ID → 实体对象的映射。",
        examples=[{"player": {"id": "player", "name": "玩家", "kind": "player", "position": {"x": 3, "y": 4}}}],
    )

    def name_lookup(self) -> dict[str, str]:
        """实体 id → 中文名映射，供时间线渲染把 id 翻成人类可读名。"""
        return {eid: e.name for eid, e in self.entities.items()}


class WorldEntityPatch(CamelModel):
    """对世界实体的局部变更：只更新提供的字段。"""

    entity_id: str = Field(..., description="要修改的实体 id，如 baizhantang、player、table", examples=["player"])
    position: Position | None = Field(default=None, description="新坐标 {x, y}，不移动则不传")
    direction: Direction | None = Field(default=None, description="新朝向，不改则不传")
    interactable: bool | None = Field(default=None, description="是否可交互")
    public_state: dict[str, Any] | None = Field(default=None, description='要更新的公开状态，如 {"mood": "happy"}')

    # extra="forbid" 与父类 CamelModel 的别名/orm 模式合并：拒绝一切未声明字段，
    # 防止 LLM 在 actPatch 里塞入意料外的键污染世界状态。
    model_config = ConfigDict(extra="forbid")


class TimelineEntry(CamelModel):
    """统一时间线条目：speak / act / speak_and_act / scene。"""

    id: int | None = Field(default=None, description="时间线条目主键 ID，新建时为 null。", examples=[42])
    turn_id: str = Field(..., description="所属 turn 的唯一 ID（用于去重/分组）。", examples=["turn_01HXY..."])
    intra_turn_seq: int = Field(
        default=-1, description="同一 turn 内的顺序号，越小越靠前；-1 表示自动分配。", examples=[0]
    )
    actor_id: str | None = Field(
        default=None, description="执行本条目的 actor 实体 ID（scene 旁白时为 null）。", examples=["baizhantang"]
    )
    kind: TimelineKind | None = Field(
        default=None,
        description="条目类型：speak / act / speak_and_act / scene；为空时由 _fill_kind 自动推断。",
        examples=["speak"],
    )
    speak: str | None = Field(
        default=None,
        description="说话内容（kind=speak / speak_and_act 时有值）。",
        examples=["我闻到了一股淡淡的血腥味。"],
    )
    act_patch: list[WorldEntityPatch] = Field(
        default_factory=list,
        description="本条目触发的世界实体变更集合（OpenAPI 字段名 actPatch）。",
        examples=[[{"entityId": "player", "position": {"x": 3, "y": 4}}]],
    )
    target_id: str | None = Field(default=None, description="对谁说话或对哪个实体施加动作。", examples=["player"])
    narration: str | None = Field(
        default=None, description="场景/动作的旁白描述（中文）。", examples=["一阵冷风从门缝灌入。"]
    )
    created_at: datetime | None = Field(default=None, description="创建时间（UTC ISO-8601）。")

    @model_validator(mode="after")
    def _fill_kind(self) -> TimelineEntry:
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


class Perceiver(CamelModel):
    """感知者：声明哪些 actor 在本回合能\"看到\"世界变更。"""

    actor_id: str = Field(..., description="感知者实体 ID。", examples=["baizhantang"])
    perception_reason: str = Field(
        ..., description="为什么此 actor 能感知到本轮变更（供 LLM 心智使用）。", examples=["同桌共饮，目睹现场"]
    )


class DirectorDispatch(CamelModel):
    """Director 节点的调度输出：世界变更 + 感知者 + 旁白。"""

    world_writes: list[WorldEntityPatch] = Field(
        default_factory=list,
        description="本回合对世界实体的变更集合（OpenAPI 字段名 worldWrites）。",
        examples=[[{"entityId": "player", "position": {"x": 3, "y": 4}}]],
    )
    perceivers: list[Perceiver] = Field(
        default_factory=list,
        description="本回合的感知者列表；未列出的 NPC 不会感知到变更。",
    )
    narration: str | None = Field(
        default=None,
        description="worldWrites 的中文映射，描述发生了什么，如「门被推开，一阵冷风灌进屋里」；无改动可不传",
        examples=["门被推开，一阵冷风灌进屋里。"],
    )


class MemoryWrite(CamelModel):
    """NPC 心智写入：单条新记忆。"""

    content: str = Field(description="要记住的事实，一句话", examples=["堂主昨夜不在场"])
    importance: int = Field(default=1, ge=1, le=5, description="重要程度 1-5（5 最高，触发 long_term 记忆）。")
    scope: MemoryScope = Field(default=MemoryScope.SHORT_TERM, description="short_term 或 long_term")


class GoalPatch(CamelModel):
    """NPC 当前目标的局部更新。"""

    current: str | None = Field(default=None, description="当前目标描述", examples=["追查血案真相"])
    strategy: str | None = Field(default=None, description="达成目标的策略", examples=["先排查在场人员"])
    priority: int = Field(default=1, ge=1, le=5, description="优先级 1-5（5 最高）。")


class InventoryOp(CamelModel):
    """NPC 物品库存变更操作。"""

    item_id: str = Field(description="物品 id（OpenAPI 字段名 itemId）", examples=["key_yin"])
    delta: int = Field(description="数量变化，正数获得负数失去", examples=[1])
    reason: str | None = Field(default=None, description="原因", examples=["从桌上拾取"])


class NPCResponse(CamelModel):
    """单个 NPC 对本回合的完整响应。"""

    speak: str | None = Field(default=None, description="NPC 说的话。", examples=["我闻到了一股淡淡的血腥味。"])
    act_patch: list[WorldEntityPatch] = Field(
        default_factory=list,
        description="NPC 触发的世界实体变更集合（OpenAPI 字段名 actPatch）。",
        examples=[[{"entityId": "player", "direction": "north"}]],
    )
    narration: str | None = Field(
        default=None,
        description="actPatch 的中文映射",
        examples=["桌边的蜡烛被风吹灭。"],
    )
    memory_writes: list[MemoryWrite] = Field(default_factory=list, description="本回合要写入 NPC 心智的记忆。")
    goal_update: GoalPatch | None = Field(default=None, description="可选的 NPC 目标更新。")
    inventory_ops: list[InventoryOp] = Field(default_factory=list, description="物品库存变更。")


class TurnContext(CamelModel):
    """单回合上下文：摘要 + 近期时间线。"""

    digest: str = Field(..., description="近期世界的简要摘要，供 LLM 快速回神。", examples=["玩家与百战堂在堂内对话。"])
    timeline: list[TimelineEntry] = Field(default_factory=list, description="近期时间线条目，用于上下文回顾。")


class CommittedTurn(CamelModel):
    """已提交的回合：含新世界状态 + 时间线增量 + 旁白。"""

    world_state: WorldState = Field(..., description="本回合提交后的完整世界状态（OpenAPI 字段名 worldState）。")
    timeline_delta: list[TimelineEntry] = Field(
        default_factory=list, description="本回合产生的时间线增量（OpenAPI 字段名 timelineDelta）。"
    )
    narration: str | None = Field(
        default=None, description="场景/动作的中文旁白摘要。", examples=["门被推开，堂内陷入沉默。"]
    )
