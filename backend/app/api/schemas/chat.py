from typing import List, Optional

from pydantic import BaseModel


class MessageIn(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: List[MessageIn]
    userRole: str
    assistantRole: str
    conversationId: Optional[int] = None
