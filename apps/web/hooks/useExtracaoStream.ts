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

export function useExtracaoStream(email: string | null | undefined) {
  const [solicitacoes, setSolicitacoes] = useState<SolicitacaoStream[]>([])
  const [connected, setConnected] = useState(false)
  const esRef = useRef<EventSource | null>(null)

  useEffect(() => {
    if (!email) return

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
      es.close()
      esRef.current = null
    }
  }, [email])

  const ativas = solicitacoes.filter(
    (s) => s.status === "aguardando" || s.status === "processando"
  )

  return { solicitacoes, ativas, connected }
}
