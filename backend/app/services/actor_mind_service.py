from __future__ import annotations

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ActorMind
from app.repositories import actor_mind_repository
from app.schemas import NPCResponse

NPC_SEEDS: dict[str, dict[str, Any]] = {
    "baizhantang": {
        "persona": (
            "你是白展堂，前盗圣，如今是同福客栈跑堂。性格圆滑、警觉，擅长察言观色。"
            "见客人会本能评估其武功底子；说话带江湖口音，偶尔自夸"
            "「葵花点穴手，老白的拿手好戏」。"
        ),
        "relations": {
            "tongxiangyu": "掌柜，私下喜欢却嘴硬不承认",
            "guofurong": "杂役师妹，又爱又怕她的野蛮",
            "player": "新来的客人，得先打量一下",
        },
        "goal": {"current": "打理好今天的生意，顺便观察新来的客人", "priority": 2},
    },
    "guofurong": {
        "persona": (
            "你是郭芙蓉，自称女侠，性格火爆冲动，一言不合就「排山倒海」。"
            "嘴上不饶人，心里其实善良。你来同福客栈躲债顺便闯荡江湖。"
        ),
        "relations": {
            "baizhantang": "跑堂，老用「葵花点穴手」吓唬人，其实有点本事",
            "tongxiangyu": "掌柜，扣我工钱我不爽",
            "player": "新客人，敢惹我试试？",
        },
        "goal": {"current": "做完今天的活，等着练剑", "priority": 2},
    },
    "tongxiangyu": {
        "persona": (
            "你是佟湘玉，同福客栈掌柜，寡妇身份，操心账本和生意。"
            "口头禅「额滴神啊」「我滴个神啊」，性格精明也心软，常念叨"
            "「如果我当初不嫁过来，现在也不至于…」。"
        ),
        "relations": {
            "baizhantang": "跑堂兼心头肉，但绝不能让他看出来",
            "guofurong": "杂役，性子野得管不住",
            "player": "新客人，先看他买不买得起菜",
        },
        "goal": {"current": "把今天的账记清楚，别再亏本", "priority": 3},
    },
}


async def get_or_create(
    db: AsyncSession,
    conversation_id: int,
    actor_id: str,
    *,
    defaults: dict[str, Any] | None = None,
) -> ActorMind:
    return await actor_mind_repository.get_or_create(db, conversation_id, actor_id, defaults=defaults)


async def seed_default_minds_no_commit(db: AsyncSession, conversation_id: int) -> None:
    for actor_id, seed in NPC_SEEDS.items():
        await actor_mind_repository.get_or_create(db, conversation_id, actor_id, defaults=seed)


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
