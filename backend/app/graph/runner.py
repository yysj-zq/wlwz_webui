"""回合图的调用适配层：把 controller + request 包成 config 喂给 TURN_GRAPH，
再把终态 state 里的 committed_turn 组装成 TurnResponse 返回。

与 app.graph.turn_graph（图拓扑定义）分层：本模块只关心"怎么驱动图、怎么读结果"，
不关心图内部长什么样。API 层依赖这里的 run_game / run_chat，不直接碰 TURN_GRAPH。
"""

from __future__ import annotations

from typing import cast

from langchain_core.runnables import RunnableConfig

from app.graph.state import TurnGraphState
from app.graph.turn_graph import TURN_GRAPH
from app.schemas import ChatTurnRequest, GameActionRequest, TurnMode, TurnResponse
from app.services import WorldController


async def run_game(controller: WorldController, request: GameActionRequest) -> TurnResponse:
    config: RunnableConfig = {
        "configurable": {
            "mode": TurnMode.GAME,
            "game_request": request,
            "controller": controller,
        },
        "recursion_limit": 30,
    }
    result = await TURN_GRAPH.ainvoke({}, config=config)
    return _build_response(controller, cast(TurnGraphState, result))


async def run_chat(controller: WorldController, conversation_id: int, request: ChatTurnRequest) -> TurnResponse:
    config: RunnableConfig = {
        "configurable": {
            "mode": TurnMode.CHAT,
            "chat_request": request,
            "controller": controller,
        },
        "recursion_limit": 30,
    }
    result = await TURN_GRAPH.ainvoke({}, config=config)
    return _build_response(controller, cast(TurnGraphState, result))


def _build_response(controller: WorldController, state: TurnGraphState) -> TurnResponse:
    committed = state["committed_turn"]
    return TurnResponse(
        conversationId=controller.conversation_id,
        stateVersion=committed.world_state.state_version,
        world_state=committed.world_state,
        timeline_delta=committed.timeline_delta,
        narration=committed.narration,
    )
