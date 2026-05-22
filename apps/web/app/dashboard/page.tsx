"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import { LogoutButton } from "@/components/logout-button"

interface Processo {
  id: number
  numeroProcesso: string
  tipo: string | null
  subtipo: string | null
  recuperandaRazaoSocial: string | null
  vara: string | null
  estado: string | null
  dataDistribuicao: string | null
  dataDeferimento: string | null
  status: string
  ajNome: string
  totalDocumentos: number
  totalCredores: number
  valorTotal: string | null
  qualidadeBaixa: boolean
}

interface ApiResponse {
  data: Processo[]
  total: number
  pagina: number
  totalPaginas: number
}

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000"

function formatBRL(v: string | null): string {
  if (!v) return "—"
  const n = parseFloat(v)
  if (isNaN(n)) return "—"
  if (n >= 1_000_000_000) return `R$ ${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000) return `R$ ${(n / 1_000_000).toFixed(1)}M`
  return `R$ ${(n / 1_000).toFixed(0)}K`
}

function formatData(d: string | null): string {
  if (!d) return "—"
  return new Date(d).toLocaleDateString("pt-BR")
}

const SUBTIPO_LABEL: Record<string, { label: string; cls: string }> = {
  recuperacao_judicial_ativa:  { label: "RJ ativa",   cls: "bg-blue-100 text-blue-800" },
  recuperacao_judicial_antiga: { label: "RJ antiga",  cls: "bg-slate-100 text-slate-600" },
  falencia_ativa:              { label: "Falência",   cls: "bg-red-100 text-red-700" },
  falencia_antiga:             { label: "Falência antiga", cls: "bg-gray-100 text-gray-500" },
  extrajudicial:               { label: "Extrajudicial", cls: "bg-purple-100 text-purple-800" },
}

export default function DashboardPage() {
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [filtros, setFiltros] = useState({
    estado: "",
    subtipo: "",
    incluir_antigos: false,
    pagina: 1,
  })

  const carregar = useCallback(async () => {
    setLoading(true)
    setErro(null)
    try {
      const params = new URLSearchParams()
      if (filtros.estado) params.set("estado", filtros.estado)
      if (filtros.subtipo) params.set("subtipo", filtros.subtipo)
      if (filtros.incluir_antigos) params.set("incluir_antigos", "true")
      params.set("pagina", String(filtros.pagina))
      params.set("por_pagina", "25")
      const res = await fetch(`${API_URL}/api/processos?${params}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setData(await res.json())
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [filtros])

  useEffect(() => { carregar() }, [carregar])

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-gray-100 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-sm text-gray-500 hover:text-gray-900">← Credor Radar</Link>
            <span className="text-gray-200">/</span>
            <span className="text-sm font-medium">Dashboard</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/dashboard/favoritos" className="text-sm text-amber-500 hover:text-amber-600 transition-colors">
              ★ Favoritos
            </Link>
            <LogoutButton />
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* Filtros */}
        <div className="flex flex-wrap gap-3 mb-6 items-center">
          <select
            value={filtros.estado}
            onChange={(e) => setFiltros((f) => ({ ...f, estado: e.target.value, pagina: 1 }))}
            className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">Todos os estados</option>
            {["SP", "RJ", "MG", "RS", "SC", "PR", "BA", "MT", "MS", "GO"].map((uf) => (
              <option key={uf} value={uf}>{uf}</option>
            ))}
          </select>

          <select
            value={filtros.subtipo}
            onChange={(e) => setFiltros((f) => ({ ...f, subtipo: e.target.value, pagina: 1 }))}
            className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">RJ (ativas + antigas)</option>
            <option value="recuperacao_judicial_ativa">RJ ativas (&lt;36 meses)</option>
            <option value="recuperacao_judicial_antiga">RJ antigas</option>
            <option value="falencia_ativa">Falências ativas</option>
            <option value="falencia_antiga">Falências antigas</option>
            <option value="extrajudicial">Extrajudicial</option>
          </select>

          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={filtros.incluir_antigos}
              onChange={(e) => setFiltros((f) => ({ ...f, incluir_antigos: e.target.checked, subtipo: "", pagina: 1 }))}
              className="rounded border-gray-300"
            />
            Incluir falências
          </label>

          <button onClick={carregar} className="rounded-md border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50">
            ↻
          </button>

          {data && (
            <span className="ml-auto text-sm text-gray-400">
              {data.total} processo{data.total !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {loading && (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        )}
        {erro && <div className="text-center py-16 text-red-500">Erro: {erro}</div>}

        {!loading && !erro && data && (
          <>
            {data.data.length === 0 ? (
              <div className="text-center py-16 text-gray-400 border border-gray-100 rounded-lg">
                <p className="font-medium">Nenhum processo encontrado.</p>
                <p className="text-sm mt-1">Tente ampliar os filtros ou marcar "Incluir falências".</p>
              </div>
            ) : (
              <div className="border border-gray-100 rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      {["Recuperanda", "Subtipo", "Estado", "Vara", "Deferimento", "Credores", "Passivo", "Docs"].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {data.data.map((p) => {
                      const sub = p.subtipo ? SUBTIPO_LABEL[p.subtipo] : null
                      return (
                        <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3">
                            <Link href={`/dashboard/${p.id}`} className="font-medium text-gray-900 hover:text-blue-600 line-clamp-1">
                              {p.recuperandaRazaoSocial?.substring(0, 48) ?? "—"}
                            </Link>
                            <div className="text-xs text-gray-400 font-mono mt-0.5">{p.numeroProcesso}</div>
                          </td>
                          <td className="px-4 py-3">
                            {sub && (
                              <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${sub.cls}`}>
                                {sub.label}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-gray-600">{p.estado ?? "—"}</td>
                          <td className="px-4 py-3 text-gray-500 max-w-xs">
                            <div className="line-clamp-2 text-xs">{p.vara ?? "—"}</div>
                          </td>
                          <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{formatData(p.dataDeferimento)}</td>
                          <td className="px-4 py-3 text-center">
                            {p.totalCredores > 0
                              ? <span className="font-medium">{p.totalCredores}</span>
                              : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-4 py-3 font-medium tabular-nums">
                            {formatBRL(p.valorTotal)}
                            {p.qualidadeBaixa && (
                              <span className="ml-1 text-amber-500 text-xs" title="Lista predominantemente tributária">⚠</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center text-gray-400">{p.totalDocumentos}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {data.totalPaginas > 1 && (
              <div className="flex justify-center gap-2 mt-6">
                <button
                  disabled={filtros.pagina <= 1}
                  onClick={() => setFiltros((f) => ({ ...f, pagina: f.pagina - 1 }))}
                  className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-40"
                >
                  ← Anterior
                </button>
                <span className="px-4 py-1.5 text-sm text-gray-500">
                  {filtros.pagina} / {data.totalPaginas}
                </span>
                <button
                  disabled={filtros.pagina >= data.totalPaginas}
                  onClick={() => setFiltros((f) => ({ ...f, pagina: f.pagina + 1 }))}
                  className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-40"
                >
                  Próxima →
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
