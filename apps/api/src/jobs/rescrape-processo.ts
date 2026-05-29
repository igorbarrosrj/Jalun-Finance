import { Job } from "bullmq"
import { prisma } from "../lib/db"
import { logger } from "../lib/logger"

const R4C_URL_BASE = "https://r4cempresarial.com.br"

export const rescrapeProcessoJobHandler = async (job: Job): Promise<void> => {
  const { processoId } = job.data as { processoId: number }

  const processo = await prisma.processo.findUnique({
    where: { id: processoId },
    include: { aj: { select: { urlBase: true } } },
  })
  if (!processo) throw new Error(`Processo ${processoId} não encontrado`)

  logger.info({ processoId, cnj: processo.numeroProcesso, aj: processo.aj.urlBase }, "rescrape-processo: iniciando")

  if (processo.aj.urlBase !== R4C_URL_BASE) {
    logger.warn({ processoId, ajUrl: processo.aj.urlBase }, "rescrape-processo: AJ não suportado para re-scrape automático")
    return
  }

  // Importação dinâmica para evitar inicializar Playwright se o AJ não for suportado
  const { listarTodosProcessos } = await import("../scrapers/r4c/listar")

  const todos = await listarTodosProcessos()
  const match = todos.find((p) => p.numeroProcesso === processo.numeroProcesso)

  if (!match) {
    logger.warn({ processoId, cnj: processo.numeroProcesso }, "rescrape-processo: CNJ não encontrado no índice R4C")
    return
  }

  let novos = 0
  for (const pdf of match.pdfs) {
    const nomeArquivo = decodeURIComponent(pdf.href.split("/").pop() ?? "")
    const existing = await prisma.documento.findUnique({ where: { urlPdf: pdf.href }, select: { id: true, relevante: true, tipoDocumento: true } })

    if (existing) {
      // Atualiza classificação se mudou (re-classifica com nome decodificado)
      if (existing.tipoDocumento !== pdf.tipoDocumento || existing.relevante !== pdf.relevante) {
        await prisma.documento.update({
          where: { id: existing.id },
          data: { tipoDocumento: pdf.tipoDocumento, relevante: pdf.relevante, nomeArquivo },
        })
      }
      continue
    }

    await prisma.documento.create({
      data: {
        processoId,
        urlPdf:         pdf.href,
        nomeArquivo,
        tipoDocumento:  pdf.tipoDocumento,
        relevante:      pdf.relevante,
        extraido:       false,
      },
    })
    novos++
  }

  logger.info(
    { processoId, novos, totalNoIndice: match.pdfs.length },
    "rescrape-processo: documentos novos catalogados"
  )
}
