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
