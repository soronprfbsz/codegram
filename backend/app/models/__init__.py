"""SQLAlchemy ORM models.

Importing models here ensures their tables register on Base.metadata for
Alembic autogenerate (via `import app.models` in alembic/env.py) and for
Base.metadata.create_all in the test fixtures.
"""
from app.models.permission import Permission
from app.models.project import Project
from app.models.project_edit_lock import ProjectEditLock
from app.models.project_member import ProjectMember
from app.models.project_snapshot import ProjectSnapshot
from app.models.role import Role
from app.models.role_permission import RolePermission
from app.models.user import User

__all__ = [
    "User",
    "Project",
    "ProjectSnapshot",
    "ProjectMember",
    "ProjectEditLock",
    "Role",
    "Permission",
    "RolePermission",
]
