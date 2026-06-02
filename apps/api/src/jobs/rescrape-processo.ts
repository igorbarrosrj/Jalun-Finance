import { Job } from "bullmq"
import { prisma } from "../lib/db"
import { logger } from "../lib/logger"

const AJS_SUPORTADOS = [
  "https://r4cempresarial.com.br",
  "https://www.ajruiz.com.br",
  "https://psvar.com.br",
  "https://www.onbehalfbrasil.com.br",
]

export const rescrapeProcessoJobHandler = async (job: Job): Promise<void> => {
  const { processoId } = job.data as { processoId: number }

  const processo = await prisma.processo.findUnique({
    where: { id: processoId },
    include: { aj: { select: { urlBase: true, nome: true } } },
  })
  if (!processo) throw new Error(`Processo ${processoId} não encontrado`)

  logger.info({ processoId, cnj: processo.numeroProcesso, aj: processo.aj.urlBase }, "rescrape-processo: iniciando")

  if (!AJS_SUPORTADOS.includes(processo.aj.urlBase)) {
    logger.warn({ processoId, ajUrl: processo.aj.urlBase }, "rescrape-processo: AJ não suportado")
    return
  }

  let pdfs: Array<{ href: string; nomeArquivo?: string; tipoDocumento: string | null; relevante: boolean }> = []

  // ── R4C ──────────────────────────────────────────────────────────────────────
  if (processo.aj.urlBase === "https://r4cempresarial.com.br") {
    const { listarTodosProcessos } = await import("../scrapers/r4c/listar")
    const todos = await listarTodosProcessos()
    const match = todos.find((p) => p.numeroProcesso === processo.numeroProcesso)
    if (!match) {
      logger.warn({ processoId, cnj: processo.numeroProcesso }, "rescrape-processo: CNJ não encontrado no R4C")
      return
    }
    pdfs = match.pdfs.map((p) => ({
      href:          p.href,
      nomeArquivo:   decodeURIComponent(p.href.split("/").pop() ?? ""),
      tipoDocumento: p.tipoDocumento,
      relevante:     p.relevante,
    }))
  }

  // ── AJ Ruiz ───────────────────────────────────────────────────────────────────
  else if (processo.aj.urlBase === "https://www.ajruiz.com.br") {
    const axios = (await import("axios")).default
    const cheerio = await import("cheerio")
    try {
      const { data: html } = await axios.get<string>(processo.urlPaginaAj ?? "", {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; JalunCapital/1.0)" },
        timeout: 20_000,
      })
      const $ = cheerio.load(html)
      $("a[href]").each((_, el) => {
        const href = $(el).attr("href") ?? ""
        if (!href.endsWith(".pdf") && !href.includes(".pdf?")) return
        const url = href.startsWith("http") ? href : `https://www.ajruiz.com.br${href}`
        const nome = decodeURIComponent(url.split("/").pop()?.split("?")[0] ?? "")
        pdfs.push({ href: url, nomeArquivo: nome, tipoDocumento: classificarNome(nome), relevante: isRelevante(nome) })
      })
    } catch (err) {
      logger.warn({ processoId, err: (err as Error).message }, "rescrape-processo: falha AJ Ruiz")
      return
    }
  }

  // ── PSVAR ─────────────────────────────────────────────────────────────────────
  else if (processo.aj.urlBase === "https://psvar.com.br") {
    const { listarTodosProcessos } = await import("../scrapers/psvar/listar")
    const todos = await listarTodosProcessos(true)
    const match = todos.find(
      (p) => p.numeroProcesso === processo.numeroProcesso || p.urlPaginaAj === processo.urlPaginaAj
    )
    if (!match) {
      logger.warn({ processoId }, "rescrape-processo: processo não encontrado no PSVAR")
      return
    }
    pdfs = match.pdfs.map((p) => ({
      href:          p.url,
      nomeArquivo:   p.nomeArquivo,
      tipoDocumento: p.tipoDocumento,
      relevante:     !!p.tipoDocumento,
    }))
  }

  // ── OnBehalf — PDFs protegidos por senha ──────────────────────────────────────
  else if (processo.aj.urlBase === "https://www.onbehalfbrasil.com.br") {
    logger.info({ processoId }, "rescrape-processo: OnBehalf — PDFs protegidos por senha, sem acesso público")
    return
  }

  // ── Salvar documentos novos ───────────────────────────────────────────────────
  let novos = 0
  for (const pdf of pdfs) {
    const existing = await prisma.documento.findUnique({
      where: { urlPdf: pdf.href },
      select: { id: true, tipoDocumento: true, relevante: true },
    })

    if (existing) {
      if (existing.tipoDocumento !== pdf.tipoDocumento || existing.relevante !== pdf.relevante) {
        await prisma.documento.update({
          where: { id: existing.id },
          data: { tipoDocumento: pdf.tipoDocumento, relevante: pdf.relevante, nomeArquivo: pdf.nomeArquivo },
        })
      }
      continue
    }

    await prisma.documento.create({
      data: {
        processoId,
        urlPdf:        pdf.href,
        nomeArquivo:   pdf.nomeArquivo ?? "",
        tipoDocumento: pdf.tipoDocumento,
        relevante:     pdf.relevante,
        extraido:      false,
      },
    })
    novos++
  }

  logger.info({ processoId, novos, totalPdfs: pdfs.length }, "rescrape-processo: concluído")
}

// ── Helpers de classificação ─────────────────────────────────────────────────

function classificarNome(nome: string): string | null {
  const n = nome.toLowerCase()
  if (/lista.*credor|credor.*lista|quadro.*geral|relacao.*credor/i.test(n)) return "lista_credores"
  if (/edital.*art.*7|art.*7/i.test(n)) return "edital_art_7"
  if (/edital.*art.*52|art.*52/i.test(n)) return "edital_art_52"
  if (/plano.*recupera|recupera.*plano/i.test(n)) return "plano_rj"
  if (/quadro.*geral/i.test(n)) return "quadro_geral"
  return null
}

function isRelevante(nome: string): boolean {
  return classificarNome(nome) !== null
}
