"""Role/permission matrix routes: view + edit (ADR-0016, Task 9).

Mounted under /roles. GET is gated by user:read, PATCH by user:manage with a
guard against removing user:manage from the admin role (self-lockout
prevention). The router maps domain exceptions to HTTP status codes and never
touches the ORM/session directly.
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import require_permission
from app.db.session import get_session
from app.models.user import User
from app.schemas.role import RolePermissionsUpdate, RoleRead
from app.services.rbac import (
    AdminManageRequiredError,
    RbacService,
    RoleNotFoundError,
    UnknownPermissionError,
)

router = APIRouter(prefix="/roles", tags=["roles"])


def get_rbac_service(
    session: AsyncSession = Depends(get_session),
) -> RbacService:
    """Provide an RbacService bound to the request-scoped session."""
    return RbacService(session)


@router.get("", response_model=list[RoleRead])
async def list_roles(
    _user: User = Depends(require_permission("user:read")),
    service: RbacService = Depends(get_rbac_service),
) -> list[RoleRead]:
    """List every role with the permission codes it currently grants."""
    return await service.list_roles()


@router.patch("/{role_id}/permissions", response_model=RoleRead)
async def update_role_permissions(
    role_id: uuid.UUID,
    payload: RolePermissionsUpdate,
    _user: User = Depends(require_permission("user:manage")),
    service: RbacService = Depends(get_rbac_service),
) -> RoleRead:
    """Replace a role's permission set; 409 if it would strip admin's
    user:manage."""
    try:
        return await service.update_role_permissions(
            role_id, payload.permission_codes
        )
    except RoleNotFoundError:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, detail="Role not found"
        ) from None
    except UnknownPermissionError:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, detail="Unknown permission code"
        ) from None
    except AdminManageRequiredError:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail={"reason": "admin_manage_required"},
        ) from None
