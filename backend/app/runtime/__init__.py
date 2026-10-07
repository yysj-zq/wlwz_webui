"""无头 runtime 对外入口。

稳定导出对齐 ``model_pipeline/docs/areas/runtime.md``「对外用法」。
图节点应 ``from app.runtime.trajectory import …``，勿经本包再导出以免循环依赖。
"""

from __future__ import annotations

from typing import Any

from app.core.llm import CHAT_MODEL_FACTORY_KEY, ChatModelFactory
from app.runtime.controller import RuntimeWorldController
from app.runtime.snapshot import (
    MindState,
    SessionSnapshot,
    SnapshotMeta,
    build_default_snapshot,
    fork_snapshot,
)
from app.runtime.trajectory import (
    DIRECTOR_ACTOR_ID,
    SYSTEM_ACTOR_ID,
    TrajectoryEvent,
    TrajectoryQuery,
    TrajectoryRecorder,
    load_events_jsonl,
    make_tool_observation_awrap,
    recorder_from_config,
    summarize_timeline_delta,
)

__all__ = [
    "CHAT_MODEL_FACTORY_KEY",
    "ChatModelFactory",
    "ContractFingerprintMismatch",
    "DIRECTOR_ACTOR_ID",
    "SYSTEM_ACTOR_ID",
    "HeadlessSession",
    "MindState",
    "RuntimeWorldController",
    "SessionSnapshot",
    "SnapshotMeta",
    "TrajectoryEvent",
    "TrajectoryQuery",
    "TrajectoryRecorder",
    "TurnStepResult",
    "build_default_snapshot",
    "fork_snapshot",
    "load_events_jsonl",
    "make_tool_observation_awrap",
    "open_default_world",
    "open_from_snapshot",
    "recorder_from_config",
    "summarize_timeline_delta",
]


def __getattr__(name: str) -> Any:
    """延迟加载 session 门面，切断 ``runtime.__init__ → session → turn_graph`` 环。"""
    if name in {
        "ContractFingerprintMismatch",
        "HeadlessSession",
        "TurnStepResult",
        "open_default_world",
        "open_from_snapshot",
    }:
        from app.runtime import session as _session

        return getattr(_session, name)
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
