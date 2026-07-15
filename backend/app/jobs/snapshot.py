"""Scheduler jobs for project snapshot history (ADR-0014).

Two cadences capture an auto snapshot of every *changed* project:
- fine:   frequent, short retention.
- coarse: monthly, long retention.

"Changed" is per-kind: a project is snapshotted for a kind only when its current
content hash differs from the latest snapshot OF THAT KIND. Comparing per-kind
(not against any latest snapshot) guarantees a quiet month still gets a coarse
representative that survives after the fine snapshots are pruned.

The capture/prune functions take an explicit session so they are unit-testable;
the run_* wrappers open their own session from async_session_maker (the jobs run
outside any request, so get_session — request-scoped — is not usable) and own
the commit.
"""
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import async_session_maker
from app.models.project import Project
from app.repositories.project_snapshot import ProjectSnapshotRepository
from app.services.project_snapshot import (
    KIND_COARSE,
    KIND_FINE,
    compute_content_hash,
)


async def capture_auto_snapshots(session: AsyncSession, kind: str) -> int:
    """Snapshot every project whose content changed since its latest `kind`.

    Returns the number of snapshots created.
    """
    repo = ProjectSnapshotRepository(session)
    projects = (await session.execute(select(Project))).scalars().all()
    created = 0
    for project in projects:
        content_hash = compute_content_hash(project.dbml_text, project.layout)
        if await repo.latest_hash(project.id, kind) == content_hash:
            continue
        await repo.create(
            project_id=project.id,
            kind=kind,
            label=None,
            dbml_text=project.dbml_text,
            layout=project.layout,
            content_hash=content_hash,
            # No logged-in actor in the scheduler — attribute to the project's
            # last content editor (NULL for a never-edited project).
            created_by=project.last_edited_by,
        )
        created += 1
    return created


async def prune_snapshots(
    session: AsyncSession,
    *,
    now: datetime | None = None,
    fine_retain_days: int | None = None,
    coarse_retain_days: int | None = None,
) -> int:
    """Delete auto snapshots past their retain window. Manual is never pruned.

    Returns the number of snapshots removed.
    """
    now = now or datetime.now(timezone.utc)
    if fine_retain_days is None:
        fine_retain_days = settings.snapshot_fine_retain_days
    if coarse_retain_days is None:
        coarse_retain_days = settings.snapshot_coarse_retain_days
    repo = ProjectSnapshotRepository(session)
    removed = await repo.delete_older_than(
        KIND_FINE, now - timedelta(days=fine_retain_days)
    )
    removed += await repo.delete_older_than(
        KIND_COARSE, now - timedelta(days=coarse_retain_days)
    )
    return removed


# -- session-owning wrappers invoked by the scheduler -----------------------
async def run_fine_capture() -> int:
    """Scheduler entrypoint: capture fine snapshots in a fresh session."""
    async with async_session_maker() as session:
        created = await capture_auto_snapshots(session, KIND_FINE)
        await session.commit()
        return created


async def run_coarse_capture() -> int:
    """Scheduler entrypoint: capture coarse snapshots in a fresh session."""
    async with async_session_maker() as session:
        created = await capture_auto_snapshots(session, KIND_COARSE)
        await session.commit()
        return created


async def run_prune() -> int:
    """Scheduler entrypoint: prune expired auto snapshots in a fresh session."""
    async with async_session_maker() as session:
        removed = await prune_snapshots(session)
        await session.commit()
        return removed
