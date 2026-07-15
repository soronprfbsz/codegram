"""Tests for the public (unauthenticated) admin-contact list endpoint
(ADR-0016, Task 10)."""
import uuid

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.repositories.rbac import RbacRepository


async def _make_user(session: AsyncSession, email: str) -> User:
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
    return user


async def test_list_admins_unauthenticated_returns_only_admin_emails(
    client: AsyncClient, test_session: AsyncSession
):
    repo = RbacRepository(test_session)
    await repo.ensure_seed()
    admin_role = await repo.role_by_name("admin")
    user_role = await repo.role_by_name("user")

    admin = await _make_user(test_session, "admin@example.com")
    plain = await _make_user(test_session, "plain@example.com")
    admin.role_id = admin_role.id
    plain.role_id = user_role.id
    await test_session.commit()

    response = await client.get("/api/admins")

    assert response.status_code == 200
    assert response.json() == [{"email": "admin@example.com"}]


async def test_list_admins_unauthenticated_returns_empty_list_when_no_admins(
    client: AsyncClient, test_session: AsyncSession
):
    repo = RbacRepository(test_session)
    await repo.ensure_seed()
    user_role = await repo.role_by_name("user")

    plain = await _make_user(test_session, "plain@example.com")
    plain.role_id = user_role.id
    await test_session.commit()

    response = await client.get("/api/admins")

    assert response.status_code == 200
    assert response.json() == []
