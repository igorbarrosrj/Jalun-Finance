"use client"

import { useSession } from "next-auth/react"
import { useEffect, useState } from "react"

export interface MeData {
  papel: string
  plano: string | null
  planoNome: string | null
  statusAssinatura: string | null
  saldoCreditos: number
  proximaRenovacao: string | null
  diasRestantesTrial: number | null
}

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000"

export function useMe() {
  const { data: session, status } = useSession()
  const [me, setMe] = useState<MeData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (status !== "authenticated" || !session?.user?.email) {
      setLoading(false)
      return
    }

    fetch(`${API_URL}/api/me?email=${encodeURIComponent(session.user.email)}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { setMe(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [session, status])

  const isTrial = me?.papel === "trial" || me?.statusAssinatura === "trial"
  const isAssinante = me?.statusAssinatura === "ativa"

  return { me, loading, isTrial, isAssinante }
}
