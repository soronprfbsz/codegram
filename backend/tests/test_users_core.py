"""Tests for the fastapi-users core wiring (backend, transport, strategy)."""
from fastapi_users.authentication import (
    AuthenticationBackend,
    CookieTransport,
    JWTStrategy,
)

from app.core.config import settings
from app.core.users import (
    auth_backend,
    current_active_user,
    fastapi_users,
    get_jwt_strategy,
)


def test_auth_backend_named_jwt_with_cookie_transport():
    assert isinstance(auth_backend, AuthenticationBackend)
    assert auth_backend.name == "jwt"
    assert isinstance(auth_backend.transport, CookieTransport)


def test_cookie_transport_is_httponly_and_uses_settings():
    transport = auth_backend.transport
    assert transport.cookie_httponly is True
    assert transport.cookie_secure is settings.cookie_secure
    assert transport.cookie_samesite == settings.cookie_samesite


def test_jwt_strategy_uses_settings():
    strategy = get_jwt_strategy()
    assert isinstance(strategy, JWTStrategy)
    assert strategy.secret == settings.secret_key
    assert strategy.lifetime_seconds == settings.jwt_lifetime_seconds


def test_current_active_user_dependency_exists():
    # fastapi_users.current_user(active=True) returns a callable dependency.
    assert callable(current_active_user)
    assert fastapi_users is not None
