import Anthropic from "@anthropic-ai/sdk"
import { prisma } from "../lib/db"
import { logger } from "../lib/logger"

const anthropic = new Anthropic({ apiKey: process.env["ANTHROPIC_API_KEY"] })

const MODELO = "claude-sonnet-4-5"
const USD_POR_INPUT  = 3   / 1_000_000   // $3 / M tokens
const USD_POR_OUTPUT = 15  / 1_000_000   // $15 / M tokens
const BRL_POR_USD    = 5.70

const CLASSES_PT: Record<string, string> = {
  I_trabalhista:     "Classe I — Trabalhista",
  II_garantia_real:  "Classe II — Garantia Real",
  III_quirografario: "Classe III — Quirografário",
  IV_me_epp:         "Classe IV — ME/EPP",
  extraconcursal:    "Extraconcursal",
}

const PROMPT = `Você é analista quantitativo de mercado de crédito brasileiro.
Vai analisar um credor específico em processo de recuperação judicial, gerando análise informacional para investidor.

REGRAS CRÍTICAS:
- Use SEMPRE linguagem de análise quantitativa, NUNCA recomendação direta
- ❌ NUNCA escreva: "recomendamos comprar", "evite", "compre agora"
- ✅ SEMPRE escreva: "indicadores sugerem", "perfil característico", "análise quantitativa indica"
- Termine SEMPRE com perguntas que mantêm investidor no comando
- Disclaimer obrigatório no final

ESTRUTURA OBRIGATÓRIA (~250 palavras):

**{NOME}**
Crédito: R$ {VALOR} | {CLASSE} | Score {SCORE}

**PERFIL DO CREDOR**
[2-3 frases sobre quem é, ramo provável, porte estimado com base no nome/CNPJ/setor]

**CARACTERÍSTICAS DA OPERAÇÃO**
- Processo com {IDADE_MESES} meses desde deferimento
- Probabilidade modelada de aceitar cessão: {PROB_CESSAO}%
- Faixa de negociação típica: {FAIXA_MIN}%–{FAIXA_MAX}% do valor de face
- Preço-alvo calculado: R$ {PRECO_ALVO} ({PCT_FACE}% do face)
- Recuperação esperada: R$ {REC_ESPERADA}

**CONSIDERAÇÕES**
- [bullet sobre perfil de decisão do credor — PJ fornecedor vs banco vs cooperativa etc]
- [bullet sobre acessibilidade e canal sugerido de abordagem]
- [bullet sobre comportamento esperado baseado no tipo e porte]

**RISCOS**
- [risco específico 1 desta operação]
- [risco específico 2]
- [risco específico 3]

**PERGUNTAS PARA REFLEXÃO**
- [Pergunta sobre experiência prévia do investidor com esse tipo de credor]
- [Pergunta sobre capacidade financeira para esse ticket]
- [Pergunta sobre estratégia — compra isolada ou cesta?]

---
*Esta é análise informacional baseada em modelo quantitativo. Não constitui recomendação de investimento. Consulte especialista jurídico antes de operações de cessão.*`

function montarPrompt(dados: {
  nome: string
  documento: string | null
  tipoPessoa: string | null
  valor: string
  classe: string
  score: string | null
  precoAlvo: string | null
  recEsperada: string | null
  nomeEmpresa: string | null
  estado: string | null
  idadeMeses: number | null
  totalCredores: number
  totalCessivel: number
}): string {
  const v = parseFloat(dados.valor)
  const score = dados.score ? parseFloat(dados.score) : null
  const preco = dados.precoAlvo ? parseFloat(dados.precoAlvo) : null
  const rec = dados.recEsperada ? parseFloat(dados.recEsperada) : null
  const pctFace = preco ? Math.round((preco / v) * 100) : null
  const probCessao = score ? Math.min(95, Math.round(score * 100)) : null
  const faixaMin = score ? Math.max(5, Math.round((score * 0.6) * 100)) : null
  const faixaMax = score ? Math.min(80, Math.round((score * 1.1) * 100)) : null

  const fmt = (n: number | null) => n !== null
    ? n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "n/d"

  return PROMPT
    .replace("{NOME}", dados.nome)
    .replace("{VALOR}", fmt(v))
    .replace("{CLASSE}", CLASSES_PT[dados.classe] ?? dados.classe)
    .replace("{SCORE}", score !== null ? score.toFixed(2) : "n/d")
    .replace("{IDADE_MESES}", dados.idadeMeses !== null ? String(Math.round(dados.idadeMeses)) : "?")
    .replace("{PROB_CESSAO}", probCessao !== null ? String(probCessao) : "?")
    .replace("{FAIXA_MIN}", faixaMin !== null ? String(faixaMin) : "?")
    .replace("{FAIXA_MAX}", faixaMax !== null ? String(faixaMax) : "?")
    .replace("{PRECO_ALVO}", fmt(preco))
    .replace("{PCT_FACE}", pctFace !== null ? String(pctFace) : "?")
    .replace("{REC_ESPERADA}", fmt(rec))
    + `\n\nDADOS DO CREDOR:\nNome: ${dados.nome}\nDocumento: ${dados.documento ?? "não informado"}\nTipo: ${dados.tipoPessoa ?? "não informado"}\nValor: R$ ${fmt(v)}\nClasse: ${CLASSES_PT[dados.classe] ?? dados.classe}\nScore: ${score !== null ? score.toFixed(4) : "n/d"}\nPreço-alvo: R$ ${fmt(preco)}\nRecuperação esperada: R$ ${fmt(rec)}\n\nDADOS DO PROCESSO:\nRecuperanda: ${dados.nomeEmpresa ?? "n/d"}\nEstado: ${dados.estado ?? "n/d"}\nIdade: ${dados.idadeMeses !== null ? Math.round(dados.idadeMeses) + " meses" : "n/d"}\nTotal de credores: ${dados.totalCredores}\nPassivo cessível total: R$ ${fmt(dados.totalCessivel)}\n\nGere a análise:`
}

export async function gerarAnaliseCredor(
  credorId: number,
  opts: { forcar?: boolean; usuarioId?: number } = {}
): Promise<{ analise: string; cached: boolean; geradaEm: Date }> {
  const credor = await prisma.credor.findUnique({
    where: { id: credorId },
    include: {
      processo: {
        select: {
          id: true,
          recuperandaRazaoSocial: true,
          estado: true,
          dataDeferimento: true,
          credores: {
            where: { cessivel: true },
            select: { valor: true },
          },
          _count: { select: { credores: true } },
        },
      },
    },
  })
  if (!credor) throw new Error("Credor não encontrado")
  if (!credor.cessivel) throw new Error("Credor não é cessível")

  const CACHE_DIAS = 7
  if (!opts.forcar && credor.analiseDetalhada && credor.analisadoEm) {
    const dias = (Date.now() - credor.analisadoEm.getTime()) / 86_400_000
    if (dias < CACHE_DIAS) {
      return { analise: credor.analiseDetalhada, cached: true, geradaEm: credor.analisadoEm }
    }
  }

  const p = credor.processo
  const idadeMeses = p.dataDeferimento
    ? (Date.now() - p.dataDeferimento.getTime()) / (1000 * 60 * 60 * 24 * 30.44)
    : null
  const totalCessivel = p.credores.reduce((s, c) => s + parseFloat(c.valor.toString()), 0)

  const prompt = montarPrompt({
    nome: credor.nome,
    documento: credor.documento,
    tipoPessoa: credor.tipoPessoa,
    valor: credor.valor.toString(),
    classe: credor.classe,
    score: credor.score?.toString() ?? null,
    precoAlvo: credor.precoAlvoCompra?.toString() ?? null,
    recEsperada: credor.recuperacaoEsperada?.toString() ?? null,
    nomeEmpresa: p.recuperandaRazaoSocial,
    estado: p.estado,
    idadeMeses,
    totalCredores: p._count.credores,
    totalCessivel,
  })

  logger.info({ credorId, nome: credor.nome, modelo: MODELO }, "Gerando análise de credor")

  const msg = await anthropic.messages.create({
    model: MODELO,
    max_tokens: 1500,
    messages: [{ role: "user", content: prompt }],
  })

  const analise = (msg.content[0] as { type: string; text: string }).text.trim()
  const geradaEm = new Date()
  const custoUsd = msg.usage.input_tokens * USD_POR_INPUT + msg.usage.output_tokens * USD_POR_OUTPUT

  await Promise.all([
    prisma.credor.update({
      where: { id: credorId },
      data: {
        analiseDetalhada: analise,
        analisadoEm: geradaEm,
        analiseTokensInput: msg.usage.input_tokens,
        analiseTokensOutput: msg.usage.output_tokens,
        analiseModelo: MODELO,
      },
    }),
    prisma.custoIA.create({
      data: {
        tipo: "analise_credor",
        modelo: MODELO,
        tokensInput: msg.usage.input_tokens,
        tokensOutput: msg.usage.output_tokens,
        custoUsd,
        custoBrl: custoUsd * BRL_POR_USD,
        credorId,
        processoId: credor.processoId,
        usuarioId: opts.usuarioId ?? null,
      },
    }),
  ])

  logger.info({ credorId, tokensIn: msg.usage.input_tokens, tokensOut: msg.usage.output_tokens, custoUsd }, "Análise de credor salva")
  return { analise, cached: false, geradaEm }
}
