import type { ScraperAJ, ScraperResult } from "../tipos"
import { listarTodosProcessos } from "./listar"
import { prisma } from "../../lib/db"
import { logger } from "../../lib/logger"
import { calcularSubtipo } from "../../lib/classificarCredor"
import { registrarAtividade } from "../../lib/atividades"

export const ONBEHALF_URL = "https://www.onbehalfbrasil.com.br"

function calcularPrioridade(tipo: "RJ" | "falencia", dataDeferimento: Date | null): string {
  if (tipo === "falencia") return "baixa"
  if (!dataDeferimento) return "media"
  const meses = (Date.now() - dataDeferimento.getTime()) / (1000 * 60 * 60 * 24 * 30.44)
  return meses <= 36 ? "alta" : "media"
}

export class OnBehalfScraper implements ScraperAJ {
  readonly urlBase = ONBEHALF_URL

  async run(): Promise<ScraperResult> {
    const aj = await prisma.administradorJudicial.findFirst({ where: { urlBase: ONBEHALF_URL } })
    if (!aj) throw new Error("OnBehalf não encontrado no banco — rode o seed ou insira manualmente")

    const todos = await listarTodosProcessos()
    logger.info({ total: todos.length }, "OnBehalf: processos descobertos no site")

    let novos = 0, atualizados = 0, erros = 0, pdfsNovos = 0

    for (const proc of todos) {
      if (!proc.numeroProcesso) {
        logger.warn({ nome: proc.recuperandaRazaoSocial }, "OnBehalf: sem CNJ — pulando")
        erros++
        continue
      }

      try {
        const existing = await prisma.processo.findUnique({
          where: { numeroProcesso: proc.numeroProcesso },
          select: { id: true },
        })

        const subtipo = calcularSubtipo(proc.tipo, null /* sem dataDeferimento da lista */)
        const prioridade = calcularPrioridade(proc.tipo, null)

        if (existing) {
          await prisma.processo.update({
            where: { id: existing.id },
            data: {
              recuperandaRazaoSocial: proc.recuperandaRazaoSocial,
              subtipo,
              prioridade,
              urlPaginaAj: proc.urlPaginaAj,
              status: "scrapeado",
            },
          })
          atualizados++
          pdfsNovos += await this.catalogarPdfs(existing.id, proc.pdfs)
          continue
        }

        // Novo processo
        const criado = await prisma.processo.create({
          data: {
            ajId: aj.id,
            numeroProcesso: proc.numeroProcesso,
            tipo: proc.tipo,
            subtipo,
            prioridade,
            recuperandaRazaoSocial: proc.recuperandaRazaoSocial,
            nomeIncerto: false,
            estado: proc.estado,
            urlPaginaAj: proc.urlPaginaAj,
            status: "scrapeado",
          },
        })

        logger.info(
          { id: criado.id, cnj: proc.numeroProcesso, nome: proc.recuperandaRazaoSocial?.substring(0, 50) },
          "OnBehalf: processo novo"
        )
        await registrarAtividade("processo_novo", {
          processoId: criado.id,
          metadata: { nome: proc.recuperandaRazaoSocial, estado: proc.estado, subtipo },
        })
        novos++
        pdfsNovos += await this.catalogarPdfs(criado.id, proc.pdfs)

      } catch (err) {
        logger.error({ err: (err as Error).message, cnj: proc.numeroProcesso }, "OnBehalf: erro ao salvar")
        erros++
      }
    }

    await prisma.administradorJudicial.update({
      where: { id: aj.id },
      data: { ultimaVarredura: new Date() },
    })

    logger.info({ novos, atualizados, erros, pdfsNovos }, "OnBehalf: scraping concluído")
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
            nomeArquivo: decodeURIComponent(pdf.href.split("/").pop() ?? "").substring(0, 200),
            tipoDocumento: pdf.tipoDocumento,
            relevante: pdf.relevante,
            extraido: false,
          },
        })
        count++
      } catch (err) {
        logger.warn({ url: pdf.href, err: (err as Error).message }, "OnBehalf: erro ao catalogar PDF")
      }
    }
    return count
  }
}

// CLI standalone: npx tsx src/scrapers/onbehalf/index.ts
if (require.main === module) {
  new OnBehalfScraper()
    .run()
    .then((r) => { logger.info(r, "scrape:onbehalf finalizado"); process.exit(0) })
    .catch((e) => { logger.error(e); process.exit(1) })
    .finally(() => prisma.$disconnect())
}
