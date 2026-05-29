import { Router } from "express"
import { z } from "zod"
import { prisma } from "../lib/db"

export const alertasRouter = Router()

const QueryEmail = z.object({ email: z.string().email() })

// ─── GET /api/alertas ─────────────────────────────────────────────────────────

alertasRouter.get("/", async (req, res): Promise<void> => {
  const q = QueryEmail.safeParse(req.query)
  if (!q.success) { res.status(400).json({ erro: "email obrigatório" }); return }

  const usuario = await prisma.usuario.findUnique({
    where: { email: q.data.email },
    include: { alertas: { orderBy: { criadoEm: "desc" } } },
  })
  if (!usuario) { res.status(404).json({ erro: "Usuário não encontrado" }); return }

  res.json(usuario.alertas)
})

// ─── POST /api/alertas ────────────────────────────────────────────────────────

const CriarSchema = z.object({
  email:       z.string().email(),
  estados:     z.array(z.string()).default([]),
  classes:     z.array(z.string()).default([]),
  scoreMinimo: z.number().min(0).max(1).optional(),
  valorMinimo: z.number().min(0).optional(),
  valorMaximo: z.number().min(0).optional(),
  canal:       z.enum(["email", "webhook"]).default("email"),
  webhookUrl:  z.string().url().optional(),
})

alertasRouter.post("/", async (req, res): Promise<void> => {
  const parsed = CriarSchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ erro: parsed.error.flatten().fieldErrors }); return }

  const { email, ...dados } = parsed.data

  // Limite: plano trial/starter sem alertas, pro/enterprise com alertas
  const usuario = await prisma.usuario.findUnique({
    where: { email },
    include: { alertas: true, assinatura: { include: { plano: true } } },
  })
  if (!usuario) { res.status(404).json({ erro: "Usuário não encontrado" }); return }

  const recursos = (usuario.assinatura?.plano.recursos ?? {}) as Record<string, unknown>
  if (!recursos["alertas"] && usuario.assinatura?.plano.slug !== "pro" && usuario.assinatura?.plano.slug !== "enterprise") {
    res.status(403).json({ erro: "Alertas disponíveis a partir do plano Pro.", planoAtual: usuario.assinatura?.plano.slug ?? "trial" })
    return
  }

  const alerta = await prisma.alertaConfig.create({
    data: {
      usuarioId:   usuario.id,
      estados:     dados.estados,
      classes:     dados.classes,
      scoreMinimo: dados.scoreMinimo ?? null,
      valorMinimo: dados.valorMinimo ?? null,
      valorMaximo: dados.valorMaximo ?? null,
      canal:       dados.canal,
      webhookUrl:  dados.webhookUrl ?? null,
    },
  })

  res.status(201).json(alerta)
})

// ─── PATCH /api/alertas/:id ───────────────────────────────────────────────────

const AtualizarSchema = z.object({
  email: z.string().email(),
  ativo: z.boolean(),
})

alertasRouter.patch("/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] ?? "")
  if (isNaN(id)) { res.status(400).json({ erro: "ID inválido" }); return }

  const parsed = AtualizarSchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ erro: parsed.error.flatten().fieldErrors }); return }

  const usuario = await prisma.usuario.findUnique({ where: { email: parsed.data.email } })
  if (!usuario) { res.status(404).json({ erro: "Usuário não encontrado" }); return }

  const alerta = await prisma.alertaConfig.findFirst({ where: { id, usuarioId: usuario.id } })
  if (!alerta) { res.status(404).json({ erro: "Alerta não encontrado" }); return }

  const atualizado = await prisma.alertaConfig.update({
    where: { id },
    data: { ativo: parsed.data.ativo },
  })

  res.json(atualizado)
})

// ─── DELETE /api/alertas/:id ──────────────────────────────────────────────────

alertasRouter.delete("/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] ?? "")
  if (isNaN(id)) { res.status(400).json({ erro: "ID inválido" }); return }

  const q = QueryEmail.safeParse(req.query)
  if (!q.success) { res.status(400).json({ erro: "email obrigatório" }); return }

  const usuario = await prisma.usuario.findUnique({ where: { email: q.data.email } })
  if (!usuario) { res.status(404).json({ erro: "Usuário não encontrado" }); return }

  const alerta = await prisma.alertaConfig.findFirst({ where: { id, usuarioId: usuario.id } })
  if (!alerta) { res.status(404).json({ erro: "Alerta não encontrado" }); return }

  await prisma.alertaConfig.delete({ where: { id } })
  res.status(204).end()
})
