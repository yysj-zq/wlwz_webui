"""Director 节点：单次 LLM 调用，配合 ToolNode 在图级循环。"""

from __future__ import annotations

from typing import Any

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage
from langchain_core.runnables import RunnableConfig

from app.core import get_chat_model, get_logger
from app.graph.prompt_render import render_director_messages
from app.graph.state import TurnGraphState
from app.graph.tools import DIRECTOR_TOOLS
from app.services import WorldController

logger = get_logger(__name__)


async def director_step(state: TurnGraphState, config: RunnableConfig) -> dict[str, Any]:
    """单次 LLM 调用。首次调用时渲染 messages；后续循环复用 state 中的 director_messages。"""
    controller: WorldController = config["configurable"]["controller"]
    messages: list[BaseMessage] = list(state.get("director_messages") or [])

    new_msgs: list[BaseMessage] = []
    if not messages:
        context = state["context"]
        name_lookup = controller.world_state.name_lookup()
        new_msgs = render_director_messages(context, name_lookup)
        messages = new_msgs
    elif isinstance(messages[-1], AIMessage) and not messages[-1].tool_calls:
        # 上一轮 director 没调工具（违规）——补一条反馈让本次重试有效
        feedback = HumanMessage(content="你必须调用 submit_dispatch 工具提交决策以结束回合。")
        new_msgs.append(feedback)
        messages.append(feedback)

    # tool_choice="any" 强制调工具，从源头杜绝"输出纯文本不调工具"的违规（对支持约束解码的模型生效；
    # MiniMax-M3 实测忽略此参数，故仍需上面的无-tool_call 反馈重试兜底）。
    llm = get_chat_model(temperature=0.7, streaming=False).bind_tools(DIRECTOR_TOOLS, tool_choice="any")
    ai_msg = await llm.ainvoke(messages)
    if not isinstance(ai_msg, AIMessage):
        logger.warning("LLM 返回了非 AIMessage 类型: %s", type(ai_msg))
    new_msgs.append(ai_msg)
    return {"director_messages": new_msgs}
