#!/usr/bin/env bash
#
# Materialize the root .env for the production stack (CI deploy jobs).
# deploy/docker-compose.prod.yml reads it twice: backend `env_file: ../.env`
# and compose variable interpolation (--env-file .env).
#
# Values come from the workflow env + GitHub Actions secrets. Unlike the old
# GitLab CI (which silently fell back to dev defaults), a missing or empty
# value FAILS here — production must never boot on the public dev defaults.
#
# Usage (from repo root): deploy/scripts/write-prod-env.sh
set -euo pipefail

for v in POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB SECRET_KEY \
         POSTGRES_HOST_PORT BACKEND_HOST_PORT FRONTEND_HOST_PORT CORS_ORIGINS \
         FRONTEND_IMAGE BACKEND_IMAGE; do
  : "${!v:?$v is required (workflow env / secrets)}"
done

umask 077
cat > .env <<EOF
POSTGRES_USER=${POSTGRES_USER}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
POSTGRES_DB=${POSTGRES_DB}
POSTGRES_HOST_PORT=${POSTGRES_HOST_PORT}
DATABASE_URL=postgresql+asyncpg://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}
CORS_ORIGINS=${CORS_ORIGINS}
ENVIRONMENT=production
DEBUG=false
SECRET_KEY=${SECRET_KEY}
JWT_LIFETIME_SECONDS=${JWT_LIFETIME_SECONDS:-86400}
COOKIE_SECURE=${COOKIE_SECURE:-false}
COOKIE_SAMESITE=${COOKIE_SAMESITE:-lax}
BACKEND_HOST_PORT=${BACKEND_HOST_PORT}
FRONTEND_HOST_PORT=${FRONTEND_HOST_PORT}
API_BACKEND=backend:8000
FRONTEND_IMAGE=${FRONTEND_IMAGE}
BACKEND_IMAGE=${BACKEND_IMAGE}
EOF
echo "✓ .env written"
