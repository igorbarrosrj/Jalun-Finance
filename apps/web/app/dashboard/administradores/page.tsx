"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { LogoutButton } from "@/components/logout-button"

interface AJ {
  id: number
  nome: string
  urlBase: string
  estado: string | null
  totalProcessos: number
  rjAtivas: number
  rjAntigas: number
  falencias: number
  processosComCredores: number
  valorTotalPassivo: string
}

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000"

function formatBRL(v: string): string {
  const n = parseFloat(v)
  if (isNaN(n) || n === 0) return "—"
  if (n >= 1_000_000_000) return `R$ ${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000) return `R$ ${(n / 1_000_000).toFixed(1)}M`
  return `R$ ${(n / 1_000).toFixed(0)}K`
}

export default function AdministradoresPage() {
  const [ajs, setAjs] = useState<AJ[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    fetch(`${API_URL}/api/administradores`)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then((d) => { setAjs(d); setLoading(false) })
      .catch((e) => { setErro(e.message); setLoading(false) })
  }, [])

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-gray-100 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-900">← Dashboard</Link>
            <span className="text-gray-200">/</span>
            <span className="text-sm font-medium">Administradores Judiciais</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/dashboard/favoritos" className="text-sm text-amber-500 hover:text-amber-600">★ Favoritos</Link>
            <LogoutButton />
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8">
        <h1 className="text-xl font-semibold text-gray-900 mb-6">Administradores Judiciais monitorados</h1>

        {loading && (
          <div className="space-y-4">
            {[1, 2].map((i) => (
              <div key={i} className="h-32 bg-gray-100 rounded-lg animate-pulse" />
            ))}
          </div>
        )}
        {erro && <div className="text-red-500 py-8">Erro: {erro}</div>}

        {!loading && !erro && ajs && (
          <div className="grid gap-4">
            {ajs.map((aj) => {
              const cobertura = aj.totalProcessos > 0
                ? Math.round((aj.processosComCredores / aj.totalProcessos) * 100)
                : 0

              return (
                <div key={aj.id} className="border border-gray-100 rounded-lg p-5 hover:border-gray-200 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="font-semibold text-gray-900">{aj.nome}</h2>
                      <a
                        href={aj.urlBase}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-gray-400 hover:text-blue-500 transition-colors"
                      >
                        {aj.urlBase}
                      </a>
                    </div>
                    <Link
                      href={`/dashboard?aj_id=${aj.id}`}
                      className="shrink-0 rounded-md border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50 transition-colors"
                    >
                      Ver processos →
                    </Link>
                  </div>

                  <div className="mt-4 grid grid-cols-2 sm:grid-cols-5 gap-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-gray-900 tabular-nums">{aj.totalProcessos}</div>
                      <div className="text-xs text-gray-400 mt-0.5">Total</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-blue-600 tabular-nums">{aj.rjAtivas}</div>
                      <div className="text-xs text-gray-400 mt-0.5">RJ ativas</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-slate-400 tabular-nums">{aj.rjAntigas}</div>
                      <div className="text-xs text-gray-400 mt-0.5">RJ antigas</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-red-500 tabular-nums">{aj.falencias}</div>
                      <div className="text-xs text-gray-400 mt-0.5">Falências</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-emerald-600 tabular-nums">{formatBRL(aj.valorTotalPassivo)}</div>
                      <div className="text-xs text-gray-400 mt-0.5">Passivo total</div>
                    </div>
                  </div>

                  <div className="mt-4">
                    <div className="flex justify-between text-xs text-gray-400 mb-1">
                      <span>Cobertura de credores</span>
                      <span>{aj.processosComCredores}/{aj.totalProcessos} processos ({cobertura}%)</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full transition-all"
                        style={{ width: `${cobertura}%` }}
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
