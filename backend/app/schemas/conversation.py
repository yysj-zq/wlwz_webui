from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class ConversationOut(BaseModel):
    id: int
    title: str
    description: str | None = None
    model_name: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ConversationRename(BaseModel):
    title: str


class TimelineEntryOut(BaseModel):
    id: int
    turn_id: str
    intra_turn_seq: int
    actor_id: str | None = None
    kind: str
    speak: str | None = None
    target_id: str | None = None
    narration: str | None = None
    act_patch: dict[str, Any] | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
