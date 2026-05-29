import express from "express"
import cors from "cors"
import { env } from "./config/env"
import { logger } from "./lib/logger"
import { processosRouter } from "./routes/processos"
import { credoresRouter } from "./routes/credores"
import { statsRouter } from "./routes/stats"
import { administradoresRouter } from "./routes/administradores"
import { atividadesRouter } from "./routes/atividades"
import { cadastroRouter } from "./routes/cadastro"
import { meRouter } from "./routes/me"
import { extracaoRouter } from "./routes/extracao"
import { creditosRouter } from "./routes/creditos"
import { vioesRouter } from "./routes/visoes"
import { alertasRouter } from "./routes/alertas"
import { adminRouter } from "./routes/admin"
import "./jobs/worker"

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
app.use("/api/administradores", administradoresRouter)
app.use("/api/atividades", atividadesRouter)
app.use("/api/cadastro", cadastroRouter)
app.use("/api/me", meRouter)
app.use("/api/extracao", extracaoRouter)
app.use("/api/creditos", creditosRouter)
app.use("/api/visoes", vioesRouter)
app.use("/api/alertas", alertasRouter)
app.use("/api/admin", adminRouter)

// TODO Fase auth: adicionar middleware de autenticação
// app.use(authMiddleware)

app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, "API Credor Radar iniciada")
})
