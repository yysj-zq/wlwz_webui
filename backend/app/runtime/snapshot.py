"""会话快照：可深拷贝分叉的纯数据状态。"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.contract_check import load_lock
from app.schemas import TimelineEntry, TimelineKind, WorldState
from app.services import roles_service
from app.services.world_service import (
    DEFAULT_PLAYED_SLUG,
    INITIAL_SCENE_NOTE,
    build_world_state,
)


class MindState(BaseModel):
    """内存心智，字段对齐 ActorMind 持久化列。"""

    persona: str = ""
    relations: dict[str, str] = Field(default_factory=dict)
    memories: list[dict[str, Any]] = Field(default_factory=list)
    goal: dict[str, Any] = Field(default_factory=dict)
    inventory: dict[str, Any] = Field(default_factory=dict)


class SnapshotMeta(BaseModel):
    """快照元数据：种子 / run 谱系 / 契约盖章。"""

    seed_id: str
    run_id: str
    parent_run_id: str | None = None
    contract_fingerprint: str
    contract_version: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class SessionSnapshot(BaseModel):
    """无头 runtime 的分叉单位：world + minds + timeline + digest + meta。"""

    world: WorldState
    minds: dict[str, MindState] = Field(default_factory=dict)
    timeline: list[TimelineEntry] = Field(default_factory=list)
    digest: str | None = None
    meta: SnapshotMeta

    def model_copy_deep(self) -> SessionSnapshot:
        """深拷贝便捷方法（分叉友好）。"""
        return self.model_copy(deep=True)

    def to_jsonable(self) -> dict[str, Any]:
        return self.model_dump(mode="json")

    @classmethod
    def from_jsonable(cls, data: dict[str, Any]) -> SessionSnapshot:
        return cls.model_validate(data)


def _stamp_from_lock() -> tuple[str, str]:
    lock = load_lock()
    fingerprint = lock.get("contract_fingerprint")
    version = lock.get("contract_version")
    if not isinstance(fingerprint, str) or not fingerprint:
        raise ValueError("contract.lock.json missing contract_fingerprint")
    if not isinstance(version, str) or not version:
        raise ValueError("contract.lock.json missing contract_version")
    return fingerprint, version


async def build_default_snapshot(
    db: AsyncSession,
    *,
    seed_id: str = "default",
    played_actor_id: str | None = None,
) -> SessionSnapshot:
    """用注册表播种默认世界 + minds + 开场 SCENE（对齐 ensure_conversation_world 新建逻辑，不建 Conversation 行）。"""
    played = played_actor_id if played_actor_id is not None else DEFAULT_PLAYED_SLUG
    world = await build_world_state(db, played_actor_id=played)
    registry = await roles_service.list_ingame_registry(db)
    minds = {
        entry.slug: MindState(
            persona=entry.persona,
            relations=dict(entry.relations),
            goal=dict(entry.goal) if entry.goal else {},
        )
        for entry in registry
    }
    scene_entry = TimelineEntry(
        turn_id=uuid.uuid4().hex,
        intra_turn_seq=0,
        kind=TimelineKind.SCENE,
        speak=INITIAL_SCENE_NOTE,
    )
    fingerprint, version = _stamp_from_lock()
    meta = SnapshotMeta(
        seed_id=seed_id,
        run_id=uuid.uuid4().hex,
        parent_run_id=None,
        contract_fingerprint=fingerprint,
        contract_version=version,
    )
    return SessionSnapshot(
        world=world,
        minds=minds,
        timeline=[scene_entry],
        digest=None,
        meta=meta,
    )


def fork_snapshot(snapshot: SessionSnapshot, *, n: int = 1) -> list[SessionSnapshot]:
    """深拷贝分叉：每个子快照新 run_id，parent_run_id 指向源。"""
    if n < 1:
        raise ValueError(f"fork n must be >= 1, got {n}")
    parent_run_id = snapshot.meta.run_id
    children: list[SessionSnapshot] = []
    for _ in range(n):
        child = snapshot.model_copy(deep=True)
        child.meta = child.meta.model_copy(
            update={
                "run_id": uuid.uuid4().hex,
                "parent_run_id": parent_run_id,
                "created_at": datetime.now(UTC),
            }
        )
        children.append(child)
    return children
