"""Pydantic DTOs for users, built on fastapi-users schema bases."""
import uuid

from fastapi_users import schemas


class UserRead(schemas.BaseUser[uuid.UUID]):
    """Read DTO: id, email, is_active, is_superuser, is_verified."""


class UserCreate(schemas.BaseUserCreate):
    """Create DTO: email + password (password hashed by the UserManager)."""


class UserUpdate(schemas.BaseUserUpdate):
    """Update DTO: optional email + password."""
