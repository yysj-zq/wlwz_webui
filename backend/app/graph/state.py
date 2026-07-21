"""TurnGraph 与 NPC 子图的 state schema。

两个 state 作用域不同，务必区分：
- ``TurnGraphState``   —— 父图（turn_graph）的共享主干，一次回合全程唯一一份，
                          director / commit / npc fan-out 汇聚都读写它。
- ``NpcSubgraphState`` —— NPC 子图的隔离 state，父图每 Send 出一个 NPC 实例即
                          克隆一份独立副本，实例之间互不可见（fan-out 并行）。
它们不是平行的两张主状态；后者是前者 fan-out 时派生的局部 state。
"""

from __future__ import annotations

import operator
from typing import Annotated, NotRequired, TypedDict

from langchain_core.messages import BaseMessage

from app.schemas import (
    CommittedTurn,
    DirectorDispatch,
    NPCResponse,
    Perceiver,
    TimelineEntry,
    TurnContext,
)


class TurnGraphState(TypedDict):
    player_entry: NotRequired[TimelineEntry]
    context: NotRequired[TurnContext]
    dispatch: NotRequired[DirectorDispatch]
    committed_turn: NotRequired[CommittedTurn]
    director_messages: NotRequired[Annotated[list[BaseMessage], operator.add]]
    npc_responses: NotRequired[Annotated[list[tuple[str, NPCResponse]], operator.add]]
    errors: NotRequired[Annotated[list[str], operator.add]]


class NpcSubgraphState(TypedDict):
    """NPC 子图的隔离 state，每个 Send 实例拥有独立副本。

    - npc_context:   本回合上下文（timeline、world digest），由父图 Send 注入
    - npc_perceiver: 当前 NPC 的身份+感知原因（actor_id, perception_reason），由父图 Send 注入
    - messages:      LLM 对话历史，带 operator.add reducer 保证 ToolNode 增量追加不覆盖
    - npc_responses: 终端输出，submit_response 工具经 Command 写入后通过父图 reducer 汇总
    """

    npc_context: TurnContext
    npc_perceiver: Perceiver
    messages: Annotated[list[BaseMessage], operator.add]
    npc_responses: NotRequired[list[tuple[str, NPCResponse]]]
