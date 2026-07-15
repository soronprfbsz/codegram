"""DTOs for the role/permission matrix (ADR-0016, Task 9)."""
import uuid

from pydantic import BaseModel


class RoleRead(BaseModel):
    """One role with the permission codes it currently grants."""

    id: uuid.UUID
    name: str
    permissions: list[str]


class RolePermissionsUpdate(BaseModel):
    """Body of PATCH /roles/{id}/permissions: the full permission-code set to
    assign to the role."""

    permission_codes: list[str]
