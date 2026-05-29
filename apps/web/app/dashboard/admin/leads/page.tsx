"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000"

interface Lead {
  id: number
  nome: string
  empresa: string
  cargo: string
  email: string
  whatsapp: string | null
  mensagem: string | null
  status: string
  origem: string
  criadoEm: string
  contatadoEm: string | null
}

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  novo:        { label: "Novo",        cls: "bg-blue-100 text-blue-700" },
  contatado:   { label: "Contatado",   cls: "bg-yellow-100 text-yellow-700" },
  qualificado: { label: "Qualificado", cls: "bg-green-100 text-green-700" },
  rejeitado:   { label: "Rejeitado",   cls: "bg-gray-100 text-gray-500" },
}

export default function AdminLeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [filtroStatus, setFiltroStatus] = useState("")
  const [expandido, setExpandido] = useState<number | null>(null)

  const carregar = useCallback(async () => {
    setLoading(true)
    const params = filtroStatus ? `?status=${filtroStatus}` : ""
    const res = await fetch(`${API_URL}/api/contato/leads${params}`)
    if (res.ok) {
      const d = await res.json()
      setLeads(d.data)
      setTotal(d.total)
    }
    setLoading(false)
  }, [filtroStatus])

  useEffect(() => { carregar() }, [carregar])

  async function mudarStatus(id: number, status: string) {
    await fetch(`${API_URL}/api/contato/leads/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    })
    carregar()
  }

  function exportCSV() {
    const header = ["ID","Nome","Empresa","Cargo","Email","WhatsApp","Status","Recebido","Mensagem"]
    const rows = leads.map((l) => [
      l.id,
      `"${l.nome}"`,
      `"${l.empresa}"`,
      `"${l.cargo}"`,
      l.email,
      l.whatsapp ?? "",
      l.status,
      new Date(l.criadoEm).toLocaleDateString("pt-BR"),
      `"${(l.mensagem ?? "").replace(/"/g, "'")}"`,
    ])
    const csv = [header, ...rows].map((r) => r.join(",")).join("\n")
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url; a.download = "leads-jalun.csv"; a.click()
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-gray-500 hover:text-gray-900 text-sm">← Dashboard</Link>
            <span className="text-gray-300">/</span>
            <h1 className="text-sm font-semibold text-gray-900">Leads — Solicitações de Conversa</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400">{total} total</span>
            <button onClick={exportCSV} className="text-xs border border-gray-200 rounded px-3 py-1.5 hover:bg-gray-50">↓ CSV</button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-6">
        {/* Filtros */}
        <div className="flex items-center gap-3 mb-4">
          <span className="text-xs text-gray-500">Filtrar por status:</span>
          {["", "novo", "contatado", "qualificado", "rejeitado"].map((s) => (
            <button
              key={s}
              onClick={() => setFiltroStatus(s)}
              className={`text-xs rounded-full px-3 py-1 border transition-colors ${
                filtroStatus === s
                  ? "bg-gray-900 text-white border-gray-900"
                  : "border-gray-200 text-gray-600 hover:border-gray-400"
              }`}
            >
              {s === "" ? "Todos" : STATUS_LABEL[s]?.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-700 rounded-full animate-spin" />
          </div>
        ) : leads.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm">Nenhuma solicitação encontrada.</div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  {["Data","Nome","Empresa","Cargo","Email","WhatsApp","Status","Ações"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {leads.map((lead) => {
                  const st = STATUS_LABEL[lead.status] ?? { label: lead.status, cls: "bg-gray-100 text-gray-500" }
                  return (
                    <>
                      <tr
                        key={lead.id}
                        className="hover:bg-gray-50 cursor-pointer"
                        onClick={() => setExpandido(expandido === lead.id ? null : lead.id)}
                      >
                        <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                          {new Date(lead.criadoEm).toLocaleDateString("pt-BR")}
                        </td>
                        <td className="px-4 py-3 font-medium text-gray-900">{lead.nome}</td>
                        <td className="px-4 py-3 text-gray-600">{lead.empresa}</td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{lead.cargo}</td>
                        <td className="px-4 py-3">
                          <a href={`mailto:${lead.email}`} className="text-blue-600 hover:underline text-xs" onClick={(e) => e.stopPropagation()}>
                            {lead.email}
                          </a>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500">{lead.whatsapp ?? "—"}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${st.cls}`}>{st.label}</span>
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={lead.status}
                            onChange={(e) => { e.stopPropagation(); mudarStatus(lead.id, e.target.value) }}
                            onClick={(e) => e.stopPropagation()}
                            className="text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none"
                          >
                            <option value="novo">Novo</option>
                            <option value="contatado">Contatado</option>
                            <option value="qualificado">Qualificado</option>
                            <option value="rejeitado">Rejeitado</option>
                          </select>
                        </td>
                      </tr>
                      {expandido === lead.id && lead.mensagem && (
                        <tr key={`${lead.id}-msg`} className="bg-blue-50">
                          <td colSpan={8} className="px-6 py-3">
                            <p className="text-xs text-gray-500 font-medium mb-1">Mensagem:</p>
                            <p className="text-sm text-gray-700 leading-relaxed">{lead.mensagem}</p>
                          </td>
                        </tr>
                      )}
                    </>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}
