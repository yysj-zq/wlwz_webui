"""_after_director_tools 路由单元测试：三态直测（不碰 DB、不编译图）。

- dispatch 未写入（None）→ "director_step"（query 回灌 / 非法打回，继续循环）
- dispatch 有 perceivers → list[Send]，每个 perceiver 一个 npc_worker
- dispatch 无 perceivers → "commit"（直接落库；返回节点名以保留完整 state）
"""

from __future__ import annotations

from langgraph.types import Send

from app.graph.turn_graph import _after_director_tools
from app.schemas.world import DirectorDispatch, Perceiver, TurnContext


def _ctx() -> TurnContext:
    return TurnContext(digest="d", timeline=[])


def test_after_director_tools_no_dispatch_loops_back() -> None:
    assert _after_director_tools({"director_messages": []}) == "director_step"


def test_after_director_tools_with_perceivers_fans_out() -> None:
    dispatch = DirectorDispatch(
        world_writes=[],
        perceivers=[
            Perceiver(actor_id="baizhantang", perception_reason="被直接称呼"),
            Perceiver(actor_id="guofurong", perception_reason="在 2 格内目击"),
        ],
    )
    result = _after_director_tools({"dispatch": dispatch, "context": _ctx(), "director_messages": []})

    assert isinstance(result, list)
    assert [s.node for s in result] == ["npc_worker", "npc_worker"]
    assert all(isinstance(s, Send) for s in result)
    assert [s.arg["npc_perceiver"].actor_id for s in result] == ["baizhantang", "guofurong"]


def test_after_director_tools_no_perceivers_goes_to_commit() -> None:
    dispatch = DirectorDispatch(world_writes=[], perceivers=[])
    result = _after_director_tools({"dispatch": dispatch, "context": _ctx(), "director_messages": []})
    # 返回节点名而非 Send({})，以保留完整父图 state 供 commit 读 dispatch / player_entry
    assert result == "commit"
