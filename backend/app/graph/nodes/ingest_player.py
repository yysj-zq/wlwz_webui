"""ingest_player_input 节点。

构造 player 的 TimelineEntry（speak + act_patch 二选一或兼有）；
chat 模式同时直接构造 dispatch 跳过 director。
"""

from __future__ import annotations

import uuid
from typing import Any

from langchain_core.runnables import RunnableConfig

from app.graph.state import TurnGraphState
from app.schemas import (
    DirectorDispatch,
    Perceiver,
    TimelineEntry,
    TimelineKind,
    TurnMode,
    WorldEntityPatch,
)


def _player_move_narration(actor_id: str, patches: list[WorldEntityPatch]) -> str | None:
    """为玩家自己的移动 act_patch 派生一句中文旁白（entry.narration）。

    玩家不是 LLM：NPC/director 的 narration 是 LLM 产出 act_patch 时同步写的
    「这套动作的中文描述」，玩家没有这个环节，故由代码在此从其移动 act_patch 派生同源的
    narration，填进 game 模式 player_entry.narration。render 层只机械读取 entry.narration，
    绝不从 act_patch 推导——中文映射的生产责任落在这里，不落在渲染。

    「走到(x,y)，面向{东/南/西/北}」；坐标与 query_entity 看到的一致，方向走 Direction.label。
    找不到玩家 patch、或既无 position 又无 direction 时返回 None。
    """
    patch = next((p for p in patches if p.entity_id == actor_id), None)
    if patch is None:
        return None
    parts: list[str] = []
    if patch.position is not None:
        parts.append(f"走到({patch.position.x},{patch.position.y})")
    if patch.direction is not None:
        parts.append(f"面向{patch.direction.label}")
    return "，".join(parts) if parts else None


async def ingest_player_input(state: TurnGraphState, config: RunnableConfig) -> dict[str, Any]:
    cfg = config.get("configurable", {})
    mode = cfg["mode"]
    turn_id = uuid.uuid4().hex

    if mode == TurnMode.CHAT:
        chat_req = cfg["chat_request"]
        # 玩家说话的 actor_id 取当前扮演身份（会话 player_actor_id，须为注册表 slug），
        # 使时间线渲染出正确的说话人姓名。
        controller = cfg["controller"]
        player_actor_id = controller.world_state.player_actor_id
        player_entry = TimelineEntry(
            turn_id=turn_id,
            actor_id=player_actor_id,
            kind=TimelineKind.SPEAK,
            speak=chat_req.content,
            target_id=chat_req.targetActorId,
        )
        dispatch = DirectorDispatch(
            world_writes=[],
            perceivers=[Perceiver(actor_id=chat_req.targetActorId, perception_reason="用户直接对你说话")],
        )
        return {"player_entry": player_entry, "dispatch": dispatch}

    # game 模式
    game_req = cfg["game_request"]
    player_entry = TimelineEntry(
        turn_id=turn_id,
        actor_id=game_req.actorId,
        speak=game_req.speak,
        target_id=game_req.targetId,
        act_patch=game_req.act_patch,
        narration=_player_move_narration(game_req.actorId, game_req.act_patch),
    )
    # 玩家动作即既定事实：落地到内存 world_state，让后续 director/NPC 的
    # query_entity / query_neighbors 观察到玩家动作之后的世界。
    controller = cfg["controller"]
    controller.apply_player_action(game_req.act_patch)
    return {"player_entry": player_entry}
