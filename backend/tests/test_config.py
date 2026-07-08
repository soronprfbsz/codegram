"""Tests for application settings loading."""
from app.core.config import Settings


def test_settings_defaults(monkeypatch):
    # Hermetic: clear any ambient env (e.g. DEBUG=true injected by docker-compose)
    # so this verifies the code defaults, not the surrounding environment.
    for var in ("DATABASE_URL", "CORS_ORIGINS", "DEBUG", "ENVIRONMENT"):
        monkeypatch.delenv(var, raising=False)
    settings = Settings(_env_file=None)
    assert settings.environment == "development"
    assert settings.debug is False
    assert settings.cors_origins == ["http://localhost:5173"]
    assert settings.database_url.startswith("postgresql+asyncpg://")


def test_env_overrides_defaults(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("DEBUG", "true")
    monkeypatch.setenv(
        "DATABASE_URL",
        "postgresql+asyncpg://u:p@db:5432/x",
    )
    settings = Settings(_env_file=None)
    assert settings.environment == "production"
    assert settings.debug is True
    assert settings.database_url == "postgresql+asyncpg://u:p@db:5432/x"


def test_cors_origins_parsed_from_csv(monkeypatch):
    monkeypatch.setenv(
        "CORS_ORIGINS",
        "http://localhost:5173,http://localhost:3000",
    )
    settings = Settings(_env_file=None)
    assert settings.cors_origins == [
        "http://localhost:5173",
        "http://localhost:3000",
    ]


def test_auth_settings_defaults(monkeypatch):
    # Hermetic: clear any ambient auth env that docker-compose / .env might inject.
    for var in (
        "SECRET_KEY",
        "JWT_LIFETIME_SECONDS",
        "COOKIE_SECURE",
        "COOKIE_SAMESITE",
    ):
        monkeypatch.delenv(var, raising=False)
    settings = Settings(_env_file=None)
    assert settings.secret_key == "change-me-dev-only-not-for-production"
    assert settings.jwt_lifetime_seconds == 86400
    assert settings.cookie_secure is False
    assert settings.cookie_samesite == "lax"


def test_auth_settings_env_override(monkeypatch):
    monkeypatch.setenv("SECRET_KEY", "super-secret")
    monkeypatch.setenv("JWT_LIFETIME_SECONDS", "7200")
    monkeypatch.setenv("COOKIE_SECURE", "true")
    monkeypatch.setenv("COOKIE_SAMESITE", "strict")
    settings = Settings(_env_file=None)
    assert settings.secret_key == "super-secret"
    assert settings.jwt_lifetime_seconds == 7200
    assert settings.cookie_secure is True
    assert settings.cookie_samesite == "strict"
