"""轨迹旁路：事件 schema + Recorder + JSONL sink + Query。

图内采集钩子（llm / tool / reject / turn_committed）经 ``configurable["trajectory_recorder"]``
注入；缺省（HTTP 热路径）跳过。
"""

from __future__ import annotations

import json
from collections.abc import Awaitable, Callable, Sequence
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Literal

from langchain_core.messages import ToolMessage
from langchain_core.runnables import RunnableConfig
from langgraph.prebuilt.tool_node import ToolCallRequest
from langgraph.types import Command
from pydantic import BaseModel, Field

ActorType = Literal["director", "npc", "system"]
EventType = Literal["llm_output", "tool_observation", "reject", "turn_committed"]

DIRECTOR_ACTOR_ID = "director"
SYSTEM_ACTOR_ID = "system"


class TrajectoryEvent(BaseModel):
    """单条轨迹事件（JSONL 一行）。"""

    event_type: EventType
    contract_fingerprint: str
    seed_id: str
    run_id: str
    turn_id: str
    seq: int
    actor_type: ActorType
    actor_id: str
    recorded_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    # llm_output
    content: str | None = None
    tool_calls: list[dict[str, Any]] | None = None

    # tool_observation
    tool_name: str | None = None
    tool_call_id: str | None = None
    observation: Any | None = None

    # reject
    reason: str | None = None

    # turn_committed
    timeline_delta: list[dict[str, Any]] | None = None
    state_version: int | None = None


def _serialize_tool_calls(tool_calls: Sequence[Any] | None) -> list[dict[str, Any]] | None:
    if not tool_calls:
        return [] if tool_calls is not None else None
    out: list[dict[str, Any]] = []
    for tc in tool_calls:
        if isinstance(tc, dict):
            out.append({"name": tc.get("name"), "args": tc.get("args", {}), "id": tc.get("id")})
        else:
            out.append(
                {
                    "name": getattr(tc, "name", None),
                    "args": getattr(tc, "args", {}) or {},
                    "id": getattr(tc, "id", None),
                }
            )
    return out


def _content_as_str(content: Any) -> str | None:
    if content is None:
        return None
    if isinstance(content, str):
        return content
    return str(content)


def summarize_timeline_delta(entries: Sequence[Any]) -> list[dict[str, Any]]:
    """``turn_committed`` 用的 timeline_delta 摘要（不含完整 act_patch 载荷）。"""
    summary: list[dict[str, Any]] = []
    for e in entries:
        kind = getattr(e, "kind", None)
        kind_val = getattr(kind, "value", kind)
        act_patch = getattr(e, "act_patch", None) or []
        summary.append(
            {
                "kind": kind_val,
                "actor_id": getattr(e, "actor_id", None),
                "speak": getattr(e, "speak", None),
                "narration": getattr(e, "narration", None),
                "act_patch_count": len(act_patch),
            }
        )
    return summary


def recorder_from_config(config: RunnableConfig | None) -> TrajectoryRecorder | None:
    if not config:
        return None
    cfg = config.get("configurable") or {}
    recorder = cfg.get("trajectory_recorder")
    return recorder if isinstance(recorder, TrajectoryRecorder) else None


class TrajectoryRecorder:
    """内存攒事件；``flush()`` / ``flush(path)`` 追加写入 JSONL（一行一个 event）。"""

    def __init__(
        self,
        *,
        seed_id: str = "",
        run_id: str = "",
        contract_fingerprint: str = "",
        sink_path: Path | str | None = None,
        turn_id: str | None = None,
    ) -> None:
        self.seed_id = seed_id
        self.run_id = run_id
        self.contract_fingerprint = contract_fingerprint
        self.sink_path = Path(sink_path) if sink_path is not None else None
        self._turn_id = turn_id
        self._events: list[TrajectoryEvent] = []
        self._seq = 0
        self._flushed_upto = 0

    def set_context(
        self,
        *,
        contract_fingerprint: str | None = None,
        seed_id: str | None = None,
        run_id: str | None = None,
        turn_id: str | None = None,
    ) -> None:
        """可选更新盖章上下文（构造时已注入的字段通常不必再调）。"""
        if contract_fingerprint is not None:
            self.contract_fingerprint = contract_fingerprint
        if seed_id is not None:
            self.seed_id = seed_id
        if run_id is not None:
            self.run_id = run_id
        if turn_id is not None:
            self._turn_id = turn_id

    def set_turn_id(self, turn_id: str) -> None:
        self._turn_id = turn_id

    def _resolve_turn_id(self, turn_id: str | None) -> str:
        resolved = turn_id if turn_id is not None else self._turn_id
        if resolved is None:
            raise RuntimeError("turn_id required; pass turn_id=… or call set_turn_id(...) first")
        return resolved

    def _next_seq(self) -> int:
        self._seq += 1
        return self._seq

    def _base(self, *, turn_id: str, actor_type: ActorType, actor_id: str) -> dict[str, Any]:
        return {
            "contract_fingerprint": self.contract_fingerprint,
            "seed_id": self.seed_id,
            "run_id": self.run_id,
            "turn_id": turn_id,
            "seq": self._next_seq(),
            "actor_type": actor_type,
            "actor_id": actor_id,
        }

    def record_llm_output(
        self,
        *,
        actor_type: ActorType,
        actor_id: str,
        content: Any = None,
        tool_calls: Sequence[Any] | None = None,
        turn_id: str | None = None,
    ) -> TrajectoryEvent:
        event = TrajectoryEvent(
            event_type="llm_output",
            content=_content_as_str(content),
            tool_calls=_serialize_tool_calls(tool_calls),
            **self._base(
                turn_id=self._resolve_turn_id(turn_id),
                actor_type=actor_type,
                actor_id=actor_id,
            ),
        )
        self._events.append(event)
        return event

    def record_tool_observation(
        self,
        *,
        actor_type: ActorType,
        actor_id: str,
        tool_name: str,
        tool_call_id: str | None = None,
        observation: Any = None,
        turn_id: str | None = None,
    ) -> TrajectoryEvent:
        event = TrajectoryEvent(
            event_type="tool_observation",
            tool_name=tool_name,
            tool_call_id=tool_call_id,
            observation=observation,
            **self._base(
                turn_id=self._resolve_turn_id(turn_id),
                actor_type=actor_type,
                actor_id=actor_id,
            ),
        )
        self._events.append(event)
        return event

    def record_reject(
        self,
        *,
        reason: str,
        actor_type: ActorType = "system",
        actor_id: str = SYSTEM_ACTOR_ID,
        turn_id: str | None = None,
    ) -> TrajectoryEvent:
        event = TrajectoryEvent(
            event_type="reject",
            reason=reason,
            **self._base(
                turn_id=self._resolve_turn_id(turn_id),
                actor_type=actor_type,
                actor_id=actor_id,
            ),
        )
        self._events.append(event)
        return event

    def record_turn_committed(
        self,
        *,
        timeline_delta: list[dict[str, Any]] | None = None,
        state_version: int | None = None,
        turn_id: str | None = None,
    ) -> TrajectoryEvent:
        event = TrajectoryEvent(
            event_type="turn_committed",
            timeline_delta=timeline_delta,
            state_version=state_version,
            **self._base(
                turn_id=self._resolve_turn_id(turn_id),
                actor_type="system",
                actor_id=SYSTEM_ACTOR_ID,
            ),
        )
        self._events.append(event)
        return event

    def list(
        self,
        *,
        seed_id: str | None = None,
        run_id: str | None = None,
        turn_id: str | None = None,
        actor_id: str | None = None,
        event_type: EventType | None = None,
    ) -> list[TrajectoryEvent]:
        out: list[TrajectoryEvent] = []
        for ev in self._events:
            if seed_id is not None and ev.seed_id != seed_id:
                continue
            if run_id is not None and ev.run_id != run_id:
                continue
            if turn_id is not None and ev.turn_id != turn_id:
                continue
            if actor_id is not None and ev.actor_id != actor_id:
                continue
            if event_type is not None and ev.event_type != event_type:
                continue
            out.append(ev)
        return out

    def flush(self, path: Path | str | None = None) -> Path | None:
        """将尚未落盘的事件追加为 JSONL。``path`` 优先，否则用 ``sink_path``；返回目标路径。"""
        dest = Path(path) if path is not None else self.sink_path
        if dest is None:
            return None
        pending = self._events[self._flushed_upto :]
        if not pending:
            return dest
        dest.parent.mkdir(parents=True, exist_ok=True)
        with dest.open("a", encoding="utf-8") as f:
            for ev in pending:
                f.write(json.dumps(ev.model_dump(mode="json"), ensure_ascii=False))
                f.write("\n")
        self._flushed_upto = len(self._events)
        return dest


def load_events_jsonl(path: str | Path) -> list[TrajectoryEvent]:
    dest = Path(path)
    if not dest.exists():
        return []
    events: list[TrajectoryEvent] = []
    with dest.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            events.append(TrajectoryEvent.model_validate(json.loads(line)))
    return events


class TrajectoryQuery:
    """从 Recorder 或 JSONL 查询的薄封装。"""

    def __init__(self, source: TrajectoryRecorder | str | Path) -> None:
        self._source = source

    def list(
        self,
        *,
        seed_id: str | None = None,
        run_id: str | None = None,
        turn_id: str | None = None,
        actor_id: str | None = None,
        event_type: EventType | None = None,
    ) -> list[TrajectoryEvent]:
        if isinstance(self._source, TrajectoryRecorder):
            return self._source.list(
                seed_id=seed_id,
                run_id=run_id,
                turn_id=turn_id,
                actor_id=actor_id,
                event_type=event_type,
            )
        events = load_events_jsonl(self._source)
        out: list[TrajectoryEvent] = []
        for ev in events:
            if seed_id is not None and ev.seed_id != seed_id:
                continue
            if run_id is not None and ev.run_id != run_id:
                continue
            if turn_id is not None and ev.turn_id != turn_id:
                continue
            if actor_id is not None and ev.actor_id != actor_id:
                continue
            if event_type is not None and ev.event_type != event_type:
                continue
            out.append(ev)
        return out


def _tool_message_from_result(result: Any) -> ToolMessage | None:
    if isinstance(result, ToolMessage):
        return result
    if isinstance(result, Command) and result.update:
        for value in result.update.values():
            items = value if isinstance(value, list) else [value]
            for item in items:
                if isinstance(item, ToolMessage):
                    return item
    return None


def make_tool_observation_awrap(
    *,
    actor_type: Literal["director", "npc"],
) -> Callable[
    [ToolCallRequest, Callable[[ToolCallRequest], Awaitable[Any]]],
    Awaitable[Any],
]:
    """供 ToolNode ``awrap_tool_call``：执行后旁路记录 tool_observation。"""

    async def _awrap(
        request: ToolCallRequest,
        execute: Callable[[ToolCallRequest], Awaitable[Any]],
    ) -> Any:
        result = await execute(request)
        config = request.runtime.config if request.runtime is not None else None
        recorder = recorder_from_config(config)
        if recorder is None:
            return result

        tool_msg = _tool_message_from_result(result)
        if tool_msg is None:
            return result

        if actor_type == "director":
            actor_id = DIRECTOR_ACTOR_ID
        else:
            state = request.state
            if not isinstance(state, dict) or "npc_perceiver" not in state:
                raise RuntimeError("npc tool observation requires state['npc_perceiver']")
            actor_id = state["npc_perceiver"].actor_id

        tool_call = request.tool_call
        recorder.record_tool_observation(
            actor_type=actor_type,
            actor_id=actor_id,
            tool_name=str(tool_call.get("name") or ""),
            tool_call_id=str(tool_msg.tool_call_id or tool_call.get("id") or ""),
            observation=str(tool_msg.content),
        )
        return result

    return _awrap
