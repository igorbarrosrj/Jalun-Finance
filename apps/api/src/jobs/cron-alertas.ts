/**
 * cron-alertas: verifica processos novos (últimas 24h) contra AlertaConfigs ativos.
 * TODO: substituir logger.info por envio real de email (SendGrid/SES).
 *
 * Rodar diariamente: cron 0 8 * * * npm run cron:alertas
 */
import { prisma } from "../lib/db"
import { logger } from "../lib/logger"

const CLASSES_CESSIVEIS = [
  "I_trabalhista",
  "II_garantia_real",
  "III_quirografario",
  "IV_me_epp",
]

async function run() {
  const desde = new Date(Date.now() - 24 * 60 * 60 * 1_000)

  const alertas = await prisma.alertaConfig.findMany({
    where: { ativo: true },
    include: { usuario: { select: { email: true, nome: true } } },
  })

  logger.info({ total: alertas.length }, "cron-alertas: verificando alertas ativos")

  let notificacoes = 0

  for (const alerta of alertas) {
    // Busca processos novos que batem com o filtro
    const processos = await prisma.processo.findMany({
      where: {
        status: "scored",
        descobertoEm: { gte: desde },
        ...(alerta.estados.length > 0 ? { estado: { in: alerta.estados } } : {}),
        ...(alerta.scoreMinimo || alerta.valorMinimo || alerta.valorMaximo || alerta.classes.length > 0
          ? {
              credores: {
                some: {
                  cessivel: true,
                  ...(alerta.classes.length > 0
                    ? { classe: { in: alerta.classes.length > 0 ? alerta.classes : CLASSES_CESSIVEIS } }
                    : {}),
                  ...(alerta.scoreMinimo ? { score: { gte: alerta.scoreMinimo } } : {}),
                  ...(alerta.valorMinimo ? { valor: { gte: alerta.valorMinimo } } : {}),
                  ...(alerta.valorMaximo ? { valor: { lte: alerta.valorMaximo } } : {}),
                },
              },
            }
          : {}),
      },
      select: {
        id: true,
        numeroProcesso: true,
        recuperandaRazaoSocial: true,
        estado: true,
        subtipo: true,
      },
      take: 20,
    })

    if (processos.length === 0) continue

    // TODO: enviar email real para alerta.usuario.email
    logger.info(
      {
        usuarioEmail: alerta.usuario.email,
        qtdProcessos: processos.length,
        processos: processos.map((p) => p.numeroProcesso),
        canal: alerta.canal,
      },
      `[TODO email] Alerta: ${processos.length} novo(s) processo(s) para ${alerta.usuario.email}`
    )

    notificacoes++
  }

  logger.info({ notificacoes }, "cron-alertas finalizado")
}

run()
  .catch((e) => { logger.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
