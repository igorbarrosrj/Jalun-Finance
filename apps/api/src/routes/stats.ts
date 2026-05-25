import { Router } from "express"
import { prisma } from "../lib/db"

export const statsRouter = Router()

statsRouter.get("/", async (_req, res) => {
  try {
    const [totalProcessos, totalCredores, valorAgregado, rjAtivas, processosComDados] = await Promise.all([
      prisma.processo.count(),
      prisma.credor.count(),
      prisma.credor.aggregate({ _sum: { valor: true } }),
      prisma.processo.count({ where: { subtipo: "recuperacao_judicial_ativa" } }),
      prisma.processo.count({ where: { credores: { some: {} } } }),
    ])

    res.json({
      totalProcessos,
      totalCredores,
      valorTotalPassivo: valorAgregado._sum.valor?.toString() ?? "0",
      processosMonitorados: totalProcessos,
      rjAtivas,
      processosComDados,
      coberturaPct: totalProcessos > 0 ? Math.round((processosComDados / totalProcessos) * 100) : 0,
    })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})
