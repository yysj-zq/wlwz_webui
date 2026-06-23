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
    NORTH = "north"
    SOUTH = "south"
    EAST = "east"
    WEST = "west"
