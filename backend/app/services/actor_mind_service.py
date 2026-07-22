from __future__ import annotations

from collections.abc import Iterable
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ActorMind
from app.repositories import actor_mind_repository
from app.schemas import NPCResponse, RoleRegistryEntry


async def get_or_create(
    db: AsyncSession,
    conversation_id: int,
    actor_id: str,
    *,
    defaults: dict[str, Any] | None = None,
) -> ActorMind:
    return await actor_mind_repository.get_or_create(db, conversation_id, actor_id, defaults=defaults)


async def seed_minds_no_commit(
    db: AsyncSession,
    conversation_id: int,
    roles: Iterable[RoleRegistryEntry],
) -> None:
    """为注册表角色播种心智（persona/relations/goal 来自注册表）。

    建会话时应对 in_game 全员调用；当前扮演者的 mind 可闲置，切换扮演后即可被 LLM 使用。
    幂等：已存在的 ActorMind 不会被覆盖（get_or_create 命中即返回）。
    """
    for entry in roles:
        defaults = {
            "persona": entry.persona,
            "relations": entry.relations,
            "goal": entry.goal,
        }
        await actor_mind_repository.get_or_create(db, conversation_id, entry.slug, defaults=defaults)


async def upsert_increment_no_commit(
    db: AsyncSession,
    conversation_id: int,
    actor_id: str,
    response: NPCResponse,
    at_version: int,
) -> None:
    mind = await actor_mind_repository.get_or_create(db, conversation_id, actor_id)

    if response.memory_writes:
        memories = list(mind.memories_json or [])
        for mw in response.memory_writes:
            memories.append(
                {
                    "at_version": at_version,
                    "content": mw.content,
                    "importance": mw.importance,
                    "scope": mw.scope,
                }
            )
        mind.memories_json = memories[-30:]

    if response.goal_update is not None:
        mind.goal_json = response.goal_update.model_dump(mode="json", exclude_none=True)

    if response.inventory_ops:
        inv = dict(mind.inventory_json or {})
        for op in response.inventory_ops:
            inv[op.item_id] = int(inv.get(op.item_id, 0)) + op.delta
            if inv[op.item_id] <= 0:
                inv.pop(op.item_id, None)
        mind.inventory_json = inv


async def load_for_prompt(db: AsyncSession, conversation_id: int, actor_id: str) -> dict[str, Any]:
    mind = await actor_mind_repository.get_by_conversation_actor(db, conversation_id, actor_id)
    if mind is None:
        return {"persona": "", "relations": {}, "goal": {}, "recent_memories": []}
    memories = list(mind.memories_json or [])
    return {
        "persona": mind.persona or "",
        "relations": dict(mind.relations_json or {}),
        "goal": dict(mind.goal_json or {}),
        "recent_memories": memories[-6:],
        "inventory": dict(mind.inventory_json or {}),
    }
