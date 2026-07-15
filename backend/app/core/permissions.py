"""Authorization dependencies built on RbacRepository (ADR-0016).

require_permission(code) gates a route on a specific permission code; the
caller's permissions are resolved fresh from their current role each request
(no caching), so a role change takes effect on the next call. require_password_ok
gates a route on the caller not being in a forced-password-change state.
"""
from fastapi import Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.users import current_active_user
from app.db.session import get_session
from app.models.user import User
from app.repositories.rbac import RbacRepository


def _ensure_password_ok(user: User) -> None:
    """403 (with a machine-readable reason) if the caller must change their
    password before doing anything else."""
    if user.must_change_password:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, detail={"reason": "must_change_password"}
        )


def require_permission(code: str):
    """Return a dependency that 403s unless the caller is password-ok and
    their role grants `code`."""

    async def dep(
        user: User = Depends(current_active_user),
        session: AsyncSession = Depends(get_session),
    ) -> User:
        _ensure_password_ok(user)
        perms = await RbacRepository(session).permissions_for_user(user.id)
        if code not in perms:
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Forbidden")
        return user

    return dep


async def require_password_ok(
    user: User = Depends(current_active_user),
) -> User:
    """403 (with a machine-readable reason) if the caller must change their
    password before doing anything else."""
    _ensure_password_ok(user)
    return user
