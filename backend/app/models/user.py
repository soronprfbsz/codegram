"""User ORM model: fastapi-users UUID base attached to the shared Base."""
import uuid

from fastapi_users_db_sqlalchemy import SQLAlchemyBaseUserTableUUID
from sqlalchemy import Boolean, ForeignKey, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class User(SQLAlchemyBaseUserTableUUID, Base):
    """User table.

    Inherits id (UUID via fastapi-users' cross-DB GUID type), email,
    hashed_password, is_active, is_superuser, and is_verified columns.
    The GUID type works on both postgres (native UUID) and sqlite (CHAR(36)),
    so the same model serves prod and the in-memory test DB.

    role_id / must_change_password are the RBAC additions (ADR-0016):
    role_id is nullable (ON DELETE SET NULL — a removed role must not delete
    the user), must_change_password forces a password reset on next login
    (e.g. for admin-created accounts).
    """

    role_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("roles.id", ondelete="SET NULL"), nullable=True, default=None
    )
    must_change_password: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
