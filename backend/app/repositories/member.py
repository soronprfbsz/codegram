"""Project membership data access: async repository over an AsyncSession.

Pure data access (no domain exceptions, no commits) for the project_member
table, which holds non-owner roles only (ADR-0015). flush() (not commit) sends
SQL within the request transaction; the request scope commits the unit of work.
"""
import uuid
from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.project_member import ProjectMember
from app.models.user import User


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

    async def list_by_project_with_email(
        self, project_id: uuid.UUID
    ) -> Sequence[tuple[ProjectMember, str]]:
        """List a project's members joined to their email (newest first)."""
        stmt = (
            select(ProjectMember, User.email)
            .join(User, User.id == ProjectMember.user_id)
            .where(ProjectMember.project_id == project_id)
            .order_by(ProjectMember.created_at.desc())
        )
        result = await self.session.execute(stmt)
        return [(row[0], row[1]) for row in result.all()]

    async def create(
        self, project_id: uuid.UUID, user_id: uuid.UUID, role: str
    ) -> ProjectMember:
        """Create and persist a membership row; return the ORM object."""
        member = ProjectMember(
            project_id=project_id, user_id=user_id, role=role
        )
        self.session.add(member)
        await self.session.flush()
        return member

    async def update_role(
        self, member: ProjectMember, role: str
    ) -> ProjectMember:
        """Change a member's role."""
        member.role = role
        await self.session.flush()
        return member

    async def delete(self, member: ProjectMember) -> None:
        """Delete a membership row."""
        await self.session.delete(member)
        await self.session.flush()
