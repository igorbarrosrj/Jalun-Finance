import { Job } from "bullmq"
import { prisma } from "../lib/db"
import { logger } from "../lib/logger"
import { baixarEHashear } from "../lib/download"
import { extrairTextoPdf } from "../lib/pdf"
import { extrairListaCredores, RATE_LIMIT } from "../extractors/claude"
import { ehCredorNaoCessivel } from "../scoring/filtros"
import { classificarTipoPessoa } from "../lib/classificarCredor"
import { scorarProcessoV2 } from "../scoring/v2"
import { registrarAtividade } from "../lib/atividades"
import { Decimal } from "@prisma/client/runtime/library"
import path from "path"

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const STORAGE_PATH = process.env["STORAGE_PATH"] ?? "./storage"

const TIPOS_RELEVANTES = ["lista_credores", "edital_art_7", "edital_art_52", "plano_rj", "quadro_geral"]

export const extracaoPrioritariaJobHandler = async (
  job: Job<{ solicitacaoId: number }>
): Promise<void> => {
  const { solicitacaoId } = job.data

  const solicitacao = await prisma.solicitacaoExtracao.findUnique({
    where: { id: solicitacaoId },
    include: { processo: true, usuario: { select: { id: true, email: true } } },
  })
  if (!solicitacao) throw new Error(`Solicitação ${solicitacaoId} não encontrada`)

  await prisma.solicitacaoExtracao.update({
    where: { id: solicitacaoId },
    data: { status: "processando", iniciadoEm: new Date() },
  })

  const proc = solicitacao.processo

  try {
    const documentos = await prisma.documento.findMany({
      where: {
        processoId: proc.id,
        relevante: true,
        extraido: false,
        tipoDocumento: { in: TIPOS_RELEVANTES },
      },
    })

    if (documentos.length === 0) {
      // Todos já extraídos — conclui sem erro
      await prisma.solicitacaoExtracao.update({
        where: { id: solicitacaoId },
        data: { status: "concluida", concluidoEm: new Date() },
      })
      await scorarProcessoV2(proc.id)
      return
    }

    logger.info({ solicitacaoId, processoId: proc.id, docs: documentos.length }, "Extração prioritária iniciada")

    let extraidos = 0
    for (let i = 0; i < documentos.length; i++) {
      const doc = documentos[i]
      if (i > 0) await sleep(RATE_LIMIT.DELAY_ENTRE_DOCS_MS)

      // Download se necessário
      let caminhoLocal = doc.caminhoLocal
      if (!caminhoLocal) {
        const pdfDir = path.join(STORAGE_PATH, "pdfs", String(proc.id))
        const res = await baixarEHashear(doc.urlPdf, pdfDir)
        caminhoLocal = res.caminhoLocal
        await prisma.documento.update({
          where: { id: doc.id },
          data: { caminhoLocal, hashArquivo: res.hashArquivo, tamanhoBytes: res.tamanhoBytes },
        })
      }

      const texto = await extrairTextoPdf(caminhoLocal)
      const contexto = `Processo ${proc.numeroProcesso} — ${proc.recuperandaRazaoSocial ?? ""}`
      const resultado = await extrairListaCredores(texto, contexto)

      if (!resultado.success || !resultado.data) {
        await prisma.documento.update({
          where: { id: doc.id },
          data: { erroExtracao: resultado.erro ?? "Extração falhou" },
        })
        logger.warn({ docId: doc.id, erro: resultado.erro }, "Chunk falhou — continuando")
        continue
      }

      const data = resultado.data
      const totalGeral = Object.values(data.totais_por_classe).reduce((a, b) => a + b, 0)

      const lista = await prisma.listaCredores.create({
        data: {
          processoId: proc.id,
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
        const filtro = ehCredorNaoCessivel(c.nome, c.valor)
        const tipoPessoa = classificarTipoPessoa(c.nome, c.documento ?? null)
        const criado = await prisma.credor.create({
          data: {
            listaId: lista.id,
            processoId: proc.id,
            nome: c.nome,
            documento: c.documento,
            valor: new Decimal(c.valor),
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
        else if (c.valor >= 30_000) {
          await registrarAtividade("credor_novo", {
            processoId: proc.id,
            credorId: criado.id,
            metadata: { nome: c.nome, valor: c.valor, classe: c.classe },
          })
        }
      }

      const qualidadeBaixa = data.credores.length > 0 && naoCessiveisCount / data.credores.length > 0.8
      await prisma.listaCredores.update({ where: { id: lista.id }, data: { qualidadeBaixa } })
      await prisma.documento.update({ where: { id: doc.id }, data: { extraido: true, erroExtracao: null } })

      if (doc.tipoDocumento === "plano_rj") {
        await registrarAtividade("plano_atualizado", {
          processoId: proc.id,
          metadata: { processo: proc.numeroProcesso, nome: proc.recuperandaRazaoSocial },
        })
      } else {
        await registrarAtividade("lista_atualizada", {
          processoId: proc.id,
          metadata: { credores: data.credores.length },
        })
      }

      extraidos++
    }

    await prisma.processo.update({ where: { id: proc.id }, data: { status: "extraido" } })
    await scorarProcessoV2(proc.id)

    await prisma.solicitacaoExtracao.update({
      where: { id: solicitacaoId },
      data: { status: "concluida", concluidoEm: new Date() },
    })

    logger.info({ solicitacaoId, processoId: proc.id, extraidos }, "Extração prioritária concluída")
  } catch (err) {
    const msg = (err as Error).message
    logger.error({ solicitacaoId, err: msg }, "Extração prioritária falhou — devolvendo crédito")

    await prisma.solicitacaoExtracao.update({
      where: { id: solicitacaoId },
      data: { status: "erro", erroMensagem: msg },
    })

    // Devolução de crédito
    await prisma.$transaction([
      prisma.creditoUsuario.update({
        where: { usuarioId: solicitacao.usuarioId },
        data: { saldo: { increment: solicitacao.creditosConsumidos } },
      }),
      prisma.transacaoCredito.create({
        data: {
          usuarioId: solicitacao.usuarioId,
          tipo: "devolucao_erro",
          quantidade: solicitacao.creditosConsumidos,
          descricao: `Devolução por erro na análise do processo ${proc.numeroProcesso}`,
          processoId: proc.id,
        },
      }),
    ])

    throw err
  }
}
