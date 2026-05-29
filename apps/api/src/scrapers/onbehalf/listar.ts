import { chromium } from "playwright"
import { logger } from "../../lib/logger"

const BASE_URL = "https://www.onbehalfbrasil.com.br"
const UA = "Mozilla/5.0 (compatible; CredorRadar/1.0; +contato@credorradar.com.br)"

const TRIBUNAL_ESTADO: Record<string, string> = {
  "01": "DF", "02": "AC", "03": "AL", "04": "AP", "05": "AM",
  "06": "BA", "07": "CE", "08": "ES", "09": "GO", "10": "MA",
  "11": "MT", "12": "MS", "13": "MG", "14": "PA", "15": "PB",
  "16": "PR", "17": "PE", "18": "PI", "19": "RJ", "20": "RN",
  "21": "RS", "22": "RO", "23": "RR", "24": "SC", "25": "SE",
  "26": "SP", "27": "TO",
}

export interface ProcessoOnBehalf {
  recuperandaRazaoSocial: string
  numeroProcesso: string | null
  tipo: "RJ" | "falencia"
  estado: string | null
  urlPaginaAj: string
  pdfs: never[] // páginas individuais são protegidas por senha
}

function extrairEstado(cnj: string | null): string | null {
  if (!cnj) return null
  const m = cnj.match(/\d{7}-\d{2}\.\d{4}\.\d\.(\d{2})\.\d{4}/)
  return m ? (TRIBUNAL_ESTADO[m[1]] ?? null) : null
}

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

const CNJ_RE = /\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/

// Slugs de navegação que não são processos
const NAV_SLUGS = new Set([
  "", "aonbehalf", "recuperacao-judicial", "recuperacao-extrajudicial",
  "falencia", "portal-adm-judicial", "contato", "empresa",
])

async function rasparLista(
  page: import("playwright").Page,
  url: string,
  tipo: "RJ" | "falencia"
): Promise<ProcessoOnBehalf[]> {
  logger.info({ url }, `OnBehalf: carregando lista ${tipo}`)
  await page.goto(url, { waitUntil: "load", timeout: 90_000 })

  // Aguarda os links de processo aparecerem no DOM
  await page.waitForFunction(
    (base: string) => document.querySelectorAll(`a[href^="${base}/"]`).length > 5,
    BASE_URL,
    { timeout: 30_000 }
  ).catch(() => {})
  await delay(2000)

  return page.evaluate(
    ({ baseUrl, navSlugs, cnjPattern, tipo }) => {
      const NAV = new Set(navSlugs)
      const CNJ = new RegExp(cnjPattern)
      const entries: Array<{
        recuperandaRazaoSocial: string
        numeroProcesso: string | null
        tipo: string
        estado: string | null
        urlPaginaAj: string
        pdfs: never[]
      }> = []
      const seen = new Set<string>()

      // Links de processo: absolute URL da OnBehalf, slug não é de navegação
      document.querySelectorAll("a[href]").forEach((el) => {
        const href = (el as HTMLAnchorElement).href ?? ""
        if (!href.startsWith(baseUrl + "/")) return

        const slug = href.slice(baseUrl.length + 1) // "inpower", "gpyrj", etc
        if (!slug || NAV.has(slug) || slug.includes("/") || slug.includes("?")) return
        if (seen.has(slug)) return
        seen.add(slug)

        const nome = (el.textContent ?? "").trim()
        if (!nome || nome.length < 2) return

        // CNJ: texto do link adjacente ao TJSP/eproc, ou no texto do pai
        let cnj: string | null = null
        const parent = el.parentElement
        if (parent) {
          // O texto CNJ fica no link irmão (próximo <a> com texto CNJ)
          parent.querySelectorAll("a").forEach((a) => {
            if (cnj) return
            const txt = (a.textContent ?? "").trim()
            if (CNJ.test(txt)) cnj = txt.match(CNJ)![0]
          })
          // Fallback: texto completo do pai
          if (!cnj) {
            const m = (parent.textContent ?? "").match(CNJ)
            if (m) cnj = m[0]
          }
        }
        // Busca mais ampla: avós
        if (!cnj) {
          let node: Element | null = el
          for (let i = 0; i < 5 && node; i++) {
            const txt = node.textContent ?? ""
            const m = txt.match(CNJ)
            if (m) { cnj = m[0]; break }
            node = node.parentElement
          }
        }

        entries.push({
          recuperandaRazaoSocial: nome,
          numeroProcesso: cnj,
          tipo,
          estado: null, // preenchido no Node.js
          urlPaginaAj: href,
          pdfs: [],
        })
      })

      return entries
    },
    {
      baseUrl: BASE_URL,
      navSlugs: [...NAV_SLUGS],
      cnjPattern: CNJ_RE.source,
      tipo,
    }
  ).then((entries) =>
    entries.map((e) => ({
      ...e,
      tipo: e.tipo as "RJ" | "falencia",
      estado: extrairEstado(e.numeroProcesso),
    }))
  )
}

export async function listarTodosProcessos(): Promise<ProcessoOnBehalf[]> {
  const browser = await chromium.launch({ headless: true })
  const results: ProcessoOnBehalf[] = []

  try {
    const ctx = await browser.newContext({ userAgent: UA })
    const page = await ctx.newPage()

    const rj = await rasparLista(page, `${BASE_URL}/recuperacao-judicial/`, "RJ")
    logger.info({ count: rj.length }, "OnBehalf: processos RJ")

    await delay(3000)

    const fal = await rasparLista(page, `${BASE_URL}/falencia/`, "falencia")
    logger.info({ count: fal.length }, "OnBehalf: processos falência")

    results.push(...rj, ...fal)
    logger.info({ total: results.length }, "OnBehalf: listagem concluída")
  } finally {
    await browser.close()
  }

  return results
}
