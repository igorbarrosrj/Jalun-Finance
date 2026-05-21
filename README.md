# Credor Radar

Sistema de inteligência sobre créditos em recuperação judicial no Brasil.

Varre automaticamente sites de administradores judiciais, extrai listas de
credores via Claude (Anthropic), calcula score de atratividade e exibe em
dashboard para fundos de distressed, family offices e escritórios especializados.

---

## Arquitetura

```
credor-radar/
├── apps/api/          Backend Node.js (scraper + extrator + API REST)
├── apps/web/          Dashboard Next.js 14
├── packages/shared/   Tipos TypeScript compartilhados
└── docker-compose.yml PostgreSQL 16 + Redis 7 (desenvolvimento)
```

**Stack:** Node.js 20 · TypeScript strict · Prisma · PostgreSQL 16 · Playwright ·
Claude API (Anthropic) · BullMQ · Redis · Next.js 14 · Tailwind · shadcn/ui

---

## Rodando localmente

### Pré-requisitos

- Node.js >= 20
- npm >= 10
- Docker + Docker Compose

### 1. Clonar e instalar dependências

```bash
git clone https://github.com/seu-usuario/credor-radar.git
cd credor-radar
npm install
```

### 2. Configurar variáveis de ambiente

```bash
cp .env.example .env
# Edite .env e preencha ANTHROPIC_API_KEY
```

### 3. Subir banco e Redis

```bash
npm run docker:up
# Aguarda healthchecks: postgres e redis sobem em ~10s
```

### 4. Rodar migrations e seed

```bash
npm run db:migrate   # aplica migrations Prisma
npm run db:seed      # insere AJ Ruiz no banco
```

### 5. Iniciar API e Web

```bash
# Terminais separados:
npm run dev:api    # http://localhost:3002
npm run dev:web    # http://localhost:3003
```

### 6. Testar o scraper manualmente

```bash
npm run scrape:aj-ruiz
# Scraper visita ajruiz.com.br, extrai processos e PDFs
```

### 7. Rodar todos os jobs imediatamente (desenvolvimento)

```bash
npm run dev:scheduler
# Executa: scrape → extract → score em sequência
```

---

## Comandos úteis

```bash
npm run docker:logs        # Logs do postgres e redis
npm run db:studio          # Prisma Studio (GUI do banco)
npm run docker:down        # Para os containers
```

---

## Deployment em VPS com Dokploy

Esta VPS usa **Dokploy v0.28+** como painel de deployment.
IP da VPS: `148.230.73.170`

### Domínios planejados

| Serviço | Domínio                     | Porta interna |
|---------|-----------------------------|---------------|
| Web     | credorradar.com.br          | 3000          |
| API     | api.credorradar.com.br      | 3001          |

### 1. Apontar DNS

No painel do seu registrador de domínio, crie registros A:

```
credorradar.com.br.      A  148.230.73.170
api.credorradar.com.br.  A  148.230.73.170
www.credorradar.com.br.  A  148.230.73.170
```

O Dokploy gerencia SSL (Let's Encrypt) e proxy reverso automaticamente.

### 2. Adicionar serviços gerenciados no Dokploy

Em produção, **não use** o docker-compose.yml para postgres/redis.
Use os serviços nativos do Dokploy:

1. Acesse o painel Dokploy (porta 3000 da VPS)
2. **Services > Add Service > PostgreSQL**
   - Database name: `credor_radar`
   - User: `radar`
   - Password: (gere uma senha forte)
   - Dokploy fornece a `DATABASE_URL` automaticamente
3. **Services > Add Service > Redis**
   - Dokploy fornece a `REDIS_URL` automaticamente

### 3. Criar apps no Dokploy

#### API (apps/api)

1. **Projects > New Project > Application**
2. Source: Git repository → `https://github.com/seu-usuario/credor-radar`
3. Branch: `main`
4. Build path: `/` (raiz do monorepo)
5. Dockerfile path: `apps/api/Dockerfile`
6. Domain: `api.credorradar.com.br` → porta `3001`
7. Ativar **Auto Deploy** na branch main

#### Web (apps/web)

1. **Projects > New Project > Application**
2. Source: mesmos dados do repositório
3. Dockerfile path: `apps/web/Dockerfile`
4. Domain: `credorradar.com.br` → porta `3000`
5. Ativar **Auto Deploy** na branch main

### 4. Variáveis de ambiente (produção)

Configure no painel Dokploy > App > Environment:

| Variável              | Valor                              | Origem                |
|-----------------------|------------------------------------|-----------------------|
| `DATABASE_URL`        | postgresql://...                   | Dokploy auto-fill     |
| `REDIS_URL`           | redis://...                        | Dokploy auto-fill     |
| `ANTHROPIC_API_KEY`   | sk-ant-xxx                         | Secret manual         |
| `NEXT_PUBLIC_API_URL` | https://api.credorradar.com.br     | Manual                |
| `NODE_ENV`            | production                         | Manual                |
| `PORT`                | 3001 (api) / 3000 (web)           | Manual                |
| `ALLOWED_ORIGINS`     | https://credorradar.com.br         | Manual                |
| `LOG_LEVEL`           | info                               | Manual                |
| `STORAGE_PATH`        | /app/storage                       | Manual (ver TODO)     |

### 5. Rodar migrations na primeira subida

Após o primeiro deploy da API, execute via terminal do Dokploy ou SSH:

```bash
# Via Dokploy Console (app > Terminal):
npx prisma migrate deploy

# Seed inicial (só na primeira vez):
node dist/prisma/seed.js
```

Ou adicione ao start command da API:

```
npx prisma migrate deploy && node dist/index.js
```

### 6. Deploy automático via GitHub Actions (opcional)

Veja `.github/workflows/deploy.yml` — configure os secrets no GitHub:
- `DOKPLOY_API_URL`
- `DOKPLOY_TOKEN`
- `DOKPLOY_APP_ID_API`
- `DOKPLOY_APP_ID_WEB`

A alternativa mais simples é ativar **Auto Deploy** diretamente no Dokploy.

### Storage de PDFs em produção

> **TODO (Fase 2):** O storage local (`/app/storage/pdfs`) é perdido a cada
> rebuild do container. Antes de ir para produção real, migre para um storage
> S3-compatible:
>
> - **Backblaze B2** (mais barato que AWS S3)
> - **MinIO self-hosted** na própria VPS
>
> Variáveis a adicionar: `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`

---

## Playwright em produção

O Dockerfile da API já inclui todas as dependências de sistema do Chromium
(libnss3, libatk-bridge2.0-0, libgbm1, etc.) e faz `playwright install chromium`
durante o build. Nenhuma configuração adicional é necessária.

---

## TODOs — Próximas fases

- [ ] **Multi-AJ**: adicionar scrapers para outros administradores judiciais
- [ ] **Autenticação**: NextAuth.js + planos de acesso
- [ ] **Billing**: Stripe para assinaturas
- [ ] **Storage S3**: Backblaze B2 ou MinIO para PDFs
- [ ] **Alertas**: email/Slack quando novo processo de alto score aparecer
- [ ] **API pública**: endpoints documentados com OpenAPI/Swagger
- [ ] **Score v2**: modelo ML com histórico de recuperação real
- [ ] **Monitoramento**: Sentry + métricas Prometheus

---

## Estrutura detalhada

```
apps/api/src/
├── index.ts              Entrypoint HTTP (Express + /health)
├── scrapers/
│   └── aj-ruiz.ts        Scraper Playwright do AJ Ruiz
├── extractors/
│   └── claude.ts         Extração estruturada via Claude API
├── scoring/
│   └── v1.ts             Algoritmo de score v1
├── jobs/
│   ├── queue.ts           Configuração BullMQ
│   ├── scrape.ts          Job: varrer AJ Ruiz
│   ├── extract.ts         Job: extrair PDF via Claude
│   ├── score.ts           Job: aplicar scoring
│   ├── worker.ts          Worker que processa as filas
│   └── run-all.ts         Dispara todos os jobs (desenvolvimento)
├── routes/
│   ├── processos.ts       GET /processos, GET /processos/:id
│   ├── credores.ts        GET /credores (com filtros e score)
│   └── stats.ts           GET /stats (dashboard stats)
└── lib/
    ├── db.ts              Prisma Client singleton
    ├── logger.ts          Pino logger configurado
    └── pdf.ts             Extração de texto de PDF
```
