"""Async SQLAlchemy engine, session maker, and FastAPI session dependency."""
from collections.abc import AsyncGenerator
from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import settings

engine = create_async_engine(
    settings.database_url,
    echo=False,
    future=True,
    pool_pre_ping=True,
)

async_session_maker = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency: yield the one session of this request.

    The repository/service/router only flush(); the request scope owns the
    transaction. This dependency opens/closes the session and rolls back on
    error — the *commit* belongs to `commit_unit_of_work` below, which runs
    early enough to land before the response is sent (ADR-0022).
    """
    async with async_session_maker() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise


# The one way to inject a session (G1). Everything in a request — routes,
# permission dependencies, the fastapi-users chain — shares this one session,
# so they also share one transaction.
SessionDep = Annotated[AsyncSession, Depends(get_session)]


async def commit_unit_of_work(session: SessionDep) -> AsyncGenerator[None, None]:
    """Commit the request's unit of work *before* the response is sent.

    Registered app-wide in main.py with scope="function", which ends this
    dependency after the path operation function but before FastAPI sends the
    response (ADR-0022). With FastAPI's default scope the 2xx goes out first,
    so the very next request can still read the pre-commit state and a failing
    commit can no longer be reported to the client.

    The commit cannot live on `get_session` itself: fastapi-users' get_user_db
    is a plain (request-scoped) dependency and FastAPI forbids a request-scoped
    dependency from depending on a function-scoped one. Splitting the commit out
    keeps one session per request and moves only the commit earlier.

    On an endpoint error the exception is thrown in at the yield, so the commit
    below is skipped and get_session rolls back.
    """
    yield
    await session.commit()
