#!/usr/bin/env bash
#
# Build & run the Codegram dev stack (postgres + backend + frontend).
#
# Why this script (vs a bare `docker compose up -d --build`):
#   1. The compose files live in deploy/ but their build contexts (./backend,
#      ./frontend) and the root .env must resolve from the REPO ROOT — so we run
#      compose with --project-directory <root> + explicit -f, not by cd'ing here.
#   2. The frontend `node_modules` and backend `.venv` are ANONYMOUS volumes that
#      shadow the image dirs. A plain `--build` REUSES the stale volume, so a
#      newly-added dependency (e.g. a new @fontsource font) never reaches the
#      container ("Can't resolve '@fontsource/...'"). We auto-detect dependency
#      changes (package-lock.json / pyproject.toml) and renew those volumes.
#   3. Runs DB migrations (idempotent) and waits for the app to answer.
#
# Usage:
#   deploy/scripts/start.sh            # build + run (auto-renews volumes on dep change)
#   deploy/scripts/start.sh --fresh    # force-renew node_modules/.venv volumes
#   deploy/scripts/start.sh --down     # stop the stack (keeps the DB volume)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)" # deploy/scripts
DEPLOY_DIR="$(dirname "$SCRIPT_DIR")"                      # deploy
ROOT_DIR="$(dirname "$DEPLOY_DIR")"                        # repo root

# Compose invocation: files in deploy/, but project dir (paths + .env) = root.
COMPOSE=(docker compose --project-directory "$ROOT_DIR" -f "$DEPLOY_DIR/docker-compose.yml")
[[ -f "$DEPLOY_DIR/docker-compose.override.yml" ]] && COMPOSE+=(-f "$DEPLOY_DIR/docker-compose.override.yml")
[[ -f "$ROOT_DIR/.env" ]] && COMPOSE+=(--env-file "$ROOT_DIR/.env")

if [[ "${1:-}" == "--down" ]]; then
  echo "▶ stopping the stack (DB volume preserved)…"
  "${COMPOSE[@]}" down
  exit 0
fi

# Decide whether to renew the in-container dependency volumes.
RENEW=()
HASH_FILE="$DEPLOY_DIR/.deps-hash"
DEPS_HASH="$(cat "$ROOT_DIR/frontend/package-lock.json" "$ROOT_DIR/backend/pyproject.toml" 2>/dev/null | sha256sum | cut -d' ' -f1)"
if [[ "${1:-}" == "--fresh" || ! -f "$HASH_FILE" || "$(cat "$HASH_FILE" 2>/dev/null)" != "$DEPS_HASH" ]]; then
  echo "▶ dependencies changed (or first run) → renewing node_modules + .venv volumes"
  RENEW=(--force-recreate --renew-anon-volumes)
fi

echo "▶ building & starting the dev stack…"
"${COMPOSE[@]}" up -d --build ${RENEW[@]+"${RENEW[@]}"}

# Stamp the hash only after a successful up.
echo "$DEPS_HASH" >"$HASH_FILE"

echo "▶ applying database migrations…"
"${COMPOSE[@]}" exec -T backend alembic upgrade head

echo "▶ waiting for the app to respond…"
FE_PORT="$("${COMPOSE[@]}" port frontend 5173 2>/dev/null | sed 's/.*://')"
FE_PORT="${FE_PORT:-5173}"
for _ in $(seq 1 30); do
  if curl -fsS -o /dev/null "http://localhost:${FE_PORT}/"; then
    echo "✅ Codegram is up → http://localhost:${FE_PORT}"
    exit 0
  fi
  sleep 1
done
echo "⚠ stack started but the frontend did not answer on :${FE_PORT} yet."
echo "  check logs: ${COMPOSE[*]} logs -f frontend"
exit 1
