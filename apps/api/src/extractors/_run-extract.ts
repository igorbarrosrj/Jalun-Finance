import { prisma } from "../lib/db"
import { extrairTextoPdf } from "../lib/pdf"
import { extrairListaCredores } from "./claude"
import { logger } from "../lib/logger"
import { Decimal } from "@prisma/client/runtime/library"
import path from "path"

async function main() {
  // Pegar 2 lista_credores menores para teste
  const docs = await prisma.documento.findMany({
    where: {
      tipoDocumento: "lista_credores",
      extraido: false,
      caminhoLocal: { not: null },
    },
    orderBy: { tamanhoBytes: "asc" },
    take: 2,
    include: { processo: true },
  })

  logger.info({ total: docs.length }, "Documentos para extrair")

  for (const doc of docs) {
    const caminho = path.resolve(doc.caminhoLocal!)
    logger.info({
      docId: doc.id,
      arquivo: doc.nomeArquivo,
      tamanhoKB: Math.round((doc.tamanhoBytes ?? 0) / 1024),
      processo: doc.processo.numeroProcesso,
    }, "Extraindo com Claude...")

    try {
      const texto = await extrairTextoPdf(caminho)
      logger.info({ chars: texto.length }, "PDF lido")

      const contexto = `Processo ${doc.processo.numeroProcesso} — ${doc.processo.recuperandaRazaoSocial ?? ""}`
      const resultado = await extrairListaCredores(texto, contexto)

      if (!resultado.success || !resultado.data) {
        logger.warn({ docId: doc.id, erro: resultado.erro, tipo: resultado.tipoDetectado }, "Sem sucesso")
        await prisma.documento.update({
          where: { id: doc.id },
          data: { erroExtracao: resultado.erro ?? "Falhou" },
        })
        continue
      }

      const d = resultado.data
      const totalGeral = Object.values(d.totais_por_classe).reduce((a, b) => a + b, 0)

      logger.info({
        credores: d.credores.length,
        totalGeral,
        classes: d.totais_por_classe,
      }, "Dados extraídos — salvando no banco")

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
            moeda: c.moeda ?? "BRL",
            classe: c.classe,
            posicaoLista: c.posicao_lista,
          },
        })
      }

      await prisma.documento.update({
        where: { id: doc.id },
        data: { extraido: true, erroExtracao: null },
      })

      logger.info({ docId: doc.id, listaId: lista.id, credores: d.credores.length }, "✓ Extração concluída")

    } catch (err) {
      logger.error({ err: (err as Error).message, docId: doc.id }, "Erro")
      await prisma.documento.update({
        where: { id: doc.id },
        data: { erroExtracao: (err as Error).message },
      })
    }
  }

  await prisma.$disconnect()
}

main().catch(console.error)
