import { prisma } from "../../lib/db"
import { logger } from "../../lib/logger"
import { listarTodosProcessos } from "./listar"

const URL_BASE = "https://psvar.com.br"

const SUBTIPO: Record<string, string> = {
  RJ: "recuperacao_judicial_ativa",
  RE: "extrajudicial",
  falencia: "falencia_ativa",
}

export class PsvarScraper {
  readonly urlBase = URL_BASE

  async run(): Promise<{ novos: number; atualizados: number; erros: number; pdfsNovos: number }> {
    let novos = 0, atualizados = 0, erros = 0, pdfsNovos = 0

    // Garante que o AJ existe no banco
    let aj = await prisma.administradorJudicial.findFirst({ where: { urlBase: URL_BASE } })
    if (!aj) {
      aj = await prisma.administradorJudicial.create({
        data: {
          nome:     "PRESERVA-AÇÃO Administração Judicial",
          urlBase:  URL_BASE,
          urlIndice: `${URL_BASE}/recuperacao-judicial/`,
          ativo:    true,
        },
      })
      logger.info({ ajId: aj.id }, "PSVAR: AJ criado no banco")
    }

    const processos = await listarTodosProcessos(false) // documentos via re-scrape separado

    for (const p of processos) {
      try {
        const existente = p.numeroProcesso
          ? await prisma.processo.findUnique({ where: { numeroProcesso: p.numeroProcesso } })
          : await prisma.processo.findFirst({ where: { urlPaginaAj: p.urlPaginaAj } })

        const subtipo = SUBTIPO[p.tipo] ?? "recuperacao_judicial_ativa"

        if (existente) {
          // Atualiza se necessário
          if (existente.subtipo !== subtipo || existente.urlPaginaAj !== p.urlPaginaAj) {
            await prisma.processo.update({
              where: { id: existente.id },
              data: { subtipo, urlPaginaAj: p.urlPaginaAj, atualizadoEm: new Date() },
            })
          }

          // Adiciona novos documentos
          for (const pdf of p.pdfs) {
            const existe = await prisma.documento.findUnique({ where: { urlPdf: pdf.url } })
            if (!existe) {
              await prisma.documento.create({
                data: {
                  processoId:      existente.id,
                  urlPdf:          pdf.url,
                  nomeArquivo:     pdf.nomeArquivo,
                  tipoDocumento:   pdf.tipoDocumento,
                  dataPublicacao:  pdf.dataPublicacao ? new Date(pdf.dataPublicacao.split("/").reverse().join("-")) : null,
                  relevante:       !!pdf.tipoDocumento,
                },
              })
              pdfsNovos++
            }
          }
          atualizados++
        } else {
          // Cria processo novo
          const novoProcesso = await prisma.processo.create({
            data: {
              ajId:                   aj.id,
              numeroProcesso:         p.numeroProcesso ?? `psvar-${Date.now()}-${Math.random().toString(36).slice(2)}`,
              recuperandaRazaoSocial: p.recuperandaRazaoSocial,
              tipo:                   p.tipo === "RJ" ? "RJ" : p.tipo === "falencia" ? "falencia" : "extrajudicial",
              subtipo,
              estado:                 p.estado,
              urlPaginaAj:            p.urlPaginaAj,
              status:                 "novo",
            },
          })

          // Cria documentos
          for (const pdf of p.pdfs) {
            await prisma.documento.create({
              data: {
                processoId:    novoProcesso.id,
                urlPdf:        pdf.url,
                nomeArquivo:   pdf.nomeArquivo,
                tipoDocumento: pdf.tipoDocumento,
                dataPublicacao: pdf.dataPublicacao ? new Date(pdf.dataPublicacao.split("/").reverse().join("-")) : null,
                relevante:     !!pdf.tipoDocumento,
              },
            })
          }

          novos++
          logger.info({ nome: p.recuperandaRazaoSocial, cnj: p.numeroProcesso }, "PSVAR: processo novo")
        }
      } catch (err) {
        erros++
        logger.error({ nome: p.recuperandaRazaoSocial, err: (err as Error).message }, "PSVAR: erro ao salvar processo")
      }
    }

    await prisma.administradorJudicial.update({
      where: { id: aj.id },
      data: { ultimaVarredura: new Date() },
    })

    logger.info({ novos, atualizados, erros, pdfsNovos }, "PSVAR: scraping concluído")
    return { novos, atualizados, erros, pdfsNovos }
  }
}
