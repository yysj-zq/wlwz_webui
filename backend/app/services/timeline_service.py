from __future__ import annotations

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Timeline
from app.repositories.timeline_repository import timeline_repository
from app.schemas.enums import TimelineKind
from app.schemas.world import TimelineEntry, WorldEntityPatch

_RECENT_RAW_LIMIT = 8


async def list_timeline(
        db: AsyncSession,
        conversation_id: int,
        *,
        after_id: int | None = None,
        limit: int | None = None,
) -> list[TimelineEntry]:
    return await timeline_repository.list_by_conversation(
        db, conversation_id, after_id=after_id, limit=limit
    )


async def append_entries_no_commit(
        db: AsyncSession,
        conversation_id: int,
        entries: list[TimelineEntry],
) -> list[Timeline]:
    return await timeline_repository.append_no_commit(db, conversation_id, entries)


def render_timeline_for_messages(
        entries: list[TimelineEntry],
        *,
        viewer: str = "director",
        npc_name_lookup: dict[str, str] | None = None,
        self_actor_id: str | None = None,
) -> list[dict[str, Any]]:
    # todo [1] 原生role、scece的chat-template训练兼容，不放到user/assistant下面？eg.
    # <|im_start|>system
    # 你是一个乐于助人的助手。<|im_end|>
    # <|im_start|>白展堂
    # 你好！<|im_end|>
    # <|im_start|>佟湘玉
    # 你好！有什么可以帮你的吗？<|im_end|>
    # <|im_start|>旁白
    # 【天黑了】<|im_end|>
    # <|im_start|>佟湘玉
    # 好好天黑了<|im_end|>
    # todo [2] 每轮对话都做成“单轮对话”，把前面所有可见对话都放进user？eg.
    # <|im_start|>system
    # 你是一个乐于助人的助手。<|im_end|>
    # <|im_start|>user
    # 白展堂：xxx
    # 佟湘玉：xxx
    # 【天黑了】
    # 郭芙蓉：xxx<|im_end|>
    # <|im_start|>assistant
    # 佟湘玉：好好天黑了<|im_end|>

    lookup = npc_name_lookup or {}
    out: list[dict[str, Any]] = []
    for entry in entries:
        # 旁白：对任何视角都是客观记录 → user
        if entry.kind == TimelineKind.SCENE:
            speak = entry.speak or ""
            if speak:
                out.append({"role": "user", "content": f"【{speak}】"})
        # npc 或 player
        else:
            if not entry.actor_id:
                continue
            name = lookup.get(entry.actor_id, entry.actor_id)
            content = _render_persona(entry, name)
            # role 取决于「这条发言对当前 viewer 是不是『我说的』」：
            # - director：整条时间线都是供其判断的客观材料，没有一句是导演说的 → 全 user
            #   （若标成 assistant，会与 system prompt「你不写台词、只 submit_dispatch」矛盾，
            #    诱导导演续写台词而非调工具）
            # - npc：仅该 NPC 自己的历史发言是「我说的」→ assistant；其余角色都是 user
            if viewer == "npc":
                role = "assistant" if entry.actor_id == self_actor_id else "user"
            else:
                role = "user"
            out.append({"role": role, "content": content})
    return out


def _render_persona(entry: TimelineEntry, name: str) -> str:
    # todo 加一个target_id/player_id与中文名的map对照，放中文名而不是id到message里
    # todo 把render都总结为一个template？
    target_prefix = f"（对{entry.target_id}）" if entry.target_id else ""
    if entry.kind == TimelineKind.SPEAK:
        return f"{name}{target_prefix}：{entry.speak or ''}"
    elif entry.kind == TimelineKind.ACT:
        return f"{name}：({_render_patch(entry.act_patch)})"
    elif entry.kind == TimelineKind.SPEAK_AND_ACT:
        return f"{name}{target_prefix}：{entry.speak or ''}({_render_patch(entry.act_patch)})"
    raise AssertionError("unreachable")


def _render_patch(patches: list[WorldEntityPatch]) -> str:
    if not patches:
        return "(无变化)"
    parts: list[str] = []
    for ep in patches:
        bits: list[str] = []
        if ep.position is not None:
            bits.append(f"位置→({ep.position.x},{ep.position.y})")
        if ep.direction is not None:
            bits.append(f"朝向→{ep.direction}")
        if ep.public_state is not None:
            bits.append(f"状态→{ep.public_state}")
        parts.append(f"{ep.entity_id} {' '.join(bits)}")
    return "; ".join(parts)


class Compactor:
    def __init__(self, recent_limit: int = _RECENT_RAW_LIMIT) -> None:
        self.recent_limit = recent_limit

    async def compact(self, entries: list[TimelineEntry]) -> list[TimelineEntry]:
        if len(entries) <= self.recent_limit:
            return entries
        head = entries[: -self.recent_limit]
        tail = entries[-self.recent_limit:]
        summary = await self._summarize(head)
        if not summary:
            return tail
        virtual = TimelineEntry(
            turn_id=head[0].turn_id,
            intra_turn_seq=0,
            kind=TimelineKind.SCENE,
            speak=summary,
            created_at=head[0].created_at,
        )
        return [virtual, *tail]

    async def _summarize(self, head: list[TimelineEntry]) -> str:
        from langchain_core.messages import HumanMessage, SystemMessage

        from app.core.llm import get_chat_model, strip_think
        from app.graph.prompts import COMPACTOR_SYSTEM_PROMPT

        rendered = render_timeline_for_messages(head)
        body = "\n".join(f"- {m['content']}" for m in rendered)
        llm = get_chat_model(temperature=0.2, streaming=False)
        result = await llm.ainvoke(
            [SystemMessage(content=COMPACTOR_SYSTEM_PROMPT), HumanMessage(content=body)]
        )
        content = result.content
        if isinstance(content, list):
            content = "".join(p.get("text", "") if isinstance(p, dict) else str(p) for p in content)
        return strip_think(str(content or ""))
