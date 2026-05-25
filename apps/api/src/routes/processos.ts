import { Router } from "express"
import { z } from "zod"
import { prisma } from "../lib/db"

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
