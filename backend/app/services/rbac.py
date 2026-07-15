"""Role/permission matrix business logic: view + edit (ADR-0016, Task 9).

The service does not commit; the request scope (get_session) commits the unit
of work. update_role_permissions guards against self-lockout: the admin role
may never lose the user:manage permission.
"""
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.rbac import RbacRepository
from app.schemas.role import RoleRead

_ADMIN_ROLE_NAME = "admin"
_MANAGE_PERMISSION_CODE = "user:manage"


class RoleNotFoundError(Exception):
    """No role exists with this id."""


class UnknownPermissionError(Exception):
    """One or more requested permission codes are not in the catalog."""


class AdminManageRequiredError(Exception):
    """Removing user:manage from the admin role would self-lock admins out."""


class RbacService:
    """Admin-facing role/permission matrix operations: view + edit."""

    def __init__(self, session: AsyncSession) -> None:
        """Build the service over a session + RBAC repo."""
        self.session = session
        self.rbac = RbacRepository(session)

    async def list_roles(self) -> list[RoleRead]:
        """List every role with the permission codes it currently grants."""
        rows = await self.rbac.list_roles_with_permissions()
        return [
            RoleRead(id=role.id, name=role.name, permissions=codes)
            for role, codes in rows
        ]

    async def update_role_permissions(
        self, role_id: uuid.UUID, codes: list[str]
    ) -> RoleRead:
        """Replace a role's permission set, guarding against self-lockout."""
        role = await self.rbac.role_by_id(role_id)
        if role is None:
            raise RoleNotFoundError(role_id)

        known_codes = set(await self.rbac.list_permission_codes())
        if not set(codes) <= known_codes:
            raise UnknownPermissionError(set(codes) - known_codes)

        if role.name == _ADMIN_ROLE_NAME and _MANAGE_PERMISSION_CODE not in codes:
            raise AdminManageRequiredError()

        await self.rbac.set_role_permissions(role_id, codes)
        return RoleRead(id=role.id, name=role.name, permissions=sorted(set(codes)))
