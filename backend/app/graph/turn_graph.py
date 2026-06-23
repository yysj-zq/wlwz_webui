"""统一回合 graph：game / chat 共用一组节点。

graph 结构：
  START → ingest → load_context
    → [chat: dispatch 已有] → npc_worker (Send API fan-out)
    → [game: 需要 director] → director_step ⇄ director_tools_exec → resolve_dispatch → npc_worker
  npc_worker → commit → digest_router → END
"""

from __future__ import annotations

from typing import Literal, cast

import httpx
from langchain_core.messages import AIMessage, ToolMessage
from langchain_core.runnables import RunnableConfig
from langgraph.graph import END, START, StateGraph
from langgraph.graph.state import CompiledStateGraph
from langgraph.prebuilt import ToolNode
from langgraph.types import RetryPolicy, Send

from app.graph.nodes.commit import commit
from app.graph.nodes.digest_router import digest_router
from app.graph.nodes.director import director_step, extract_dispatch_from_messages
from app.graph.nodes.ingest_player import ingest_player_input
from app.graph.nodes.load_turn_context import load_turn_context
from app.graph.nodes.npc_subgraph import build_npc_subgraph
from app.graph.state import TurnGraphState
from app.graph.tools import DIRECTOR_TOOLS
from app.schemas.turn import ChatTurnRequest, GameActionRequest, TurnResponse
from app.schemas.enums import TurnMode
from app.schemas.world import DirectorDispatch
from app.services.world_service import WorldController

_LLM_RETRY = RetryPolicy(
    max_attempts=3,
    retry_on=lambda exc: isinstance(exc, (httpx.TimeoutException, httpx.ConnectError)),
)


# ────────────────────────────────────────────────────────────────────
# 路由函数
# ────────────────────────────────────────────────────────────────────

def _route_after_load(state: TurnGraphState) -> list[Send] | Literal["director_step"]:
    """chat 模式 ingest 已产出 dispatch → 直接 fan-out NPC；game 模式走 director。"""
    dispatch = state.get("dispatch")
    if dispatch is not None:
        if dispatch.perceivers:
            return [
                Send("npc_worker", {"npc_context": state["context"], "npc_perceiver": p})
                for p in dispatch.perceivers
            ]
        return [Send("commit", {})]
    return "director_step"


def _after_director_step(state: TurnGraphState) -> Literal["director_tools_exec", "resolve_dispatch"]:
    """有 tool_calls → 执行工具；否则结束 director 循环。"""
    messages = state.get("director_messages") or []
    if messages:
        last = messages[-1]
        if isinstance(last, AIMessage) and last.tool_calls:
            return "director_tools_exec"
    return "resolve_dispatch"


def _after_director_tools(state: TurnGraphState) -> Literal["director_step", "resolve_dispatch"]:
    """submit_dispatch 成功提交 → 结束循环；否则继续。"""
    messages = state.get("director_messages") or []
    submitted = any(
        isinstance(m, ToolMessage)
        and m.name == "submit_dispatch"
        and not m.content.startswith("Error:")
        for m in messages
    )
    return "resolve_dispatch" if submitted else "director_step"


def _route_to_npcs(state: TurnGraphState) -> list[Send] | Literal["commit"]:
    """为每个 perceiver 发射一个 NPC subgraph 实例。"""
    dispatch = state.get("dispatch")
    if dispatch is None or not dispatch.perceivers:
        return "commit"
    return [
        Send("npc_worker", {"npc_context": state["context"], "npc_perceiver": p})
        for p in dispatch.perceivers
    ]



# ────────────────────────────────────────────────────────────────────
# resolve_dispatch 节点
# ────────────────────────────────────────────────────────────────────

def _resolve_dispatch(state: TurnGraphState) -> dict:
    """从 director_messages 解析 dispatch。"""
    messages = state.get("director_messages") or []
    dispatch = extract_dispatch_from_messages(messages)
    if dispatch is None:
        return {
            "dispatch": DirectorDispatch(),
            "errors": ["director 未调用 submit_dispatch，按空 dispatch 兜底"],
        }
    return {"dispatch": dispatch}


# ────────────────────────────────────────────────────────────────────
# Graph 编译（模块级单例）
# ────────────────────────────────────────────────────────────────────

def _build_graph() -> CompiledStateGraph:
    g = StateGraph(TurnGraphState)

    # ── 节点 ──
    g.add_node("ingest", ingest_player_input)
    g.add_node("load_context", load_turn_context)
    g.add_node("director_step", director_step, retry_policy=_LLM_RETRY)
    g.add_node("director_tools_exec", ToolNode(
        DIRECTOR_TOOLS,
        messages_key="director_messages",
        handle_tool_errors=True,
    ))
    g.add_node("resolve_dispatch", _resolve_dispatch)
    g.add_node("npc_worker", build_npc_subgraph(), retry_policy=_LLM_RETRY)
    g.add_node("commit", commit)
    g.add_node("digest_router", digest_router)

    # ── 边：入口 ──
    g.add_edge(START, "ingest")
    g.add_edge("ingest", "load_context")

    # ── 边：load_context 分流 ──
    g.add_conditional_edges("load_context", _route_after_load, ["director_step", "npc_worker", "commit"])

    # ── 边：director 工具循环 ──
    g.add_conditional_edges("director_step", _after_director_step, ["director_tools_exec", "resolve_dispatch"])
    g.add_conditional_edges("director_tools_exec", _after_director_tools, ["director_step", "resolve_dispatch"])

    # ── 边：resolve → fan-out NPC ──
    g.add_conditional_edges("resolve_dispatch", _route_to_npcs, ["npc_worker", "commit"])

    # ── 边：汇聚 → 落库 → 结束 ──
    g.add_edge("npc_worker", "commit")
    g.add_edge("commit", "digest_router")
    g.add_edge("digest_router", END)

    return g.compile()


_GRAPH = _build_graph()


# ────────────────────────────────────────────────────────────────────
# 公共入口
# ────────────────────────────────────────────────────────────────────

async def run_game(controller: WorldController, request: GameActionRequest) -> TurnResponse:
    config: RunnableConfig = {
        "configurable": {
            "mode": TurnMode.GAME,
            "game_request": request,
            "controller": controller,
        },
        "recursion_limit": 30,
    }
    result = await _GRAPH.ainvoke({}, config=config)
    return _build_response(controller, cast(TurnGraphState, result))


async def run_chat(
    controller: WorldController, conversation_id: int, request: ChatTurnRequest
) -> TurnResponse:
    config: RunnableConfig = {
        "configurable": {
            "mode": TurnMode.CHAT,
            "chat_request": request,
            "controller": controller,
        },
        "recursion_limit": 30,
    }
    result = await _GRAPH.ainvoke({}, config=config)
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
