import Link from "next/link"

async function getStats() {
  try {
    const apiUrl = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000"
    const res = await fetch(`${apiUrl}/api/stats`, { next: { revalidate: 60 } })
    if (!res.ok) return null
    return res.json() as Promise<{
      totalProcessos: number
      totalCredores: number
      valorTotalPassivo: string
      processosMonitorados: number
    }>
  } catch {
    return null
  }
}

function formatBRL(valor: string | null): string {
  if (!valor) return "—"
  const n = parseFloat(valor)
  if (isNaN(n)) return "—"
  if (n >= 1_000_000_000) return `R$ ${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000) return `R$ ${(n / 1_000_000).toFixed(1)}M`
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n)
}

export default async function HomePage() {
  const stats = await getStats()

  return (
    <main className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-gray-100 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <span className="text-lg font-semibold tracking-tight">Credor Radar</span>
          <Link
            href="/dashboard"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            Acessar dashboard
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 pt-20 pb-16">
        <div className="max-w-3xl">
          <h1 className="text-5xl font-bold tracking-tight text-gray-900 leading-tight">
            Inteligência de créditos em{" "}
            <span className="text-blue-600">recuperação judicial</span>
          </h1>
          <p className="mt-6 text-xl text-gray-500 leading-relaxed">
            Identificamos automaticamente créditos atrativos em processos de RJ no Brasil
            antes do mercado — com scoring, ranking e alertas em tempo real.
          </p>
          <div className="mt-8 flex gap-4">
            <Link
              href="/dashboard"
              className="rounded-md bg-blue-600 px-6 py-3 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
            >
              Acessar dashboard →
            </Link>
          </div>
        </div>
      </section>

      {/* Stats */}
      {stats && (
        <section className="border-y border-gray-100 bg-gray-50">
          <div className="max-w-6xl mx-auto px-6 py-10 grid grid-cols-3 gap-8">
            <div>
              <div className="text-3xl font-bold text-gray-900">{stats.totalProcessos}</div>
              <div className="mt-1 text-sm text-gray-500">Processos monitorados</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-gray-900">{formatBRL(stats.valorTotalPassivo)}</div>
              <div className="mt-1 text-sm text-gray-500">em passivo mapeado</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-gray-900">{stats.totalCredores.toLocaleString("pt-BR")}</div>
              <div className="mt-1 text-sm text-gray-500">Credores ranqueados</div>
            </div>
          </div>
        </section>
      )}

      {/* Features */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <div className="grid grid-cols-3 gap-8">
          {[
            { title: "Varredura automática", desc: "Scraper diário nos sites dos administradores judiciais brasileiros." },
            { title: "Extração via IA", desc: "Claude lê e estrutura listas de credores de PDFs automaticamente." },
            { title: "Score de atratividade", desc: "Algoritmo rankeia créditos por potencial de recuperação e preço-alvo." },
          ].map((f) => (
            <div key={f.title} className="border border-gray-100 rounded-lg p-6">
              <h3 className="font-semibold text-gray-900">{f.title}</h3>
              <p className="mt-2 text-sm text-gray-500">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}
