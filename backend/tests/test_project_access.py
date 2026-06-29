"""Service-layer role-based access tests (ADR-0015): owner/editor/viewer."""
import uuid

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.project_member import ProjectMember
from app.models.user import User
from app.services.access import EDITOR, OWNER, VIEWER
from app.services.project import (
    ProjectForbiddenError,
    ProjectNotFoundError,
    ProjectService,
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


async def _add_member(
    session: AsyncSession,
    project_id: uuid.UUID,
    user_id: uuid.UUID,
    role: str,
) -> None:
    session.add(
        ProjectMember(project_id=project_id, user_id=user_id, role=role)
    )
    await session.flush()


async def test_resolve_role_owner_editor_viewer_and_none(
    test_session: AsyncSession,
) -> None:
    owner = await _make_user(test_session, "owner@example.com")
    editor = await _make_user(test_session, "editor@example.com")
    viewer = await _make_user(test_session, "viewer@example.com")
    stranger = await _make_user(test_session, "stranger@example.com")
    service = ProjectService(test_session)
    project = await service.create_project(user_id=owner, name="P")
    await _add_member(test_session, project.id, editor, EDITOR)
    await _add_member(test_session, project.id, viewer, VIEWER)

    assert (await service.resolve_role(project.id, owner))[1] == OWNER
    assert (await service.resolve_role(project.id, editor))[1] == EDITOR
    assert (await service.resolve_role(project.id, viewer))[1] == VIEWER
    with pytest.raises(ProjectNotFoundError):
        await service.resolve_role(project.id, stranger)


async def test_editor_can_view_and_edit_but_not_delete(
    test_session: AsyncSession,
) -> None:
    owner = await _make_user(test_session, "owner@example.com")
    editor = await _make_user(test_session, "editor@example.com")
    service = ProjectService(test_session)
    project = await service.create_project(user_id=owner, name="P")
    await _add_member(test_session, project.id, editor, EDITOR)

    assert (await service.get_viewable_project(project.id, editor)).id == project.id
    updated = await service.update_project(project.id, editor, dbml_text="new")
    assert updated.dbml_text == "new"
    with pytest.raises(ProjectForbiddenError):
        await service.delete_project(project.id, editor)


async def test_viewer_can_view_but_not_edit_or_delete(
    test_session: AsyncSession,
) -> None:
    owner = await _make_user(test_session, "owner@example.com")
    viewer = await _make_user(test_session, "viewer@example.com")
    service = ProjectService(test_session)
    project = await service.create_project(user_id=owner, name="P")
    await _add_member(test_session, project.id, viewer, VIEWER)

    assert (await service.get_viewable_project(project.id, viewer)).id == project.id
    with pytest.raises(ProjectForbiddenError):
        await service.update_project(project.id, viewer, dbml_text="nope")
    with pytest.raises(ProjectForbiddenError):
        await service.delete_project(project.id, viewer)


async def test_stranger_sees_404_not_403(test_session: AsyncSession) -> None:
    owner = await _make_user(test_session, "owner@example.com")
    stranger = await _make_user(test_session, "stranger@example.com")
    service = ProjectService(test_session)
    project = await service.create_project(user_id=owner, name="P")

    # No role at all -> NotFound (404), never Forbidden (existence hidden).
    with pytest.raises(ProjectNotFoundError):
        await service.get_viewable_project(project.id, stranger)
    with pytest.raises(ProjectNotFoundError):
        await service.update_project(project.id, stranger, name="x")


async def test_list_projects_includes_owned_and_shared(
    test_session: AsyncSession,
) -> None:
    owner = await _make_user(test_session, "owner@example.com")
    member = await _make_user(test_session, "member@example.com")
    service = ProjectService(test_session)
    own = await service.create_project(user_id=member, name="My own")
    shared = await service.create_project(user_id=owner, name="Shared in")
    await _add_member(test_session, shared.id, member, VIEWER)

    names = {p.name for p in await service.list_projects(member)}
    assert names == {"My own", "Shared in"}
