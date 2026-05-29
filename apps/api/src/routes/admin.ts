import { Router } from "express"
import { prisma } from "../lib/db"

export const adminRouter = Router()

// ─── GET /api/admin/custos ────────────────────────────────────────────────────
// Dashboard de custos de IA para administradores

adminRouter.get("/custos", async (_req, res): Promise<void> => {
  try {
    const [
      totaisMes,
      totaisGeral,
      porTipo,
      porDia,
      maioresCredores,
      maioresProcessos,
    ] = await Promise.all([
      // Total este mês
      prisma.custoIA.aggregate({
        _sum: { custoUsd: true, custoBrl: true, tokensInput: true, tokensOutput: true },
        _count: true,
        where: {
          criadoEm: {
            gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
          },
        },
      }),
      // Total geral
      prisma.custoIA.aggregate({
        _sum: { custoUsd: true, custoBrl: true, tokensInput: true, tokensOutput: true },
        _count: true,
      }),
      // Por tipo
      prisma.custoIA.groupBy({
        by: ["tipo"],
        _sum: { custoUsd: true, custoBrl: true },
        _count: true,
        orderBy: { _sum: { custoUsd: "desc" } },
      }),
      // Últimos 30 dias por dia
      prisma.$queryRaw<Array<{ dia: Date; total_usd: number; total_brl: number; qtd: number }>>`
        SELECT
          DATE_TRUNC('day', criado_em) AS dia,
          SUM(custo_usd)::float AS total_usd,
          SUM(custo_brl)::float AS total_brl,
          COUNT(*)::int AS qtd
        FROM custos_ia
        WHERE criado_em >= NOW() - INTERVAL '30 days'
        GROUP BY dia
        ORDER BY dia DESC
      `,
      // Top 10 credores mais analisados por custo
      prisma.$queryRaw<Array<{ credor_id: number; nome: string; total_usd: number; qtd: number }>>`
        SELECT
          ci.credor_id,
          c.nome,
          SUM(ci.custo_usd)::float AS total_usd,
          COUNT(*)::int AS qtd
        FROM custos_ia ci
        JOIN credores c ON c.id = ci.credor_id
        WHERE ci.credor_id IS NOT NULL
        GROUP BY ci.credor_id, c.nome
        ORDER BY total_usd DESC
        LIMIT 10
      `,
      // Top 10 processos por custo
      prisma.$queryRaw<Array<{ processo_id: number; empresa: string; total_usd: number; qtd: number }>>`
        SELECT
          ci.processo_id,
          p.recuperanda_razao_social AS empresa,
          SUM(ci.custo_usd)::float AS total_usd,
          COUNT(*)::int AS qtd
        FROM custos_ia ci
        JOIN processos p ON p.id = ci.processo_id
        WHERE ci.processo_id IS NOT NULL
        GROUP BY ci.processo_id, p.recuperanda_razao_social
        ORDER BY total_usd DESC
        LIMIT 10
      `,
    ])

    res.json({
      mes: {
        custoUsd: totaisMes._sum.custoUsd?.toString() ?? "0",
        custoBrl: totaisMes._sum.custoBrl?.toString() ?? "0",
        tokensInput: totaisMes._sum.tokensInput ?? 0,
        tokensOutput: totaisMes._sum.tokensOutput ?? 0,
        chamadas: totaisMes._count,
      },
      geral: {
        custoUsd: totaisGeral._sum.custoUsd?.toString() ?? "0",
        custoBrl: totaisGeral._sum.custoBrl?.toString() ?? "0",
        tokensInput: totaisGeral._sum.tokensInput ?? 0,
        tokensOutput: totaisGeral._sum.tokensOutput ?? 0,
        chamadas: totaisGeral._count,
      },
      porTipo: porTipo.map((t) => ({
        tipo: t.tipo,
        custoUsd: t._sum.custoUsd?.toString() ?? "0",
        custoBrl: t._sum.custoBrl?.toString() ?? "0",
        chamadas: t._count,
      })),
      porDia: porDia.map((d) => ({
        dia: d.dia,
        custoUsd: d.total_usd,
        custoBrl: d.total_brl,
        chamadas: d.qtd,
      })),
      maioresCredores,
      maioresProcessos,
    })
  } catch (err) {
    res.status(500).json({ erro: (err as Error).message })
  }
})
