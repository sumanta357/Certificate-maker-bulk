# AutoCert production image (multi-stage; works on Render and any Docker host).
#
# Runtime configuration is 100% via environment variables (no build args).
# The same image serves three roles (selected via the entrypoint argument):
#   web    → sync schema, then `next start` (default)
#   worker → BullMQ worker                  (only needed with QUEUE_MODE=redis)
#   push   → run `prisma db push` and exit  (e.g. a Render pre-deploy job)

# ── Stage 1: dependencies ───────────────────────────────────────────────────
FROM node:22-alpine AS deps
# openssl + libc6-compat are required by Prisma engines on Alpine.
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app
# postinstall runs `prisma generate`, which needs prisma/ and scripts/ present.
COPY package.json bun.lock* ./
COPY prisma ./prisma
COPY scripts ./scripts
RUN npm install -g bun@1 && (bun install --frozen-lockfile || bun install)

# ── Stage 2: build ──────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app ./
COPY . .
# `npm run build` = `prisma generate && next build`, using the local
# node_modules/.bin — no global bun needed in this stage (bun is only used in
# the deps stage to install from bun.lock).
RUN npm run build

# ── Stage 3: runtime ────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000
RUN addgroup -S autocert && adduser -S autocert -G autocert \
    && mkdir -p /app/storage && chown -R autocert:autocert /app
COPY --from=builder --chown=autocert:autocert /app/package.json ./package.json
COPY --from=builder --chown=autocert:autocert /app/node_modules ./node_modules
COPY --from=builder --chown=autocert:autocert /app/.next ./.next
COPY --from=builder --chown=autocert:autocert /app/prisma ./prisma
COPY --from=builder --chown=autocert:autocert /app/next.config.js ./next.config.js
COPY --from=builder --chown=autocert:autocert /app/scripts ./scripts
COPY --chown=autocert:autocert docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
USER autocert
EXPOSE 3000
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["web"]
