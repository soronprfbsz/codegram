"""Tests for the declarative base and async session dependency."""
import inspect

from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.db.base import Base
from app.db.session import get_session


def test_base_has_metadata():
    assert hasattr(Base, "metadata")
    assert Base.metadata is not None


def test_get_session_is_async_generator_function():
    assert inspect.isasyncgenfunction(get_session)


async def test_get_session_yields_working_session(monkeypatch):
    test_engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    test_maker = async_sessionmaker(
        test_engine, class_=AsyncSession, expire_on_commit=False
    )
    monkeypatch.setattr("app.db.session.async_session_maker", test_maker)

    agen = get_session()
    session = await agen.__anext__()
    try:
        result = await session.execute(text("SELECT 1"))
        assert result.scalar_one() == 1
    finally:
        await agen.aclose()
    await test_engine.dispose()
