#!/bin/sh
# AutoCert container entrypoint.
#   web    → push schema, then start Next.js   (default)
#   worker → start the BullMQ worker           (QUEUE_MODE=redis)
#   push   → run `prisma db push` and exit     (e.g. a Render pre-deploy job)
set -e

ROLE="${1:-web}"

# On Render, the public URL is injected as RENDER_EXTERNAL_URL. Default APP_URL
# to it so QR codes and verification links point at the real public address.
if [ -z "${APP_URL:-}" ] && [ -n "${RENDER_EXTERNAL_URL:-}" ]; then
  export APP_URL="$RENDER_EXTERNAL_URL"
fi

# Fail fast with an actionable message instead of a raw Prisma P1012 stack.
if [ -z "${DATABASE_URL:-}" ]; then
  echo "[entrypoint] ERROR: DATABASE_URL is not set (PostgreSQL connection string required)." >&2
  echo "[entrypoint] Fix (Render):" >&2
  echo "[entrypoint]   1. Postgres instance → Connections → copy Internal Database URL" >&2
  echo "[entrypoint]   2. <your-web-service> → Environment → add DATABASE_URL → Save Changes" >&2
  echo "[entrypoint] If you deploy via the render.yaml Blueprint, DATABASE_URL is wired" >&2
  echo "[entrypoint] automatically (fromDatabase: autocert-db) — re-sync the Blueprint or" >&2
  echo "[entrypoint] create the service with New → Blueprint instead of New → Web Service." >&2
  exit 1
fi

case "$ROLE" in
  web|push)
    echo "[entrypoint] syncing database schema (prisma db push)…"
    npx prisma db push --skip-generate
    ;;
esac

case "$ROLE" in
  web)
    echo "[entrypoint] starting web server on port ${PORT:-3000}…"
    exec npx next start -H 0.0.0.0 -p "${PORT:-3000}"
    ;;
  worker)
    echo "[entrypoint] starting worker (QUEUE_MODE=${QUEUE_MODE:-redis})…"
    exec node scripts/worker.js
    ;;
  push)
    echo "[entrypoint] schema sync complete."
    ;;
  *)
    echo "[entrypoint] unknown role: $ROLE (use web | worker | push)" >&2
    exit 2
    ;;
esac
