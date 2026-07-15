"""Tests for POST /account/change-password: voluntary (current password
required) vs forced (must_change_password=true, current skipped) (ADR-0016,
Task 7).

A throwaway /_test_change_password/password-ok route (mirrors test_authz.py)
demonstrates that a forced-password-change user regains access to
require_password_ok-gated endpoints once the change succeeds.
"""
from fastapi import APIRouter, Depends

from app.core.permissions import require_password_ok
from app.main import app
from app.models.user import User
from app.repositories.user import UserRepository

_test_router = APIRouter(
    prefix="/_test_change_password", tags=["_test_change_password"]
)


@_test_router.get("/password-ok")
async def _password_ok(user: User = Depends(require_password_ok)) -> dict:
    return {"email": user.email}


app.include_router(_test_router)


async def _register_and_login(
    client, email: str, password: str = "password123"
) -> None:
    await client.post(
        "/api/auth/register", json={"email": email, "password": password}
    )
    await client.post(
        "/api/auth/jwt/login", data={"username": email, "password": password}
    )


async def test_voluntary_wrong_current_password_rejected(client):
    await _register_and_login(client, "voluntary1@example.com")

    resp = await client.post(
        "/api/account/change-password",
        json={"current_password": "wrong-password", "new_password": "newpassword123"},
    )

    assert resp.status_code in (400, 401)


async def test_voluntary_correct_current_password_changes_password(client):
    email = "voluntary2@example.com"
    await _register_and_login(client, email)

    resp = await client.post(
        "/api/account/change-password",
        json={"current_password": "password123", "new_password": "newpassword123"},
    )
    assert resp.status_code == 200

    old_login = await client.post(
        "/api/auth/jwt/login", data={"username": email, "password": "password123"}
    )
    assert old_login.status_code != 204

    new_login = await client.post(
        "/api/auth/jwt/login", data={"username": email, "password": "newpassword123"}
    )
    assert new_login.status_code == 204


async def test_forced_change_skips_current_password_and_clears_flag(
    client, test_session
):
    email = "forced1@example.com"
    await _register_and_login(client, email)
    user_repo = UserRepository(test_session)
    user = await user_repo.get_by_email(email)
    await user_repo.set_password_hash(user, user.hashed_password, must_change=True)

    # sanity: the must-change gate blocks the throwaway route before the change
    blocked = await client.get("/_test_change_password/password-ok")
    assert blocked.status_code == 403

    resp = await client.post(
        "/api/account/change-password",
        json={"new_password": "brandnewpass123"},
    )
    assert resp.status_code == 200

    me_resp = await client.get("/api/account/me")
    assert me_resp.json()["must_change_password"] is False

    allowed = await client.get("/_test_change_password/password-ok")
    assert allowed.status_code == 200

    new_login = await client.post(
        "/api/auth/jwt/login",
        data={"username": email, "password": "brandnewpass123"},
    )
    assert new_login.status_code == 204


async def test_new_password_too_short_rejected(client):
    await _register_and_login(client, "short1@example.com")

    resp = await client.post(
        "/api/account/change-password",
        json={"current_password": "password123", "new_password": "short1"},
    )

    assert resp.status_code == 400
