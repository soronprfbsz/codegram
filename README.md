# ERD-DBML

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
