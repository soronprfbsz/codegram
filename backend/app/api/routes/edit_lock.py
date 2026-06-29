"""Project edit-lock routes: status, acquire/renew, release, owner force.

Thin HTTP layer over LockService (ADR-0015). Status needs VIEW (any
participant — so read-only users can see who is editing); acquire/release need
EDIT; force is owner-only. Mapping: no role -> 404, role but not the capability
-> 403, another user holds a live lock on acquire -> 409 with holder info.
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.users import current_active_user
from app.db.session import get_session
from app.models.user import User
from app.schemas.lock import LockStatus
from app.services.lock import LockService, LockState
from app.services.lock_guard import EditLockConflictError
from app.services.project import ProjectForbiddenError, ProjectNotFoundError

router = APIRouter(prefix="/projects/{project_id}/edit-lock", tags=["edit-lock"])


def get_lock_service(
    session: AsyncSession = Depends(get_session),
) -> LockService:
    """Provide a LockService bound to the request-scoped session."""
    return LockService(session)


def _to_status(state: LockState) -> LockStatus:
    return LockStatus(
        locked=state.locked,
        locked_by=state.locked_by,
        locked_by_email=state.locked_by_email,
        expires_at=state.expires_at,
        is_me=state.is_me,
    )


def _access_http_error(exc: Exception) -> HTTPException:
    if isinstance(exc, ProjectForbiddenError):
        return HTTPException(status.HTTP_403_FORBIDDEN, detail="Forbidden")
    return HTTPException(status.HTTP_404_NOT_FOUND, detail="Project not found")


@router.get("", response_model=LockStatus)
async def get_lock(
    project_id: uuid.UUID,
    user: User = Depends(current_active_user),
    service: LockService = Depends(get_lock_service),
) -> LockStatus:
    """Current lock state (who is editing), for any participant."""
    try:
        state = await service.status(project_id, user.id)
    except (ProjectNotFoundError, ProjectForbiddenError) as exc:
        raise _access_http_error(exc) from None
    return _to_status(state)


@router.post("", response_model=LockStatus)
async def acquire_lock(
    project_id: uuid.UUID,
    user: User = Depends(current_active_user),
    service: LockService = Depends(get_lock_service),
) -> LockStatus:
    """Acquire or renew the edit lock (editor/owner); 409 if held by another."""
    try:
        state = await service.acquire(project_id, user.id)
    except (ProjectNotFoundError, ProjectForbiddenError) as exc:
        raise _access_http_error(exc) from None
    except EditLockConflictError as exc:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail={
                "reason": "edit_locked",
                "locked_by_email": exc.locked_by_email,
            },
        ) from None
    return _to_status(state)


@router.post("/force", response_model=LockStatus)
async def force_lock(
    project_id: uuid.UUID,
    user: User = Depends(current_active_user),
    service: LockService = Depends(get_lock_service),
) -> LockStatus:
    """Owner force-takeover of a live lock (read-only-demotes the holder)."""
    try:
        state = await service.force(project_id, user.id)
    except (ProjectNotFoundError, ProjectForbiddenError) as exc:
        raise _access_http_error(exc) from None
    return _to_status(state)


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
async def release_lock(
    project_id: uuid.UUID,
    user: User = Depends(current_active_user),
    service: LockService = Depends(get_lock_service),
) -> None:
    """Release the lock if the caller holds it (editor/owner)."""
    try:
        await service.release(project_id, user.id)
    except (ProjectNotFoundError, ProjectForbiddenError) as exc:
        raise _access_http_error(exc) from None
