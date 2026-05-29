import { Router } from "express"
import { z } from "zod"
import bcrypt from "bcryptjs"
import { prisma } from "../lib/db"

export const cadastroRouter = Router()

const BodySchema = z.object({
  nome:     z.string().min(2).max(120).trim(),
  email:    z.string().email().toLowerCase().trim(),
  senha:    z.string().min(8),
  empresa:  z.string().max(200).trim().optional(),
  telefone: z.string().max(30).trim().optional(),
})

cadastroRouter.post("/", async (req, res): Promise<void> => {
  const parsed = BodySchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ erro: parsed.error.flatten().fieldErrors })
    return
  }

  const { nome, email, senha } = parsed.data

  const existente = await prisma.usuario.findUnique({ where: { email } })
  if (existente) {
    res.status(409).json({ erro: { email: ["Email já cadastrado"] } })
    return
  }

  const plano = await prisma.plano.findUnique({ where: { slug: "starter" } })
  if (!plano) {
    res.status(500).json({ erro: "Plano padrão não encontrado" })
    return
  }

  const senhaHash = await bcrypt.hash(senha, 12)
  const proximaRenovacao = new Date(Date.now() + 14 * 86_400_000)

  const usuario = await prisma.$transaction(async (tx) => {
    const u = await tx.usuario.create({
      data: { nome, email, senhaHash, papel: "trial" },
    })

    await tx.assinaturaUsuario.create({
      data: {
        usuarioId: u.id,
        planoId: plano.id,
        status: "trial",
        proximaRenovacao,
      },
    })

    await tx.creditoUsuario.create({
      data: { usuarioId: u.id, saldo: 5, ultimaRecarga: new Date() },
    })

    await tx.transacaoCredito.create({
      data: {
        usuarioId: u.id,
        tipo: "bonus",
        quantidade: 5,
        descricao: "Créditos de boas-vindas (trial)",
      },
    })

    return u
  })

  res.status(201).json({
    id: usuario.id,
    email: usuario.email,
    nome: usuario.nome,
    papel: usuario.papel,
    trialExpira: proximaRenovacao.toISOString(),
    creditosBonus: 5,
  })
})
