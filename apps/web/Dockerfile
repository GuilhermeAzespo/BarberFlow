# ─────────────────────────────────────────────
# BarberFlow Web (Next.js 15 Standalone)
# ─────────────────────────────────────────────
FROM node:22-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# 1) Dependências
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# 2) Build da aplicação
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# 3) Runtime de produção minimalista
FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
# Copia o build standalone gerado pelo Next.js
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
