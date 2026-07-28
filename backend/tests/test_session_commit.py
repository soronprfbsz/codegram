"""Regression: the request scope must commit, and it must commit before the
response is sent (ADR-0022).

Uses a StaticPool in-memory sqlite (a single shared connection) so that two
SEPARATE sessions observe the same database. This deliberately avoids the
shared `test_session` fixture, which reuses one session and would mask a
never-commit bug (a flush is visible within the same session even without a
commit).
"""
import uuid
from collections.abc import AsyncGenerator

import pytest
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import StaticPool

import app.db.session as session_module
from app.db.base import Base
from app.models.project import Project
from app.models.user import User


@pytest.fixture
async def commit_engine():
    """In-memory sqlite on a single shared connection (StaticPool)."""
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    await engine.dispose()


async def test_request_scope_commits_across_sessions(commit_engine) -> None:
    """get_session + commit_unit_of_work persist a repo-style flush-only write."""
    maker = async_sessionmaker(
        commit_engine, class_=AsyncSession, expire_on_commit=False
    )

    # Seed a user (FK target) in its own committed session.
    user_id = uuid.uuid4()
    async with maker() as seed:
        seed.add(
            User(
                id=user_id,
                email="commit@example.com",
                hashed_password="x",
                is_active=True,
                is_superuser=False,
                is_verified=False,
            )
        )
        await seed.commit()

    # Drive the REAL get_session against this engine: it must commit on exit.
    project_id = uuid.uuid4()

    async def run_request() -> None:
        async for session in _patched_get_session(maker):
            # As FastAPI does: the app-wide commit dependency wraps the endpoint.
            committer = session_module.commit_unit_of_work(session)
            await anext(committer)
            session.add(
                Project(id=project_id, user_id=user_id, name="Persisted")
            )
            await session.flush()  # repo-style flush only; no explicit commit
            with pytest.raises(StopAsyncIteration):
                await anext(committer)  # exit code: commits

    await run_request()

    # A brand-new, independent session must see the committed project.
    async with maker() as verify:
        found = await verify.get(Project, project_id)
        assert found is not None
        assert found.name == "Persisted"


def test_commit_runs_before_the_response_is_sent() -> None:
    """The commit must be an app-wide dependency with scope="function".

    scope="function" is what makes FastAPI end the dependency — and therefore
    commit — after the path operation but BEFORE the response is sent. With the
    default scope the 2xx goes out first and the next request reads pre-commit
    state (ADR-0022). conftest overrides get_session with a single shared
    session, so this ordering can only be asserted on the declaration.
    """
    from app.main import app

    registered = [
        d for d in app.router.dependencies
        if d.dependency is session_module.commit_unit_of_work
    ]
    assert len(registered) == 1, "commit_unit_of_work must be app-wide"
    assert registered[0].scope == "function"


async def _patched_get_session(
    maker: async_sessionmaker,
) -> AsyncGenerator[AsyncSession, None]:
    """Invoke the production get_session body against a test session maker."""
    original = session_module.async_session_maker
    session_module.async_session_maker = maker
    try:
        async for session in session_module.get_session():
            yield session
    finally:
        session_module.async_session_maker = original
