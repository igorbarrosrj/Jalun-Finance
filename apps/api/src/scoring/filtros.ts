const FAZENDA_PUBLICA = [
  "UNIÃO", "FAZENDA NACIONAL", "FAZENDA ESTADUAL", "FAZENDA MUNICIPAL",
  "MUNICÍPIO DE", "MUNICIPIO DE", "ESTADO DE", "PGFN", "PROCURADORIA",
  "RECEITA FEDERAL", "SECRETARIA DA FAZENDA", "SEFAZ", "FISCO",
]

const PREVIDENCIA = [
  "INSS", "PREVIDÊNCIA SOCIAL", "PREVIDENCIA SOCIAL",
  "INSTITUTO NACIONAL DO SEGURO", "INSTITUTO NACIONAL DE SEGURO",
]

const CARTORIOS = ["CARTÓRIO", "CARTORIO", "OFICIAL DE JUSTIÇA", "OFICIAL DE JUSTICA"]

const SINDICATOS = [
  "SINDICATO", "FEDERAÇÃO DOS TRABALHADORES", "FEDERACAO DOS TRABALHADORES",
  "FETIESP", "FORCA SINDICAL", "FORÇA SINDICAL", "CENTRAL UNICA",
  "CENTRAL ÚNICA", "CUT ", "CGT ", "CONFEDERAÇÃO", "CONFEDERACAO",
]

const VALOR_MINIMO_OPERAVEL = 5_000

function nomeContem(nome: string, lista: string[]): string | null {
  const n = nome.toUpperCase()
  return lista.find((termo) => n.includes(termo)) ?? null
}

export type FiltroResult =
  | { cessivel: true }
  | { cessivel: false; motivo: string }

export function ehCredorNaoCessivel(nome: string, valor: number): FiltroResult {
  const m1 = nomeContem(nome, FAZENDA_PUBLICA)
  if (m1) return { cessivel: false, motivo: `Fazenda Pública (${m1.trim()})` }

  const m2 = nomeContem(nome, PREVIDENCIA)
  if (m2) return { cessivel: false, motivo: `Previdência/INSS (${m2.trim()})` }

  const m3 = nomeContem(nome, CARTORIOS)
  if (m3) return { cessivel: false, motivo: `Cartório/custas judiciais` }

  const m4 = nomeContem(nome, SINDICATOS)
  if (m4) return { cessivel: false, motivo: `Sindicato/entidade sindical (${m4.trim()})` }

  if (valor < VALOR_MINIMO_OPERAVEL) {
    return { cessivel: false, motivo: `Valor abaixo do mínimo operável (R$ ${valor.toFixed(2)})` }
  }

  return { cessivel: true }
}
