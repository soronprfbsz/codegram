"""Project CRUD routes: thin HTTP layer over ProjectService.

Each endpoint authenticates via require_password_ok (401 if missing, 403 if the
caller must change their password) and builds a ProjectService from the
request-scoped session. The router never touches the ORM/session directly
(router -> service -> repository). ProjectNotFoundError is mapped to HTTP 404
(not 403) so cross-user access cannot reveal existence.
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import require_password_ok
from app.db.session import get_session
from app.models.user import User
from app.schemas.project import ProjectCreate, ProjectRead, ProjectUpdate
from app.services.access import OWNER
from app.services.lock_guard import EditLockConflictError
from app.services.project import (
    ProjectForbiddenError,
    ProjectNotFoundError,
    ProjectService,
    StaleVersionError,
)

router = APIRouter(prefix="/projects", tags=["projects"])


def get_project_service(
    session: AsyncSession = Depends(get_session),
) -> ProjectService:
    """Provide a ProjectService bound to the request-scoped session."""
    return ProjectService(session)


def _access_http_error(exc: Exception) -> HTTPException:
    """Map access errors to HTTP: no role -> 404 (hide existence), role but
    insufficient capability -> 403."""
    if isinstance(exc, ProjectForbiddenError):
        return HTTPException(status.HTTP_403_FORBIDDEN, detail="Forbidden")
    return HTTPException(status.HTTP_404_NOT_FOUND, detail="Project not found")


def _read(
    project: object, role: str | None = None, owner_email: str | None = None
) -> ProjectRead:
    """Validate a project to ProjectRead, attaching the caller's role + owner
    email (the ORM object carries neither)."""
    return ProjectRead.model_validate(project).model_copy(
        update={"role": role, "owner_email": owner_email}
    )


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    response_model=ProjectRead,
)
async def create_project(
    payload: ProjectCreate,
    user: User = Depends(require_password_ok),
    service: ProjectService = Depends(get_project_service),
) -> ProjectRead:
    """Create a new project owned by the authenticated user."""
    project = await service.create_project(
        user_id=user.id,
        name=payload.name,
        dbml_text=payload.dbml_text,
        layout=payload.layout,
    )
    return _read(project, role=OWNER, owner_email=user.email)


@router.get("", response_model=list[ProjectRead])
async def list_projects(
    user: User = Depends(require_password_ok),
    service: ProjectService = Depends(get_project_service),
) -> list[ProjectRead]:
    """List the authenticated user's accessible projects (owned + shared)."""
    items = await service.list_projects_with_meta(user.id)
    return [_read(m.project, m.role, m.owner_email) for m in items]


@router.get("/{project_id}", response_model=ProjectRead)
async def get_project(
    project_id: uuid.UUID,
    user: User = Depends(require_password_ok),
    service: ProjectService = Depends(get_project_service),
) -> ProjectRead:
    """Get one accessible project (owner/editor/viewer), or 404 if no role."""
    try:
        meta = await service.get_viewable_with_meta(project_id, user.id)
    except (ProjectNotFoundError, ProjectForbiddenError) as exc:
        raise _access_http_error(exc) from None
    return _read(meta.project, meta.role, meta.owner_email)


@router.patch("/{project_id}", response_model=ProjectRead)
async def update_project(
    project_id: uuid.UUID,
    payload: ProjectUpdate,
    user: User = Depends(require_password_ok),
    service: ProjectService = Depends(get_project_service),
) -> ProjectRead:
    """Partially update a project the caller may edit (owner/editor)."""
    try:
        project = await service.update_project(
            project_id,
            user.id,
            name=payload.name,
            dbml_text=payload.dbml_text,
            layout=payload.layout,
            glyph=payload.glyph,
            color=payload.color,
            bg_color=payload.bg_color,
            version=payload.version,
        )
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
    except StaleVersionError:
        raise HTTPException(
            status.HTTP_409_CONFLICT, detail={"reason": "stale_version"}
        ) from None
    return ProjectRead.model_validate(project)


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: uuid.UUID,
    user: User = Depends(require_password_ok),
    service: ProjectService = Depends(get_project_service),
) -> None:
    """Delete a project — owner only; 404 if no role, 403 if not owner."""
    try:
        await service.delete_project(project_id, user.id)
    except (ProjectNotFoundError, ProjectForbiddenError) as exc:
        raise _access_http_error(exc) from None
