"use client"

import { useEffect, useState, useCallback, Suspense } from "react"
import Image from "next/image"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useSession } from "next-auth/react"
import { LogoutButton } from "@/components/logout-button"
import { useMe } from "@/hooks/useMe"
import { useExtracaoStream } from "@/hooks/useExtracaoStream"

interface Atividade {
  id: number
  tipo: string
  processoId: number | null
  credorId: number | null
  metadata: Record<string, unknown> | null
  criadoEm: string
}

interface AtividadesResponse {
  atividades: Atividade[]
  resumo: {
    processos_novos: number
    credores_novos: number
    planos_atualizados: number
    listas_atualizadas: number
  }
  total_rj_ativas: number
  dias: number
}

interface Processo {
  id: number
  numeroProcesso: string
  tipo: string | null
  subtipo: string | null
  recuperandaRazaoSocial: string | null
  vara: string | null
  estado: string | null
  dataDistribuicao: string | null
  dataDeferimento: string | null
  status: string
  ajNome: string
  totalDocumentos: number
  totalCredores: number
  valorTotal: string | null
  qualidadeBaixa: boolean
}

interface ApiResponse {
  data: Processo[]
  total: number
  pagina: number
  totalPaginas: number
}

interface AJ {
  id: number
  nome: string
}

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000"

// Logos mapeados por fragmento do nome do AJ
const AJ_LOGO_BY_NAME: Array<{ match: string; src: string }> = [
  { match: "ruiz",     src: "/logos/aj-ruiz.svg" },
  { match: "r4c",      src: "/logos/r4c.png" },
  { match: "onbehalf", src: "/logos/onbehalf.png" },
]
function ajLogo(nome: string): string | null {
  const n = nome.toLowerCase()
  return AJ_LOGO_BY_NAME.find((m) => n.includes(m.match))?.src ?? null
}

function formatBRL(v: string | null): string {
  if (!v) return "—"
  const n = parseFloat(v)
  if (isNaN(n)) return "—"
  if (n >= 1_000_000_000) return `R$ ${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000) return `R$ ${(n / 1_000_000).toFixed(1)}M`
  return `R$ ${(n / 1_000).toFixed(0)}K`
}

function formatData(d: string | null): string {
  if (!d) return "—"
  return new Date(d).toLocaleDateString("pt-BR")
}

const SUBTIPO_LABEL: Record<string, { label: string; cls: string }> = {
  recuperacao_judicial_ativa:  { label: "RJ ativa",   cls: "bg-blue-100 text-blue-800" },
  recuperacao_judicial_antiga: { label: "RJ antiga",  cls: "bg-slate-100 text-slate-600" },
  falencia_ativa:              { label: "Falência",   cls: "bg-red-100 text-red-700" },
  falencia_antiga:             { label: "Falência antiga", cls: "bg-gray-100 text-gray-500" },
  extrajudicial:               { label: "Extrajudicial", cls: "bg-purple-100 text-purple-800" },
}

const TIPO_ICON: Record<string, string> = {
  processo_novo:    "📋",
  credor_novo:      "⭐",
  plano_atualizado: "📊",
  lista_atualizada: "📄",
}

const TIPO_LABEL: Record<string, string> = {
  processo_novo:    "Novo processo",
  credor_novo:      "Novo credor",
  plano_atualizado: "Plano de RJ atualizado",
  lista_atualizada: "Lista de credores atualizada",
}

function AtividadeItem({ a }: { a: Atividade }) {
  const m = a.metadata ?? {}
  const icon = TIPO_ICON[a.tipo] ?? "•"
  const label = TIPO_LABEL[a.tipo] ?? a.tipo

  let desc = ""
  if (a.tipo === "processo_novo") desc = String(m.nome ?? "")
  else if (a.tipo === "credor_novo") desc = `${String(m.nome ?? "")} — R$ ${Number(m.valor ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} em ${String(m.processo ?? "")}`
  else if (a.tipo === "plano_atualizado") desc = String(m.nome ?? m.processo ?? "")
  else if (a.tipo === "lista_atualizada") desc = `${String(m.processo ?? "")} (${String(m.credores ?? 0)} credores)`

  const href = a.processoId ? `/dashboard/${a.processoId}` : "#"
  const data = new Date(a.criadoEm).toLocaleDateString("pt-BR")

  return (
    <Link href={href} className="flex items-start gap-3 py-2.5 px-3 hover:bg-gray-50 rounded-md transition-colors group">
      <span className="text-base mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0">
        <span className="text-xs font-medium text-gray-500">{label}</span>
        {desc && <p className="text-sm text-gray-800 group-hover:text-blue-700 truncate">{desc}</p>}
      </div>
      <span className="ml-auto text-xs text-gray-400 shrink-0 pt-0.5">{data}</span>
    </Link>
  )
}

function PainelNovidades() {
  const [dados, setDados] = useState<AtividadesResponse | null>(null)
  const [expandido, setExpandido] = useState(false)

  useEffect(() => {
    fetch(`${API_URL}/api/atividades?dias=7&limite=20`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => setDados(d))
      .catch(() => {})
  }, [])

  if (!dados) return null

  const { resumo, atividades, total_rj_ativas } = dados
  const temAtividade = Object.values(resumo).some((v) => v > 0)

  const cards = [
    { label: "Processos novos",        value: resumo.processos_novos,    color: "bg-blue-50 text-blue-700" },
    { label: "Credores novos",         value: resumo.credores_novos,     color: "bg-green-50 text-green-700" },
    { label: "Planos atualizados",     value: resumo.planos_atualizados, color: "bg-purple-50 text-purple-700" },
    { label: "Listas atualizadas",     value: resumo.listas_atualizadas, color: "bg-amber-50 text-amber-700" },
    { label: "RJs ativas no banco",    value: total_rj_ativas,           color: "bg-gray-100 text-gray-600" },
  ]

  return (
    <div className="mb-6 border border-gray-100 rounded-lg overflow-hidden">
      <div className="bg-gray-50 border-b border-gray-100 px-4 py-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">Esta semana no Credor Radar</h2>
        <span className="text-xs text-gray-400">últimos 7 dias</span>
      </div>

      <div className="px-4 py-3 grid grid-cols-3 md:flex md:flex-wrap gap-2">
        {cards.map((c) => (
          <div key={c.label} className={`rounded-md px-2 py-2 text-center ${c.color}`}>
            <div className="text-xl font-bold tabular-nums">{c.value}</div>
            <div className="text-xs mt-0.5 leading-tight">{c.label}</div>
          </div>
        ))}
      </div>

      {temAtividade && (
        <div className="border-t border-gray-100">
          <button
            onClick={() => setExpandido((e) => !e)}
            className="w-full text-left px-4 py-2.5 text-xs text-gray-500 hover:bg-gray-50 flex items-center gap-1"
          >
            <span>{expandido ? "▲" : "▼"}</span>
            {expandido ? "Ocultar" : "Ver"} atividade recente ({atividades.length} eventos)
          </button>
          {expandido && (
            <div className="px-2 pb-2 divide-y divide-gray-50">
              {atividades.map((a) => <AtividadeItem key={a.id} a={a} />)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

interface VisaoSalva {
  id: number
  nome: string
  filtros: { estado?: string; subtipo?: string; aj_id?: string; incluir_antigos?: boolean }
  criadoEm: string
}

interface FiltrosDashboard {
  estado: string
  subtipo: string
  aj_id: string
  incluir_antigos: boolean
  pagina: number
}

function VisoesPanel({
  email,
  filtros,
  onAplicar,
}: {
  email: string | null | undefined
  filtros: FiltrosDashboard
  onAplicar: (f: Partial<FiltrosDashboard>) => void
}) {
  const [visoes, setVisoes] = useState<VisaoSalva[]>([])
  const [limite, setLimite] = useState(0)
  const [salvando, setSalvando] = useState(false)
  const [nomeNovo, setNomeNovo] = useState("")
  const [mostrarForm, setMostrarForm] = useState(false)

  useEffect(() => {
    if (!email) return
    fetch(`${API_URL}/api/visoes?email=${encodeURIComponent(email)}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d) { setVisoes(d.visoes); setLimite(d.limite) } })
      .catch(() => {})
  }, [email])

  async function salvar() {
    if (!email || !nomeNovo.trim()) return
    setSalvando(true)
    const res = await fetch(`${API_URL}/api/visoes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        nome: nomeNovo.trim(),
        filtros: {
          estado:          filtros.estado || undefined,
          subtipo:         filtros.subtipo || undefined,
          aj_id:           filtros.aj_id || undefined,
          incluir_antigos: filtros.incluir_antigos || undefined,
        },
      }),
    })
    if (res.ok) {
      const nova = await res.json()
      setVisoes((v) => [nova, ...v])
      setNomeNovo("")
      setMostrarForm(false)
    }
    setSalvando(false)
  }

  async function remover(id: number) {
    if (!email) return
    await fetch(`${API_URL}/api/visoes/${id}?email=${encodeURIComponent(email)}`, { method: "DELETE" })
    setVisoes((v) => v.filter((x) => x.id !== id))
  }

  const temFiltro = !!(filtros.estado || filtros.subtipo || filtros.aj_id || filtros.incluir_antigos)
  const atingiuLimite = limite !== -1 && visoes.length >= limite

  if (visoes.length === 0 && !temFiltro) return null

  return (
    <div className="flex flex-wrap items-center gap-2 mb-4 py-2 border-b border-gray-100">
      <span className="text-xs text-gray-400 shrink-0">Visões:</span>

      {visoes.map((v) => (
        <div key={v.id} className="group flex items-center gap-1 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs hover:border-blue-400 transition-colors">
          <button
            onClick={() => onAplicar({ ...v.filtros, pagina: 1 })}
            className="text-gray-700 group-hover:text-blue-700"
          >
            {v.nome}
          </button>
          <button
            onClick={() => remover(v.id)}
            className="text-gray-300 hover:text-red-400 transition-colors ml-0.5"
            title="Remover"
          >
            ×
          </button>
        </div>
      ))}

      {temFiltro && !atingiuLimite && (
        mostrarForm ? (
          <div className="flex items-center gap-1.5">
            <input
              autoFocus
              value={nomeNovo}
              onChange={(e) => setNomeNovo(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") salvar(); if (e.key === "Escape") setMostrarForm(false) }}
              placeholder="Nome da visão…"
              className="rounded border border-gray-300 px-2 py-1 text-xs focus:outline-none focus:border-blue-400 w-36"
            />
            <button
              onClick={salvar}
              disabled={salvando || !nomeNovo.trim()}
              className="rounded bg-gray-800 text-white px-2 py-1 text-xs hover:bg-gray-700 disabled:opacity-40"
            >
              {salvando ? "…" : "Salvar"}
            </button>
            <button onClick={() => setMostrarForm(false)} className="text-gray-400 text-xs hover:text-gray-600">
              ✕
            </button>
          </div>
        ) : (
          <button
            onClick={() => setMostrarForm(true)}
            className="rounded-full border border-dashed border-gray-300 px-3 py-1 text-xs text-gray-400 hover:border-blue-400 hover:text-blue-600 transition-colors"
          >
            + Salvar visão
          </button>
        )
      )}

      {atingiuLimite && limite > 0 && (
        <span className="text-xs text-gray-400">
          Limite atingido ({limite} visões) ·{" "}
          <Link href="/planos" className="underline hover:text-gray-600">upgrade</Link>
        </span>
      )}
    </div>
  )
}

function DashboardContent() {
  const searchParams = useSearchParams()
  const { me } = useMe()
  const { data: session } = useSession()
  const { ativas: analisesAtivas } = useExtracaoStream(session?.user?.email)
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [ajs, setAjs] = useState<AJ[]>([])
  const [filtros, setFiltros] = useState({
    estado: "",
    subtipo: "",
    aj_id: searchParams.get("aj_id") ?? "",
    incluir_antigos: false,
    pagina: 1,
  })

  useEffect(() => {
    fetch(`${API_URL}/api/administradores`)
      .then((r) => r.ok ? r.json() : [])
      .then((d: AJ[]) => setAjs(d))
      .catch(() => {})
  }, [])

  const carregar = useCallback(async () => {
    setLoading(true)
    setErro(null)
    try {
      const params = new URLSearchParams()
      if (filtros.estado) params.set("estado", filtros.estado)
      if (filtros.subtipo) params.set("subtipo", filtros.subtipo)
      if (filtros.aj_id) params.set("aj_id", filtros.aj_id)
      if (filtros.incluir_antigos) params.set("incluir_antigos", "true")
      params.set("pagina", String(filtros.pagina))
      params.set("por_pagina", "25")
      const res = await fetch(`${API_URL}/api/processos?${params}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setData(await res.json())
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [filtros])

  useEffect(() => { carregar() }, [carregar])

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-gray-100 px-4 md:px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-2">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 min-w-0">
            <Link href="/" className="text-sm text-gray-500 hover:text-gray-900 shrink-0">← CR</Link>
            <span className="text-gray-200">/</span>
            <span className="text-sm font-medium truncate">Dashboard</span>
          </div>

          {/* Nav */}
          <div className="flex items-center gap-3">
            {/* Desktop only */}
            <Link href="/dashboard/administradores" className="hidden md:inline text-sm text-gray-500 hover:text-gray-900 transition-colors">
              Admins. Judiciais
            </Link>

            {/* Análises — sempre visível (tem badge) */}
            <Link href="/dashboard/minhas-analises" className="relative text-sm text-blue-500 hover:text-blue-700 transition-colors">
              <span className="hidden md:inline">⚡ Análises</span>
              <span className="md:hidden text-lg leading-none">⚡</span>
              {analisesAtivas.length > 0 && (
                <span className="absolute -top-1.5 -right-2 flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-[10px] font-bold text-white">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
                  <span className="relative">{analisesAtivas.length}</span>
                </span>
              )}
            </Link>

            {/* Alertas — desktop only */}
            <Link href="/dashboard/alertas" className="hidden md:inline text-sm text-gray-500 hover:text-gray-900 transition-colors">
              Alertas
            </Link>

            {/* Favoritos */}
            <Link href="/dashboard/favoritos" className="text-sm text-amber-500 hover:text-amber-600 transition-colors">
              <span className="hidden md:inline">★ Favoritos</span>
              <span className="md:hidden text-lg leading-none">★</span>
            </Link>

            {/* Créditos */}
            <Link
              href="/dashboard/creditos"
              className="flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-sm hover:bg-gray-50 transition-colors"
              title="Meus créditos"
            >
              <span className="text-gray-400 text-xs">◈</span>
              <span className="font-medium tabular-nums">{me?.saldoCreditos ?? "—"}</span>
              <span className="text-xs text-gray-400 hidden sm:inline">cr.</span>
            </Link>

            <LogoutButton />
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 md:px-6 py-4 md:py-6">
        <PainelNovidades />

        <VisoesPanel
          email={session?.user?.email}
          filtros={filtros}
          onAplicar={(f) => setFiltros((prev) => ({
            ...prev,
            estado: f.estado ?? "",
            subtipo: f.subtipo ?? "",
            aj_id: f.aj_id ?? "",
            incluir_antigos: f.incluir_antigos ?? false,
            pagina: 1,
          }))}
        />

        {/* Filtros */}
        <div className="mb-6 space-y-2">
          <div className="grid grid-cols-2 md:flex md:flex-wrap gap-2 items-center">
            {ajs.length > 1 && (
              <select
                value={filtros.aj_id}
                onChange={(e) => setFiltros((f) => ({ ...f, aj_id: e.target.value, pagina: 1 }))}
                className="col-span-2 md:col-auto rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">Todos os AJs</option>
                {ajs.map((aj) => (
                  <option key={aj.id} value={String(aj.id)}>{aj.nome}</option>
                ))}
              </select>
            )}

            <select
              value={filtros.estado}
              onChange={(e) => setFiltros((f) => ({ ...f, estado: e.target.value, pagina: 1 }))}
              className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">Todos estados</option>
              {["SP", "RJ", "MG", "RS", "SC", "PR", "BA", "MT", "MS", "GO"].map((uf) => (
                <option key={uf} value={uf}>{uf}</option>
              ))}
            </select>

            <select
              value={filtros.subtipo}
              onChange={(e) => setFiltros((f) => ({ ...f, subtipo: e.target.value, pagina: 1 }))}
              className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">RJ (ativas + antigas)</option>
              <option value="recuperacao_judicial_ativa">RJ ativas</option>
              <option value="recuperacao_judicial_antiga">RJ antigas</option>
              <option value="falencia_ativa">Falências ativas</option>
              <option value="falencia_antiga">Falências antigas</option>
              <option value="extrajudicial">Extrajudicial</option>
            </select>

            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={filtros.incluir_antigos}
                onChange={(e) => setFiltros((f) => ({ ...f, incluir_antigos: e.target.checked, subtipo: "", pagina: 1 }))}
                className="rounded border-gray-300"
              />
              Incluir falências
            </label>

            <button onClick={carregar} className="rounded-md border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50">
              ↻
            </button>

            {data && (
              <span className="md:ml-auto text-sm text-gray-400 col-span-2 md:col-auto">
                {data.total} processo{data.total !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>

        {loading && (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        )}
        {erro && <div className="text-center py-16 text-red-500">Erro: {erro}</div>}

        {!loading && !erro && data && (
          <>
            {data.data.length === 0 ? (
              <div className="text-center py-16 text-gray-400 border border-gray-100 rounded-lg">
                <p className="font-medium">Nenhum processo encontrado.</p>
                <p className="text-sm mt-1">Tente ampliar os filtros ou marcar "Incluir falências".</p>
              </div>
            ) : (
              <>
                {/* ── Cards (mobile) ── */}
                <div className="md:hidden space-y-2">
                  {data.data.map((p) => {
                    const sub = p.subtipo ? SUBTIPO_LABEL[p.subtipo] : null
                    return (
                      <Link
                        key={p.id}
                        href={`/dashboard/${p.id}`}
                        className="block border border-gray-100 rounded-lg p-4 hover:border-blue-200 hover:bg-blue-50/30 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <span className="font-medium text-gray-900 text-sm leading-snug line-clamp-2 flex-1">
                            {p.recuperandaRazaoSocial ?? "—"}
                          </span>
                          {sub && (
                            <span className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-medium ${sub.cls}`}>
                              {sub.label}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-400 font-mono mb-2 truncate">{p.numeroProcesso}</div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                          {p.estado && <span>🗺 {p.estado}</span>}
                          {p.dataDeferimento && <span>📅 {formatData(p.dataDeferimento)}</span>}
                          {p.totalCredores > 0 && <span>👥 {p.totalCredores} credores</span>}
                          {p.valorTotal && (
                            <span className="font-medium text-gray-700">
                              {formatBRL(p.valorTotal)}
                              {p.qualidadeBaixa && <span className="ml-1 text-amber-500">⚠</span>}
                            </span>
                          )}
                          {ajLogo(p.ajNome) ? (
                            <Image src={ajLogo(p.ajNome)!} alt={p.ajNome} width={40} height={16} className="object-contain opacity-60 inline-block" unoptimized />
                          ) : (
                            <span className="text-gray-400">{p.ajNome.replace("Administracao Judicial", "AJ").replace("Empresarial", "")}</span>
                          )}
                        </div>
                      </Link>
                    )
                  })}
                </div>

                {/* ── Tabela (desktop) ── */}
                <div className="hidden md:block border border-gray-100 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        {["Recuperanda", "AJ", "Subtipo", "Estado", "Deferimento", "Credores", "Passivo", "Docs"].map((h) => (
                          <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {data.data.map((p) => {
                        const sub = p.subtipo ? SUBTIPO_LABEL[p.subtipo] : null
                        return (
                          <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-3">
                              <Link href={`/dashboard/${p.id}`} className="font-medium text-gray-900 hover:text-blue-600 line-clamp-1">
                                {p.recuperandaRazaoSocial?.substring(0, 48) ?? "—"}
                              </Link>
                              <div className="text-xs text-gray-400 font-mono mt-0.5">{p.numeroProcesso}</div>
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-400 max-w-[120px]">
                              {ajLogo(p.ajNome) ? (
                                <Image src={ajLogo(p.ajNome)!} alt={p.ajNome} width={56} height={20} className="object-contain opacity-70" unoptimized />
                              ) : (
                                <div className="line-clamp-2">{p.ajNome.replace("Administracao Judicial", "AJ").replace("Empresarial", "")}</div>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {sub && (
                                <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${sub.cls}`}>
                                  {sub.label}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-gray-600">{p.estado ?? "—"}</td>
                            <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{formatData(p.dataDeferimento)}</td>
                            <td className="px-4 py-3 text-center">
                              {p.totalCredores > 0
                                ? <span className="font-medium">{p.totalCredores}</span>
                                : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-4 py-3 font-medium tabular-nums">
                              {formatBRL(p.valorTotal)}
                              {p.qualidadeBaixa && (
                                <span className="ml-1 text-amber-500 text-xs" title="Lista predominantemente tributária">⚠</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center text-gray-400">{p.totalDocumentos}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {data.totalPaginas > 1 && (
              <div className="flex justify-center gap-2 mt-6">
                <button
                  disabled={filtros.pagina <= 1}
                  onClick={() => setFiltros((f) => ({ ...f, pagina: f.pagina - 1 }))}
                  className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-40"
                >
                  ← Anterior
                </button>
                <span className="px-4 py-1.5 text-sm text-gray-500">
                  {filtros.pagina} / {data.totalPaginas}
                </span>
                <button
                  disabled={filtros.pagina >= data.totalPaginas}
                  onClick={() => setFiltros((f) => ({ ...f, pagina: f.pagina + 1 }))}
                  className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-40"
                >
                  Próxima →
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-white flex items-center justify-center text-gray-400 text-sm">Carregando…</div>}>
      <DashboardContent />
    </Suspense>
  )
}
