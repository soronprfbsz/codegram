"""Shared pytest fixtures: async test DB, session override, and AsyncClient."""
from collections.abc import AsyncGenerator

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.db.base import Base
from app.db.session import get_session
from app.main import app

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest.fixture
async def test_engine():
    """Create an in-memory async engine with schema initialized."""
    engine = create_async_engine(TEST_DATABASE_URL)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    await engine.dispose()


@pytest.fixture
async def test_session(test_engine) -> AsyncGenerator[AsyncSession, None]:
    """Yield an AsyncSession bound to the test engine."""
    maker = async_sessionmaker(
        test_engine, class_=AsyncSession, expire_on_commit=False
    )
    async with maker() as session:
        yield session


@pytest.fixture
async def client(test_session) -> AsyncGenerator[AsyncClient, None]:
    """Yield an AsyncClient with get_session overridden to the test session."""

    async def override_get_session() -> AsyncGenerator[AsyncSession, None]:
        yield test_session

    app.dependency_overrides[get_session] = override_get_session
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


async def _register_and_login(
    ac: AsyncClient, email: str, password: str
) -> None:
    """Register a user then log in so the AsyncClient carries the auth cookie."""
    await ac.post(
        "/api/auth/register",
        json={"email": email, "password": password},
    )
    await ac.post(
        "/api/auth/jwt/login",
        data={"username": email, "password": password},
    )


@pytest.fixture
async def authenticated_client(
    test_session,
) -> AsyncGenerator[AsyncClient, None]:
    """An AsyncClient logged in as alice@example.com (own auth cookie)."""

    async def override_get_session() -> AsyncGenerator[AsyncSession, None]:
        yield test_session

    app.dependency_overrides[get_session] = override_get_session
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        await _register_and_login(ac, "alice@example.com", "password123")
        yield ac
    app.dependency_overrides.clear()


@pytest.fixture
async def second_authenticated_client(
    test_session,
) -> AsyncGenerator[AsyncClient, None]:
    """A second AsyncClient logged in as bob@example.com for isolation tests.

    Shares the same test_session override as authenticated_client (one DB) but
    carries its own auth cookie, so bob can attempt to reach alice's projects.
    """

    async def override_get_session() -> AsyncGenerator[AsyncSession, None]:
        yield test_session

    app.dependency_overrides[get_session] = override_get_session
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        await _register_and_login(ac, "bob@example.com", "password123")
        yield ac
    app.dependency_overrides.clear()
