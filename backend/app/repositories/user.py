"""User data access for membership resolution: lookup by email / id.

Read-only helpers the membership flow needs (fastapi-users owns user
lifecycle). Email lookup is case-insensitive so an invite matches regardless of
how the address was typed at registration. Also carries the RBAC (ADR-0016)
account-management mutations: role assignment, password resets, and the
admin-facing user listing.
"""
import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User


class UserRepository:
    """User lookups plus RBAC account-management mutations."""

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

    async def set_role(self, user: User, role_id: uuid.UUID) -> None:
        """Assign a role to a user."""
        user.role_id = role_id
        await self.session.flush()

    async def set_password_hash(
        self, user: User, hashed: str, must_change: bool
    ) -> None:
        """Replace a user's password hash and must-change-password flag."""
        user.hashed_password = hashed
        user.must_change_password = must_change
        await self.session.flush()

    async def list_all(self) -> list[User]:
        """Return every user (id/email/role fields available on the row)."""
        result = await self.session.execute(select(User))
        return list(result.scalars().all())
