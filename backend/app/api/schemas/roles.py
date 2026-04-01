from typing import Optional

from pydantic import BaseModel


class RoleOut(BaseModel):
    id: int
    name: str
    system_prompt: Optional[str] = None
    default_speaker_id: Optional[str] = None
    avatar_url: Optional[str] = None
    is_builtin: bool
    is_mine: bool = False

    class Config:
        from_attributes = True


class RoleCreate(BaseModel):
    name: str
    system_prompt: Optional[str] = None
    default_speaker_id: Optional[str] = None


class RoleUpdate(BaseModel):
    name: Optional[str] = None
    system_prompt: Optional[str] = None
    default_speaker_id: Optional[str] = None
