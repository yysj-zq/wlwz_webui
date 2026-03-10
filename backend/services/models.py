from pydantic import BaseModel
from typing import List

class Message(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: List[Message]
    userRole: str
    assistantRole: str


class TTSRequest(BaseModel):
    text: str
    assistantRole: str
    speakerId: str | None = None
