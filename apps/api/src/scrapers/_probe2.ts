import { chromium } from "playwright"
import { writeFileSync } from "fs"

async function main() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
  })
  const page = await context.newPage()
  await page.goto("https://www.ajruiz.com.br/processos", { waitUntil: "networkidle", timeout: 30000 })

  const info = await page.evaluate(() => {
    // Encontrar os containers de processo
    const views = document.querySelector(".views-element-container, .view-content, [class*=processos]")
    const viewsHtml = views ? views.innerHTML.substring(0, 8000) : "nao encontrado"

    // CNJ pattern direto no texto
    const cnjRegex = /\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/g
    const bodyText = document.body.innerText
    const cnjs = [...bodyText.matchAll(cnjRegex)].map(m => m[0])

    // Todos os paragrafos e divs com conteudo relevante
    const paragrafos = Array.from(document.querySelectorAll("p, h2, h3, h4, li"))
      .filter(el => {
        const t = el.textContent || ""
        return /\d{7}-\d{2}/.test(t) || /recuper/i.test(t) || /distribuicao|deferimento|vara|juizo/i.test(t)
      })
      .map(el => el.tagName + ": " + (el.textContent || "").trim().substring(0, 200))
      .slice(0, 30)

    // Articles, sections, ou divs que parecem cards de processo
    const cards = Array.from(document.querySelectorAll("article, .views-row, [class*=processo], [class*=item-list]"))
      .map(el => ({
        tag: el.tagName,
        cls: el.className.substring(0, 80),
        html: el.innerHTML.substring(0, 1000),
      }))
      .slice(0, 3)

    return { cnjs: [...new Set(cnjs)], paragrafos, cards, viewsHtml }
  })

  console.log("=== CNJ numbers encontrados:", info.cnjs.length)
  info.cnjs.forEach(n => console.log(" -", n))

  console.log("\n=== Paragrafos relevantes:")
  info.paragrafos.forEach(p => console.log(" ", p.substring(0, 200)))

  console.log("\n=== Cards de processo:", info.cards.length)
  info.cards.forEach((c, i) => {
    console.log(`\n--- Card ${i}: <${c.tag} class="${c.cls}">`)
    console.log(c.html.substring(0, 800))
  })

  console.log("\n=== Views container (8000 chars):")
  console.log(info.viewsHtml.substring(0, 5000))

  await browser.close()
}
main().catch(console.error)
