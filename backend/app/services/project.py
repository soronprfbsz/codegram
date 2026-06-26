"""Project business logic: CRUD with per-user ownership enforcement.

Every get/update/delete is scoped to the requesting user's id. Accessing a
project that does not exist OR belongs to another user raises
ProjectNotFoundError, which the router maps to HTTP 404 (not 403) so the API
never leaks the existence of another user's projects. The service does not
commit; the request scope (get_session) commits the unit of work on success.
"""
import uuid
from collections.abc import Sequence
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.project import Project
from app.repositories.project import ProjectRepository


class ProjectNotFoundError(Exception):
    """A project is missing or not owned by the requesting user."""


class ProjectService:
    """High-level project operations with ownership checks."""

    def __init__(self, session: AsyncSession) -> None:
        """Build the service over a request-scoped session + its repository."""
        self.repo = ProjectRepository(session)

    async def create_project(
        self,
        user_id: uuid.UUID,
        name: str,
        dbml_text: str = "",
        layout: dict[str, Any] | None = None,
    ) -> Project:
        """Create a project owned by the given user."""
        return await self.repo.create(
            user_id=user_id,
            name=name,
            dbml_text=dbml_text,
            layout=layout,
        )

    async def get_project(
        self, project_id: uuid.UUID, user_id: uuid.UUID
    ) -> Project:
        """Return the owned project or raise ProjectNotFoundError."""
        project = await self.repo.get_by_id_and_user(project_id, user_id)
        if project is None:
            raise ProjectNotFoundError(project_id)
        return project

    async def list_projects(self, user_id: uuid.UUID) -> Sequence[Project]:
        """List all projects owned by the user (newest first)."""
        return await self.repo.list_by_user(user_id)

    async def update_project(
        self,
        project_id: uuid.UUID,
        user_id: uuid.UUID,
        name: str | None = None,
        dbml_text: str | None = None,
        layout: dict[str, Any] | None = None,
        glyph: str | None = None,
        color: str | None = None,
        bg_color: str | None = None,
    ) -> Project:
        """Partially update an owned project; raise NotFound otherwise."""
        project = await self.get_project(project_id, user_id)
        return await self.repo.update(
            project,
            name=name,
            dbml_text=dbml_text,
            layout=layout,
            glyph=glyph,
            color=color,
            bg_color=bg_color,
        )

    async def delete_project(
        self, project_id: uuid.UUID, user_id: uuid.UUID
    ) -> None:
        """Delete an owned project; raise NotFound otherwise."""
        project = await self.get_project(project_id, user_id)
        await self.repo.delete(project)
