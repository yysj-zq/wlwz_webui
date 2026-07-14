from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core import Base
from app.models.user import now_utc

if TYPE_CHECKING:
    from app.models.actor_mind import ActorMind
    from app.models.role_profile import TTSVoiceCache
    from app.models.timeline import Timeline
    from app.models.user import User
    from app.models.world_digest import WorldDigest


class Conversation(Base):
    __tablename__ = "conversations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(String(512), nullable=True)
    model_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False)

    map_id: Mapped[str] = mapped_column(String(64), default="tongfu_inn", nullable=False)
    state_version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    world_state_json: Mapped[dict[str, Any]] = mapped_column(
        JSON().with_variant(JSONB(), "postgresql"),  # type: ignore[no-untyped-call]
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, onupdate=now_utc)

    user: Mapped[User] = relationship("User", back_populates="conversations")
    timeline_entries: Mapped[list[Timeline]] = relationship(
        "Timeline",
        back_populates="conversation",
        cascade="all, delete-orphan",
        order_by="(Timeline.turn_id, Timeline.intra_turn_seq)",
    )
    actor_minds: Mapped[list[ActorMind]] = relationship(
        "ActorMind",
        back_populates="conversation",
        cascade="all, delete-orphan",
    )
    world_digest: Mapped[WorldDigest | None] = relationship(
        "WorldDigest",
        back_populates="conversation",
        cascade="all, delete-orphan",
        uselist=False,
    )
    tts_voice_caches: Mapped[list[TTSVoiceCache]] = relationship("TTSVoiceCache", back_populates="conversation")
