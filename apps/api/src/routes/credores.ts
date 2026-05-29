import { Router } from "express"
import { z } from "zod"
import { prisma } from "../lib/db"
import { logger } from "../lib/logger"
import { gerarAnaliseCredor } from "../extractors/analise-credor"

export const credoresRouter = Router()

const FiltrosSchema = z.object({
  processoId: z.coerce.number().optional(),
  classe:     z.string().optional(),
  valor_min:  z.coerce.number().optional(),
  valor_max:  z.coerce.number().optional(),
  score_min:  z.coerce.number().optional(),
  pagina:     z.coerce.number().min(1).default(1),
  por_pagina: z.coerce.number().min(1).max(100).default(50),
})

credoresRouter.get("/", async (req, res): Promise<void> => {
  const parsed = FiltrosSchema.safeParse(req.query)
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return }

  const { processoId, classe, valor_min, valor_max, score_min, pagina, por_pagina } = parsed.data
  const skip = (pagina - 1) * por_pagina

  try {
    const where = {
      ...(processoId ? { processoId } : {}),
      ...(classe ? { classe } : {}),
      ...(valor_min !== undefined ? { valor: { gte: valor_min } } : {}),
      ...(valor_max !== undefined ? { valor: { lte: valor_max } } : {}),
      ...(score_min !== undefined ? { score: { gte: score_min } } : {}),
    }

    const [credores, total] = await Promise.all([
      prisma.credor.findMany({
        where,
        skip,
        take: por_pagina,
        orderBy: [{ score: "desc" }, { valor: "desc" }],
        include: { processo: { select: { numeroProcesso: true, recuperandaRazaoSocial: true, estado: true } } },
      }),
      prisma.credor.count({ where }),
    ])

    res.json({ data: credores, total, pagina, por_pagina, totalPaginas: Math.ceil(total / por_pagina) })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// ─── POST /api/credores/:id/analise ──────────────────────────────────────────
// Gera (ou retorna cache) análise detalhada de um credor.
// Cache de 7 dias — passa ?forcar=true para regenerar.

credoresRouter.post("/:id/analise", async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] ?? "")
  if (isNaN(id)) { res.status(400).json({ erro: "ID inválido" }); return }

  const forcar = req.query["forcar"] === "true"
  // usuarioId pode vir do body (autenticação futura) ou query
  const usuarioId = req.body?.usuarioId ?? undefined

  try {
    const resultado = await gerarAnaliseCredor(id, { forcar, usuarioId })
    res.json({
      analise: resultado.analise,
      cache: resultado.cached,
      analisadoEm: resultado.geradaEm,
    })
  } catch (err) {
    const errMsg = (err as Error).message ?? "Erro desconhecido"
    if (errMsg === "Credor não encontrado") { res.status(404).json({ erro: errMsg }); return }
    if (errMsg === "Credor não é cessível") { res.status(422).json({ erro: errMsg }); return }
    logger.error({ credorId: id, err: errMsg }, "Erro ao gerar análise de credor")
    res.status(503).json({ erro: "Serviço de análise temporariamente indisponível. Tente novamente." })
  }
})
