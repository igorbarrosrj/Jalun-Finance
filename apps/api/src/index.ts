import express from "express"
import cors from "cors"
import { env } from "./config/env"
import { logger } from "./lib/logger"
import { processosRouter } from "./routes/processos"
import { credoresRouter } from "./routes/credores"
import { statsRouter } from "./routes/stats"

const app = express()

const allowedOrigins = env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true)
      } else {
        callback(new Error(`CORS bloqueado: ${origin}`))
      }
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
)

app.use(express.json())

// Healthcheck — Dokploy e Docker HEALTHCHECK
app.get("/health", (_req, res) => {
  res.json({ status: "ok", ts: new Date().toISOString(), env: env.NODE_ENV })
})

app.use("/api/processos", processosRouter)
app.use("/api/credores", credoresRouter)
app.use("/api/stats", statsRouter)

// TODO Fase auth: adicionar middleware de autenticação
// app.use(authMiddleware)

app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, "API Credor Radar iniciada")
})
