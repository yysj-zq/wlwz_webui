"""统一回合 graph 的拓扑定义：game / chat 共用一组节点。

本模块只负责"图长什么样"——节点、边、路由、编译单例 TURN_GRAPH；
"怎么喂图、怎么读结果"的调用适配层在 app.graph.runner。

graph 结构：
  START → ingest → load_context
    → [chat: dispatch 已有] → npc_worker (Send API fan-out)
    → [game: 需要 director] → director_step ⇄ director_tools_exec → npc_worker (Send API fan-out)
      （director_step 无 tool_call 或 submit 非法 → 打回 director_step 重试，不静默兜底；
        submit_dispatch 工具用 Command 直写 state["dispatch"]，director_tools_exec
        后按 dispatch 是否写入及有无 perceivers 分流 npc_worker / commit）
  npc_worker → commit → END
    （commit 落库后顺带按世界写入判断是否触发摘要刷新，fire-and-forget）
"""

from __future__ import annotations

from typing import Literal

import httpx
from langchain_core.messages import AIMessage
from langgraph.graph import END, START, StateGraph
from langgraph.graph.state import CompiledStateGraph
from langgraph.prebuilt import ToolNode
from langgraph.types import RetryPolicy, Send

from app.graph.nodes.commit import commit
from app.graph.nodes.director import director_step
from app.graph.nodes.ingest_player import ingest_player_input
from app.graph.nodes.load_turn_context import load_turn_context
from app.graph.npc_subgraph import build_npc_subgraph
from app.graph.state import TurnGraphState
from app.graph.tools import DIRECTOR_TOOLS

_LLM_RETRY = RetryPolicy(
    max_attempts=3,
    retry_on=lambda exc: isinstance(exc, (httpx.TimeoutException, httpx.ConnectError)),
)


# ────────────────────────────────────────────────────────────────────
# 路由函数
# ────────────────────────────────────────────────────────────────────

def _route_after_load(state: TurnGraphState) -> list[Send] | Literal["director_step", "commit"]:
    """chat 模式 ingest 已产出 dispatch → 直接 fan-out NPC；game 模式走 director。"""
    dispatch = state.get("dispatch")
    if dispatch is not None:
        if dispatch.perceivers:
            return [
                Send("npc_worker", {"npc_context": state["context"], "npc_perceiver": p})
                for p in dispatch.perceivers
            ]
        return "commit"
    return "director_step"


def _after_director_step(state: TurnGraphState) -> Literal["director_tools_exec", "director_step"]:
    """有 tool_calls → 执行工具；否则（未调工具，违规）打回 director_step 重试。"""
    last = state["director_messages"][-1]
    if isinstance(last, AIMessage) and last.tool_calls:
        return "director_tools_exec"
    return "director_step"


def _after_director_tools(state: TurnGraphState) -> list[Send] | Literal["director_step", "commit"]:
    """director_tools_exec 之后的分流。

    - dispatch 未写入（None）→ query 结果回灌 / submit 非法打回，继续 director 循环。
    - dispatch 已写入且有 perceivers → fan-out 每个 perceiver 一个 NPC 子图实例。
    - dispatch 已写入但无 perceivers → 无 NPC 响应，直接 commit。

    无 perceivers 时返回节点名 "commit" 而非 Send("commit", {})：commit 需读父图
    state 里的 dispatch / player_entry，Send 的空 payload 会覆盖掉它们。
    """
    dispatch = state.get("dispatch")
    if dispatch is None:
        return "director_step"
    if dispatch.perceivers:
        return [
            Send("npc_worker", {"npc_context": state["context"], "npc_perceiver": p})
            for p in dispatch.perceivers
        ]
    return "commit"


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
    g.add_node("npc_worker", build_npc_subgraph(), retry_policy=_LLM_RETRY)
    g.add_node("commit", commit)

    # ── 边：入口 ──
    g.add_edge(START, "ingest")
    g.add_edge("ingest", "load_context")

    # ── 边：load_context 分流 ──
    g.add_conditional_edges("load_context", _route_after_load, ["director_step", "npc_worker", "commit"])

    # ── 边：director 工具循环 ──
    g.add_conditional_edges("director_step", _after_director_step, ["director_tools_exec", "director_step"])
    g.add_conditional_edges("director_tools_exec", _after_director_tools, ["director_step", "npc_worker", "commit"])

    # ── 边：汇聚 → 落库 → 结束 ──
    g.add_edge("npc_worker", "commit")
    g.add_edge("commit", END)

    return g.compile()


# 编译后的回合图单例，由 app.graph.runner 消费驱动。
TURN_GRAPH = _build_graph()
