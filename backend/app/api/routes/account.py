"""GET /account/me + POST /account/change-password: the authenticated
caller's own identity/RBAC state and self password change (ADR-0016).

Both routes are gated by plain current_active_user (NOT require_password_ok)
so a user who must change their password can still read /me and call
change-password to clear that state.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.users import current_active_user
from app.db.session import get_session
from app.models.user import User
from app.repositories.rbac import RbacRepository
from app.schemas.account import AccountMe, ChangePasswordRequest
from app.services.account import (
    AccountService,
    PasswordTooShortError,
    WrongCurrentPasswordError,
)

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


@router.post("/change-password")
async def change_password(
    payload: ChangePasswordRequest,
    user: User = Depends(current_active_user),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Change the caller's own password.

    Voluntary (must_change_password=False): current_password is required and
    must verify. Forced (True): current_password is ignored and
    must_change_password is cleared on success."""
    service = AccountService(session)
    try:
        await service.change_own_password(
            user, payload.current_password, payload.new_password
        )
    except PasswordTooShortError:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, detail={"reason": "password_too_short"}
        ) from None
    except WrongCurrentPasswordError:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail={"reason": "invalid_current_password"},
        ) from None
    return {"ok": True}
