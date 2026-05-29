import { Router } from "express"
import { z } from "zod"
import { prisma } from "../lib/db"

export const atividadesRouter = Router()

const QuerySchema = z.object({
  dias:   z.coerce.number().int().min(1).max(90).default(7),
  limite: z.coerce.number().int().min(1).max(100).default(20),
})

atividadesRouter.get("/", async (req, res): Promise<void> => {
  const q = QuerySchema.safeParse(req.query)
  if (!q.success) { res.status(400).json({ erro: q.error.flatten() }); return }

  const desde = new Date(Date.now() - q.data.dias * 86_400_000)

  const [atividades, resumo] = await Promise.all([
    prisma.atividadeSistema.findMany({
      where: { criadoEm: { gte: desde } },
      orderBy: { criadoEm: "desc" },
      take: q.data.limite,
    }),
    prisma.atividadeSistema.groupBy({
      by: ["tipo"],
      where: { criadoEm: { gte: desde } },
      _count: { id: true },
    }),
  ])

  const contagens: Record<string, number> = {}
  for (const r of resumo) contagens[r.tipo] = r._count.id

  // Total RJ ativas no banco (não filtrado por data)
  const totalRjAtivas = await prisma.processo.count({
    where: { subtipo: "recuperacao_judicial_ativa" },
  })

  res.json({
    atividades,
    resumo: {
      processos_novos:    contagens["processo_novo"]    ?? 0,
      credores_novos:     contagens["credor_novo"]      ?? 0,
      planos_atualizados: contagens["plano_atualizado"] ?? 0,
      listas_atualizadas: contagens["lista_atualizada"] ?? 0,
    },
    total_rj_ativas: totalRjAtivas,
    dias: q.data.dias,
  })
})
