"""GET /account/me: the authenticated caller's own identity + RBAC state
(ADR-0016).

Gated by plain current_active_user (NOT require_password_ok) so a user who
must change their password can still read this endpoint to render the
forced-change screen.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.users import current_active_user
from app.db.session import get_session
from app.models.user import User
from app.repositories.rbac import RbacRepository
from app.schemas.account import AccountMe

router = APIRouter(prefix="/account", tags=["account"])


@router.get("/me", response_model=AccountMe)
async def get_me(
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_session),
) -> AccountMe:
    """Return the caller's identity, role name, permission codes, and
    must-change-password state."""
    repo = RbacRepository(session)
    permissions = await repo.permissions_for_user(user.id)
    role_name = None
    if user.role_id is not None:
        role = await repo.role_by_id(user.role_id)
        role_name = role.name if role else None
    return AccountMe(
        id=user.id,
        email=user.email,
        role_name=role_name,
        permissions=sorted(permissions),
        must_change_password=user.must_change_password,
    )
