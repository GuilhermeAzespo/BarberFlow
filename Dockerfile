# ─────────────────────────────────────────────────────────────
# BarberFlow — Dockerfile Unificado All-in-One (Easypanel & VPS)
#
# Executa tanto o Backend (Express + Baileys + Prisma) quanto
# o Frontend (Next.js 15 Standalone) em um único container,
# simplificando o deploy no Easypanel para 1 App + 1 Postgres.
# ─────────────────────────────────────────────────────────────

FROM node:22-bookworm-slim AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates tini \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 \
    PRISMA_HIDE_UPDATE_MESSAGE=1

# ───────────────────── 1. Build do Backend ─────────────────────
FROM base AS server-builder
WORKDIR /app/server
COPY apps/server/package.json apps/server/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY apps/server/tsconfig.json ./
COPY apps/server/prisma ./prisma
COPY apps/server/src ./src
RUN npx prisma generate && npm run build

# Dependências enxutas de produção do servidor
FROM base AS server-prod-deps
WORKDIR /app/server
COPY apps/server/package.json apps/server/package-lock.json ./
COPY apps/server/prisma ./prisma
RUN npm ci --omit=dev --no-audit --no-fund \
  && npx prisma generate \
  && npm cache clean --force

# ───────────────────── 2. Build do Frontend ────────────────────
FROM base AS web-builder
WORKDIR /app/web
COPY apps/web/package.json apps/web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY apps/web ./
RUN mkdir -p public && npm run build

# ───────────────────── 3. Imagem Final (Runner) ────────────────
FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    API_INTERNAL_URL=http://127.0.0.1:4000

# Diretório do Backend
WORKDIR /app/server
COPY --from=server-prod-deps /app/server/node_modules ./node_modules
COPY --from=server-builder /app/server/dist ./dist
COPY --from=server-builder /app/server/prisma ./prisma
COPY apps/server/package.json ./

# Diretório do Frontend (Next.js Standalone)
WORKDIR /app/web
COPY --from=web-builder /app/web/public ./public
COPY --from=web-builder /app/web/.next/standalone ./
COPY --from=web-builder /app/web/.next/static ./.next/static

# Entrypoint unificado
WORKDIR /app
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

EXPOSE 3000

HEALTHCHECK --interval=20s --timeout=5s --start-period=40s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["/app/docker-entrypoint.sh"]
