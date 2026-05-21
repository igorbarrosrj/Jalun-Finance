import { Job } from "bullmq"
import { prisma } from "../lib/db"
import { extrairTextoPdf } from "../lib/pdf"
import { extrairListaCredores } from "../extractors/claude"
import { logger } from "../lib/logger"
import { Decimal } from "@prisma/client/runtime/library"
import { ehCredorNaoCessivel } from "../scoring/filtros"
import { classificarTipoPessoa } from "../lib/classificarCredor"

export const extractJobHandler = async (job: Job<{ documentoId: number }>): Promise<void> => {
  const { documentoId } = job.data
  logger.info({ documentoId }, "Job extract: iniciando extração")

  const doc = await prisma.documento.findUnique({
    where: { id: documentoId },
    include: { processo: true },
  })
  if (!doc) throw new Error(`Documento ${documentoId} não encontrado`)
  if (doc.extraido) { logger.info({ documentoId }, "Já extraído — pulando"); return }
  if (!doc.caminhoLocal) throw new Error("Sem caminho local para o PDF")

  const contexto = doc.processo
    ? `Processo ${doc.processo.numeroProcesso} — ${doc.processo.recuperandaRazaoSocial ?? ""}`
    : undefined

  try {
    const texto = await extrairTextoPdf(doc.caminhoLocal)
    const resultado = await extrairListaCredores(texto, contexto)

    if (!resultado.success || !resultado.data) {
      await prisma.documento.update({
        where: { id: documentoId },
        data: { extraido: false, erroExtracao: resultado.erro ?? "Extração falhou" },
      })
      return
    }

    const data = resultado.data
    const totalGeral = Object.values(data.totais_por_classe).reduce((a, b) => a + b, 0)

    const lista = await prisma.listaCredores.create({
      data: {
        processoId: doc.processoId,
        documentoId: doc.id,
        totalClasse1: new Decimal(data.totais_por_classe.I),
        totalClasse2: new Decimal(data.totais_por_classe.II),
        totalClasse3: new Decimal(data.totais_por_classe.III),
        totalClasse4: new Decimal(data.totais_por_classe.IV),
        totalGeral: new Decimal(totalGeral),
        qtdCredores: data.credores.length,
        rawJson: data as object,
      },
    })

    let naoCessiveisCount = 0
    for (const c of data.credores) {
      const valor = c.valor
      const filtro = ehCredorNaoCessivel(c.nome, valor)
      const tipoPessoa = classificarTipoPessoa(c.nome, c.documento ?? null)

      await prisma.credor.create({
        data: {
          listaId: lista.id,
          processoId: doc.processoId,
          nome: c.nome,
          documento: c.documento,
          valor: new Decimal(valor),
          moeda: c.moeda,
          classe: c.classe,
          posicaoLista: c.posicao_lista,
          cessivel: filtro.cessivel,
          tipoPessoa,
          score: filtro.cessivel ? null : new Decimal(0),
          scoreMotivos: filtro.cessivel
            ? null
            : `Crédito não cessível: ${(filtro as { cessivel: false; motivo: string }).motivo}`,
        },
      })

      if (!filtro.cessivel) naoCessiveisCount++
    }

    const qualidadeBaixa =
      data.credores.length > 0 && naoCessiveisCount / data.credores.length > 0.8

    await prisma.listaCredores.update({
      where: { id: lista.id },
      data: { qualidadeBaixa },
    })

    await prisma.documento.update({
      where: { id: documentoId },
      data: { extraido: true, erroExtracao: null },
    })

    logger.info(
      { documentoId, credores: data.credores.length, cessiveisNao: naoCessiveisCount, qualidadeBaixa, listaId: lista.id },
      "Extração concluída"
    )
  } catch (err) {
    const msg = (err as Error).message
    await prisma.documento.update({
      where: { id: documentoId },
      data: { extraido: false, erroExtracao: msg },
    })
    throw err
  }
}
