"""NPC 子图：每个 NPC 作为独立子图运行，通过 Send API 由父图 fan-out。

图结构：npc_step ⇄ npc_tools_exec → END
submit_response 工具用 Command 直写 state["npc_responses"]，无需独立提取节点。
节点从 config["configurable"]["controller"] 取依赖，子图自动继承父图 config。
"""

from __future__ import annotations

from typing import Any

from langchain_core.messages import AIMessage
from langgraph.graph import END, START, StateGraph
from langgraph.prebuilt import ToolNode

from app.graph.nodes.npc import npc_step
from app.graph.state import NpcSubgraphState
from app.graph.tools import NPC_TOOLS


def _after_npc_step(state: NpcSubgraphState) -> str:
    """npc_step 之后的条件路由。

    判断 LLM 最后一条输出：
    - 带 tool_calls → 路由到 npc_tools_exec 执行工具
    - 不带 tool_calls（纯文本，违规） → 打回 npc_step 重试（与 director 同构，不静默丢弃响应）
    - 无 messages（entity 已被剧情删除，npc_step 直写空响应） → END
    """
    messages = state.get("messages") or []
    if not messages:
        return END
    last = messages[-1]
    if isinstance(last, AIMessage) and last.tool_calls:
        return "npc_tools_exec"
    return "npc_step"


def _after_npc_tools(state: NpcSubgraphState) -> str:
    """npc_tools_exec 之后的条件路由。

    submit_response 工具用 Command 直写 npc_responses：
    - 已写入（有 npc_responses）→ NPC 已提交最终响应，END
    - 未写入（只调了 query 等）→ 回 npc_step 继续思考/查询
    """
    return END if state.get("npc_responses") else "npc_step"


def build_npc_subgraph() -> Any:
    """构建并编译 NPC 子图，返回编译后的 CompiledGraph。

    被父图以 g.add_node("npc_worker", build_npc_subgraph()) 注册，
    父图通过 Send("npc_worker", {npc_context, npc_perceiver}) 为每个 NPC 创建独立实例。

    节点：
    - npc_step:         LLM 调用（首次含 prompt 渲染）
    - npc_tools_exec:   ToolNode，执行 tool_calls，handle_tool_errors=True 捕获异常为错误消息；
                        submit_response 经 Command 直写 npc_responses

    边：
    - START → npc_step（入口）
    - npc_step → npc_tools_exec | npc_step | END（条件：有 tool_calls / 违规重试 / entity 缺失）
    - npc_tools_exec → npc_step | END（条件：npc_responses 是否已写入）
    """
    g = StateGraph(NpcSubgraphState)

    g.add_node("npc_step", npc_step)
    g.add_node(
        "npc_tools_exec",
        ToolNode(
            NPC_TOOLS,
            messages_key="messages",  # 告诉 ToolNode 从哪个 state 字段读/写消息
            handle_tool_errors=True,  # 工具抛异常时返回错误 ToolMessage 而非中断图
        ),
    )

    g.add_edge(START, "npc_step")
    g.add_conditional_edges(
        "npc_step", _after_npc_step, {"npc_tools_exec": "npc_tools_exec", "npc_step": "npc_step", END: END}
    )
    g.add_conditional_edges("npc_tools_exec", _after_npc_tools, {"npc_step": "npc_step", END: END})

    return g.compile(checkpointer=False)
