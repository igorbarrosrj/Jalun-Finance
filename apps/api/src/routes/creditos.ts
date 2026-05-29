import { Router } from "express"
import { z } from "zod"
import { prisma } from "../lib/db"
import { logger } from "../lib/logger"

export const creditosRouter = Router()

// ─── GET /api/creditos/saldo ──────────────────────────────────────────────────

const SaldoQuerySchema = z.object({
  email: z.string().email(),
})

creditosRouter.get("/saldo", async (req, res): Promise<void> => {
  const parsed = SaldoQuerySchema.safeParse(req.query)
  if (!parsed.success) { res.status(400).json({ erro: "email obrigatório" }); return }

  const usuario = await prisma.usuario.findUnique({
    where: { email: parsed.data.email },
    include: {
      credito: true,
      assinatura: { include: { plano: true } },
    },
  })
  if (!usuario) { res.status(404).json({ erro: "Usuário não encontrado" }); return }

  const historicoRecente = await prisma.transacaoCredito.findMany({
    where: { usuarioId: usuario.id },
    orderBy: { criadoEm: "desc" },
    take: 20,
    select: {
      id: true,
      tipo: true,
      quantidade: true,
      descricao: true,
      criadoEm: true,
    },
  })

  res.json({
    saldo: usuario.credito?.saldo ?? 0,
    ultimaRecarga: usuario.credito?.ultimaRecarga ?? null,
    planoSlug: usuario.assinatura?.plano.slug ?? null,
    planoNome: usuario.assinatura?.plano.nome ?? null,
    statusAssinatura: usuario.assinatura?.status ?? null,
    proximaRenovacao: usuario.assinatura?.proximaRenovacao ?? null,
    historicoRecente,
  })
})

// ─── POST /api/creditos/comprar ───────────────────────────────────────────────

const PACOTES: Record<string, { creditos: number; precoReais: number; descricao: string }> = {
  p5:  { creditos: 5,   precoReais: 150,  descricao: "5 créditos avulsos" },
  p10: { creditos: 10,  precoReais: 280,  descricao: "10 créditos avulsos" },
  p25: { creditos: 25,  precoReais: 600,  descricao: "25 créditos avulsos" },
}

const ComprarSchema = z.object({
  email:    z.string().email(),
  pacote:   z.enum(["p5", "p10", "p25"]),
})

creditosRouter.post("/comprar", async (req, res): Promise<void> => {
  const parsed = ComprarSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ erro: parsed.error.flatten().fieldErrors, pacotesDisponiveis: Object.keys(PACOTES) })
    return
  }

  const { email, pacote } = parsed.data
  const pkg = PACOTES[pacote]!

  const usuario = await prisma.usuario.findUnique({
    where: { email },
    include: { credito: true },
  })
  if (!usuario) { res.status(404).json({ erro: "Usuário não encontrado" }); return }

  // TODO: integrar Asaas — criar cobrança, aguardar webhook de confirmação,
  // só então creditar o saldo. Por ora executa o crédito imediatamente (sandbox).
  logger.warn({ email, pacote, creditos: pkg.creditos }, "compra-creditos: modo sandbox — creditando sem cobrança real")

  await prisma.$transaction([
    prisma.creditoUsuario.upsert({
      where:  { usuarioId: usuario.id },
      update: { saldo: { increment: pkg.creditos }, ultimaRecarga: new Date() },
      create: { usuarioId: usuario.id, saldo: pkg.creditos, ultimaRecarga: new Date() },
    }),
    prisma.transacaoCredito.create({
      data: {
        usuarioId: usuario.id,
        tipo: "compra_avulsa",
        quantidade: pkg.creditos,
        descricao: `${pkg.descricao} — R$ ${pkg.precoReais}`,
        metadata: { pacote, precoReais: pkg.precoReais, sandbox: true },
      },
    }),
  ])

  const saldoAtualizado = await prisma.creditoUsuario.findUnique({ where: { usuarioId: usuario.id } })

  logger.info({ email, pacote, creditos: pkg.creditos, novoSaldo: saldoAtualizado?.saldo }, "Créditos comprados (sandbox)")

  res.status(201).json({
    sucesso: true,
    creditosAdicionados: pkg.creditos,
    novoSaldo: saldoAtualizado?.saldo ?? 0,
    sandbox: true,
    aviso: "Pagamento ainda não integrado — créditos liberados automaticamente para teste.",
  })
})

// ─── GET /api/creditos/pacotes ────────────────────────────────────────────────

creditosRouter.get("/pacotes", (_req, res) => {
  res.json(
    Object.entries(PACOTES).map(([id, p]) => ({ id, ...p }))
  )
})
