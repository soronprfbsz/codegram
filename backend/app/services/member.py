"""Project membership business logic: list, invite, change role, remove, leave.

Authorization reuses ProjectService.get_authorized / resolve_role (the single
role-resolution source). Mutations require the MANAGE_MEMBERS capability (owner
only); listing requires VIEW (any participant can see the roster). Invites
target EXISTING users by email only (ADR-0015) — there are no pending invites.
The service does not commit; the request scope commits the unit of work.
"""
import uuid
from collections.abc import Sequence
from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.member import MemberRepository
from app.repositories.user import UserRepository
from app.services.access import EDITOR, OWNER, Capability
from app.services.project import ProjectService


class UserNotFoundError(Exception):
    """No registered user matches the invited email (-> 404)."""


class AlreadyMemberError(Exception):
    """The invited user already participates in the project (-> 409)."""


class MemberNotFoundError(Exception):
    """The target user is not a member of the project (-> 404)."""


class OwnerCannotLeaveError(Exception):
    """The owner has no membership to leave; they must delete instead (-> 400)."""


class AlreadyOwnerError(Exception):
    """The transfer target already owns the project (-> 409)."""


@dataclass(frozen=True)
class MemberView:
    """One project participant for the roster (owner included)."""

    user_id: uuid.UUID
    email: str
    role: str


class MemberService:
    """High-level membership operations with role-based authorization."""

    def __init__(self, session: AsyncSession) -> None:
        """Build over the request-scoped session + member/user repos + authz."""
        self.members = MemberRepository(session)
        self.users = UserRepository(session)
        self.projects = ProjectService(session)

    async def list_members(
        self, project_id: uuid.UUID, requester_id: uuid.UUID
    ) -> Sequence[MemberView]:
        """List the owner + members of a project (requires VIEW)."""
        project, _role = await self.projects.get_authorized(
            project_id, requester_id, Capability.VIEW
        )
        owner = await self.users.get_by_id(project.user_id)
        views: list[MemberView] = []
        if owner is not None:
            views.append(MemberView(owner.id, owner.email, OWNER))
        for member, email in await self.members.list_by_project_with_email(
            project_id
        ):
            views.append(MemberView(member.user_id, email, member.role))
        return views

    async def invite(
        self,
        project_id: uuid.UUID,
        requester_id: uuid.UUID,
        email: str,
        role: str,
    ) -> MemberView:
        """Grant an existing user (by email) a role on the project (owner only)."""
        project, _role = await self.projects.get_authorized(
            project_id, requester_id, Capability.MANAGE_MEMBERS
        )
        user = await self.users.get_by_email(email)
        if user is None:
            raise UserNotFoundError(email)
        if user.id == project.user_id:
            raise AlreadyMemberError(user.id)  # the owner
        if await self.members.get(project_id, user.id) is not None:
            raise AlreadyMemberError(user.id)
        await self.members.create(project_id, user.id, role)
        return MemberView(user.id, user.email, role)

    async def update_role(
        self,
        project_id: uuid.UUID,
        requester_id: uuid.UUID,
        target_user_id: uuid.UUID,
        role: str,
    ) -> MemberView:
        """Change a member's role (owner only)."""
        await self.projects.get_authorized(
            project_id, requester_id, Capability.MANAGE_MEMBERS
        )
        member = await self.members.get(project_id, target_user_id)
        if member is None:
            raise MemberNotFoundError(target_user_id)
        await self.members.update_role(member, role)
        user = await self.users.get_by_id(target_user_id)
        email = user.email if user is not None else ""
        return MemberView(target_user_id, email, role)

    async def remove(
        self,
        project_id: uuid.UUID,
        requester_id: uuid.UUID,
        target_user_id: uuid.UUID,
    ) -> None:
        """Remove a member (owner only)."""
        await self.projects.get_authorized(
            project_id, requester_id, Capability.MANAGE_MEMBERS
        )
        member = await self.members.get(project_id, target_user_id)
        if member is None:
            raise MemberNotFoundError(target_user_id)
        await self.members.delete(member)

    async def transfer_ownership(
        self,
        project_id: uuid.UUID,
        requester_id: uuid.UUID,
        target_user_id: uuid.UUID,
    ) -> Sequence[MemberView]:
        """Hand ownership to an existing member; the old owner becomes editor.

        Owner only. The target must already be a member (editor/viewer). Its
        project_member row is removed (the owner is never stored there),
        Project.user_id becomes the target, and the former owner is granted the
        editor role. Returns the updated roster.
        """
        project, _role = await self.projects.get_authorized(
            project_id, requester_id, Capability.TRANSFER_OWNERSHIP
        )
        if target_user_id == project.user_id:
            raise AlreadyOwnerError(target_user_id)
        member = await self.members.get(project_id, target_user_id)
        if member is None:
            raise MemberNotFoundError(target_user_id)
        old_owner_id = project.user_id
        await self.members.delete(member)
        await self.projects.repo.set_owner(project, target_user_id)
        await self.members.create(project_id, old_owner_id, EDITOR)
        return await self.list_members(project_id, requester_id)

    async def leave(
        self, project_id: uuid.UUID, requester_id: uuid.UUID
    ) -> None:
        """Remove the caller's own membership. The owner cannot leave."""
        _project, role = await self.projects.resolve_role(
            project_id, requester_id
        )
        if role == OWNER:
            raise OwnerCannotLeaveError(project_id)
        member = await self.members.get(project_id, requester_id)
        if member is None:  # defensive — role resolved to member above
            raise MemberNotFoundError(requester_id)
        await self.members.delete(member)
