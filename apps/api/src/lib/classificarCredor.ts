const BANCOS = [
  "BANCO", "CAIXA ECONÔMICA", "CAIXA ECONOMICA", "SANTANDER", "BRADESCO",
  "ITAÚ", "ITAU", "SICOOB", "SICREDI", "NUBANK", "INTER ", "C6 BANK",
  "BTG", "XP INVESTIMENTOS", "SAFRA", "VOTORANTIM", "PINE", "DAYCOVAL",
  "MERCANTIL", "BANRISUL", "BRB ", "BANCO DO BRASIL", "CAIXA FEDERAL",
]

const FUNDOS = [
  "FUNDO DE INVESTIMENTO", "FIDC", "SECURITIZADORA", "FII ", "FIP ",
  "FUNDO IMOBILIÁRIO", "FUNDO IMOBILIARIO", "GESTORA", "ASSET",
  "FUNDO MULTIMERCADO", "FUNDO DE RENDA", "FUNDO DE CRÉDITO", "FUNDO DE CREDITO",
]

const COOPERATIVAS = [
  "COOPERATIVA", "COOPERVERDE", "SICOOB", "SICREDI", "UNICRED",
  "CRESOL", "OCDE", "COOP", "COOPAVEL",
]

const FAZENDA_PUBLICA = [
  "UNIÃO", "FAZENDA NACIONAL", "FAZENDA ESTADUAL", "FAZENDA MUNICIPAL",
  "MUNICÍPIO DE", "MUNICIPIO DE", "ESTADO DE", "PGFN", "PROCURADORIA",
  "RECEITA FEDERAL", "INSS", "PREVIDÊNCIA", "PREVIDENCIA",
]

function nomeContem(nome: string, lista: string[]): boolean {
  const n = nome.toUpperCase()
  return lista.some((t) => n.includes(t))
}

function isCnpj(doc: string): boolean {
  return /^\d{14}$/.test(doc.replace(/\D/g, ""))
}

function isCpf(doc: string): boolean {
  return /^\d{11}$/.test(doc.replace(/\D/g, ""))
}

export type TipoPessoaClassificado =
  | "fazenda_publica"
  | "banco"
  | "fundo"
  | "cooperativa"
  | "PJ"
  | "PF"
  | "desconhecido"

export function classificarTipoPessoa(
  nome: string,
  documento: string | null
): TipoPessoaClassificado {
  if (nomeContem(nome, FAZENDA_PUBLICA)) return "fazenda_publica"
  if (nomeContem(nome, FUNDOS)) return "fundo"
  if (nomeContem(nome, BANCOS)) return "banco"
  if (nomeContem(nome, COOPERATIVAS)) return "cooperativa"

  if (documento) {
    const digits = documento.replace(/\D/g, "")
    if (isCnpj(digits)) return "PJ"
    if (isCpf(digits)) return "PF"
  }

  // heurística pelo nome: sobrenomes comuns → PF
  const palavras = nome.trim().split(/\s+/)
  if (palavras.length >= 2 && palavras.every((p) => /^[A-ZÁÉÍÓÚÂÊÎÔÛÃÕ]+$/i.test(p))) {
    if (!nome.includes("LTDA") && !nome.includes("S/A") && !nome.includes("S.A")
      && !nome.includes("EIRELI") && !nome.includes("ME ") && !nome.includes("EPP")) {
      return "PF"
    }
  }

  return "desconhecido"
}

export type SubtipoProcesso =
  | "recuperacao_judicial_ativa"
  | "recuperacao_judicial_antiga"
  | "falencia_ativa"
  | "falencia_antiga"
  | "extrajudicial"

export function calcularSubtipo(
  tipo: string | null,
  dataDeferimento: Date | null
): SubtipoProcesso {
  const now = Date.now()
  const meses = dataDeferimento
    ? (now - dataDeferimento.getTime()) / (1000 * 60 * 60 * 24 * 30.44)
    : null

  if (tipo === "extrajudicial") return "extrajudicial"

  if (tipo === "RJ") {
    if (meses === null || meses <= 36) return "recuperacao_judicial_ativa"
    return "recuperacao_judicial_antiga"
  }

  if (tipo === "falencia") {
    if (meses === null || meses <= 60) return "falencia_ativa"
    return "falencia_antiga"
  }

  return "recuperacao_judicial_ativa"
}
