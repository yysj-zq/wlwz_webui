from enum import StrEnum


class EntityKind(StrEnum):
    """世界实体类型。

    成员说明：
    - `player`：由人类控制的主角实体（同一时刻最多 1 个，由 `WorldState.player_actor_id` 指定）。
    - `npc`：由 LLM 驱动的 NPC 实体，拥有心智（记忆/目标/性格）。
    - `object`：不可交互或弱交互的物件/摆设。
    """

    PLAYER = "player"
    NPC = "npc"
    OBJECT = "object"


class TimelineKind(StrEnum):
    """统一时间线条目类型。

    成员说明：
    - `speak`：仅说话（聊天/对话）。
    - `act`：仅动作（移动/改变世界状态）。
    - `speak_and_act`：同回合内既说话又动作（玩家或 NPC 都可能产生）。
    - `scene`：场景/环境旁白（actor_id 为空）。
    """

    SPEAK = "speak"
    ACT = "act"
    SPEAK_AND_ACT = "speak_and_act"
    SCENE = "scene"


class MemoryScope(StrEnum):
    """记忆存储范围。

    成员说明：
    - `short_term`：短期记忆，随会话轮次滚动压缩，默认范围。
    - `long_term`：长期记忆，跨会话保留，重要事实优先写入。
    """

    SHORT_TERM = "short_term"
    LONG_TERM = "long_term"


class TurnMode(StrEnum):
    """会话交互模式。

    成员说明：
    - `game`：走完整 Director 调度（world_writes + 感知者 + narration）。
    - `chat`：跳过 Director，直接由 ingest 节点构造 dispatch_override。
    """

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
