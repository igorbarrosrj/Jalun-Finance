/**
 * extract-pending: baixa PDFs relevantes e extrai credores via Claude.
 *
 * Flags:
 *   --ids=121,122,123   → filtra por IDs de processo
 *   --limit=N           → processa no máximo N documentos (default 10)
 *   --only-priority=alta|media|baixa → filtra por prioridade do processo
 */
import { prisma } from "../lib/db"
import { logger } from "../lib/logger"
import { baixarEHashear } from "../lib/download"
import { extrairTextoPdf } from "../lib/pdf"
import { extrairListaCredores } from "../extractors/claude"
import { ehCredorNaoCessivel } from "../scoring/filtros"
import { classificarTipoPessoa } from "../lib/classificarCredor"
import { scorarProcessoV2 } from "../scoring/v2"
import { Decimal } from "@prisma/client/runtime/library"
import path from "path"

const args = process.argv.slice(2)

function getFlag(name: string): string | undefined {
  const f = args.find((a) => a.startsWith(`--${name}=`))
  return f ? f.split("=")[1] : undefined
}

const idsRaw = getFlag("ids")
const limitArg = getFlag("limit")
const priorityFilter = getFlag("only-priority")

const processoIds = idsRaw ? idsRaw.split(",").map(Number).filter(Boolean) : undefined
const limit = limitArg ? parseInt(limitArg) : 10
const storagePath = process.env["STORAGE_PATH"] ?? "./storage"

async function run() {
  const where = {
    relevante: true,
    extraido: false,
    ...(processoIds ? { processoId: { in: processoIds } } : {}),
    ...(priorityFilter ? { processo: { prioridade: priorityFilter } } : {}),
  }

  const documentos = await prisma.documento.findMany({
    where,
    include: { processo: { select: { id: true, numeroProcesso: true, recuperandaRazaoSocial: true, prioridade: true } } },
    orderBy: [
      { processo: { prioridade: "asc" } }, // 'alta' < 'baixa' < 'media' alfabeticamente, compensamos abaixo
      { id: "asc" },
    ],
    take: limit,
  })

  // Reordenar: alta → media → baixa
  const ORDEM: Record<string, number> = { alta: 0, media: 1, baixa: 2 }
  documentos.sort((a, b) => {
    const pa = ORDEM[a.processo.prioridade ?? "baixa"] ?? 9
    const pb = ORDEM[b.processo.prioridade ?? "baixa"] ?? 9
    return pa - pb
  })

  logger.info({ total: documentos.length, limit, processoIds, priorityFilter }, "extract-pending: documentos a processar")

  const processosAffetados = new Set<number>()
  let extraidos = 0, erros = 0

  for (const doc of documentos) {
    const proc = doc.processo
    logger.info(
      { docId: doc.id, cnj: proc.numeroProcesso, tipo: doc.tipoDocumento, prioridade: proc.prioridade },
      "Processando documento"
    )

    try {
      // 1) Download do PDF (pula se já baixado)
      let caminhoLocal = doc.caminhoLocal
      if (!caminhoLocal) {
        const pdfDir = path.join(storagePath, "pdfs", String(proc.id))
        const res = await baixarEHashear(doc.urlPdf, pdfDir)
        caminhoLocal = res.caminhoLocal
        await prisma.documento.update({
          where: { id: doc.id },
          data: { caminhoLocal, hashArquivo: res.hashArquivo, tamanhoBytes: res.tamanhoBytes },
        })
      }

      // 2) Extração de texto
      const texto = await extrairTextoPdf(caminhoLocal)
      const contexto = `Processo ${proc.numeroProcesso} — ${proc.recuperandaRazaoSocial ?? ""}`
      const resultado = await extrairListaCredores(texto, contexto)

      if (!resultado.success || !resultado.data) {
        await prisma.documento.update({
          where: { id: doc.id },
          data: { extraido: false, erroExtracao: resultado.erro ?? "Extração falhou" },
        })
        logger.warn({ docId: doc.id, erro: resultado.erro }, "Extração sem sucesso")
        erros++
        continue
      }

      const data = resultado.data
      const totalGeral = Object.values(data.totais_por_classe).reduce((a, b) => a + b, 0)

      // 3) Salvar lista + credores
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

        await prisma.credor.create({
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
      }

      const qualidadeBaixa =
        data.credores.length > 0 && naoCessiveisCount / data.credores.length > 0.8

      await prisma.listaCredores.update({ where: { id: lista.id }, data: { qualidadeBaixa } })
      await prisma.documento.update({ where: { id: doc.id }, data: { extraido: true, erroExtracao: null } })
      await prisma.processo.update({ where: { id: proc.id }, data: { status: "extraido" } })

      logger.info(
        { docId: doc.id, credores: data.credores.length, naoCessiveis: naoCessiveisCount, qualidadeBaixa },
        "Extração concluída"
      )
      extraidos++
      processosAffetados.add(proc.id)

      // Delay entre chamadas Claude
      await new Promise((r) => setTimeout(r, 2000))

    } catch (err) {
      logger.error({ docId: doc.id, err: (err as Error).message }, "Erro ao processar documento")
      await prisma.documento.update({
        where: { id: doc.id },
        data: { erroExtracao: (err as Error).message },
      }).catch(() => {})
      erros++
    }
  }

  // 4) Scoring v2 nos processos afetados
  if (processosAffetados.size > 0) {
    logger.info({ processos: [...processosAffetados] }, "Aplicando scoring v2")
    for (const pid of processosAffetados) {
      await scorarProcessoV2(pid).catch((e) =>
        logger.warn({ pid, err: (e as Error).message }, "Erro no scoring")
      )
    }
  }

  logger.info({ extraidos, erros, processosAffetados: processosAffetados.size }, "extract-pending finalizado")
}

run()
  .catch((e) => { logger.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
