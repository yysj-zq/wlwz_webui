from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ActorMind, Conversation, User
from app.schemas import (
    CommittedTurn,
    EntityKind,
    NPCResponse,
    Position,
    RoleRegistryEntry,
    TimelineEntry,
    TimelineKind,
    TurnContext,
    WorldEntity,
    WorldEntityPatch,
    WorldState,
)
from app.services import actor_mind_service, digest_service, roles_service, timeline_service
from app.services.conflict import assert_state_version_matches
from app.services.conversation_service import create_conversation, get_conversation

DEFAULT_MAP_ID = "tongfu_inn"
# 新会话默认扮演的注册表 slug；必须存在于 in_game 注册表，不是系统身份常量。
DEFAULT_PLAYED_SLUG = "player"
INITIAL_SCENE_NOTE = (
    "同福客栈屋内，午后阳光斜斜洒在木地板上。柜台后佟掌柜抱着账本嘀咕，老白手里抹布转得飞起，小郭蹲在桌边擦着木椅。"
)

_RESERVED_PUBLIC_STATE_KEYS = frozenset({"memories", "goal", "inventory"})


def _build_object_entities() -> dict[str, WorldEntity]:
    """客栈里的静态物件实体。物件不是角色，硬编码在此是合理的。"""
    return {
        "counter": WorldEntity(
            id="counter",
            name="柜台",
            kind=EntityKind.OBJECT,
            position=Position(x=10, y=3),
            asset_key="counter",
            public_state={"description": "客栈柜台，账簿和算盘都放在附近。"},
            interactable=True,
        ),
        "table": WorldEntity(
            id="table",
            name="方桌",
            kind=EntityKind.OBJECT,
            position=Position(x=6, y=8),
            asset_key="table",
            public_state={"description": "客人常坐的木桌。"},
            interactable=True,
        ),
        "chair": WorldEntity(
            id="chair",
            name="椅子",
            kind=EntityKind.OBJECT,
            position=Position(x=7, y=8),
            asset_key="chair",
            public_state={"description": "木椅。"},
            interactable=True,
        ),
        "ledger": WorldEntity(
            id="ledger",
            name="账簿",
            kind=EntityKind.OBJECT,
            position=Position(x=11, y=3),
            asset_key="ledger",
            public_state={"description": "记录客栈收支的账簿。"},
            interactable=True,
        ),
        "abacus": WorldEntity(
            id="abacus",
            name="算盘",
            kind=EntityKind.OBJECT,
            position=Position(x=9, y=3),
            asset_key="abacus",
            public_state={"description": "佟掌柜算账用的算盘。"},
            interactable=True,
        ),
        "stairs": WorldEntity(
            id="stairs",
            name="楼梯",
            kind=EntityKind.OBJECT,
            position=Position(x=13, y=5),
            asset_key="stairs",
            public_state={"description": "通向二楼客房。"},
            interactable=True,
        ),
    }


def _npc_entity_from_entry(entry: RoleRegistryEntry) -> WorldEntity:
    return WorldEntity(
        id=entry.slug,
        name=entry.name,
        kind=EntityKind.NPC,
        position=Position(x=entry.spawn.x, y=entry.spawn.y),
        asset_key=entry.slug,
        direction=entry.spawn.direction,
        interactable=True,
    )


def _player_entity_from_entry(entry: RoleRegistryEntry) -> WorldEntity:
    """把注册表角色作为玩家可控实体（kind=PLAYER）。id 用其 slug，与 player_actor_id 对齐。"""
    return WorldEntity(
        id=entry.slug,
        name=entry.name,
        kind=EntityKind.PLAYER,
        position=Position(x=entry.spawn.x, y=entry.spawn.y),
        asset_key=entry.slug,
        direction=entry.spawn.direction,
        public_state={"mood": "neutral"},
    )


def _require_played_entry(registry: list[RoleRegistryEntry], played_actor_id: str) -> RoleRegistryEntry:
    played = next((e for e in registry if e.slug == played_actor_id), None)
    if played is None:
        if played_actor_id == DEFAULT_PLAYED_SLUG:
            raise ValueError(f'注册表缺少默认扮演角色 slug="{DEFAULT_PLAYED_SLUG}"')
        raise ValueError(f"未知可扮演角色: {played_actor_id}")
    return played


def _assemble_entities(registry: list[RoleRegistryEntry], played_actor_id: str) -> dict[str, WorldEntity]:
    """按 embody 规则从注册表 + 物件生成世界实体字典。

    - played 必须是 registry 中某条的 slug，否则 ValueError。
    - played 那条 → kind=PLAYER；其余全部 registry 条目 → kind=NPC；再加物件。
    - 附身同福角色时，slug=player 的外来角色仍以 NPC 在场。
    """
    played = _require_played_entry(registry, played_actor_id)
    entities: dict[str, WorldEntity] = _build_object_entities()
    entities[played.slug] = _player_entity_from_entry(played)
    for entry in registry:
        if entry.slug == played_actor_id:
            continue
        entities[entry.slug] = _npc_entity_from_entry(entry)
    return entities


async def build_world_state(
    db: AsyncSession, *, played_actor_id: str = DEFAULT_PLAYED_SLUG, state_version: int = 1
) -> WorldState:
    """从注册表派生世界状态。played_actor_id 须为 in_game 注册表 slug（默认 DEFAULT_PLAYED_SLUG）。"""
    registry = await roles_service.list_ingame_registry(db)
    entities = _assemble_entities(registry, played_actor_id)
    return WorldState(
        map_id=DEFAULT_MAP_ID,
        state_version=state_version,
        player_actor_id=played_actor_id,
        entities=entities,
    )


async def ensure_conversation_world(
    db: AsyncSession,
    user: User | None,
    conversation_id: int | None,
    title: str | None = None,
) -> tuple[Conversation | None, WorldState]:
    if user is None:
        return None, await build_world_state(db, played_actor_id=DEFAULT_PLAYED_SLUG)

    if conversation_id is None:
        # 新会话默认扮演注册表中的 player（外来可扮演角色）。
        registry = await roles_service.list_ingame_registry(db)
        entities = _assemble_entities(registry, DEFAULT_PLAYED_SLUG)
        world_state = WorldState(
            map_id=DEFAULT_MAP_ID,
            state_version=1,
            player_actor_id=DEFAULT_PLAYED_SLUG,
            entities=entities,
        )
        conversation = await create_conversation(
            db,
            user,
            title or "新的会话",
            map_id=world_state.map_id,
            state_version=world_state.state_version,
            world_state_json=world_state.model_dump(mode="json"),
        )
        # 全员播种：注册表角色一视同仁；当前扮演者的 mind 闲置，切换后即可被 LLM 使用。
        await actor_mind_service.seed_minds_no_commit(db, conversation.id, registry)

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

    conversation = await get_conversation(db, user, conversation_id)
    return conversation, WorldState.model_validate(conversation.world_state_json)


def _flip_played_kinds(world_state: WorldState, played_actor_id: str) -> dict[str, WorldEntity]:
    """就地翻转新旧扮演者的 PLAYER/NPC kind，保留坐标与其它状态。"""
    previous = world_state.player_actor_id
    entities = dict(world_state.entities)

    if previous != played_actor_id and previous in entities:
        entities[previous] = entities[previous].model_copy(update={"kind": EntityKind.NPC, "interactable": True})
    entities[played_actor_id] = entities[played_actor_id].model_copy(
        update={"kind": EntityKind.PLAYER, "interactable": False}
    )
    return entities


async def switch_played_role(db: AsyncSession, conversation: Conversation, played_actor_id: str) -> WorldState:
    """切换扮演角色：只改 player_actor_id + 就地翻 kind，保留当前会话境况（位置等）。

    不重建实体、不补播心智（心智在建会话时已全员播种）。
    played_actor_id 必须是 in_game 注册表 slug，且已在当前世界实体中，否则 ValueError。
    """
    registry = await roles_service.list_ingame_registry(db)
    valid_slugs = {e.slug for e in registry}
    if played_actor_id not in valid_slugs:
        raise ValueError(f"非法扮演角色: {played_actor_id}")

    current = WorldState.model_validate(conversation.world_state_json)
    if played_actor_id not in current.entities:
        raise ValueError(f"扮演角色不在当前世界: {played_actor_id}")

    new_version = conversation.state_version + 1
    world_state = current.model_copy(
        update={
            "player_actor_id": played_actor_id,
            "state_version": new_version,
            "entities": _flip_played_kinds(current, played_actor_id),
        }
    )

    conversation.world_state_json = world_state.model_dump(mode="json")
    conversation.state_version = new_version
    await db.commit()
    await db.refresh(conversation)
    return world_state


async def ensure_chat_target_entity(
    db: AsyncSession,
    user: User | None,
    controller: WorldController,
    target_slug: str,
) -> None:
    """chat 目标健壮化：目标不在世界实体中但为该用户合法注册表角色时，惰性以 NPC 形式补入。

    必须在 :meth:`WorldController.commit` 之后调用：``commit`` 会用 DB 覆盖内存
    ``world_state``，若先补入再 ``commit``，补入会被冲掉。

    补入只改内存 world_state 并播种心智（不落库、不 bump 版本）；随后 run_chat 的
    commit_turn 会把该实体一并持久化。目标完全非法则抛 ValueError（端点转 4xx）。
    """
    ws = controller.world_state
    if target_slug in ws.entities:
        return
    entry = await roles_service.resolve_role_registry_entry(db, user, target_slug)
    if entry is None:
        raise ValueError(f"未知对话目标: {target_slug}")
    entities = dict(ws.entities)
    entities[entry.slug] = _npc_entity_from_entry(entry)
    controller.world_state = ws.model_copy(update={"entities": entities})
    await actor_mind_service.seed_minds_no_commit(db, controller.conversation_id, [entry])


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

    def __init__(self, db: AsyncSession, conversation: Conversation, world_state: WorldState) -> None:
        self.db = db
        self.conversation_id: int = conversation.id
        self._conversation = conversation
        self.world_state: WorldState = world_state
        self._last_loaded_timeline: list[TimelineEntry] | None = None
        self._expected_state_version: int | None = None

    async def _lock_conversation_row(self) -> Conversation:
        """``SELECT … FOR UPDATE`` 锁定会话行，闭合长回合 TOCTOU。"""
        stmt = select(Conversation).where(Conversation.id == self.conversation_id).with_for_update()
        locked = (await self.db.execute(stmt)).scalar_one()
        self._conversation = locked
        return locked

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
        return await actor_mind_service.get_or_create(self.db, self.conversation_id, actor_id)

    async def commit(
        self,
        *,
        expected_state_version: int,
    ) -> None:
        """乐观锁入口：在跑图/落库前校验客户端传来的 state_version。

        - ``SELECT … FOR UPDATE`` 锁定会话行后校验。
        - 一致时刷新内存 ``self.world_state``，并记住 expected 供
          :meth:`commit_turn` 落库前再校验（闭合 LLM 长回合 TOCTOU）。
        - 不一致时抛 :class:`~app.services.conflict.StateVersionConflict`。

        本方法只做版本校验，**不**调用 ``commit_turn`` 也不跑图。
        """
        locked = await self._lock_conversation_row()
        current = WorldState.model_validate(locked.world_state_json)
        assert_state_version_matches(current, expected_state_version)
        self.world_state = current
        self._expected_state_version = expected_state_version

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
        if self._expected_state_version is None:
            raise RuntimeError("commit_turn requires a prior successful commit(expected_state_version=…)")
        locked = await self._lock_conversation_row()
        db_world = WorldState.model_validate(locked.world_state_json)
        assert_state_version_matches(db_world, self._expected_state_version)

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

        orm_rows = await timeline_service.append_entries_no_commit(self.db, self.conversation_id, entries)
        for row in orm_rows:
            row.state_version = new_version
        for actor_id, response in npc_responses:
            await actor_mind_service.upsert_increment_no_commit(
                self.db, self.conversation_id, actor_id, response, at_version=new_version
            )
        self._conversation.world_state_json = next_world.model_dump(mode="json")
        self._conversation.state_version = new_version
        # flush 先拿到自增 PK，再写入响应；否则 timelineDelta.id 恒为 null，
        # 前端 cache 与 GET /timeline 再合并时会重复或无法用 afterId 增量。
        await self.db.flush()
        timeline_delta = [
            entry.model_copy(update={"id": row.id, "created_at": row.created_at})
            for entry, row in zip(entries, orm_rows, strict=True)
        ]
        await self.db.commit()
        await self.db.refresh(self._conversation)

        self.world_state = next_world
        return CommittedTurn(world_state=next_world, timeline_delta=timeline_delta, narration=scene_note)

    def _validate_patches(self, patches: list[WorldEntityPatch]) -> None:
        for ep in patches:
            if ep.entity_id not in self.world_state.entities:
                raise ValueError(f"未知世界实体: {ep.entity_id}")
            if ep.public_state is not None:
                conflicting = _RESERVED_PUBLIC_STATE_KEYS & ep.public_state.keys()
                if conflicting:
                    raise ValueError(f"实体 {ep.entity_id} 的 public_state 不能写入 {sorted(conflicting)}")
