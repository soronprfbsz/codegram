"""Repository-layer tests against the in-memory sqlite test_session fixture."""
import uuid

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.repositories.project import ProjectRepository


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


async def test_create_assigns_id_and_persists(test_session: AsyncSession) -> None:
    user_id = await _make_user(test_session, "owner@example.com")
    repo = ProjectRepository(test_session)

    project = await repo.create(user_id=user_id, name="P1")

    assert isinstance(project.id, uuid.UUID)
    assert project.user_id == user_id
    assert project.name == "P1"
    assert project.dbml_text == ""
    assert project.layout == {}


async def test_get_by_id_and_user_returns_owned(test_session: AsyncSession) -> None:
    user_id = await _make_user(test_session, "owner@example.com")
    repo = ProjectRepository(test_session)
    created = await repo.create(user_id=user_id, name="P1")

    fetched = await repo.get_by_id_and_user(created.id, user_id)

    assert fetched is not None
    assert fetched.id == created.id


async def test_get_by_id_and_user_none_for_other_user(
    test_session: AsyncSession,
) -> None:
    owner_id = await _make_user(test_session, "owner@example.com")
    other_id = await _make_user(test_session, "other@example.com")
    repo = ProjectRepository(test_session)
    created = await repo.create(user_id=owner_id, name="P1")

    # Correct id, wrong owner -> None (caller maps to 404, not 403).
    assert await repo.get_by_id_and_user(created.id, other_id) is None


async def test_get_by_id_and_user_none_for_missing(
    test_session: AsyncSession,
) -> None:
    user_id = await _make_user(test_session, "owner@example.com")
    repo = ProjectRepository(test_session)

    assert await repo.get_by_id_and_user(uuid.uuid4(), user_id) is None


async def test_list_by_user_only_owns(test_session: AsyncSession) -> None:
    owner_id = await _make_user(test_session, "owner@example.com")
    other_id = await _make_user(test_session, "other@example.com")
    repo = ProjectRepository(test_session)
    await repo.create(user_id=owner_id, name="Owner A")
    await repo.create(user_id=owner_id, name="Owner B")
    await repo.create(user_id=other_id, name="Other")

    owned = await repo.list_by_user(owner_id)

    assert {p.name for p in owned} == {"Owner A", "Owner B"}


async def test_update_skips_none_fields(test_session: AsyncSession) -> None:
    user_id = await _make_user(test_session, "owner@example.com")
    repo = ProjectRepository(test_session)
    project = await repo.create(
        user_id=user_id, name="Original", dbml_text="old", layout={"a": 1}
    )

    # Update only dbml_text; name and layout must be left untouched.
    updated = await repo.update(project, dbml_text="new")

    assert updated.name == "Original"
    assert updated.dbml_text == "new"
    assert updated.layout == {"a": 1}


async def test_update_persists_layout(test_session: AsyncSession) -> None:
    user_id = await _make_user(test_session, "owner@example.com")
    repo = ProjectRepository(test_session)
    project = await repo.create(user_id=user_id, name="P1")

    updated = await repo.update(project, layout={"nodes": [{"id": "t1"}]})

    assert updated.layout == {"nodes": [{"id": "t1"}]}


async def test_delete_removes_project(test_session: AsyncSession) -> None:
    user_id = await _make_user(test_session, "owner@example.com")
    repo = ProjectRepository(test_session)
    project = await repo.create(user_id=user_id, name="P1")

    await repo.delete(project)

    assert await repo.get_by_id_and_user(project.id, user_id) is None
