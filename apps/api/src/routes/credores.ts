import { Router } from "express"
import { z } from "zod"
import { prisma } from "../lib/db"

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

credoresRouter.get("/", async (req, res) => {
  const parsed = FiltrosSchema.safeParse(req.query)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

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
