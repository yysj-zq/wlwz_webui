"""load_turn_context 节点：调 WorldController 拼 digest + compacted timeline。"""

from __future__ import annotations

from typing import Any

from langchain_core.runnables import RunnableConfig

from app.graph.state import TurnGraphState
from app.services import WorldController


async def load_turn_context(state: TurnGraphState, config: RunnableConfig) -> dict[str, Any]:
    controller: WorldController = config["configurable"]["controller"]
    context = await controller.load_turn_context()
    player_entry = state.get("player_entry")
    if player_entry is not None:
        context = context.model_copy(update={"timeline": [*context.timeline, player_entry]})
    return {"context": context}
