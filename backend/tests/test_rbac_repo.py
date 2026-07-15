"""Tests for RbacRepository (seed, permission resolution, admin matrix) and the
UserRepository RBAC extensions (ADR-0016, Task 2).
"""
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.repositories.rbac import RbacRepository
from app.repositories.user import UserRepository


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


async def test_ensure_seed_creates_roles_permissions_and_mappings(test_session):
    repo = RbacRepository(test_session)
    await repo.ensure_seed()

    admin = await repo.role_by_name("admin")
    user_role = await repo.role_by_name("user")
    assert admin is not None
    assert user_role is not None

    roles = await repo.list_roles_with_permissions()
    by_name = {role.name: set(codes) for role, codes in roles}
    assert by_name["admin"] == {"user:read", "user:manage"}
    assert by_name["user"] == {"user:read"}


async def test_ensure_seed_is_idempotent(test_session):
    repo = RbacRepository(test_session)
    await repo.ensure_seed()
    await repo.ensure_seed()

    roles = await repo.list_roles_with_permissions()
    assert sorted(role.name for role, _ in roles) == ["admin", "user"]


async def test_permissions_for_user_resolves_role(test_session):
    repo = RbacRepository(test_session)
    await repo.ensure_seed()
    admin_role = await repo.role_by_name("admin")
    user_role = await repo.role_by_name("user")

    admin_user = await _make_user(test_session, "admin@example.com")
    plain_user = await _make_user(test_session, "user@example.com")
    admin_user.role_id = admin_role.id
    plain_user.role_id = user_role.id
    await test_session.flush()

    assert await repo.permissions_for_user(admin_user.id) == {
        "user:read",
        "user:manage",
    }
    assert await repo.permissions_for_user(plain_user.id) == {"user:read"}


async def test_permissions_for_user_without_role_is_empty(test_session):
    repo = RbacRepository(test_session)
    await repo.ensure_seed()
    user = await _make_user(test_session, "norole@example.com")

    assert await repo.permissions_for_user(user.id) == set()


async def test_list_admin_emails_and_count_admins(test_session):
    repo = RbacRepository(test_session)
    await repo.ensure_seed()
    admin_role = await repo.role_by_name("admin")
    user_role = await repo.role_by_name("user")

    admin1 = await _make_user(test_session, "admin1@example.com")
    admin2 = await _make_user(test_session, "admin2@example.com")
    plain = await _make_user(test_session, "plain@example.com")
    admin1.role_id = admin_role.id
    admin2.role_id = admin_role.id
    plain.role_id = user_role.id
    await test_session.flush()

    emails = await repo.list_admin_emails()
    assert sorted(emails) == ["admin1@example.com", "admin2@example.com"]
    assert await repo.count_admins() == 2


async def test_set_role_permissions_replaces_mapping(test_session):
    repo = RbacRepository(test_session)
    await repo.ensure_seed()
    user_role = await repo.role_by_name("user")

    await repo.set_role_permissions(user_role.id, ["user:read", "user:manage"])
    roles = await repo.list_roles_with_permissions()
    by_name = {role.name: set(codes) for role, codes in roles}
    assert by_name["user"] == {"user:read", "user:manage"}

    await repo.set_role_permissions(user_role.id, [])
    roles = await repo.list_roles_with_permissions()
    by_name = {role.name: set(codes) for role, codes in roles}
    assert by_name["user"] == set()


async def test_user_repository_set_role_and_password(test_session):
    repo = RbacRepository(test_session)
    await repo.ensure_seed()
    admin_role = await repo.role_by_name("admin")

    user_repo = UserRepository(test_session)
    user = await _make_user(test_session, "target@example.com")

    await user_repo.set_role(user, admin_role.id)
    assert user.role_id == admin_role.id

    await user_repo.set_password_hash(user, "newhash", must_change=True)
    assert user.hashed_password == "newhash"
    assert user.must_change_password is True


async def test_user_repository_list_all(test_session):
    await _make_user(test_session, "a@example.com")
    await _make_user(test_session, "b@example.com")

    user_repo = UserRepository(test_session)
    users = await user_repo.list_all()
    emails = sorted(u.email for u in users)
    assert emails == ["a@example.com", "b@example.com"]
