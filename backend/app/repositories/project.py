"""Project data access layer: async repository over an AsyncSession.

Pure data access: no domain exceptions, no commits. Ownership-scoped reads
return None when a row is missing OR owned by another user; the service maps
that to a 404. flush() (not commit) sends the SQL within the request's
transaction; the request scope (get_session) commits the unit of work on
success, so per-request writes actually persist.
"""
import uuid
from collections.abc import Sequence
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.project import Project


class ProjectRepository:
    """CRUD + ownership-scoped queries for projects."""

    def __init__(self, session: AsyncSession) -> None:
        """Bind the repository to a request-scoped AsyncSession."""
        self.session = session

    async def create(
        self,
        user_id: uuid.UUID,
        name: str,
        dbml_text: str = "",
        layout: dict[str, Any] | None = None,
    ) -> Project:
        """Create and persist a new project; return the ORM object."""
        project = Project(
            user_id=user_id,
            name=name,
            dbml_text=dbml_text,
            layout=layout if layout is not None else {},
        )
        self.session.add(project)
        await self.session.flush()
        return project

    async def get_by_id_and_user(
        self, project_id: uuid.UUID, user_id: uuid.UUID
    ) -> Project | None:
        """Return the project iff it exists AND is owned by user_id, else None."""
        stmt = select(Project).where(
            Project.id == project_id,
            Project.user_id == user_id,
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def list_by_user(self, user_id: uuid.UUID) -> Sequence[Project]:
        """List the user's projects, newest first."""
        stmt = (
            select(Project)
            .where(Project.user_id == user_id)
            .order_by(Project.created_at.desc())
        )
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def update(
        self,
        project: Project,
        name: str | None = None,
        dbml_text: str | None = None,
        layout: dict[str, Any] | None = None,
    ) -> Project:
        """Apply a partial update; only non-None fields are changed."""
        if name is not None:
            project.name = name
        if dbml_text is not None:
            project.dbml_text = dbml_text
        if layout is not None:
            project.layout = layout
        await self.session.flush()
        return project

    async def delete(self, project: Project) -> None:
        """Delete a project."""
        await self.session.delete(project)
        await self.session.flush()
