/**
 * cron-historico-passivo: snapshot diário do passivo total de processos scored.
 * Só registra se o valor mudou em relação ao último snapshot (threshold 1%).
 *
 * Rodar diariamente: cron 30 6 * * * npm run cron:historico
 */
import { prisma } from "../lib/db"
import { logger } from "../lib/logger"

async function run() {
  const processos = await prisma.processo.findMany({
    where: { status: "scored" },
    select: {
      id: true,
      numeroProcesso: true,
      listas: {
        orderBy: { extraidoEm: "desc" },
        take: 1,
        select: { totalGeral: true, qtdCredores: true },
      },
    },
  })

  logger.info({ total: processos.length }, "cron-historico-passivo: processos scored")

  let criados = 0, ignorados = 0

  for (const p of processos) {
    const lista = p.listas[0]
    if (!lista?.totalGeral) { ignorados++; continue }

    const valorAtual = parseFloat(lista.totalGeral.toString())
    const qtdAtual   = lista.qtdCredores ?? 0

    const ultimo = await prisma.historicoPassivo.findFirst({
      where: { processoId: p.id },
      orderBy: { criadoEm: "desc" },
    })

    if (ultimo) {
      const valorAnterior = parseFloat(ultimo.valorTotal.toString())
      const variacaoPct = valorAnterior > 0
        ? Math.abs(valorAtual - valorAnterior) / valorAnterior
        : 1

      // Ignora se variação < 1% e qtd de credores igual
      if (variacaoPct < 0.01 && qtdAtual === ultimo.qtdCredores) {
        ignorados++
        continue
      }
    }

    await prisma.historicoPassivo.create({
      data: {
        processoId:  p.id,
        valorTotal:  valorAtual,
        qtdCredores: qtdAtual,
      },
    })
    criados++
  }

  logger.info({ criados, ignorados }, "cron-historico-passivo finalizado")
}

run()
  .catch((e) => { logger.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
