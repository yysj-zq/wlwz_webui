"""TurnGraph 在 chat / game 模式下的共享状态。"""

from __future__ import annotations

import operator
from typing import Annotated, NotRequired, TypedDict

from langchain_core.messages import BaseMessage

from app.schemas.world import (
    DirectorDispatch,
    NPCResponse,
    TimelineEntry,
    TurnContext,
)
from app.schemas.world import CommittedTurn


class TurnGraphState(TypedDict):
    player_entry: NotRequired[TimelineEntry]
    context: NotRequired[TurnContext]
    dispatch: NotRequired[DirectorDispatch]
    committed_turn: NotRequired[CommittedTurn]
    director_messages: Annotated[list[BaseMessage], operator.add]
    npc_responses: Annotated[list[tuple[str, NPCResponse]], operator.add]
    errors: Annotated[list[str], operator.add]
