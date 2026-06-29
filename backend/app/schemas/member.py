"""Pydantic v2 DTOs for project membership (sharing).

Invite/role bodies accept only the assignable member roles ("editor"|"viewer")
— the owner role is never assigned here (it is implicit via Project.user_id),
so an "owner" value is rejected with 422. MemberRead is the response view of one
participant (owner included when listing), validated from a MemberView object.
"""
import uuid
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr

#: Roles a member can be granted (owner is implicit, never assigned).
MemberRole = Literal["editor", "viewer"]


class MemberInvite(BaseModel):
    """Body for POST .../members — invite an existing user by email."""

    email: EmailStr
    role: MemberRole


class MemberRoleUpdate(BaseModel):
    """Body for PATCH .../members/{user_id} — change a member's role."""

    role: MemberRole


class MemberRead(BaseModel):
    """Response DTO for one project participant (owner or member)."""

    model_config = ConfigDict(from_attributes=True)

    user_id: uuid.UUID
    email: str
    role: str
