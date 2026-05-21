# =====================================================================
# Credor Radar — Web Dockerfile (Next.js 14)
# Multi-stage build com Next.js standalone output
# Imagem final Alpine — leve e segura
# =====================================================================

# ----- Stage 1: Deps de produção -----
FROM node:20-alpine AS deps

RUN apk add --no-cache libc6-compat

WORKDIR /app

COPY package.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/web/package.json ./apps/web/

RUN npm ci --workspace=packages/shared --workspace=apps/web

# ----- Stage 2: Builder -----
FROM node:20-alpine AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules

COPY packages/shared/ ./packages/shared/
COPY apps/web/ ./apps/web/
COPY package.json ./

ENV NEXT_TELEMETRY_DISABLED=1

RUN cd apps/web && npm run build

# ----- Stage 3: Runner -----
FROM node:20-alpine AS runner

RUN apk add --no-cache libc6-compat

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

# Criar usuário não-root
RUN addgroup --system --gid 1001 nodejs     && adduser --system --uid 1001 --ingroup nodejs webuser

# Copiar artefatos do Next.js standalone build
COPY --from=builder --chown=webuser:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=webuser:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=webuser:nodejs /app/apps/web/public ./apps/web/public

USER webuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3     CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["node", "apps/web/server.js"]
