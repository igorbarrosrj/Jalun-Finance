"use client"

import { useEffect, useState } from "react"
import Link from "next/link"

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000"

const TIPO_LABEL: Record<string, string> = {
  analise_credor: "Análise de Credor",
  analise_processo: "Análise de Processo",
  extracao_lista: "Extração de Lista",
}

interface CustosData {
  mes: {
    custoUsd: string
    custoBrl: string
    tokensInput: number
    tokensOutput: number
    chamadas: number
  }
  geral: {
    custoUsd: string
    custoBrl: string
    tokensInput: number
    tokensOutput: number
    chamadas: number
  }
  porTipo: Array<{
    tipo: string
    custoUsd: string
    custoBrl: string
    chamadas: number
  }>
  porDia: Array<{
    dia: string
    custoUsd: number
    custoBrl: number
    chamadas: number
  }>
  maioresCredores: Array<{
    credor_id: number
    nome: string
    total_usd: number
    qtd: number
  }>
  maioresProcessos: Array<{
    processo_id: number
    empresa: string
    total_usd: number
    qtd: number
  }>
}

function fmtUsd(v: number | string): string {
  return `US$ ${parseFloat(String(v)).toFixed(4)}`
}
function fmtBrl(v: number | string): string {
  return parseFloat(String(v)).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}
function fmtNum(v: number): string {
  return v.toLocaleString("pt-BR")
}

export default function CustosDashboard() {
  const [dados, setDados] = useState<CustosData | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    fetch(`${API_URL}/api/admin/custos`)
      .then((r) => r.ok ? r.json() : Promise.reject(r.statusText))
      .then(setDados)
      .catch((e) => setErro(String(e)))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
    </div>
  )
  if (erro || !dados) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center text-red-500">{erro ?? "Erro"}</div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-gray-500 hover:text-gray-900 text-sm">← Dashboard</Link>
            <span className="text-gray-300">/</span>
            <h1 className="text-sm font-semibold text-gray-900">Custos IA</h1>
          </div>
          <p className="text-xs text-gray-400">Admin · {new Date().toLocaleDateString("pt-BR")}</p>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-6 space-y-6">

        {/* Cards de resumo */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Custo este mês (USD)", value: fmtUsd(dados.mes.custoUsd), sub: fmtBrl(dados.mes.custoBrl) },
            { label: "Chamadas este mês", value: fmtNum(dados.mes.chamadas), sub: `${fmtNum(dados.mes.tokensInput + dados.mes.tokensOutput)} tokens` },
            { label: "Custo total (USD)", value: fmtUsd(dados.geral.custoUsd), sub: fmtBrl(dados.geral.custoBrl) },
            { label: "Total de chamadas", value: fmtNum(dados.geral.chamadas), sub: `${fmtNum(dados.geral.tokensInput + dados.geral.tokensOutput)} tokens` },
          ].map((card) => (
            <div key={card.label} className="bg-white rounded-xl border border-gray-100 p-4">
              <p className="text-xs text-gray-400 mb-1">{card.label}</p>
              <p className="text-lg font-semibold text-gray-900">{card.value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{card.sub}</p>
            </div>
          ))}
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Por tipo */}
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h2 className="text-sm font-semibold text-gray-800 mb-4">Por tipo de análise</h2>
            {dados.porTipo.length === 0 ? (
              <p className="text-xs text-gray-400">Nenhum dado ainda</p>
            ) : (
              <div className="space-y-3">
                {dados.porTipo.map((t) => {
                  const pct = dados.geral.custoUsd !== "0"
                    ? (parseFloat(t.custoUsd) / parseFloat(dados.geral.custoUsd)) * 100
                    : 0
                  return (
                    <div key={t.tipo}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-gray-700">{TIPO_LABEL[t.tipo] ?? t.tipo}</span>
                        <span className="text-gray-500">{fmtUsd(t.custoUsd)} · {t.chamadas} chamadas</span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-1.5">
                        <div
                          className="bg-blue-500 h-1.5 rounded-full"
                          style={{ width: `${Math.min(100, pct)}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Últimos 30 dias */}
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h2 className="text-sm font-semibold text-gray-800 mb-4">Últimos 30 dias</h2>
            {dados.porDia.length === 0 ? (
              <p className="text-xs text-gray-400">Nenhum dado ainda</p>
            ) : (
              <div className="overflow-y-auto max-h-48">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-400 border-b border-gray-100">
                      <th className="text-left pb-2 font-medium">Data</th>
                      <th className="text-right pb-2 font-medium">USD</th>
                      <th className="text-right pb-2 font-medium">BRL</th>
                      <th className="text-right pb-2 font-medium">Qtd</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {dados.porDia.map((d) => (
                      <tr key={d.dia} className="text-gray-700">
                        <td className="py-1.5">{new Date(d.dia).toLocaleDateString("pt-BR")}</td>
                        <td className="text-right py-1.5 font-mono">{fmtUsd(d.custoUsd)}</td>
                        <td className="text-right py-1.5 font-mono">{fmtBrl(d.custoBrl)}</td>
                        <td className="text-right py-1.5 text-gray-400">{d.chamadas}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Top credores */}
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h2 className="text-sm font-semibold text-gray-800 mb-4">Top credores analisados</h2>
            {dados.maioresCredores.length === 0 ? (
              <p className="text-xs text-gray-400">Nenhuma análise de credor ainda</p>
            ) : (
              <div className="space-y-2">
                {dados.maioresCredores.map((c, i) => (
                  <div key={c.credor_id} className="flex items-center gap-3">
                    <span className="text-xs text-gray-400 w-4">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-900 truncate">{c.nome}</p>
                      <p className="text-xs text-gray-400">{c.qtd} análise{c.qtd !== 1 ? "s" : ""}</p>
                    </div>
                    <span className="text-xs font-mono text-gray-600">{fmtUsd(c.total_usd)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Top processos */}
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h2 className="text-sm font-semibold text-gray-800 mb-4">Top processos por custo</h2>
            {dados.maioresProcessos.length === 0 ? (
              <p className="text-xs text-gray-400">Nenhum custo por processo ainda</p>
            ) : (
              <div className="space-y-2">
                {dados.maioresProcessos.map((p, i) => (
                  <div key={p.processo_id} className="flex items-center gap-3">
                    <span className="text-xs text-gray-400 w-4">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-900 truncate">{p.empresa ?? `Processo #${p.processo_id}`}</p>
                      <p className="text-xs text-gray-400">{p.qtd} operação{p.qtd !== 1 ? "s" : ""}</p>
                    </div>
                    <span className="text-xs font-mono text-gray-600">{fmtUsd(p.total_usd)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <p className="text-xs text-center text-gray-400 pb-4">
          Valores em USD calculados por tokens consumidos · BRL convertido à taxa de R$ 5,70
        </p>
      </main>
    </div>
  )
}
