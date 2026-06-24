from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.repositories.world_digest_repository import world_digest_repository
from app.schemas.world import NPCResponse, WorldEntityPatch, WorldState

logger = get_logger(__name__)

_REFRESH_VERSION_DELTA = 6


async def get_digest(db: AsyncSession, conversation_id: int) -> str:
    row = await world_digest_repository.get_by_conversation(db, conversation_id)
    return (row.summary_text or "") if row else ""


async def should_refresh(
    db: AsyncSession,
    conversation_id: int,
    world_state: WorldState,
    director_writes: list[WorldEntityPatch],
    npc_responses: list[tuple[str, NPCResponse]],
) -> bool:
    row = await world_digest_repository.get_by_conversation(db, conversation_id)
    last_version = row.at_version if row else 0
    if world_state.state_version - last_version >= _REFRESH_VERSION_DELTA:
        return True
    if any(r[1].speak is not None or r[1].act_patch for r in npc_responses):
        return True
    return bool(director_writes)


def schedule_refresh(conversation_id: int) -> None:
    import asyncio

    asyncio.create_task(_refresh_digest_job(conversation_id))


async def _refresh_digest_job(conversation_id: int) -> None:
    from app.core.database import AsyncSessionLocal

    try:
        async with AsyncSessionLocal() as db:
            await _refresh_digest(db, conversation_id)
    except Exception:
        logger.exception("[digest] refresh-error", conversation_id=conversation_id)


async def _refresh_digest(db: AsyncSession, conversation_id: int) -> None:
    from langchain_core.messages import HumanMessage, SystemMessage

    from app.graph.prompts import SUMMARIZER_SYSTEM_PROMPT
    from app.core.llm import get_chat_model
    from app.services import timeline_service
    from app.services.world_service import deserialize_world_state

    convo = await world_digest_repository.get_conversation(db, conversation_id)
    if convo is None:
        return
    world_state = deserialize_world_state(convo.world_state_json)
    timeline = await timeline_service.list_timeline(db, conversation_id, limit=20)
    rendered = timeline_service.render_timeline_for_messages(timeline)
    body = (
        "当前世界（JSON）：\n"
        f"{world_state.model_dump(mode='json')}\n\n"
        "最近时间线：\n"
        + "\n".join(f"- {m['content']}" for m in rendered)
    )
    llm = get_chat_model(temperature=0.2, streaming=False)
    result = await llm.ainvoke(
        [SystemMessage(content=SUMMARIZER_SYSTEM_PROMPT), HumanMessage(content=body)]
    )
    content = result.content
    if isinstance(content, list):
        content = "".join(p.get("text", "") if isinstance(p, dict) else str(p) for p in content)
    summary = str(content or "").strip()

    await world_digest_repository.upsert(
        db, conversation_id, world_state.state_version, summary
    )
    await db.commit()
