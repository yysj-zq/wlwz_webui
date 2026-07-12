"""NPC subgraph：每个 NPC 作为独立子图运行，通过 Send API 由父图 fan-out。

图结构：npc_step ⇄ npc_tools_exec → END
submit_response 工具用 Command 直写 state["npc_responses"]，无需独立提取节点。
节点从 config["configurable"]["controller"] 取依赖，子图自动继承父图 config。
"""

from __future__ import annotations

import operator
from typing import Annotated, Any, NotRequired, TypedDict

from langchain_core.messages import AIMessage, BaseMessage
from langgraph.graph import END, START, StateGraph
from langgraph.prebuilt import ToolNode
from langgraph.types import RunnableConfig

from app.core.llm import get_chat_model
from app.core.logging import get_logger
from app.graph.prompt_render import render_npc_messages
from app.graph.tools import NPC_TOOLS
from app.schemas.world import NPCResponse, Perceiver, TurnContext
from app.services import actor_mind_service
from app.services.world_service import WorldController

logger = get_logger(__name__)


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


async def _load_mind_view(controller: WorldController, actor_id: str) -> dict[str, Any]:
    """从数据库加载该 NPC 的记忆/情感/目标视图，用于填充 system prompt。"""
    return await actor_mind_service.load_for_prompt(
        controller.db, controller.conversation_id, actor_id
    )


async def npc_step(state: NpcSubgraphState, config: RunnableConfig) -> dict:
    """单次 NPC LLM 调用。首次渲染 prompt 并调用；后续（tool 循环回来）用已有 messages 续写。

    流程：
    1. 从 config 取 controller，从 state 取 perceiver/context/messages
    2. 检查 entity 是否存在，不存在则直接返回空响应跳过
    3. 加载 entity 信息、mind_view（记忆/情感）、name_lookup（id→名字映射）
    4. 若 messages 为空（首次进入）：render 初始 prompt（system + context messages）
    5. 调用 LLM（bind_tools 注入可用工具的 JSON schema）
    6. 返回增量 messages（首次 = 初始 prompt + ai_msg；后续 = 仅 ai_msg）
    """
    controller: WorldController = config["configurable"]["controller"]
    perceiver = state["npc_perceiver"]
    context = state["npc_context"]
    messages: list[BaseMessage] = list(state.get("messages") or [])

    # 检查 entity 是否仍存在于世界状态中（可能被剧情删除）
    ws = controller.world_state
    if perceiver.actor_id not in ws.entities:
        return {"npc_responses": [(perceiver.actor_id, NPCResponse())]}

    # 准备 LLM 所需的上下文数据
    entity = ws.entities[perceiver.actor_id]
    mind_view = await _load_mind_view(controller, perceiver.actor_id)
    name_lookup = {eid: e.name for eid, e in ws.entities.items()}

    # new_msgs 追踪本次调用的增量（reducer 会追加到 state["messages"]）
    new_msgs: list[BaseMessage] = []
    if not messages:
        # 首次进入：渲染 system prompt + timeline context 作为初始 messages
        new_msgs = render_npc_messages(
            context, entity, mind_view, perceiver.perception_reason, name_lookup
        )
        messages = new_msgs  # 供下方 LLM 调用使用完整列表

    # 调用 LLM，bind_tools 让模型知道可用工具的 schema
    llm = get_chat_model(temperature=0.8, streaming=False).bind_tools(NPC_TOOLS)
    ai_msg = await llm.ainvoke(messages)
    if not isinstance(ai_msg, AIMessage):
        logger.warning("NPC[%s] LLM 返回了非 AIMessage: %s", perceiver.actor_id, type(ai_msg))
    new_msgs.append(ai_msg)
    return {"messages": new_msgs}


def _after_npc_step(state: NpcSubgraphState) -> str:
    """npc_step 之后的条件路由。

    判断 LLM 最后一条输出：
    - 带 tool_calls → 路由到 npc_tools_exec 执行工具
    - 不带 tool_calls（纯文本/空） → 直接 END（路径 B：NPC 只说话不 submit，不补写空响应）
    """
    messages = state.get("messages") or []
    if not messages:
        return END
    last = messages[-1]
    if isinstance(last, AIMessage) and last.tool_calls:
        return "npc_tools_exec"
    return END


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
    - npc_step → npc_tools_exec | END（条件：有无 tool_calls）
    - npc_tools_exec → npc_step | END（条件：npc_responses 是否已写入）
    """
    g = StateGraph(NpcSubgraphState)

    g.add_node("npc_step", npc_step)
    g.add_node("npc_tools_exec", ToolNode(
        NPC_TOOLS,
        messages_key="messages",       # 告诉 ToolNode 从哪个 state 字段读/写消息
        handle_tool_errors=True,       # 工具抛异常时返回错误 ToolMessage 而非中断图
    ))

    g.add_edge(START, "npc_step")
    g.add_conditional_edges("npc_step", _after_npc_step,
                            {"npc_tools_exec": "npc_tools_exec", END: END})
    g.add_conditional_edges("npc_tools_exec", _after_npc_tools,
                            {"npc_step": "npc_step", END: END})

    return g.compile(checkpointer=False)
