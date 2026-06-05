"""Health-check route: verifies DB connectivity via SELECT 1."""
from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_session
from app.schemas.health import HealthResponse

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
async def health(session: AsyncSession = Depends(get_session)) -> HealthResponse:
    """Return ok when the database responds to SELECT 1."""
    result = await session.execute(text("SELECT 1"))
    result.scalar_one()
    return HealthResponse(status="ok")
