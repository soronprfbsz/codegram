"""Tests for account management: list/role-change/reset-password (ADR-0016,
Task 5).

Mirrors test_authz.py's style: throwaway registrations against the real app,
role assignment via RbacRepository/UserRepository directly on test_session,
then requests through the auth-cookie-carrying `client` fixture.
"""
import uuid

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.rbac import RbacRepository
from app.repositories.user import UserRepository


async def _register_and_login(
    client: AsyncClient, email: str, password: str = "password123"
) -> str:
    """Register + log in; return the new user's id."""
    resp = await client.post(
        "/api/auth/register", json={"email": email, "password": password}
    )
    await client.post(
        "/api/auth/jwt/login", data={"username": email, "password": password}
    )
    return resp.json()["id"]


async def _set_role(test_session: AsyncSession, email: str, role_name: str) -> None:
    rbac_repo = RbacRepository(test_session)
    await rbac_repo.ensure_seed()
    role = await rbac_repo.role_by_name(role_name)
    user_repo = UserRepository(test_session)
    user = await user_repo.get_by_email(email)
    await user_repo.set_role(user, role.id)


async def test_admin_lists_accounts(client, test_session):
    await RbacRepository(test_session).ensure_seed()
    await _register_and_login(client, "admin@example.com")
    await _set_role(test_session, "admin@example.com", "admin")
    await _register_and_login(client, "plain@example.com")
    await _set_role(test_session, "plain@example.com", "user")

    resp = await client.get("/api/accounts")

    assert resp.status_code == 200
    by_email = {row["email"]: row["role_name"] for row in resp.json()}
    assert by_email == {"admin@example.com": "admin", "plain@example.com": "user"}


async def test_plain_user_can_list_but_not_change_role(client, test_session):
    await RbacRepository(test_session).ensure_seed()
    admin_id = await _register_and_login(client, "admin1@example.com")
    await _set_role(test_session, "admin1@example.com", "admin")
    plain_id = await _register_and_login(client, "plain1@example.com")
    await _set_role(test_session, "plain1@example.com", "user")

    list_resp = await client.get("/api/accounts")
    assert list_resp.status_code == 200

    patch_resp = await client.patch(
        f"/api/accounts/{admin_id}/role", json={"role_name": "user"}
    )
    assert patch_resp.status_code == 403


async def test_admin_promotes_user_to_admin(client, test_session):
    await RbacRepository(test_session).ensure_seed()
    await _register_and_login(client, "admin2@example.com")
    await _set_role(test_session, "admin2@example.com", "admin")
    plain_id = await _register_and_login(client, "plain2@example.com")
    await _set_role(test_session, "plain2@example.com", "user")

    # switch back to the admin session to perform the role change
    await client.post(
        "/api/auth/jwt/login",
        data={"username": "admin2@example.com", "password": "password123"},
    )

    resp = await client.patch(
        f"/api/accounts/{plain_id}/role", json={"role_name": "admin"}
    )

    assert resp.status_code == 200
    body = resp.json()
    assert body["email"] == "plain2@example.com"
    assert body["role_name"] == "admin"


async def test_demoting_last_admin_is_conflict(client, test_session):
    await RbacRepository(test_session).ensure_seed()
    admin_id = await _register_and_login(client, "sole-admin@example.com")
    await _set_role(test_session, "sole-admin@example.com", "admin")

    resp = await client.patch(
        f"/api/accounts/{admin_id}/role", json={"role_name": "user"}
    )

    assert resp.status_code == 409
    assert resp.json()["detail"] == {"reason": "last_admin"}


async def test_reset_password_returns_temp_and_enables_login(client, test_session):
    await RbacRepository(test_session).ensure_seed()
    await _register_and_login(client, "admin3@example.com")
    await _set_role(test_session, "admin3@example.com", "admin")

    target_email = "target@example.com"
    reg_resp = await client.post(
        "/api/auth/register",
        json={"email": target_email, "password": "originalpass123"},
    )
    target_id = reg_resp.json()["id"]

    # switch back to the admin session (register does not log in)
    await client.post(
        "/api/auth/jwt/login",
        data={"username": "admin3@example.com", "password": "password123"},
    )

    resp = await client.post(f"/api/accounts/{target_id}/reset-password")

    assert resp.status_code == 200
    temp_password = resp.json()["temp_password"]
    assert len(temp_password) == 12

    user_repo = UserRepository(test_session)
    target_user = await user_repo.get_by_id(uuid.UUID(target_id))
    assert target_user.must_change_password is True

    login_resp = await client.post(
        "/api/auth/jwt/login",
        data={"username": target_email, "password": temp_password},
    )
    assert login_resp.status_code == 204
