"""digest_router 节点：决定是否触发摘要刷新（fire-and-forget）。"""

from __future__ import annotations

from langgraph.types import RunnableConfig

from app.graph.state import TurnGraphState
from app.services.world_service import WorldController
from app.services import digest_service


async def digest_router(state: TurnGraphState, config: RunnableConfig) -> dict:
    controller: WorldController = config["configurable"]["controller"]
    dispatch = state["dispatch"]
    npc_responses = state.get("npc_responses", [])
    world_state = state["committed_turn"].world_state
    should = await digest_service.should_refresh(
        controller.db,
        controller.conversation_id,
        world_state,
        dispatch.world_writes,
        npc_responses,
    )
    if should:
        digest_service.schedule_refresh(controller.conversation_id)
    return {}
