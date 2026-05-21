/**
 * Desenvolvimento: dispara todos os jobs imediatamente em sequência.
 * Uso: npm run dev:scheduler
 */
import { prisma } from "../lib/db"
import { scrapeAjRuiz } from "../scrapers/aj-ruiz"
import { extrairTextoPdf } from "../lib/pdf"
import { extrairListaCredores } from "../extractors/claude"
import { scorarTodosCredores } from "../scoring/v1"
import { logger } from "../lib/logger"
import { Decimal } from "@prisma/client/runtime/library"

async function main() {
  logger.info("=== DEV SCHEDULER: iniciando todos os jobs ===")

  // 1. Scrape
  logger.info("--- FASE 1: Scraping AJ Ruiz ---")
  await scrapeAjRuiz()

  // 2. Extrair documentos de lista_credores (máx 2 para economizar tokens)
  logger.info("--- FASE 2: Extração Claude (máx 2 docs) ---")
  const documentos = await prisma.documento.findMany({
    where: {
      extraido: false,
      tipoDocumento: "lista_credores",
      caminhoLocal: { not: null },
      erroExtracao: null,
    },
    take: 2,
    include: { processo: true },
  })

  logger.info({ total: documentos.length }, "Documentos lista_credores pendentes")

  for (const doc of documentos) {
    logger.info({ docId: doc.id, arquivo: doc.nomeArquivo }, "Extraindo...")
    try {
      const texto = await extrairTextoPdf(doc.caminhoLocal!)
      const contexto = doc.processo
        ? `Processo ${doc.processo.numeroProcesso}`
        : undefined
      const resultado = await extrairListaCredores(texto, contexto)

      if (resultado.success && resultado.data) {
        const d = resultado.data
        const totalGeral = Object.values(d.totais_por_classe).reduce((a, b) => a + b, 0)

        const lista = await prisma.listaCredores.create({
          data: {
            processoId: doc.processoId,
            documentoId: doc.id,
            totalClasse1: new Decimal(d.totais_por_classe.I),
            totalClasse2: new Decimal(d.totais_por_classe.II),
            totalClasse3: new Decimal(d.totais_por_classe.III),
            totalClasse4: new Decimal(d.totais_por_classe.IV),
            totalGeral: new Decimal(totalGeral),
            qtdCredores: d.credores.length,
            rawJson: d as object,
          },
        })

        for (const c of d.credores) {
          await prisma.credor.create({
            data: {
              listaId: lista.id,
              processoId: doc.processoId,
              nome: c.nome,
              documento: c.documento,
              valor: new Decimal(c.valor),
              moeda: c.moeda,
              classe: c.classe,
              posicaoLista: c.posicao_lista,
            },
          })
        }

        await prisma.documento.update({
          where: { id: doc.id },
          data: { extraido: true },
        })

        logger.info({ docId: doc.id, credores: d.credores.length }, "Extraído com sucesso")
      } else {
        await prisma.documento.update({
          where: { id: doc.id },
          data: { erroExtracao: resultado.erro },
        })
        logger.warn({ docId: doc.id, erro: resultado.erro }, "Extração sem sucesso")
      }
    } catch (err) {
      logger.error({ err: (err as Error).message, docId: doc.id }, "Erro na extração")
    }
  }

  // 3. Scoring
  logger.info("--- FASE 3: Scoring v1 ---")
  await scorarTodosCredores()

  logger.info("=== DEV SCHEDULER: concluído ===")
  await prisma.$disconnect()
}

main().catch((err) => {
  logger.error(err, "run-all falhou")
  process.exit(1)
})
