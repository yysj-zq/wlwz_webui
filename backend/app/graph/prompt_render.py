"""Timeline / 上下文 → langchain BaseMessage 数组的渲染。"""

from __future__ import annotations

from typing import Any

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage

from app.core import DIRECTOR_SYSTEM_PROMPT, NPC_SYSTEM_PROMPT_TEMPLATE
from app.schemas import TurnContext, WorldEntity
from app.services import render_timeline_for_messages


def render_director_messages(
    context: TurnContext,
    npc_name_lookup: dict[str, str],
) -> list[BaseMessage]:
    system = DIRECTOR_SYSTEM_PROMPT.format(digest=context.digest or "（空）")
    messages: list[BaseMessage] = [SystemMessage(content=system)]
    for m in render_timeline_for_messages(context.timeline, viewer="director", npc_name_lookup=npc_name_lookup):
        messages.append(_to_lc(m["role"], m["content"]))
    return messages


def render_npc_messages(
    context: TurnContext,
    entity: WorldEntity,
    mind_view: dict[str, Any],
    perception_reason: str,
    npc_name_lookup: dict[str, str],
) -> list[BaseMessage]:
    system = NPC_SYSTEM_PROMPT_TEMPLATE.format(
        name=entity.name,
        persona=mind_view.get("persona", ""),
        relations=mind_view.get("relations", {}),
        goal=mind_view.get("goal", {}),
        recent_memories=mind_view.get("recent_memories", []),
        inventory=mind_view.get("inventory", {}),
        digest=context.digest or "（空）",
        perception_reason=perception_reason,
    )
    messages: list[BaseMessage] = [SystemMessage(content=system)]
    for m in render_timeline_for_messages(
        context.timeline, viewer="npc", npc_name_lookup=npc_name_lookup, self_actor_id=entity.id
    ):
        messages.append(_to_lc(m["role"], m["content"]))
    return messages


def _to_lc(role: str, content: str) -> BaseMessage:
    if role == "user":
        return HumanMessage(content=content)
    if role == "assistant":
        return AIMessage(content=content)
    return SystemMessage(content=content)
