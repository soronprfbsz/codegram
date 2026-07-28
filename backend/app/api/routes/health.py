"""Health-check route: verifies DB connectivity via SELECT 1."""
from fastapi import APIRouter
from sqlalchemy import text

from app.db.session import SessionDep
from app.schemas.health import HealthResponse

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
async def health(session: SessionDep) -> HealthResponse:
    """Return ok when the database responds to SELECT 1."""
    result = await session.execute(text("SELECT 1"))
    result.scalar_one()
    return HealthResponse(status="ok")
