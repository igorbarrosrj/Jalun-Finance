import Anthropic from "@anthropic-ai/sdk"
import { prisma } from "../lib/db"
import { logger } from "../lib/logger"

const anthropic = new Anthropic({ apiKey: process.env["ANTHROPIC_API_KEY"] })

const MODELO = "claude-sonnet-4-5"
const USD_POR_INPUT  = 3   / 1_000_000
const USD_POR_OUTPUT = 15  / 1_000_000
const BRL_POR_USD    = 5.70
const CACHE_DIAS     = 3   // análise de processo: cache menor, muda mais

const PROMPT_SISTEMA = `Você é analista quantitativo sênior especializado em reestruturação de dívidas e recuperação judicial no Brasil.
Analisa portfolios de credores em processos de RJ para identificar oportunidades de cessão de crédito.

REGRAS CRÍTICAS:
- Use linguagem de análise de investimentos, NUNCA recomendações diretas
- ❌ NUNCA: "recomendamos comprar", "evite", "ótima oportunidade"
- ✅ SEMPRE: "indicadores sugerem", "análise quantitativa aponta", "perfil característico de"
- Disclaimer obrigatório ao final
- Seja direto e objetivo — o leitor é investidor profissional`

const PROMPT_TEMPLATE = `Analise este processo de recuperação judicial como oportunidade de investimento em cessão de créditos.

DADOS DO PROCESSO:
- Empresa: {EMPRESA}
- Estado: {ESTADO}
- AJ: {AJ}
- Processo nº: {NUMERO}
- Deferimento: {DATA_DEFERIMENTO} ({IDADE_MESES} meses)
- Total do passivo: R$ {PASSIVO_TOTAL}
- Credores totais: {QTD_CREDORES}
- Credores cessíveis: {QTD_CESSIVEL} ({PCT_CESSIVEL}% do total)
- Passivo cessível: R$ {PASSIVO_CESSIVEL}

COMPOSIÇÃO POR CLASSE:
{CLASSES}

TOP 5 CREDORES (por score):
{TOP_CREDORES}

DISTRIBUIÇÃO DE SCORES:
- Score médio: {SCORE_MEDIO}
- Credores score > 0.7: {QTD_ALTO_SCORE}
- Credores score > 0.5: {QTD_MED_SCORE}

Gere a análise EXATAMENTE neste formato markdown:

## {EMPRESA}
**Processo** {NUMERO} | **{ESTADO}** | {IDADE_MESES} meses

### Contexto do Processo
[2-3 frases sobre o porte da empresa, setor estimado, e contexto da RJ baseado no passivo e número de credores]

### Composição do Portfólio Cessível
[Análise da distribuição por classes — quais classes dominam, implicações para negociação, concentração de risco]

### Oportunidades Identificadas
- **Cesta de credores:** [análise quantitativa da cesta ideal — quantos, quais classes, ticket estimado]
- **Perfil de risco:** [volatilidade esperada na negociação, prazo típico de fechamento]
- **Assimetria de informação:** [análise sobre se credores provavelmente conhecem o valor dos créditos]

### Teses de Operação
1. **[Tese 1 — ex: Cesta Quirografária de Médio Porte]:** [descrição quantitativa da tese, ticket estimado, retorno esperado]
2. **[Tese 2 — ex: Trabalhistas PF com Score Alto]:** [descrição quantitativa]
3. **[Tese 3 — ex: ME/EPP com Urgência de Caixa]:** [descrição quantitativa]

### Fatores de Risco
- [Risco 1 específico ao processo/empresa]
- [Risco 2]
- [Risco 3]

### Indicadores-Chave
| Métrica | Valor |
|---------|-------|
| Ticket médio cessível | R$ {TICKET_MEDIO} |
| Score médio do portfólio | {SCORE_MEDIO} |
| Passivo cessível | R$ {PASSIVO_CESSIVEL} |
| Tempo no processo | {IDADE_MESES} meses |

---
*Análise informacional baseada em modelo quantitativo. Não constitui recomendação de investimento. Consulte assessoria jurídica especializada antes de operações de cessão.*`

interface DadosAnaliseProcesso {
  id: number
  empresa: string
  estado: string | null
  aj: string
  numero: string
  dataDeferimento: Date | null
  idadeMeses: number | null
  passivoTotal: number
  qtdCredores: number
  qtdCessivel: number
  passivoCessivel: number
  classesDist: Array<{ classe: string; qtd: number; total: number }>
  topCredores: Array<{ nome: string; valor: number; score: number | null; classe: string }>
  scoreMedio: number | null
  qtdAltoScore: number
  qtdMedScore: number
}

async function buscarDadosProcesso(processoId: number): Promise<DadosAnaliseProcesso> {
  const processo = await prisma.processo.findUnique({
    where: { id: processoId },
    include: {
      aj: { select: { nome: true } },
      credores: {
        select: {
          nome: true,
          valor: true,
          score: true,
          classe: true,
          cessivel: true,
        },
      },
    },
  })
  if (!processo) throw new Error("Processo não encontrado")

  const credores = processo.credores
  const cessíveis = credores.filter((c) => c.cessivel)

  const passivoTotal = credores.reduce((s, c) => s + parseFloat(c.valor.toString()), 0)
  const passivoCessivel = cessíveis.reduce((s, c) => s + parseFloat(c.valor.toString()), 0)

  // Distribuição por classe
  const classeMap = new Map<string, { qtd: number; total: number }>()
  cessíveis.forEach((c) => {
    const k = c.classe
    const cur = classeMap.get(k) ?? { qtd: 0, total: 0 }
    classeMap.set(k, { qtd: cur.qtd + 1, total: cur.total + parseFloat(c.valor.toString()) })
  })
  const classesDist = Array.from(classeMap.entries())
    .map(([classe, v]) => ({ classe, ...v }))
    .sort((a, b) => b.total - a.total)

  // Top 5 por score
  const topCredores = cessíveis
    .filter((c) => c.score !== null)
    .sort((a, b) => parseFloat((b.score ?? "0").toString()) - parseFloat((a.score ?? "0").toString()))
    .slice(0, 5)
    .map((c) => ({
      nome: c.nome,
      valor: parseFloat(c.valor.toString()),
      score: c.score ? parseFloat(c.score.toString()) : null,
      classe: c.classe,
    }))

  // Score stats
  const comScore = cessíveis.filter((c) => c.score !== null)
  const scoreMedio = comScore.length > 0
    ? comScore.reduce((s, c) => s + parseFloat((c.score ?? "0").toString()), 0) / comScore.length
    : null
  const qtdAltoScore = comScore.filter((c) => parseFloat((c.score ?? "0").toString()) > 0.7).length
  const qtdMedScore  = comScore.filter((c) => parseFloat((c.score ?? "0").toString()) > 0.5).length

  const idadeMeses = processo.dataDeferimento
    ? (Date.now() - processo.dataDeferimento.getTime()) / (1000 * 60 * 60 * 24 * 30.44)
    : null

  return {
    id: processo.id,
    empresa: processo.recuperandaRazaoSocial ?? "Empresa não identificada",
    estado: processo.estado,
    aj: processo.aj.nome,
    numero: processo.numeroProcesso,
    dataDeferimento: processo.dataDeferimento,
    idadeMeses,
    passivoTotal,
    qtdCredores: credores.length,
    qtdCessivel: cessíveis.length,
    passivoCessivel,
    classesDist,
    topCredores,
    scoreMedio,
    qtdAltoScore,
    qtdMedScore,
  }
}

const CLASSES_PT: Record<string, string> = {
  I_trabalhista:     "Classe I — Trabalhista",
  II_garantia_real:  "Classe II — Garantia Real",
  III_quirografario: "Classe III — Quirografário",
  IV_me_epp:         "Classe IV — ME/EPP",
  extraconcursal:    "Extraconcursal",
}

function montarPrompt(d: DadosAnaliseProcesso): string {
  const fmt = (n: number) =>
    n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const pctCessivel = d.qtdCredores > 0
    ? Math.round((d.qtdCessivel / d.qtdCredores) * 100)
    : 0

  const classesTxt = d.classesDist.map((c) =>
    `- ${CLASSES_PT[c.classe] ?? c.classe}: ${c.qtd} credores | R$ ${fmt(c.total)}`
  ).join("\n")

  const topTxt = d.topCredores.map((c, i) =>
    `${i + 1}. ${c.nome} — R$ ${fmt(c.valor)} | Score ${c.score?.toFixed(2) ?? "n/d"} | ${CLASSES_PT[c.classe] ?? c.classe}`
  ).join("\n")

  const ticketMedio = d.qtdCessivel > 0
    ? fmt(d.passivoCessivel / d.qtdCessivel)
    : "n/d"

  return (PROMPT_SISTEMA + "\n\n" + PROMPT_TEMPLATE)
    .replace(/{EMPRESA}/g, d.empresa)
    .replace("{ESTADO}", d.estado ?? "n/d")
    .replace("{AJ}", d.aj)
    .replace("{NUMERO}", d.numero)
    .replace("{DATA_DEFERIMENTO}", d.dataDeferimento
      ? d.dataDeferimento.toLocaleDateString("pt-BR")
      : "n/d")
    .replace(/{IDADE_MESES}/g, d.idadeMeses !== null ? String(Math.round(d.idadeMeses)) : "?")
    .replace("{PASSIVO_TOTAL}", fmt(d.passivoTotal))
    .replace("{QTD_CREDORES}", String(d.qtdCredores))
    .replace("{QTD_CESSIVEL}", String(d.qtdCessivel))
    .replace("{PCT_CESSIVEL}", String(pctCessivel))
    .replace(/{PASSIVO_CESSIVEL}/g, fmt(d.passivoCessivel))
    .replace("{CLASSES}", classesTxt)
    .replace("{TOP_CREDORES}", topTxt)
    .replace(/{SCORE_MEDIO}/g, d.scoreMedio !== null ? d.scoreMedio.toFixed(2) : "n/d")
    .replace("{QTD_ALTO_SCORE}", String(d.qtdAltoScore))
    .replace("{QTD_MED_SCORE}", String(d.qtdMedScore))
    .replace("{TICKET_MEDIO}", ticketMedio)
}

export async function gerarAnaliseProcesso(
  processoId: number,
  opts: { forcar?: boolean; usuarioId?: number } = {}
): Promise<{ analise: string; teses: string[]; cached: boolean; geradaEm: Date }> {
  const processo = await prisma.processo.findUnique({
    where: { id: processoId },
    select: {
      analiseProcessoIA: true,
      analiseProcessoGeradaEm: true,
      tesesOperacao: true,
    },
  })
  if (!processo) throw new Error("Processo não encontrado")

  if (!opts.forcar && processo.analiseProcessoIA && processo.analiseProcessoGeradaEm) {
    const dias = (Date.now() - processo.analiseProcessoGeradaEm.getTime()) / 86_400_000
    if (dias < CACHE_DIAS) {
      const teses = (processo.tesesOperacao as string[] | null) ?? []
      return { analise: processo.analiseProcessoIA, teses, cached: true, geradaEm: processo.analiseProcessoGeradaEm }
    }
  }

  const dados = await buscarDadosProcesso(processoId)
  const prompt = montarPrompt(dados)

  logger.info({ processoId, empresa: dados.empresa, modelo: MODELO }, "Gerando análise de processo")

  const msg = await anthropic.messages.create({
    model: MODELO,
    max_tokens: 2000,
    messages: [{ role: "user", content: prompt }],
  })

  const analise = (msg.content[0] as { type: string; text: string }).text.trim()
  const geradaEm = new Date()
  const custoUsd = msg.usage.input_tokens * USD_POR_INPUT + msg.usage.output_tokens * USD_POR_OUTPUT

  // Extrai teses do markdown gerado (linhas que começam com número + negrito)
  const teses = analise.match(/^\d+\.\s+\*\*([^*]+)\*\*/gm)
    ?.map((t) => t.replace(/^\d+\.\s+\*\*/, "").replace(/\*\*.*/, "").trim()) ?? []

  await Promise.all([
    prisma.processo.update({
      where: { id: processoId },
      data: {
        analiseProcessoIA: analise,
        analiseProcessoGeradaEm: geradaEm,
        tesesOperacao: teses,
      },
    }),
    prisma.custoIA.create({
      data: {
        tipo: "analise_processo",
        modelo: MODELO,
        tokensInput: msg.usage.input_tokens,
        tokensOutput: msg.usage.output_tokens,
        custoUsd,
        custoBrl: custoUsd * BRL_POR_USD,
        processoId,
        usuarioId: opts.usuarioId ?? null,
      },
    }),
  ])

  logger.info(
    { processoId, tokensIn: msg.usage.input_tokens, tokensOut: msg.usage.output_tokens, custoUsd },
    "Análise de processo salva"
  )
  return { analise, teses, cached: false, geradaEm }
}
