"""Project access policy: roles and the capabilities each role may exercise.

Pure domain policy (no DB, no I/O) — the single source of truth for "which role
can do what" (ADR-0015). The owner role is implicit via Project.user_id; editor
and viewer come from project_member.role. Services resolve a caller's role for a
project, then call `can(role, capability)` to authorize.
"""
from enum import Enum

OWNER = "owner"
EDITOR = "editor"
VIEWER = "viewer"

#: Roles storable in project_member.role (owner is never stored there).
MEMBER_ROLES = frozenset({EDITOR, VIEWER})


class Capability(str, Enum):
    """A distinct action gated by role."""

    VIEW = "view"  # open / list / export / read snapshot history
    EDIT = "edit"  # dbml/layout/metadata writes, DB sync, snapshot restore
    CREATE_SNAPSHOT = "create_snapshot"
    DELETE_SNAPSHOT = "delete_snapshot"
    MANAGE_MEMBERS = "manage_members"  # invite / change role / remove
    DELETE_PROJECT = "delete_project"
    FORCE_LOCK = "force_lock"  # owner-only force takeover of a live edit lock


#: Capability -> roles allowed to exercise it (Q5 permission matrix).
_ALLOWED: dict[Capability, frozenset[str]] = {
    Capability.VIEW: frozenset({OWNER, EDITOR, VIEWER}),
    Capability.EDIT: frozenset({OWNER, EDITOR}),
    Capability.CREATE_SNAPSHOT: frozenset({OWNER, EDITOR}),
    Capability.DELETE_SNAPSHOT: frozenset({OWNER}),
    Capability.MANAGE_MEMBERS: frozenset({OWNER}),
    Capability.DELETE_PROJECT: frozenset({OWNER}),
    Capability.FORCE_LOCK: frozenset({OWNER}),
}


def can(role: str, capability: Capability) -> bool:
    """True iff `role` is permitted to perform `capability`."""
    return role in _ALLOWED[capability]
