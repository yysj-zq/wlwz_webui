from pydantic import Field

from app.schemas._alias import CamelModel


class TTSRequest(CamelModel):
    """TTS 合成请求体。"""

    text: str = Field(
        ...,
        min_length=1,
        max_length=4096,
        description="待合成的纯文本（不含 SSML）。",
        examples=["你好，欢迎来到百战堂。"],
    )
    assistantRole: str = Field(
        ..., description="目标角色 slug 或名称，用于查询 default_speaker_id。", examples=["baizhantang"]
    )
    speakerId: str | None = Field(
        default=None, description="TTS speaker ID 覆盖；为空时按 assistantRole 查默认。", examples=["spk_male_01"]
    )
