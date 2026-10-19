# ─────────────────────────────────────────────
# BarberFlow API — imagem multi-stage otimizada
# ─────────────────────────────────────────────
FROM node:22-bookworm-slim AS base
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates tini \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 \
    CHECKPOINT_DISABLE=1 \
    PRISMA_HIDE_UPDATE_MESSAGE=1

# 1) Dependências completas (build)
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# 2) Build TypeScript + Prisma Client
FROM deps AS build
COPY tsconfig.json ./
COPY prisma ./prisma
COPY src ./src
RUN npx prisma generate && npm run build

# 3) Dependências de produção (inclui o CLI do prisma para migrate deploy)
FROM base AS prod-deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev --no-audit --no-fund \
  && npx prisma generate \
  && npm cache clean --force

# 4) Runtime
FROM base AS runner
ENV NODE_ENV=production \
    PORT=4000
COPY --chown=node:node --from=prod-deps /app/node_modules ./node_modules
COPY --chown=node:node --from=build /app/dist ./dist
COPY --chown=node:node prisma ./prisma
COPY --chown=node:node package.json ./
USER node
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--"]
# Aplica migrations pendentes e sobe a API
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
