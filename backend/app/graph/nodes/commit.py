"""commit 节点：把 player_entry + director_writes + npc_responses 一次性落库。"""

from __future__ import annotations

from langgraph.types import RunnableConfig

from app.graph.state import TurnGraphState
from app.services.world_service import WorldController


async def commit(state: TurnGraphState, config: RunnableConfig) -> dict:
    controller: WorldController = config["configurable"]["controller"]
    dispatch = state["dispatch"]
    player_entry = state["player_entry"]
    committed = await controller.commit_turn(
        turn_id=player_entry.turn_id,
        player_entry=player_entry,
        director_writes=dispatch.world_writes,
        npc_responses=state.get("npc_responses", []),
        scene_note=None,
    )
    return {"committed_turn": committed}
