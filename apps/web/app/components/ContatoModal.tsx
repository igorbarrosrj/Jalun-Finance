"use client"

import { useState } from "react"

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000"

interface Props {
  onFechar: () => void
}

export function ContatoModal({ onFechar }: Props) {
  const [form, setForm] = useState({
    nome: "", empresa: "", cargo: "", email: "", whatsapp: "", mensagem: "",
  })
  const [enviando, setEnviando] = useState(false)
  const [sucesso, setSucesso] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const valido = form.nome.trim().length >= 2
    && form.empresa.trim().length >= 1
    && form.cargo.trim().length >= 1
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (!valido) return
    setEnviando(true)
    setErro(null)
    try {
      const res = await fetch(`${API_URL}/api/contato/solicitar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.erro ?? "Erro ao enviar")
      setSucesso(true)
    } catch (err) {
      setErro((err as Error).message)
    } finally {
      setEnviando(false)
    }
  }

  function campo(label: string, key: keyof typeof form, opts?: {
    type?: string; placeholder?: string; obrigatorio?: boolean; textarea?: boolean
  }) {
    const { type = "text", placeholder = "", obrigatorio = false, textarea = false } = opts ?? {}
    const base = "w-full rounded-lg border border-[#e2e8f0] px-3.5 py-2.5 text-sm text-[#0a0a0a] placeholder:text-[#94a3b8] focus:outline-none focus:ring-2 focus:ring-[#0a2540]/30 focus:border-[#0a2540] transition-colors"
    return (
      <div>
        <label className="block text-xs font-medium text-[#475569] mb-1.5">
          {label}{obrigatorio && <span className="text-red-400 ml-0.5">*</span>}
        </label>
        {textarea ? (
          <textarea
            rows={3}
            value={form[key]}
            onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
            placeholder={placeholder}
            className={`${base} resize-none`}
          />
        ) : (
          <input
            type={type}
            value={form[key]}
            onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
            placeholder={placeholder}
            required={obrigatorio}
            className={base}
          />
        )}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={(e) => { if (e.target === e.currentTarget) onFechar() }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col">

        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-6 pb-4 border-b border-[#f1f5f9]">
          <div>
            <h2 className="text-base font-semibold text-[#0a2540]">Vamos conversar sobre seu uso do Jalun</h2>
            <p className="text-sm text-[#64748b] mt-0.5">Preencha rapidamente que entro em contato em até 24h.</p>
          </div>
          <button onClick={onFechar} className="text-[#94a3b8] hover:text-[#0a0a0a] text-xl ml-4 shrink-0 p-1">×</button>
        </div>

        {/* Conteúdo */}
        <div className="overflow-y-auto flex-1 px-6 py-5">
          {sucesso ? (
            <div className="text-center py-8">
              <div className="text-4xl mb-4">✓</div>
              <h3 className="text-base font-semibold text-[#0a2540] mb-2">Recebemos sua solicitação</h3>
              <p className="text-sm text-[#64748b] mb-1">Entrarei em contato em até 24h no email informado.</p>
              <p className="text-sm text-[#64748b] mb-6">Enquanto isso, você pode explorar mais sobre o produto no nosso conteúdo.</p>
              <button onClick={onFechar} className="rounded-lg bg-[#0a2540] text-white text-sm font-medium px-6 py-2.5 hover:bg-[#0d3560] transition-colors">
                Fechar
              </button>
            </div>
          ) : (
            <form onSubmit={enviar} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {campo("Nome completo", "nome", { obrigatorio: true, placeholder: "João Silva" })}
                {campo("Empresa", "empresa", { obrigatorio: true, placeholder: "Fundo XYZ" })}
              </div>
              {campo("Cargo", "cargo", { obrigatorio: true, placeholder: "Gestor de Crédito" })}
              {campo("Email profissional", "email", { type: "email", obrigatorio: true, placeholder: "joao@fundo.com.br" })}
              {campo("WhatsApp", "whatsapp", { placeholder: "(21) 99999-9999" })}
              {campo("Conte um pouco sobre seu interesse", "mensagem", {
                textarea: true,
                placeholder: "Ex: atuamos com cessão de crédito em RJ, queremos entender como o Jalun pode acelerar nossa operação",
              })}

              {erro && <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{erro}</p>}

              <button
                type="submit"
                disabled={!valido || enviando}
                className="w-full rounded-lg bg-[#0a2540] text-white text-sm font-semibold py-3 hover:bg-[#0d3560] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {enviando ? "Enviando…" : "Enviar solicitação →"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
