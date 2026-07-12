"""render_timeline_for_messages 的 role 映射测试。

核心不变量：一条发言渲染成 assistant 当且仅当它对当前 viewer 是「我说的」。
- director 视角：整条时间线都是客观材料，没有一句是导演说的 → 全 user
  （历史上曾把 NPC 台词标成 assistant，与导演 system prompt「你不写台词」矛盾）
- npc 视角：仅该 NPC 自己的发言是 assistant，其余角色（含玩家）都是 user
- 旁白（SCENE）：对任何视角都是 user
"""

from __future__ import annotations

from app.schemas.enums import TimelineKind
from app.schemas.world import TimelineEntry
from app.services.timeline_service import render_timeline_for_messages


def _speak(actor_id: str, text: str) -> TimelineEntry:
    return TimelineEntry(turn_id="t1", actor_id=actor_id, kind=TimelineKind.SPEAK, speak=text)


def _scene(text: str) -> TimelineEntry:
    return TimelineEntry(turn_id="t1", kind=TimelineKind.SCENE, speak=text)


def _timeline() -> list[TimelineEntry]:
    return [
        _scene("天黑了"),
        _speak("player", "你是谁"),
        _speak("baizhantang", "在下白展堂"),
        _speak("tongxiangyu", "哎哟喂"),
    ]


_NAMES = {"baizhantang": "白展堂", "tongxiangyu": "佟湘玉", "player": "玩家"}


def test_director_view_has_no_assistant_role() -> None:
    """director 视角：没有任何一条是 assistant（NPC 台词不该被当成导演说的）。"""
    rendered = render_timeline_for_messages(
        _timeline(), viewer="director", npc_name_lookup=_NAMES
    )
    roles = [m["role"] for m in rendered]
    assert "assistant" not in roles
    assert roles == ["user", "user", "user", "user"]


def test_npc_view_only_self_is_assistant() -> None:
    """npc 视角：仅白展堂自己的发言是 assistant，玩家和其他 NPC 都是 user。"""
    rendered = render_timeline_for_messages(
        _timeline(), viewer="npc", npc_name_lookup=_NAMES, self_actor_id="baizhantang"
    )
    by_content = {m["content"]: m["role"] for m in rendered}
    assert by_content["白展堂：在下白展堂"] == "assistant"
    assert by_content["佟湘玉：哎哟喂"] == "user"
    assert by_content["玩家：你是谁"] == "user"
    assert by_content["【天黑了】"] == "user"


def test_npc_view_without_self_id_has_no_assistant() -> None:
    """npc 视角但未指定 self（无自身历史）：不应误把任何发言标成 assistant。"""
    rendered = render_timeline_for_messages(
        _timeline(), viewer="npc", npc_name_lookup=_NAMES
    )
    assert "assistant" not in [m["role"] for m in rendered]
