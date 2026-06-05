"""Health-check response schema."""
from pydantic import BaseModel


class HealthResponse(BaseModel):
    """Response body for the health endpoint."""

    status: str
