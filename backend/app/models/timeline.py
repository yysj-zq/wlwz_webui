from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import JSON, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core import Base
from app.models.user import now_utc

if TYPE_CHECKING:
    from app.models.conversation import Conversation


class Timeline(Base):
    __tablename__ = "timeline"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    conversation_id: Mapped[int] = mapped_column(ForeignKey("conversations.id"), nullable=False)
    turn_id: Mapped[str] = mapped_column(String(36), nullable=False)
    intra_turn_seq: Mapped[int] = mapped_column(Integer, nullable=False)
    state_version: Mapped[int | None] = mapped_column(Integer, nullable=True)
    actor_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    speak: Mapped[str | None] = mapped_column(Text, nullable=True)
    target_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    narration: Mapped[str | None] = mapped_column(Text, nullable=True)
    act_patch_json: Mapped[dict[str, Any] | None] = mapped_column(
        JSON().with_variant(JSONB(), "postgresql"),  # type: ignore[no-untyped-call]
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)

    conversation: Mapped[Conversation] = relationship(back_populates="timeline_entries")

    __table_args__ = (
        UniqueConstraint("conversation_id", "turn_id", "intra_turn_seq", name="uix_timeline_turn_seq"),
        Index("ix_timeline_conversation_id", "conversation_id", "id"),
    )
