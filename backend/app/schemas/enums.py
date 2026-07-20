from enum import StrEnum


class EntityKind(StrEnum):
    PLAYER = "player"
    NPC = "npc"
    OBJECT = "object"


class TimelineKind(StrEnum):
    SPEAK = "speak"
    ACT = "act"
    SPEAK_AND_ACT = "speak_and_act"
    SCENE = "scene"


class MemoryScope(StrEnum):
    SHORT_TERM = "short_term"
    LONG_TERM = "long_term"


class TurnMode(StrEnum):
    GAME = "game"
    CHAT = "chat"


class Direction(StrEnum):
    """朝向。成员绑定 (英文值, 中文标签)：value 给前端/DB(机器态)，label 给 LLM/时间线(中文)。"""

    NORTH = "north", "北"
    SOUTH = "south", "南"
    EAST = "east", "东"
    WEST = "west", "西"

    label: str

    def __new__(cls, value: str, label: str) -> "Direction":
        obj = str.__new__(cls, value)
        obj._value_ = value
        obj.label = label
        return obj
