from typing import Any

from pydantic import BaseModel, Field

from app.schemas.enums import Direction


class RoleOut(BaseModel):
    id: int
    slug: str | None = None
    name: str
    system_prompt: str | None = None
    default_speaker_id: str | None = None
    avatar_url: str | None = None
    is_builtin: bool
    is_mine: bool = False
    in_game: bool = False

    class Config:
        from_attributes = True


class RoleCreate(BaseModel):
    name: str
    system_prompt: str | None = None
    default_speaker_id: str | None = None


class RoleUpdate(BaseModel):
    name: str | None = None
    system_prompt: str | None = None
    default_speaker_id: str | None = None


class RoleSpawn(BaseModel):
    """角色出生点：世界构建时用于生成实体的初始坐标与朝向。"""

    x: int
    y: int
    direction: Direction = Direction.SOUTH


class RoleRegistryEntry(BaseModel):
    """可进入游戏的角色注册项：世界构建与心智播种的统一数据源。

    由 RoleProfile（内置行的 config_json，或自定义角色的派生值）投影而来，
    屏蔽底层存储细节，向 world_service / actor_mind_service 暴露稳定结构。
    """

    id: int
    slug: str
    name: str
    default_speaker_id: str | None = None
    in_game: bool
    spawn: RoleSpawn
    persona: str = ""
    relations: dict[str, str] = Field(default_factory=dict)
    goal: dict[str, Any] = Field(default_factory=dict)
