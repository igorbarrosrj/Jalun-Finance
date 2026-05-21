import { Router } from "express"
import { prisma } from "../lib/db"

export const statsRouter = Router()

statsRouter.get("/", async (_req, res) => {
  try {
    const [totalProcessos, totalCredores, valorAgregado] = await Promise.all([
      prisma.processo.count(),
      prisma.credor.count(),
      prisma.credor.aggregate({ _sum: { valor: true } }),
    ])

    res.json({
      totalProcessos,
      totalCredores,
      valorTotalPassivo: valorAgregado._sum.valor?.toString() ?? "0",
      processosMonitorados: totalProcessos,
    })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})
