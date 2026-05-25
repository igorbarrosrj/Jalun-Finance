import type { ScraperAJ, ScraperResult } from "../tipos"
import { listarTodosProcessos } from "./listar"
import { prisma } from "../../lib/db"
import { logger } from "../../lib/logger"
import { calcularSubtipo } from "../../lib/classificarCredor"

const BASE_URL = "https://r4cempresarial.com.br"

function calcularPrioridade(tipo: "RJ" | "falencia", dataDeferimento: Date | null): string {
  if (tipo === "falencia") return "baixa"
  if (!dataDeferimento) return "media"
  const meses = (Date.now() - dataDeferimento.getTime()) / (1000 * 60 * 60 * 24 * 30.44)
  return meses <= 36 ? "alta" : "media"
}

export class R4CScraper implements ScraperAJ {
  readonly urlBase = BASE_URL

  async run(opts: { limit?: number } = {}): Promise<ScraperResult> {
    const batchSize = opts.limit ?? parseInt(process.env["R4C_BATCH_SIZE"] ?? "10")

    const aj = await prisma.administradorJudicial.findFirst({ where: { urlBase: BASE_URL } })
    if (!aj) throw new Error("R4C não encontrado no banco — rode: npm run db:seed")

    const todos = await listarTodosProcessos()
    logger.info({ total: todos.length }, "R4C: processos descobertos no site")

    let novos = 0, atualizados = 0, erros = 0, pdfsNovos = 0

    for (const proc of todos) {
      if (!proc.numeroProcesso) {
        logger.warn({ nome: proc.recuperandaRazaoSocial }, "R4C: sem CNJ — pulando")
        erros++
        continue
      }

      // Limit: só processar se houver quota de novos disponível
      if (novos >= batchSize) {
        logger.info({ batchSize }, "R4C: limite de batch atingido — parando")
        break
      }

      try {
        const existing = await prisma.processo.findUnique({
          where: { numeroProcesso: proc.numeroProcesso },
          select: { id: true },
        })

        const subtipo = calcularSubtipo(
          proc.tipo === "falencia" ? "falencia" : "RJ",
          proc.dataDeferimento
        )
        const prioridade = calcularPrioridade(proc.tipo, proc.dataDeferimento)

        if (existing) {
          // Atualizar campos mutáveis
          await prisma.processo.update({
            where: { id: existing.id },
            data: {
              recuperandaRazaoSocial: proc.recuperandaRazaoSocial,
              vara: proc.vara,
              comarca: proc.comarca,
              dataDeferimento: proc.dataDeferimento ?? undefined,
              dataDistribuicao: proc.dataDistribuicao ?? undefined,
              subtipo,
              prioridade,
              status: "scrapeado",
            },
          })
          atualizados++

          // Catalogar PDFs novos (existente → não rebaixar)
          const pdfNovosCount = await this.catalogarPdfs(existing.id, proc.pdfs)
          pdfsNovos += pdfNovosCount
          continue
        }

        // Processo NOVO — conta para o batch
        const criado = await prisma.processo.create({
          data: {
            ajId: aj.id,
            numeroProcesso: proc.numeroProcesso,
            tipo: proc.tipo === "falencia" ? "falencia" : "RJ",
            subtipo,
            prioridade,
            recuperandaRazaoSocial: proc.recuperandaRazaoSocial,
            nomeIncerto: proc.nomeIncerto,
            vara: proc.vara,
            comarca: proc.comarca,
            estado: proc.estado,
            dataDistribuicao: proc.dataDistribuicao,
            dataDeferimento: proc.dataDeferimento,
            urlPaginaAj: proc.urlPaginaAj,
            status: "scrapeado",
          },
        })

        logger.info(
          { id: criado.id, cnj: proc.numeroProcesso, nome: proc.recuperandaRazaoSocial?.substring(0, 50), prioridade },
          "R4C: processo novo"
        )
        novos++

        const pdfNovosCount = await this.catalogarPdfs(criado.id, proc.pdfs)
        pdfsNovos += pdfNovosCount

      } catch (err) {
        logger.error({ err: (err as Error).message, cnj: proc.numeroProcesso }, "R4C: erro ao salvar processo")
        erros++
      }
    }

    await prisma.administradorJudicial.update({
      where: { id: aj.id },
      data: { ultimaVarredura: new Date() },
    })

    logger.info({ novos, atualizados, erros, pdfsNovos }, "R4C: scraping concluído")
    return { novos, atualizados, erros, pdfsNovos }
  }

  private async catalogarPdfs(
    processoId: number,
    pdfs: Array<{ href: string; titulo: string; tipoDocumento: string; relevante: boolean }>
  ): Promise<number> {
    let count = 0
    for (const pdf of pdfs) {
      try {
        const existing = await prisma.documento.findUnique({ where: { urlPdf: pdf.href }, select: { id: true } })
        if (existing) continue

        await prisma.documento.create({
          data: {
            processoId,
            urlPdf: pdf.href,
            nomeArquivo: pdf.href.split("/").pop() ?? null,
            tipoDocumento: pdf.tipoDocumento,
            relevante: pdf.relevante,
            extraido: false,
            // Não baixa o PDF aqui — extração é job separado
          },
        })
        count++
      } catch (err) {
        logger.warn({ url: pdf.href, err: (err as Error).message }, "R4C: erro ao catalogar PDF")
      }
    }
    return count
  }
}

// CLI standalone
if (require.main === module) {
  const args = process.argv.slice(2)
  const limitArg = args.find((a) => a.startsWith("--limit="))
  const limit = limitArg ? parseInt(limitArg.split("=")[1]) : undefined

  new R4CScraper()
    .run({ limit })
    .then((r) => {
      logger.info(r, "scrape:r4c finalizado")
      process.exit(0)
    })
    .catch((e) => { logger.error(e); process.exit(1) })
    .finally(() => prisma.$disconnect())
}
