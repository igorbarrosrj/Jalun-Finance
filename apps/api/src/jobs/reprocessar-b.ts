import { prisma } from "../lib/db"
import { logger } from "../lib/logger"
import { ehCredorNaoCessivel } from "../scoring/filtros"
import { classificarTipoPessoa, calcularSubtipo } from "../lib/classificarCredor"
import { Decimal } from "@prisma/client/runtime/library"

async function reprocessarCredores() {
  const credores = await prisma.credor.findMany({
    select: { id: true, nome: true, documento: true, valor: true, listaId: true },
  })
  logger.info({ total: credores.length }, "Reprocessando credores (cessivel + tipoPessoa)")

  for (const c of credores) {
    const valor = new Decimal(c.valor).toNumber()
    const resultado = ehCredorNaoCessivel(c.nome, valor)
    const tipoPessoa = classificarTipoPessoa(c.nome, c.documento)

    await prisma.credor.update({
      where: { id: c.id },
      data: {
        cessivel: resultado.cessivel,
        scoreMotivos: resultado.cessivel
          ? undefined
          : `Crédito não cessível: ${(resultado as { cessivel: false; motivo: string }).motivo}`,
        score: resultado.cessivel ? undefined : new Decimal(0),
        tipoPessoa,
      },
    })
  }
  logger.info("Credores reprocessados")
}

async function reprocessarListasQualidade() {
  const listas = await prisma.listaCredores.findMany({
    select: {
      id: true,
      credores: { select: { cessivel: true } },
    },
  })

  for (const lista of listas) {
    const total = lista.credores.length
    if (total === 0) continue
    const naoCessiveis = lista.credores.filter((c) => !c.cessivel).length
    const pct = naoCessiveis / total
    const qualidadeBaixa = pct > 0.8

    await prisma.listaCredores.update({
      where: { id: lista.id },
      data: { qualidadeBaixa },
    })

    if (qualidadeBaixa) {
      logger.warn({ listaId: lista.id, pct: (pct * 100).toFixed(0) + "%" }, "Lista de qualidade baixa")
    }
  }
  logger.info("Qualidade das listas reavaliada")
}

async function reprocessarSubtipos() {
  const processos = await prisma.processo.findMany({
    select: { id: true, tipo: true, dataDeferimento: true },
  })
  logger.info({ total: processos.length }, "Calculando subtipos")

  for (const p of processos) {
    const subtipo = calcularSubtipo(p.tipo, p.dataDeferimento)
    await prisma.processo.update({ where: { id: p.id }, data: { subtipo } })
  }
  logger.info("Subtipos calculados")
}

async function main() {
  await reprocessarSubtipos()
  await reprocessarCredores()
  await reprocessarListasQualidade()
  logger.info("Fase B — reprocessamento concluído")
}

main()
  .catch((e) => { logger.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
