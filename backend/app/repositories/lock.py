"""Edit-lock data access: the 0..1 lease row per project (ADR-0015).

Pure data access (no domain rules, no commits). The service decides whether a
lock is live/expired and who may take it; this layer just reads, upserts, and
deletes the row.
"""
import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.project_edit_lock import ProjectEditLock


class LockRepository:
    """Reads/writes for the single project_edit_lock row of a project."""

    def __init__(self, session: AsyncSession) -> None:
        """Bind the repository to a request-scoped AsyncSession."""
        self.session = session

    async def get(self, project_id: uuid.UUID) -> ProjectEditLock | None:
        """Return the project's lock row, or None when unlocked."""
        # populate_existing: try_take/force_take write through Core statements
        # that bypass the identity map, so a plain select could hand back a
        # stale ORM copy loaded earlier in the same request.
        result = await self.session.execute(
            select(ProjectEditLock)
            .where(ProjectEditLock.project_id == project_id)
            .execution_options(populate_existing=True)
        )
        return result.scalar_one_or_none()

    def _insert(self):
        """INSERT construct carrying ON CONFLICT for the bound dialect."""
        name = self.session.get_bind().dialect.name
        maker = sqlite_insert if name == "sqlite" else pg_insert
        return maker(ProjectEditLock)

    async def try_take(
        self,
        project_id: uuid.UUID,
        user_id: uuid.UUID,
        expires_at: datetime,
        now: datetime,
    ) -> bool:
        """Take the lease for user_id iff it is free, already theirs, or expired.

        One statement, so mutual exclusion is the database's job: a read-then-
        write pair let two concurrent acquires both see "no live lock" and both
        write — one crashed on the primary key (500) and, on an expired row,
        both were told they held it. ON CONFLICT DO UPDATE ... WHERE serializes
        on the row and re-evaluates the condition against the winner's committed
        version, so the loser matches no row.

        Returns True when the caller now holds the lease, False when another
        user holds it live (the caller should raise/return a conflict).
        """
        stmt = self._insert().values(
            project_id=project_id, locked_by=user_id, expires_at=expires_at
        )
        stmt = stmt.on_conflict_do_update(
            index_elements=[ProjectEditLock.project_id],
            set_={"locked_by": user_id, "expires_at": expires_at},
            where=(
                (ProjectEditLock.locked_by == user_id)
                | (ProjectEditLock.expires_at <= now)
            ),
        ).returning(ProjectEditLock.locked_by)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none() is not None

    async def force_take(
        self, project_id: uuid.UUID, user_id: uuid.UUID, expires_at: datetime
    ) -> None:
        """Take the lease unconditionally (owner force-takeover)."""
        stmt = self._insert().values(
            project_id=project_id, locked_by=user_id, expires_at=expires_at
        )
        stmt = stmt.on_conflict_do_update(
            index_elements=[ProjectEditLock.project_id],
            set_={"locked_by": user_id, "expires_at": expires_at},
        )
        await self.session.execute(stmt)

    async def delete(self, project_id: uuid.UUID) -> None:
        """Release the lock if present (no-op when absent)."""
        lock = await self.get(project_id)
        if lock is not None:
            await self.session.delete(lock)
            await self.session.flush()
