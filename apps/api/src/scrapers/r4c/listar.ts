import { chromium } from "playwright"
import { logger } from "../../lib/logger"
import { classificarDocumento } from "./classificar"

const BASE_URL = "https://r4cempresarial.com.br"
const UA = "Mozilla/5.0 (compatible; CredorRadar/1.0; +contato@credorradar.com.br)"

const TRIBUNAL_ESTADO: Record<string, string> = {
  "01": "DF", "02": "AC", "03": "AL", "04": "AP", "05": "AM",
  "06": "BA", "07": "CE", "08": "ES", "09": "GO", "10": "MA",
  "11": "MT", "12": "MS", "13": "MG", "14": "PA", "15": "PB",
  "16": "PR", "17": "PE", "18": "PI", "19": "RJ", "20": "RN",
  "21": "RS", "22": "RO", "23": "RR", "24": "SC", "25": "SE",
  "26": "SP", "27": "TO",
}

export interface PdfInfo {
  href: string
  titulo: string
  secao: string
  tipoDocumento: string
  relevante: boolean
}

export interface ProcessoR4C {
  recuperandaRazaoSocial: string
  nomeIncerto: boolean
  tipo: "RJ" | "falencia"
  numeroProcesso: string | null
  vara: string | null
  comarca: string | null
  estado: string | null
  dataDistribuicao: Date | null
  dataDeferimento: Date | null
  urlPaginaAj: string
  pdfs: PdfInfo[]
}

function parseDateBR(str: string | undefined): Date | null {
  if (!str) return null
  const m = str.match(/(\d{2})[./](\d{2})[./](\d{4})/)
  if (!m) return null
  const d = new Date(`${m[3]}-${m[2]}-${m[1]}T12:00:00.000Z`)
  return isNaN(d.getTime()) ? null : d
}

function extrairEstado(cnj: string | null): string | null {
  if (!cnj) return null
  const m = cnj.match(/\d{7}-\d{2}\.\d{4}\.\d\.(\d{2})\.\d{4}/)
  return m ? (TRIBUNAL_ESTADO[m[1]] ?? null) : null
}

function extrairComarca(vara: string | null): string | null {
  if (!vara) return null
  const m = vara.match(/Comarca\s+de\s+([^/\n,–-]+)/i)
  return m ? m[1].trim() : null
  // TODO: enriquecer via tabela CNJ→cidade quando comarca não estiver na vara
}

function nomeDosPdfs(pdfs: PdfInfo[]): string {
  for (const p of pdfs) {
    const m = p.href.match(/\/([A-Z][A-Z0-9-]+)-\d+\./i)
    if (m) return m[1].replace(/-/g, " ").trim()
  }
  return "SEM NOME"
}

const BROWSER_SCRIPT = `
(function(tipo) {
  var cards = document.querySelectorAll('div.card.mb-1')
  return Array.from(cards).map(function(card) {
    var h3 = card.querySelector('h3.titulo-processo')
    var nome = (h3 && h3.textContent) ? h3.textContent.trim() : ''

    // dt/dd por label
    var dts = Array.from(card.querySelectorAll('dt'))
    var dds = Array.from(card.querySelectorAll('dd'))
    var campos = {}
    dts.forEach(function(dt, i) {
      var label = (dt.textContent || '').trim()
      var valor = (dds[i] && dds[i].textContent) ? dds[i].textContent.trim() : ''
      campos[label] = valor
    })

    // PDFs com seção
    var pdfs = []
    var secaoAtual = 'Documentos do Processo'
    var bodyEls = card.querySelectorAll('.card-body > *, .card-body .row > *, .card-body .col-md-8 > *')
    Array.from(card.querySelectorAll('.card-body *')).forEach(function(el) {
      if (el.tagName === 'H5') {
        secaoAtual = (el.textContent || '').trim()
      }
      if (el.tagName === 'A' && el.classList.contains('text-success')) {
        var href = el.getAttribute('href') || ''
        if (href.toLowerCase().includes('.pdf') || href.includes('wp-content/uploads')) {
          var titulo = (el.textContent || '').trim()
          pdfs.push({ href: href, titulo: titulo, secao: secaoAtual })
        }
      }
    })

    return { nome: nome, campos: campos, pdfs: pdfs, tipo: tipo }
  })
})
`

async function rasparIndice(
  page: import("playwright").Page,
  url: string,
  tipo: "RJ" | "falencia"
): Promise<ProcessoR4C[]> {
  logger.info({ url }, `Carregando índice R4C (${tipo})`)
  await page.goto(url, { waitUntil: "networkidle", timeout: 60000 })

  const rawCards = await page.evaluate(
    new Function("tipo", `return (${BROWSER_SCRIPT})(tipo)`) as (tipo: string) => Array<{
      nome: string
      campos: Record<string, string>
      pdfs: Array<{ href: string; titulo: string; secao: string }>
      tipo: string
    }>,
    tipo
  )

  logger.info({ count: rawCards.length, tipo }, "Cards extraídos")

  return rawCards.map((raw) => {
    const cnj = raw.campos["Número:"] || null
    const varaRaw = raw.campos["Vara:"] || null
    const dataPedido = raw.campos["Data do pedido:"]
    const dataDef = raw.campos["Data do deferimento / decretação:"]

    const pdfs: PdfInfo[] = raw.pdfs.map((p) => {
      const nome = p.href.split("/").pop() ?? ""
      const cls = classificarDocumento(nome, p.titulo)
      return { href: p.href, titulo: p.titulo, secao: p.secao, ...cls }
    })

    const nomeIncerto = !raw.nome
    const recuperandaRazaoSocial = raw.nome || nomeDosPdfs(pdfs)

    return {
      recuperandaRazaoSocial,
      nomeIncerto,
      tipo,
      numeroProcesso: cnj,
      vara: varaRaw,
      comarca: extrairComarca(varaRaw),
      estado: extrairEstado(cnj),
      dataDistribuicao: parseDateBR(dataPedido),
      dataDeferimento: parseDateBR(dataDef),
      urlPaginaAj: url,
      pdfs,
    }
  })
}

export async function listarTodosProcessos(): Promise<ProcessoR4C[]> {
  const browser = await chromium.launch({ headless: true })
  try {
    const ctx = await browser.newContext({ userAgent: UA })
    const page = await ctx.newPage()

    const rj = await rasparIndice(
      page,
      `${BASE_URL}/?tipo-de-processo=recuperacoes-judiciais`,
      "RJ"
    )

    // Delay educado entre os dois índices
    await new Promise((r) => setTimeout(r, 4000))

    const fal = await rasparIndice(
      page,
      `${BASE_URL}/?tipo-de-processo=falencias`,
      "falencia"
    )

    return [...rj, ...fal]
  } finally {
    await browser.close()
  }
}
