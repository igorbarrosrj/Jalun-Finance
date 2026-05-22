"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { LogoutButton } from "@/components/logout-button"

interface CredorFavorito {
  id: number
  notas: string | null
  criadoEm: string
  credor: {
    id: number
    nome: string
    classe: string | null
    valor: string | null
    score: string | null
    tipoPessoa: string | null
    processo: {
      id: number
      numeroProcesso: string
      recuperandaRazaoSocial: string | null
      estado: string | null
    }
  }
}

function formatBRL(v: string | null): string {
  if (!v) return "—"
  const n = parseFloat(v)
  if (isNaN(n)) return "—"
  if (n >= 1_000_000) return `R$ ${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `R$ ${(n / 1_000).toFixed(0)}K`
  return `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 0 })}`
}

function scoreColor(s: string | null): string {
  if (!s) return "text-gray-300"
  const n = parseFloat(s)
  if (n >= 0.45) return "text-emerald-600"
  if (n >= 0.25) return "text-amber-500"
  return "text-gray-400"
}

export default function FavoritosPage() {
  const [favoritos, setFavoritos] = useState<CredorFavorito[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/favoritos")
      .then((r) => r.json())
      .then(setFavoritos)
      .finally(() => setLoading(false))
  }, [])

  async function remover(credorId: number) {
    await fetch(`/api/favoritos/${credorId}`, { method: "DELETE" })
    setFavoritos((f) => f.filter((fav) => fav.credor.id !== credorId))
  }

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-gray-100 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-900">
              ← Dashboard
            </Link>
            <span className="text-gray-200">/</span>
            <span className="text-sm font-medium">Favoritos</span>
          </div>
          <LogoutButton />
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-lg font-semibold text-gray-900">Credores favoritos</h1>
          {!loading && (
            <span className="text-sm text-gray-400">
              {favoritos.length} credor{favoritos.length !== 1 ? "es" : ""}
            </span>
          )}
        </div>

        {loading && (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-14 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        )}

        {!loading && favoritos.length === 0 && (
          <div className="text-center py-20 border border-gray-100 rounded-lg">
            <p className="text-gray-400 font-medium">Nenhum favorito ainda.</p>
            <p className="text-sm text-gray-300 mt-1">
              Clique na estrela ★ em um processo para salvar credores.
            </p>
            <Link
              href="/dashboard"
              className="mt-4 inline-block text-sm text-[#064e3b] hover:underline"
            >
              Ver processos →
            </Link>
          </div>
        )}

        {!loading && favoritos.length > 0 && (
          <div className="border border-gray-100 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {["Credor", "Processo", "Estado", "Classe", "Valor", "Score", ""].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {favoritos.map((fav) => (
                  <tr key={fav.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900 max-w-xs">
                      <div className="line-clamp-1">{fav.credor.nome}</div>
                      {fav.notas && (
                        <div className="text-xs text-gray-400 mt-0.5 line-clamp-1">{fav.notas}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/dashboard/${fav.credor.processo.id}`}
                        className="text-[#064e3b] hover:underline line-clamp-1"
                      >
                        {fav.credor.processo.recuperandaRazaoSocial?.substring(0, 40) ?? "—"}
                      </Link>
                      <div className="text-xs text-gray-400 font-mono mt-0.5">
                        {fav.credor.processo.numeroProcesso}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{fav.credor.processo.estado ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-600">{fav.credor.classe ?? "—"}</td>
                    <td className="px-4 py-3 font-medium tabular-nums">{formatBRL(fav.credor.valor)}</td>
                    <td className={`px-4 py-3 font-mono tabular-nums font-medium ${scoreColor(fav.credor.score)}`}>
                      {fav.credor.score ? parseFloat(fav.credor.score).toFixed(2) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => remover(fav.credor.id)}
                        className="text-amber-400 hover:text-gray-300 transition-colors text-base"
                        title="Remover favorito"
                      >
                        ★
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
