export interface ClassificacaoDoc {
  tipoDocumento: string
  relevante: boolean
}

const TIPOS_RELEVANTES = new Set([
  "lista_credores",
  "lista_credores_atualizada",
  "relacao_credores_aj",
  "edital_art_7",
  "edital_art_52",
  "quadro_geral",
  "plano_rj",
])

const REGRAS: Array<{ regex: RegExp; tipo: string }> = [
  // Listas de credores — mais específico primeiro
  { regex: /relac[aã]o.*credores.*pareceres/i,         tipo: "relacao_credores_aj" },
  { regex: /lista.*credores.*atualizada/i,              tipo: "lista_credores_atualizada" },
  { regex: /relac[aã]o.*(?:nominal|credores)/i,         tipo: "lista_credores" },
  { regex: /lista.*credores/i,                          tipo: "lista_credores" },
  { regex: /quadro.*geral.*credores/i,                  tipo: "quadro_geral" },
  { regex: /quadro.*geral/i,                            tipo: "quadro_geral" },
  // Editais
  { regex: /edital.*art\.?\s*7/i,                       tipo: "edital_art_7" },
  { regex: /edital.*art\.?\s*52/i,                      tipo: "edital_art_52" },
  { regex: /edital.*art\.?\s*53/i,                      tipo: "edital_art_53" },
  { regex: /edital.*art\.?\s*99/i,                      tipo: "edital_art_99" },
  // Plano
  { regex: /plano.*recuperac/i,                         tipo: "plano_rj" },
  { regex: /plano.*negoci/i,                            tipo: "plano_rj" },
  // Outros judiciais
  { regex: /julgamentos.*administrativos/i,             tipo: "julgamentos_admin" },
  { regex: /senten[cç]a.*decreta[cç][aã]o.*fal[eê]ncia/i, tipo: "sentenca_falencia" },
  { regex: /deferimento/i,                              tipo: "deferimento" },
  { regex: /peti[cç][aã]o.*inicial/i,                  tipo: "peticao_inicial" },
  { regex: /relat[oó]rio.*atividades/i,                 tipo: "relatorio_atividades" },
  { regex: /balancete/i,                                tipo: "balancete" },
]

export function classificarDocumento(nomeArquivo: string, descricao: string): ClassificacaoDoc {
  const texto = `${descricao} ${nomeArquivo}`.toLowerCase()

  for (const { regex, tipo } of REGRAS) {
    if (regex.test(texto)) {
      return { tipoDocumento: tipo, relevante: TIPOS_RELEVANTES.has(tipo) }
    }
  }

  return { tipoDocumento: "outro", relevante: false }
}
