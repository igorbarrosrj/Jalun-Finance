import Anthropic from "@anthropic-ai/sdk"
import { z } from "zod"
import { jsonrepair } from "jsonrepair"
import { logger } from "../lib/logger"
import { chunkearTexto } from "../lib/pdf"

const client = new Anthropic({
  apiKey: process.env["ANTHROPIC_API_KEY"],
})

// ─── Zod schemas ─────────────────────────────────────────────────────────────

const RecuperandaSchema = z.object({
  tipo: z.enum(["PJ", "PF"]),
  razao_social_ou_nome: z.string(),
  cnpj_ou_cpf: z.string().nullable(),
})

const AdministradorSchema = z.object({
  razao_social: z.string().nullable(),
  cnpj: z.string().nullable(),
  email: z.string().nullable(),
  telefone: z.string().nullable(),
})

const CLASSES_VALIDAS = ["I_trabalhista", "II_garantia_real", "III_quirografario", "IV_me_epp", "extraconcursal"] as const

const CredorSchema = z.object({
  nome: z.string(),
  documento: z.string().nullable(),
  // Tolerante: valor pode vir como string do Claude, ou estar ausente em linhas de rodapé
  valor: z.union([z.number(), z.string().transform(Number)]).pipe(z.number()).optional().default(0),
  moeda: z.string().default("BRL"),
  // Tolerante: classe pode estar ausente em linhas incompletas
  classe: z.enum(CLASSES_VALIDAS).optional(),
  posicao_lista: z.number().optional().default(0),
})

// Credor válido = tem nome, valor > 0 e classe reconhecida
function credorValido(c: z.infer<typeof CredorSchema>): boolean {
  return !!c.nome?.trim() && (c.valor ?? 0) > 0 && CLASSES_VALIDAS.includes(c.classe as typeof CLASSES_VALIDAS[number])
}

const TotaisSchema = z.object({
  I: z.number().nullish().transform((v) => v ?? 0),
  II: z.number().nullish().transform((v) => v ?? 0),
  III: z.number().nullish().transform((v) => v ?? 0),
  IV: z.number().nullish().transform((v) => v ?? 0),
  extraconcursal: z.number().nullish().transform((v) => v ?? 0),
})

const ExtractionResultSchema = z.object({
  processo: z.object({
    numero: z.string().nullable(),
    tipo: z.enum(["RJ", "falencia", "extrajudicial"]).nullable(),
    vara: z.string().nullable(),
    comarca: z.string().nullable(),
    estado: z.string().nullable(),
    data_publicacao: z.string().nullable(),
  }),
  recuperandas: z.array(RecuperandaSchema),
  administrador_judicial: AdministradorSchema,
  credores: z.array(CredorSchema),
  // Opcional — recalculamos a partir dos credores se Claude truncar este campo
  totais_por_classe: TotaisSchema.optional(),
})

const ErroSchema = z.object({
  erro: z.string(),
  tipo_detectado: z.string().optional(),
})

type ExtractionResultRaw = z.infer<typeof ExtractionResultSchema>
export type ExtractionResult = Omit<ExtractionResultRaw, "totais_por_classe" | "credores"> & {
  credores: CredorExtraido[]
  totais_por_classe: { I: number; II: number; III: number; IV: number; extraconcursal: number }
}

function calcularTotais(credores: z.infer<typeof CredorSchema>[]): ExtractionResult["totais_por_classe"] {
  const t = { I: 0, II: 0, III: 0, IV: 0, extraconcursal: 0 }
  for (const c of credores) {
    const v = c.valor ?? 0
    if (c.classe === "I_trabalhista") t.I += v
    else if (c.classe === "II_garantia_real") t.II += v
    else if (c.classe === "III_quirografario") t.III += v
    else if (c.classe === "IV_me_epp") t.IV += v
    else if (c.classe === "extraconcursal") t.extraconcursal += v
  }
  return t
}

function normalizar(raw: ExtractionResultRaw): ExtractionResult {
  // Filtra credores incompletos (rodapé, totalizadores, linhas sem valor/classe)
  const credoresValidos = raw.credores.filter(credorValido) as unknown as CredorExtraido[]
  const descartados = raw.credores.length - credoresValidos.length
  if (descartados > 0) logger.warn({ descartados, total: raw.credores.length }, "Credores incompletos descartados")
  return {
    ...raw,
    credores: credoresValidos,
    totais_por_classe: raw.totais_por_classe ?? calcularTotais(credoresValidos),
  }
}
// Tipo para credores já validados (sempre têm valor, classe e posicao_lista)
export type CredorExtraido = Omit<z.infer<typeof CredorSchema>, "valor" | "classe" | "posicao_lista"> & {
  valor: number
  classe: typeof CLASSES_VALIDAS[number]
  posicao_lista: number
}

// ─── Prompt ──────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Você é um especialista em direito de insolvência brasileiro com profundo conhecimento em recuperações judiciais e extrajudiciais, falências e listas de credores.

Sua função é extrair informações estruturadas de documentos judiciais brasileiros e retornar APENAS JSON válido, sem nenhum texto adicional, sem markdown, sem comentários.

REGRAS CRÍTICAS:
1. Retorne SOMENTE JSON válido — sem explicações, sem \`\`\`json, sem comentários
2. Valores monetários em formato brasileiro (1.234,56 ou 1.234.567,89) devem ser convertidos para número decimal (1234.56 ou 1234567.89)
3. Se um campo não estiver claro no documento, use null — NUNCA invente dados
4. Documentos que NÃO sejam lista de credores devem retornar: {"erro": "tipo_documento_diferente", "tipo_detectado": "descreva o tipo"}
5. Classes de credores: I_trabalhista, II_garantia_real, III_quirografario, IV_me_epp, extraconcursal
6. CRÍTICO: o JSON deve estar 100% completo — feche todos os arrays e objetos antes de terminar
7. TOTALIZADORES NÃO SÃO CREDORES: Se uma linha representar TOTAL ou AGREGAÇÃO de uma classe (ex: "Classe I - Trabalhista", "Classe III - Quirografário", "Total Geral", "Subtotal", "Consolidado"), NÃO a inclua em credores[]. Use esses valores apenas para preencher totais_por_classe. Credores são exclusivamente pessoas físicas ou jurídicas individuais com nome próprio e CPF/CNPJ específico.`

const buildUserPrompt = (texto: string, contextoProcesso?: string): string => {
  const ctx = contextoProcesso ? `\n\nContexto do processo: ${contextoProcesso}` : ""
  return `Extraia as informações da lista de credores do documento abaixo e retorne no schema JSON especificado.${ctx}

SCHEMA ESPERADO:
{
  "processo": {
    "numero": "string | null",
    "tipo": "RJ | falencia | extrajudicial | null",
    "vara": "string | null",
    "comarca": "string | null",
    "estado": "string | null",
    "data_publicacao": "string ISO ou null"
  },
  "recuperandas": [{ "tipo": "PJ|PF", "razao_social_ou_nome": "string", "cnpj_ou_cpf": "string|null" }],
  "administrador_judicial": { "razao_social": "string|null", "cnpj": "string|null", "email": "string|null", "telefone": "string|null" },
  "credores": [
    {
      "nome": "string",
      "documento": "string|null",
      "valor": number,
      "moeda": "BRL",
      "classe": "I_trabalhista|II_garantia_real|III_quirografario|IV_me_epp|extraconcursal",
      "posicao_lista": number
    }
  ],
  "totais_por_classe": { "I": number, "II": number, "III": number, "IV": number, "extraconcursal": number }
}

TEXTO DO DOCUMENTO:
${texto}`
}

// ─── Rate limit config ────────────────────────────────────────────────────────

export const RATE_LIMIT = {
  DELAY_ENTRE_CHUNKS_MS: 8_000,   // 8s entre chunks do mesmo doc
  DELAY_ENTRE_DOCS_MS:   10_000,  // 10s entre documentos diferentes
  RETRY_BACKOFF_MS:      [30_000, 60_000, 120_000] as const, // 3 tentativas: 30s→60s→120s
}

// ─── Extração por chunk ───────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const extrairChunk = async (texto: string, contexto?: string, tentativa = 1): Promise<unknown> => {
  let message
  try {
    message = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 16000,
      temperature: 0,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserPrompt(texto, contexto) }],
    })
  } catch (err) {
    const msg = String(err)
    const is429 = msg.includes("429") || msg.includes("rate_limit")
    const is529 = msg.includes("529") || msg.includes("overloaded")
    if ((is429 || is529) && tentativa <= RATE_LIMIT.RETRY_BACKOFF_MS.length) {
      const espera = RATE_LIMIT.RETRY_BACKOFF_MS[tentativa - 1]
      logger.warn({ tentativa, espera: espera / 1000 }, `Rate limit — aguardando ${espera / 1000}s antes de retry`)
      await sleep(espera)
      return extrairChunk(texto, contexto, tentativa + 1)
    }
    throw err
  }

  const content = message!.content[0]
  if (content.type !== "text") throw new Error("Resposta inesperada do Claude")

  const raw = content.text.trim()

  // 1. parse direto
  try { return JSON.parse(raw) } catch { /* tenta reparar */ }

  // 2. extrair bloco JSON se Claude embrulhou em markdown
  const block = raw.match(/```(?:json)?\s*([\s\S]+?)\s*```/)
  if (block) {
    try { return JSON.parse(block[1]) } catch { /* segue */ }
  }

  // 3. jsonrepair — corrige truncamento e erros menores do LLM
  try {
    const repaired = jsonrepair(raw)
    logger.warn({ originalLen: raw.length, repairedLen: repaired.length }, "JSON reparado pelo jsonrepair")
    return JSON.parse(repaired)
  } catch { /* segue */ }

  // 4. extrair o primeiro objeto completo encontrado via regex
  const jsonMatch = raw.match(/\{[\s\S]+\}/)
  if (jsonMatch) {
    try {
      const repaired = jsonrepair(jsonMatch[0])
      return JSON.parse(repaired)
    } catch { /* segue */ }
  }

  throw new Error(`Claude retornou texto não-parsável: ${raw.substring(0, 300)}`)
}

// ─── Merge de chunks ─────────────────────────────────────────────────────────

const mergeResultados = (chunks: ExtractionResult[]): ExtractionResult => {
  const base = chunks[0]
  const todosCredores = chunks.flatMap((c) => c.credores)

  // Deduplicar por (nome + valor + classe) preservando maior posicao_lista
  const chaveMap = new Map<string, CredorExtraido>()
  for (const credor of todosCredores) {
    const chave = `${credor.nome.toLowerCase().trim()}|${credor.valor}|${credor.classe}`
    if (!chaveMap.has(chave)) chaveMap.set(chave, credor)
  }

  const credoresUnicos = Array.from(chaveMap.values())
  const totais: ExtractionResult["totais_por_classe"] = { I: 0, II: 0, III: 0, IV: 0, extraconcursal: 0 }

  for (const c of credoresUnicos) {
    const classeNum = (c.classe ?? "").split("_")[0]
    const v = c.valor ?? 0
    if (classeNum === "I") totais.I += v
    else if (classeNum === "II") totais.II += v
    else if (classeNum === "III") totais.III += v
    else if (classeNum === "IV") totais.IV += v
    else if (c.classe === "extraconcursal") totais.extraconcursal += v
  }

  return { ...base, credores: credoresUnicos, totais_por_classe: totais }
}

// ─── Interface pública ────────────────────────────────────────────────────────

export interface ExtractorResult {
  success: boolean
  data?: ExtractionResult
  erro?: string
  tipoDetectado?: string
}

export const extrairListaCredores = async (
  textoPdf: string,
  contextoProcesso?: string
): Promise<ExtractorResult> => {
  const chunks = chunkearTexto(textoPdf, 80_000)

  logger.info({ chunks: chunks.length, totalChars: textoPdf.length }, "Iniciando extração Claude")

  try {
    if (chunks.length === 1) {
      const raw = await extrairChunk(chunks[0], contextoProcesso)

      // Verificar se é erro (documento não é lista de credores)
      const erroCheck = ErroSchema.safeParse(raw)
      if (erroCheck.success) {
        logger.warn({ erro: erroCheck.data.erro, tipo: erroCheck.data.tipo_detectado }, "Documento não é lista de credores")
        return { success: false, erro: erroCheck.data.erro, tipoDetectado: erroCheck.data.tipo_detectado }
      }

      const parsed = ExtractionResultSchema.safeParse(raw)
      if (!parsed.success) {
        logger.error({ zodErrors: parsed.error.flatten() }, "Falha na validação Zod")
        return { success: false, erro: `Validação falhou: ${parsed.error.message}` }
      }

      const data = normalizar(parsed.data)
      if (data.credores.length === 0) {
        return { success: false, erro: "Nenhum credor válido extraído do documento" }
      }
      logger.info({ credores: data.credores.length }, "Extração concluída com sucesso")
      return { success: true, data }
    }

    // PDF grande: processar em chunks com delay para respeitar 8k output tokens/min
    const resultados: ExtractionResult[] = []
    for (let i = 0; i < chunks.length; i++) {
      if (i > 0) await sleep(RATE_LIMIT.DELAY_ENTRE_CHUNKS_MS)
      logger.info({ chunk: i + 1, total: chunks.length }, "Processando chunk")
      const raw = await extrairChunk(chunks[i], contextoProcesso)
      const parsed = ExtractionResultSchema.safeParse(raw)
      if (parsed.success) resultados.push(normalizar(parsed.data))
    }

    if (resultados.length === 0) return { success: false, erro: "Nenhum chunk retornou dados válidos" }

    const merged = mergeResultados(resultados)
    logger.info({ credores: merged.credores.length, chunks: chunks.length }, "Chunks mesclados")
    return { success: true, data: merged }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.error({ err: msg }, "Erro na extração Claude")
    return { success: false, erro: msg }
  }
}
