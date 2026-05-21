import { Decimal } from "@prisma/client/runtime/library"
import { prisma } from "../lib/db"
import { logger } from "../lib/logger"

type ClasseCredor =
  | "I_trabalhista"
  | "II_garantia_real"
  | "III_quirografario"
  | "IV_me_epp"
  | "extraconcursal"

const DESAGIO_POR_CLASSE: Record<ClasseCredor, number> = {
  I_trabalhista:    0.10,
  II_garantia_real: 0.25,
  III_quirografario: 0.70,
  IV_me_epp:        0.50,
  extraconcursal:   0.05,
}

const PROB_EXECUCAO_BASE = 0.65

const calcularScore = (
  valor: number,
  classe: ClasseCredor,
  idadeProcessoAnos: number
) => {
  const desagio = DESAGIO_POR_CLASSE[classe] ?? 0.70

  // Probabilidade de execução reduz 2% ao ano de processo
  const probExecucao = Math.max(0.30, PROB_EXECUCAO_BASE - idadeProcessoAnos * 0.02)

  const recuperacaoEsperada = valor * (1 - desagio) * probExecucao
  const precoAlvoCompra = recuperacaoEsperada * 0.30
  const score = valor > 0 ? (recuperacaoEsperada - precoAlvoCompra) / valor : 0

  const motivos = [
    `Classe ${classe.replace("_", " ")}`,
    `deságio ${(desagio * 100).toFixed(0)}%`,
    `prob. exec. ${(probExecucao * 100).toFixed(0)}%`,
    `preço-alvo R$ ${precoAlvoCompra.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
    `processo ${idadeProcessoAnos.toFixed(1)} anos`,
  ].join(", ")

  return { recuperacaoEsperada, precoAlvoCompra, score, motivos }
}

export const scorarCredoresDoProcesso = async (processoId: number): Promise<number> => {
  const processo = await prisma.processo.findUnique({ where: { id: processoId } })
  if (!processo) throw new Error(`Processo ${processoId} não encontrado`)

  const refDate = processo.dataDeferimento ?? processo.dataDistribuicao ?? processo.descobertoEm
  const idadeAnos = (Date.now() - refDate.getTime()) / (1000 * 60 * 60 * 24 * 365)

  const credores = await prisma.credor.findMany({
    where: { processoId, score: null },
  })

  if (credores.length === 0) {
    logger.info({ processoId }, "Nenhum credor sem score")
    return 0
  }

  let atualizados = 0
  for (const credor of credores) {
    const valor = new Decimal(credor.valor).toNumber()
    const classe = credor.classe as ClasseCredor

    if (!DESAGIO_POR_CLASSE[classe]) {
      logger.warn({ credorId: credor.id, classe }, "Classe desconhecida — usando quirografário")
    }

    const { recuperacaoEsperada, precoAlvoCompra, score, motivos } = calcularScore(
      valor,
      classe in DESAGIO_POR_CLASSE ? classe : "III_quirografario",
      idadeAnos
    )

    await prisma.credor.update({
      where: { id: credor.id },
      data: {
        score: new Decimal(score),
        scoreMotivos: motivos,
        recuperacaoEsperada: new Decimal(recuperacaoEsperada),
        precoAlvoCompra: new Decimal(precoAlvoCompra),
      },
    })
    atualizados++
  }

  logger.info({ processoId, atualizados }, "Scoring v1 concluído")
  return atualizados
}

export const scorarTodosCredores = async (): Promise<void> => {
  const processos = await prisma.processo.findMany({
    where: { credores: { some: { score: null } } },
    select: { id: true, numeroProcesso: true },
  })

  logger.info({ processos: processos.length }, "Iniciando scoring em lote")

  for (const p of processos) {
    try {
      const n = await scorarCredoresDoProcesso(p.id)
      logger.info({ processoId: p.id, numero: p.numeroProcesso, credoresAtualizados: n }, "Scored")
    } catch (err) {
      logger.error({ err: (err as Error).message, processoId: p.id }, "Erro no scoring")
    }
  }
}
