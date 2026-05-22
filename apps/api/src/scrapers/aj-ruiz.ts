import type { ScraperAJ, ScraperResult } from "./tipos"
import { chromium } from "playwright"
import { createHash } from "crypto"
import { createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "fs"
import path from "path"
import https from "https"
import http from "http"
import { prisma } from "../lib/db"
import { logger } from "../lib/logger"

const BASE_URL = "https://www.ajruiz.com.br"
const PROCESSOS_URL = `${BASE_URL}/processos`

const TRIBUNAL_ESTADO: Record<string, string> = {
  "01": "DF", "02": "AC", "03": "AL", "04": "AP", "05": "AM",
  "06": "BA", "07": "CE", "08": "ES", "09": "GO", "10": "MA",
  "11": "MT", "12": "MS", "13": "MG", "14": "PA", "15": "PB",
  "16": "PR", "17": "PE", "18": "PI", "19": "RJ", "20": "RN",
  "21": "RS", "22": "RO", "23": "RR", "24": "SC", "25": "SE",
  "26": "SP", "27": "TO",
}

const TIPO_DOC_REGEXES: Array<{ regex: RegExp; tipo: string }> = [
  { regex: /art\.?\s*7(?:\D|$)/i,   tipo: "edital_art_7" },
  { regex: /art\.?\s*52(?:\D|$)/i,  tipo: "edital_art_52" },
  { regex: /art\.?\s*53(?:\D|$)/i,  tipo: "edital_art_53" },
  { regex: /art\.?\s*99(?:\D|$)/i,  tipo: "edital_art_99" },
  { regex: /relac[aã]o.*credores/i, tipo: "lista_credores" },
  { regex: /lista.*credores/i,      tipo: "lista_credores" },
  { regex: /plano.*recupera/i,      tipo: "plano_rj" },
]

const classificarDocumento = (texto: string): string => {
  for (const { regex, tipo } of TIPO_DOC_REGEXES) {
    if (regex.test(texto)) return tipo
  }
  return "outro"
}

const parseDateBR = (str: string): Date | null => {
  const m = str.match(/(\d{2})[./](\d{2})[./](\d{4})/)
  if (!m) return null
  const d = new Date(`${m[3]}-${m[2]}-${m[1]}T00:00:00.000Z`)
  return isNaN(d.getTime()) ? null : d
}

const extrairEstadoCNJ = (num: string): string | null => {
  const m = num.match(/\d{7}-\d{2}\.\d{4}\.\d\.(\d{2})\.\d{4}/)
  return m ? (TRIBUNAL_ESTADO[m[1]] ?? null) : null
}

const extrairCampo = (label: string, texto: string): string | null => {
  const m = texto.match(new RegExp(`${label}\\s*:?\\s*([^\\n]+)`, "i"))
  return m ? m[1].trim() : null
}

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
const randomDelay = () => delay(2000 + Math.random() * 3000)

const downloadPdf = (url: string, destPath: string): Promise<number> =>
  new Promise((resolve, reject) => {
    const proto = url.startsWith("https") ? https : http
    const file = createWriteStream(destPath)
    const req = proto.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; CredorRadar/1.0)",
        Referer: BASE_URL,
      },
    }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.destroy()
        const loc = res.headers.location!
        downloadPdf(loc.startsWith("http") ? loc : `${BASE_URL}${loc}`, destPath)
          .then(resolve).catch(reject)
        return
      }
      if (res.statusCode !== 200) {
        file.destroy()
        reject(new Error(`HTTP ${res.statusCode}`))
        return
      }
      let size = 0
      res.on("data", (c) => { size += (c as Buffer).length })
      res.pipe(file)
      file.on("finish", () => { file.close(); resolve(size) })
      file.on("error", reject)
    })
    req.on("error", reject)
    req.setTimeout(30000, () => { req.destroy(); reject(new Error("Timeout")) })
  })

interface ProcessoRaw {
  nome: string
  tipo: string
  textoCompleto: string
  pdfLinks: Array<{ href: string; texto: string }>
}

// Script que roda no contexto do browser — somente APIs DOM
// Usando string para evitar transformações do esbuild/tsx que injetam __name
const BROWSER_SCRIPT = `
(() => {
  const result = []
  const baseUrl = "${BASE_URL}"

  const rows = document.querySelectorAll(".views-row")
  const h2s = Array.from(document.querySelectorAll("h2"))

  rows.forEach(row => {
    // Determinar tipo pelo h2 anterior no documento
    let tipo = "RJ"
    for (let i = h2s.length - 1; i >= 0; i--) {
      const pos = h2s[i].compareDocumentPosition(row)
      if (pos & Node.DOCUMENT_POSITION_FOLLOWING) {
        const t = (h2s[i].textContent || "").toLowerCase()
        if (t.includes("extrajudicial")) { tipo = "extrajudicial"; break }
        if (t.includes("fal")) { tipo = "falencia"; break }
        tipo = "RJ"; break
      }
    }

    const headerEl = row.querySelector(".views-accordion-header .field-content")
    const nome = (headerEl ? headerEl.textContent : "").trim()

    const contentEl = row.querySelector(".ui-accordion-content") || row
    const textoCompleto = (contentEl.textContent || "").trim()

    const pdfLinks = []
    Array.from(contentEl.querySelectorAll("a")).forEach(a => {
      const href = a.getAttribute("href") || ""
      if (href.toLowerCase().includes(".pdf")) {
        pdfLinks.push({
          href: href.startsWith("http") ? href : (baseUrl + href),
          texto: (a.textContent || "").trim(),
        })
      }
    })

    if (nome || textoCompleto.length > 50) {
      result.push({ nome, tipo, textoCompleto, pdfLinks })
    }
  })
  return result
})()
`

const extrairProcessosDaPagina = async (storagePath: string): Promise<ProcessoRaw[]> => {
  const rawHtmlPath = path.join(storagePath, "ajruiz_processos.html")
  const browser = await chromium.launch({ headless: true })
  try {
    const ctx = await browser.newContext({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
    })
    const page = await ctx.newPage()
    logger.info("Navegando para AJ Ruiz processos")
    await page.goto(PROCESSOS_URL, { waitUntil: "networkidle", timeout: 45000 })

    if (!existsSync(rawHtmlPath)) {
      writeFileSync(rawHtmlPath, await page.content())
      logger.info({ path: rawHtmlPath }, "HTML bruto salvo")
    }

    // Usar evaluate com string para evitar injeção de __name pelo esbuild
    const processos = await page.evaluate(BROWSER_SCRIPT) as ProcessoRaw[]
    logger.info({ total: processos.length }, "Processos extraídos")
    return processos
  } finally {
    await browser.close()
  }
}

const parseProcesso = (raw: ProcessoRaw) => {
  const t = raw.textoCompleto
  const numM = t.match(/Processo\s*[n°.]*\s*:?\s*(\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})/i)
  const numeroProcesso = numM ? numM[1].trim() : null

  const juizoRaw = extrairCampo("Juízo", t) ?? extrairCampo("Vara", t)
  const comarcaM = juizoRaw?.match(/Comarca\s+de\s+([^/\n]+?)(?:\s*[-/]|$)/i)

  const distribStr = extrairCampo("Distribui(?:ção|cao)", t) ?? extrairCampo("Data do pedido", t)
  const defStr = t.match(/Deferimento[^\n:]*\s*:?\s*(\d{2}[./]\d{2}[./]\d{4})/i)?.[1] ?? null

  const emailM = t.match(/[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}/i)

  const recuperandaTexto =
    extrairCampo("Recuperanda(?:s)?(?:\\(s\\))?", t) ??
    extrairCampo("Requerente", t) ??
    extrairCampo("Nome", t) ??
    raw.nome

  return {
    numeroProcesso,
    recuperandaRazaoSocial: recuperandaTexto || raw.nome,
    vara: juizoRaw ?? null,
    comarca: comarcaM ? comarcaM[1].trim() : null,
    estado: numeroProcesso ? extrairEstadoCNJ(numeroProcesso) : null,
    dataDistribuicao: distribStr ? parseDateBR(distribStr) : null,
    dataDeferimento: defStr ? parseDateBR(defStr) : null,
    email: emailM ? emailM[0] : null,
  }
}

export class AjRuizScraper implements ScraperAJ {
  readonly urlBase = BASE_URL

  async run(): Promise<ScraperResult> {
    const aj = await prisma.administradorJudicial.findFirst({ where: { urlBase: BASE_URL } })
    if (!aj) throw new Error("AJ Ruiz não encontrado — rode: npm run db:seed")

    const storagePath = process.env["STORAGE_PATH"] ?? "./storage"
    mkdirSync(storagePath, { recursive: true })

    const processosRaw = await extrairProcessosDaPagina(storagePath)

    let novos = 0, atualizados = 0, erros = 0, pdfsNovos = 0

    for (const raw of processosRaw) {
      try {
        const parsed = parseProcesso(raw)
        if (!parsed.numeroProcesso) {
          logger.warn({ nome: raw.nome.substring(0, 60) }, "Sem número de processo — pulando")
          erros++
          continue
        }

        const existing = await prisma.processo.findUnique({ where: { numeroProcesso: parsed.numeroProcesso } })
        const processo = await prisma.processo.upsert({
          where: { numeroProcesso: parsed.numeroProcesso },
          create: {
            ajId: aj.id,
            numeroProcesso: parsed.numeroProcesso,
            tipo: raw.tipo,
            recuperandaRazaoSocial: parsed.recuperandaRazaoSocial,
            vara: parsed.vara,
            comarca: parsed.comarca,
            estado: parsed.estado,
            dataDistribuicao: parsed.dataDistribuicao,
            dataDeferimento: parsed.dataDeferimento,
            urlPaginaAj: PROCESSOS_URL,
            status: "scrapeado",
          },
          update: {
            recuperandaRazaoSocial: parsed.recuperandaRazaoSocial,
            vara: parsed.vara,
            dataDeferimento: parsed.dataDeferimento,
            status: "scrapeado",
          },
        })

        if (existing) atualizados++; else novos++

        const pdfDir = path.join(storagePath, "pdfs", String(processo.id))
        mkdirSync(pdfDir, { recursive: true })

        for (const pdf of raw.pdfLinks) {
          try {
            const exists = await prisma.documento.findUnique({ where: { urlPdf: pdf.href } })
            if (exists) continue

            const tipoDoc = classificarDocumento(pdf.texto)
            const tmpPath = path.join(pdfDir, `_tmp_${Date.now()}.pdf`)
            const tamanhoBytes = await downloadPdf(pdf.href, tmpPath)
            const hashArquivo = createHash("sha256").update(readFileSync(tmpPath)).digest("hex")
            const destPath = path.join(pdfDir, `${hashArquivo}.pdf`)
            renameSync(tmpPath, destPath)

            await prisma.documento.create({
              data: {
                processoId: processo.id,
                tipoDocumento: tipoDoc,
                nomeArquivo: path.basename(pdf.href),
                urlPdf: pdf.href,
                hashArquivo,
                caminhoLocal: destPath,
                tamanhoBytes,
                extraido: false,
              },
            })
            pdfsNovos++
            await randomDelay()
          } catch (pdfErr) {
            logger.error({ err: (pdfErr as Error).message, url: pdf.href }, "Erro ao baixar PDF")
          }
        }
      } catch (err) {
        logger.error({ err: (err as Error).message, nome: raw.nome?.substring(0, 60) }, "Erro ao processar")
        erros++
      }

      await randomDelay()
    }

    await prisma.administradorJudicial.update({
      where: { id: aj.id },
      data: { ultimaVarredura: new Date() },
    })

    logger.info({ novos, atualizados, erros, pdfsNovos }, "Scraping AJ Ruiz concluído")
    return { novos, atualizados, erros, pdfsNovos }
  }
}

export const scrapeAjRuiz = async (): Promise<void> => {
  const result = await new AjRuizScraper().run()
  logger.info(result, "scrapeAjRuiz finalizado")
}

if (require.main === module) {
  scrapeAjRuiz()
    .then(() => process.exit(0))
    .catch((e) => { console.error(e); process.exit(1) })
}
