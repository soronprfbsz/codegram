"""ProjectSnapshot data access layer: async repository over an AsyncSession.

Pure data access: no domain exceptions, no commits, only flush(). Snapshot reads
are scoped to a project_id; parent-project ownership is enforced one layer up by
the service (via ProjectService). Some methods are cross-project (used by the
scheduler jobs to scan/prune every project's snapshots).
"""
import uuid
from collections.abc import Sequence
from datetime import datetime
from typing import Any

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import defer

from app.models.project_snapshot import ProjectSnapshot
from app.models.user import User


class ProjectSnapshotRepository:
    """CRUD + query helpers for project snapshots."""

    def __init__(self, session: AsyncSession) -> None:
        """Bind the repository to a session (request- or job-scoped)."""
        self.session = session

    async def create(
        self,
        project_id: uuid.UUID,
        kind: str,
        dbml_text: str,
        layout: dict[str, Any],
        content_hash: str,
        label: str | None = None,
        created_by: uuid.UUID | None = None,
    ) -> ProjectSnapshot:
        """Create and persist a snapshot; return the ORM object."""
        snapshot = ProjectSnapshot(
            project_id=project_id,
            kind=kind,
            label=label,
            dbml_text=dbml_text,
            layout=layout,
            content_hash=content_hash,
            created_by=created_by,
        )
        self.session.add(snapshot)
        await self.session.flush()
        return snapshot

    async def get_by_id_and_project(
        self, snapshot_id: uuid.UUID, project_id: uuid.UUID
    ) -> ProjectSnapshot | None:
        """Return the snapshot iff it belongs to project_id, else None."""
        stmt = select(ProjectSnapshot).where(
            ProjectSnapshot.id == snapshot_id,
            ProjectSnapshot.project_id == project_id,
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def list_for_project(
        self,
        project_id: uuid.UUID,
        kinds: Sequence[str] | None = None,
        created_after: datetime | None = None,
        created_before: datetime | None = None,
    ) -> Sequence[tuple[ProjectSnapshot, str | None]]:
        """List (snapshot, author email) for a project, newest first.

        Author email is resolved by a LEFT JOIN to `user` (outer: created_by is
        NULL for pre-feature/never-edited-project snapshots, and the user may
        have been deleted). Returns tuples so the route can attach the email to
        ProjectSnapshotMeta the same way projects attach owner_email.
        """
        stmt = (
            select(ProjectSnapshot, User.email)
            .outerjoin(User, User.id == ProjectSnapshot.created_by)
            .where(ProjectSnapshot.project_id == project_id)
        )
        if kinds is not None:
            stmt = stmt.where(ProjectSnapshot.kind.in_(kinds))
        if created_after is not None:
            stmt = stmt.where(ProjectSnapshot.created_at >= created_after)
        if created_before is not None:
            stmt = stmt.where(ProjectSnapshot.created_at < created_before)
        # This list path serves metadata only (the route returns
        # ProjectSnapshotMeta); never load the heavy body columns. A project at
        # the fine-retention ceiling can hold thousands of rows each carrying a
        # full DBML document + layout JSON. (Single-snapshot GET loads the body.)
        stmt = stmt.options(
            defer(ProjectSnapshot.dbml_text), defer(ProjectSnapshot.layout)
        )
        stmt = stmt.order_by(ProjectSnapshot.created_at.desc())
        result = await self.session.execute(stmt)
        return [(row[0], row[1]) for row in result.all()]

    async def created_ats_for_project(
        self,
        project_id: uuid.UUID,
        kinds: Sequence[str] | None,
        created_after: datetime,
        created_before: datetime,
    ) -> Sequence[datetime]:
        """Return just the created_at timestamps in a window (for calendar)."""
        stmt = select(ProjectSnapshot.created_at).where(
            ProjectSnapshot.project_id == project_id,
            ProjectSnapshot.created_at >= created_after,
            ProjectSnapshot.created_at < created_before,
        )
        if kinds is not None:
            stmt = stmt.where(ProjectSnapshot.kind.in_(kinds))
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def count_for_project(
        self, project_id: uuid.UUID, kind: str
    ) -> int:
        """Count snapshots of one kind for a project."""
        stmt = select(func.count()).select_from(ProjectSnapshot).where(
            ProjectSnapshot.project_id == project_id,
            ProjectSnapshot.kind == kind,
        )
        result = await self.session.execute(stmt)
        return int(result.scalar_one())

    async def latest_hash(
        self, project_id: uuid.UUID, kind: str
    ) -> str | None:
        """Return the content_hash of the latest snapshot of a kind, or None."""
        stmt = (
            select(ProjectSnapshot.content_hash)
            .where(
                ProjectSnapshot.project_id == project_id,
                ProjectSnapshot.kind == kind,
            )
            .order_by(ProjectSnapshot.created_at.desc())
            .limit(1)
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def delete(self, snapshot: ProjectSnapshot) -> None:
        """Delete a single snapshot."""
        await self.session.delete(snapshot)
        await self.session.flush()

    async def delete_older_than(self, kind: str, cutoff: datetime) -> int:
        """Bulk-delete snapshots of a kind created before cutoff (prune)."""
        stmt = delete(ProjectSnapshot).where(
            ProjectSnapshot.kind == kind,
            ProjectSnapshot.created_at < cutoff,
        )
        result = await self.session.execute(stmt)
        await self.session.flush()
        return int(result.rowcount or 0)
