"use client"

import { useEffect, useState, useMemo, useCallback, useRef } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useSession } from "next-auth/react"
import { LogoutButton } from "@/components/logout-button"
import { useMe } from "@/hooks/useMe"
import { useExtracaoStream } from "@/hooks/useExtracaoStream"
import ReactMarkdown from "react-markdown"
import Image from "next/image"

const AJ_LOGO_BY_URL: Record<string, string> = {
  "https://www.ajruiz.com.br":         "/logos/aj-ruiz.svg",
  "https://r4cempresarial.com.br":     "/logos/r4c.png",
  "https://www.onbehalfbrasil.com.br": "/logos/onbehalf.png",
}

interface Credor {
  id: number
  nome: string
  documento: string | null
  tipoPessoa: string | null
  valor: string
  moeda: string
  classe: string
  cessivel: boolean
  posicaoLista: number | null
  score: string | null
  scoreMotivos: string | null
  recuperacaoEsperada: string | null
  precoAlvoCompra: string | null
  analiseDetalhada: string | null
  analisadoEm: string | null
}

interface Processo {
  id: number
  numeroProcesso: string
  tipo: string | null
  subtipo: string | null
  recuperandaRazaoSocial: string | null
  vara: string | null
  comarca: string | null
  estado: string | null
  dataDistribuicao: string | null
  dataDeferimento: string | null
  status: string
  aj: { nome: string; urlBase: string }
  documentos: Array<{ id: number; tipoDocumento: string | null; nomeArquivo: string | null; extraido: boolean }>
  listas: Array<{ id: number; qualidadeBaixa: boolean; qtdCredores: number | null }>
  credores: Credor[]
  analiseProcessoIA: string | null
  analiseProcessoGeradaEm: string | null
}

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000"

const CLASSES: Record<string, string> = {
  I_trabalhista:     "I — Trabalhista",
  II_garantia_real:  "II — Garantia Real",
  III_quirografario: "III — Quirografário",
  IV_me_epp:         "IV — ME/EPP",
  extraconcursal:    "Extraconcursal",
}

const SUBTIPO_LABEL: Record<string, string> = {
  recuperacao_judicial_ativa:  "RJ ativa",
  recuperacao_judicial_antiga: "RJ antiga",
  falencia_ativa:              "Falência ativa",
  falencia_antiga:             "Falência antiga",
  extrajudicial:               "Extrajudicial",
}

const CLASSE_CORES: Record<string, string> = {
  I_trabalhista:     "bg-blue-400",
  II_garantia_real:  "bg-purple-400",
  III_quirografario: "bg-amber-400",
  IV_me_epp:         "bg-emerald-400",
  extraconcursal:    "bg-gray-400",
}

function formatBRL(v: string | number | null): string {
  if (v === null || v === undefined) return "—"
  const n = typeof v === "number" ? v : parseFloat(v)
  if (isNaN(n)) return "—"
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n)
}

function formatBRLCompact(n: number): string {
  if (n >= 1_000_000) return `R$ ${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `R$ ${(n / 1_000).toFixed(0)}K`
  return `R$ ${n.toFixed(0)}`
}

function formatData(d: string | null): string {
  if (!d) return "—"
  return new Date(d).toLocaleDateString("pt-BR")
}

function mesesDesde(d: string | null): number | null {
  if (!d) return null
  return (Date.now() - new Date(d).getTime()) / (1000 * 60 * 60 * 24 * 30.44)
}

function scoreColor(s: string | null): string {
  if (!s) return "text-gray-300"
  const n = parseFloat(s)
  if (n >= 0.45) return "text-emerald-600 font-semibold"
  if (n >= 0.25) return "text-amber-600"
  return "text-red-500"
}

// ─── Tooltip ─────────────────────────────────────────────────────────────────

function Tooltip({ texto }: { texto: string }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  function abrir() {
    const r = btnRef.current?.getBoundingClientRect()
    if (r) setPos({ x: r.left + r.width / 2, y: r.top })
  }

  return (
    <span className="inline-flex items-center ml-0.5">
      <button
        ref={btnRef}
        onMouseEnter={abrir}
        onMouseLeave={() => setPos(null)}
        onFocus={abrir}
        onBlur={() => setPos(null)}
        className="text-gray-300 hover:text-gray-500 text-xs leading-none w-3.5 h-3.5 rounded-full border border-gray-300 hover:border-gray-400 flex items-center justify-center"
        tabIndex={0}
      >?</button>
      {pos && (
        <div
          className="fixed z-[9999] w-48 bg-gray-900 text-white text-xs rounded-lg px-2.5 py-2 leading-snug shadow-xl pointer-events-none"
          style={{ left: pos.x, top: pos.y - 8, transform: "translate(-50%, -100%)" }}
        >
          {texto}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
        </div>
      )}
    </span>
  )
}

// ─── GlossárioModal ───────────────────────────────────────────────────────────

const GLOSSARIO = [
  {
    termo: "Score de Cessibilidade",
    def: "Índice de 0 a 1 calculado por modelo quantitativo. Combina: tipo de pessoa (PF/PJ), classe do crédito, porte estimado pelo valor e características do processo. Score alto (>0.7) indica perfil favorável para negociação de cessão.",
  },
  {
    termo: "Preço-Alvo de Compra",
    def: "Estimativa calculada do valor máximo a pagar pelo crédito para que a operação seja viável. Deriva do score, da recuperação esperada e das faixas históricas de negociação nesta classe.",
  },
  {
    termo: "Recuperação Esperada",
    def: "Projeção do valor que o credor receberá ao longo do processo, sem cessão. Calculada a partir do passivo total, taxa histórica de aprovação de planos e posição na fila de pagamentos por classe.",
  },
  {
    termo: "Classes de Crédito",
    def: "Classe I (Trabalhista): empregados e ex-funcionários. Classe II (Garantia Real): credores com garantia de ativo. Classe III (Quirografário): fornecedores e bancos sem garantia. Classe IV (ME/EPP): micro e pequenas empresas credoras.",
  },
  {
    termo: "Cessão de Crédito",
    def: "Transferência do direito de receber o crédito de um credor original para um comprador (cessionário). O comprador paga um deságio (abaixo do valor de face) e assume o risco e a gestão do recebimento.",
  },
  {
    termo: "Faixa de Negociação",
    def: "Range típico de preço como % do valor de face, baseado em dados históricos desta classe de crédito e perfil do credor. Representa onde a maioria das cessões se concretiza em mercado.",
  },
]

function GlossarioModal({ onFechar }: { onFechar: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-2xl w-full sm:max-w-lg max-h-[88vh] sm:max-h-[80vh] flex flex-col">
        {/* Handle bar no mobile */}
        <div className="sm:hidden flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>
        <div className="flex items-center justify-between px-4 py-3 sm:p-5 border-b border-gray-100">
          <div>
            <h3 className="font-semibold text-gray-900 text-sm">Como funciona</h3>
            <p className="text-xs text-gray-400 mt-0.5">Termos e métricas do Credor Radar</p>
          </div>
          <button onClick={onFechar} className="text-gray-400 hover:text-gray-700 text-xl p-1">×</button>
        </div>
        <div className="overflow-y-auto flex-1 px-4 py-4 sm:p-5 space-y-4">
          {GLOSSARIO.map((item) => (
            <div key={item.termo} className="border-b border-gray-50 pb-4 last:border-0 last:pb-0">
              <p className="text-sm font-semibold text-gray-900 mb-1">{item.termo}</p>
              <p className="text-sm text-gray-600 leading-relaxed">{item.def}</p>
            </div>
          ))}
        </div>
        <div className="border-t border-gray-100 px-4 py-3 sm:px-5 text-center">
          <p className="text-xs text-gray-400">
            Análises informacionais baseadas em modelo quantitativo. Não constituem recomendação de investimento.
          </p>
        </div>
      </div>
    </div>
  )
}

function exportCSV(credores: Credor[], processo: Processo) {
  const header = ["Posição","Nome","Documento","Classe","Cessível","Valor (BRL)","Score","Rec. Esperada","Preço-Alvo"]
  const rows = credores.map((c) => [
    c.posicaoLista ?? "",
    `"${c.nome}"`,
    c.documento ?? "",
    CLASSES[c.classe] ?? c.classe,
    c.cessivel ? "Sim" : "Não",
    parseFloat(c.valor).toFixed(2),
    c.score ? parseFloat(c.score).toFixed(4) : "",
    c.recuperacaoEsperada ? parseFloat(c.recuperacaoEsperada).toFixed(2) : "",
    c.precoAlvoCompra ? parseFloat(c.precoAlvoCompra).toFixed(2) : "",
  ])
  const csv = [header, ...rows].map((r) => r.join(",")).join("\n")
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `credores_${processo.numeroProcesso}.csv`
  a.click()
}

// ─── Modal de análise detalhada do credor ────────────────────────────────────

function ModalAnaliseCredor({
  credor,
  email,
  onFechar,
}: {
  credor: Credor
  email: string | null | undefined
  onFechar: () => void
}) {
  const [analise, setAnalise] = useState<string | null>(credor.analiseDetalhada)
  const [analisadoEm, setAnalisadoEm] = useState<string | null>(credor.analisadoEm)
  const [gerando, setGerando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function gerar(forcar = false) {
    setGerando(true)
    setErro(null)
    try {
      const url = `${API_URL}/api/credores/${credor.id}/analise${forcar ? "?forcar=true" : ""}`
      const res = await fetch(url, { method: "POST" })
      const d = await res.json()
      if (!res.ok) {
        setErro(d.erro ?? "Erro ao gerar análise.")
      } else {
        setAnalise(d.analise)
        setAnalisadoEm(d.analisadoEm)
      }
    } catch {
      setErro("Não foi possível conectar ao servidor. Tente novamente.")
    } finally {
      setGerando(false)
    }
  }

  // Gera automaticamente se ainda não há análise
  useEffect(() => {
    if (!analise) gerar()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-xl shadow-2xl w-full sm:max-w-lg max-h-[92vh] sm:max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between px-4 py-3.5 sm:p-5 border-b border-gray-100">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900 text-sm leading-snug line-clamp-2">{credor.nome}</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              {formatBRL(credor.valor)} · {credor.classe.split("_")[0]} ·
              {credor.score && ` Score ${parseFloat(credor.score).toFixed(2)}`}
            </p>
          </div>
          <button onClick={onFechar} className="ml-3 text-gray-400 hover:text-gray-700 text-xl shrink-0 p-1">×</button>
        </div>

        {/* Conteúdo */}
        <div className="overflow-y-auto flex-1 px-4 py-4 sm:p-5">
          {gerando ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-gray-500">Gerando análise…</p>
            </div>
          ) : erro ? (
            <div className="text-center py-10">
              <p className="text-sm text-red-500 mb-3">{erro}</p>
              <button onClick={() => gerar()} className="rounded-md bg-gray-900 text-white text-sm px-4 py-2 hover:bg-gray-700">
                Tentar novamente →
              </button>
            </div>
          ) : analise ? (
            <div className="prose prose-sm prose-gray max-w-none
              prose-headings:text-gray-900 prose-headings:font-semibold prose-headings:mt-4 prose-headings:mb-1
              prose-strong:text-gray-900 prose-strong:font-semibold
              prose-p:text-gray-600 prose-p:my-1 prose-p:leading-relaxed
              prose-ul:my-1 prose-li:my-0.5 prose-li:text-gray-700
              prose-hr:border-gray-100 prose-hr:my-3
              [&_em]:not-italic [&_em]:text-gray-500">
              <ReactMarkdown>{analise}</ReactMarkdown>
            </div>
          ) : (
            <div className="text-center py-10">
              <p className="text-sm text-gray-400 mb-3">Análise ainda não gerada.</p>
              <button onClick={() => gerar()} className="rounded-md bg-gray-900 text-white text-sm px-4 py-2 hover:bg-gray-700">
                Gerar análise →
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        {analise && (
          <div className="border-t border-gray-100 px-4 py-3 sm:px-5 flex items-center justify-between">
            <p className="text-xs text-gray-400">
              {analisadoEm ? `Gerada em ${new Date(analisadoEm).toLocaleDateString("pt-BR")}` : ""}
            </p>
            <button
              onClick={() => gerar(true)}
              disabled={gerando}
              className="text-xs text-gray-400 hover:text-gray-700 disabled:opacity-40"
            >
              ↻ Regenerar
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Bloco análise sob demanda ────────────────────────────────────────────────

interface BlocoAnaliseProps {
  processo: Processo
  me: import("@/hooks/useMe").MeData | null
  extracaoEnviada: { solicitacaoId: number; tempoEstimado: string; status?: string } | null
  extracaoErro: string | null
  modalAberto: boolean
  solicitandoExtracao: boolean
  onAbrirModal: () => void
  onFecharModal: () => void
  onConfirmar: () => void
  onBuscarDocumentos: () => void
  buscandoDocumentos: boolean
  buscaEnviada: boolean
}

function BlocoAnalise({
  processo, me, extracaoEnviada, extracaoErro,
  modalAberto, solicitandoExtracao, onAbrirModal, onFecharModal, onConfirmar,
  onBuscarDocumentos, buscandoDocumentos, buscaEnviada,
}: BlocoAnaliseProps) {
  const TIPOS_RELEVANTES = ["lista_credores", "edital_art_7", "edital_art_52", "plano_rj", "quadro_geral"]
  const docsRelevantes = processo.documentos.filter((d) => d.tipoDocumento && TIPOS_RELEVANTES.includes(d.tipoDocumento))
  const tiposLabel: Record<string, string> = {
    lista_credores: "Lista de credores",
    edital_art_7:   "Edital art. 7",
    edital_art_52:  "Edital art. 52",
    plano_rj:       "Plano de RJ",
    quadro_geral:   "Quadro geral",
  }
  const saldo = me?.saldoCreditos ?? 0

  if (extracaoEnviada) {
    const statusAtual = extracaoEnviada.status ?? "aguardando"
    const isProcessando = statusAtual === "processando"
    return (
      <div className="border border-blue-200 bg-blue-50 rounded-lg p-6 text-center">
        <div className="text-2xl mb-2">{isProcessando ? "⚙️" : "🔄"}</div>
        <p className="font-semibold text-blue-900">
          {isProcessando ? "Análise em processamento" : "Análise na fila"}
        </p>
        <div className="flex items-center justify-center gap-1.5 mt-1">
          <span className={`w-2 h-2 rounded-full ${isProcessando ? "bg-blue-500 animate-ping" : "bg-yellow-400 animate-pulse"}`} />
          <p className="text-sm text-blue-700">
            {isProcessando ? "Extraindo e analisando documentos…" : "Aguardando na fila de prioridade…"}
          </p>
        </div>
        {extracaoEnviada.tempoEstimado !== "estimativa não disponível" && (
          <p className="text-xs text-blue-500 mt-1">Tempo estimado: {extracaoEnviada.tempoEstimado}</p>
        )}
        <p className="text-xs text-blue-400 mt-2">ID #{extracaoEnviada.solicitacaoId} · a página atualiza automaticamente quando concluir</p>
        <Link href="/dashboard/minhas-analises" className="mt-3 inline-block text-xs text-blue-600 underline">
          Ver todas as análises →
        </Link>
      </div>
    )
  }

  return (
    <>
      <div className="border-2 border-dashed border-gray-200 rounded-lg p-6">
        <div className="text-center mb-5">
          <div className="text-3xl mb-2">📊</div>
          <h3 className="font-semibold text-gray-800">Este processo ainda não foi analisado</h3>
        </div>

        <div className="text-sm text-gray-600 mb-5 max-w-md mx-auto">
          <p className="mb-2">
            <strong>{processo.documentos.length}</strong> documento{processo.documentos.length !== 1 ? "s" : ""} catalogado{processo.documentos.length !== 1 ? "s" : ""}
            {docsRelevantes.length > 0 ? ` · ${docsRelevantes.length} relevantes:` : " · nenhum relevante encontrado"}
          </p>
          {docsRelevantes.length > 0 && (
            <ul className="space-y-0.5 text-gray-500 text-xs">
              {docsRelevantes.map((d) => (
                <li key={d.id} className="flex items-center gap-1.5">
                  <span>•</span>
                  <span>{tiposLabel[d.tipoDocumento ?? ""] ?? d.tipoDocumento}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {docsRelevantes.length === 0 ? (
          <div className="text-center space-y-3">
            {buscaEnviada ? (
              <div className="inline-flex flex-col items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-6 py-4">
                <span className="text-blue-500 text-2xl animate-spin">⟳</span>
                <p className="text-sm font-medium text-blue-800">Buscando novos documentos…</p>
                <p className="text-xs text-blue-500">Isso leva ~1-2 minutos. A página atualiza automaticamente.</p>
              </div>
            ) : (
              <>
                <p className="text-sm text-gray-400">
                  Nenhum documento relevante encontrado nesta visita.
                </p>
                <button
                  onClick={onBuscarDocumentos}
                  disabled={buscandoDocumentos}
                  className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition-colors disabled:opacity-50"
                >
                  {buscandoDocumentos ? "Enviando…" : "↻ Buscar documentos no site do AJ"}
                </button>
                <p className="text-xs text-gray-400">
                  Re-verifica o site do Administrador Judicial por PDFs novos.
                </p>
              </>
            )}
          </div>
        ) : saldo < 1 ? (
          <div className="text-center space-y-2">
            <p className="text-sm text-red-600 font-medium">Saldo insuficiente ({saldo} créditos)</p>
            <Link href="/planos" className="inline-block rounded-md bg-[#0a0a0a] px-4 py-2 text-sm text-white hover:bg-[#1a1a1a]">
              Ver planos →
            </Link>
          </div>
        ) : (
          <div className="text-center">
            <div className="inline-block border border-gray-200 rounded-lg p-4 mb-4 bg-white text-left">
              <p className="text-xs text-gray-500 mb-1">⚡ Análise prioritária sob demanda</p>
              <p className="text-xs text-gray-400">Tempo estimado: {Math.max(3, docsRelevantes.length * 2)}-{Math.max(3, docsRelevantes.length * 2) + 5} minutos</p>
              <p className="text-xs text-gray-400">Custo: <strong>1 crédito</strong> (você tem {saldo})</p>
            </div>
            <br />
            <button
              onClick={onAbrirModal}
              className="rounded-md bg-[#0a0a0a] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#1a1a1a] transition-colors"
            >
              Analisar agora →
            </button>
            {extracaoErro && <p className="mt-2 text-sm text-red-600">{extracaoErro}</p>}
            <p className="mt-3 text-xs text-gray-400">
              Sem créditos?{" "}
              <Link href="/planos" className="underline hover:text-gray-600">Ver planos</Link>
            </p>
          </div>
        )}
      </div>

      {/* Modal de confirmação */}
      {modalAberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full mx-4">
            <h3 className="font-semibold text-gray-900 mb-2">Confirmar análise</h3>
            <p className="text-sm text-gray-600 mb-1">
              Processo: <strong>{processo.recuperandaRazaoSocial ?? processo.numeroProcesso}</strong>
            </p>
            <p className="text-sm text-gray-600 mb-4">
              Isso consumirá <strong>1 crédito</strong> do seu saldo. Saldo atual: {saldo}.
            </p>
            <div className="flex gap-3">
              <button
                onClick={onFecharModal}
                disabled={solicitandoExtracao}
                className="flex-1 rounded-md border border-gray-200 px-4 py-2 text-sm hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={onConfirmar}
                disabled={solicitandoExtracao}
                className="flex-1 rounded-md bg-[#0a0a0a] px-4 py-2 text-sm font-medium text-white hover:bg-[#1a1a1a] disabled:opacity-50"
              >
                {solicitandoExtracao ? "Enviando…" : "Confirmar →"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ─── Indicadores agregados ────────────────────────────────────────────────────

function useIndicadores(processo: Processo | null) {
  return useMemo(() => {
    if (!processo || processo.credores.length === 0) return null

    const cessiveis = processo.credores.filter((c) => c.cessivel)
    const comScore = cessiveis.filter((c) => c.score !== null)

    const scoreMedio =
      comScore.length > 0
        ? comScore.reduce((s, c) => s + parseFloat(c.score!), 0) / comScore.length
        : null

    const top5 = [...cessiveis]
      .filter((c) => c.score !== null && parseFloat(c.valor) >= 30_000)
      .sort((a, b) => parseFloat(b.score!) - parseFloat(a.score!))
      .slice(0, 5)

    const totalCessivel = cessiveis.reduce((s, c) => s + parseFloat(c.valor), 0)

    const porClasse: Record<string, number> = {}
    for (const c of cessiveis) {
      porClasse[c.classe] = (porClasse[c.classe] ?? 0) + parseFloat(c.valor)
    }

    const maxClasse = Math.max(...Object.values(porClasse), 1)
    const meses = mesesDesde(processo.dataDeferimento)

    return { scoreMedio, top5, totalCessivel, porClasse, maxClasse, meses, totalCessiveis: cessiveis.length }
  }, [processo])
}

export default function ProcessoDetalhePage() {
  const params = useParams()
  const id = params["id"] as string
  const { isTrial, me } = useMe()
  const { data: session } = useSession()

  const [processo, setProcesso] = useState<Processo | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [filtroClasse, setFiltroClasse] = useState("")
  const [mostrarNaoCessiveis, setMostrarNaoCessiveis] = useState(false)
  const [favoritosSet, setFavoritosSet] = useState<Set<number>>(new Set())

  const [modalAberto, setModalAberto] = useState(false)
  const [solicitandoExtracao, setSolicitandoExtracao] = useState(false)
  const [extracaoEnviada, setExtracaoEnviada] = useState<{ solicitacaoId: number; tempoEstimado: string } | null>(null)
  const [extracaoErro, setExtracaoErro] = useState<string | null>(null)
  const [historico, setHistorico] = useState<Array<{ id: number; valorTotal: string; qtdCredores: number; criadoEm: string }> | null>(null)
  const [buscandoDocumentos, setBuscandoDocumentos] = useState(false)
  const [buscaEnviada, setBuscaEnviada] = useState(false)
  const [credorAnalise, setCredorAnalise] = useState<Credor | null>(null)
  const [glossarioAberto, setGlossarioAberto] = useState(false)

  // Análise de portfólio do processo
  const [analisePortfolio, setAnalisePortfolio] = useState<string | null>(null)
  const [analisePortfolioEm, setAnalisePortfolioEm] = useState<string | null>(null)
  const [gerandoPortfolio, setGerandoPortfolio] = useState(false)
  const [erroPortfolio, setErroPortfolio] = useState<string | null>(null)
  const [mostrarPortfolio, setMostrarPortfolio] = useState(false)

  const { solicitacoes: streamSolicitacoes } = useExtracaoStream(session?.user?.email)

  // Analise ativa para este processo (detectada via stream, persiste após reload de página)
  const solicitacaoAtiva = streamSolicitacoes.find(
    (s) => s.processoId === Number(id) && (s.status === "aguardando" || s.status === "processando")
  )

  // Auto-reload quando análise deste processo concluir
  const prevStatusRef = useRef<string | undefined>()
  useEffect(() => {
    const s = streamSolicitacoes.find((s) => s.processoId === Number(id))
    if (!s) return
    if (
      prevStatusRef.current &&
      prevStatusRef.current !== "concluida" &&
      s.status === "concluida"
    ) {
      fetch(`${API_URL}/api/processos/${id}`)
        .then((r) => r.ok ? r.json() : null)
        .then((d) => { if (d) setProcesso(d) })
        .catch(() => {})
    }
    prevStatusRef.current = s.status
  }, [streamSolicitacoes, id])

  const indicadores = useIndicadores(processo)

  useEffect(() => {
    fetch(`${API_URL}/api/processos/${id}`)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then((p: Processo) => {
        setProcesso(p)
        if (p.analiseProcessoIA) {
          setAnalisePortfolio(p.analiseProcessoIA)
          setAnalisePortfolioEm(p.analiseProcessoGeradaEm)
          setMostrarPortfolio(false) // collapsed by default even if exists
        }
      })
      .catch((e) => setErro((e as Error).message))
      .finally(() => setLoading(false))
    fetch(`${API_URL}/api/processos/${id}/historico`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) setHistorico(d) })
      .catch(() => {})
  }, [id])

  useEffect(() => {
    fetch("/api/favoritos")
      .then((r) => r.ok ? r.json() : [])
      .then((favs: Array<{ credor: { id: number } }>) => {
        setFavoritosSet(new Set(favs.map((f) => f.credor.id)))
      })
      .catch(() => {})
  }, [])

  const toggleFavorito = useCallback(async (credorId: number) => {
    const isFav = favoritosSet.has(credorId)
    if (isFav) {
      await fetch(`/api/favoritos/${credorId}`, { method: "DELETE" })
      setFavoritosSet((s) => { const n = new Set(s); n.delete(credorId); return n })
    } else {
      await fetch("/api/favoritos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ credorId }) })
      setFavoritosSet((s) => new Set(s).add(credorId))
    }
  }, [favoritosSet])

  const buscarDocumentos = useCallback(async () => {
    setBuscandoDocumentos(true)
    try {
      const res = await fetch(`${API_URL}/api/processos/${id}/re-scrape`, { method: "POST" })
      if (res.ok) {
        setBuscaEnviada(true)
        // Auto-reload após 90s para mostrar novos documentos
        setTimeout(async () => {
          const r = await fetch(`${API_URL}/api/processos/${id}`)
          if (r.ok) setProcesso(await r.json())
          setBuscaEnviada(false)
        }, 90_000)
      }
    } catch {
      // silencioso
    } finally {
      setBuscandoDocumentos(false)
    }
  }, [id])

  const gerarAnalisePortfolio = useCallback(async (forcar = false) => {
    if (!processo) return
    setGerandoPortfolio(true)
    setErroPortfolio(null)
    try {
      const url = `${API_URL}/api/processos/${processo.id}/analisar${forcar ? "?forcar=true" : ""}`
      const res = await fetch(url, { method: "POST" })
      const d = await res.json()
      if (!res.ok) {
        setErroPortfolio(d.erro ?? "Erro ao gerar análise.")
      } else {
        setAnalisePortfolio(d.analise)
        setAnalisePortfolioEm(d.geradaEm)
      }
    } catch {
      setErroPortfolio("Não foi possível conectar ao servidor.")
    } finally {
      setGerandoPortfolio(false)
    }
  }, [processo])

  const solicitarAnalise = useCallback(async () => {
    if (!session?.user?.email) return
    setSolicitandoExtracao(true)
    setExtracaoErro(null)
    try {
      const res = await fetch(`${API_URL}/api/extracao/solicitar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ processoId: processo?.id, email: session.user.email }),
      })
      const data = await res.json()
      if (!res.ok) {
        setExtracaoErro(data.erro ?? "Erro ao solicitar análise.")
      } else {
        setExtracaoEnviada({ solicitacaoId: data.solicitacaoId, tempoEstimado: data.tempoEstimado })
        setModalAberto(false)
      }
    } catch {
      setExtracaoErro("Erro de conexão. Tente novamente.")
    } finally {
      setSolicitandoExtracao(false)
    }
  }, [session, processo])

  if (loading) return (
    <div className="min-h-screen bg-white">
      <div className="max-w-7xl mx-auto px-6 py-6 space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
        ))}
      </div>
    </div>
  )
  if (erro || !processo) return (
    <div className="min-h-screen flex items-center justify-center text-red-500">{erro ?? "Não encontrado"}</div>
  )

  const qualidadeBaixa = processo.listas.some((l) => l.qualidadeBaixa)

  const credoresFiltrados = processo.credores.filter((c) => {
    if (!mostrarNaoCessiveis && !c.cessivel) return false
    if (filtroClasse && c.classe !== filtroClasse) return false
    return true
  })

  const cessiveis = processo.credores.filter((c) => c.cessivel)

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-gray-100 px-4 md:px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0 text-sm">
            <Link href="/dashboard" className="text-gray-500 hover:text-gray-900 shrink-0">← Dashboard</Link>
            <span className="text-gray-200 hidden sm:inline">/</span>
            <span className="text-gray-700 font-mono truncate hidden sm:inline">
              {processo.numeroProcesso}
            </span>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => setGlossarioAberto(true)}
              className="text-gray-400 hover:text-gray-700 transition-colors"
              title="Como funciona"
            >
              <span className="text-base sm:hidden">❓</span>
              <span className="hidden sm:inline text-xs">❓ Como funciona</span>
            </button>
            <Link href="/dashboard/favoritos" className="text-amber-500 hover:text-amber-600 transition-colors" title="Meus favoritos">
              <span className="hidden md:inline text-sm">★ Favoritos</span>
              <span className="md:hidden text-lg leading-none">★</span>
            </Link>
            <LogoutButton />
          </div>
        </div>
      </header>

      {isTrial && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 md:px-6 py-2.5">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 text-sm">
            <span className="text-amber-800 text-xs md:text-sm">
              ⚠ <strong>Trial</strong>
              {me?.diasRestantesTrial !== null ? ` — ${me?.diasRestantesTrial} dias` : ""}
              {" "}· Scores <strong>mascarados</strong>.
            </span>
            <Link href="/planos" className="shrink-0 rounded-md bg-amber-600 px-3 py-1 text-xs font-medium text-white hover:bg-amber-700 whitespace-nowrap">
              Ver planos →
            </Link>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 md:px-6 py-4 md:py-6 space-y-4 md:space-y-6">

        {/* Cabeçalho do processo */}
        <div className="border border-gray-100 rounded-lg p-4 md:p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-lg md:text-xl font-bold text-gray-900 leading-snug">
                {processo.recuperandaRazaoSocial ?? processo.numeroProcesso}
              </h1>
              <p className="mt-1 text-xs md:text-sm text-gray-500 font-mono truncate">{processo.numeroProcesso}</p>
            </div>
            <div className="flex gap-2 flex-wrap justify-end shrink-0 max-w-[45%]">
              {processo.subtipo && (
                <span className="inline-flex rounded-md px-2.5 py-1 text-xs font-medium bg-blue-100 text-blue-800">
                  {SUBTIPO_LABEL[processo.subtipo] ?? processo.subtipo}
                </span>
              )}
              <span className={`inline-flex rounded-md px-2.5 py-1 text-xs font-medium ${
                processo.status === "scored" ? "bg-emerald-100 text-emerald-800"
                  : processo.status === "extraido" ? "bg-blue-100 text-blue-800"
                  : "bg-gray-100 text-gray-600"
              }`}>
                {processo.status}
              </span>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div><span className="text-gray-400 text-xs">Estado</span><div className="font-medium mt-0.5">{processo.estado ?? "—"}</div></div>
            <div><span className="text-gray-400 text-xs">Comarca</span><div className="font-medium mt-0.5">{processo.comarca ?? "—"}</div></div>
            <div><span className="text-gray-400 text-xs">Deferimento</span><div className="font-medium mt-0.5">{formatData(processo.dataDeferimento)}</div></div>
            <div><span className="text-gray-400 text-xs">Distribuição</span><div className="font-medium mt-0.5">{formatData(processo.dataDistribuicao)}</div></div>
          </div>

          <div className="mt-3 flex items-center gap-2">
            {AJ_LOGO_BY_URL[processo.aj.urlBase] ? (
              <a href={processo.aj.urlBase} target="_blank" rel="noopener noreferrer" title={processo.aj.nome}>
                <Image
                  src={AJ_LOGO_BY_URL[processo.aj.urlBase]!}
                  alt={processo.aj.nome}
                  width={64}
                  height={24}
                  className="object-contain opacity-70 hover:opacity-100 transition-opacity"
                  unoptimized
                />
              </a>
            ) : (
              <span className="text-xs text-gray-400">
                <span className="font-medium">AJ:</span>{" "}
                <a href={processo.aj.urlBase} target="_blank" rel="noopener noreferrer" className="hover:underline">
                  {processo.aj.nome}
                </a>
              </span>
            )}
          </div>
          {processo.vara && (
            <div className="mt-2 text-xs text-gray-500 border-l-2 border-gray-100 pl-3">{processo.vara}</div>
          )}
        </div>

        {/* Alerta qualidade baixa */}
        {qualidadeBaixa && (
          <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <span className="text-base shrink-0">⚠️</span>
            <span>Lista predominantemente tributária — pouco valor para cessão privada. A maioria dos créditos é de Fazenda Pública ou INSS.</span>
          </div>
        )}

        {/* Indicadores agregados */}
        {indicadores && indicadores.totalCessiveis > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Score médio + idade */}
            <div className="border border-gray-100 rounded-lg p-5">
              <div className="text-xs text-gray-400 uppercase tracking-wide mb-3">Resumo</div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Score médio</span>
                  {isTrial ? (
                    <span className="font-mono text-gray-300 text-xs bg-gray-100 rounded px-1.5 py-0.5 select-none">X.XXX</span>
                  ) : (
                    <span className={`font-semibold ${scoreColor(indicadores.scoreMedio?.toFixed(2) ?? null)}`}>
                      {indicadores.scoreMedio !== null ? indicadores.scoreMedio.toFixed(3) : "—"}
                    </span>
                  )}
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Total cessível</span>
                  <span className="font-medium">{formatBRLCompact(indicadores.totalCessivel)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Credores cessíveis</span>
                  <span className="font-medium">{indicadores.totalCessiveis}</span>
                </div>
                {indicadores.meses !== null && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Idade do processo</span>
                    <span className="font-medium">
                      {indicadores.meses < 12
                        ? `${Math.round(indicadores.meses)} meses`
                        : `${(indicadores.meses / 12).toFixed(1)} anos`}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Top 5 oportunidades */}
            <div className="border border-gray-100 rounded-lg p-5">
              <div className="text-xs text-gray-400 uppercase tracking-wide mb-3">Top 5 oportunidades (&ge;R$30k)</div>
              {indicadores.top5.length === 0 ? (
                <p className="text-sm text-gray-400">Nenhum credor cessível com valor ≥ R$30k</p>
              ) : (
                <div className="space-y-2">
                  {indicadores.top5.map((c) => (
                    <div key={c.id} className="flex items-center justify-between gap-2">
                      <span className="text-xs text-gray-700 line-clamp-1 flex-1">{c.nome}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-gray-400">{formatBRLCompact(parseFloat(c.valor))}</span>
                        {isTrial ? (
                          <span className="font-mono text-gray-300 text-xs bg-gray-100 rounded px-1 select-none">X.XX</span>
                        ) : (
                          <span className={`text-xs font-semibold tabular-nums ${scoreColor(c.score)}`}>
                            {c.score ? parseFloat(c.score).toFixed(2) : "—"}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Distribuição por classe */}
            <div className="border border-gray-100 rounded-lg p-5">
              <div className="text-xs text-gray-400 uppercase tracking-wide mb-3">Distribuição por classe (cessível)</div>
              <div className="space-y-2">
                {Object.entries(CLASSES).map(([k, label]) => {
                  const val = indicadores.porClasse[k] ?? 0
                  if (val === 0) return null
                  const pct = (val / indicadores.maxClasse) * 100
                  return (
                    <div key={k}>
                      <div className="flex justify-between text-xs mb-0.5">
                        <span className="text-gray-500">{label}</span>
                        <span className="text-gray-700 font-medium">{formatBRLCompact(val)}</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${CLASSE_CORES[k] ?? "bg-gray-400"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* Documentos */}
        {processo.documentos.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-gray-700 mb-3">
              Documentos ({processo.documentos.length})
            </h2>
            <div className="flex flex-wrap gap-2">
              {processo.documentos.map((d) => (
                <span key={d.id} className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs ${
                  d.extraido ? "bg-emerald-50 text-emerald-700" : "bg-gray-50 text-gray-500"
                }`}>
                  {d.extraido ? "✓" : "○"} {d.tipoDocumento ?? "outro"}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Histórico de passivo */}
        {historico && historico.length >= 2 && (
          <div>
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Histórico do passivo</h2>
            <div className="border border-gray-100 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    {["Data", "Passivo total", "Nº credores", "Variação"].map((h) => (
                      <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {historico.map((h, i) => {
                    const prev = historico[i - 1]
                    const varPct = prev
                      ? ((parseFloat(h.valorTotal) - parseFloat(prev.valorTotal)) / parseFloat(prev.valorTotal)) * 100
                      : null
                    return (
                      <tr key={h.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5 text-gray-400 text-xs">{new Date(h.criadoEm).toLocaleDateString("pt-BR")}</td>
                        <td className="px-4 py-2.5 tabular-nums font-medium">{formatBRL(h.valorTotal)}</td>
                        <td className="px-4 py-2.5 tabular-nums text-gray-500">{h.qtdCredores}</td>
                        <td className="px-4 py-2.5 tabular-nums text-sm">
                          {varPct === null ? (
                            <span className="text-gray-300 text-xs">—</span>
                          ) : (
                            <span className={varPct > 0 ? "text-red-500" : varPct < 0 ? "text-emerald-600" : "text-gray-400"}>
                              {varPct > 0 ? "+" : ""}{varPct.toFixed(1)}%
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Credores */}
        <div>
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-gray-700">
                Credores ({credoresFiltrados.length} exibidos · {cessiveis.length} cessíveis de {processo.credores.length})
              </h2>
              {/* Botão de glossário visível só no mobile (no desktop os tooltips já explicam) */}
              <button
                onClick={() => setGlossarioAberto(true)}
                className="md:hidden text-xs text-gray-400 hover:text-gray-600 underline underline-offset-2"
              >
                ❓ termos
              </button>
            </div>
            <div className="flex gap-2 flex-wrap items-center">
              <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={mostrarNaoCessiveis}
                  onChange={(e) => setMostrarNaoCessiveis(e.target.checked)}
                  className="rounded border-gray-300"
                />
                Mostrar não-cessíveis
              </label>
              <select
                value={filtroClasse}
                onChange={(e) => setFiltroClasse(e.target.value)}
                className="rounded-md border border-gray-200 px-2.5 py-1.5 text-xs focus:outline-none"
              >
                <option value="">Todas as classes</option>
                {Object.entries(CLASSES).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
              {processo.credores.length > 0 && (
                <button
                  onClick={() => exportCSV(credoresFiltrados, processo)}
                  className="rounded-md border border-gray-200 px-3 py-1.5 text-xs hover:bg-gray-50"
                >
                  ↓ CSV
                </button>
              )}
            </div>
          </div>

          {processo.credores.length === 0 ? (
            <BlocoAnalise
              processo={processo}
              me={me}
              extracaoEnviada={
                extracaoEnviada ??
                (solicitacaoAtiva
                  ? { solicitacaoId: solicitacaoAtiva.id, tempoEstimado: "estimativa não disponível", status: solicitacaoAtiva.status }
                  : null)
              }
              extracaoErro={extracaoErro}
              modalAberto={modalAberto}
              solicitandoExtracao={solicitandoExtracao}
              onAbrirModal={() => setModalAberto(true)}
              onFecharModal={() => setModalAberto(false)}
              onConfirmar={solicitarAnalise}
              onBuscarDocumentos={buscarDocumentos}
              buscandoDocumentos={buscandoDocumentos}
              buscaEnviada={buscaEnviada}
            />
          ) : (
            <>
              {/* ── Cards (mobile) ── */}
              <div className="md:hidden space-y-2">
                {credoresFiltrados.map((c) => (
                  <div
                    key={c.id}
                    className={`border border-gray-100 rounded-lg p-3.5 ${!c.cessivel ? "opacity-50" : ""}`}
                  >
                    {/* Linha 1: nome + favorito */}
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-gray-900 text-sm leading-snug line-clamp-2">{c.nome}</div>
                        {!c.cessivel && (
                          <div className="text-xs text-amber-600 mt-0.5">
                            {c.scoreMotivos?.replace("Crédito não cessível: ", "")}
                          </div>
                        )}
                      </div>
                      {c.cessivel && (
                        <button
                          onClick={() => toggleFavorito(c.id)}
                          className={`shrink-0 text-xl leading-none transition-colors ${
                            favoritosSet.has(c.id) ? "text-amber-400" : "text-gray-200"
                          }`}
                        >
                          ★
                        </button>
                      )}
                    </div>

                    {/* Linha 2: badges + valor */}
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${CLASSE_CORES[c.classe] ?? "bg-gray-200"} text-white`}>
                        {c.classe.split("_")[0]}
                      </span>
                      <span className="font-semibold tabular-nums text-sm">{formatBRL(c.valor)}</span>
                      {c.posicaoLista && <span className="text-xs text-gray-400">#{c.posicaoLista}</span>}
                    </div>

                    {/* Linha 3: score + preço-alvo + botão */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex gap-4 text-xs">
                        <span>
                          <span className="text-gray-400">Score </span>
                          {isTrial
                            ? <span className="text-gray-300 bg-gray-100 rounded px-1 select-none">X.XX</span>
                            : <span className={`font-semibold ${scoreColor(c.score)}`}>{c.score ? parseFloat(c.score).toFixed(2) : "—"}</span>}
                        </span>
                        <span>
                          <span className="text-gray-400">Alvo </span>
                          {isTrial
                            ? <span className="text-gray-300 select-none">•••</span>
                            : <span className="font-medium">{formatBRL(c.precoAlvoCompra)}</span>}
                        </span>
                      </div>
                      {c.cessivel && c.score && (
                        <button
                          onClick={() => setCredorAnalise(c)}
                          className="rounded px-2.5 py-1 text-xs border border-gray-200 text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors whitespace-nowrap"
                        >
                          {c.analiseDetalhada ? "📋 Ver" : "✦ Analisar"}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* ── Tabela (desktop) ── */}
              <div className="hidden md:block border border-gray-100 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      {(["★","#","Nome","Tipo","Classe","Valor"] as const).map((h) => (
                        <th key={h} className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                      ))}
                      <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">
                        Score <Tooltip texto="Índice de 0 a 1 que estima a probabilidade de o credor aceitar uma oferta de cessão. Score alto = maior chance de negociação." />
                      </th>
                      <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">
                        Rec. Esperada <Tooltip texto="Projeção do valor que o credor receberá ao final do processo, sem cessão. Base de comparação para a oferta." />
                      </th>
                      <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">
                        Preço-Alvo <Tooltip texto="Valor máximo sugerido para oferta de compra. Calculado para que a operação seja rentável considerando o risco do processo." />
                      </th>
                      <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {credoresFiltrados.map((c) => (
                      <tr key={c.id} className={`hover:bg-gray-50 ${!c.cessivel ? "opacity-40" : ""}`}>
                        <td className="px-3 py-2.5">
                          {c.cessivel && (
                            <button
                              onClick={() => toggleFavorito(c.id)}
                              className={`text-base transition-colors ${
                                favoritosSet.has(c.id) ? "text-amber-400 hover:text-gray-300" : "text-gray-200 hover:text-amber-400"
                              }`}
                            >★</button>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-gray-400 tabular-nums text-xs">{c.posicaoLista ?? "—"}</td>
                        <td className="px-3 py-2.5 max-w-xs">
                          <div className="font-medium text-gray-900 line-clamp-1">{c.nome}</div>
                          {!c.cessivel && (
                            <div className="text-xs text-amber-600 line-clamp-1">
                              {c.scoreMotivos?.replace("Crédito não cessível: ", "")}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-gray-500">{c.tipoPessoa ?? "—"}</td>
                        <td className="px-3 py-2.5">
                          <span className="inline-flex rounded px-1.5 py-0.5 text-xs bg-gray-100 text-gray-600">
                            {c.classe.split("_")[0]}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 tabular-nums font-medium text-sm">{formatBRL(c.valor)}</td>
                        <td className={`px-3 py-2.5 tabular-nums text-sm ${isTrial ? "" : scoreColor(c.score)}`}>
                          {isTrial
                            ? <span className="font-mono text-gray-300 bg-gray-100 rounded px-1.5 select-none">X.XXX</span>
                            : c.cessivel && c.score ? parseFloat(c.score).toFixed(3) : "—"}
                        </td>
                        <td className="px-3 py-2.5 tabular-nums text-gray-600 text-sm">
                          {isTrial ? <span className="text-gray-300 select-none">R$ •••</span> : formatBRL(c.recuperacaoEsperada)}
                        </td>
                        <td className="px-3 py-2.5 tabular-nums text-gray-600 text-sm">
                          {isTrial ? <span className="text-gray-300 select-none">R$ •••</span> : formatBRL(c.precoAlvoCompra)}
                        </td>
                        <td className="px-3 py-2.5">
                          {c.cessivel && c.score && (
                            <button
                              onClick={() => setCredorAnalise(c)}
                              className="rounded px-2 py-0.5 text-xs border border-gray-200 text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors whitespace-nowrap"
                            >
                              {c.analiseDetalhada ? "📋 Ver" : "✦ Analisar"}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Análise de Portfólio do Processo ── */}
      {processo.credores.length > 0 && (
        <div className="border border-gray-100 rounded-xl bg-white p-4 md:p-5">
          {/* Header — título + botões (empilhados no mobile) */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
            <div>
              <h2 className="text-sm font-semibold text-gray-800">Análise de Portfólio</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Visão quantitativa das oportunidades de cessão neste processo
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              {analisePortfolio && (
                <button
                  onClick={() => setMostrarPortfolio((v) => !v)}
                  className="flex-1 sm:flex-none text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded px-3 py-2 sm:py-1.5"
                >
                  {mostrarPortfolio ? "Ocultar" : "Ver análise"}
                </button>
              )}
              <button
                onClick={() => {
                  setMostrarPortfolio(true)
                  gerarAnalisePortfolio(!!analisePortfolio)
                }}
                disabled={gerandoPortfolio}
                className="flex-1 sm:flex-none text-xs bg-gray-900 text-white rounded px-3 py-2 sm:py-1.5 hover:bg-gray-700 disabled:opacity-40 flex items-center justify-center gap-1.5"
              >
                {gerandoPortfolio ? (
                  <>
                    <span className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin inline-block" />
                    <span>Analisando…</span>
                  </>
                ) : analisePortfolio ? (
                  "↻ Atualizar"
                ) : (
                  "✦ Analisar portfólio"
                )}
              </button>
            </div>
          </div>

          {erroPortfolio && (
            <p className="text-xs text-red-500 bg-red-50 rounded px-3 py-2">{erroPortfolio}</p>
          )}

          {mostrarPortfolio && analisePortfolio && (
            <div className="border-t border-gray-100 pt-4">
              <div className="prose prose-sm prose-gray max-w-none
                prose-headings:text-gray-900 prose-headings:font-semibold prose-headings:mt-4 prose-headings:mb-1
                prose-h2:text-base prose-h2:mt-2
                prose-h3:text-sm prose-h3:border-b prose-h3:border-gray-100 prose-h3:pb-1
                prose-strong:text-gray-900
                prose-p:text-gray-600 prose-p:my-1 prose-p:leading-relaxed
                prose-ul:my-1 prose-li:my-0.5 prose-li:text-gray-700
                prose-table:w-full prose-table:text-xs prose-th:text-gray-500 prose-th:font-medium prose-td:text-gray-700
                prose-hr:border-gray-100 prose-hr:my-3
                [&_table]:block [&_table]:overflow-x-auto">
                <ReactMarkdown>{analisePortfolio}</ReactMarkdown>
              </div>
              {analisePortfolioEm && (
                <p className="text-xs text-gray-400 mt-3 text-right">
                  Gerada em {new Date(analisePortfolioEm).toLocaleDateString("pt-BR")}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {credorAnalise && (
        <ModalAnaliseCredor
          credor={credorAnalise}
          email={session?.user?.email}
          onFechar={() => setCredorAnalise(null)}
        />
      )}

      {glossarioAberto && (
        <GlossarioModal onFechar={() => setGlossarioAberto(false)} />
      )}
    </div>
  )
}
