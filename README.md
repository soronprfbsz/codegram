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
- `docker-compose.yml` — postgres + backend + frontend dev stack.

## Quickstart

```bash
cp .env.example .env
docker compose up -d --build
docker compose exec -T backend alembic upgrade head   # create the DB schema (first run only)
```

Then open **http://localhost:5173**, register an account, and create a project.
(Backend health check: http://localhost:8000/api/health)

Stop with `docker compose down` (add `-v` to also drop the database volume).

### Custom host ports

To publish on different host ports — e.g. backend `4000`, frontend `4001` — add a
local `docker-compose.override.yml` (do not commit it). Only the host-published ports
change; the browser only needs the frontend port (Vite proxies `/api` to the backend):

```yaml
services:
  backend:
    ports: !override ["4000:8000"]
    environment:
      CORS_ORIGINS: http://localhost:4001
  frontend:
    ports: !override ["4001:5173"]
```

Then `docker compose up -d` and open **http://localhost:4001**.

## Tests

- Backend: `docker compose exec -T backend pytest`
- Frontend unit: `docker compose exec -T frontend npm run test:run`
- E2E (full stack must be up): `cd frontend && npx playwright test`
