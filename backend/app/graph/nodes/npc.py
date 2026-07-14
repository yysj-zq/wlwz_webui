"""NPC 节点：单次 LLM 调用，配合 ToolNode 在子图级循环。"""

from __future__ import annotations

from typing import Any

from langchain_core.messages import AIMessage, BaseMessage
from langgraph.types import RunnableConfig

from app.core import get_chat_model, get_logger
from app.graph.prompt_render import render_npc_messages
from app.graph.state import NpcSubgraphState
from app.graph.tools import NPC_TOOLS
from app.schemas import NPCResponse
from app.services import WorldController, actor_mind_service

logger = get_logger(__name__)


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
