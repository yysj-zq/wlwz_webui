from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core import Base

if TYPE_CHECKING:
    from app.models.conversation import Conversation
    from app.models.role_profile import RoleProfile, TTSVoiceCache


def now_utc() -> datetime:
    return datetime.now(UTC)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    username: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, onupdate=now_utc)

    conversations: Mapped[list[Conversation]] = relationship("Conversation", back_populates="user", cascade="all, delete-orphan")
    role_profiles: Mapped[list[RoleProfile]] = relationship("RoleProfile", back_populates="user", cascade="all, delete-orphan")
    settings: Mapped[list[UserSetting]] = relationship("UserSetting", back_populates="user", cascade="all, delete-orphan")
    tts_voice_caches: Mapped[list[TTSVoiceCache]] = relationship("TTSVoiceCache", back_populates="user")


class UserSetting(Base):
    __tablename__ = "user_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    key: Mapped[str] = mapped_column(String(128))
    value_json: Mapped[dict[str, Any] | None] = mapped_column(
        JSONB().with_variant(Text, "sqlite"),  # type: ignore[no-untyped-call]
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)

    user: Mapped[User] = relationship("User", back_populates="settings")

    __table_args__ = (UniqueConstraint("user_id", "key", name="uix_user_setting_key"),)
