export interface ScraperResult {
  novos: number
  atualizados: number
  erros: number
  pdfsNovos: number
}

export interface ScraperAJ {
  /** Corresponds to AdministradorJudicial.urlBase in the DB */
  urlBase: string
  run(): Promise<ScraperResult>
}
