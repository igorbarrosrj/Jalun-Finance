import { Router } from "express"
import { z } from "zod"
import { prisma } from "../lib/db"
import { rescrapeQueue } from "../jobs/queue"
import { gerarAnaliseProcesso } from "../extractors/analise-processo"

export const processosRouter = Router()

const FiltrosSchema = z.object({
  estado:         z.string().optional(),
  tipo:           z.string().optional(),
  subtipo:        z.string().optional(),
  aj_id:          z.coerce.number().optional(),
  incluir_antigos: z.coerce.boolean().default(false),
  pagina:         z.coerce.number().min(1).default(1),
  por_pagina:     z.coerce.number().min(1).max(100).default(20),
  ordem:          z.enum(["asc", "desc"]).default("desc"),
})

processosRouter.get("/", async (req, res): Promise<void> => {
  const parsed = FiltrosSchema.safeParse(req.query)
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return }

  const { estado, tipo, subtipo, aj_id, incluir_antigos, pagina, por_pagina, ordem } = parsed.data
  const skip = (pagina - 1) * por_pagina

  try {
    const where: Record<string, unknown> = {}
    if (estado) where["estado"] = estado
    if (tipo) where["tipo"] = tipo
    if (aj_id) where["ajId"] = aj_id
    if (subtipo) {
      where["subtipo"] = subtipo
    } else if (!incluir_antigos) {
      // padrão: só RJ ativas e falências ativas recentes
      where["subtipo"] = { in: ["recuperacao_judicial_ativa", "recuperacao_judicial_antiga"] }
    }

    const [processos, total] = await Promise.all([
      prisma.processo.findMany({
        where,
        skip,
        take: por_pagina,
        orderBy: { dataDeferimento: ordem },
        include: {
          aj: { select: { nome: true } },
          _count: { select: { credores: true, documentos: true } },
          listas: {
            select: { totalGeral: true, qtdCredores: true, qualidadeBaixa: true },
            take: 1,
            orderBy: { extraidoEm: "desc" },
          },
          credores: {
            where: { score: { not: null }, cessivel: true },
            orderBy: { score: "desc" },
            take: 3,
            select: { score: true },
          },
        },
      }),
      prisma.processo.count({ where }),
    ])

    const data = processos.map((p) => ({
      id: p.id,
      numeroProcesso: p.numeroProcesso,
      tipo: p.tipo,
      subtipo: p.subtipo,
      recuperandaRazaoSocial: p.recuperandaRazaoSocial,
      vara: p.vara,
      comarca: p.comarca,
      estado: p.estado,
      dataDistribuicao: p.dataDistribuicao?.toISOString() ?? null,
      dataDeferimento: p.dataDeferimento?.toISOString() ?? null,
      status: p.status,
      ajNome: p.aj.nome,
      totalDocumentos: p._count.documentos,
      totalCredores: p._count.credores,
      valorTotal: p.listas[0]?.totalGeral?.toString() ?? null,
      qtdCredoresLista: p.listas[0]?.qtdCredores ?? null,
      qualidadeBaixa: p.listas[0]?.qualidadeBaixa ?? false,
      topScores: p.credores.map((c) => c.score?.toString()),
    }))

    res.json({ data, total, pagina, por_pagina, totalPaginas: Math.ceil(total / por_pagina) })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

processosRouter.get("/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] ?? "0")
  if (isNaN(id)) { res.status(400).json({ error: "ID inválido" }); return }

  try {
    const processo = await prisma.processo.findUnique({
      where: { id },
      include: {
        aj: true,
        documentos: { orderBy: { baixadoEm: "desc" } },
        listas: {
          orderBy: { extraidoEm: "desc" },
          select: { id: true, qualidadeBaixa: true, qtdCredores: true, totalGeral: true, extraidoEm: true },
        },
        credores: {
          orderBy: { score: "desc" },
          take: 200,
        },
      },
    })

    if (!processo) { res.status(404).json({ error: "Processo não encontrado" }); return }
    res.json(processo)
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// ─── GET /api/processos/:id/historico ────────────────────────────────────────

processosRouter.get("/:id/historico", async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] ?? "0")
  if (isNaN(id)) { res.status(400).json({ erro: "ID inválido" }); return }

  const historico = await prisma.historicoPassivo.findMany({
    where: { processoId: id },
    orderBy: { criadoEm: "asc" },
    take: 30,
    select: { id: true, valorTotal: true, qtdCredores: true, criadoEm: true },
  })

  res.json(historico.map((h) => ({
    ...h,
    valorTotal: h.valorTotal.toString(),
  })))
})

// ─── POST /api/processos/:id/re-scrape ───────────────────────────────────────

processosRouter.post("/:id/re-scrape", async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] ?? "0")
  if (isNaN(id)) { res.status(400).json({ erro: "ID inválido" }); return }

  const processo = await prisma.processo.findUnique({
    where: { id },
    select: { id: true, numeroProcesso: true, recuperandaRazaoSocial: true },
  })
  if (!processo) { res.status(404).json({ erro: "Processo não encontrado" }); return }

  // Evita enfileirar duplicado se já há um job pendente
  const waiting = await rescrapeQueue.getWaiting()
  const jaEnfileirado = waiting.some((j) => j.data?.processoId === id)
  if (jaEnfileirado) {
    res.json({ status: "ja_enfileirado", message: "Já existe uma busca em andamento para este processo." })
    return
  }

  const job = await rescrapeQueue.add("rescrape-processo", { processoId: id })

  res.status(202).json({
    status: "enfileirado",
    jobId: job.id,
    tempoEstimado: "1-2 minutos",
    message: "Buscando novos documentos no site do AJ. A página atualizará automaticamente.",
  })
})

// ─── POST /api/processos/:id/analisar ─────────────────────────────────────────
// Gera (ou retorna cache) análise de portfólio do processo.
// Cache de 3 dias — passa ?forcar=true para regenerar.

processosRouter.post("/:id/analisar", async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] ?? "")
  if (isNaN(id)) { res.status(400).json({ erro: "ID inválido" }); return }

  const forcar = req.query["forcar"] === "true"
  const usuarioId = req.body?.usuarioId ?? undefined

  try {
    const resultado = await gerarAnaliseProcesso(id, { forcar, usuarioId })
    res.json({
      analise: resultado.analise,
      teses: resultado.teses,
      cache: resultado.cached,
      geradaEm: resultado.geradaEm,
    })
  } catch (err) {
    const errMsg = (err as Error).message ?? "Erro desconhecido"
    if (errMsg === "Processo não encontrado") { res.status(404).json({ erro: errMsg }); return }
    import("../lib/logger").then(({ logger }) =>
      logger.error({ processoId: id, err: errMsg }, "Erro ao gerar análise de processo")
    )
    res.status(503).json({ erro: "Serviço de análise temporariamente indisponível. Tente novamente." })
  }
})

