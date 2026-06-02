import axios from "axios"
import * as cheerio from "cheerio"
import { logger } from "../../lib/logger"

const BASE_URL = "https://psvar.com.br"
const UA = "Mozilla/5.0 (compatible; JalunCapital/1.0; +contato@jalun.com.br)"

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

const TRIBUNAL_ESTADO: Record<string, string> = {
  "01": "DF", "02": "AC", "03": "AL", "04": "AP", "05": "AM",
  "06": "BA", "07": "CE", "08": "ES", "09": "GO", "10": "MA",
  "11": "MT", "12": "MS", "13": "MG", "14": "PA", "15": "PB",
  "16": "PR", "17": "PE", "18": "PI", "19": "RJ", "20": "RN",
  "21": "RS", "22": "RO", "23": "RR", "24": "SC", "25": "SE",
  "26": "SP", "27": "TO",
}

function extrairEstado(cnj: string | null): string | null {
  if (!cnj) return null
  const m = cnj.match(/\d{7}-\d{2}\.\d{4}\.\d\.(\d{2})\.\d{4}/)
  return m ? (TRIBUNAL_ESTADO[m[1]] ?? null) : null
}

const CNJ_RE = /\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/

export interface ProcessoPsvar {
  recuperandaRazaoSocial: string
  numeroProcesso: string | null
  tipo: "RJ" | "RE" | "falencia"
  estado: string | null
  urlPaginaAj: string
  pdfs: Array<{ url: string; nomeArquivo: string; tipoDocumento: string | null; dataPublicacao: string | null }>
}

async function fetchHtml(url: string): Promise<string> {
  const { data } = await axios.get<string>(url, {
    headers: {
      "User-Agent": UA,
      "Accept": "text/html,application/xhtml+xml",
      "Accept-Language": "pt-BR,pt;q=0.9",
    },
    timeout: 30_000,
  })
  return data
}

function classificarTipoDocumento(header: string): string | null {
  const h = header.toLowerCase()
  if (h.includes("credor") || h.includes("quadro geral")) return "lista_credores"
  if (h.includes("edital")) return "edital_art_52"
  if (h.includes("plano")) return "plano_rj"
  if (h.includes("ata") || h.includes("assembleia")) return "ata_assembleia"
  if (h.includes("relatório") || h.includes("relatorio")) return "relatorio_aj"
  return null
}

async function rasparPaginaProcesso(url: string): Promise<Array<{ url: string; nomeArquivo: string; tipoDocumento: string | null; dataPublicacao: string | null }>> {
  const pdfs: Array<{ url: string; nomeArquivo: string; tipoDocumento: string | null; dataPublicacao: string | null }> = []
  try {
    const html = await fetchHtml(url)
    const $ = cheerio.load(html)

    // Cada seção de documentos tem um <thead> com o tipo e <tbody> com os links
    $("table").each((_, table) => {
      const headerText = $(table).find("thead th").first().text().trim()
      const tipoDoc = classificarTipoDocumento(headerText)

      $(table).find("tbody tr").each((_, row) => {
        const cells = $(row).find("td")
        const dataCell = cells.eq(1).text().trim()
        const linkEl = cells.eq(2).find("a")
        const href = linkEl.attr("href") ?? ""

        // Ignora links que redirecionam para login
        if (!href || href.includes("credor-faca") || href.includes("cadastro")) return

        const pdfUrl = href.startsWith("http") ? href : `${BASE_URL}${href}`
        const nomeArquivo = linkEl.text().trim() || headerText || "documento.pdf"

        pdfs.push({
          url:          pdfUrl,
          nomeArquivo,
          tipoDocumento: tipoDoc,
          dataPublicacao: dataCell || null,
        })
      })
    })
  } catch (err) {
    logger.warn({ url, err: (err as Error).message }, "PSVAR: falha ao raspar página de processo")
  }
  return pdfs
}

async function rasparPagina(pagina: number): Promise<ProcessoPsvar[]> {
  const url = pagina === 1
    ? `${BASE_URL}/recuperacao-judicial/`
    : `${BASE_URL}/recuperacao-judicial/page/${pagina}/`

  logger.info({ url }, "PSVAR: carregando lista")

  const html = await fetchHtml(url)
  const $ = cheerio.load(html)

  const processos: ProcessoPsvar[] = []

  $("table tr").each((_, row) => {
    const link = $(row).find("td[data-label='Empresa'] a, td a").first()
    if (!link.length) return

    const href = link.attr("href") ?? ""
    const texto = link.text().trim()
    if (!texto || !href.includes(BASE_URL)) return

    // Extrai nome e CNJ do texto (formato: "Nome – Processo nº XXXX")
    const cnjMatch = texto.match(CNJ_RE)
    const cnj = cnjMatch ? cnjMatch[0] : null

    let nome = texto.replace(/–?\s*Processo\s*n[oº°]?\s*[\d\-\.]+/i, "").replace(/–?\s*e-mail.*$/i, "").trim()
    if (!nome) return

    // Remove traços duplos e espaços extras
    nome = nome.replace(/\s*–\s*$/, "").replace(/\s{2,}/g, " ").trim()

    // Detecta tipo
    const textoLower = texto.toLowerCase()
    let tipo: "RJ" | "RE" | "falencia" = "RJ"
    if (textoLower.includes("extrajudicial")) tipo = "RE"
    else if (textoLower.includes("falência") || textoLower.includes("falencia")) tipo = "falencia"

    processos.push({
      recuperandaRazaoSocial: nome,
      numeroProcesso:         cnj,
      tipo,
      estado:                 extrairEstado(cnj),
      urlPaginaAj:            href,
      pdfs:                   [],
    })
  })

  return processos
}

export async function listarTodosProcessos(comDocumentos = false): Promise<ProcessoPsvar[]> {
  const todos: ProcessoPsvar[] = []
  let pagina = 1
  const MAX_PAGINAS = 10

  while (pagina <= MAX_PAGINAS) {
    try {
      const lista = await rasparPagina(pagina)
      if (lista.length === 0) break
      todos.push(...lista)
      logger.info({ pagina, qtd: lista.length }, "PSVAR: página carregada")
      pagina++
      if (pagina <= MAX_PAGINAS) await delay(1500)
    } catch (err) {
      const status = (err as { response?: { status?: number } }).response?.status
      if (status === 404) break // fim da paginação
      throw err
    }
  }

  logger.info({ total: todos.length }, "PSVAR: listagem concluída")

  // Busca documentos de cada processo (opcional, mais lento)
  if (comDocumentos) {
    for (const p of todos) {
      p.pdfs = await rasparPaginaProcesso(p.urlPaginaAj)
      await delay(1000)
    }
  }

  return todos
}
