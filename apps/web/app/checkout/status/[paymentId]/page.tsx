"use client"

import { useEffect, useState, useCallback } from "react"
import { useParams, useSearchParams } from "next/navigation"
import Link from "next/link"

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000"

interface StatusData {
  status: string
  pago: boolean
  nome: string
  empresa: string
  metodo: string
  valor: string
  pagoEm: string | null
}

export default function StatusPage() {
  const { paymentId } = useParams<{ paymentId: string }>()
  const params = useSearchParams()
  const metodo   = params.get("metodo") ?? "PIX"
  const pix      = params.get("pix") ?? ""
  const qr       = params.get("qr") ?? ""
  const boletoUrl = params.get("boleto") ?? ""

  const [status, setStatus] = useState<StatusData | null>(null)
  const [copiado, setCopiado] = useState(false)

  const verificar = useCallback(async () => {
    const res = await fetch(`${API_URL}/api/checkout/status/${paymentId}`)
    if (res.ok) setStatus(await res.json())
  }, [paymentId])

  useEffect(() => {
    verificar()
    // Verifica a cada 10s enquanto pendente
    const interval = setInterval(() => {
      if (!status?.pago) verificar()
    }, 10_000)
    return () => clearInterval(interval)
  }, [verificar, status?.pago])

  function copiarPix() {
    navigator.clipboard.writeText(pix)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  const pago = status?.pago ?? false

  return (
    <div className="min-h-screen bg-[#fafafa]">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-xl mx-auto flex items-center justify-between">
          <span className="text-sm font-semibold text-[#0a2540]">Jalun Capital</span>
          <Link href="/" className="text-xs text-gray-400 hover:text-gray-700">← Início</Link>
        </div>
      </header>

      <main className="max-w-xl mx-auto px-6 py-10">
        {pago ? (
          /* ── Pago ── */
          <div className="bg-white rounded-xl border border-green-200 p-8 text-center">
            <div className="text-5xl mb-4">✅</div>
            <h1 className="text-xl font-semibold text-gray-900 mb-2">Pagamento confirmado!</h1>
            <p className="text-sm text-gray-600 mb-6">
              Ativaremos seu acesso em breve e enviaremos as credenciais para <strong>{status?.nome}</strong>.
            </p>
            <div className="bg-green-50 rounded-lg px-4 py-3 text-sm text-green-800">
              Acesso ativo — verifique seu email cadastrado.
            </div>
          </div>
        ) : (
          /* ── Aguardando ── */
          <div className="space-y-5">
            <div className="bg-white rounded-xl border border-gray-100 p-5 flex items-center gap-4">
              <div className="w-3 h-3 rounded-full bg-yellow-400 animate-pulse shrink-0" />
              <div>
                <p className="text-sm font-medium text-gray-900">Aguardando pagamento</p>
                <p className="text-xs text-gray-500 mt-0.5">Esta página atualiza automaticamente ao confirmar</p>
              </div>
              <button onClick={verificar} className="ml-auto text-xs text-gray-400 hover:text-gray-700">↻ Atualizar</button>
            </div>

            {metodo === "PIX" && pix && (
              <div className="bg-white rounded-xl border border-gray-100 p-6">
                <h2 className="text-sm font-semibold text-gray-900 mb-4">Pague via PIX</h2>

                {qr && (
                  <div className="flex justify-center mb-5">
                    <img
                      src={`data:image/png;base64,${qr}`}
                      alt="QR Code PIX"
                      className="w-44 h-44 rounded-lg border border-gray-100"
                    />
                  </div>
                )}

                <div className="bg-gray-50 rounded-lg px-3 py-2.5 mb-3 font-mono text-xs text-gray-700 break-all">
                  {pix}
                </div>

                <button
                  onClick={copiarPix}
                  className="w-full rounded-lg border border-[#0a2540] text-[#0a2540] text-sm font-medium py-2.5 hover:bg-[#0a2540] hover:text-white transition-colors"
                >
                  {copiado ? "✓ Copiado!" : "Copiar código PIX"}
                </button>

                <p className="text-center text-xs text-gray-400 mt-3">
                  R$ 1.997,00 · Vence hoje · Ativação em até 2h após confirmação
                </p>
              </div>
            )}

            {metodo === "BOLETO" && boletoUrl && (
              <div className="bg-white rounded-xl border border-gray-100 p-6">
                <h2 className="text-sm font-semibold text-gray-900 mb-3">Boleto gerado</h2>
                <p className="text-xs text-gray-500 mb-4">Pagamento compensado em ~3 dias úteis após o pagamento.</p>
                <a
                  href={boletoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-center rounded-lg bg-[#0a2540] text-white text-sm font-medium py-2.5 hover:bg-[#0d3560] transition-colors"
                >
                  Abrir boleto →
                </a>
              </div>
            )}

            <p className="text-center text-xs text-gray-400">
              Dúvidas?{" "}
              <a href="mailto:igorbarrosrj@gmail.com" className="underline hover:text-gray-600">
                Fale com o founder
              </a>
            </p>
          </div>
        )}
      </main>
    </div>
  )
}
