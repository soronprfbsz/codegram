"""Application configuration via pydantic-settings."""
from typing import Annotated, Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    """Environment configuration loaded from .env or OS env vars."""

    # Database (asyncpg driver is mandatory for the async engine).
    database_url: str = (
        "postgresql+asyncpg://erddbml_user:postgres_dev@localhost:5432/erddbml_dev"
    )

    # CORS allowed origins (comma-separated in env).
    # NoDecode disables pydantic-settings' JSON pre-decoding of this complex type,
    # so the raw CSV string reaches the field validator below (a bare CSV is not
    # valid JSON and would otherwise raise before the validator runs).
    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:5173"]

    # Authentication (fastapi-users JWT + httpOnly cookie).
    # secret_key signs JWTs; the default is clearly dev-only and MUST be
    # overridden in production via the SECRET_KEY env var.
    secret_key: str = "change-me-dev-only-not-for-production"
    jwt_lifetime_seconds: int = 3600
    # cookie_secure=False allows the cookie over http in dev; set True in prod (https).
    cookie_secure: bool = False
    # Literal so an invalid value (e.g. COOKIE_SAMESITE=foo) fails at config load
    # rather than later when CookieTransport sets the cookie.
    cookie_samesite: Literal["lax", "strict", "none"] = "lax"

    # App.
    debug: bool = False
    environment: str = "development"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_cors_origins(cls, value: object) -> object:
        """Parse a comma-separated string into a list of origins."""
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value


settings = Settings()
