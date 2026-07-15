"""Tests for the role/permission matrix API: view + edit (ADR-0016, Task 9).

Mirrors test_accounts.py's style: throwaway registrations against the real
app, role assignment via RbacRepository/UserRepository directly on
test_session, then requests through the auth-cookie-carrying `client`
fixture.
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


async def _login(client: AsyncClient, email: str, password: str = "password123") -> None:
    await client.post(
        "/api/auth/jwt/login", data={"username": email, "password": password}
    )


async def test_matrix_view_returns_full_catalog(client, test_session):
    await RbacRepository(test_session).ensure_seed()
    await _register_and_login(client, "admin@example.com")
    await _set_role(test_session, "admin@example.com", "admin")

    resp = await client.get("/api/roles")

    assert resp.status_code == 200
    by_name = {row["name"]: set(row["permissions"]) for row in resp.json()}
    assert by_name == {
        "admin": {"user:read", "user:manage"},
        "user": {"user:read"},
    }


async def test_plain_user_can_view_but_not_edit(client, test_session):
    await RbacRepository(test_session).ensure_seed()
    await _register_and_login(client, "plain@example.com")
    await _set_role(test_session, "plain@example.com", "user")

    view_resp = await client.get("/api/roles")
    assert view_resp.status_code == 200

    user_role = await RbacRepository(test_session).role_by_name("user")
    patch_resp = await client.patch(
        f"/api/roles/{user_role.id}/permissions",
        json={"permission_codes": ["user:read", "user:manage"]},
    )
    assert patch_resp.status_code == 403


async def test_granting_user_manage_lets_that_role_manage(client, test_session):
    await RbacRepository(test_session).ensure_seed()
    await _register_and_login(client, "admin2@example.com")
    await _set_role(test_session, "admin2@example.com", "admin")
    await _register_and_login(client, "plain2@example.com")
    await _set_role(test_session, "plain2@example.com", "user")

    await _login(client, "admin2@example.com")
    user_role = await RbacRepository(test_session).role_by_name("user")

    resp = await client.patch(
        f"/api/roles/{user_role.id}/permissions",
        json={"permission_codes": ["user:read", "user:manage"]},
    )
    assert resp.status_code == 200
    assert set(resp.json()["permissions"]) == {"user:read", "user:manage"}

    # switch to the plain (now user:manage-granted) user and confirm they can
    # now perform a user:manage-gated action
    await _login(client, "plain2@example.com")
    other_resp = await client.post(
        "/api/auth/register",
        json={"email": "other@example.com", "password": "password123"},
    )
    other_id = other_resp.json()["id"]  # register does not log in

    manage_resp = await client.patch(
        f"/api/accounts/{other_id}/role", json={"role_name": "admin"}
    )
    assert manage_resp.status_code == 200


async def test_removing_admin_manage_is_conflict(client, test_session):
    await RbacRepository(test_session).ensure_seed()
    await _register_and_login(client, "admin3@example.com")
    await _set_role(test_session, "admin3@example.com", "admin")

    admin_role = await RbacRepository(test_session).role_by_name("admin")
    resp = await client.patch(
        f"/api/roles/{admin_role.id}/permissions",
        json={"permission_codes": ["user:read"]},
    )

    assert resp.status_code == 409
    assert resp.json()["detail"] == {"reason": "admin_manage_required"}


async def test_removing_admin_read_is_conflict(client, test_session):
    # Admin must also keep user:read: GET /accounts and GET /roles require it,
    # so losing it would soft-lock admins out of the account/matrix UI.
    await RbacRepository(test_session).ensure_seed()
    await _register_and_login(client, "admin6@example.com")
    await _set_role(test_session, "admin6@example.com", "admin")

    admin_role = await RbacRepository(test_session).role_by_name("admin")
    resp = await client.patch(
        f"/api/roles/{admin_role.id}/permissions",
        json={"permission_codes": ["user:manage"]},
    )

    assert resp.status_code == 409
    assert resp.json()["detail"] == {"reason": "admin_manage_required"}


async def test_unknown_permission_code_is_bad_request(client, test_session):
    await RbacRepository(test_session).ensure_seed()
    await _register_and_login(client, "admin4@example.com")
    await _set_role(test_session, "admin4@example.com", "admin")

    admin_role = await RbacRepository(test_session).role_by_name("admin")
    resp = await client.patch(
        f"/api/roles/{admin_role.id}/permissions",
        json={"permission_codes": ["user:read", "user:manage", "bogus:code"]},
    )

    assert resp.status_code == 400


async def test_unknown_role_id_is_not_found(client, test_session):
    await RbacRepository(test_session).ensure_seed()
    await _register_and_login(client, "admin5@example.com")
    await _set_role(test_session, "admin5@example.com", "admin")

    resp = await client.patch(
        f"/api/roles/{uuid.uuid4()}/permissions",
        json={"permission_codes": ["user:read"]},
    )

    assert resp.status_code == 404
