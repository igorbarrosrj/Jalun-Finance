import { Router } from "express"
import { z } from "zod"
import { prisma } from "../lib/db"
import { extracaoPrioritariaQueue, redisConnection } from "../jobs/queue"
import { logger } from "../lib/logger"

export const extracaoRouter = Router()

const TIPOS_RELEVANTES = ["lista_credores", "edital_art_7", "edital_art_52", "plano_rj", "quadro_geral"]

// Rate limit simples via Redis: max 5 solicitações por usuário por minuto
async function checarRateLimit(usuarioId: number): Promise<boolean> {
  const key = `rl:extracao:${usuarioId}`
  const count = await redisConnection.incr(key)
  if (count === 1) await redisConnection.expire(key, 60)
  return count <= 5
}

// ─── POST /api/extracao/solicitar ────────────────────────────────────────────

const SolicitarSchema = z.object({
  processoId: z.number().int().positive(),
  email:      z.string().email(), // TODO: substituir por JWT Bearer quando houver auth na API
})

extracaoRouter.post("/solicitar", async (req, res): Promise<void> => {
  const parsed = SolicitarSchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ erro: parsed.error.flatten().fieldErrors }); return }

  const { processoId, email } = parsed.data

  // 1. Usuário existe
  const usuario = await prisma.usuario.findUnique({
    where: { email },
    include: { credito: true },
  })
  if (!usuario) { res.status(404).json({ erro: "Usuário não encontrado" }); return }

  // 2. Rate limit
  const ok = await checarRateLimit(usuario.id)
  if (!ok) { res.status(429).json({ erro: "Muitas solicitações. Aguarde 1 minuto." }); return }

  // 3. Saldo de crédito
  const saldo = usuario.credito?.saldo ?? 0
  if (saldo < 1) {
    res.status(402).json({ erro: "Saldo insuficiente", saldoAtual: saldo })
    return
  }

  // 4. Processo existe
  const processo = await prisma.processo.findUnique({ where: { id: processoId } })
  if (!processo) { res.status(404).json({ erro: "Processo não encontrado" }); return }

  // 5. Tem documentos relevantes pendentes
  const docsRelevantes = await prisma.documento.count({
    where: { processoId, relevante: true, tipoDocumento: { in: TIPOS_RELEVANTES } },
  })
  const docsPendentes = await prisma.documento.count({
    where: { processoId, relevante: true, extraido: false, tipoDocumento: { in: TIPOS_RELEVANTES } },
  })
  if (docsRelevantes === 0) {
    res.status(422).json({ erro: "Processo sem documentos relevantes para extração" })
    return
  }

  // 6. Sem solicitação duplicada ativa
  const ativa = await prisma.solicitacaoExtracao.findFirst({
    where: { usuarioId: usuario.id, processoId, status: { in: ["aguardando", "processando"] } },
  })
  if (ativa) {
    res.status(409).json({ erro: "Já existe análise em andamento para este processo", solicitacaoId: ativa.id })
    return
  }

  // 7. Criar solicitação + debitar crédito em transação
  const { solicitacao } = await prisma.$transaction(async (tx) => {
    await tx.creditoUsuario.update({
      where: { usuarioId: usuario.id },
      data: { saldo: { decrement: 1 } },
    })
    await tx.transacaoCredito.create({
      data: {
        usuarioId: usuario.id,
        tipo: "consumo_extracao",
        quantidade: -1,
        descricao: `Análise sob demanda: ${processo.numeroProcesso}`,
        processoId,
      },
    })
    const s = await tx.solicitacaoExtracao.create({
      data: { usuarioId: usuario.id, processoId, status: "aguardando", creditosConsumidos: 1 },
    })
    return { solicitacao: s }
  })

  // 8. Enfileirar job
  const job = await extracaoPrioritariaQueue.add(
    "extracao-prioritaria",
    { solicitacaoId: solicitacao.id },
    { priority: 1 } // prioridade alta
  )

  const posicaoFila = await extracaoPrioritariaQueue.getWaitingCount()
  const tempoEstimadoMin = Math.max(3, docsPendentes * 2)
  const tempoEstimadoMax = tempoEstimadoMin + 5

  logger.info({ solicitacaoId: solicitacao.id, processoId, jobId: job.id }, "Extração prioritária enfileirada")

  res.status(201).json({
    solicitacaoId: solicitacao.id,
    jobId: job.id,
    posicaoFila,
    tempoEstimado: `${tempoEstimadoMin}-${tempoEstimadoMax} minutos`,
    saldoRestante: saldo - 1,
  })
})

// ─── GET /api/extracao/eventos (SSE — stream de status em tempo real) ─────────

extracaoRouter.get("/eventos", async (req, res): Promise<void> => {
  const q = StatusQuerySchema.safeParse(req.query)
  if (!q.success) { res.status(400).json({ erro: "email obrigatório" }); return }

  const usuario = await prisma.usuario.findUnique({ where: { email: q.data.email } })
  if (!usuario) { res.status(404).json({ erro: "Usuário não encontrado" }); return }

  res.setHeader("Content-Type", "text/event-stream")
  res.setHeader("Cache-Control", "no-cache")
  res.setHeader("Connection", "keep-alive")
  res.setHeader("X-Accel-Buffering", "no") // desativa buffer do nginx
  res.flushHeaders()

  const sendEvent = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  }

  const fetchSolicitacoes = () =>
    prisma.solicitacaoExtracao.findMany({
      where: { usuarioId: usuario.id },
      orderBy: { criadoEm: "desc" },
      take: 50,
      include: {
        processo: { select: { id: true, numeroProcesso: true, recuperandaRazaoSocial: true, estado: true } },
      },
    })

  // Snapshot inicial
  const initial = await fetchSolicitacoes()
  sendEvent("snapshot", { solicitacoes: initial })
  let prevJson = JSON.stringify(initial)
  let ticks = 0

  let pollId: ReturnType<typeof setInterval>
  let timeoutId: ReturnType<typeof setTimeout>

  const cleanup = () => {
    clearInterval(pollId)
    clearTimeout(timeoutId)
  }

  pollId = setInterval(async () => {
    try {
      ticks++

      // Heartbeat a cada ~25s (5s × 5)
      if (ticks % 5 === 0) res.write(": heartbeat\n\n")

      const current = await fetchSolicitacoes()
      const currentJson = JSON.stringify(current)
      if (currentJson === prevJson) return

      // Envia update apenas para registros que mudaram
      const prev = JSON.parse(prevJson) as typeof current
      for (const item of current) {
        const old = prev.find((p) => p.id === item.id)
        if (!old || JSON.stringify(old) !== JSON.stringify(item)) {
          sendEvent("update", { solicitacao: item })
        }
      }
      prevJson = currentJson
    } catch {
      // erro de DB silencioso — próximo tick tenta de novo
    }
  }, 5_000)

  // Fecha automaticamente após 10 minutos
  timeoutId = setTimeout(() => {
    cleanup()
    res.end()
  }, 10 * 60 * 1_000)

  req.on("close", cleanup)
})

// ─── GET /api/extracao/:id ────────────────────────────────────────────────────

const StatusQuerySchema = z.object({ email: z.string().email() })

extracaoRouter.get("/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] ?? "")
  if (isNaN(id)) { res.status(400).json({ erro: "ID inválido" }); return }

  const q = StatusQuerySchema.safeParse(req.query)
  if (!q.success) { res.status(400).json({ erro: "email obrigatório" }); return }

  const usuario = await prisma.usuario.findUnique({ where: { email: q.data.email } })
  if (!usuario) { res.status(404).json({ erro: "Usuário não encontrado" }); return }

  const solicitacao = await prisma.solicitacaoExtracao.findFirst({
    where: { id, usuarioId: usuario.id },
    include: { processo: { select: { numeroProcesso: true, recuperandaRazaoSocial: true } } },
  })
  if (!solicitacao) { res.status(404).json({ erro: "Solicitação não encontrada" }); return }

  res.json(solicitacao)
})

// ─── GET /api/extracao (histórico do usuário) ─────────────────────────────────

const HistoricoQuerySchema = z.object({
  email:     z.string().email(),
  status:    z.string().optional(),
  pagina:    z.coerce.number().min(1).default(1),
  por_pagina: z.coerce.number().min(1).max(50).default(20),
})

extracaoRouter.get("/", async (req, res): Promise<void> => {
  const q = HistoricoQuerySchema.safeParse(req.query)
  if (!q.success) { res.status(400).json({ erro: q.error.flatten() }); return }

  const usuario = await prisma.usuario.findUnique({ where: { email: q.data.email } })
  if (!usuario) { res.status(404).json({ erro: "Usuário não encontrado" }); return }

  const skip = (q.data.pagina - 1) * q.data.por_pagina
  const where = {
    usuarioId: usuario.id,
    ...(q.data.status ? { status: q.data.status } : {}),
  }

  const [solicitacoes, total] = await Promise.all([
    prisma.solicitacaoExtracao.findMany({
      where,
      skip,
      take: q.data.por_pagina,
      orderBy: { criadoEm: "desc" },
      include: { processo: { select: { id: true, numeroProcesso: true, recuperandaRazaoSocial: true, estado: true } } },
    }),
    prisma.solicitacaoExtracao.count({ where }),
  ])

  res.json({ data: solicitacoes, total, pagina: q.data.pagina, totalPaginas: Math.ceil(total / q.data.por_pagina) })
})

// ─── GET /api/extracao/status — polling fallback para o hook SSE ──────────────
extracaoRouter.get("/status", async (req, res): Promise<void> => {
  const email = req.query["email"] as string
  if (!email) { res.status(400).json({ erro: "email obrigatório" }); return }
  const usuario = await prisma.usuario.findUnique({ where: { email } })
  if (!usuario) { res.status(404).json({ erro: "Usuário não encontrado" }); return }
  const solicitacoes = await prisma.solicitacaoExtracao.findMany({
    where: { usuarioId: usuario.id },
    orderBy: { criadoEm: "desc" },
    take: 50,
    include: { processo: { select: { id: true, numeroProcesso: true, recuperandaRazaoSocial: true, estado: true } } },
  })
  res.json({ solicitacoes })
})
