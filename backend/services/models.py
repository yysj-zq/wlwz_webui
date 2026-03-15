from datetime import datetime
from pydantic import BaseModel, EmailStr
from typing import List, Optional

class Message(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: List[Message]
    userRole: str
    assistantRole: str
    conversationId: Optional[int] = None


class TTSRequest(BaseModel):
    text: str
    assistantRole: str
    speakerId: str | None = None


class UserCreate(BaseModel):
    email: EmailStr
    password: str
    username: Optional[str] = None


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    id: int
    email: EmailStr
    username: Optional[str] = None
    is_admin: bool

    class Config:
        from_attributes = True


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

