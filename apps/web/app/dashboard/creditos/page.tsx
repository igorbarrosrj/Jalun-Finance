"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import { useSession } from "next-auth/react"
import { LogoutButton } from "@/components/logout-button"

interface Transacao {
  id: number
  tipo: string
  quantidade: number
  descricao: string | null
  criadoEm: string
}

interface SaldoData {
  saldo: number
  ultimaRecarga: string | null
  planoSlug: string | null
  planoNome: string | null
  statusAssinatura: string | null
  proximaRenovacao: string | null
  historicoRecente: Transacao[]
}

interface Pacote {
  id: string
  creditos: number
  precoReais: number
  descricao: string
}

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000"

const TIPO_LABEL: Record<string, { label: string; cls: string }> = {
  renovacao_mensal: { label: "Renovação mensal",    cls: "text-emerald-600" },
  compra_avulsa:    { label: "Compra avulsa",       cls: "text-blue-600" },
  consumo_extracao: { label: "Análise sob demanda", cls: "text-gray-500" },
  devolucao_erro:   { label: "Estorno (erro)",      cls: "text-amber-600" },
  bonus:            { label: "Bônus",               cls: "text-purple-600" },
}

function formatData(d: string | null) {
  if (!d) return "—"
  return new Date(d).toLocaleDateString("pt-BR")
}

export default function CreditosPage() {
  const { data: session, status } = useSession()
  const [dados, setDados] = useState<SaldoData | null>(null)
  const [pacotes, setPacotes] = useState<Pacote[]>([])
  const [comprando, setComprando] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ tipo: "ok" | "erro"; msg: string } | null>(null)

  const carregar = useCallback(async () => {
    if (!session?.user?.email) return
    const res = await fetch(`${API_URL}/api/creditos/saldo?email=${encodeURIComponent(session.user.email)}`)
    if (res.ok) setDados(await res.json())
  }, [session])

  useEffect(() => { carregar() }, [carregar])

  useEffect(() => {
    fetch(`${API_URL}/api/creditos/pacotes`)
      .then((r) => r.ok ? r.json() : [])
      .then((d) => setPacotes(d))
      .catch(() => {})
  }, [])

  async function comprar(pacoteId: string) {
    if (!session?.user?.email) return
    setComprando(pacoteId)
    setFeedback(null)
    try {
      const res = await fetch(`${API_URL}/api/creditos/comprar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: session.user.email, pacote: pacoteId }),
      })
      const data = await res.json()
      if (res.ok) {
        setFeedback({ tipo: "ok", msg: `${data.creditosAdicionados} créditos adicionados. Novo saldo: ${data.novoSaldo} cr.` })
        await carregar()
      } else {
        setFeedback({ tipo: "erro", msg: data.erro ?? "Erro ao processar compra." })
      }
    } catch {
      setFeedback({ tipo: "erro", msg: "Erro de conexão." })
    } finally {
      setComprando(null)
    }
  }

  if (status === "loading") return null

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-gray-100 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-900">← Dashboard</Link>
            <span className="text-gray-200">/</span>
            <span className="text-sm font-medium">Créditos</span>
          </div>
          <LogoutButton />
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-8 space-y-8">

        {/* Saldo atual */}
        {dados && (
          <div className="border border-gray-100 rounded-xl p-6">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-sm text-gray-400 mb-1">Saldo disponível</p>
                <p className="text-5xl font-bold tabular-nums text-gray-900">{dados.saldo}</p>
                <p className="text-sm text-gray-400 mt-1">créditos</p>
              </div>
              <div className="text-right text-sm text-gray-500 space-y-1">
                {dados.planoNome && (
                  <p>
                    <span className="font-medium">{dados.planoNome}</span>
                    {dados.statusAssinatura === "ativa" && <span className="ml-1 text-emerald-600 text-xs">● ativa</span>}
                    {dados.statusAssinatura === "trial" && <span className="ml-1 text-amber-500 text-xs">● trial</span>}
                  </p>
                )}
                {dados.proximaRenovacao && dados.statusAssinatura === "ativa" && (
                  <p className="text-gray-400 text-xs">Renova em {formatData(dados.proximaRenovacao)}</p>
                )}
                {dados.statusAssinatura === "trial" && dados.proximaRenovacao && (
                  <p className="text-amber-500 text-xs">Trial até {formatData(dados.proximaRenovacao)}</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Compra avulsa */}
        <div>
          <h2 className="text-sm font-semibold text-gray-700 mb-1">Comprar créditos avulsos</h2>
          <p className="text-xs text-gray-400 mb-4">
            Cada crédito libera uma análise completa de credores de um processo.{" "}
            <span className="text-amber-600 font-medium">Ambiente sandbox — nenhum pagamento real é cobrado.</span>
          </p>

          {feedback && (
            <div className={`mb-4 rounded-md px-4 py-2.5 text-sm ${feedback.tipo === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
              {feedback.msg}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {pacotes.map((p) => (
              <div key={p.id} className="border border-gray-200 rounded-xl p-5 flex flex-col gap-3 hover:border-blue-300 transition-colors">
                <div>
                  <p className="text-2xl font-bold tabular-nums">{p.creditos}</p>
                  <p className="text-sm text-gray-500">créditos</p>
                </div>
                <p className="text-sm text-gray-700 font-medium">
                  R$ {p.precoReais.toLocaleString("pt-BR")}
                </p>
                <p className="text-xs text-gray-400">
                  ≈ R$ {Math.round(p.precoReais / p.creditos)} / crédito
                </p>
                <button
                  onClick={() => comprar(p.id)}
                  disabled={comprando !== null}
                  className="mt-auto w-full rounded-lg bg-blue-600 text-white py-2 text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {comprando === p.id ? "Processando…" : "Comprar"}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Histórico */}
        <div>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Histórico de transações</h2>
          {!dados || dados.historicoRecente.length === 0 ? (
            <div className="text-sm text-gray-400 border border-gray-100 rounded-lg py-10 text-center">
              Nenhuma transação ainda.
            </div>
          ) : (
            <div className="border border-gray-100 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    {["Data", "Tipo", "Descrição", "Quantidade"].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {dados.historicoRecente.map((t) => {
                    const info = TIPO_LABEL[t.tipo] ?? { label: t.tipo, cls: "text-gray-500" }
                    const positivo = t.quantidade > 0
                    return (
                      <tr key={t.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-400 whitespace-nowrap">{formatData(t.criadoEm)}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-medium ${info.cls}`}>{info.label}</span>
                        </td>
                        <td className="px-4 py-3 text-gray-500 max-w-[200px] truncate">{t.descricao ?? "—"}</td>
                        <td className={`px-4 py-3 font-mono font-medium tabular-nums ${positivo ? "text-emerald-600" : "text-gray-500"}`}>
                          {positivo ? `+${t.quantidade}` : t.quantidade}
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
    </div>
  )
}
