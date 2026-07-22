"""render_timeline_for_messages 的 role 映射测试。

核心不变量：所有历史发言一律 user，没有任何 assistant。
- 旁白（SCENE）、玩家、各 NPC（含渲染视角自身过去的台词）都渲染成 user
- assistant 只留给模型本轮真正产出的 tool_call，历史里不出现
  （避免「角色名：台词」的反向 few-shot 诱导模型续写文本而非调工具）
"""

from __future__ import annotations

from app.schemas.enums import TimelineKind
from app.schemas.world import TimelineEntry, WorldEntityPatch
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


def test_all_history_rendered_as_user() -> None:
    """所有历史发言（旁白、玩家、各 NPC，含叙述视角自身的过去台词）一律 user，无 assistant。"""
    timeline = [*_timeline(), _speak("baizhantang", "我白展堂")]
    rendered = render_timeline_for_messages(timeline, npc_name_lookup=_NAMES)
    roles = [m["role"] for m in rendered]
    assert set(roles) == {"user"}
    assert "assistant" not in roles


def test_target_id_rendered_as_chinese_name() -> None:
    """有 target_id 的发言：target_id 经 lookup 翻成中文名，拼成「（对x）」前缀。"""
    entry = TimelineEntry(
        turn_id="t1",
        actor_id="player",
        kind=TimelineKind.SPEAK,
        speak="你是谁",
        target_id="baizhantang",
    )
    rendered = render_timeline_for_messages([entry], npc_name_lookup=_NAMES)
    assert rendered[0]["content"] == "玩家（对白展堂）：你是谁"


def test_speak_with_narration_appended() -> None:
    """NPC 台词 + narration：渲染成「名字：台词（narration）」。"""
    entry = TimelineEntry(
        turn_id="t1",
        actor_id="baizhantang",
        kind=TimelineKind.SPEAK,
        speak="在下白展堂",
        narration="拱手行礼",
    )
    rendered = render_timeline_for_messages([entry], npc_name_lookup=_NAMES)
    assert rendered[0]["content"] == "白展堂：在下白展堂（拱手行礼）"


def test_pure_act_entry_skipped() -> None:
    """纯动作 entry（有 act_patch、无 speak 无 narration）：机器态不进文本，被跳过。"""
    entry = TimelineEntry(
        turn_id="t1",
        actor_id="baizhantang",
        act_patch=[WorldEntityPatch(entity_id="baizhantang", public_state={"mood": "warm"})],
    )
    assert entry.kind == TimelineKind.ACT  # _fill_kind 自动推断
    rendered = render_timeline_for_messages([entry], npc_name_lookup=_NAMES)
    assert rendered == []


def test_narration_only_no_speak() -> None:
    """无 speak 但有 narration：渲染成「名字：（narration）」。"""
    entry = TimelineEntry(
        turn_id="t1",
        actor_id="baizhantang",
        narration="转身离去",
    )
    rendered = render_timeline_for_messages([entry], npc_name_lookup=_NAMES)
    assert rendered[0]["content"] == "白展堂：（转身离去）"


def test_scene_renders_narration_when_no_speak() -> None:
    """director 世界变更 SCENE：speak 为空、narration 非空 → 渲染 narration。"""
    entry = TimelineEntry(
        turn_id="t1",
        kind=TimelineKind.SCENE,
        speak=None,
        narration="门被推开，一阵冷风灌进屋里",
        act_patch=[WorldEntityPatch(entity_id="table", public_state={"state": "moved"})],
    )
    rendered = render_timeline_for_messages([entry], npc_name_lookup=_NAMES)
    assert rendered == [{"role": "user", "content": "【门被推开，一阵冷风灌进屋里】"}]


def test_scene_prefers_speak_for_pure_narration() -> None:
    """纯叙事 SCENE（开场白/摘要）：有 speak 无 narration → 仍读 speak。"""
    entry = TimelineEntry(turn_id="t1", kind=TimelineKind.SCENE, speak="午后阳光斜斜洒下")
    rendered = render_timeline_for_messages([entry], npc_name_lookup=_NAMES)
    assert rendered == [{"role": "user", "content": "【午后阳光斜斜洒下】"}]
