"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import { useSession } from "next-auth/react"
import { LogoutButton } from "@/components/logout-button"
import { useExtracaoStream } from "@/hooks/useExtracaoStream"

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000"

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  aguardando:  { label: "Na fila",      cls: "bg-yellow-100 text-yellow-800" },
  processando: { label: "Processando",  cls: "bg-blue-100 text-blue-700" },
  concluida:   { label: "Concluída",    cls: "bg-emerald-100 text-emerald-700" },
  erro:        { label: "Erro",         cls: "bg-red-100 text-red-700" },
}

function formatData(d: string | null) {
  if (!d) return "—"
  return new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
}

export default function MinhasAnalisesPage() {
  const { data: session, status } = useSession()
  const { solicitacoes: streamData, connected } = useExtracaoStream(session?.user?.email)

  // Estado local só para filtro e carregamento inicial via REST (fallback)
  const [filtroStatus, setFiltroStatus] = useState("")
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)

  // Carregamento inicial via REST para popular o total e suportar filtro por status
  const carregar = useCallback(async () => {
    if (!session?.user?.email) return
    setLoading(true)
    const params = new URLSearchParams({ email: session.user.email, por_pagina: "50" })
    if (filtroStatus) params.set("status", filtroStatus)
    const res = await fetch(`${API_URL}/api/extracao?${params}`)
    if (res.ok) {
      const d = await res.json()
      setTotal(d.total)
    }
    setLoading(false)
  }, [session, filtroStatus])

  useEffect(() => { carregar() }, [carregar])

  // Uma vez que o SSE conectar, considera o loading encerrado
  useEffect(() => {
    if (connected) setLoading(false)
  }, [connected])

  const solicitacoes = filtroStatus
    ? streamData.filter((s) => s.status === filtroStatus)
    : streamData

  if (status === "loading") return null

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-gray-100 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-900">← Dashboard</Link>
            <span className="text-gray-200">/</span>
            <span className="text-sm font-medium">Minhas análises</span>
          </div>
          <LogoutButton />
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold text-gray-900">Análises sob demanda</h1>
              <span
                title={connected ? "Atualizações em tempo real ativas" : "Reconectando…"}
                className={`w-2 h-2 rounded-full shrink-0 ${connected ? "bg-emerald-400 animate-pulse" : "bg-gray-300"}`}
              />
            </div>
            <p className="text-sm text-gray-400 mt-0.5">{solicitacoes.length} solicitaç{solicitacoes.length !== 1 ? "ões" : "ão"}</p>
          </div>
          <div className="flex gap-2">
            <select
              value={filtroStatus}
              onChange={(e) => setFiltroStatus(e.target.value)}
              className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">Todos os status</option>
              <option value="aguardando">Na fila</option>
              <option value="processando">Processando</option>
              <option value="concluida">Concluídas</option>
              <option value="erro">Com erro</option>
            </select>
            <button onClick={carregar} className="rounded-md border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50">
              ↻
            </button>
          </div>
        </div>

        {loading && (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-14 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        )}

        {!loading && solicitacoes.length === 0 && (
          <div className="text-center py-16 text-gray-400 border border-gray-100 rounded-lg">
            <p className="font-medium">Nenhuma análise solicitada ainda.</p>
            <p className="text-sm mt-1">Abra um processo sem credores extraídos e clique em "Analisar agora".</p>
          </div>
        )}

        {!loading && solicitacoes.length > 0 && (
          <div className="border border-gray-100 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {["Processo", "Solicitado em", "Status", "Créditos", "Concluído em", "Ação"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {solicitacoes.map((s) => {
                  const badge = STATUS_BADGE[s.status] ?? { label: s.status, cls: "bg-gray-100 text-gray-600" }
                  return (
                    <tr key={s.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900 line-clamp-1">
                          {s.processo.recuperandaRazaoSocial?.substring(0, 50) ?? "—"}
                        </div>
                        <div className="text-xs text-gray-400 font-mono mt-0.5">{s.processo.numeroProcesso}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatData(s.criadoEm)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${badge.cls}`}>
                          {badge.label}
                        </span>
                        {s.erroMensagem && (
                          <p className="text-xs text-red-500 mt-1 max-w-[200px] truncate" title={s.erroMensagem}>
                            {s.erroMensagem}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center text-gray-500">{s.creditosConsumidos}</td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatData(s.concluidoEm)}</td>
                      <td className="px-4 py-3">
                        {s.status === "concluida" ? (
                          <Link
                            href={`/dashboard/${s.processo.id}`}
                            className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                          >
                            Ver análise →
                          </Link>
                        ) : s.status === "aguardando" || s.status === "processando" ? (
                          <span className="text-xs text-gray-400 animate-pulse">Em andamento…</span>
                        ) : null}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
