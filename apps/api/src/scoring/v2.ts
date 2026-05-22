import { Decimal } from "@prisma/client/runtime/library"
import { prisma } from "../lib/db"
import { logger } from "../lib/logger"

type ClasseCredor =
  | "I_trabalhista"
  | "II_garantia_real"
  | "III_quirografario"
  | "IV_me_epp"
  | "extraconcursal"

type TipoPessoa = string | null

const BASE_CLASSE: Record<ClasseCredor, number> = {
  I_trabalhista:     0.35,
  II_garantia_real:  0.25,
  III_quirografario: 0.65,
  IV_me_epp:         0.55,
  extraconcursal:    0.10,
}

const DESAGIO_CLASSE: Record<ClasseCredor, number> = {
  I_trabalhista:     0.10,
  II_garantia_real:  0.25,
  III_quirografario: 0.70,
  IV_me_epp:         0.50,
  extraconcursal:    0.05,
}

function mesesDesde(data: Date | null): number | null {
  if (!data) return null
  return (Date.now() - data.getTime()) / (1000 * 60 * 60 * 24 * 30.44)
}

function calcularScoreV2(
  valor: number,
  classe: string,
  tipoPessoa: TipoPessoa,
  cessivel: boolean,
  dataDeferimento: Date | null
): { score: number; recuperacaoEsperada: number; precoAlvoCompra: number; motivos: string } {
  if (!cessivel) {
    return { score: 0, recuperacaoEsperada: 0, precoAlvoCompra: 0, motivos: "Crédito não cessível" }
  }

  const classeKey = (classe in BASE_CLASSE ? classe : "III_quirografario") as ClasseCredor
  let score = BASE_CLASSE[classeKey]
  const motParts: string[] = [`base ${classeKey.replace(/_/g, " ")} ${(BASE_CLASSE[classeKey] * 100).toFixed(0)}%`]

  // Modificador por valor
  if (valor >= 30_000 && valor <= 500_000) {
    score += 0.15
    motParts.push("+15% sweet-spot valor")
  } else if (valor >= 10_000 && valor < 30_000) {
    score += 0.05
    motParts.push("+5% valor ok")
  } else if (valor < 5_000) {
    score -= 0.25
    motParts.push("-25% valor baixo")
  } else if (valor > 2_000_000) {
    score -= 0.10
    motParts.push("-10% valor alto")
  }

  // Modificador por tipo de credor
  if (tipoPessoa === "PJ") { score += 0.10; motParts.push("+10% PJ") }
  else if (tipoPessoa === "cooperativa") { score += 0.05; motParts.push("+5% cooperativa") }
  else if (tipoPessoa === "banco") { score -= 0.15; motParts.push("-15% banco (difícil ceder)") }
  else if (tipoPessoa === "fundo") { score -= 0.20; motParts.push("-20% fundo (profissional)") }

  // Modificador por idade do processo
  const meses = mesesDesde(dataDeferimento)
  if (meses !== null) {
    if (meses < 6) { score += 0.10; motParts.push("+10% RJ nova") }
    else if (meses < 24) { score += 0.05; motParts.push("+5% RJ recente") }
    else if (meses > 60) { score -= 0.15; motParts.push("-15% processo antigo") }
  }

  score = Math.max(0, Math.min(1, score))

  const desagio = DESAGIO_CLASSE[classeKey]
  const probExec = meses !== null && meses > 36 ? 0.40 : 0.65
  const recuperacaoEsperada = valor * (1 - desagio) * probExec
  const precoAlvoCompra = recuperacaoEsperada * 0.30

  motParts.push(`prob.exec ${(probExec * 100).toFixed(0)}%`, `preço-alvo R$ ${precoAlvoCompra.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`)

  return {
    score: Number(score.toFixed(4)),
    recuperacaoEsperada,
    precoAlvoCompra,
    motivos: motParts.join(" · "),
  }
}

export const scorarProcessoV2 = async (processoId: number): Promise<number> => {
  const processo = await prisma.processo.findUnique({ where: { id: processoId } })
  if (!processo) throw new Error(`Processo ${processoId} não encontrado`)

  const credores = await prisma.credor.findMany({ where: { processoId } })
  if (credores.length === 0) return 0

  let atualizados = 0
  for (const c of credores) {
    const valor = new Decimal(c.valor).toNumber()
    const result = calcularScoreV2(valor, c.classe, c.tipoPessoa, c.cessivel, processo.dataDeferimento)

    await prisma.credor.update({
      where: { id: c.id },
      data: {
        score: new Decimal(result.score),
        scoreMotivos: result.motivos,
        recuperacaoEsperada: new Decimal(result.recuperacaoEsperada),
        precoAlvoCompra: new Decimal(result.precoAlvoCompra),
      },
    })
    atualizados++
  }

  await prisma.processo.update({
    where: { id: processoId },
    data: { status: "scored" },
  })

  logger.info({ processoId, atualizados }, "Scoring v2 concluído")
  return atualizados
}

export const scorarTodosV2 = async (): Promise<void> => {
  const processos = await prisma.processo.findMany({
    where: { credores: { some: {} } },
    select: { id: true, numeroProcesso: true },
  })

  logger.info({ total: processos.length }, "Iniciando scoring v2 em lote")

  for (const p of processos) {
    try {
      const n = await scorarProcessoV2(p.id)
      logger.info({ processoId: p.id, numero: p.numeroProcesso, n }, "v2 scored")
    } catch (err) {
      logger.error({ err: (err as Error).message, processoId: p.id }, "Erro scoring v2")
    }
  }

  logger.info("Scoring v2 concluído")
}
