"""End-to-end auth flow tests over the sqlite test client."""
import pytest
from httpx import AsyncClient


async def _register(client: AsyncClient, email: str, password: str):
    return await client.post(
        "/api/auth/register",
        json={"email": email, "password": password},
    )


async def _login(client: AsyncClient, email: str, password: str):
    # fastapi-users uses OAuth2 form data with "username" carrying the email.
    return await client.post(
        "/api/auth/jwt/login",
        data={"username": email, "password": password},
    )


async def test_register_returns_201(client: AsyncClient):
    response = await _register(client, "alice@example.com", "password123")
    assert response.status_code == 201
    body = response.json()
    assert body["email"] == "alice@example.com"
    assert body["is_active"] is True
    assert "hashed_password" not in body  # never leak the hash


async def test_login_sets_httponly_cookie(client: AsyncClient):
    await _register(client, "bob@example.com", "password123")
    response = await _login(client, "bob@example.com", "password123")
    assert response.status_code == 204
    set_cookie = response.headers.get("set-cookie", "")
    assert "fastapiusersauth=" in set_cookie
    assert "httponly" in set_cookie.lower()


async def test_me_returns_current_user_when_authenticated(client: AsyncClient):
    await _register(client, "carol@example.com", "password123")
    await _login(client, "carol@example.com", "password123")
    # Cookie persisted by AsyncClient is sent automatically.
    response = await client.get("/api/users/me")
    assert response.status_code == 200
    assert response.json()["email"] == "carol@example.com"


async def test_protected_route_401_without_auth(client: AsyncClient):
    response = await client.get("/api/protected/ping")
    assert response.status_code == 401


async def test_protected_route_200_with_auth(client: AsyncClient):
    await _register(client, "dave@example.com", "password123")
    await _login(client, "dave@example.com", "password123")
    response = await client.get("/api/protected/ping")
    assert response.status_code == 200
    assert response.json()["email"] == "dave@example.com"


async def test_logout_clears_cookie_and_revokes_access(client: AsyncClient):
    await _register(client, "erin@example.com", "password123")
    await _login(client, "erin@example.com", "password123")
    assert (await client.get("/api/users/me")).status_code == 200

    logout = await client.post("/api/auth/jwt/logout")
    assert logout.status_code == 204
    set_cookie = logout.headers.get("set-cookie", "")
    # Logout clears the cookie (empty value and/or immediate expiry).
    assert "fastapiusersauth=" in set_cookie
    assert ('max-age=0' in set_cookie.lower()) or ('expires=' in set_cookie.lower())

    # AsyncClient drops the cleared cookie; subsequent /me is unauthenticated.
    after = await client.get("/api/users/me")
    assert after.status_code == 401


async def test_login_bad_credentials_400(client: AsyncClient):
    await _register(client, "frank@example.com", "password123")
    response = await _login(client, "frank@example.com", "wrong-password")
    assert response.status_code == 400


async def test_per_user_isolation_me_reflects_logged_in_user(client: AsyncClient):
    # Two users registered in the same test DB; /me must reflect whoever is
    # currently authenticated, never the other user.
    await _register(client, "user1@example.com", "password123")
    await _register(client, "user2@example.com", "password123")

    await _login(client, "user1@example.com", "password123")
    me1 = await client.get("/api/users/me")
    assert me1.json()["email"] == "user1@example.com"

    # Re-login as user2 (fastapi-users overwrites the cookie).
    await _login(client, "user2@example.com", "password123")
    me2 = await client.get("/api/users/me")
    assert me2.json()["email"] == "user2@example.com"
    assert me1.json()["id"] != me2.json()["id"]
