"""Project business logic: CRUD with role-based access (ADR-0015).

A caller's relationship to a project is resolved to a role — owner (implicit via
Project.user_id), editor/viewer (project_member), or none — and each action is
authorized against the capability matrix in services.access. Having NO role is
indistinguishable from "missing" (ProjectNotFoundError -> 404) so the API never
leaks the existence of a project the caller cannot see; having a role but
lacking the capability raises ProjectForbiddenError (-> 403). The service does
not commit; the request scope (get_session) commits the unit of work on success.
"""
import uuid
from collections.abc import Sequence
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.project import Project
from app.repositories.lock import LockRepository
from app.repositories.member import MemberRepository
from app.repositories.project import ProjectRepository
from app.repositories.user import UserRepository
from app.services.access import OWNER, Capability, can
from app.services.lock_guard import take_or_conflict


class ProjectNotFoundError(Exception):
    """A project is missing or the requesting user has no role on it."""


class ProjectForbiddenError(Exception):
    """The user has a role on the project but it lacks the needed capability."""


class StaleVersionError(Exception):
    """A content write carried a version older than the project's (-> 409)."""


class ProjectService:
    """High-level project operations with ownership checks."""

    def __init__(self, session: AsyncSession) -> None:
        """Build the service over a request-scoped session + its repositories."""
        self.repo = ProjectRepository(session)
        self.members = MemberRepository(session)
        self.locks = LockRepository(session)
        self.users = UserRepository(session)

    async def resolve_role(
        self, project_id: uuid.UUID, user_id: uuid.UUID
    ) -> tuple[Project, str]:
        """Return (project, role) for the caller, or raise ProjectNotFoundError.

        Role is `owner` when the caller owns the project, else the member role,
        else there is no role and the project is treated as nonexistent (404).
        """
        project = await self.repo.get_by_id(project_id)
        if project is None:
            raise ProjectNotFoundError(project_id)
        if project.user_id == user_id:
            return project, OWNER
        member = await self.members.get(project_id, user_id)
        if member is None:
            raise ProjectNotFoundError(project_id)
        return project, member.role

    async def get_authorized(
        self, project_id: uuid.UUID, user_id: uuid.UUID, capability: Capability
    ) -> tuple[Project, str]:
        """Resolve the caller's role and authorize `capability`, or raise.

        ProjectNotFoundError (no role -> 404); ProjectForbiddenError (role
        present but lacks the capability -> 403).
        """
        project, role = await self.resolve_role(project_id, user_id)
        if not can(role, capability):
            raise ProjectForbiddenError(project_id)
        return project, role

    async def get_viewable_project(
        self, project_id: uuid.UUID, user_id: uuid.UUID
    ) -> Project:
        """Return a project the caller may view (owner/editor/viewer)."""
        project, _role = await self.get_authorized(
            project_id, user_id, Capability.VIEW
        )
        return project

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

    async def list_projects(self, user_id: uuid.UUID) -> Sequence[Project]:
        """List projects the user can access — owned + shared (newest first)."""
        owned = await self.repo.list_by_user(user_id)
        shared = await self.repo.list_shared_with_roles(user_id)
        merged = list(owned) + [project for project, _role in shared]
        merged.sort(key=lambda p: p.created_at, reverse=True)
        return merged

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
        version: int | None = None,
    ) -> Project:
        """Partially update a project the caller may edit (owner/editor).

        Raises NotFound (no role) or Forbidden (viewer). Content writes
        (dbml_text/layout) additionally require the edit lock — auto-acquired
        when free/own, EditLockConflictError when another user holds it live —
        and, when `version` is supplied, must match the project's current
        version (StaleVersionError otherwise); a content write bumps version.
        Metadata-only writes (name/glyph/color, edited from the sidebar) need
        neither the lock nor a version.
        """
        project, _role = await self.get_authorized(
            project_id, user_id, Capability.EDIT
        )
        is_content_write = dbml_text is not None or layout is not None
        if is_content_write:
            await take_or_conflict(self.locks, self.users, project_id, user_id)
            if version is not None and version != project.version:
                raise StaleVersionError(project_id)
            project.version += 1
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
        """Delete a project — owner only. Raises NotFound/Forbidden otherwise."""
        project, _role = await self.get_authorized(
            project_id, user_id, Capability.DELETE_PROJECT
        )
        await self.repo.delete(project)
