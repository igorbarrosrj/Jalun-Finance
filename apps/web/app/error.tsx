"use client"

import { useEffect } from "react"

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <main className="min-h-screen bg-white flex items-center justify-center px-6">
      <div className="text-center max-w-sm">
        <p className="font-mono text-xs text-[#064e3b] uppercase tracking-[0.15em] mb-4">500</p>
        <h1 className="text-2xl font-semibold tracking-tight text-[#0a0a0a] mb-3">Algo deu errado</h1>
        <p className="text-sm text-[#525252] mb-8">
          Ocorreu um erro inesperado. Tente novamente.
        </p>
        <button
          onClick={reset}
          className="inline-flex items-center rounded-md bg-[#0a0a0a] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#1a1a1a] transition-colors"
        >
          Tentar novamente
        </button>
      </div>
    </main>
  )
}
