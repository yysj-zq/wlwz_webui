"""commit 节点：把 player_entry + director_writes + npc_responses 一次性落库，
落库后按世界写入判断是否触发摘要刷新（fire-and-forget）。"""

from __future__ import annotations

from typing import Any

from langchain_core.runnables import RunnableConfig

from app.graph.state import TurnGraphState
from app.services import WorldController


async def commit(state: TurnGraphState, config: RunnableConfig) -> dict[str, Any]:
    controller: WorldController = config["configurable"]["controller"]
    dispatch = state["dispatch"]
    player_entry = state["player_entry"]
    npc_responses = state.get("npc_responses", [])
    committed = await controller.commit_turn(
        turn_id=player_entry.turn_id,
        player_entry=player_entry,
        director_writes=dispatch.world_writes,
        npc_responses=npc_responses,
        scene_note=dispatch.narration,
    )

    await controller.after_commit_digest(committed, dispatch.world_writes, npc_responses)

    return {"committed_turn": committed}
