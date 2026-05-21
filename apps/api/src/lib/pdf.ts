import fs from 'fs'
import path from 'path'
import pdfParse from 'pdf-parse'
import { logger } from './logger'

export async function extrairTextoPdf(caminhoArquivo: string): Promise<string> {
  const absPath = path.resolve(caminhoArquivo)

  if (!fs.existsSync(absPath)) {
    throw new Error(`PDF nao encontrado: ${absPath}`)
  }

  const buffer = fs.readFileSync(absPath)
  const data = await pdfParse(buffer)

  logger.debug({ arquivo: absPath, paginas: data.numpages, chars: data.text.length }, 'PDF extraido')

  return data.text
}

// Divide texto grande em chunks de ~25k tokens (aprox. 100k chars)
export function chunkearTexto(texto: string, tamanhoChunk = 100_000): string[] {
  if (texto.length <= tamanhoChunk) return [texto]

  const chunks: string[] = []
  let inicio = 0

  while (inicio < texto.length) {
    let fim = inicio + tamanhoChunk

    // Quebra no final de linha mais próximo pra não cortar no meio de um registro
    if (fim < texto.length) {
      const quebraLinha = texto.lastIndexOf('\n', fim)
      if (quebraLinha > inicio) fim = quebraLinha
    }

    chunks.push(texto.slice(inicio, fim))
    inicio = fim
  }

  return chunks
}
