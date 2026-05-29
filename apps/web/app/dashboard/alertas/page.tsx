"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import { useSession } from "next-auth/react"
import { LogoutButton } from "@/components/logout-button"
import { useMe } from "@/hooks/useMe"

interface Alerta {
  id: number
  estados: string[]
  classes: string[]
  scoreMinimo: string | null
  valorMinimo: string | null
  valorMaximo: string | null
  canal: string
  ativo: boolean
  criadoEm: string
}

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000"

const ESTADOS = ["SP", "RJ", "MG", "RS", "SC", "PR", "BA", "MT", "MS", "GO"]
const CLASSES = [
  { k: "I_trabalhista",     v: "I — Trabalhista" },
  { k: "II_garantia_real",  v: "II — Garantia Real" },
  { k: "III_quirografario", v: "III — Quirografário" },
  { k: "IV_me_epp",         v: "IV — ME/EPP" },
]

function formatBRL(v: string | null) {
  if (!v) return "—"
  const n = parseFloat(v)
  if (isNaN(n)) return "—"
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n)
}

export default function AlertasPage() {
  const { data: session, status } = useSession()
  const { me, isAssinante } = useMe()
  const [alertas, setAlertas] = useState<Alerta[]>([])
  const [loading, setLoading] = useState(true)
  const [criando, setCriando] = useState(false)
  const [form, setForm] = useState({
    estados: [] as string[],
    classes: [] as string[],
    scoreMinimo: "",
    valorMinimo: "",
    valorMaximo: "",
  })

  const carregar = useCallback(async () => {
    if (!session?.user?.email) return
    const res = await fetch(`${API_URL}/api/alertas?email=${encodeURIComponent(session.user.email)}`)
    if (res.ok) setAlertas(await res.json())
    setLoading(false)
  }, [session])

  useEffect(() => { carregar() }, [carregar])

  async function toggleAtivo(id: number, ativo: boolean) {
    if (!session?.user?.email) return
    const res = await fetch(`${API_URL}/api/alertas/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: session.user.email, ativo }),
    })
    if (res.ok) setAlertas((prev) => prev.map((a) => a.id === id ? { ...a, ativo } : a))
  }

  async function excluir(id: number) {
    if (!session?.user?.email) return
    if (!confirm("Remover este alerta?")) return
    await fetch(`${API_URL}/api/alertas/${id}?email=${encodeURIComponent(session.user.email)}`, { method: "DELETE" })
    setAlertas((prev) => prev.filter((a) => a.id !== id))
  }

  async function criar() {
    if (!session?.user?.email) return
    setCriando(true)
    const res = await fetch(`${API_URL}/api/alertas`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: session.user.email,
        estados: form.estados,
        classes: form.classes,
        scoreMinimo: form.scoreMinimo ? parseFloat(form.scoreMinimo) : undefined,
        valorMinimo: form.valorMinimo ? parseFloat(form.valorMinimo.replace(/\D/g, "")) : undefined,
        valorMaximo: form.valorMaximo ? parseFloat(form.valorMaximo.replace(/\D/g, "")) : undefined,
      }),
    })
    if (res.ok) {
      const novo = await res.json()
      setAlertas((prev) => [novo, ...prev])
      setForm({ estados: [], classes: [], scoreMinimo: "", valorMinimo: "", valorMaximo: "" })
    }
    setCriando(false)
  }

  function toggleItem<T>(arr: T[], item: T): T[] {
    return arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item]
  }

  if (status === "loading") return null

  const bloqueado = !isAssinante || (me?.plano === "starter")

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-gray-100 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-900">← Dashboard</Link>
            <span className="text-gray-200">/</span>
            <span className="text-sm font-medium">Alertas de processos</span>
          </div>
          <LogoutButton />
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-8 space-y-8">

        {bloqueado && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
            <p className="font-semibold mb-1">Disponível a partir do plano Pro</p>
            <p className="text-amber-700 text-xs">Alertas por email notificam quando novos processos aparecem com credores que batem nos seus critérios.</p>
            <Link href="/planos" className="mt-2 inline-block rounded-md bg-amber-600 px-3 py-1 text-xs font-medium text-white hover:bg-amber-700">
              Ver planos →
            </Link>
          </div>
        )}

        {/* Criar novo alerta */}
        {!bloqueado && (
          <div className="border border-gray-100 rounded-xl p-6">
            <h2 className="text-sm font-semibold text-gray-800 mb-4">Criar alerta</h2>

            <div className="space-y-4">
              {/* Estados */}
              <div>
                <label className="block text-xs text-gray-500 mb-1.5">Estados (vazio = todos)</label>
                <div className="flex flex-wrap gap-1.5">
                  {ESTADOS.map((uf) => (
                    <button
                      key={uf}
                      onClick={() => setForm((f) => ({ ...f, estados: toggleItem(f.estados, uf) }))}
                      className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                        form.estados.includes(uf)
                          ? "bg-blue-600 text-white"
                          : "border border-gray-200 text-gray-600 hover:border-blue-400"
                      }`}
                    >
                      {uf}
                    </button>
                  ))}
                </div>
              </div>

              {/* Classes */}
              <div>
                <label className="block text-xs text-gray-500 mb-1.5">Classes de crédito (vazio = todas)</label>
                <div className="flex flex-wrap gap-1.5">
                  {CLASSES.map((c) => (
                    <button
                      key={c.k}
                      onClick={() => setForm((f) => ({ ...f, classes: toggleItem(f.classes, c.k) }))}
                      className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                        form.classes.includes(c.k)
                          ? "bg-blue-600 text-white"
                          : "border border-gray-200 text-gray-600 hover:border-blue-400"
                      }`}
                    >
                      {c.v}
                    </button>
                  ))}
                </div>
              </div>

              {/* Thresholds */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Score mínimo</label>
                  <input
                    type="number"
                    min={0} max={1} step={0.05}
                    placeholder="ex: 0.30"
                    value={form.scoreMinimo}
                    onChange={(e) => setForm((f) => ({ ...f, scoreMinimo: e.target.value }))}
                    className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Valor mínimo (R$)</label>
                  <input
                    type="number"
                    min={0} step={1000}
                    placeholder="ex: 50000"
                    value={form.valorMinimo}
                    onChange={(e) => setForm((f) => ({ ...f, valorMinimo: e.target.value }))}
                    className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Valor máximo (R$)</label>
                  <input
                    type="number"
                    min={0} step={1000}
                    placeholder="ex: 5000000"
                    value={form.valorMaximo}
                    onChange={(e) => setForm((f) => ({ ...f, valorMaximo: e.target.value }))}
                    className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <button
                onClick={criar}
                disabled={criando}
                className="rounded-lg bg-[#0a0a0a] px-4 py-2 text-sm font-medium text-white hover:bg-[#1a1a1a] disabled:opacity-50"
              >
                {criando ? "Criando…" : "Criar alerta →"}
              </button>
            </div>
          </div>
        )}

        {/* Lista de alertas */}
        <div>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Meus alertas</h2>
          {loading && (
            <div className="space-y-2">
              {[1, 2].map((i) => <div key={i} className="h-16 bg-gray-100 rounded animate-pulse" />)}
            </div>
          )}
          {!loading && alertas.length === 0 && (
            <div className="text-center py-10 text-gray-400 border border-gray-100 rounded-lg text-sm">
              {bloqueado ? "Faça upgrade para criar alertas." : "Nenhum alerta criado ainda."}
            </div>
          )}
          {!loading && alertas.length > 0 && (
            <div className="space-y-3">
              {alertas.map((a) => (
                <div key={a.id} className="border border-gray-100 rounded-lg p-4 flex items-start justify-between gap-4">
                  <div className="text-sm space-y-1 flex-1">
                    <div className="flex flex-wrap gap-1.5">
                      {a.estados.length > 0
                        ? a.estados.map((e) => <span key={e} className="rounded bg-blue-50 text-blue-700 px-1.5 py-0.5 text-xs font-medium">{e}</span>)
                        : <span className="text-xs text-gray-400">Todos os estados</span>}
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs text-gray-500">
                      {a.scoreMinimo && <span>Score ≥ {parseFloat(a.scoreMinimo).toFixed(2)}</span>}
                      {a.valorMinimo && <span>Valor ≥ {formatBRL(a.valorMinimo)}</span>}
                      {a.valorMaximo && <span>Valor ≤ {formatBRL(a.valorMaximo)}</span>}
                      {!a.scoreMinimo && !a.valorMinimo && !a.valorMaximo && a.classes.length === 0 && (
                        <span className="text-gray-400">Qualquer processo novo</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => toggleAtivo(a.id, !a.ativo)}
                      className={`w-9 h-5 rounded-full transition-colors ${a.ativo ? "bg-emerald-400" : "bg-gray-200"}`}
                      title={a.ativo ? "Desativar" : "Ativar"}
                    >
                      <span className={`block w-4 h-4 rounded-full bg-white shadow transition-transform ${a.ativo ? "translate-x-4" : "translate-x-0.5"}`} />
                    </button>
                    <button
                      onClick={() => excluir(a.id)}
                      className="text-gray-300 hover:text-red-500 transition-colors text-lg leading-none"
                      title="Excluir"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
