from typing import Any

from pydantic import Field

from app.schemas._alias import CamelModel
from app.schemas.enums import Direction


class RoleOut(CamelModel):
    """角色对外公开信息。"""

    id: int = Field(..., description="角色主键 ID。", examples=[1])
    slug: str | None = Field(
        default=None, description="URL 友好 slug，内置角色固定；自定义角色由后端生成。", examples=["baizhantang"]
    )
    name: str = Field(..., description="展示用角色名。", examples=["百战堂"])
    system_prompt: str | None = Field(
        default=None,
        description="注入 LLM 的系统提示词；为空时使用后端默认。",
        examples=["你是一位身经百战的老将，言语简洁。"],
    )
    default_speaker_id: str | None = Field(
        default=None,
        description="TTS 默认 speaker ID；未设置则 TTS 调用须显式传入 speakerId。",
        examples=["spk_male_01"],
    )
    avatar_url: str | None = Field(
        default=None,
        description="头像 URL（指向 /roles/{id}/avatar），未上传时为 null。",
        examples=["/api/roles/1/avatar"],
    )
    is_builtin: bool = Field(..., description="是否系统内置角色（内置不可修改/删除）。", examples=[True])
    is_mine: bool = Field(default=False, description="是否当前用户创建的自定义角色。", examples=[False])
    in_game: bool = Field(default=False, description="是否可作为世界实体进入游戏。", examples=[True])


class RoleCreate(CamelModel):
    """创建自定义角色请求体。"""

    name: str = Field(..., min_length=1, max_length=64, description="角色名（同一用户下唯一）。", examples=["百战堂"])
    system_prompt: str | None = Field(
        default=None, description="LLM 系统提示词，可选。", examples=["你是一位身经百战的老将。"]
    )
    default_speaker_id: str | None = Field(
        default=None, description="TTS 默认 speaker ID，可选。", examples=["spk_male_01"]
    )


class RoleUpdate(CamelModel):
    """更新自定义角色请求体（局部更新）。"""

    name: str | None = Field(
        default=None, min_length=1, max_length=64, description="新角色名。", examples=["百战堂（重命名）"]
    )
    system_prompt: str | None = Field(
        default=None, description="新的系统提示词。", examples=["你是一位身经百战的老将，言语中带江湖气。"]
    )
    default_speaker_id: str | None = Field(default=None, description="新的默认 speaker ID。", examples=["spk_male_02"])


class RoleSpawn(CamelModel):
    """角色出生点：世界构建时用于生成实体的初始坐标与朝向。"""

    x: int = Field(..., description="出生点 x 坐标（地图 tile 坐标，原点左上）。", examples=[5])
    y: int = Field(..., description="出生点 y 坐标（地图 tile 坐标，原点左上）。", examples=[3])
    direction: Direction = Field(default=Direction.SOUTH, description="出生时朝向，默认南。")


class RoleRegistryEntry(CamelModel):
    """可进入游戏的角色注册项：世界构建与心智播种的统一数据源。

    由 RoleProfile（内置行的 config_json，或自定义角色的派生值）投影而来，
    屏蔽底层存储细节，向 world_service / actor_mind_service 暴露稳定结构。
    """

    id: int = Field(..., description="角色主键 ID。", examples=[1])
    slug: str = Field(..., description="角色 slug，唯一标识。", examples=["baizhantang"])
    name: str = Field(..., description="展示名。", examples=["百战堂"])
    default_speaker_id: str | None = Field(default=None, description="TTS 默认 speaker ID。", examples=["spk_male_01"])
    in_game: bool = Field(..., description="是否可进入游戏世界。", examples=[True])
    spawn: RoleSpawn = Field(..., description="出生点配置。")
    persona: str = Field(
        default="", description="角色人格/性格简述，供 LLM 使用。", examples=["身经百战的老将，言语简洁。"]
    )
    relations: dict[str, str] = Field(
        default_factory=dict, description="对其他角色 ID 的人物关系描述。", examples=[{"player": "恩师"}]
    )
    goal: dict[str, Any] = Field(default_factory=dict, description="初始目标结构，可由 LLM 进一步生成。", examples=[{}])
