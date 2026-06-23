"""Director 节点：单次 LLM 调用，配合 ToolNode 在图级循环。"""

from __future__ import annotations

from langchain_core.messages import AIMessage, BaseMessage, ToolMessage
from langgraph.types import RunnableConfig

from app.graph.prompt_render import render_director_messages
from app.graph.state import TurnGraphState
from app.graph.tools import DIRECTOR_TOOLS
from app.schemas.world import DirectorDispatch
from app.core.logging import get_logger
from app.services.world_service import WorldController
from app.core.llm import get_chat_model

logger = get_logger(__name__)


def _name_lookup(controller: WorldController) -> dict[str, str]:
    ws = controller.world_state
    return {eid: e.name for eid, e in ws.entities.items()}


async def director_step(state: TurnGraphState, config: RunnableConfig) -> dict:
    """单次 LLM 调用。首次调用时渲染 messages；后续循环复用 state 中的 director_messages。"""
    controller: WorldController = config["configurable"]["controller"]
    messages: list[BaseMessage] = list(state.get("director_messages") or [])

    new_msgs: list[BaseMessage] = []
    if not messages:
        context = state["context"]
        name_lookup = _name_lookup(controller)
        new_msgs = render_director_messages(context, name_lookup)
        messages = new_msgs

    llm = get_chat_model(temperature=0.7, streaming=False).bind_tools(DIRECTOR_TOOLS)
    ai_msg = await llm.ainvoke(messages)
    if not isinstance(ai_msg, AIMessage):
        logger.warning("LLM 返回了非 AIMessage 类型: %s", type(ai_msg))
    new_msgs.append(ai_msg)
    return {"director_messages": new_msgs}


def extract_dispatch_from_messages(messages: list[BaseMessage]) -> DirectorDispatch | None:
    """从 director_messages 中解析最后一条成功的 submit_dispatch ToolMessage。"""
    last_submit = next(
        (m for m in reversed(messages)
         if isinstance(m, ToolMessage)
         and m.name == "submit_dispatch"
         and not m.content.startswith("Error:")),
        None,
    )
    if last_submit is None:
        return None
    return DirectorDispatch.model_validate_json(last_submit.content)
