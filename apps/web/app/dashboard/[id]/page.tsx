"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"

interface Credor {
  id: number
  nome: string
  documento: string | null
  tipoPessoa: string | null
  valor: string
  moeda: string
  classe: string
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
  recuperandaRazaoSocial: string | null
  vara: string | null
  comarca: string | null
  estado: string | null
  dataDistribuicao: string | null
  dataDeferimento: string | null
  status: string
  aj: { nome: string; urlBase: string }
  documentos: Array<{ id: number; tipoDocumento: string | null; nomeArquivo: string | null; extraido: boolean }>
  credores: Credor[]
}

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000"

const CLASSES: Record<string, string> = {
  I_trabalhista: "Classe I — Trabalhista",
  II_garantia_real: "Classe II — Garantia Real",
  III_quirografario: "Classe III — Quirografário",
  IV_me_epp: "Classe IV — ME/EPP",
  extraconcursal: "Extraconcursal",
}

function formatBRL(v: string | null): string {
  if (!v) return "—"
  const n = parseFloat(v)
  if (isNaN(n)) return "—"
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n)
}

function formatData(d: string | null): string {
  if (!d) return "—"
  return new Date(d).toLocaleDateString("pt-BR")
}

function scoreColor(s: string | null): string {
  if (!s) return "text-gray-300"
  const n = parseFloat(s)
  if (n >= 0.3) return "text-emerald-600 font-semibold"
  if (n >= 0.15) return "text-amber-600"
  return "text-red-500"
}

function exportCSV(credores: Credor[], processo: Processo) {
  const header = ["Posição", "Nome", "Documento", "Classe", "Valor (BRL)", "Score", "Recuperação Esperada", "Preço-Alvo"]
  const rows = credores.map((c) => [
    c.posicaoLista ?? "",
    `"${c.nome}"`,
    c.documento ?? "",
    CLASSES[c.classe] ?? c.classe,
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

export default function ProcessoDetalhePage() {
  const params = useParams()
  const id = params["id"] as string

  const [processo, setProcesso] = useState<Processo | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [filtroClasse, setFiltroClasse] = useState("")

  useEffect(() => {
    fetch(`${API_URL}/api/processos/${id}`)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(setProcesso)
      .catch((e) => setErro((e as Error).message))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-400">Carregando...</div>
  if (erro || !processo) return <div className="min-h-screen flex items-center justify-center text-red-500">{erro ?? "Não encontrado"}</div>

  const credoresFiltrados = filtroClasse
    ? processo.credores.filter((c) => c.classe === filtroClasse)
    : processo.credores

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-gray-100 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center gap-3">
          <Link href="/" className="text-sm text-gray-500 hover:text-gray-900">Credor Radar</Link>
          <span className="text-gray-200">/</span>
          <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-900">Dashboard</Link>
          <span className="text-gray-200">/</span>
          <span className="text-sm font-medium text-gray-700 font-mono">{processo.numeroProcesso}</span>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* Cabeçalho do processo */}
        <div className="border border-gray-100 rounded-lg p-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900">
                {processo.recuperandaRazaoSocial ?? processo.numeroProcesso}
              </h1>
              <p className="mt-1 text-sm text-gray-500 font-mono">{processo.numeroProcesso}</p>
            </div>
            <div className="flex gap-2">
              {processo.tipo && (
                <span className="inline-flex rounded-md px-2.5 py-1 text-xs font-medium bg-blue-100 text-blue-800">
                  {processo.tipo}
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
            <div><span className="text-gray-400">Estado</span><div className="font-medium">{processo.estado ?? "—"}</div></div>
            <div><span className="text-gray-400">Comarca</span><div className="font-medium">{processo.comarca ?? "—"}</div></div>
            <div><span className="text-gray-400">Deferimento</span><div className="font-medium">{formatData(processo.dataDeferimento)}</div></div>
            <div><span className="text-gray-400">Distribuição</span><div className="font-medium">{formatData(processo.dataDistribuicao)}</div></div>
          </div>

          <div className="mt-3 text-xs text-gray-400">
            <span className="font-medium">AJ:</span> {processo.aj.nome} ·{" "}
            <a href={processo.aj.urlBase} target="_blank" rel="noopener noreferrer" className="hover:underline">
              {processo.aj.urlBase}
            </a>
          </div>

          {processo.vara && (
            <div className="mt-2 text-xs text-gray-500 border-l-2 border-gray-100 pl-3">
              {processo.vara}
            </div>
          )}
        </div>

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
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700">
              Credores ({credoresFiltrados.length} de {processo.credores.length})
            </h2>
            <div className="flex gap-2">
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
                    {["#", "Nome", "Documento", "Classe", "Valor", "Score", "Rec. Esperada", "Preço-Alvo"].map((h) => (
                      <th key={h} className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {credoresFiltrados.map((c) => (
                    <tr key={c.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2.5 text-gray-400 tabular-nums">{c.posicaoLista ?? "—"}</td>
                      <td className="px-3 py-2.5 font-medium text-gray-900 max-w-xs">
                        <div className="line-clamp-1">{c.nome}</div>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs text-gray-500">{c.documento ?? "—"}</td>
                      <td className="px-3 py-2.5">
                        <span className="inline-flex rounded px-1.5 py-0.5 text-xs bg-gray-100 text-gray-600">
                          {c.classe.split("_")[0]}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 tabular-nums font-medium">{formatBRL(c.valor)}</td>
                      <td className={`px-3 py-2.5 tabular-nums ${scoreColor(c.score)}`}>
                        {c.score ? parseFloat(c.score).toFixed(3) : "—"}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums text-gray-600">{formatBRL(c.recuperacaoEsperada)}</td>
                      <td className="px-3 py-2.5 tabular-nums text-gray-600">{formatBRL(c.precoAlvoCompra)}</td>
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
