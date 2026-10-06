"""Director 节点：单次 LLM 调用，配合 ToolNode 在图级循环。"""

from __future__ import annotations

from typing import Any

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage
from langchain_core.runnables import RunnableConfig

from app.core import get_chat_model, get_logger
from app.graph.prompt_render import render_director_messages
from app.graph.state import TurnGraphState
from app.graph.tools import DIRECTOR_TOOLS
from app.runtime.trajectory import DIRECTOR_ACTOR_ID, recorder_from_config
from app.services import WorldController

logger = get_logger(__name__)


async def director_step(state: TurnGraphState, config: RunnableConfig) -> dict[str, Any]:
    """单次 LLM 调用。首次调用时渲染 messages；后续循环复用 state 中的 director_messages。"""
    controller: WorldController = config["configurable"]["controller"]
    recorder = recorder_from_config(config)
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
        if recorder is not None:
            recorder.record_reject(
                actor_type="director",
                actor_id=DIRECTOR_ACTOR_ID,
                reason=str(feedback.content),
            )
        new_msgs.append(feedback)
        messages.append(feedback)

    # tool_choice 取 "auto"（OpenAI 规范值）而非 "any"：system prompt 已明文要求必须调
    # submit_dispatch，"auto" 在多家供应商下均能稳定产出 tool_call；而 "any" 非规范值，
    # 严格实现直接 422 报错、放宽容错则静默忽略并退回纯文本，两种失败都不会触发上面的重试。
    # 强制力仍由上面的无-tool_call 反馈重试兜底。
    llm = get_chat_model(temperature=0.7, streaming=False).bind_tools(DIRECTOR_TOOLS, tool_choice="auto")
    ai_msg = await llm.ainvoke(messages)
    if not isinstance(ai_msg, AIMessage):
        logger.warning("LLM 返回了非 AIMessage 类型: %s", type(ai_msg))
    if recorder is not None and isinstance(ai_msg, AIMessage):
        recorder.record_llm_output(
            actor_type="director",
            actor_id=DIRECTOR_ACTOR_ID,
            content=ai_msg.content,
            tool_calls=ai_msg.tool_calls,
        )
    new_msgs.append(ai_msg)
    return {"director_messages": new_msgs}
