# =====================================================================
# Credor Radar — API Dockerfile
# Multi-stage build:
#   stage builder: compila TypeScript + gera Prisma client
#   stage runner:  node:20-slim (Debian) — necessário para Playwright/glibc
#
# Playwright (Chromium) requer libs do sistema que só existem em
# imagens baseadas em Debian/glibc. Alpine usa musl e é incompatível.
# =====================================================================

# ----- Stage 1: Builder -----
FROM node:20-alpine AS builder

WORKDIR /app

# Build tools para módulos nativos (node-gyp, bcrypt, etc.)
RUN apk add --no-cache python3 make g++

# Copiar manifests de todos os workspaces primeiro (cache de layers)
COPY package.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/

# Instalar dependências do workspace api + shared
RUN npm ci --workspace=packages/shared --workspace=apps/api --ignore-scripts

# Copiar código fonte
COPY packages/shared/ ./packages/shared/
COPY apps/api/ ./apps/api/

# Gerar Prisma Client
RUN cd apps/api && npx prisma generate

# Build TypeScript da API
RUN cd apps/api && npx tsup src/index.ts src/jobs/worker.ts --format cjs --out-dir dist --clean

# ----- Stage 2: Runner -----
FROM node:20-slim AS runner

# Dependências de sistema para Playwright Chromium
# Ref: https://playwright.dev/docs/docker
RUN apt-get update && apt-get install -y --no-install-recommends     # Chromium core
    libnss3     libnspr4     libatk1.0-0     libatk-bridge2.0-0     libcups2     libdrm2     libdbus-1-3     libxkbcommon0     libxcomposite1     libxdamage1     libxfixes3     libxrandr2     libgbm1     libgtk-3-0     libasound2     # Fontes
    fonts-liberation     fonts-noto-color-emoji     # Download do browser
    wget     ca-certificates     && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Criar usuário não-root
RUN groupadd --system --gid 1001 nodejs     && useradd --system --uid 1001 --gid nodejs --shell /bin/bash apiuser

# Copiar artefatos compilados do builder
COPY --from=builder --chown=apiuser:nodejs /app/apps/api/dist ./dist
COPY --from=builder --chown=apiuser:nodejs /app/apps/api/prisma ./prisma
COPY --from=builder --chown=apiuser:nodejs /app/apps/api/node_modules ./node_modules
COPY --from=builder --chown=apiuser:nodejs /app/packages/shared/src ./packages/shared/src

# Instalar browsers do Playwright (Chromium apenas — sem Firefox/WebKit)
ENV PLAYWRIGHT_BROWSERS_PATH=/app/.playwright-browsers
RUN npx playwright install chromium     && chown -R apiuser:nodejs /app/.playwright-browsers

# Diretório de storage para PDFs
# TODO: em produção, migrar para S3-compatible (ver .env.example)
RUN mkdir -p /app/storage/pdfs && chown -R apiuser:nodejs /app/storage

USER apiuser

EXPOSE 3001

# Healthcheck: GET /health deve retornar 200 OK
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3     CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["node", "dist/index.js"]
