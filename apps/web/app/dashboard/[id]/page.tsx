"use client"

import { useEffect, useState, useMemo, useCallback } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { LogoutButton } from "@/components/logout-button"

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

  const [processo, setProcesso] = useState<Processo | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [filtroClasse, setFiltroClasse] = useState("")
  const [mostrarNaoCessiveis, setMostrarNaoCessiveis] = useState(false)
  const [favoritosSet, setFavoritosSet] = useState<Set<number>>(new Set())

  const indicadores = useIndicadores(processo)

  useEffect(() => {
    fetch(`${API_URL}/api/processos/${id}`)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(setProcesso)
      .catch((e) => setErro((e as Error).message))
      .finally(() => setLoading(false))
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
      <header className="border-b border-gray-100 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-sm text-gray-500 hover:text-gray-900">Credor Radar</Link>
            <span className="text-gray-200">/</span>
            <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-900">Dashboard</Link>
            <span className="text-gray-200">/</span>
            <span className="text-sm font-medium text-gray-700 font-mono">{processo.numeroProcesso}</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/dashboard/favoritos" className="text-sm text-amber-500 hover:text-amber-600 transition-colors" title="Meus favoritos">
              ★ Favoritos
            </Link>
            <LogoutButton />
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">

        {/* Cabeçalho do processo */}
        <div className="border border-gray-100 rounded-lg p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-gray-900 leading-snug">
                {processo.recuperandaRazaoSocial ?? processo.numeroProcesso}
              </h1>
              <p className="mt-1 text-sm text-gray-500 font-mono">{processo.numeroProcesso}</p>
            </div>
            <div className="flex gap-2 flex-wrap justify-end shrink-0">
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

          <div className="mt-3 text-xs text-gray-400">
            <span className="font-medium">AJ:</span> {processo.aj.nome} ·{" "}
            <a href={processo.aj.urlBase} target="_blank" rel="noopener noreferrer" className="hover:underline">
              {processo.aj.urlBase}
            </a>
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
                  <span className={`font-semibold ${scoreColor(indicadores.scoreMedio?.toFixed(2) ?? null)}`}>
                    {indicadores.scoreMedio !== null ? indicadores.scoreMedio.toFixed(3) : "—"}
                  </span>
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
                        <span className={`text-xs font-semibold tabular-nums ${scoreColor(c.score)}`}>
                          {c.score ? parseFloat(c.score).toFixed(2) : "—"}
                        </span>
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

        {/* Credores */}
        <div>
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <h2 className="text-sm font-semibold text-gray-700">
              Credores ({credoresFiltrados.length} exibidos · {cessiveis.length} cessíveis de {processo.credores.length})
            </h2>
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
            <div className="text-center py-12 text-gray-400 border border-gray-100 rounded-lg">
              <p>Nenhum credor extraído ainda.</p>
              <p className="text-xs mt-1">Execute o extrator Claude para processar os PDFs.</p>
            </div>
          ) : (
            <div className="border border-gray-100 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    {["★","#","Nome","Tipo","Classe","Valor","Score v2","Rec. Esperada","Preço-Alvo"].map((h) => (
                      <th key={h} className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">
                        {h}
                      </th>
                    ))}
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
                            title={favoritosSet.has(c.id) ? "Remover favorito" : "Adicionar favorito"}
                          >
                            ★
                          </button>
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
                      <td className={`px-3 py-2.5 tabular-nums text-sm ${scoreColor(c.score)}`}>
                        {c.cessivel && c.score ? parseFloat(c.score).toFixed(3) : "—"}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums text-gray-600 text-sm">{formatBRL(c.recuperacaoEsperada)}</td>
                      <td className="px-3 py-2.5 tabular-nums text-gray-600 text-sm">{formatBRL(c.precoAlvoCompra)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
