from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import JSON, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.user import now_utc

if TYPE_CHECKING:
    from app.models.conversation import Conversation


class ActorMind(Base):
    __tablename__ = "actor_minds"

    conversation_id: Mapped[int] = mapped_column(ForeignKey("conversations.id"), primary_key=True)
    actor_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    persona: Mapped[str] = mapped_column(Text, default="")
    relations_json: Mapped[dict[str, Any]] = mapped_column(
        JSON().with_variant(JSONB(), "postgresql"),  # type: ignore[no-untyped-call]
        default=dict,
    )
    memories_json: Mapped[list[dict[str, Any]]] = mapped_column(
        JSON().with_variant(JSONB(), "postgresql"),  # type: ignore[no-untyped-call]
        default=list,
    )
    goal_json: Mapped[dict[str, Any]] = mapped_column(
        JSON().with_variant(JSONB(), "postgresql"),  # type: ignore[no-untyped-call]
        default=dict,
    )
    inventory_json: Mapped[dict[str, Any]] = mapped_column(
        JSON().with_variant(JSONB(), "postgresql"),  # type: ignore[no-untyped-call]
        default=dict,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=now_utc, onupdate=now_utc
    )

    conversation: Mapped[Conversation] = relationship(back_populates="actor_minds")
