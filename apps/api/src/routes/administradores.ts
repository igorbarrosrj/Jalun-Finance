import { Router } from "express"
import { prisma } from "../lib/db"

export const administradoresRouter = Router()

administradoresRouter.get("/", async (_req, res) => {
  try {
    const ajs = await prisma.administradorJudicial.findMany({
      where: { ativo: true },
      include: {
        _count: { select: { processos: true } },
      },
      orderBy: { nome: "asc" },
    })

    const resultado = await Promise.all(
      ajs.map(async (aj) => {
        const [rjAtivas, rjAntigas, falencias, processoComCredores, valorAgregado] = await Promise.all([
          prisma.processo.count({ where: { ajId: aj.id, subtipo: "recuperacao_judicial_ativa" } }),
          prisma.processo.count({ where: { ajId: aj.id, subtipo: "recuperacao_judicial_antiga" } }),
          prisma.processo.count({ where: { ajId: aj.id, tipo: "falencia" } }),
          prisma.processo.count({ where: { ajId: aj.id, credores: { some: {} } } }),
          prisma.credor.aggregate({
            where: { processo: { ajId: aj.id } },
            _sum: { valor: true },
          }),
        ])

        return {
          id: aj.id,
          nome: aj.nome,
          urlBase: aj.urlBase,
          estado: aj.estado,
          totalProcessos: aj._count.processos,
          rjAtivas,
          rjAntigas,
          falencias,
          processosComCredores: processoComCredores,
          valorTotalPassivo: valorAgregado._sum.valor?.toString() ?? "0",
        }
      })
    )

    res.json(resultado)
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})
