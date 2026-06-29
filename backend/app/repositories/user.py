"""User data access for membership resolution: lookup by email / id.

Read-only helpers the membership flow needs (fastapi-users owns user
lifecycle). Email lookup is case-insensitive so an invite matches regardless of
how the address was typed at registration.
"""
import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User


class UserRepository:
    """Read-only user lookups."""

    def __init__(self, session: AsyncSession) -> None:
        """Bind the repository to a request-scoped AsyncSession."""
        self.session = session

    async def get_by_email(self, email: str) -> User | None:
        """Return the user whose email matches case-insensitively, or None."""
        result = await self.session.execute(
            select(User).where(func.lower(User.email) == email.strip().lower())
        )
        return result.scalar_one_or_none()

    async def get_by_id(self, user_id: uuid.UUID) -> User | None:
        """Return the user by id, or None."""
        result = await self.session.execute(
            select(User).where(User.id == user_id)
        )
        return result.scalar_one_or_none()
