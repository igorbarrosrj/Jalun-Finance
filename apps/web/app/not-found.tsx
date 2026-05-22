import Link from "next/link"

export default function NotFound() {
  return (
    <main className="min-h-screen bg-white flex items-center justify-center px-6">
      <div className="text-center max-w-sm">
        <p className="font-mono text-xs text-[#064e3b] uppercase tracking-[0.15em] mb-4">404</p>
        <h1 className="text-2xl font-semibold tracking-tight text-[#0a0a0a] mb-3">Página não encontrada</h1>
        <p className="text-sm text-[#525252] mb-8">
          Esta página não existe ou foi movida.
        </p>
        <Link
          href="/"
          className="inline-flex items-center rounded-md bg-[#0a0a0a] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#1a1a1a] transition-colors"
        >
          Voltar ao início
        </Link>
      </div>
    </main>
  )
}
