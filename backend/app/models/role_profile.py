from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    LargeBinary,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.user import now_utc

if TYPE_CHECKING:
    from app.models.conversation import Conversation
    from app.models.user import User


class RoleProfile(Base):
    __tablename__ = "role_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(128))
    system_prompt: Mapped[str | None] = mapped_column(Text, nullable=True)
    default_speaker_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    config_json: Mapped[dict[str, Any] | None] = mapped_column(
        JSONB().with_variant(Text, "sqlite"),  # type: ignore[no-untyped-call]
        nullable=True,
    )
    is_builtin: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    avatar_blob: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    avatar_mime_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)

    user: Mapped[User | None] = relationship("User", back_populates="role_profiles")

    __table_args__ = (UniqueConstraint("user_id", "name", name="uix_user_role_name"),)


class TTSVoiceCache(Base):
    __tablename__ = "tts_voice_cache"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    conversation_id: Mapped[int | None] = mapped_column(ForeignKey("conversations.id"), nullable=True, index=True)
    text_hash: Mapped[str] = mapped_column(String(64), index=True)
    speaker_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    audio_uri: Mapped[str] = mapped_column(String(512))
    duration: Mapped[float | None] = mapped_column(Float(), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="ready", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped[User] = relationship("User", back_populates="tts_voice_caches")
    conversation: Mapped[Conversation | None] = relationship("Conversation", back_populates="tts_voice_caches")
