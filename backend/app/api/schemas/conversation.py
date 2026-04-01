from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class ConversationOut(BaseModel):
    id: int
    title: str
    description: Optional[str] = None
    model_name: Optional[str] = None
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
