"""Service-layer tests for membership: invite/list/role/remove/leave."""
import uuid

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.services.access import EDITOR, OWNER, VIEWER
from app.services.member import (
    AlreadyMemberError,
    MemberNotFoundError,
    MemberService,
    OwnerCannotLeaveError,
    UserNotFoundError,
)
from app.services.project import ProjectForbiddenError, ProjectNotFoundError


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


async def _project(session: AsyncSession, owner_id: uuid.UUID):
    return await MemberService(session).projects.create_project(
        user_id=owner_id, name="P"
    )


async def test_invite_grants_role_and_lists_owner_plus_member(
    test_session: AsyncSession,
) -> None:
    owner = await _make_user(test_session, "owner@example.com")
    await _make_user(test_session, "bob@example.com")
    service = MemberService(test_session)
    project = await _project(test_session, owner)

    view = await service.invite(project.id, owner, "bob@example.com", EDITOR)
    assert view.email == "bob@example.com"
    assert view.role == EDITOR

    roster = await service.list_members(project.id, owner)
    by_email = {v.email: v.role for v in roster}
    assert by_email == {"owner@example.com": OWNER, "bob@example.com": EDITOR}


async def test_invite_is_case_insensitive_on_email(
    test_session: AsyncSession,
) -> None:
    owner = await _make_user(test_session, "owner@example.com")
    await _make_user(test_session, "bob@example.com")
    service = MemberService(test_session)
    project = await _project(test_session, owner)

    view = await service.invite(project.id, owner, "BOB@Example.com", VIEWER)
    assert view.role == VIEWER


async def test_invite_unknown_email_raises_user_not_found(
    test_session: AsyncSession,
) -> None:
    owner = await _make_user(test_session, "owner@example.com")
    service = MemberService(test_session)
    project = await _project(test_session, owner)

    with pytest.raises(UserNotFoundError):
        await service.invite(project.id, owner, "ghost@example.com", EDITOR)


async def test_invite_owner_or_existing_member_raises_already_member(
    test_session: AsyncSession,
) -> None:
    owner = await _make_user(test_session, "owner@example.com")
    await _make_user(test_session, "bob@example.com")
    service = MemberService(test_session)
    project = await _project(test_session, owner)

    with pytest.raises(AlreadyMemberError):
        await service.invite(project.id, owner, "owner@example.com", EDITOR)

    await service.invite(project.id, owner, "bob@example.com", EDITOR)
    with pytest.raises(AlreadyMemberError):
        await service.invite(project.id, owner, "bob@example.com", VIEWER)


async def test_non_owner_cannot_invite(test_session: AsyncSession) -> None:
    owner = await _make_user(test_session, "owner@example.com")
    editor = await _make_user(test_session, "editor@example.com")
    await _make_user(test_session, "carol@example.com")
    service = MemberService(test_session)
    project = await _project(test_session, owner)
    await service.invite(project.id, owner, "editor@example.com", EDITOR)

    # Editor lacks MANAGE_MEMBERS -> Forbidden (authz before any user lookup).
    with pytest.raises(ProjectForbiddenError):
        await service.invite(project.id, editor, "carol@example.com", VIEWER)


async def test_update_role_and_missing_member(
    test_session: AsyncSession,
) -> None:
    owner = await _make_user(test_session, "owner@example.com")
    bob = await _make_user(test_session, "bob@example.com")
    service = MemberService(test_session)
    project = await _project(test_session, owner)
    await service.invite(project.id, owner, "bob@example.com", VIEWER)

    view = await service.update_role(project.id, owner, bob, EDITOR)
    assert view.role == EDITOR
    with pytest.raises(MemberNotFoundError):
        await service.update_role(project.id, owner, uuid.uuid4(), VIEWER)


async def test_remove_member_then_role_is_gone(
    test_session: AsyncSession,
) -> None:
    owner = await _make_user(test_session, "owner@example.com")
    bob = await _make_user(test_session, "bob@example.com")
    service = MemberService(test_session)
    project = await _project(test_session, owner)
    await service.invite(project.id, owner, "bob@example.com", EDITOR)

    await service.remove(project.id, owner, bob)
    with pytest.raises(ProjectNotFoundError):
        await service.projects.resolve_role(project.id, bob)
    with pytest.raises(MemberNotFoundError):
        await service.remove(project.id, owner, bob)


async def test_member_can_leave_but_owner_cannot(
    test_session: AsyncSession,
) -> None:
    owner = await _make_user(test_session, "owner@example.com")
    bob = await _make_user(test_session, "bob@example.com")
    service = MemberService(test_session)
    project = await _project(test_session, owner)
    await service.invite(project.id, owner, "bob@example.com", VIEWER)

    await service.leave(project.id, bob)
    with pytest.raises(ProjectNotFoundError):
        await service.projects.resolve_role(project.id, bob)

    with pytest.raises(OwnerCannotLeaveError):
        await service.leave(project.id, owner)


async def test_leave_when_no_role_raises_not_found(
    test_session: AsyncSession,
) -> None:
    owner = await _make_user(test_session, "owner@example.com")
    stranger = await _make_user(test_session, "stranger@example.com")
    service = MemberService(test_session)
    project = await _project(test_session, owner)

    with pytest.raises(ProjectNotFoundError):
        await service.leave(project.id, stranger)
