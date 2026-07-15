"""Tests for the authorization layer: require_permission, require_password_ok,
GET /account/me, and on_after_register's default role assignment (ADR-0016,
Task 3).

Two throwaway routes are mounted on the real app under /_test_authz so the
dependencies are exercised through the actual auth cookie flow, matching how
real routes will consume them.
"""
from fastapi import APIRouter, Depends

from app.core.permissions import require_password_ok, require_permission
from app.main import app
from app.models.user import User
from app.repositories.rbac import RbacRepository
from app.repositories.user import UserRepository

_test_router = APIRouter(prefix="/_test_authz", tags=["_test_authz"])


@_test_router.get("/manage-only")
async def _manage_only(
    user: User = Depends(require_permission("user:manage")),
) -> dict:
    return {"email": user.email}


@_test_router.get("/password-ok")
async def _password_ok(user: User = Depends(require_password_ok)) -> dict:
    return {"email": user.email}


app.include_router(_test_router)


async def _register_and_login(client, email: str, password: str = "password123") -> None:
    await client.post(
        "/api/auth/register", json={"email": email, "password": password}
    )
    await client.post(
        "/api/auth/jwt/login", data={"username": email, "password": password}
    )


async def _set_role(test_session, email: str, role_name: str) -> None:
    rbac_repo = RbacRepository(test_session)
    await rbac_repo.ensure_seed()
    role = await rbac_repo.role_by_name(role_name)
    user_repo = UserRepository(test_session)
    user = await user_repo.get_by_email(email)
    await user_repo.set_role(user, role.id)


async def test_require_permission_403_without_permission(client, test_session):
    await _register_and_login(client, "plain@example.com")
    await _set_role(test_session, "plain@example.com", "user")

    resp = await client.get("/_test_authz/manage-only")

    assert resp.status_code == 403
    assert resp.json()["detail"] == "Forbidden"


async def test_require_permission_200_with_permission(client, test_session):
    await _register_and_login(client, "admin@example.com")
    await _set_role(test_session, "admin@example.com", "admin")

    resp = await client.get("/_test_authz/manage-only")

    assert resp.status_code == 200
    assert resp.json()["email"] == "admin@example.com"


async def test_require_permission_403_must_change_password_even_with_permission(
    client, test_session
):
    await _register_and_login(client, "adminforced@example.com")
    await _set_role(test_session, "adminforced@example.com", "admin")
    user_repo = UserRepository(test_session)
    user = await user_repo.get_by_email("adminforced@example.com")
    await user_repo.set_password_hash(user, user.hashed_password, must_change=True)

    resp = await client.get("/_test_authz/manage-only")

    assert resp.status_code == 403
    assert resp.json()["detail"] == {"reason": "must_change_password"}


async def test_require_password_ok_200_when_not_must_change(client):
    await _register_and_login(client, "ok@example.com")

    resp = await client.get("/_test_authz/password-ok")

    assert resp.status_code == 200


async def test_require_password_ok_403_when_must_change(client, test_session):
    await _register_and_login(client, "mustchange@example.com")
    user_repo = UserRepository(test_session)
    user = await user_repo.get_by_email("mustchange@example.com")
    await user_repo.set_password_hash(user, user.hashed_password, must_change=True)

    resp = await client.get("/_test_authz/password-ok")

    assert resp.status_code == 403
    assert resp.json()["detail"] == {"reason": "must_change_password"}


async def test_account_me_returns_role_permissions_and_password_state(
    client, test_session
):
    await RbacRepository(test_session).ensure_seed()
    await _register_and_login(client, "meuser@example.com")

    resp = await client.get("/api/account/me")

    assert resp.status_code == 200
    body = resp.json()
    assert body["email"] == "meuser@example.com"
    assert body["role_name"] == "user"
    assert body["permissions"] == ["user:read"]
    assert body["must_change_password"] is False


async def test_account_me_reachable_even_when_must_change_password(
    client, test_session
):
    await _register_and_login(client, "forced@example.com")
    user_repo = UserRepository(test_session)
    user = await user_repo.get_by_email("forced@example.com")
    await user_repo.set_password_hash(user, user.hashed_password, must_change=True)

    resp = await client.get("/api/account/me")

    assert resp.status_code == 200
    assert resp.json()["must_change_password"] is True


async def test_on_after_register_assigns_default_user_role(client, test_session):
    await RbacRepository(test_session).ensure_seed()
    await _register_and_login(client, "newbie@example.com")

    resp = await client.get("/api/account/me")

    assert resp.status_code == 200
    assert resp.json()["role_name"] == "user"
