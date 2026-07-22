from __future__ import annotations

from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import COMPACTOR_SYSTEM_PROMPT, get_chat_model, strip_think
from app.models import Timeline
from app.repositories import timeline_repository
from app.schemas import TimelineEntry, TimelineKind

_RECENT_RAW_LIMIT = 8


async def list_timeline(
    db: AsyncSession,
    conversation_id: int,
    *,
    after_id: int | None = None,
    limit: int | None = None,
) -> list[TimelineEntry]:
    return await timeline_repository.list_by_conversation(db, conversation_id, after_id=after_id, limit=limit)


async def append_entries_no_commit(
    db: AsyncSession,
    conversation_id: int,
    entries: list[TimelineEntry],
) -> list[Timeline]:
    return await timeline_repository.append_no_commit(db, conversation_id, entries)


def render_timeline_for_messages(
    entries: list[TimelineEntry],
    *,
    npc_name_lookup: dict[str, str] | None = None,
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
            # speak 是展示窗口；director 世界变更走 narration（act_patch 的中文映射），
            # 开场白/摘要走 speak。取非空者。
            text = entry.speak or entry.narration or ""
            if text:
                out.append({"role": "user", "content": f"【{text}】"})
        # npc 或 player
        else:
            if not entry.actor_id:
                continue
            name = lookup.get(entry.actor_id, entry.actor_id)
            content = _render_persona(entry, name, lookup)
            # 纯动作变更且无叙事（只有 act_patch，无 speak 无 narration）：机器态不进文本，
            # 交前端可视化 → 跳过
            if content is None:
                continue
            # director 与 npc 一律把历史发言渲染成 user（含 NPC 自己过去的台词）：
            # assistant 只留给模型本轮真正产出的 tool_call。若把自身历史标成纯文本 assistant，
            # 会形成「角色名：台词」的反向 few-shot，诱导模型续写文本而非调 submit_* 工具。
            out.append({"role": "user", "content": content})
    return out


def _render_persona(entry: TimelineEntry, name: str, lookup: dict[str, str]) -> str | None:
    """把一条 npc/player entry 渲染成一行文本；纯动作无叙事时返回 None（不进文本）。

    朝向/坐标等机器态不再拼进文本（改由前端消费 act_patch）；动作/情绪的中文表达
    统一走 LLM 生成的 narration。
    """
    target_name = lookup.get(entry.target_id, entry.target_id) if entry.target_id else None
    target_prefix = f"（对{target_name}）" if target_name else ""
    narration = f"（{entry.narration}）" if entry.narration else ""
    speak = entry.speak or ""
    if speak:
        return f"{name}{target_prefix}：{speak}{narration}"
    if narration:
        return f"{name}{target_prefix}：{narration}"
    return None


class Compactor:
    def __init__(self, recent_limit: int = _RECENT_RAW_LIMIT) -> None:
        self.recent_limit = recent_limit

    async def compact(
        self, entries: list[TimelineEntry], *, name_lookup: dict[str, str] | None = None
    ) -> list[TimelineEntry]:
        if len(entries) <= self.recent_limit:
            return entries
        head = entries[: -self.recent_limit]
        tail = entries[-self.recent_limit :]
        summary = await self._summarize(head, name_lookup=name_lookup)
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

    async def _summarize(self, head: list[TimelineEntry], *, name_lookup: dict[str, str] | None = None) -> str:
        rendered = render_timeline_for_messages(head, npc_name_lookup=name_lookup)
        body = "\n".join(f"- {m['content']}" for m in rendered)
        llm = get_chat_model(temperature=0.2, streaming=False)
        result = await llm.ainvoke([SystemMessage(content=COMPACTOR_SYSTEM_PROMPT), HumanMessage(content=body)])
        content = result.content
        if isinstance(content, list):
            content = "".join(p.get("text", "") if isinstance(p, dict) else str(p) for p in content)
        return strip_think(str(content or ""))
