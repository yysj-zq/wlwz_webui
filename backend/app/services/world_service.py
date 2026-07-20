from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ActorMind, Conversation, User
from app.schemas import (
    CommittedTurn,
    EntityKind,
    NPCResponse,
    Position,
    TimelineEntry,
    TimelineKind,
    TurnContext,
    WorldEntity,
    WorldEntityPatch,
    WorldState,
)
from app.services import actor_mind_service, digest_service, timeline_service
from app.services.conversation_service import create_conversation, get_conversation

DEFAULT_MAP_ID = "tongfu_inn"
INITIAL_SCENE_NOTE = (
    "同福客栈屋内，午后阳光斜斜洒在木地板上。柜台后佟掌柜抱着账本嘀咕，"
    "老白手里抹布转得飞起，小郭蹲在桌边擦着木椅。"
)

_RESERVED_PUBLIC_STATE_KEYS = frozenset({"memories", "goal", "inventory"})


def build_default_world_state() -> WorldState:
    entities = {
        "player": WorldEntity(
            id="player", name="玩家", kind=EntityKind.PLAYER,
            position=Position(x=5, y=6), asset_key="player", direction="south",
            public_state={"mood": "neutral"},
        ),
        "baizhantang": WorldEntity(
            id="baizhantang", name="白展堂", kind=EntityKind.NPC,
            position=Position(x=8, y=5), asset_key="baizhantang", direction="south",
            public_state={"mood": "alert", "role": "跑堂"}, interactable=True,
        ),
        "guofurong": WorldEntity(
            id="guofurong", name="郭芙蓉", kind=EntityKind.NPC,
            position=Position(x=4, y=4), asset_key="guofurong", direction="south",
            public_state={"mood": "energetic", "role": "杂役"}, interactable=True,
        ),
        "tongxiangyu": WorldEntity(
            id="tongxiangyu", name="佟湘玉", kind=EntityKind.NPC,
            position=Position(x=10, y=4), asset_key="tongxiangyu", direction="south",
            public_state={"mood": "concerned", "role": "掌柜"}, interactable=True,
        ),
        "counter": WorldEntity(
            id="counter", name="柜台", kind=EntityKind.OBJECT, position=Position(x=10, y=3),
            asset_key="counter", public_state={"description": "客栈柜台，账簿和算盘都放在附近。"},
            interactable=True,
        ),
        "table": WorldEntity(
            id="table", name="方桌", kind=EntityKind.OBJECT, position=Position(x=6, y=8),
            asset_key="table", public_state={"description": "客人常坐的木桌。"}, interactable=True,
        ),
        "chair": WorldEntity(
            id="chair", name="椅子", kind=EntityKind.OBJECT, position=Position(x=7, y=8),
            asset_key="chair", public_state={"description": "木椅。"}, interactable=True,
        ),
        "ledger": WorldEntity(
            id="ledger", name="账簿", kind=EntityKind.OBJECT, position=Position(x=11, y=3),
            asset_key="ledger", public_state={"description": "记录客栈收支的账簿。"}, interactable=True,
        ),
        "abacus": WorldEntity(
            id="abacus", name="算盘", kind=EntityKind.OBJECT, position=Position(x=9, y=3),
            asset_key="abacus", public_state={"description": "佟掌柜算账用的算盘。"}, interactable=True,
        ),
        "stairs": WorldEntity(
            id="stairs", name="楼梯", kind=EntityKind.OBJECT, position=Position(x=13, y=5),
            asset_key="stairs", public_state={"description": "通向二楼客房。"}, interactable=True,
        ),
    }
    return WorldState(map_id=DEFAULT_MAP_ID, state_version=1, entities=entities)


async def ensure_conversation_world(
    db: AsyncSession,
    user: User | None,
    conversation_id: int | None,
    title: str | None = None,
) -> tuple[Conversation | None, WorldState]:
    if user is None:
        return None, build_default_world_state()

    if conversation_id is None:
        world_state = build_default_world_state()
        conversation = await create_conversation(
            db, user, title or "新的会话",
            map_id=world_state.map_id,
            state_version=world_state.state_version,
            world_state_json=world_state.model_dump(mode="json"),
        )
    else:
        conversation = await get_conversation(db, user, conversation_id)
        return conversation, WorldState.model_validate(conversation.world_state_json)

    await actor_mind_service.seed_default_minds_no_commit(db, conversation.id)

    scene_entry = TimelineEntry(
        turn_id=uuid.uuid4().hex,
        intra_turn_seq=0,
        kind=TimelineKind.SCENE,
        speak=INITIAL_SCENE_NOTE,
    )
    await timeline_service.append_entries_no_commit(db, conversation.id, [scene_entry])

    await db.commit()
    await db.refresh(conversation)
    return conversation, world_state


def apply_world_patches(world_state: WorldState, patches: list[WorldEntityPatch]) -> WorldState:
    if not patches:
        return world_state
    next_payload = world_state.model_dump(mode="json")
    entities = next_payload["entities"]
    for ep in patches:
        if ep.entity_id not in entities:
            raise ValueError(f"未知世界实体: {ep.entity_id}")
        if ep.position is not None:
            entities[ep.entity_id]["position"] = ep.position.model_dump(mode="json")
        if ep.direction is not None:
            entities[ep.entity_id]["direction"] = ep.direction
        if ep.interactable is not None:
            entities[ep.entity_id]["interactable"] = ep.interactable
        if ep.public_state is not None:
            entities[ep.entity_id]["public_state"] = {
                **entities[ep.entity_id].get("public_state", {}),
                **ep.public_state,
            }
    return WorldState.model_validate(next_payload)


class WorldController:
    """世界状态管控入口。持有 db 和 conversation_id，外部只需调其方法即可读写世界。"""

    def __init__(
        self, db: AsyncSession, conversation: Conversation, world_state: WorldState
    ) -> None:
        self.db = db
        self.conversation_id: int = conversation.id
        self._conversation = conversation
        self.world_state: WorldState = world_state
        self._last_loaded_timeline: list[TimelineEntry] | None = None

    async def load_turn_context(self) -> TurnContext:
        digest = await digest_service.get_digest(self.db, self.conversation_id)
        full_timeline = await timeline_service.list_timeline(self.db, self.conversation_id)
        compacted = await timeline_service.Compactor().compact(
            full_timeline, name_lookup=self.world_state.name_lookup()
        )
        self._last_loaded_timeline = full_timeline
        return TurnContext(digest=digest, timeline=compacted)

    def apply_player_action(self, patches: list[WorldEntityPatch]) -> None:
        """把玩家提交的 act_patch 就地 apply 到内存 world_state，使其在
        director/NPC 观察前即成为既定事实。不 commit、不 bump version——
        版本递增与持久化统一在 commit_turn。空 patches no-op。
        """
        if not patches:
            return
        self._validate_patches(patches)
        self.world_state = apply_world_patches(self.world_state, patches)

    async def load_actor_mind(self, actor_id: str) -> ActorMind | None:
        return await actor_mind_service.get_or_create(
            self.db, self.conversation_id, actor_id
        )

    # TODO: timeline 只存最终交互结果，NPC/Director 的中间推理过程（tool 查询、多轮思考、重试）全部丢弃。
    #  后续考虑是否需要持久化 reasoning trace 用于 debug/replay/可解释性。
    async def commit_turn(
        self,
        turn_id: str,
        player_entry: TimelineEntry,
        director_writes: list[WorldEntityPatch],
        npc_responses: list[tuple[str, NPCResponse]],
        scene_note: str | None,
    ) -> CommittedTurn:
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
            # director 的世界变更是无主语的客观记录：合成单条 SCENE。
            # narration 是 director_writes 的中文映射（进 speak 展示窗口，见渲染层），
            # act_patch 同条携带机器态。narration 不独立存在，故无 director_writes 不产此条。
            entries.append(
                TimelineEntry(
                    turn_id=turn_id, intra_turn_seq=seq,
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
                    turn_id=turn_id, intra_turn_seq=seq,
                    actor_id=actor_id, speak=response.speak, act_patch=response.act_patch,
                    narration=response.narration,
                )
            )
            seq += 1

        new_version = next_world.state_version + 1
        next_world = next_world.model_copy(update={"state_version": new_version})

        orm_rows = await timeline_service.append_entries_no_commit(
            self.db, self.conversation_id, entries
        )
        for row in orm_rows:
            row.state_version = new_version
        for actor_id, response in npc_responses:
            await actor_mind_service.upsert_increment_no_commit(
                self.db, self.conversation_id, actor_id, response, at_version=new_version
            )
        self._conversation.world_state_json = next_world.model_dump(mode="json")
        self._conversation.state_version = new_version
        await self.db.commit()
        await self.db.refresh(self._conversation)

        self.world_state = next_world
        return CommittedTurn(world_state=next_world, timeline_delta=entries, narration=scene_note)

    def _validate_patches(self, patches: list[WorldEntityPatch]) -> None:
        for ep in patches:
            if ep.entity_id not in self.world_state.entities:
                raise ValueError(f"未知世界实体: {ep.entity_id}")
            if ep.public_state is not None:
                conflicting = _RESERVED_PUBLIC_STATE_KEYS & ep.public_state.keys()
                if conflicting:
                    raise ValueError(f"实体 {ep.entity_id} 的 public_state 不能写入 {sorted(conflicting)}")
