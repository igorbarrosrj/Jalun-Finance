"use client"

import { useEffect, useState, useRef } from "react"

export interface SolicitacaoStream {
  id: number
  status: string
  creditosConsumidos: number
  criadoEm: string
  iniciadoEm: string | null
  concluidoEm: string | null
  erroMensagem: string | null
  processoId: number
  processo: {
    id: number
    numeroProcesso: string
    recuperandaRazaoSocial: string | null
    estado: string | null
  }
}

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000"

async function fetchSolicitacoes(email: string): Promise<SolicitacaoStream[]> {
  const res = await fetch(
    `${API_URL}/api/extracao/status?email=${encodeURIComponent(email)}`
  )
  if (!res.ok) return []
  const d = await res.json()
  return d.solicitacoes ?? []
}

export function useExtracaoStream(email: string | null | undefined) {
  const [solicitacoes, setSolicitacoes] = useState<SolicitacaoStream[]>([])
  const [connected, setConnected] = useState(false)
  const esRef = useRef<EventSource | null>(null)

  useEffect(() => {
    if (!email) return

    // Polling fallback: busca status a cada 10s (garante atualização mesmo se SSE falhar)
    const poll = async () => {
      const data = await fetchSolicitacoes(email).catch(() => null)
      if (data) setSolicitacoes(data)
    }
    poll() // busca imediata ao montar
    const pollId = setInterval(poll, 10_000)

    // SSE para atualizações em tempo real (quando funcionar)
    const es = new EventSource(
      `${API_URL}/api/extracao/eventos?email=${encodeURIComponent(email)}`
    )
    esRef.current = es

    es.addEventListener("snapshot", (e: MessageEvent) => {
      const data = JSON.parse(e.data) as { solicitacoes: SolicitacaoStream[] }
      setSolicitacoes(data.solicitacoes)
      setConnected(true)
    })

    es.addEventListener("update", (e: MessageEvent) => {
      const data = JSON.parse(e.data) as { solicitacao: SolicitacaoStream }
      setSolicitacoes((prev) => {
        const idx = prev.findIndex((s) => s.id === data.solicitacao.id)
        if (idx === -1) return [data.solicitacao, ...prev]
        const next = [...prev]
        next[idx] = data.solicitacao
        return next
      })
    })

    es.onerror = () => setConnected(false)

    return () => {
      clearInterval(pollId)
      es.close()
      esRef.current = null
    }
  }, [email])

  const ativas = solicitacoes.filter(
    (s) => s.status === "aguardando" || s.status === "processando"
  )

  return { solicitacoes, ativas, connected }
}
