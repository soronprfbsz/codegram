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


class AccountRead(BaseModel):
    """One row of the admin-facing account list (or a role-change result)."""

    id: uuid.UUID
    email: str
    role_name: str | None


class AccountRoleUpdate(BaseModel):
    """Body of PATCH /accounts/{id}/role: the role name to assign."""

    role_name: str


class PasswordResetRead(BaseModel):
    """Response of POST /accounts/{id}/reset-password: the plaintext temp
    password, shown once."""

    temp_password: str
