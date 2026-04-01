from pydantic import BaseModel


class TTSRequest(BaseModel):
    text: str
    assistantRole: str
    speakerId: str | None = None
