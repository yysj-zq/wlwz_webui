"""ingest_player_input 节点。

构造 player 的 TimelineEntry（speak + act_patch 二选一或兼有）；
chat 模式同时直接构造 dispatch 跳过 director。
"""

from __future__ import annotations

import uuid

from langchain_core.runnables import RunnableConfig

from app.graph.state import TurnGraphState
from app.schemas.enums import TimelineKind, TurnMode
from app.schemas.world import (
    DirectorDispatch,
    Perceiver,
    TimelineEntry,
)
from app.schemas.world import PLAYER


async def ingest_player_input(_state: TurnGraphState, config: RunnableConfig) -> dict:
    cfg = config.get("configurable", {})
    mode = cfg["mode"]
    turn_id = uuid.uuid4().hex

    if mode == TurnMode.CHAT:
        chat_req = cfg["chat_request"]
        player_entry = TimelineEntry(
            turn_id=turn_id,
            actor_id=PLAYER,
            kind=TimelineKind.SPEAK,
            speak=chat_req.content,
            target_id=chat_req.targetActorId,
        )
        dispatch = DirectorDispatch(
            world_writes=[],
            perceivers=[
                Perceiver(actor_id=chat_req.targetActorId, perception_reason="用户直接对你说话")
            ],
        )
        return {"player_entry": player_entry, "dispatch": dispatch}

    # game 模式
    game_req = cfg["game_request"]
    player_entry = TimelineEntry(
        turn_id=turn_id,
        actor_id=game_req.actorId,
        speak=game_req.speak,
        target_id=game_req.targetId,
        act_patch=game_req.act_patch,
    )
    return {"player_entry": player_entry}
