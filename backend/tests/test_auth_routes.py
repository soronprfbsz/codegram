"""Tests that auth + protected routes are registered on the app under /api."""
from app.main import app


def _paths() -> set[str]:
    return {route.path for route in app.routes}


def test_auth_and_user_routes_registered():
    paths = _paths()
    assert "/api/auth/register" in paths
    assert "/api/auth/jwt/login" in paths
    assert "/api/auth/jwt/logout" in paths
    assert "/api/users/me" in paths


def test_protected_ping_route_registered():
    assert "/api/protected/ping" in _paths()
