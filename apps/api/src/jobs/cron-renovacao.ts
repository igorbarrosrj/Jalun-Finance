/**
 * cron-renovacao: renova créditos mensais para assinaturas ativas cuja
 * próxima renovação já venceu.
 *
 * Rodar diariamente (ex: cron 0 7 * * * npm run cron:renovacao)
 * Também pode ser testado manualmente: npm run cron:renovacao
 */
import { prisma } from "../lib/db"
import { logger } from "../lib/logger"

async function run() {
  const agora = new Date()

  const assinaturas = await prisma.assinaturaUsuario.findMany({
    where: {
      status: "ativa",
      proximaRenovacao: { lte: agora },
    },
    include: { plano: true, usuario: { select: { id: true, email: true, nome: true } } },
  })

  logger.info({ total: assinaturas.length }, "cron-renovacao: assinaturas a renovar")

  let renovadas = 0, erros = 0

  for (const assinatura of assinaturas) {
    try {
      const creditosMes = assinatura.plano.creditosMes
      const proximaRenovacao = new Date(assinatura.proximaRenovacao.getTime() + 30 * 86_400_000)

      await prisma.$transaction([
        // Adiciona créditos ao saldo
        prisma.creditoUsuario.upsert({
          where: { usuarioId: assinatura.usuarioId },
          update: { saldo: { increment: creditosMes }, ultimaRecarga: agora },
          create: { usuarioId: assinatura.usuarioId, saldo: creditosMes, ultimaRecarga: agora },
        }),
        // Registra transação
        prisma.transacaoCredito.create({
          data: {
            usuarioId: assinatura.usuarioId,
            tipo: "renovacao_mensal",
            quantidade: creditosMes,
            descricao: `Renovação mensal — plano ${assinatura.plano.nome}`,
          },
        }),
        // Avança próxima renovação
        prisma.assinaturaUsuario.update({
          where: { id: assinatura.id },
          data: { proximaRenovacao },
        }),
      ])

      logger.info(
        { usuarioId: assinatura.usuarioId, email: assinatura.usuario.email, creditosMes, proximaRenovacao },
        "Créditos renovados"
      )
      renovadas++
    } catch (err) {
      logger.error({ err: (err as Error).message, usuarioId: assinatura.usuarioId }, "Erro ao renovar")
      erros++
    }
  }

  logger.info({ renovadas, erros }, "cron-renovacao finalizado")
}

run()
  .catch((e) => { logger.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
