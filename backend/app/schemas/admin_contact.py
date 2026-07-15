"""DTO for the public admin-contact list (ADR-0016, Task 10)."""
from pydantic import BaseModel


class AdminContact(BaseModel):
    """One admin's contact info (email only) for the public admin list."""

    email: str
