"""HeadlessSession：无头回合驱动门面（step / fork / trajectory）。"""

from __future__ import annotations

from typing import Any

from langchain_core.runnables import RunnableConfig
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.contract_check import load_lock
from app.core.llm import CHAT_MODEL_FACTORY_KEY, ChatModelFactory
from app.graph.state import TurnGraphState
from app.runtime.controller import RuntimeWorldController
from app.runtime.snapshot import SessionSnapshot, build_default_snapshot, fork_snapshot
from app.runtime.trajectory import TrajectoryEvent, TrajectoryRecorder, summarize_timeline_delta
from app.schemas import GameActionRequest, TimelineEntry, TurnMode, WorldState


class ContractFingerprintMismatch(RuntimeError):
    """会话盖章与当前 ``contract.lock.json`` 不一致，拒绝推进。"""


class TurnStepResult(BaseModel):
    """``HeadlessSession.step`` 单回合结果。"""

    world: WorldState
    timeline_delta: list[TimelineEntry] = Field(default_factory=list)
    narration: str | None = None
    turn_id: str
    trajectory: list[TrajectoryEvent] = Field(default_factory=list)


def _current_lock_fingerprint() -> str:
    lock = load_lock()
    fingerprint = lock.get("contract_fingerprint")
    if not isinstance(fingerprint, str) or not fingerprint:
        raise ValueError("contract.lock.json missing contract_fingerprint")
    return fingerprint


def _coerce_game_action(action: GameActionRequest | dict[str, Any] | Any, *, state_version: int) -> GameActionRequest:
    """将同构对象规范为 ``GameActionRequest``；无头路径以 snapshot 版本填 ``state_version``。"""
    if isinstance(action, GameActionRequest):
        return action.model_copy(update={"state_version": state_version})
    if isinstance(action, dict):
        payload = dict(action)
        payload["state_version"] = state_version
        return GameActionRequest.model_validate(payload)
    if hasattr(action, "model_dump"):
        payload = action.model_dump(mode="python")
        payload["state_version"] = state_version
        return GameActionRequest.model_validate(payload)
    raise TypeError(f"unsupported game action type: {type(action)!r}")


class HeadlessSession:
    """持有 ``RuntimeWorldController`` + ``TrajectoryRecorder`` + snapshot 视图。"""

    def __init__(
        self,
        controller: RuntimeWorldController,
        recorder: TrajectoryRecorder,
        *,
        chat_model_factory: ChatModelFactory | None = None,
        sink_path: str | None = None,
    ) -> None:
        self._controller = controller
        self._recorder = recorder
        self._chat_model_factory = chat_model_factory
        self._sink_path = sink_path

    @classmethod
    def _from_snapshot(
        cls,
        snapshot: SessionSnapshot,
        *,
        sink_path: str | None = None,
        chat_model_factory: ChatModelFactory | None = None,
    ) -> HeadlessSession:
        controller = RuntimeWorldController(snapshot, chat_model_factory=chat_model_factory)
        recorder = TrajectoryRecorder(
            seed_id=snapshot.meta.seed_id,
            run_id=snapshot.meta.run_id,
            contract_fingerprint=snapshot.meta.contract_fingerprint,
            sink_path=sink_path,
        )
        return cls(controller, recorder, chat_model_factory=chat_model_factory, sink_path=sink_path)

    @property
    def snapshot(self) -> SessionSnapshot:
        return self._controller.snapshot

    @property
    def controller(self) -> RuntimeWorldController:
        """公开控制器，供 P3a 门禁等直接 ``query_*.invoke(..., config=…)``。"""
        return self._controller

    @property
    def trajectory(self) -> TrajectoryRecorder:
        return self._recorder

    @property
    def chat_model_factory(self) -> ChatModelFactory | None:
        return self._chat_model_factory

    async def step(
        self,
        action: GameActionRequest | dict[str, Any] | Any,
        *,
        chat_model_factory: ChatModelFactory | None = None,
    ) -> TurnStepResult:
        """推进一回合。

        ``chat_model_factory``：本回合覆盖；缺省用开局注入的 factory；再缺省则图内
        ``resolve_chat_model`` 回落 webui ``get_chat_model``（仅适合误用排查，P3b/G3/G5
        必须显式注入教师或被测模型）。
        """
        # 延迟导入，避免 ``runtime.__init__ / trajectory ← turn_graph ← commit`` 环。
        from app.graph.turn_graph import TURN_GRAPH

        current_fp = _current_lock_fingerprint()
        if self.snapshot.meta.contract_fingerprint != current_fp:
            raise ContractFingerprintMismatch(
                f"contract_fingerprint mismatch: session={self.snapshot.meta.contract_fingerprint!r} "
                f"lock={current_fp!r}"
            )

        factory = chat_model_factory if chat_model_factory is not None else self._chat_model_factory
        self._controller.set_chat_model_factory(factory)

        state_version = self._controller.world_state.state_version
        game_request = _coerce_game_action(action, state_version=state_version)

        await self._controller.commit(expected_state_version=state_version)

        configurable: dict[str, Any] = {
            "mode": TurnMode.GAME,
            "game_request": game_request,
            "controller": self._controller,
            "trajectory_recorder": self._recorder,
        }
        if factory is not None:
            configurable[CHAT_MODEL_FACTORY_KEY] = factory

        config: RunnableConfig = {
            "configurable": configurable,
            "recursion_limit": 30,
        }
        raw = await TURN_GRAPH.ainvoke({}, config=config)
        state: TurnGraphState = raw  # type: ignore[assignment]
        committed = state["committed_turn"]
        turn_id = state["player_entry"].turn_id

        self._recorder.record_turn_committed(
            turn_id=turn_id,
            timeline_delta=summarize_timeline_delta(committed.timeline_delta),
            state_version=committed.world_state.state_version,
        )

        turn_events = self._recorder.list(turn_id=turn_id)
        return TurnStepResult(
            world=committed.world_state,
            timeline_delta=list(committed.timeline_delta),
            narration=committed.narration,
            turn_id=turn_id,
            trajectory=turn_events,
        )

    def fork(self, n: int = 2) -> list[HeadlessSession]:
        """基于当前 snapshot 深拷贝分叉；继承 chat_model_factory；各新 run_id / recorder。"""
        children = fork_snapshot(self.snapshot, n=n)
        return [
            HeadlessSession._from_snapshot(
                child,
                sink_path=self._sink_path,
                chat_model_factory=self._chat_model_factory,
            )
            for child in children
        ]


async def open_from_snapshot(
    snapshot: SessionSnapshot,
    *,
    sink_path: str | None = None,
    chat_model_factory: ChatModelFactory | None = None,
) -> HeadlessSession:
    return HeadlessSession._from_snapshot(
        snapshot,
        sink_path=sink_path,
        chat_model_factory=chat_model_factory,
    )


async def open_default_world(
    db: AsyncSession,
    *,
    seed_id: str = "default",
    played_actor_id: str | None = None,
    sink_path: str | None = None,
    chat_model_factory: ChatModelFactory | None = None,
) -> HeadlessSession:
    snapshot = await build_default_snapshot(db, seed_id=seed_id, played_actor_id=played_actor_id)
    return await open_from_snapshot(
        snapshot,
        sink_path=sink_path,
        chat_model_factory=chat_model_factory,
    )
