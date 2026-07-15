"""DTO for the authenticated caller's own account state (ADR-0016)."""
import uuid

from pydantic import BaseModel


class AccountMe(BaseModel):
    """Identity plus resolved RBAC state: role name, granted permission codes,
    and whether a password change is being forced."""

    id: uuid.UUID
    email: str
    role_name: str | None
    permissions: list[str]
    must_change_password: bool
