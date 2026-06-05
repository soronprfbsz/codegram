"""User ORM model: fastapi-users UUID base attached to the shared Base."""
from fastapi_users_db_sqlalchemy import SQLAlchemyBaseUserTableUUID

from app.db.base import Base


class User(SQLAlchemyBaseUserTableUUID, Base):
    """User table.

    Inherits id (UUID via fastapi-users' cross-DB GUID type), email,
    hashed_password, is_active, is_superuser, and is_verified columns.
    The GUID type works on both postgres (native UUID) and sqlite (CHAR(36)),
    so the same model serves prod and the in-memory test DB.
    """
