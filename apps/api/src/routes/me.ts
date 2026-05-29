import { Router } from "express"
import { z } from "zod"
import { prisma } from "../lib/db"

export const meRouter = Router()

// Recebe o email via query param (passado pelo frontend com a sessão NextAuth)
// TODO Fase auth: substituir por JWT Bearer token
const QuerySchema = z.object({
  email: z.string().email(),
})

meRouter.get("/", async (req, res): Promise<void> => {
  const parsed = QuerySchema.safeParse(req.query)
  if (!parsed.success) { res.status(400).json({ erro: "email obrigatório" }); return }

  const usuario = await prisma.usuario.findUnique({
    where: { email: parsed.data.email },
    include: {
      assinatura: { include: { plano: true } },
      credito: true,
    },
  })

  if (!usuario) { res.status(404).json({ erro: "Usuário não encontrado" }); return }

  const agora = new Date()
  const assinatura = usuario.assinatura
  const diasRestantesTrial = assinatura?.status === "trial"
    ? Math.max(0, Math.ceil((assinatura.proximaRenovacao.getTime() - agora.getTime()) / 86_400_000))
    : null

  res.json({
    papel: usuario.papel,
    plano: assinatura?.plano.slug ?? null,
    planoNome: assinatura?.plano.nome ?? null,
    statusAssinatura: assinatura?.status ?? null,
    saldoCreditos: usuario.credito?.saldo ?? 0,
    proximaRenovacao: assinatura?.proximaRenovacao ?? null,
    diasRestantesTrial,
  })
})
