"""_player_move_narration 纯函数快测：玩家移动 act_patch → 中文旁白。

背景：时间线渲染只对含 speak/narration 的 entry 出文；玩家前端只移动时
entry 只有 act_patch，需后端补一句 narration 才能被 director/NPC 感知。
"""

from __future__ import annotations

from app.graph.nodes.ingest_player import _player_move_narration
from app.schemas import Position, WorldEntityPatch
from app.schemas.enums import Direction


def test_position_and_direction() -> None:
    patches = [
        WorldEntityPatch(entity_id="player", position=Position(x=6, y=6), direction=Direction.EAST)
    ]
    assert _player_move_narration("player", patches) == "走到(6,6)，面向东"


def test_empty_patches_returns_none() -> None:
    assert _player_move_narration("player", []) is None


def test_direction_only() -> None:
    patches = [WorldEntityPatch(entity_id="player", direction=Direction.SOUTH)]
    assert _player_move_narration("player", patches) == "面向南"


def test_position_only() -> None:
    patches = [WorldEntityPatch(entity_id="player", position=Position(x=2, y=9))]
    assert _player_move_narration("player", patches) == "走到(2,9)"


def test_all_four_directions() -> None:
    for direction, cn in [
        (Direction.NORTH, "北"),
        (Direction.SOUTH, "南"),
        (Direction.EAST, "东"),
        (Direction.WEST, "西"),
    ]:
        patches = [WorldEntityPatch(entity_id="player", direction=direction)]
        assert _player_move_narration("player", patches) == f"面向{cn}"


def test_ignores_other_entities_patch() -> None:
    # 只认玩家操作自己的 patch；对别的实体的改动不产生玩家旁白。
    patches = [WorldEntityPatch(entity_id="table", position=Position(x=1, y=1))]
    assert _player_move_narration("player", patches) is None


def test_picks_players_own_patch_among_many() -> None:
    patches = [
        WorldEntityPatch(entity_id="table", position=Position(x=1, y=1)),
        WorldEntityPatch(entity_id="player", position=Position(x=3, y=4), direction=Direction.NORTH),
    ]
    assert _player_move_narration("player", patches) == "走到(3,4)，面向北"


def test_player_patch_without_move_returns_none() -> None:
    # 有台词的对话交互场景 act_patch 可能带玩家但无 position/direction → 不硬造旁白。
    patches = [WorldEntityPatch(entity_id="player")]
    assert _player_move_narration("player", patches) is None


def test_direction_label_cn() -> None:
    # narration 里的方向中文改走 Direction.label（表内聚在枚举），逐一核对映射。
    assert Direction.NORTH.label == "北"
    assert Direction.SOUTH.label == "南"
    assert Direction.EAST.label == "东"
    assert Direction.WEST.label == "西"
