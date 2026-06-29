"""Project membership data access: async repository over an AsyncSession.

Pure data access (no domain exceptions, no commits) for the project_member
table, which holds non-owner roles only (ADR-0015). flush() (not commit) sends
SQL within the request transaction; the request scope commits the unit of work.
"""
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.project_member import ProjectMember


class MemberRepository:
    """Reads/writes for project membership rows."""

    def __init__(self, session: AsyncSession) -> None:
        """Bind the repository to a request-scoped AsyncSession."""
        self.session = session

    async def get(
        self, project_id: uuid.UUID, user_id: uuid.UUID
    ) -> ProjectMember | None:
        """Return the membership row for (project, user), or None."""
        stmt = select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user_id,
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()
