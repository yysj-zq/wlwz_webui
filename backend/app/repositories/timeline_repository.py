from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Timeline
from app.repositories.base import BaseRepository
from app.schemas import TimelineEntry, WorldEntityPatch


class TimelineRepository(BaseRepository[Timeline]):
    async def list_by_conversation(
        self,
        db: AsyncSession,
        conversation_id: int,
        *,
        after_id: int | None = None,
        limit: int | None = None,
    ) -> list[TimelineEntry]:
        stmt = select(Timeline).where(Timeline.conversation_id == conversation_id)
        if after_id is not None:
            stmt = stmt.where(Timeline.id > after_id)
        stmt = stmt.order_by(Timeline.id)
        if limit is not None:
            stmt = stmt.limit(limit)
        rows = (await db.execute(stmt)).scalars().all()
        return [self._to_entry(row) for row in rows]

    async def append_no_commit(
        self,
        db: AsyncSession,
        conversation_id: int,
        entries: list[TimelineEntry],
    ) -> list[Timeline]:
        orm_rows: list[Timeline] = []
        for entry in entries:
            row = Timeline(
                conversation_id=conversation_id,
                turn_id=entry.turn_id,
                intra_turn_seq=entry.intra_turn_seq,
                state_version=None,
                actor_id=entry.actor_id,
                kind=entry.kind,
                speak=entry.speak,
                target_id=entry.target_id,
                act_patch_json=[ep.model_dump(mode="json") for ep in entry.act_patch] if entry.act_patch else None,
            )
            db.add(row)
            orm_rows.append(row)
        return orm_rows

    @staticmethod
    def _to_entry(row: Timeline) -> TimelineEntry:
        return TimelineEntry(
            id=row.id,
            turn_id=row.turn_id,
            intra_turn_seq=row.intra_turn_seq,
            actor_id=row.actor_id,
            kind=row.kind,  # type: ignore[arg-type]
            speak=row.speak,
            target_id=row.target_id,
            act_patch=[WorldEntityPatch.model_validate(ep) for ep in row.act_patch_json] if row.act_patch_json else [],
            created_at=row.created_at,
        )


timeline_repository = TimelineRepository(Timeline)
