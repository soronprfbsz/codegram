"""Project CRUD routes: thin HTTP layer over ProjectService.

Each endpoint authenticates via current_active_user (401 if missing) and builds
a ProjectService from the request-scoped session. The router never touches the
ORM/session directly (router -> service -> repository). ProjectNotFoundError is
mapped to HTTP 404 (not 403) so cross-user access cannot reveal existence.
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.users import current_active_user
from app.db.session import get_session
from app.models.user import User
from app.schemas.project import ProjectCreate, ProjectRead, ProjectUpdate
from app.services.project import ProjectNotFoundError, ProjectService

router = APIRouter(prefix="/projects", tags=["projects"])


def get_project_service(
    session: AsyncSession = Depends(get_session),
) -> ProjectService:
    """Provide a ProjectService bound to the request-scoped session."""
    return ProjectService(session)


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    response_model=ProjectRead,
)
async def create_project(
    payload: ProjectCreate,
    user: User = Depends(current_active_user),
    service: ProjectService = Depends(get_project_service),
) -> ProjectRead:
    """Create a new project owned by the authenticated user."""
    project = await service.create_project(
        user_id=user.id,
        name=payload.name,
        dbml_text=payload.dbml_text,
        layout=payload.layout,
    )
    return ProjectRead.model_validate(project)


@router.get("", response_model=list[ProjectRead])
async def list_projects(
    user: User = Depends(current_active_user),
    service: ProjectService = Depends(get_project_service),
) -> list[ProjectRead]:
    """List the authenticated user's projects."""
    projects = await service.list_projects(user.id)
    return [ProjectRead.model_validate(p) for p in projects]


@router.get("/{project_id}", response_model=ProjectRead)
async def get_project(
    project_id: uuid.UUID,
    user: User = Depends(current_active_user),
    service: ProjectService = Depends(get_project_service),
) -> ProjectRead:
    """Get one owned project, or 404 if missing/not owned."""
    try:
        project = await service.get_project(project_id, user.id)
    except ProjectNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Project not found"
        ) from None
    return ProjectRead.model_validate(project)


@router.patch("/{project_id}", response_model=ProjectRead)
async def update_project(
    project_id: uuid.UUID,
    payload: ProjectUpdate,
    user: User = Depends(current_active_user),
    service: ProjectService = Depends(get_project_service),
) -> ProjectRead:
    """Partially update an owned project (manual edits + autosave)."""
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
        )
    except ProjectNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Project not found"
        ) from None
    return ProjectRead.model_validate(project)


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: uuid.UUID,
    user: User = Depends(current_active_user),
    service: ProjectService = Depends(get_project_service),
) -> None:
    """Delete an owned project, or 404 if missing/not owned."""
    try:
        await service.delete_project(project_id, user.id)
    except ProjectNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Project not found"
        ) from None
