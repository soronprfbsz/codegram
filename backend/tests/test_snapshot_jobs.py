"""Tests for snapshot scheduler job functions (ADR-0014)."""
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.jobs.snapshot import capture_auto_snapshots, prune_snapshots
from app.models.project_snapshot import ProjectSnapshot
from app.models.user import User
from app.services.project import ProjectService
from app.services.project_snapshot import (
    KIND_COARSE,
    KIND_FINE,
    KIND_MANUAL,
    compute_content_hash,
)


async def _make_user(session: AsyncSession, email: str) -> uuid.UUID:
    user = User(
        id=uuid.uuid4(),
        email=email,
        hashed_password="x",
        is_active=True,
        is_superuser=False,
        is_verified=False,
    )
    session.add(user)
    await session.flush()
    return user.id


async def _count(session: AsyncSession, project_id: uuid.UUID, kind: str) -> int:
    stmt = select(func.count()).select_from(ProjectSnapshot).where(
        ProjectSnapshot.project_id == project_id,
        ProjectSnapshot.kind == kind,
    )
    return int((await session.execute(stmt)).scalar_one())


async def test_capture_creates_then_dedups(test_session: AsyncSession) -> None:
    user_id = await _make_user(test_session, "cap@example.com")
    project = await ProjectService(test_session).create_project(
        user_id=user_id, name="P", dbml_text="table a {}"
    )
    # first run captures
    assert await capture_auto_snapshots(test_session, KIND_FINE) == 1
    # no change -> dedup skip
    assert await capture_auto_snapshots(test_session, KIND_FINE) == 0
    assert await _count(test_session, project.id, KIND_FINE) == 1
    # change the project -> captured again
    await ProjectService(test_session).update_project(
        project.id, user_id, dbml_text="table b {}"
    )
    assert await capture_auto_snapshots(test_session, KIND_FINE) == 1
    assert await _count(test_session, project.id, KIND_FINE) == 2


async def test_capture_is_per_kind_independent(
    test_session: AsyncSession,
) -> None:
    """A coarse capture happens even if content equals the latest fine one."""
    user_id = await _make_user(test_session, "perkind@example.com")
    project = await ProjectService(test_session).create_project(
        user_id=user_id, name="P", dbml_text="table a {}"
    )
    assert await capture_auto_snapshots(test_session, KIND_FINE) == 1
    # identical content, different kind -> still captured (no cross-kind dedup)
    assert await capture_auto_snapshots(test_session, KIND_COARSE) == 1
    assert await _count(test_session, project.id, KIND_FINE) == 1
    assert await _count(test_session, project.id, KIND_COARSE) == 1
    # second coarse with no change -> dedup
    assert await capture_auto_snapshots(test_session, KIND_COARSE) == 0


async def test_prune_respects_retain_windows_and_spares_manual(
    test_session: AsyncSession,
) -> None:
    user_id = await _make_user(test_session, "prune@example.com")
    project = await ProjectService(test_session).create_project(
        user_id=user_id, name="P"
    )
    now = datetime(2026, 6, 22, 12, 0, tzinfo=timezone.utc)

    def at(days_ago: int) -> datetime:
        return now - timedelta(days=days_ago)

    rows = [
        (KIND_FINE, at(100)),   # stale fine -> removed (>90)
        (KIND_FINE, at(10)),    # recent fine -> kept
        (KIND_COARSE, at(800)), # stale coarse -> removed (>730)
        (KIND_COARSE, at(400)), # recent coarse -> kept
        (KIND_MANUAL, at(1000)),  # ancient manual -> always kept
    ]
    for kind, created_at in rows:
        test_session.add(
            ProjectSnapshot(
                project_id=project.id,
                kind=kind,
                dbml_text="x",
                layout={},
                content_hash=compute_content_hash("x", {}),
                created_at=created_at,
            )
        )
    await test_session.flush()

    removed = await prune_snapshots(test_session, now=now)
    assert removed == 2
    assert await _count(test_session, project.id, KIND_FINE) == 1
    assert await _count(test_session, project.id, KIND_COARSE) == 1
    assert await _count(test_session, project.id, KIND_MANUAL) == 1


async def test_auto_snapshot_attributes_to_last_editor(
    test_session: AsyncSession,
) -> None:
    """An auto snapshot's created_by = the project's last content editor."""
    owner = await _make_user(test_session, "owner-auto@example.com")
    project = await ProjectService(test_session).create_project(
        user_id=owner, name="P", dbml_text="table a {}"
    )
    # create sets last_edited_by = owner → the auto snapshot is attributed to owner
    assert await capture_auto_snapshots(test_session, KIND_FINE) == 1
    snap = (
        await test_session.execute(
            select(ProjectSnapshot).where(
                ProjectSnapshot.project_id == project.id,
                ProjectSnapshot.kind == KIND_FINE,
            )
        )
    ).scalar_one()
    assert snap.created_by == owner


async def test_auto_snapshot_author_null_when_never_edited(
    test_session: AsyncSession,
) -> None:
    """No last editor (never a content write) → auto snapshot author is NULL."""
    owner = await _make_user(test_session, "owner-null@example.com")
    project = await ProjectService(test_session).create_project(
        user_id=owner, name="P", dbml_text="table a {}"
    )
    # Simulate a legacy/never-edited project: clear the create-time attribution.
    project.last_edited_by = None
    await test_session.flush()
    assert await capture_auto_snapshots(test_session, KIND_FINE) == 1
    snap = (
        await test_session.execute(
            select(ProjectSnapshot).where(
                ProjectSnapshot.project_id == project.id,
                ProjectSnapshot.kind == KIND_FINE,
            )
        )
    ).scalar_one()
    assert snap.created_by is None
