import express from 'express'
import cors from 'cors'
import { env } from './config/env'
import { logger } from './lib/logger'

const app = express()

// CORS — nunca '*' em producao
const allowedOrigins = env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())

app.use(
  cors({
    origin: (origin, callback) => {
      // Permite requests sem origin (ex: curl local, Dokploy healthcheck)
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true)
      } else {
        callback(new Error(`CORS bloqueado para origem: ${origin}`))
      }
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })
)

app.use(express.json())

// Healthcheck — usado pelo Dokploy e Docker HEALTHCHECK
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), env: env.NODE_ENV })
})

// TODO Fase 7: importar e montar rotas do dashboard
// app.use('/api/processos', processosRouter)
// app.use('/api/credores', credoresRouter)
// app.use('/api/stats', statsRouter)

app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, 'API Credor Radar iniciada')
})
