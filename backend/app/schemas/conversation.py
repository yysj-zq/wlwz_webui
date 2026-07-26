from datetime import datetime

from pydantic import Field

from app.schemas._alias import CamelModel


class ConversationOut(CamelModel):
    """会话摘要（不含会话体）。"""

    id: int = Field(..., description="会话主键 ID。", examples=[1])
    title: str = Field(..., description="会话标题，前端默认展示。", examples=["百战堂血案"])
    description: str | None = Field(default=None, description="可选会话描述/摘要。", examples=["悬疑推理 · 第一案"])
    model_name: str | None = Field(default=None, description="创建时使用的模型名。", examples=["gpt-4o-mini"])
    created_at: datetime = Field(..., description="创建时间（UTC ISO-8601）。")
    updated_at: datetime = Field(..., description="最近一次更新时间（UTC ISO-8601）。")


class ConversationRename(CamelModel):
    """重命名会话请求体。"""

    title: str = Field(..., min_length=1, max_length=120, description="新会话标题。", examples=["百战堂血案（重试）"])
