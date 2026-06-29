"""Concurrency tests: edit-lock lease + content-write guard (ADR-0015)."""
import uuid
from datetime import timedelta

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.project_member import ProjectMember
from app.models.user import User
from app.services.access import EDITOR, VIEWER
from app.services.lock import LockService
from app.services.lock_guard import now_utc
from app.services.project import (
    ProjectForbiddenError,
    ProjectNotFoundError,
    ProjectService,
    StaleVersionError,
)
from app.services.lock_guard import EditLockConflictError


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


async def _member(session, project_id, user_id, role) -> None:
    session.add(
        ProjectMember(project_id=project_id, user_id=user_id, role=role)
    )
    await session.flush()


async def _setup(session: AsyncSession):
    """Owner + editor member; return (lock_service, project, owner, editor)."""
    owner = await _make_user(session, "owner@example.com")
    editor = await _make_user(session, "editor@example.com")
    projects = ProjectService(session)
    project = await projects.create_project(user_id=owner, name="P")
    await _member(session, project.id, editor, EDITOR)
    return LockService(session), project, owner, editor


async def test_acquire_then_conflict_for_second_editor(
    test_session: AsyncSession,
) -> None:
    locks, project, owner, editor = await _setup(test_session)

    mine = await locks.acquire(project.id, owner)
    assert mine.locked and mine.is_me and mine.locked_by == owner

    with pytest.raises(EditLockConflictError):
        await locks.acquire(project.id, editor)


async def test_expired_lock_can_be_taken_over(
    test_session: AsyncSession,
) -> None:
    locks, project, owner, editor = await _setup(test_session)
    # Owner held it but it expired a minute ago.
    await locks.locks.upsert(project.id, owner, now_utc() - timedelta(minutes=1))

    state = await locks.acquire(project.id, editor)
    assert state.is_me and state.locked_by == editor


async def test_status_shows_holder_for_other_participant(
    test_session: AsyncSession,
) -> None:
    locks, project, owner, editor = await _setup(test_session)
    await locks.acquire(project.id, owner)

    seen = await locks.status(project.id, editor)
    assert seen.locked and not seen.is_me
    assert seen.locked_by == owner
    assert seen.locked_by_email == "owner@example.com"


async def test_release_frees_the_lock(test_session: AsyncSession) -> None:
    locks, project, owner, editor = await _setup(test_session)
    await locks.acquire(project.id, owner)
    await locks.release(project.id, owner)

    state = await locks.acquire(project.id, editor)  # now free
    assert state.is_me


async def test_owner_force_takes_over_live_lock(
    test_session: AsyncSession,
) -> None:
    locks, project, owner, editor = await _setup(test_session)
    await locks.acquire(project.id, editor)  # editor holds it live

    forced = await locks.force(project.id, owner)
    assert forced.is_me and forced.locked_by == owner


async def test_viewer_cannot_acquire_stranger_404(
    test_session: AsyncSession,
) -> None:
    locks, project, owner, _editor = await _setup(test_session)
    viewer = await _make_user(test_session, "viewer@example.com")
    await _member(test_session, project.id, viewer, VIEWER)
    stranger = await _make_user(test_session, "stranger@example.com")

    with pytest.raises(ProjectForbiddenError):
        await locks.acquire(project.id, viewer)
    with pytest.raises(ProjectNotFoundError):
        await locks.acquire(project.id, stranger)


# --- content-write guard (ProjectService.update_project) --------------------


async def test_content_write_blocked_when_other_holds_lock(
    test_session: AsyncSession,
) -> None:
    locks, project, owner, editor = await _setup(test_session)
    await locks.acquire(project.id, owner)  # owner holds it

    projects = ProjectService(test_session)
    with pytest.raises(EditLockConflictError):
        await projects.update_project(project.id, editor, dbml_text="new")


async def test_metadata_write_ignores_lock(
    test_session: AsyncSession,
) -> None:
    locks, project, owner, editor = await _setup(test_session)
    await locks.acquire(project.id, owner)  # owner holds it

    projects = ProjectService(test_session)
    # Name-only (metadata) write does not require the edit lock.
    updated = await projects.update_project(project.id, editor, name="Renamed")
    assert updated.name == "Renamed"


async def test_version_backstop_rejects_stale_and_bumps(
    test_session: AsyncSession,
) -> None:
    locks, project, owner, _editor = await _setup(test_session)
    projects = ProjectService(test_session)
    assert project.version == 0

    # Stale version is rejected.
    with pytest.raises(StaleVersionError):
        await projects.update_project(
            project.id, owner, dbml_text="x", version=99
        )

    # Matching version succeeds and bumps to 1.
    updated = await projects.update_project(
        project.id, owner, dbml_text="x", version=0
    )
    assert updated.version == 1
