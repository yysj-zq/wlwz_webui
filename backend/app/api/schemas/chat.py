from pydantic import BaseModel


class MessageIn(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: list[MessageIn]
    userRole: str
    assistantRole: str
    conversationId: int | None = None
