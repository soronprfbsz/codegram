"""Service-layer tests: ownership enforcement and NotFound semantics."""
import uuid

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.services.project import ProjectNotFoundError, ProjectService


async def _make_user(session: AsyncSession, email: str) -> uuid.UUID:
    """Insert a minimal user row (FK target for projects) and return its id."""
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


async def test_create_and_get_project(test_session: AsyncSession) -> None:
    user_id = await _make_user(test_session, "owner@example.com")
    service = ProjectService(test_session)

    created = await service.create_project(user_id=user_id, name="P1")
    fetched = await service.get_project(created.id, user_id)

    assert fetched.id == created.id
    assert fetched.name == "P1"


async def test_get_missing_raises_not_found(test_session: AsyncSession) -> None:
    user_id = await _make_user(test_session, "owner@example.com")
    service = ProjectService(test_session)

    with pytest.raises(ProjectNotFoundError):
        await service.get_project(uuid.uuid4(), user_id)


async def test_get_other_users_project_raises_not_found(
    test_session: AsyncSession,
) -> None:
    owner_id = await _make_user(test_session, "owner@example.com")
    other_id = await _make_user(test_session, "other@example.com")
    service = ProjectService(test_session)
    created = await service.create_project(user_id=owner_id, name="P1")

    # Cross-user access raises NotFound (404, not 403).
    with pytest.raises(ProjectNotFoundError):
        await service.get_project(created.id, other_id)


async def test_list_projects_only_own(test_session: AsyncSession) -> None:
    owner_id = await _make_user(test_session, "owner@example.com")
    other_id = await _make_user(test_session, "other@example.com")
    service = ProjectService(test_session)
    await service.create_project(user_id=owner_id, name="Owner A")
    await service.create_project(user_id=other_id, name="Other")

    owned = await service.list_projects(owner_id)

    assert [p.name for p in owned] == ["Owner A"]


async def test_update_project_partial(test_session: AsyncSession) -> None:
    user_id = await _make_user(test_session, "owner@example.com")
    service = ProjectService(test_session)
    created = await service.create_project(
        user_id=user_id, name="Original", dbml_text="old"
    )

    updated = await service.update_project(
        created.id, user_id, dbml_text="new", layout={"k": "v"}
    )

    assert updated.name == "Original"
    assert updated.dbml_text == "new"
    assert updated.layout == {"k": "v"}


async def test_update_other_users_project_raises_not_found(
    test_session: AsyncSession,
) -> None:
    owner_id = await _make_user(test_session, "owner@example.com")
    other_id = await _make_user(test_session, "other@example.com")
    service = ProjectService(test_session)
    created = await service.create_project(user_id=owner_id, name="P1")

    with pytest.raises(ProjectNotFoundError):
        await service.update_project(created.id, other_id, name="hacked")


async def test_delete_project(test_session: AsyncSession) -> None:
    user_id = await _make_user(test_session, "owner@example.com")
    service = ProjectService(test_session)
    created = await service.create_project(user_id=user_id, name="P1")

    await service.delete_project(created.id, user_id)

    with pytest.raises(ProjectNotFoundError):
        await service.get_project(created.id, user_id)


async def test_delete_other_users_project_raises_not_found(
    test_session: AsyncSession,
) -> None:
    owner_id = await _make_user(test_session, "owner@example.com")
    other_id = await _make_user(test_session, "other@example.com")
    service = ProjectService(test_session)
    created = await service.create_project(user_id=owner_id, name="P1")

    with pytest.raises(ProjectNotFoundError):
        await service.delete_project(created.id, other_id)
