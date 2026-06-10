# Codegram — Plan 0: Foundation & Scaffolding (Implementation Plan)
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a running, testable monorepo dev environment (Docker Compose: postgres + FastAPI backend + Vite/React frontend) with a DB-backed health endpoint and passing backend/frontend/E2E smoke tests, and nothing from later plans.

**Architecture:** Monorepo with a clean/layered FastAPI backend (router → service → repository; schema DTOs; SQLAlchemy models) using async SQLAlchemy 2.0 + Alembic, and a Feature-Sliced Design React 19 frontend (app/pages/widgets/features/entities/shared) with TanStack Query, Zustand, and React Router. The three services run under Docker Compose with healthchecks and an in-compose network; the frontend proxies `/api` to the backend in dev.

**Tech Stack:** Backend — Python 3.13, FastAPI 0.136, Uvicorn, SQLAlchemy 2.0, asyncpg, Alembic, pydantic 2.13 / pydantic-settings, pytest + pytest-asyncio + httpx + aiosqlite. Frontend — React 19, TypeScript 6, Vite 8, React Router 7, TanStack Query 5, Zustand 5, shadcn (preset b1FlFygMM), Vitest 4 + Testing Library + jsdom, Playwright 1.60. Infra — Docker Compose, postgres:17-alpine, python:3.13-slim, node:22-alpine.

---

## File Structure

Root:
- `.gitignore` — ignores python/node/.env/.venv/node_modules/dist/__pycache__/.pytest_cache build artifacts.
- `.env.example` — documents every env var compose reads, with dev defaults.
- `README.md` — repo overview and quickstart.
- `docker-compose.yml` — wires postgres + backend + frontend with healthchecks/depends_on and ports.

Backend (`backend/`):
- `pyproject.toml` — hatchling project metadata, pinned deps, dev extras, pytest-asyncio config.
- `Dockerfile` — dev image (python:3.13-slim) installing deps from pyproject; runs `uvicorn --reload`.
- `alembic.ini` — Alembic config; `sqlalchemy.url` left blank (injected by env.py).
- `alembic/env.py` — async Alembic environment wired to `settings.database_url` and `Base.metadata`.
- `alembic/script.py.mako` — migration script template for `alembic revision`.
- `alembic/versions/.gitkeep` — keeps the empty versions directory tracked.
- `app/__init__.py` — backend application package marker.
- `app/main.py` — FastAPI app factory (`create_app`), CORS, mounts api router under `/api`.
- `app/core/__init__.py` — core package marker.
- `app/core/config.py` — pydantic-settings `Settings` (DATABASE_URL, CORS_ORIGINS, etc.).
- `app/db/__init__.py` — db package marker.
- `app/db/base.py` — SQLAlchemy 2.0 `DeclarativeBase`.
- `app/db/session.py` — async engine + `async_sessionmaker` + `get_session` dependency.
- `app/api/__init__.py` — api package marker.
- `app/api/router.py` — aggregate `api_router` mounted under `/api`.
- `app/api/routes/__init__.py` — route modules package marker.
- `app/api/routes/health.py` — `GET /health` endpoint that runs `SELECT 1`.
- `app/schemas/__init__.py` — schemas package marker.
- `app/schemas/health.py` — `HealthResponse` pydantic model.
- `app/services/__init__.py` — service-layer placeholder package (Plan 2+).
- `app/repositories/__init__.py` — repository-layer placeholder package (Plan 2+).
- `app/models/__init__.py` — SQLAlchemy models placeholder package (Plan 1+).
- `tests/__init__.py` — test suite package marker.
- `tests/conftest.py` — async test DB + session override + httpx AsyncClient fixtures.
- `tests/test_smoke.py` — asserts the `app` package imports cleanly.
- `tests/test_config.py` — Settings defaults + env override tests.
- `tests/test_session.py` — Base/metadata + `get_session` async-generator tests.
- `tests/test_app.py` — app factory + router mount tests.
- `tests/test_health.py` — `/api/health` returns `{"status":"ok"}` test.

Frontend (`frontend/`):
- `package.json` — npm manifest: deps, scripts (dev/build/test/e2e).
- `Dockerfile` — dev image (node:22-alpine) installing deps via `npm ci`; runs `vite dev --host`.
- `index.html` — Vite HTML entry, mounts `#root`.
- `vite.config.ts` — Vite config: React plugin, `@` alias, dev server `/api` proxy.
- `vitest.config.ts` — Vitest config: jsdom env, globals, setup file, `@` alias.
- `tsconfig.json` — TS project references root.
- `tsconfig.app.json` — TS config for `src` app code.
- `tsconfig.node.json` — TS config for Vite/Vitest/Playwright config files.
- `playwright.config.ts` — Playwright config: testDir `e2e`, webServer = vite dev.
- `components.json` — shadcn config (UI alias → `src/shared/ui`).
- `src/main.tsx` — React 19 entry; mounts `<App />` to `#root`.
- `src/vite-env.d.ts` — Vite client type reference.
- `src/app/index.tsx` — App component: composes providers + router.
- `src/app/providers/query.tsx` — TanStack Query `QueryClientProvider`.
- `src/app/providers/router.tsx` — React Router v7 `createBrowserRouter` → pages.
- `src/pages/home/index.tsx` — Home page component.
- `src/pages/home/index.test.tsx` — Vitest smoke test for Home.
- `src/widgets/.gitkeep` — FSD widgets layer placeholder.
- `src/features/.gitkeep` — FSD features layer placeholder.
- `src/entities/.gitkeep` — FSD entities layer placeholder.
- `src/shared/api/client.ts` — fetch wrapper reading `VITE_API_URL`.
- `src/shared/config/env.ts` — typed env accessor.
- `src/shared/store/ui.ts` — example Zustand store.
- `src/shared/ui/.gitkeep` — placeholder; shadcn components land here.
- `src/shared/lib/utils.ts` — shadcn `cn` utility (relocated into FSD shared).
- `src/test/setup.ts` — Vitest setup: jest-dom + cleanup.
- `e2e/home.spec.ts` — Playwright smoke E2E asserting visible Home text.

FSD import rule (enforced by convention; ESLint enforcement is a later plan): a layer may import only from layers strictly below it — `app > pages > widgets > features > entities > shared`. `shared` imports nothing upward; same-layer cross-imports are disallowed.

---

## Tasks

### Task 1: Initialize repository

**Files:**
- Run: `git init` in `/home/soron/projects/codegram`
- Create: `/home/soron/projects/codegram/.gitignore`
- Create: `/home/soron/projects/codegram/README.md`

- [ ] **Step 1: Initialize the git repository. Run from `/home/soron/projects/codegram`.**

```bash
cd /home/soron/projects/codegram && git init
```
Expected output: `Initialized empty Git repository in /home/soron/projects/codegram/.git/`.

- [ ] **Step 2: Create the root `.gitignore` covering python, node, env, virtualenv, and build artifacts.**

`/home/soron/projects/codegram/.gitignore`
```gitignore
# Python
__pycache__/
*.py[cod]
*.egg-info/
.pytest_cache/
.venv/
venv/

# Node
node_modules/
dist/
.vite/

# Environment
.env
.env.*
!.env.example

# Playwright
playwright-report/
test-results/

# OS / editor
.DS_Store
*.log
```

- [ ] **Step 3: Create the `README.md`.**

`/home/soron/projects/codegram/README.md`
```markdown
# Codegram

A web service that renders, edits, and exports ERDs from DBML text.

DBML text is the single source of truth. The frontend parses DBML with `@dbml/core`;
the backend never parses DBML. One Project = one DBML document = one ERD.

## Monorepo layout

- `backend/` — FastAPI (clean/layered) + async SQLAlchemy 2.0 + Alembic.
- `frontend/` — React 19 + TypeScript (Feature-Sliced Design) + Vite.
- `docker-compose.yml` — postgres + backend + frontend dev stack.

## Quickstart

```bash
cp .env.example .env
docker compose up -d --build
# backend health: http://localhost:8000/api/health
# frontend:       http://localhost:5173
```

## Tests

- Backend: `docker compose exec -T backend pytest`
- Frontend unit: `docker compose exec -T frontend npm run test:run`
- E2E: `cd frontend && npx playwright test`
```

- [ ] **Step 4: Make the initial commit. Run from `/home/soron/projects/codegram`.**

```bash
cd /home/soron/projects/codegram && git add .gitignore README.md CONTEXT.md docs && git commit -m "chore: initialize repository with gitignore and readme"
```
Expected output: a commit summary listing `.gitignore`, `README.md`, `CONTEXT.md`, and the `docs/` files as created.

---

### Task 2: Backend package skeleton, pyproject, and test scaffolding

**Files:**
- Create: `/home/soron/projects/codegram/backend/pyproject.toml`
- Create: `/home/soron/projects/codegram/backend/app/__init__.py`
- Create: `/home/soron/projects/codegram/backend/app/core/__init__.py`
- Create: `/home/soron/projects/codegram/backend/app/db/__init__.py`
- Create: `/home/soron/projects/codegram/backend/app/api/__init__.py`
- Create: `/home/soron/projects/codegram/backend/app/api/routes/__init__.py`
- Create: `/home/soron/projects/codegram/backend/app/schemas/__init__.py`
- Create: `/home/soron/projects/codegram/backend/app/services/__init__.py`
- Create: `/home/soron/projects/codegram/backend/app/repositories/__init__.py`
- Create: `/home/soron/projects/codegram/backend/app/models/__init__.py`
- Create: `/home/soron/projects/codegram/backend/tests/__init__.py`
- Test: `/home/soron/projects/codegram/backend/tests/test_smoke.py`

- [ ] **Step 1: Write the `pyproject.toml` with pinned dependencies and pytest asyncio config.**

`/home/soron/projects/codegram/backend/pyproject.toml`
```toml
[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[project]
name = "codegram-backend"
version = "0.1.0"
description = "Codegram Backend Service"
requires-python = ">=3.11"
dependencies = [
    "fastapi==0.136.3",
    "uvicorn[standard]==0.49.0",
    "sqlalchemy==2.0.50",
    "asyncpg==0.31.0",
    "alembic==1.18.4",
    "pydantic==2.13",
    "pydantic-settings==2.14.1",
    "anyio>=4.13.0",
]

[project.optional-dependencies]
dev = [
    "pytest>=7.4.0",
    "pytest-asyncio==1.4.0",
    "httpx>=0.28.1",
    "aiosqlite>=0.20.0",
]

[tool.hatch.build.targets.wheel]
packages = ["app"]

[tool.pytest.ini_options]
asyncio_mode = "auto"
asyncio_default_fixture_loop_scope = "function"
testpaths = ["tests"]
python_files = ["test_*.py"]
addopts = "-v --tb=short"
```

- [ ] **Step 2: Write the smoke test that asserts the `app` package is importable and exposes its docstring.**

`/home/soron/projects/codegram/backend/tests/__init__.py`
```python
"""Backend test suite."""
```

`/home/soron/projects/codegram/backend/tests/test_smoke.py`
```python
"""Smoke test: the app package imports cleanly."""
import importlib


def test_app_package_imports():
    module = importlib.import_module("app")
    assert module.__doc__ == "Codegram backend application package."
```

- [ ] **Step 3: Create the virtual environment and install only the test runner (NOT the project), then run the smoke test and see it FAIL.** The project itself is not installed yet (and the `app/` package does not exist), so the import target is absent — this is the red phase. Run from `/home/soron/projects/codegram/backend`.

```bash
cd /home/soron/projects/codegram/backend && python -m venv .venv && . .venv/bin/activate && pip install pytest && pytest tests/test_smoke.py
```
Expected failure: `tests/test_smoke.py::test_app_package_imports FAILED` with `ModuleNotFoundError: No module named 'app'` (the package markers do not exist yet).

- [ ] **Step 4: Create the empty package markers to make the import succeed.** Each of the following files contains exactly one line: a module docstring (so the file is never zero-bytes and the package intent is clear).

`/home/soron/projects/codegram/backend/app/__init__.py`
```python
"""Codegram backend application package."""
```

`/home/soron/projects/codegram/backend/app/core/__init__.py`
```python
"""Core package: configuration and cross-cutting concerns."""
```

`/home/soron/projects/codegram/backend/app/db/__init__.py`
```python
"""Database package: declarative base, engine, and session."""
```

`/home/soron/projects/codegram/backend/app/api/__init__.py`
```python
"""API package: FastAPI routers."""
```

`/home/soron/projects/codegram/backend/app/api/routes/__init__.py`
```python
"""API route modules."""
```

`/home/soron/projects/codegram/backend/app/schemas/__init__.py`
```python
"""Pydantic DTO schemas."""
```

`/home/soron/projects/codegram/backend/app/services/__init__.py`
```python
"""Service layer (business logic). Populated in Plan 2+."""
```

`/home/soron/projects/codegram/backend/app/repositories/__init__.py`
```python
"""Repository layer (data access). Populated in Plan 2+."""
```

`/home/soron/projects/codegram/backend/app/models/__init__.py`
```python
"""SQLAlchemy ORM models. Populated in Plan 1+."""
```

- [ ] **Step 5: Install the backend with dev extras now that `app/` exists (hatchling can build the wheel), then run the smoke test and see it PASS.** Run from `/home/soron/projects/codegram/backend` with the venv active.

```bash
cd /home/soron/projects/codegram/backend && . .venv/bin/activate && pip install -e ".[dev]" && pytest tests/test_smoke.py
```
Expected output: pip prints `Successfully installed ... codegram-backend-0.1.0 ...`, then `tests/test_smoke.py::test_app_package_imports PASSED` and `1 passed`.

- [ ] **Step 6: Commit.**

```bash
cd /home/soron/projects/codegram && git add backend/pyproject.toml backend/app backend/tests && git commit -m "chore(backend): scaffold package skeleton, pyproject, and smoke test"
```

---

### Task 3: Pydantic-settings configuration

**Files:**
- Create: `/home/soron/projects/codegram/backend/app/core/config.py`
- Test: `/home/soron/projects/codegram/backend/tests/test_config.py`

- [ ] **Step 1: Write the failing test for `Settings`. It asserts defaults and that environment variables override them.**

`/home/soron/projects/codegram/backend/tests/test_config.py`
```python
"""Tests for application settings loading."""
from app.core.config import Settings


def test_settings_defaults():
    settings = Settings(_env_file=None)
    assert settings.environment == "development"
    assert settings.debug is False
    assert settings.cors_origins == ["http://localhost:5173"]


def test_env_overrides_defaults(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("DEBUG", "true")
    monkeypatch.setenv(
        "DATABASE_URL",
        "postgresql+asyncpg://u:p@db:5432/x",
    )
    settings = Settings(_env_file=None)
    assert settings.environment == "production"
    assert settings.debug is True
    assert settings.database_url == "postgresql+asyncpg://u:p@db:5432/x"


def test_cors_origins_parsed_from_csv(monkeypatch):
    monkeypatch.setenv(
        "CORS_ORIGINS",
        "http://localhost:5173,http://localhost:3000",
    )
    settings = Settings(_env_file=None)
    assert settings.cors_origins == [
        "http://localhost:5173",
        "http://localhost:3000",
    ]
```

- [ ] **Step 2: Run the test and see it FAIL (the module does not exist yet). Run from `/home/soron/projects/codegram/backend` with the venv active.**

```bash
cd /home/soron/projects/codegram/backend && . .venv/bin/activate && pytest tests/test_config.py
```
Expected failure: collection error `ModuleNotFoundError: No module named 'app.core.config'`.

- [ ] **Step 3: Write the `Settings` implementation. The `CORS_ORIGINS` env var is a comma-separated string parsed into a list via a field validator.**

`/home/soron/projects/codegram/backend/app/core/config.py`
```python
"""Application configuration via pydantic-settings."""
from typing import Annotated

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    """Environment configuration loaded from .env or OS env vars."""

    # Database (asyncpg driver is mandatory for the async engine).
    database_url: str = (
        "postgresql+asyncpg://codegram_user:postgres_dev@localhost:5432/codegram_dev"
    )

    # CORS allowed origins (comma-separated in env).
    # NoDecode disables pydantic-settings' JSON pre-decoding of this complex type,
    # so the raw CSV string reaches the field validator below (a bare CSV is not
    # valid JSON and would otherwise raise before the validator runs).
    cors_origins: Annotated[list[str], NoDecode] = ["http://localhost:5173"]

    # App.
    debug: bool = False
    environment: str = "development"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_cors_origins(cls, value: object) -> object:
        """Parse a comma-separated string into a list of origins."""
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value


settings = Settings()
```

- [ ] **Step 4: Run the test and see it PASS. Run from `/home/soron/projects/codegram/backend` with the venv active.**

```bash
cd /home/soron/projects/codegram/backend && . .venv/bin/activate && pytest tests/test_config.py
```
Expected output: `3 passed`.

- [ ] **Step 5: Commit.**

```bash
cd /home/soron/projects/codegram && git add backend/app/core/config.py backend/tests/test_config.py && git commit -m "feat(backend): add pydantic-settings configuration"
```

---

### Task 4: Async SQLAlchemy declarative base, engine, session, and `get_session` dependency

**Files:**
- Create: `/home/soron/projects/codegram/backend/app/db/base.py`
- Create: `/home/soron/projects/codegram/backend/app/db/session.py`
- Test: `/home/soron/projects/codegram/backend/tests/test_session.py`

- [ ] **Step 1: Write the failing test. It asserts `Base` is a declarative base with a `metadata` attribute, and that `get_session` is an async generator dependency yielding a working `AsyncSession` (verified with `SELECT 1` against in-memory SQLite).**

`/home/soron/projects/codegram/backend/tests/test_session.py`
```python
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
```

- [ ] **Step 2: Run the test and see it FAIL (the modules do not exist yet). Run from `/home/soron/projects/codegram/backend` with the venv active.**

```bash
cd /home/soron/projects/codegram/backend && . .venv/bin/activate && pytest tests/test_session.py
```
Expected failure: collection error `ModuleNotFoundError: No module named 'app.db.base'`.

- [ ] **Step 3: Write the declarative base.**

`/home/soron/projects/codegram/backend/app/db/base.py`
```python
"""SQLAlchemy 2.0 declarative base."""
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Shared declarative base for all ORM models."""
```

- [ ] **Step 4: Write the async engine, session maker, and `get_session` dependency.**

`/home/soron/projects/codegram/backend/app/db/session.py`
```python
"""Async SQLAlchemy engine, session maker, and FastAPI session dependency."""
from collections.abc import AsyncGenerator

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
    """FastAPI dependency: yield an AsyncSession per request."""
    async with async_session_maker() as session:
        yield session
```

- [ ] **Step 5: Run the test and see it PASS. Run from `/home/soron/projects/codegram/backend` with the venv active.**

```bash
cd /home/soron/projects/codegram/backend && . .venv/bin/activate && pytest tests/test_session.py
```
Expected output: `3 passed`.

- [ ] **Step 6: Commit.**

```bash
cd /home/soron/projects/codegram && git add backend/app/db/base.py backend/app/db/session.py backend/tests/test_session.py && git commit -m "feat(backend): add async SQLAlchemy base, engine, and session dependency"
```

---

### Task 5: FastAPI app factory and API router wiring

**Files:**
- Create: `/home/soron/projects/codegram/backend/app/api/router.py`
- Create: `/home/soron/projects/codegram/backend/app/main.py`
- Create: `/home/soron/projects/codegram/backend/tests/conftest.py`
- Test: `/home/soron/projects/codegram/backend/tests/test_app.py`

- [ ] **Step 1: Write the shared test fixtures. These provide an in-memory async test DB, override `get_session`, and yield an httpx `AsyncClient` bound to the ASGI app. They will be reused by Task 6.**

`/home/soron/projects/codegram/backend/tests/conftest.py`
```python
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
```

- [ ] **Step 2: Write the failing test. It asserts the ASGI app exists, is titled, and serves docs under `/api`.**

`/home/soron/projects/codegram/backend/tests/test_app.py`
```python
"""Tests for the FastAPI app factory and router mounting."""
from fastapi import FastAPI

from app.main import app


def test_app_is_fastapi_instance():
    assert isinstance(app, FastAPI)
    assert app.title == "Codegram API"


def test_api_router_mounted_under_api_prefix():
    # The OpenAPI schema must expose the docs entry under /api.
    assert app.docs_url == "/api/docs"
    assert app.openapi_url == "/api/openapi.json"
```

- [ ] **Step 3: Run the test and see it FAIL (`app.main` does not exist). Run from `/home/soron/projects/codegram/backend` with the venv active.**

```bash
cd /home/soron/projects/codegram/backend && . .venv/bin/activate && pytest tests/test_app.py
```
Expected failure: collection error `ModuleNotFoundError: No module named 'app.main'`.

- [ ] **Step 4: Write the aggregate API router. It is empty of routes for now; Task 6 includes the health router into it.**

`/home/soron/projects/codegram/backend/app/api/router.py`
```python
"""Aggregate API router mounted under /api."""
from fastapi import APIRouter

api_router = APIRouter()
```

- [ ] **Step 5: Write the FastAPI app factory. Docs are served under `/api` and the aggregate router is mounted with the `/api` prefix; CORS is configured from settings.**

`/home/soron/projects/codegram/backend/app/main.py`
```python
"""FastAPI application factory."""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import settings


def create_app() -> FastAPI:
    """Build and configure the FastAPI application."""
    application = FastAPI(
        title="Codegram API",
        version="0.1.0",
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
    )

    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    application.include_router(api_router, prefix="/api")
    return application


app = create_app()
```

- [ ] **Step 6: Run the test and see it PASS. Run from `/home/soron/projects/codegram/backend` with the venv active.**

```bash
cd /home/soron/projects/codegram/backend && . .venv/bin/activate && pytest tests/test_app.py
```
Expected output: `2 passed`.

- [ ] **Step 7: Commit.**

```bash
cd /home/soron/projects/codegram && git add backend/app/api/router.py backend/app/main.py backend/tests/conftest.py backend/tests/test_app.py && git commit -m "feat(backend): add FastAPI app factory and api router wiring"
```

---

### Task 6: GET /api/health endpoint with DB connectivity check

**Files:**
- Create: `/home/soron/projects/codegram/backend/app/schemas/health.py`
- Create: `/home/soron/projects/codegram/backend/app/api/routes/health.py`
- Modify: `/home/soron/projects/codegram/backend/app/api/router.py`
- Test: `/home/soron/projects/codegram/backend/tests/test_health.py`

- [ ] **Step 1: Write the failing test using the `client` fixture from `conftest.py`. It asserts `GET /api/health` returns 200 and `{"status": "ok"}` (the endpoint runs `SELECT 1` against the overridden test session).**

`/home/soron/projects/codegram/backend/tests/test_health.py`
```python
"""Tests for the /api/health endpoint."""


# No @pytest.mark.anyio: the suite standardizes on pytest-asyncio auto mode
# (configured in pyproject.toml), which runs this async test and the async
# fixtures (client/test_session) on the same event loop.
async def test_health_returns_ok(client):
    response = await client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
```

- [ ] **Step 2: Run the test and see it FAIL (route not yet defined -> 404). Run from `/home/soron/projects/codegram/backend` with the venv active.**

```bash
cd /home/soron/projects/codegram/backend && . .venv/bin/activate && pytest tests/test_health.py
```
Expected failure: `AssertionError: assert 404 == 200` (the `/api/health` route does not exist yet).

- [ ] **Step 3: Write the response schema.**

`/home/soron/projects/codegram/backend/app/schemas/health.py`
```python
"""Health-check response schema."""
from pydantic import BaseModel


class HealthResponse(BaseModel):
    """Response body for the health endpoint."""

    status: str
```

- [ ] **Step 4: Write the health route. It depends on `get_session`, executes `SELECT 1` to confirm DB connectivity, and returns `{"status": "ok"}`.**

`/home/soron/projects/codegram/backend/app/api/routes/health.py`
```python
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
```

- [ ] **Step 5: Wire the health router into the aggregate API router.**

`/home/soron/projects/codegram/backend/app/api/router.py`
```python
"""Aggregate API router mounted under /api."""
from fastapi import APIRouter

from app.api.routes import health

api_router = APIRouter()
api_router.include_router(health.router)
```

- [ ] **Step 6: Run the test and see it PASS. Run from `/home/soron/projects/codegram/backend` with the venv active.**

```bash
cd /home/soron/projects/codegram/backend && . .venv/bin/activate && pytest tests/test_health.py
```
Expected output: `tests/test_health.py::test_health_returns_ok PASSED` and `1 passed`.

- [ ] **Step 7: Run the full backend suite to confirm nothing regressed. Run from `/home/soron/projects/codegram/backend` with the venv active.**

```bash
cd /home/soron/projects/codegram/backend && . .venv/bin/activate && pytest
```
Expected output: `10 passed` (smoke 1 + config 3 + session 3 + app 2 + health 1).

- [ ] **Step 8: Commit.**

```bash
cd /home/soron/projects/codegram && git add backend/app/schemas/health.py backend/app/api/routes/health.py backend/app/api/router.py backend/tests/test_health.py && git commit -m "feat(backend): add GET /api/health endpoint with DB connectivity check"
```

---

### Task 7: Alembic async initialization wired to the engine

**Files:**
- Create: `/home/soron/projects/codegram/backend/alembic.ini`
- Create: `/home/soron/projects/codegram/backend/alembic/env.py`
- Create: `/home/soron/projects/codegram/backend/alembic/script.py.mako`
- Create: `/home/soron/projects/codegram/backend/alembic/versions/.gitkeep`

- [ ] **Step 1: Write `alembic.ini`. The `sqlalchemy.url` is intentionally left blank because `env.py` injects it from `settings.database_url` at runtime.**

`/home/soron/projects/codegram/backend/alembic.ini`
```ini
[alembic]
script_location = alembic
prepend_sys_path = .
version_path_separator = os
sqlalchemy.url =

[loggers]
keys = root,sqlalchemy,alembic

[handlers]
keys = console

[formatters]
keys = generic

[logger_root]
level = WARNING
handlers = console
qualname =

[logger_sqlalchemy]
level = WARNING
handlers =
qualname = sqlalchemy.engine

[logger_alembic]
level = INFO
handlers =
qualname = alembic

[handler_console]
class = StreamHandler
args = (sys.stderr,)
level = NOTSET
formatter = generic

[formatter_generic]
format = %(levelname)-5.5s [%(name)s] %(message)s
datefmt = %H:%M:%S
```

- [ ] **Step 2: Write the async `env.py`. It pulls the URL from `settings`, imports `Base.metadata` as the autogenerate target, and runs migrations through an async engine via `run_sync`.**

`/home/soron/projects/codegram/backend/alembic/env.py`
```python
"""Alembic environment: async engine wired to app settings and Base.metadata."""
import asyncio
from logging.config import fileConfig

from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from alembic import context

from app.core.config import settings
from app.db.base import Base

# Import models so their tables register on Base.metadata for autogenerate.
# (No domain models exist yet in Plan 0; this import is the future hook.)
import app.models  # noqa: F401

config = context.config
config.set_main_option("sqlalchemy.url", settings.database_url)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Run migrations without a DBAPI connection (emit SQL)."""
    context.configure(
        url=settings.database_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    """Configure context on a live connection and run migrations."""
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """Create an async engine and run migrations through run_sync."""
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    """Entry point for online migrations."""
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
```

- [ ] **Step 3: Write the migration script template used by `alembic revision`.**

`/home/soron/projects/codegram/backend/alembic/script.py.mako`
```mako
"""${message}

Revision ID: ${up_revision}
Revises: ${down_revision | comma,n}
Create Date: ${create_date}

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
${imports if imports else ""}

# revision identifiers, used by Alembic.
revision: str = ${repr(up_revision)}
down_revision: Union[str, None] = ${repr(down_revision)}
branch_labels: Union[str, Sequence[str], None] = ${repr(branch_labels)}
depends_on: Union[str, Sequence[str], None] = ${repr(depends_on)}


def upgrade() -> None:
    ${upgrades if upgrades else "pass"}


def downgrade() -> None:
    ${downgrades if downgrades else "pass"}
```

- [ ] **Step 4: Create the empty versions directory marker.**

`/home/soron/projects/codegram/backend/alembic/versions/.gitkeep`
```text
```

- [ ] **Step 5: Verify Alembic is wired correctly by running `upgrade head` against a throwaway SQLite database. With zero migrations present this is a no-op that must still connect, configure, and exit cleanly — proving `env.py` loads settings, builds the async engine, and runs. Run from `/home/soron/projects/codegram/backend` with the venv active.**

```bash
cd /home/soron/projects/codegram/backend && . .venv/bin/activate && DATABASE_URL="sqlite+aiosqlite:///./alembic_check.db" alembic upgrade head; echo "EXIT=$?"; rm -f alembic_check.db
```
Expected output: Alembic logs `Context impl SQLiteImpl.` and `Will assume non-transactional DDL.`, no traceback, and `EXIT=0`. (No revisions are applied because the `versions/` directory is empty — the success criterion is a clean connect-and-exit, confirming the async `env.py` is correctly wired.)

- [ ] **Step 6: Verify autogenerate sees `Base.metadata` and produces an empty migration (no domain tables yet), then delete it. This confirms `target_metadata` is wired. Run from `/home/soron/projects/codegram/backend` with the venv active.**

```bash
cd /home/soron/projects/codegram/backend && . .venv/bin/activate && DATABASE_URL="sqlite+aiosqlite:///./alembic_check.db" alembic revision --autogenerate -m "verify wiring" && grep -c "op.create_table" alembic/versions/*verify_wiring*.py; echo "EXIT=$?"; rm -f alembic/versions/*verify_wiring*.py alembic_check.db
```
Expected output: Alembic logs `Generating ... verify_wiring.py`; the grep prints `0` (no `op.create_table` calls, since no models exist); `EXIT=0`. The generated file is then removed so the repo ships with zero domain migrations.

- [ ] **Step 7: Commit.**

```bash
cd /home/soron/projects/codegram && git add backend/alembic.ini backend/alembic/env.py backend/alembic/script.py.mako backend/alembic/versions/.gitkeep && git commit -m "feat(backend): add async Alembic initialization wired to the engine"
```

---

### Task 8: Frontend npm manifest + Vite/React 19/TS scaffold (config + entry)

**Files:**
- Create: `/home/soron/projects/codegram/frontend/package.json`
- Create: `/home/soron/projects/codegram/frontend/index.html`
- Create: `/home/soron/projects/codegram/frontend/vite.config.ts`
- Create: `/home/soron/projects/codegram/frontend/tsconfig.json`
- Create: `/home/soron/projects/codegram/frontend/tsconfig.app.json`
- Create: `/home/soron/projects/codegram/frontend/tsconfig.node.json`
- Create: `/home/soron/projects/codegram/frontend/src/vite-env.d.ts`
- Create: `/home/soron/projects/codegram/frontend/src/main.tsx`

- [ ] **Step 1: Create `frontend/package.json` with pinned June-2026 versions and scripts.**

`/home/soron/projects/codegram/frontend/package.json`
```json
{
  "name": "codegram-frontend",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest",
    "test:run": "vitest --run",
    "type-check": "tsc --noEmit",
    "e2e": "playwright test"
  },
  "dependencies": {
    "react": "19.2.7",
    "react-dom": "19.2.7",
    "react-router": "7.17.0",
    "@tanstack/react-query": "5.101.0",
    "zustand": "5.0.14"
  },
  "devDependencies": {
    "@playwright/test": "1.60.0",
    "@testing-library/jest-dom": "6.9.1",
    "@testing-library/react": "16.3.2",
    "@types/node": "22.10.2",
    "@types/react": "19.2.0",
    "@types/react-dom": "19.2.0",
    "@vitejs/plugin-react": "6.0.2",
    "jsdom": "29.1.1",
    "typescript": "6.0.3",
    "vite": "8.0.16",
    "vitest": "4.1.8"
  }
}
```

- [ ] **Step 2: Create `frontend/index.html` (Vite HTML entry that mounts `#root`).**

`/home/soron/projects/codegram/frontend/index.html`
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Codegram</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 3: Create `frontend/vite.config.ts` (React plugin, `@` alias to `src`, `/api` dev proxy to backend).**

`/home/soron/projects/codegram/frontend/vite.config.ts`
```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_PROXY_TARGET ?? 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
```

- [ ] **Step 4: Create `frontend/tsconfig.json` (project-references root).**

`/home/soron/projects/codegram/frontend/tsconfig.json`
```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ]
}
```

- [ ] **Step 5: Create `frontend/tsconfig.app.json` (app code config with `@` path + jsx transform).**

`/home/soron/projects/codegram/frontend/tsconfig.app.json`
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "moduleResolution": "bundler",
    "noEmit": true,
    "jsx": "react-jsx",
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    },
    "types": ["vite/client", "vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src"]
}
```

- [ ] **Step 6: Create `frontend/tsconfig.node.json` (config-files build context).**

`/home/soron/projects/codegram/frontend/tsconfig.node.json`
```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": true,
    "strict": true,
    "types": ["node"]
  },
  "include": ["vite.config.ts", "vitest.config.ts", "playwright.config.ts"]
}
```

- [ ] **Step 7: Create `frontend/src/vite-env.d.ts` (Vite client types).**

`/home/soron/projects/codegram/frontend/src/vite-env.d.ts`
```typescript
/// <reference types="vite/client" />
```

- [ ] **Step 8: Create `frontend/src/main.tsx` (React 19 entry mounting `<App />`).**

`/home/soron/projects/codegram/frontend/src/main.tsx`
```typescript
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '@/app'

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Root element #root not found')
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

- [ ] **Step 9: Install dependencies. Run from `/home/soron/projects/codegram/frontend`.**

```bash
cd /home/soron/projects/codegram/frontend && npm install
```
Expected output: `npm install` completes, creating `frontend/node_modules/` and `frontend/package-lock.json` with no resolution errors.

- [ ] **Step 10: Verify TypeScript can locate the config (expected: errors about missing `@/app` import only — this is EXPECTED, it is created in Task 12). Run from `/home/soron/projects/codegram/frontend`.**

```bash
cd /home/soron/projects/codegram/frontend && npx tsc -b --noEmit || echo "EXPECTED: unresolved @/app until Task 12"
```
Expected output: a `Cannot find module '@/app'` error from `src/main.tsx`. This is expected; later tasks resolve it.

- [ ] **Step 11: Commit the scaffold.**

```bash
cd /home/soron/projects/codegram && git add frontend/package.json frontend/package-lock.json frontend/index.html frontend/vite.config.ts frontend/tsconfig.json frontend/tsconfig.app.json frontend/tsconfig.node.json frontend/src/vite-env.d.ts frontend/src/main.tsx && git commit -m "chore(frontend): scaffold Vite + React 19 + TypeScript with @ alias"
```

---

### Task 9: shadcn init via preset + align components to `src/shared/ui`

**Files:**
- Create: `/home/soron/projects/codegram/frontend/components.json`
- Create: `/home/soron/projects/codegram/frontend/src/shared/ui/.gitkeep`
- Create: `/home/soron/projects/codegram/frontend/src/shared/lib/utils.ts`
- Modify: `/home/soron/projects/codegram/frontend/package.json` (shadcn may add deps; commit lockfile changes)

Note: The preset code `b1FlFygMM` is opaque — pass it verbatim, do NOT decode or substitute. shadcn's CLI generates `components.json`, `src/lib/utils.ts`, Tailwind/CSS files, and lands UI components per the `aliases.ui` path. To honor FSD we point that alias at `src/shared/ui`.

- [ ] **Step 1: Create the destination directory placeholder so the FSD slot exists before generation.** Run from `/home/soron/projects/codegram`.

```bash
mkdir -p /home/soron/projects/codegram/frontend/src/shared/ui && touch /home/soron/projects/codegram/frontend/src/shared/ui/.gitkeep
```
Expected result: the command exits 0 and `frontend/src/shared/ui/.gitkeep` now exists (verify with `ls -l /home/soron/projects/codegram/frontend/src/shared/ui/.gitkeep`).

- [ ] **Step 2: Run the shadcn initializer with the preset (verbatim).** This generates `components.json`, `src/lib/utils.ts`, Tailwind config, and `src/index.css`. Run from `/home/soron/projects/codegram/frontend`.

```bash
cd /home/soron/projects/codegram/frontend && npx shadcn@latest init --preset b1FlFygMM
```
Expected output: shadcn reports it created `components.json` and base files; it installs `tailwindcss`, `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react` (recorded in `package.json`).

- [ ] **Step 3: Open `frontend/components.json` and set the UI alias to the FSD path so future `npx shadcn@latest add <comp>` components land in `src/shared/ui`. Ensure the `aliases` block reads exactly as below (keep any preset-provided `style`, `tailwind`, `iconLibrary` keys generated above; only the `aliases` values are normative here).**

`/home/soron/projects/codegram/frontend/components.json`
```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "new-york",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/index.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/shared/ui",
    "utils": "@/shared/lib/utils",
    "ui": "@/shared/ui",
    "lib": "@/shared/lib",
    "hooks": "@/shared/hooks"
  },
  "iconLibrary": "lucide-react"
}
```

- [ ] **Step 4: Move the generated utils file into the FSD `shared/lib` location referenced by the alias above (shadcn defaults to `src/lib/utils.ts`). Run from `/home/soron/projects/codegram`.**

```bash
mkdir -p /home/soron/projects/codegram/frontend/src/shared/lib && [ -f /home/soron/projects/codegram/frontend/src/lib/utils.ts ] && git -C /home/soron/projects/codegram mv frontend/src/lib/utils.ts frontend/src/shared/lib/utils.ts 2>/dev/null || mv /home/soron/projects/codegram/frontend/src/lib/utils.ts /home/soron/projects/codegram/frontend/src/shared/lib/utils.ts; rmdir /home/soron/projects/codegram/frontend/src/lib 2>/dev/null || true
```
Expected result: `frontend/src/shared/lib/utils.ts` exists; `frontend/src/lib/` is gone.

- [ ] **Step 5: Verify the alias path is valid by adding one component, confirming it lands in `src/shared/ui`. Run from `/home/soron/projects/codegram/frontend`.**

```bash
cd /home/soron/projects/codegram/frontend && npx shadcn@latest add button
```
Expected output: a `button.tsx` file is created under `frontend/src/shared/ui/` (proving the alias points at the FSD location).

- [ ] **Step 6: Commit the shadcn setup.**

```bash
cd /home/soron/projects/codegram && git add frontend/components.json frontend/src/shared/ui frontend/src/shared/lib frontend/src/index.css frontend/package.json frontend/package-lock.json && git commit -m "chore(frontend): init shadcn via preset b1FlFygMM, alias UI to src/shared/ui"
```

---

### Task 10: FSD layer skeleton (.gitkeep + shared api/env)

**Files:**
- Create: `/home/soron/projects/codegram/frontend/src/widgets/.gitkeep`
- Create: `/home/soron/projects/codegram/frontend/src/features/.gitkeep`
- Create: `/home/soron/projects/codegram/frontend/src/entities/.gitkeep`
- Create: `/home/soron/projects/codegram/frontend/src/shared/api/client.ts`
- Create: `/home/soron/projects/codegram/frontend/src/shared/config/env.ts`

FSD import rule (enforced by convention; ESLint enforcement is a later plan): a layer may import only from layers strictly below it — `app > pages > widgets > features > entities > shared`. `shared` imports nothing upward; same-layer cross-imports are disallowed.

- [ ] **Step 1: Create the FSD layer placeholder directories.** Run from `/home/soron/projects/codegram`.

```bash
mkdir -p /home/soron/projects/codegram/frontend/src/widgets /home/soron/projects/codegram/frontend/src/features /home/soron/projects/codegram/frontend/src/entities /home/soron/projects/codegram/frontend/src/shared/api /home/soron/projects/codegram/frontend/src/shared/config
touch /home/soron/projects/codegram/frontend/src/widgets/.gitkeep /home/soron/projects/codegram/frontend/src/features/.gitkeep /home/soron/projects/codegram/frontend/src/entities/.gitkeep
```
Expected result: the command exits 0; `frontend/src/widgets/.gitkeep`, `frontend/src/features/.gitkeep`, and `frontend/src/entities/.gitkeep` exist (verify with `ls -l /home/soron/projects/codegram/frontend/src/widgets/.gitkeep /home/soron/projects/codegram/frontend/src/features/.gitkeep /home/soron/projects/codegram/frontend/src/entities/.gitkeep`).

- [ ] **Step 2: Create `frontend/src/shared/config/env.ts` (typed accessor for `VITE_API_URL`).**

`/home/soron/projects/codegram/frontend/src/shared/config/env.ts`
```typescript
/**
 * Typed access to Vite environment variables.
 * shared layer: imports nothing upward (FSD rule).
 */
export const env = {
  apiUrl: import.meta.env.VITE_API_URL ?? '/api',
} as const
```

- [ ] **Step 3: Create `frontend/src/shared/api/client.ts` (fetch wrapper reading `env.apiUrl`).**

`/home/soron/projects/codegram/frontend/src/shared/api/client.ts`
```typescript
import { env } from '@/shared/config/env'

/**
 * Minimal JSON fetch wrapper for the backend API.
 * shared layer: depends only on shared/config (FSD rule).
 */
export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const base = env.apiUrl.replace(/\/$/, '')
  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`

  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} ${response.statusText}`)
  }

  return (await response.json()) as T
}
```

- [ ] **Step 4: Verify the new shared files type-check in isolation (expected: no errors from these files; the only outstanding error is the unresolved `@/app` from Task 8). Run from `/home/soron/projects/codegram/frontend`.**

```bash
cd /home/soron/projects/codegram/frontend && npx tsc -b --noEmit || echo "EXPECTED: only @/app unresolved until Task 12"
```
Expected output: no errors originating in `src/shared/**`; any error is the known `@/app` import in `src/main.tsx`.

- [ ] **Step 5: Commit the FSD skeleton.**

```bash
cd /home/soron/projects/codegram && git add frontend/src/widgets/.gitkeep frontend/src/features/.gitkeep frontend/src/entities/.gitkeep frontend/src/shared/api/client.ts frontend/src/shared/config/env.ts && git commit -m "chore(frontend): add FSD layer skeleton + shared api client/env config"
```

---

### Task 11: TanStack Query provider + Zustand example store

**Files:**
- Create: `/home/soron/projects/codegram/frontend/src/app/providers/query.tsx`
- Create: `/home/soron/projects/codegram/frontend/src/shared/store/ui.ts`

- [ ] **Step 1: Create `frontend/src/shared/store/ui.ts` (example Zustand client-state store).**

`/home/soron/projects/codegram/frontend/src/shared/store/ui.ts`
```typescript
import { create } from 'zustand'

/**
 * Example UI client-state store (Zustand v5).
 * shared layer: imports nothing upward (FSD rule).
 */
interface UiState {
  sidebarOpen: boolean
  toggleSidebar: () => void
  setSidebarOpen: (open: boolean) => void
}

export const useUiStore = create<UiState>((set) => ({
  sidebarOpen: true,
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
}))
```

- [ ] **Step 2: Create `frontend/src/app/providers/query.tsx` (TanStack Query v5 provider; note `gcTime`, not `cacheTime`).**

`/home/soron/projects/codegram/frontend/src/app/providers/query.tsx`
```typescript
import { type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 10,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

export function QueryProvider({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
}
```

- [ ] **Step 3: Verify both files type-check (expected: still only the known `@/app` error). Run from `/home/soron/projects/codegram/frontend`.**

```bash
cd /home/soron/projects/codegram/frontend && npx tsc -b --noEmit || echo "EXPECTED: only @/app unresolved until Task 12"
```
Expected output: no errors in `src/app/providers/query.tsx` or `src/shared/store/ui.ts`.

- [ ] **Step 4: Commit the provider + store.**

```bash
cd /home/soron/projects/codegram && git add frontend/src/app/providers/query.tsx frontend/src/shared/store/ui.ts && git commit -m "feat(frontend): add TanStack Query provider and example Zustand UI store"
```

---

### Task 12: React Router with Home page + App composition

**Files:**
- Create: `/home/soron/projects/codegram/frontend/src/pages/home/index.tsx`
- Create: `/home/soron/projects/codegram/frontend/src/app/providers/router.tsx`
- Create: `/home/soron/projects/codegram/frontend/src/app/index.tsx`

- [ ] **Step 1: Create `frontend/src/pages/home/index.tsx` (Home page with a recognizable heading for unit + e2e assertions).**

`/home/soron/projects/codegram/frontend/src/pages/home/index.tsx`
```typescript
export function HomePage() {
  return (
    <main>
      <h1>Codegram</h1>
      <p>Render, edit, and export ERDs from DBML text.</p>
    </main>
  )
}
```

- [ ] **Step 2: Create `frontend/src/app/providers/router.tsx` (React Router v7 `createBrowserRouter` config -> Home).**

`/home/soron/projects/codegram/frontend/src/app/providers/router.tsx`
```typescript
import { createBrowserRouter, RouterProvider } from 'react-router'
import { HomePage } from '@/pages/home'

const router = createBrowserRouter([
  {
    path: '/',
    element: <HomePage />,
  },
])

export function AppRouter() {
  return <RouterProvider router={router} />
}
```

- [ ] **Step 3: Create `frontend/src/app/index.tsx` (App: composes Query provider around the router). This resolves the `@/app` import from `src/main.tsx`.**

`/home/soron/projects/codegram/frontend/src/app/index.tsx`
```typescript
import { QueryProvider } from '@/app/providers/query'
import { AppRouter } from '@/app/providers/router'

export function App() {
  return (
    <QueryProvider>
      <AppRouter />
    </QueryProvider>
  )
}
```

- [ ] **Step 4: Verify the whole app now type-checks cleanly (the previously-expected `@/app` error is gone). Run from `/home/soron/projects/codegram/frontend`.**

```bash
cd /home/soron/projects/codegram/frontend && npx tsc -b --noEmit
```
Expected output: no errors; the command exits 0.

- [ ] **Step 5: Verify the dev server builds the app (production build as a smoke check). Run from `/home/soron/projects/codegram/frontend`.**

```bash
cd /home/soron/projects/codegram/frontend && npm run build
```
Expected output: `tsc -b` passes and Vite reports `built in <time>` with output in `frontend/dist/`.

- [ ] **Step 6: Commit the router + Home page + App.**

```bash
cd /home/soron/projects/codegram && git add frontend/src/pages/home/index.tsx frontend/src/app/providers/router.tsx frontend/src/app/index.tsx && git commit -m "feat(frontend): add React Router v7 with Home page and App composition"
```

---

### Task 13: Vitest config + setup + Home characterization unit test (deliberate-wrong-assertion red phase)

**Files:**
- Create: `/home/soron/projects/codegram/frontend/vitest.config.ts`
- Create: `/home/soron/projects/codegram/frontend/src/test/setup.ts`
- Test: `/home/soron/projects/codegram/frontend/src/pages/home/index.test.tsx`

> TDD note: `HomePage` was implemented in Task 12 (it is needed there to make `@/app` type-check and `npm run build` pass). These are therefore characterization/smoke tests for pre-existing UI, not a genuine red->green-on-new-implementation cycle. The deliberately-wrong assertion (`"Welcome to Codegram"`) in Step 3 is an explicit stand-in red phase: it verifies the test harness actually exercises the component and can fail, before we correct the assertion to the real heading. The real implementation does not transition red->green here because it already exists.

- [ ] **Step 1: Create `frontend/vitest.config.ts` (jsdom env, globals, setup file, `@` alias).**

`/home/soron/projects/codegram/frontend/vitest.config.ts`
```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

- [ ] **Step 2: Create `frontend/src/test/setup.ts` (jest-dom matchers + cleanup after each test).**

`/home/soron/projects/codegram/frontend/src/test/setup.ts`
```typescript
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import '@testing-library/jest-dom'

afterEach(() => {
  cleanup()
})
```

- [ ] **Step 3: Write the failing Home smoke test. Assert a heading string that does NOT yet match to force a first failure: assert `"Welcome to Codegram"` (deliberately wrong), then correct it after observing the failure.**

`/home/soron/projects/codegram/frontend/src/pages/home/index.test.tsx`
```typescript
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HomePage } from './index'

describe('HomePage', () => {
  it('renders the app heading', () => {
    render(<HomePage />)
    expect(
      screen.getByRole('heading', { name: 'Welcome to Codegram' }),
    ).toBeInTheDocument()
  })
})
```

- [ ] **Step 4: Run the test and SEE IT FAIL (the heading is `Codegram`, not `Welcome to Codegram`). Run from `/home/soron/projects/codegram/frontend`.**

```bash
cd /home/soron/projects/codegram/frontend && npm run test:run
```
Expected output: 1 failed test — `Unable to find an accessible element with the role "heading" and name "Welcome to Codegram"` (the rendered heading is `Codegram`).

- [ ] **Step 5: Correct the assertion to match the real heading.**

`/home/soron/projects/codegram/frontend/src/pages/home/index.test.tsx`
```typescript
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HomePage } from './index'

describe('HomePage', () => {
  it('renders the app heading', () => {
    render(<HomePage />)
    expect(
      screen.getByRole('heading', { name: 'Codegram' }),
    ).toBeInTheDocument()
  })
})
```

- [ ] **Step 6: Run the test and SEE IT PASS. Run from `/home/soron/projects/codegram/frontend`.**

```bash
cd /home/soron/projects/codegram/frontend && npm run test:run
```
Expected output: `1 passed (1)` — `Test Files 1 passed`, exit code 0.

- [ ] **Step 7: Commit the Vitest setup + passing smoke test.**

```bash
cd /home/soron/projects/codegram && git add frontend/vitest.config.ts frontend/src/test/setup.ts frontend/src/pages/home/index.test.tsx && git commit -m "test(frontend): add Vitest config, setup, and Home smoke unit test"
```

---

### Task 14: Playwright config + smoke E2E (webServer = vite dev)

**Files:**
- Create: `/home/soron/projects/codegram/frontend/playwright.config.ts`
- Test: `/home/soron/projects/codegram/frontend/e2e/home.spec.ts`

> TDD note: As in Task 13, `HomePage` already exists from Task 12, so this is a characterization/smoke E2E for pre-existing UI rather than a red->green-on-new-implementation cycle. The deliberately-wrong assertion (`"Welcome to Codegram"`) in Step 2 is an explicit stand-in red phase confirming the E2E harness actually loads the page and can fail, before correcting it to the real heading.

- [ ] **Step 1: Create `frontend/playwright.config.ts` (testDir `e2e`, `webServer` runs `npm run dev`, baseURL `http://localhost:5173`).**

`/home/soron/projects/codegram/frontend/playwright.config.ts`
```typescript
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
```

- [ ] **Step 2: Write the failing smoke E2E. To force a first failure, assert text that is NOT present yet (`"Welcome to Codegram"`), then correct it after observing the failure.**

`/home/soron/projects/codegram/frontend/e2e/home.spec.ts`
```typescript
import { test, expect } from '@playwright/test'

test('home page renders the app heading', async ({ page }) => {
  await page.goto('/')
  await expect(
    page.getByRole('heading', { name: 'Welcome to Codegram' }),
  ).toBeVisible()
})
```

- [ ] **Step 3: Install Playwright browsers (one-time), then run the E2E and SEE IT FAIL. Run from `/home/soron/projects/codegram/frontend`.**

```bash
cd /home/soron/projects/codegram/frontend && npx playwright install chromium && npx playwright test
```
Expected output: 1 failed test — Playwright times out waiting for heading `"Welcome to Codegram"` to be visible (the page renders `Codegram`).

- [ ] **Step 4: Correct the assertion to match the real heading.**

`/home/soron/projects/codegram/frontend/e2e/home.spec.ts`
```typescript
import { test, expect } from '@playwright/test'

test('home page renders the app heading', async ({ page }) => {
  await page.goto('/')
  await expect(
    page.getByRole('heading', { name: 'Codegram' }),
  ).toBeVisible()
})
```

- [ ] **Step 5: Run the E2E and SEE IT PASS. Run from `/home/soron/projects/codegram/frontend`.**

```bash
cd /home/soron/projects/codegram/frontend && npx playwright test
```
Expected output: `1 passed` — Playwright starts the Vite dev server, loads `/`, finds the visible heading, and exits 0.

- [ ] **Step 6: Commit the Playwright smoke E2E.**

```bash
cd /home/soron/projects/codegram && git add frontend/playwright.config.ts frontend/e2e/home.spec.ts && git commit -m "test(frontend): add Playwright smoke E2E for Home page"
```

---

### Task 15: Backend Dockerfile

**Files:**
- Create: `/home/soron/projects/codegram/backend/Dockerfile`

This Dockerfile builds the backend dev image. Source code is bind-mounted at runtime (not COPYed) so `uvicorn --reload` sees host edits. Because `app/` is not present at build time and the hatchling project builds a wheel from `packages = ["app"]`, we must NOT install the project itself (`pip install ".[dev]"` would fail with "Unable to determine which files to ship inside the wheel"). Instead we create a minimal stub package so hatchling has something to build, install the project for its dependencies, then remove the stub — the real `app/` arrives via the runtime bind-mount and the installed dependencies remain. We use an anonymous volume for `/app/.venv` in compose to avoid the bind-mount clobbering any local virtualenv. `postgresql-client` is included so `pg_isready`-style checks and `psql` are available inside the container if needed.

- [ ] **Step 1: Write the backend Dockerfile.**

`/home/soron/projects/codegram/backend/Dockerfile`
```dockerfile
FROM python:3.13-slim

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# System dependencies: build tools for native wheels + postgres client utilities
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies first for better layer caching.
# Only the project metadata is copied here; application source is bind-mounted at runtime.
# hatchling requires the configured package (packages = ["app"]) to exist at build time,
# so create a throwaway stub package just to satisfy the wheel build, install the project
# (which pulls in all dependencies), then delete the stub. The real `app/` is bind-mounted
# at runtime and the installed dependencies stay in site-packages.
COPY pyproject.toml ./
RUN mkdir -p app \
    && echo '"""stub package replaced by bind-mounted source at runtime."""' > app/__init__.py \
    && pip install --upgrade pip \
    && pip install ".[dev]" \
    && pip uninstall -y codegram-backend \
    && rm -rf app

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--reload", "--host", "0.0.0.0", "--port", "8000"]
```

- [ ] **Step 2: Verify the Dockerfile builds.**

```bash
docker build -t codegram-backend:dev /home/soron/projects/codegram/backend
```
Expected result: the build completes successfully, ending with a line like `Successfully tagged codegram-backend:dev` (or `naming to docker.io/library/codegram-backend:dev done` with BuildKit). The `pip install ".[dev]"` layer installs FastAPI, uvicorn, SQLAlchemy, asyncpg, alembic, pydantic, pytest, etc. without errors.

- [ ] **Step 3: Commit.**

```bash
cd /home/soron/projects/codegram && git add backend/Dockerfile && git commit -m "build(backend): add dev Dockerfile (python 3.13-slim, uvicorn --reload)"
```
Expected output: one file changed, indicating `backend/Dockerfile` was committed.

---

### Task 16: Frontend Dockerfile

**Files:**
- Create: `/home/soron/projects/codegram/frontend/Dockerfile`

This Dockerfile builds the frontend dev image. We install node modules with `npm ci` (lockfile-faithful), and source is bind-mounted at runtime. An anonymous volume for `/app/node_modules` in compose prevents the host bind-mount from hiding the container's installed modules. The dev server binds to `0.0.0.0` so the host can reach Vite + HMR.

- [ ] **Step 1: Write the frontend Dockerfile.**

`/home/soron/projects/codegram/frontend/Dockerfile`
```dockerfile
FROM node:22-alpine

WORKDIR /app

# Install dependencies first for better layer caching.
# Application source is bind-mounted at runtime; node_modules is an anonymous volume.
COPY package.json package-lock.json ./
RUN npm ci

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
```

- [ ] **Step 2: Verify the Dockerfile builds.**

```bash
docker build -t codegram-frontend:dev /home/soron/projects/codegram/frontend
```
Expected result: the build completes successfully, ending with `Successfully tagged codegram-frontend:dev` (or `naming to docker.io/library/codegram-frontend:dev done` with BuildKit). The `npm ci` layer installs all dependencies from `package-lock.json` without errors.

- [ ] **Step 3: Commit.**

```bash
cd /home/soron/projects/codegram && git add frontend/Dockerfile && git commit -m "build(frontend): add dev Dockerfile (node 22-alpine, vite dev --host 0.0.0.0)"
```
Expected output: one file changed, indicating `frontend/Dockerfile` was committed.

---

### Task 17: docker-compose.yml (postgres + backend + frontend with healthchecks)

**Files:**
- Create: `/home/soron/projects/codegram/docker-compose.yml`

This compose file wires the three services on a shared bridge network. Postgres has a `pg_isready` healthcheck; the backend uses `depends_on: condition: service_healthy` so it only starts once the DB accepts connections. The backend's `DATABASE_URL` uses the `postgresql+asyncpg://` scheme (required for the async SQLAlchemy engine — a plain `postgresql://` scheme would block the event loop). Anonymous volumes protect `/app/.venv` and `/app/node_modules` from bind-mount clobbering. The frontend dev-proxy to `/api` is configured in `vite.config.ts` (Task 8); here we provide `VITE_API_URL` for the browser client and `VITE_PROXY_TARGET` for the in-container Vite proxy. The Vite dev server runs INSIDE the frontend container, so its proxy must target the backend via compose DNS (`http://backend:8000`), not `localhost:8000` (which would resolve to the frontend container itself).

- [ ] **Step 1: Write docker-compose.yml.**

`/home/soron/projects/codegram/docker-compose.yml`
```yaml
services:
  postgres:
    image: postgres:17-alpine
    container_name: codegram-postgres
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-codegram_user}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-postgres_dev}
      POSTGRES_DB: ${POSTGRES_DB:-codegram_dev}
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-codegram_user} -d ${POSTGRES_DB:-codegram_dev}"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 15s
    networks:
      - codegram-network

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: codegram-backend
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      DATABASE_URL: postgresql+asyncpg://${POSTGRES_USER:-codegram_user}:${POSTGRES_PASSWORD:-postgres_dev}@postgres:5432/${POSTGRES_DB:-codegram_dev}
      CORS_ORIGINS: ${CORS_ORIGINS:-http://localhost:5173}
      ENVIRONMENT: development
      DEBUG: "true"
    volumes:
      - ./backend:/app
      - /app/.venv
    ports:
      - "8000:8000"
    networks:
      - codegram-network
    command: uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    container_name: codegram-frontend
    depends_on:
      - backend
    environment:
      VITE_API_URL: ${VITE_API_URL:-/api}
      VITE_PROXY_TARGET: ${VITE_PROXY_TARGET:-http://backend:8000}
    volumes:
      - ./frontend:/app
      - /app/node_modules
    ports:
      - "5173:5173"
    networks:
      - codegram-network
    command: npm run dev -- --host 0.0.0.0

volumes:
  postgres_data:
    driver: local

networks:
  codegram-network:
    driver: bridge
```

- [ ] **Step 2: Validate the compose file.**

```bash
docker compose -f /home/soron/projects/codegram/docker-compose.yml config --quiet
```
Expected result: the command exits with status 0 and prints nothing (a non-empty error message would indicate invalid YAML or schema). To double-check, you may run `docker compose -f /home/soron/projects/codegram/docker-compose.yml config` (without `--quiet`) and confirm it prints the fully-resolved config with all three services (`postgres`, `backend`, `frontend`) and the `postgres_data` volume + `codegram-network` network.

- [ ] **Step 3: Commit.**

```bash
cd /home/soron/projects/codegram && git add docker-compose.yml && git commit -m "build: add docker-compose for postgres + backend + frontend (healthcheck + depends_on)"
```
Expected output: one file changed, indicating `docker-compose.yml` was committed.

---

### Task 18: .env.example

**Files:**
- Create: `/home/soron/projects/codegram/.env.example`

This file documents every environment variable that `docker-compose.yml` reads, with safe development defaults. Developers copy it to `.env` before running compose. The `DATABASE_URL` here uses the `postgresql+asyncpg://` scheme and the `postgres` service hostname (in-compose DNS). `VITE_API_URL=/api` makes the browser hit the Vite dev-proxy, which forwards `/api` to the backend. `VITE_PROXY_TARGET=http://backend:8000` tells the in-container Vite dev server where to forward those `/api` requests via compose DNS (using `localhost:8000` here would resolve to the frontend container itself, not the backend).

- [ ] **Step 1: Write .env.example.**

`/home/soron/projects/codegram/.env.example`
```bash
# PostgreSQL
POSTGRES_USER=codegram_user
POSTGRES_PASSWORD=postgres_dev
POSTGRES_DB=codegram_dev

# Backend (async SQLAlchemy requires the postgresql+asyncpg:// scheme;
# host "postgres" is the compose service name resolved via the shared network)
DATABASE_URL=postgresql+asyncpg://codegram_user:postgres_dev@postgres:5432/codegram_dev
CORS_ORIGINS=http://localhost:5173
ENVIRONMENT=development
DEBUG=true

# Frontend (browser client). "/api" routes through the Vite dev-proxy to the backend.
VITE_API_URL=/api
# Frontend (in-container Vite dev server). Target the backend via compose DNS so the
# Vite proxy forwards "/api" to the backend service ("localhost" would mean the frontend container).
VITE_PROXY_TARGET=http://backend:8000
```

- [ ] **Step 2: Verify .env.example exists and confirm `.env` is gitignored. Run from `/home/soron/projects/codegram`.**

```bash
ls -l /home/soron/projects/codegram/.env.example && git -C /home/soron/projects/codegram check-ignore .env || echo "WARNING: .env is NOT ignored"
```
Expected result: `ls` prints the `.env.example` file line, and `git check-ignore .env` prints `.env` (confirming the root `.gitignore` from Task 1 ignores it). If you instead see `WARNING: .env is NOT ignored`, stop and add `.env` to `/home/soron/projects/codegram/.gitignore` before continuing.

- [ ] **Step 3: Commit.**

```bash
cd /home/soron/projects/codegram && git add .env.example && git commit -m "build: add .env.example with dev defaults for compose"
```
Expected output: one file changed, indicating `.env.example` was committed.

---

### Task 19: FINAL Integration Verification & Ship Criteria

**Files:**
- No new files. This task runs the full stack and all three test suites end-to-end.

This is the gate for Plan 0. We bring the whole stack up via Docker Compose, wait for health, verify the backend health endpoint reports DB connectivity, confirm the Home page renders, and run all three test suites (backend pytest, frontend Vitest, Playwright E2E). Then we tick the explicit SHIP CRITERIA checklist.

- [ ] **Step 1: Create `.env` from the example.**

```bash
cp /home/soron/projects/codegram/.env.example /home/soron/projects/codegram/.env
```
Expected result: the command prints nothing and exits 0. The (gitignored) `.env` now exists with dev defaults.

- [ ] **Step 2: Build and start the full stack in the background.**

```bash
docker compose -f /home/soron/projects/codegram/docker-compose.yml up -d --build
```
Expected result: images build, then three containers start. The final lines include `Container codegram-postgres  Started`, `Container codegram-backend  Started`, and `Container codegram-frontend  Started`. The backend only starts after postgres reports healthy (because of `depends_on: condition: service_healthy`).

- [ ] **Step 3: Wait for the backend to be reachable, then check service status.**

```bash
for i in $(seq 1 30); do curl -sf http://localhost:8000/api/health >/dev/null 2>&1 && break; sleep 2; done; docker compose -f /home/soron/projects/codegram/docker-compose.yml ps
```
Expected result: the loop exits once the backend answers, and `docker compose ps` lists `codegram-postgres` (State `Up (healthy)`), `codegram-backend` (State `Up`), and `codegram-frontend` (State `Up`).

- [ ] **Step 4: Verify the health endpoint returns `{"status":"ok"}` with DB reachable.**

```bash
curl -s http://localhost:8000/api/health
```
Expected output (exact JSON; whitespace may differ):

```json
{"status":"ok"}
```

This confirms the backend started, FastAPI is serving `/api/health`, and the endpoint's `SELECT 1` DB probe succeeded against postgres (a DB failure would return a 503 / error body instead).

- [ ] **Step 5: Verify the Home page is served and renders its visible text.**

```bash
curl -s http://localhost:5173/ | grep -qi "Codegram" && echo "HOME OK" || echo "HOME FAIL"
```
Expected output:

```
HOME OK
```

This confirms the Vite dev server is serving the app shell. (Note: Vite serves the bootstrap HTML; the heading text is rendered by React in the browser. If `grep` against the raw HTML does not match because the title is injected at runtime, fall back to opening `http://localhost:5173` in a browser and visually confirming the Home page heading renders — the authoritative automated check of rendered text is the Playwright suite in Step 9.)

- [ ] **Step 6: Verify the frontend->backend `/api` proxy path works end-to-end.** This hits the Vite dev server's proxied `/api/health` route (port 5173), which the in-container Vite proxy must forward to the backend via `VITE_PROXY_TARGET=http://backend:8000`. A connection-refused or 502 here would mean the proxy target is misconfigured.

```bash
curl -s http://localhost:5173/api/health
```
Expected output (exact JSON; whitespace may differ):

```json
{"status":"ok"}
```

This proves the full browser->Vite-proxy->backend path: the frontend container's Vite proxy forwards `/api/*` to the backend service through compose DNS, not to itself.

- [ ] **Step 7: Run the backend test suite (pytest) inside the backend container.**

```bash
docker compose -f /home/soron/projects/codegram/docker-compose.yml exec -T backend pytest
```
Expected output: pytest collects and passes the full suite, ending with a green summary line such as `10 passed in 0.XXs` (no failures, no errors).

- [ ] **Step 8: Run the frontend unit test suite (Vitest) inside the frontend container.**

```bash
docker compose -f /home/soron/projects/codegram/docker-compose.yml exec -T frontend npm run test:run
```
Expected output: Vitest runs the Home smoke test and prints a passing summary such as `Test Files  1 passed (1)` and `Tests  1 passed (1)` (no failures).

- [ ] **Step 9: Run the Playwright smoke E2E against the running frontend.** Playwright drives a real browser against the live Vite dev server and asserts the Home page's visible text renders. Run from `/home/soron/projects/codegram/frontend` (the Playwright config targets `http://localhost:5173`; since the stack is already up, `reuseExistingServer` lets it run against the live server).

```bash
cd /home/soron/projects/codegram/frontend && npx playwright test
```
Expected output: Playwright launches a browser, loads `http://localhost:5173/`, and the smoke spec passes, ending with a summary like `1 passed (Xs)` (no failures). If Playwright browsers are not yet installed on the host, run `npx playwright install --with-deps` once first, then re-run `npx playwright test`.

- [ ] **Step 10: Tear down the stack (clean exit after verification).**

```bash
docker compose -f /home/soron/projects/codegram/docker-compose.yml down
```
Expected result: all three containers stop and are removed; the `postgres_data` named volume is preserved (we did not pass `-v`). Final lines include `Container codegram-frontend  Removed`, `Container codegram-backend  Removed`, `Container codegram-postgres  Removed`, and `Network codegram_codegram-network  Removed`.

---

## Ship Criteria

All boxes below must be checked before Plan 0 is considered complete:

- [ ] `docker compose up -d --build` brings **db + backend + frontend** to a running state, with **postgres healthy** and the **backend started only after** postgres is healthy (Task 19, Steps 2-3).
- [ ] `GET http://localhost:8000/api/health` returns **`{"status":"ok"}`**, proving the backend is up and its DB connectivity probe (`SELECT 1`) succeeds against postgres (Task 19, Step 4).
- [ ] The **Home page renders** at `http://localhost:5173` with its expected visible text (Task 19, Steps 5 and 9).
- [ ] The **frontend->backend `/api` proxy works**: `GET http://localhost:5173/api/health` returns `{"status":"ok"}` via the in-container Vite proxy (Task 19, Step 6).
- [ ] **Backend pytest** passes (10 tests: smoke + config + session + app + health) (Task 19, Step 7).
- [ ] **Frontend Vitest** passes (the Home smoke test) (Task 19, Step 8).
- [ ] **Playwright smoke E2E** passes (loads the app and asserts visible text) (Task 19, Step 9).
- [ ] The repo is a **git repository** with `.gitignore` (including `.env`, `node_modules`, `.venv`, Python/Node build artifacts) and all Plan 0 work is committed (verify with `git status` showing a clean working tree and `git log --oneline` showing the Plan 0 commit history).

When every box above is checked, **Plan 0 (Foundation & Scaffolding) is shipped**: a running, testable dev environment with no functionality from later plans.
