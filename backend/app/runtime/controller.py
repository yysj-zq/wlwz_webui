"""RuntimeWorldController：与 TURN_GRAPH / tools 对齐的内存态控制器。"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from app.runtime.snapshot import MindState, SessionSnapshot
from app.schemas import (
    CommittedTurn,
    NPCResponse,
    TimelineEntry,
    TimelineKind,
    TurnContext,
    WorldEntityPatch,
    WorldState,
)
from app.services import timeline_service
from app.services.conflict import assert_state_version_matches
from app.services.world_service import apply_world_patches

_RESERVED_PUBLIC_STATE_KEYS = frozenset({"memories", "goal", "inventory"})

# 无头会话无真实 conversations 行；图若读 conversation_id 仅作占位。
_PSEUDO_CONVERSATION_ID = -1


class RuntimeWorldController:
    """内存 SessionSnapshot 上的 WorldController 表面（duck-type）。

    - ``commit`` 只校验快照内 ``state_version``（无 FOR UPDATE）
    - ``commit_turn`` 同构更新 world / timeline / minds / version，不写 conversations 表
    - ``after_commit_digest`` no-op（训练可复现）
    """

    def __init__(self, snapshot: SessionSnapshot) -> None:
        self.snapshot = snapshot
        self.conversation_id: int = _PSEUDO_CONVERSATION_ID
        self.db = None
        self._expected_state_version: int | None = None
        self._last_loaded_timeline: list[TimelineEntry] | None = None

    @property
    def world_state(self) -> WorldState:
        return self.snapshot.world

    @world_state.setter
    def world_state(self, value: WorldState) -> None:
        self.snapshot.world = value

    def apply_player_action(self, patches: list[WorldEntityPatch]) -> None:
        if not patches:
            return
        self._validate_patches(patches)
        self.world_state = apply_world_patches(self.world_state, patches)

    async def commit(self, *, expected_state_version: int) -> None:
        assert_state_version_matches(self.world_state, expected_state_version)
        self._expected_state_version = expected_state_version

    async def commit_turn(
        self,
        turn_id: str,
        player_entry: TimelineEntry,
        director_writes: list[WorldEntityPatch],
        npc_responses: list[tuple[str, NPCResponse]],
        scene_note: str | None,
    ) -> CommittedTurn:
        if self._expected_state_version is None:
            raise RuntimeError("commit_turn requires a prior successful commit(expected_state_version=…)")
        assert_state_version_matches(self.world_state, self._expected_state_version)

        self._validate_patches(director_writes)
        for _, response in npc_responses:
            self._validate_patches(response.act_patch)

        next_world = apply_world_patches(self.world_state, director_writes)
        for _, response in npc_responses:
            next_world = apply_world_patches(next_world, response.act_patch)

        entries: list[TimelineEntry] = []
        seq = 0
        player_entry = player_entry.model_copy(update={"turn_id": turn_id, "intra_turn_seq": seq})
        entries.append(player_entry)
        seq += 1
        if director_writes:
            entries.append(
                TimelineEntry(
                    turn_id=turn_id,
                    intra_turn_seq=seq,
                    kind=TimelineKind.SCENE,
                    speak=None,
                    narration=scene_note,
                    act_patch=director_writes,
                )
            )
            seq += 1
        for actor_id, response in npc_responses:
            if response.speak is None and not response.act_patch:
                continue
            entries.append(
                TimelineEntry(
                    turn_id=turn_id,
                    intra_turn_seq=seq,
                    actor_id=actor_id,
                    speak=response.speak,
                    act_patch=response.act_patch,
                    narration=response.narration,
                )
            )
            seq += 1

        new_version = next_world.state_version + 1
        next_world = next_world.model_copy(update={"state_version": new_version})

        now = datetime.now(UTC)
        timeline_delta = [entry.model_copy(update={"id": None, "created_at": now}) for entry in entries]
        self.snapshot.timeline.extend(timeline_delta)

        for actor_id, response in npc_responses:
            self._upsert_mind_increment(actor_id, response, at_version=new_version)

        self.world_state = next_world
        return CommittedTurn(world_state=next_world, timeline_delta=timeline_delta, narration=scene_note)

    async def load_turn_context(self) -> TurnContext:
        full_timeline = list(self.snapshot.timeline)
        compacted = await timeline_service.Compactor().compact(
            full_timeline, name_lookup=self.world_state.name_lookup()
        )
        self._last_loaded_timeline = full_timeline
        digest = self.snapshot.digest or ""
        return TurnContext(digest=digest, timeline=compacted)

    async def load_mind_view(self, actor_id: str) -> dict[str, Any]:
        mind = self.snapshot.minds.get(actor_id)
        if mind is None:
            return {"persona": "", "relations": {}, "goal": {}, "recent_memories": []}
        memories = list(mind.memories)
        return {
            "persona": mind.persona or "",
            "relations": dict(mind.relations),
            "goal": dict(mind.goal),
            "recent_memories": memories[-6:],
            "inventory": dict(mind.inventory),
        }

    async def after_commit_digest(
        self,
        committed: CommittedTurn,
        director_writes: list[WorldEntityPatch],
        npc_responses: list[tuple[str, NPCResponse]],
    ) -> None:
        return None

    def _upsert_mind_increment(self, actor_id: str, response: NPCResponse, *, at_version: int) -> None:
        mind = self.snapshot.minds.get(actor_id)
        if mind is None:
            mind = MindState()
            self.snapshot.minds[actor_id] = mind

        if response.memory_writes:
            memories = list(mind.memories)
            for mw in response.memory_writes:
                memories.append(
                    {
                        "at_version": at_version,
                        "content": mw.content,
                        "importance": mw.importance,
                        "scope": mw.scope,
                    }
                )
            mind.memories = memories[-30:]

        if response.goal_update is not None:
            mind.goal = response.goal_update.model_dump(mode="json", exclude_none=True)

        if response.inventory_ops:
            inv = dict(mind.inventory)
            for op in response.inventory_ops:
                inv[op.item_id] = int(inv.get(op.item_id, 0)) + op.delta
                if inv[op.item_id] <= 0:
                    inv.pop(op.item_id, None)
            mind.inventory = inv

    def _validate_patches(self, patches: list[WorldEntityPatch]) -> None:
        for ep in patches:
            if ep.entity_id not in self.world_state.entities:
                raise ValueError(f"未知世界实体: {ep.entity_id}")
            if ep.public_state is not None:
                conflicting = _RESERVED_PUBLIC_STATE_KEYS & ep.public_state.keys()
                if conflicting:
                    raise ValueError(f"实体 {ep.entity_id} 的 public_state 不能写入 {sorted(conflicting)}")
