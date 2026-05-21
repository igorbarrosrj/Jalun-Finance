// Tipos compartilhados entre api e web

export type ClasseCredor =
  | 'I_trabalhista'
  | 'II_garantia_real'
  | 'III_quirografario'
  | 'IV_me_epp'
  | 'extraconcursal'

export type TipoProcesso = 'RJ' | 'falencia' | 'extrajudicial'

export type TipoPessoa = 'PF' | 'PJ' | 'banco' | 'fundo'

export type StatusProcesso = 'novo' | 'scrapeado' | 'extraido' | 'scored' | 'erro'

export type TipoDocumento =
  | 'edital_art_7'
  | 'edital_art_52'
  | 'edital_art_53'
  | 'edital_art_99'
  | 'lista_credores'
  | 'plano_rj'
  | 'outro'

export interface CredorResumo {
  id: number
  nome: string
  documento: string | null
  tipoPessoa: TipoPessoa | null
  valor: string
  classe: ClasseCredor
  score: string | null
  scoreMotivos: string | null
  recuperacaoEsperada: string | null
  precoAlvoCompra: string | null
}

export interface ProcessoResumo {
  id: number
  numeroProcesso: string
  tipo: TipoProcesso | null
  recuperandaRazaoSocial: string | null
  vara: string | null
  comarca: string | null
  estado: string | null
  dataDistribuicao: string | null
  dataDeferimento: string | null
  status: StatusProcesso
  ajNome: string
  totalCredores: number
  valorTotal: string | null
  qtdCredoresTopScore: number
}

export interface ProcessoDetalhe extends ProcessoResumo {
  urlPaginaAj: string | null
  credores: CredorResumo[]
  listas: {
    id: number
    totalGeral: string | null
    qtdCredores: number | null
    extraidoEm: string
  }[]
}

export interface DashboardStats {
  totalProcessos: number
  totalCredores: number
  valorTotalPassivo: string
  processosMonitorados: number
}

export interface FiltrosProcesso {
  estado?: string
  classe?: ClasseCredor
  valorMin?: number
  valorMax?: number
  scoreMin?: number
  ordenarPor?: 'score' | 'valor' | 'dataDistribuicao' | 'dataDeferimento'
  ordem?: 'asc' | 'desc'
  pagina?: number
  itensPorPagina?: number
}

export const CLASSES_CREDORES: Record<ClasseCredor, string> = {
  I_trabalhista: 'Classe I — Trabalhista',
  II_garantia_real: 'Classe II — Garantia Real',
  III_quirografario: 'Classe III — Quirografário',
  IV_me_epp: 'Classe IV — ME/EPP',
  extraconcursal: 'Extraconcursal',
}

export const ESTADOS_BR = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO',
  'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI',
  'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
]
