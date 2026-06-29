"""Edit-lock data access: the 0..1 lease row per project (ADR-0015).

Pure data access (no domain rules, no commits). The service decides whether a
lock is live/expired and who may take it; this layer just reads, upserts, and
deletes the row.
"""
import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.project_edit_lock import ProjectEditLock


class LockRepository:
    """Reads/writes for the single project_edit_lock row of a project."""

    def __init__(self, session: AsyncSession) -> None:
        """Bind the repository to a request-scoped AsyncSession."""
        self.session = session

    async def get(self, project_id: uuid.UUID) -> ProjectEditLock | None:
        """Return the project's lock row, or None when unlocked."""
        result = await self.session.execute(
            select(ProjectEditLock).where(
                ProjectEditLock.project_id == project_id
            )
        )
        return result.scalar_one_or_none()

    async def upsert(
        self, project_id: uuid.UUID, user_id: uuid.UUID, expires_at: datetime
    ) -> ProjectEditLock:
        """Set/replace the lock to (user_id, expires_at); return the row."""
        lock = await self.get(project_id)
        if lock is None:
            lock = ProjectEditLock(
                project_id=project_id, locked_by=user_id, expires_at=expires_at
            )
            self.session.add(lock)
        else:
            lock.locked_by = user_id
            lock.expires_at = expires_at
        await self.session.flush()
        return lock

    async def delete(self, project_id: uuid.UUID) -> None:
        """Release the lock if present (no-op when absent)."""
        lock = await self.get(project_id)
        if lock is not None:
            await self.session.delete(lock)
            await self.session.flush()
