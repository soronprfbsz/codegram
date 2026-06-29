"""Project membership routes: roster, invite, change role, remove, leave.

Thin HTTP layer over MemberService (router -> service -> repository). Access is
role-based (ADR-0015): listing needs VIEW, mutations need MANAGE_MEMBERS (owner).
Error mapping: no role on the project -> 404 (existence hidden); has a role but
not the capability -> 403; unknown invitee email / non-member target -> 404;
already a member -> 409; owner trying to leave -> 400.
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.users import current_active_user
from app.db.session import get_session
from app.models.user import User
from app.schemas.member import MemberInvite, MemberRead, MemberRoleUpdate
from app.services.member import (
    AlreadyMemberError,
    MemberNotFoundError,
    MemberService,
    MemberView,
    OwnerCannotLeaveError,
    UserNotFoundError,
)
from app.services.project import ProjectForbiddenError, ProjectNotFoundError

router = APIRouter(prefix="/projects/{project_id}/members", tags=["members"])


def get_member_service(
    session: AsyncSession = Depends(get_session),
) -> MemberService:
    """Provide a MemberService bound to the request-scoped session."""
    return MemberService(session)


def _to_read(view: MemberView) -> MemberRead:
    return MemberRead.model_validate(view)


def _raise_access(exc: Exception) -> HTTPException:
    """Map project-access errors: no role -> 404, insufficient role -> 403."""
    if isinstance(exc, ProjectForbiddenError):
        return HTTPException(status.HTTP_403_FORBIDDEN, detail="Forbidden")
    return HTTPException(status.HTTP_404_NOT_FOUND, detail="Project not found")


@router.get("", response_model=list[MemberRead])
async def list_members(
    project_id: uuid.UUID,
    user: User = Depends(current_active_user),
    service: MemberService = Depends(get_member_service),
) -> list[MemberRead]:
    """List the owner + members of a project (any participant)."""
    try:
        views = await service.list_members(project_id, user.id)
    except (ProjectNotFoundError, ProjectForbiddenError) as exc:
        raise _raise_access(exc) from None
    return [_to_read(v) for v in views]


@router.post("", status_code=status.HTTP_201_CREATED, response_model=MemberRead)
async def invite_member(
    project_id: uuid.UUID,
    payload: MemberInvite,
    user: User = Depends(current_active_user),
    service: MemberService = Depends(get_member_service),
) -> MemberRead:
    """Invite an existing user by email with a role (owner only)."""
    try:
        view = await service.invite(
            project_id, user.id, payload.email, payload.role
        )
    except (ProjectNotFoundError, ProjectForbiddenError) as exc:
        raise _raise_access(exc) from None
    except UserNotFoundError:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, detail="No user with that email"
        ) from None
    except AlreadyMemberError:
        raise HTTPException(
            status.HTTP_409_CONFLICT, detail="Already a member"
        ) from None
    return _to_read(view)


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
async def leave_project(
    project_id: uuid.UUID,
    user: User = Depends(current_active_user),
    service: MemberService = Depends(get_member_service),
) -> None:
    """Leave a project the caller is a member of (owner cannot leave)."""
    try:
        await service.leave(project_id, user.id)
    except ProjectNotFoundError:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, detail="Project not found"
        ) from None
    except OwnerCannotLeaveError:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, detail="Owner cannot leave"
        ) from None


@router.patch("/{target_user_id}", response_model=MemberRead)
async def update_member_role(
    project_id: uuid.UUID,
    target_user_id: uuid.UUID,
    payload: MemberRoleUpdate,
    user: User = Depends(current_active_user),
    service: MemberService = Depends(get_member_service),
) -> MemberRead:
    """Change a member's role (owner only)."""
    try:
        view = await service.update_role(
            project_id, user.id, target_user_id, payload.role
        )
    except (ProjectNotFoundError, ProjectForbiddenError) as exc:
        raise _raise_access(exc) from None
    except MemberNotFoundError:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, detail="Member not found"
        ) from None
    return _to_read(view)


@router.delete("/{target_user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member(
    project_id: uuid.UUID,
    target_user_id: uuid.UUID,
    user: User = Depends(current_active_user),
    service: MemberService = Depends(get_member_service),
) -> None:
    """Remove a member (owner only)."""
    try:
        await service.remove(project_id, user.id, target_user_id)
    except (ProjectNotFoundError, ProjectForbiddenError) as exc:
        raise _raise_access(exc) from None
    except MemberNotFoundError:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, detail="Member not found"
        ) from None
