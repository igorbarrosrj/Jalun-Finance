"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000"

export default function CheckoutPage() {
  const router = useRouter()
  const [form, setForm] = useState({
    nome: "", empresa: "", cnpj: "", email: "", whatsapp: "", metodo: "PIX" as "PIX" | "BOLETO",
  })
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const valido = form.nome.trim().length >= 2
    && form.empresa.trim().length >= 1
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)
    && form.whatsapp.trim().length >= 8

  async function gerar(e: React.FormEvent) {
    e.preventDefault()
    if (!valido) return
    setEnviando(true)
    setErro(null)
    try {
      const res = await fetch(`${API_URL}/api/checkout/criar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.erro ?? "Erro ao gerar cobrança")
      router.push(`/checkout/status/${d.paymentId}?metodo=${d.metodo}&pix=${encodeURIComponent(d.pixPayload ?? "")}&qr=${encodeURIComponent(d.pixQrCode ?? "")}&boleto=${encodeURIComponent(d.boletoUrl ?? "")}`)
    } catch (err) {
      setErro((err as Error).message)
    } finally {
      setEnviando(false)
    }
  }

  const input = "w-full rounded-lg border border-gray-200 px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#0a2540]/20 focus:border-[#0a2540] transition-colors"

  return (
    <div className="min-h-screen bg-[#fafafa]">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-xl mx-auto flex items-center justify-between">
          <span className="text-sm font-semibold text-[#0a2540]">Jalun Capital</span>
          <Link href="/" className="text-xs text-gray-400 hover:text-gray-700">← Voltar</Link>
        </div>
      </header>

      <main className="max-w-xl mx-auto px-6 py-10">
        {/* Resumo */}
        <div className="bg-[#0a2540] rounded-xl p-5 mb-8 flex items-center justify-between">
          <div>
            <p className="text-xs text-[#94a3b8] font-mono uppercase tracking-wide mb-1">Design Partner</p>
            <p className="text-white font-semibold">Jalun Capital — Acesso completo</p>
            <p className="text-xs text-[#64748b] mt-0.5">Suporte direto com founder · Voz no roadmap</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-white">R$ 1.997</p>
            <p className="text-xs text-[#64748b]">/mês</p>
          </div>
        </div>

        <form onSubmit={gerar} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Nome completo <span className="text-red-400">*</span></label>
              <input type="text" value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} placeholder="João Silva" className={input} required />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Empresa <span className="text-red-400">*</span></label>
              <input type="text" value={form.empresa} onChange={(e) => setForm((f) => ({ ...f, empresa: e.target.value }))} placeholder="Fundo XYZ" className={input} required />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">CNPJ <span className="text-gray-300 font-normal">(recomendado)</span></label>
            <input type="text" value={form.cnpj} onChange={(e) => setForm((f) => ({ ...f, cnpj: e.target.value }))} placeholder="00.000.000/0001-00" className={input} />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Email <span className="text-red-400">*</span></label>
            <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="joao@fundo.com.br" className={input} required />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">WhatsApp <span className="text-red-400">*</span></label>
            <input type="tel" value={form.whatsapp} onChange={(e) => setForm((f) => ({ ...f, whatsapp: e.target.value }))} placeholder="(21) 99999-9999" className={input} required />
          </div>

          {/* Método */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-3">Método de pagamento <span className="text-red-400">*</span></label>
            <div className="space-y-2">
              {[
                { value: "PIX", label: "PIX", desc: "Ativação em até 2h após confirmação", badge: "Recomendado" },
                { value: "BOLETO", label: "Boleto bancário", desc: "Ativação após compensação (~3 dias úteis)", badge: null },
              ].map((opt) => (
                <label key={opt.value} className={`flex items-start gap-3 rounded-lg border p-3.5 cursor-pointer transition-colors ${form.metodo === opt.value ? "border-[#0a2540] bg-[#0a2540]/5" : "border-gray-200 hover:border-gray-300"}`}>
                  <input
                    type="radio"
                    name="metodo"
                    value={opt.value}
                    checked={form.metodo === opt.value}
                    onChange={() => setForm((f) => ({ ...f, metodo: opt.value as "PIX" | "BOLETO" }))}
                    className="mt-0.5 accent-[#0a2540]"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">{opt.label}</span>
                      {opt.badge && <span className="text-[10px] bg-green-100 text-green-700 font-medium px-1.5 py-0.5 rounded">{opt.badge}</span>}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{opt.desc}</p>
                  </div>
                </label>
              ))}

              {/* Cartão — desabilitado */}
              <div className="flex items-start gap-3 rounded-lg border border-gray-100 p-3.5 opacity-50 cursor-not-allowed">
                <input type="radio" disabled className="mt-0.5" />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-400">Cartão de crédito</span>
                    <span className="text-[10px] bg-gray-100 text-gray-400 font-medium px-1.5 py-0.5 rounded">Em breve</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">Entre em contato para esta modalidade</p>
                </div>
              </div>
            </div>
          </div>

          {erro && <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{erro}</p>}

          <button
            type="submit"
            disabled={!valido || enviando}
            className="w-full rounded-lg bg-[#0a2540] text-white text-sm font-semibold py-3.5 hover:bg-[#0d3560] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {enviando ? "Gerando cobrança…" : "Gerar cobrança →"}
          </button>

          <p className="text-center text-xs text-gray-400">
            Após pagamento confirmado, ativaremos seu acesso em até 2h úteis e enviaremos credenciais pelo email cadastrado.
          </p>
        </form>
      </main>
    </div>
  )
}
