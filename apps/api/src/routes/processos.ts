import { Router } from "express"
import { z } from "zod"
import { prisma } from "../lib/db"

export const processosRouter = Router()

const FiltrosSchema = z.object({
  estado:    z.string().optional(),
  tipo:      z.string().optional(),
  pagina:    z.coerce.number().min(1).default(1),
  por_pagina: z.coerce.number().min(1).max(100).default(20),
  ordenar:   z.enum(["score", "valor", "dataDistribuicao", "dataDeferimento"]).optional(),
  ordem:     z.enum(["asc", "desc"]).default("desc"),
})

processosRouter.get("/", async (req, res) => {
  const parsed = FiltrosSchema.safeParse(req.query)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

  const { estado, tipo, pagina, por_pagina, ordem } = parsed.data
  const skip = (pagina - 1) * por_pagina

  try {
    const where = {
      ...(estado ? { estado } : {}),
      ...(tipo ? { tipo } : {}),
    }

    const [processos, total] = await Promise.all([
      prisma.processo.findMany({
        where,
        skip,
        take: por_pagina,
        orderBy: { descobertoEm: ordem },
        include: {
          aj: { select: { nome: true } },
          _count: { select: { credores: true, documentos: true } },
          listas: { select: { totalGeral: true, qtdCredores: true }, take: 1, orderBy: { extraidoEm: "desc" } },
          credores: {
            where: { score: { not: null } },
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
      topScores: p.credores.map((c) => c.score?.toString()),
    }))

    res.json({ data, total, pagina, por_pagina, totalPaginas: Math.ceil(total / por_pagina) })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

processosRouter.get("/:id", async (req, res) => {
  const id = parseInt(req.params["id"] ?? "0")
  if (isNaN(id)) return res.status(400).json({ error: "ID inválido" })

  try {
    const processo = await prisma.processo.findUnique({
      where: { id },
      include: {
        aj: true,
        documentos: { orderBy: { baixadoEm: "desc" } },
        listas: {
          orderBy: { extraidoEm: "desc" },
          include: {
            credores: { orderBy: { score: "desc" } },
          },
        },
        credores: {
          orderBy: { score: "desc" },
          take: 200,
        },
      },
    })

    if (!processo) return res.status(404).json({ error: "Processo não encontrado" })
    res.json(processo)
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})
