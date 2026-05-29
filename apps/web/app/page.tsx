import Link from "next/link"
import { auth } from "@/auth"

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

function formatCompact(valor: string | null): string {
  if (!valor) return "—"
  const n = parseFloat(valor)
  if (isNaN(n)) return "—"
  if (n >= 1_000_000_000) return `R$ ${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000) return `R$ ${(n / 1_000_000).toFixed(1)}M`
  return `R$ ${(n / 1_000).toFixed(0)}K`
}

function IconLupa() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8.5" cy="8.5" r="5.5" /><line x1="13.5" y1="13.5" x2="18" y2="18" />
    </svg>
  )
}
function IconDocumento() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="2" width="12" height="16" rx="1.5" /><line x1="7" y1="7" x2="13" y2="7" /><line x1="7" y1="10" x2="13" y2="10" /><line x1="7" y1="13" x2="10" y2="13" />
    </svg>
  )
}
function IconGrafico() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="17" x2="3" y2="3" /><line x1="3" y1="17" x2="17" y2="17" />
      <rect x="5" y="10" width="3" height="7" /><rect x="10" y="6" width="3" height="11" /><rect x="15" y="13" width="3" height="4" />
    </svg>
  )
}

export default async function HomePage() {
  const [stats, session] = await Promise.all([getStats(), auth()])

  return (
    <main className="bg-white text-[#0a0a0a]">

      {/* ── Nav ── */}
      <nav className="max-w-[1280px] mx-auto px-6 md:px-10 h-16 flex items-center justify-between">
        <span className="text-sm font-semibold tracking-tight">Jalun Capital</span>
        <div className="flex items-center gap-4">
          {session ? (
            <Link href="/dashboard" className="text-sm rounded-md bg-[#0a0a0a] px-4 py-2 font-medium text-white hover:bg-[#1a1a1a] transition-colors duration-150">
              Ir para o Dashboard →
            </Link>
          ) : (
            <>
              <a href="#parceiros" className="text-sm text-[#525252] hover:text-[#0a0a0a] transition-colors duration-150 hidden md:inline">
                Parceiros
              </a>
              <Link href="/login" className="text-sm text-[#525252] hover:text-[#0a0a0a] transition-colors duration-150">
                Entrar
              </Link>
              <a
                href="mailto:igorbarrosrj@gmail.com?subject=Interesse%20em%20Parceria%20Fundadora%20—%20Jalun%20Capital"
                className="text-sm rounded-md bg-[#0a2540] px-4 py-2 font-medium text-white hover:bg-[#0d3560] transition-colors duration-150"
              >
                Solicitar conversa →
              </a>
            </>
          )}
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="max-w-[1280px] mx-auto px-6 md:px-10 pt-24 pb-20 md:pt-32 md:pb-28">
        <p className="font-mono text-xs text-[#064e3b] uppercase tracking-[0.15em] mb-6">
          Inteligência de créditos · Recuperação Judicial
        </p>

        <h1 className="text-[clamp(2.5rem,6vw,5rem)] font-semibold tracking-[-0.03em] leading-[1.05] max-w-3xl">
          O Bloomberg do distressed
          <br />
          <span className="text-[#a3a3a3]">brasileiro.</span>
        </h1>

        <p className="mt-8 text-[1.125rem] text-[#525252] leading-relaxed max-w-xl">
          Identificamos automaticamente oportunidades de cessão de crédito
          em processos de recuperação judicial no Brasil — antes do mercado.
        </p>

        <div className="mt-10 flex flex-wrap items-center gap-4">
          {session ? (
            <Link
              href="/dashboard"
              className="inline-flex items-center rounded-md bg-[#0a0a0a] px-6 py-3 text-sm font-medium text-white hover:bg-[#1a1a1a] transition-colors duration-150"
            >
              Ir para o Dashboard →
            </Link>
          ) : (
            <>
              <a
                href="mailto:igorbarrosrj@gmail.com?subject=Interesse%20em%20Parceria%20Fundadora%20—%20Jalun%20Capital"
                className="inline-flex items-center rounded-md bg-[#0a2540] px-6 py-3 text-sm font-medium text-white hover:bg-[#0d3560] transition-colors duration-150"
              >
                Solicitar conversa →
              </a>
              <Link
                href="/login"
                className="text-sm text-[#525252] hover:text-[#0a0a0a] transition-colors duration-150"
              >
                Já tenho conta
              </Link>
            </>
          )}
        </div>

        <p className="mt-6 text-xs text-[#a3a3a3]">
          Para fundos de distressed, family offices e escritórios especializados.
        </p>
      </section>

      {/* ── Estatísticas ── */}
      {stats && (
        <section className="bg-[#fafafa] border-y border-[#e5e5e5]">
          <div className="max-w-[1280px] mx-auto px-6 md:px-10 py-12 grid grid-cols-3 gap-6 md:gap-12">
            <div>
              <div className="font-mono text-3xl md:text-4xl font-medium text-[#0a0a0a]">
                {stats.totalProcessos.toLocaleString("pt-BR")}
              </div>
              <div className="mt-1.5 text-sm text-[#525252]">processos monitorados</div>
            </div>
            <div>
              <div className="font-mono text-3xl md:text-4xl font-medium text-[#0a0a0a]">
                {formatCompact(stats.valorTotalPassivo)}
              </div>
              <div className="mt-1.5 text-sm text-[#525252]">em passivo mapeado</div>
            </div>
            <div>
              <div className="font-mono text-3xl md:text-4xl font-medium text-[#0a0a0a]">
                {stats.totalCredores.toLocaleString("pt-BR")}
              </div>
              <div className="mt-1.5 text-sm text-[#525252]">credores ranqueados</div>
            </div>
          </div>
        </section>
      )}

      {/* ── Como funciona ── */}
      <section id="como-funciona" className="max-w-[1280px] mx-auto px-6 md:px-10 py-28 md:py-36">
        <h2 className="text-[clamp(1.75rem,3.5vw,2.75rem)] font-semibold tracking-[-0.03em] mb-14">
          Como funciona
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            {
              icon: <IconLupa />,
              titulo: "Varredura automatizada",
              desc: "Nosso sistema visita diariamente os sites dos administradores judiciais brasileiros e captura novos processos, editais e relações de credores.",
            },
            {
              icon: <IconDocumento />,
              titulo: "Extração estruturada por IA",
              desc: "Modelos de linguagem leem PDFs jurídicos e estruturam listas de credores com classe, valor e classificação fiscal — sem trabalho manual.",
            },
            {
              icon: <IconGrafico />,
              titulo: "Score de atratividade",
              desc: "Algoritmo proprietário ranqueia créditos por potencial de cessão, considerando classe, valor, perfil do credor e idade do processo.",
            },
          ].map((c) => (
            <div key={c.titulo} className="border border-[#e5e5e5] rounded-lg p-7">
              <div className="text-[#0a0a0a] mb-5">{c.icon}</div>
              <h3 className="text-base font-semibold text-[#0a0a0a] mb-3">{c.titulo}</h3>
              <p className="text-sm text-[#525252] leading-relaxed">{c.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Por que importa ── */}
      <section className="bg-[#fafafa] border-y border-[#e5e5e5]">
        <div className="max-w-[700px] mx-auto px-6 md:px-10 py-28 md:py-36">
          <h2 className="text-[clamp(1.5rem,3vw,2.25rem)] font-semibold tracking-[-0.03em] leading-snug mb-8">
            O mercado brasileiro de distressed cresce mais rápido que a informação sobre ele.
          </h2>
          <div className="space-y-5 text-[1.0625rem] text-[#525252] leading-[1.7]">
            <p>
              Em 2024, o mercado de NPL brasileiro envolveu dezenas de empresas cedentes.
              Mais de 2.000 novos pedidos de recuperação judicial foram protocolados.
              O capital institucional descobriu o Brasil como destino de distressed — fundos
              como GDA Luma, Cerberus e Brookfield operam aqui em escala crescente.
            </p>
            <p>
              Mas a informação ainda é fragmentada: editais publicados em dezenas de diários
              oficiais, listas de credores em sites de administradores judiciais, dados estruturados
              praticamente inexistentes. Nosso trabalho é transformar esse caos em inteligência acionável.
            </p>
          </div>
        </div>
      </section>

      {/* ── Para quem é ── */}
      <section className="max-w-[1280px] mx-auto px-6 md:px-10 py-28 md:py-36">
        <h2 className="text-[clamp(1.75rem,3.5vw,2.75rem)] font-semibold tracking-[-0.03em] mb-12">
          Construído para profissionais<br className="hidden md:block" /> que operam o mercado.
        </h2>
        <ul className="space-y-4 max-w-lg mb-8">
          {[
            "Gestores de fundos de distressed e NPL",
            "Family offices alocando em crédito alternativo",
            "Boutiques de investimento especializadas",
            "Escritórios de advocacia em recuperação judicial",
            "Consultorias de turnaround empresarial",
          ].map((item) => (
            <li key={item} className="flex items-start gap-3 text-[1.0625rem] text-[#0a0a0a]">
              <span className="mt-1 text-[#064e3b] font-medium shrink-0">✓</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
        <p className="text-sm text-[#a3a3a3]">Não é destinado a investidores pessoa física iniciantes.</p>
      </section>

      {/* ── Parceiros Fundadores ── */}
      <section id="parceiros" className="bg-[#fafafa] border-y border-[#e5e5e5]">
        <div className="max-w-[1280px] mx-auto px-6 md:px-10 py-28 md:py-36">

          <p className="font-mono text-xs text-[#0a2540] uppercase tracking-[0.15em] mb-4">Acesso antecipado</p>
          <h2 className="text-[clamp(1.75rem,3.5vw,2.75rem)] font-semibold tracking-[-0.03em] mb-4">
            Fase de Parceiros Fundadores
          </h2>
          <p className="text-[#525252] text-base mb-16 max-w-xl">
            O Jalun Capital está em construção ativa. Estamos selecionando profissionais
            do mercado de distressed para entrar cedo no produto, com condições especiais.
          </p>

          <div className="grid md:grid-cols-2 gap-12 items-start">

            {/* Card principal */}
            <div className="bg-[#0a2540] rounded-xl p-8 flex flex-col relative">
              <div className="absolute -top-3 left-8">
                <span className="bg-[#064e3b] text-white text-[10px] font-mono uppercase tracking-widest px-3 py-1 rounded-full">
                  Vagas limitadas
                </span>
              </div>

              <div className="mb-6 pt-2">
                <p className="text-xs font-mono uppercase tracking-widest text-[#94a3b8] mb-3">Design Partner</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-semibold text-white tracking-tight">R$ 1.997</span>
                  <span className="text-sm text-[#94a3b8]">/mês</span>
                </div>
              </div>

              <p className="text-sm text-[#94a3b8] mb-6 leading-relaxed">
                O que está disponível hoje no produto:
              </p>

              <ul className="space-y-3 flex-1 mb-8">
                {[
                  "Acesso completo ao banco de processos catalogados",
                  "Ranqueamento de credores por score de atratividade",
                  "Análise detalhada por credor gerada por IA",
                  "Análise de portfólio por processo com teses de operação",
                  "Filtros por estado, classe, valor e score",
                  "Export CSV",
                  "Suporte direto com o founder",
                  "Voz no roadmap do produto",
                ].map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-[#e2e8f0]">
                    <span className="text-[#6ee7b7] font-medium mt-0.5 shrink-0">✓</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <a
                href="mailto:igorbarrosrj@gmail.com?subject=Interesse%20em%20Design%20Partner%20—%20Jalun%20Capital&body=Olá%2C%20tenho%20interesse%20em%20conversar%20sobre%20a%20parceria%20fundadora%20do%20Jalun%20Capital."
                className="block text-center rounded-md bg-white text-[#0a2540] text-sm font-semibold px-5 py-3 hover:bg-[#f1f5f9] transition-colors duration-150"
              >
                Solicitar conversa →
              </a>
            </div>

            {/* Roadmap */}
            <div>
              <h3 className="text-lg font-semibold text-[#0a0a0a] mb-2">
                Próximos recursos
              </h3>
              <p className="text-sm text-[#525252] mb-8 leading-relaxed">
                Em desenvolvimento ativo para os próximos meses:
              </p>

              <ul className="space-y-4">
                {[
                  "Alertas automáticos por e-mail",
                  "Exportação semanal automatizada em XLSX",
                  "Cobertura nacional — mais administradores judiciais",
                  "Visões salvas personalizadas",
                  "Timeline narrativa por processo",
                  "API e webhooks para integração",
                  "Análise comparativa de casos similares",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm text-[#525252]">
                    <span className="shrink-0 mt-0.5 text-[#0a2540] font-bold">→</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-10 border-l-2 border-[#0a2540] pl-5">
                <p className="text-sm text-[#0a0a0a] font-medium leading-relaxed">
                  Parceiros fundadores influenciam diretamente a priorização do roadmap.
                </p>
                <p className="text-xs text-[#a3a3a3] mt-1">
                  Cada parceiro tem acesso direto ao founder para discutir necessidades reais da operação.
                </p>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ── CTA final ── */}
      <section className="bg-[#0a2540]">
        <div className="max-w-[1280px] mx-auto px-6 md:px-10 py-24 md:py-32 text-center">
          <h2 className="text-[clamp(1.75rem,3.5vw,2.75rem)] font-semibold tracking-[-0.03em] text-white mb-4">
            Entre cedo. Molde o produto.
          </h2>
          <p className="text-[#94a3b8] text-base mb-10 max-w-lg mx-auto">
            Vagas de design partner são limitadas. Uma conversa de 30 minutos
            é suficiente para avaliar se faz sentido para sua operação.
          </p>
          <a
            href="mailto:igorbarrosrj@gmail.com?subject=Interesse%20em%20Design%20Partner%20—%20Jalun%20Capital&body=Olá%2C%20tenho%20interesse%20em%20conversar%20sobre%20a%20parceria%20fundadora%20do%20Jalun%20Capital."
            className="inline-flex items-center rounded-md bg-white px-7 py-3.5 text-sm font-medium text-[#0a2540] hover:bg-[#f1f5f9] transition-colors duration-150"
          >
            Solicitar conversa →
          </a>
          <p className="mt-5 text-xs text-[#64748b]">
            Resposta em até 48h · Sem compromisso
          </p>
        </div>
      </section>

      {/* ── Rodapé ── */}
      <footer className="border-t border-[#e5e5e5]">
        <div className="max-w-[1280px] mx-auto px-6 md:px-10 py-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <div className="text-sm font-semibold text-[#0a0a0a]">Jalun Capital</div>
            <div className="text-xs text-[#a3a3a3] mt-0.5">Inteligência de crédito em recuperação judicial</div>
          </div>
          <div className="flex flex-wrap gap-5 text-xs text-[#525252]">
            {["Sobre", "Contato", "Termos", "Privacidade"].map((l) => (
              <span key={l} className="hover:text-[#0a0a0a] cursor-pointer transition-colors">{l}</span>
            ))}
          </div>
          <div className="text-right">
            <div className="text-xs text-[#a3a3a3]">© {new Date().getFullYear()} Jalun Capital</div>
            <div className="text-xs text-[#c4c4c4] mt-1 max-w-xs">
              Produto em fase de construção ativa. Recursos sendo expandidos continuamente.
              Fale com o founder para entender o estágio atual.
            </div>
          </div>
        </div>
      </footer>

    </main>
  )
}
