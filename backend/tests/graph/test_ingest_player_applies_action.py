"""ingest_player 在 game 模式把玩家 act_patch 落地到 controller.world_state，
使 director/NPC 的 query 工具观察到既定事实。"""

from __future__ import annotations

from typing import cast

import pytest
from langchain_core.runnables import RunnableConfig
from sqlalchemy.ext.asyncio import AsyncSession

from app.graph.nodes.ingest_player import ingest_player_input
from app.models import User
from app.schemas import Direction, GameActionRequest, Position, TurnMode, WorldEntityPatch
from app.services import WorldController, ensure_conversation_world


async def _controller(db: AsyncSession, email: str) -> WorldController:
    user = User(email=email, username=email.split("@")[0], password_hash="hash")
    db.add(user)
    await db.commit()
    await db.refresh(user)
    conversation, world_state = await ensure_conversation_world(db, user, conversation_id=None)
    assert conversation is not None
    return WorldController(db, conversation, world_state)


@pytest.mark.asyncio
async def test_ingest_game_move_applies_to_world_state(
    async_db_session: AsyncSession,
) -> None:
    controller = await _controller(async_db_session, "ingestmove@example.com")
    game_req = GameActionRequest(
        actor_id="player",
        state_version=1,
        act_patch=[WorldEntityPatch(entity_id="player", position=Position(x=9, y=9), direction=Direction.NORTH)],
    )
    config = cast(
        RunnableConfig,
        {"configurable": {"mode": TurnMode.GAME, "game_request": game_req, "controller": controller}},
    )

    await ingest_player_input({}, config)

    player = controller.world_state.entities["player"]
    assert (player.position.x, player.position.y) == (9, 9)
    assert player.direction == Direction.NORTH
