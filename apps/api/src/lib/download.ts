import { createHash } from "crypto"
import { createWriteStream, mkdirSync, readFileSync, renameSync } from "fs"
import https from "https"
import http from "http"
import path from "path"

const UA = "Mozilla/5.0 (compatible; CredorRadar/1.0; +contato@credorradar.com.br)"

export function downloadPdf(url: string, destPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith("https") ? https : http
    const file = createWriteStream(destPath)
    const req = proto.get(url, { headers: { "User-Agent": UA } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.destroy()
        const loc = res.headers.location!
        const next = loc.startsWith("http") ? loc : new URL(loc, url).href
        downloadPdf(next, destPath).then(resolve).catch(reject)
        return
      }
      if (res.statusCode !== 200) {
        file.destroy()
        reject(new Error(`HTTP ${res.statusCode} — ${url}`))
        return
      }
      let size = 0
      res.on("data", (c: Buffer) => { size += c.length })
      res.pipe(file)
      file.on("finish", () => { file.close(); resolve(size) })
      file.on("error", reject)
    })
    req.on("error", reject)
    req.setTimeout(60000, () => { req.destroy(); reject(new Error(`Timeout: ${url}`)) })
  })
}

export async function baixarEHashear(
  url: string,
  pdfDir: string
): Promise<{ caminhoLocal: string; hashArquivo: string; tamanhoBytes: number }> {
  mkdirSync(pdfDir, { recursive: true })
  const tmpPath = path.join(pdfDir, `_tmp_${Date.now()}_${Math.random().toString(36).slice(2)}.pdf`)
  const tamanhoBytes = await downloadPdf(url, tmpPath)
  const hashArquivo = createHash("sha256").update(readFileSync(tmpPath)).digest("hex")
  const caminhoLocal = path.join(pdfDir, `${hashArquivo}.pdf`)
  renameSync(tmpPath, caminhoLocal)
  return { caminhoLocal, hashArquivo, tamanhoBytes }
}
