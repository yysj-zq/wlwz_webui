from pydantic import BaseModel


class RoleOut(BaseModel):
    id: int
    name: str
    system_prompt: str | None = None
    default_speaker_id: str | None = None
    avatar_url: str | None = None
    is_builtin: bool
    is_mine: bool = False

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
