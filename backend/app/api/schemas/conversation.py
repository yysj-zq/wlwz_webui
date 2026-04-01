from datetime import datetime

from pydantic import BaseModel


class ConversationOut(BaseModel):
    id: int
    title: str
    description: str | None = None
    model_name: str | None = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ConversationRename(BaseModel):
    title: str


class MessageOut(BaseModel):
    id: int
    role: str
    content: str
    created_at: datetime
