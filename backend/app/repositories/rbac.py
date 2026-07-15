"""RBAC data access layer: roles, permissions, role_permissions (ADR-0016).

Pure data access: no domain exceptions, no commits, only flush(). Includes
`ensure_seed`, an idempotent version of the migration's seed step — tests build
the schema via `Base.metadata.create_all`, which does not run Alembic's data
seed, so tests (and any fresh in-memory DB) call this instead.
"""
import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.permission import Permission
from app.models.role import Role
from app.models.role_permission import RolePermission
from app.models.user import User

_SEED_PERMISSIONS = {
    "user:read": "View user accounts",
    "user:manage": "Create/update/delete user accounts",
}
_SEED_ROLE_PERMISSIONS = {
    "admin": ["user:read", "user:manage"],
    "user": ["user:read"],
}


class RbacRepository:
    """CRUD + query helpers for roles, permissions, and their mapping."""

    def __init__(self, session: AsyncSession) -> None:
        """Bind the repository to a session (request- or job-scoped)."""
        self.session = session

    async def ensure_seed(self) -> None:
        """Create the default roles/permissions/mapping if absent (idempotent)."""
        roles: dict[str, Role] = {}
        for name in _SEED_ROLE_PERMISSIONS:
            role = await self.role_by_name(name)
            if role is None:
                role = Role(name=name)
                self.session.add(role)
                await self.session.flush()
            roles[name] = role

        permissions: dict[str, Permission] = {}
        for code, description in _SEED_PERMISSIONS.items():
            result = await self.session.execute(
                select(Permission).where(Permission.code == code)
            )
            permission = result.scalar_one_or_none()
            if permission is None:
                permission = Permission(code=code, description=description)
                self.session.add(permission)
                await self.session.flush()
            permissions[code] = permission

        for role_name, codes in _SEED_ROLE_PERMISSIONS.items():
            role = roles[role_name]
            for code in codes:
                permission = permissions[code]
                result = await self.session.execute(
                    select(RolePermission).where(
                        RolePermission.role_id == role.id,
                        RolePermission.permission_id == permission.id,
                    )
                )
                if result.scalar_one_or_none() is None:
                    self.session.add(
                        RolePermission(
                            role_id=role.id, permission_id=permission.id
                        )
                    )
            await self.session.flush()

    async def role_by_name(self, name: str) -> Role | None:
        """Return the role with this name, or None."""
        result = await self.session.execute(
            select(Role).where(Role.name == name)
        )
        return result.scalar_one_or_none()

    async def permissions_for_user(self, user_id: uuid.UUID) -> set[str]:
        """Resolve a user's role to its granted permission codes."""
        result = await self.session.execute(
            select(Permission.code)
            .join(RolePermission, RolePermission.permission_id == Permission.id)
            .join(User, User.role_id == RolePermission.role_id)
            .where(User.id == user_id)
        )
        return set(result.scalars().all())

    async def list_roles_with_permissions(self) -> list[tuple[Role, list[str]]]:
        """Return every role paired with the list of permission codes it grants."""
        roles_result = await self.session.execute(select(Role))
        roles = list(roles_result.scalars().all())

        out: list[tuple[Role, list[str]]] = []
        for role in roles:
            perms_result = await self.session.execute(
                select(Permission.code)
                .join(
                    RolePermission,
                    RolePermission.permission_id == Permission.id,
                )
                .where(RolePermission.role_id == role.id)
            )
            out.append((role, list(perms_result.scalars().all())))
        return out

    async def set_role_permissions(
        self, role_id: uuid.UUID, codes: list[str]
    ) -> None:
        """Replace the role's permission set with the given existing codes."""
        existing_result = await self.session.execute(
            select(RolePermission).where(RolePermission.role_id == role_id)
        )
        for row in existing_result.scalars().all():
            await self.session.delete(row)
        await self.session.flush()

        if not codes:
            return

        perms_result = await self.session.execute(
            select(Permission).where(Permission.code.in_(codes))
        )
        for permission in perms_result.scalars().all():
            self.session.add(
                RolePermission(role_id=role_id, permission_id=permission.id)
            )
        await self.session.flush()

    async def list_admin_emails(self) -> list[str]:
        """Return the emails of every user whose role is "admin"."""
        result = await self.session.execute(
            select(User.email)
            .join(Role, Role.id == User.role_id)
            .where(Role.name == "admin")
        )
        return list(result.scalars().all())

    async def count_admins(self) -> int:
        """Count users whose role is "admin"."""
        result = await self.session.execute(
            select(func.count())
            .select_from(User)
            .join(Role, Role.id == User.role_id)
            .where(Role.name == "admin")
        )
        return int(result.scalar_one())
