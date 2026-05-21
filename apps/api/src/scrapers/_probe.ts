import { chromium } from "playwright"
import { writeFileSync } from "fs"

async function main() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  })
  const page = await context.newPage()

  console.log("Acessando ajruiz.com.br/processos...")
  await page.goto("https://www.ajruiz.com.br/processos", {
    waitUntil: "networkidle",
    timeout: 30000,
  })

  const html = await page.content()
  writeFileSync("/tmp/ajruiz_snapshot.html", html)
  console.log("HTML salvo. Tamanho:", html.length, "chars")

  const resultado = await page.evaluate(() => {
    const cnjs = Array.from(document.querySelectorAll("*")).filter(el =>
      /\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/.test(el.textContent || "")
      && el.children.length < 5
    ).map(el => ({
      tag: el.tagName,
      cls: el.className,
      text: (el.textContent || "").substring(0, 200).trim(),
      parent: (el.parentElement?.tagName || "") + "." + (el.parentElement?.className || ""),
    })).slice(0, 5)

    const links = Array.from(document.querySelectorAll("a")).filter(a =>
      (a.href || "").toLowerCase().includes(".pdf")
    ).map(a => ({
      href: a.getAttribute("href"),
      text: (a.textContent || "").trim().substring(0, 100),
    })).slice(0, 10)

    return {
      heading: (document.querySelector("h1, h2, h3")?.textContent || "").trim(),
      cnjs,
      links,
      bodyPreview: document.body.innerHTML.substring(0, 3000),
    }
  })

  console.log("=== HEADING:", resultado.heading)
  console.log("=== CNJ nodes:", resultado.cnjs.length)
  for (const n of resultado.cnjs) {
    console.log("  tag:", n.tag, "class:", n.cls.substring(0, 60))
    console.log("  text:", n.text.substring(0, 150))
    console.log("  parent:", n.parent.substring(0, 80))
  }
  console.log("=== PDF links:", resultado.links.length)
  for (const l of resultado.links) {
    console.log("  -", l.text.substring(0, 80), "->", l.href)
  }
  console.log("=== BODY (primeiros 3000 chars):")
  console.log(resultado.bodyPreview)

  await browser.close()
}
main().catch(console.error)
