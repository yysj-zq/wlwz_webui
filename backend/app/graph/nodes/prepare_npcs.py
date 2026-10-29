"""导演提交与 NPC fan-out 之间的状态屏障（网页和无头共用）。"""

from __future__ import annotations

from typing import Any

from langchain_core.runnables import RunnableConfig

from app.graph.state import TurnGraphState
from app.schemas import TimelineEntry, TimelineKind
from app.services import WorldController


async def prepare_npcs(state: TurnGraphState, config: RunnableConfig) -> dict[str, Any]:
    controller: WorldController = config["configurable"]["controller"]
    dispatch = state["dispatch"]
    controller.apply_director_writes(dispatch.world_writes)
    context = state["context"]
    if dispatch.world_writes:
        # 只加入本回上下文；最终 timeline 仍由 commit_turn 一次性写入。
        scene = TimelineEntry(
            turn_id=state["player_entry"].turn_id,
            intra_turn_seq=1,
            kind=TimelineKind.SCENE,
            narration=dispatch.narration,
            act_patch=dispatch.world_writes,
        )
        context = context.model_copy(update={"timeline": [*context.timeline, scene]})
    return {"context": context}
