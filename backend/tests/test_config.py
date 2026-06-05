"""Tests for application settings loading."""
from app.core.config import Settings


def test_settings_defaults():
    settings = Settings(_env_file=None)
    assert settings.environment == "development"
    assert settings.debug is False
    assert settings.cors_origins == ["http://localhost:5173"]


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
