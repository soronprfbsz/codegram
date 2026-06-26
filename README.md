# Codegram

A web service that renders, edits, and exports ERDs from DBML text.

DBML text is the single source of truth. The frontend parses DBML with `@dbml/core`;
the backend never parses DBML. One Project = one DBML document = one ERD. Everything
client-side: diagram export (PNG / SVG / PDF), a table-definition document (in-app HTML
view / Excel / PDF), and SQL import/export for PostgreSQL / MySQL / MS SQL Server.
Also: connect to a live **PostgreSQL or MariaDB** and import its schema into a new project —
the backend introspects the database and emits DDL (it never parses DBML; ADR-0008), which
the frontend converts to DBML.

## Monorepo layout

- `backend/` — FastAPI (clean/layered) + async SQLAlchemy 2.0 + Alembic.
- `frontend/` — React 19 + TypeScript (Feature-Sliced Design) + Vite.
- `deploy/` — deploy assets: `docker-compose.yml` (postgres + backend + frontend
  dev stack), the optional local `docker-compose.override.yml`, and `scripts/`.

## Quickstart

```bash
cp .env.example .env
deploy/scripts/start.sh   # build + run, auto-renew dep volumes, migrate, health-check
```

`start.sh` runs `docker compose` with the files in `deploy/` while resolving build
contexts and `.env` from the repo root (`--project-directory`), then applies DB
migrations. It also detects dependency changes (package-lock / pyproject) and
renews the in-container `node_modules` / `.venv` anonymous volumes — a bare
`docker compose up --build` reuses the stale volume, so a newly-added dependency
would otherwise fail to resolve in the container.

```bash
deploy/scripts/start.sh --fresh   # force-renew node_modules/.venv (after editing deps manually)
deploy/scripts/start.sh --down    # stop the stack (keeps the DB volume)
```

It prints the URL on success (default **http://localhost:5173**). Register an
account and create a project. (Backend health: `/api/health`.)

To run compose directly instead of the script:

```bash
docker compose --project-directory . -f deploy/docker-compose.yml [-f deploy/docker-compose.override.yml] up -d --build
```

### Custom host ports

To publish on different host ports — e.g. backend `4000`, frontend `4001` — create a
local `deploy/docker-compose.override.yml` (gitignored). Only the host-published
ports change; the browser only needs the frontend port (Vite proxies `/api` to the
backend), and `start.sh` picks it up automatically:

```yaml
services:
  backend:
    ports: !override ["4000:8000"]
    environment:
      CORS_ORIGINS: http://localhost:4001
  frontend:
    ports: !override ["4001:5173"]
```

Then `deploy/scripts/start.sh` opens on **http://localhost:4001**.

## Tests

Run compose commands via the deploy file (or `cd` into the running containers):

- Backend: `docker compose --project-directory . -f deploy/docker-compose.yml exec -T backend pytest`
- Frontend unit: `docker compose --project-directory . -f deploy/docker-compose.yml exec -T frontend npm run test:run`
- E2E (full stack must be up): `cd frontend && npx playwright test`
