"""Account management routes: list accounts, change role, reset password
(ADR-0016, Task 5).

Mounted under /accounts. Every endpoint is a global admin capability (not
project-scoped), gated by require_permission("user:read"/"user:manage"). The
router maps domain exceptions to HTTP status codes and never touches the
ORM/session directly.
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import require_permission
from app.db.session import get_session
from app.models.user import User
from app.schemas.account import AccountRead, AccountRoleUpdate, PasswordResetRead
from app.services.account import (
    AccountNotFoundError,
    AccountService,
    LastAdminError,
    RoleNotFoundError,
)

router = APIRouter(prefix="/accounts", tags=["accounts"])

_ACCOUNT_NOT_FOUND = "Account not found"


def get_account_service(
    session: AsyncSession = Depends(get_session),
) -> AccountService:
    """Provide an AccountService bound to the request-scoped session."""
    return AccountService(session)


@router.get("", response_model=list[AccountRead])
async def list_accounts(
    _user: User = Depends(require_permission("user:read")),
    service: AccountService = Depends(get_account_service),
) -> list[AccountRead]:
    """List every account with its resolved role name."""
    return await service.list_accounts()


@router.patch("/{account_id}/role", response_model=AccountRead)
async def change_role(
    account_id: uuid.UUID,
    payload: AccountRoleUpdate,
    _user: User = Depends(require_permission("user:manage")),
    service: AccountService = Depends(get_account_service),
) -> AccountRead:
    """Change an account's role; 409 if it would demote the last admin."""
    try:
        return await service.change_role(account_id, payload.role_name)
    except AccountNotFoundError:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, detail=_ACCOUNT_NOT_FOUND
        ) from None
    except RoleNotFoundError:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, detail="Unknown role"
        ) from None
    except LastAdminError:
        raise HTTPException(
            status.HTTP_409_CONFLICT, detail={"reason": "last_admin"}
        ) from None


@router.post("/{account_id}/reset-password", response_model=PasswordResetRead)
async def reset_password(
    account_id: uuid.UUID,
    _user: User = Depends(require_permission("user:manage")),
    service: AccountService = Depends(get_account_service),
) -> PasswordResetRead:
    """Reset an account's password to a random temp value (forces change)."""
    try:
        temp_password = await service.reset_password(account_id)
    except AccountNotFoundError:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, detail=_ACCOUNT_NOT_FOUND
        ) from None
    return PasswordResetRead(temp_password=temp_password)
