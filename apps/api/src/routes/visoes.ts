import { Router } from "express"
import { z } from "zod"
import { prisma } from "../lib/db"

export const vioesRouter = Router()

const QueryEmail = z.object({ email: z.string().email() })

// Limites de visões por plano (espelha Plano.recursos.visoes no seed)
function limiteVisoes(recursos: Record<string, unknown>): number {
  const v = recursos["visoes"]
  if (typeof v === "number") return v
  return 0
}

// ─── GET /api/visoes ──────────────────────────────────────────────────────────

vioesRouter.get("/", async (req, res): Promise<void> => {
  const q = QueryEmail.safeParse(req.query)
  if (!q.success) { res.status(400).json({ erro: "email obrigatório" }); return }

  const usuario = await prisma.usuario.findUnique({
    where: { email: q.data.email },
    include: {
      visoes: { orderBy: { criadoEm: "desc" } },
      assinatura: { include: { plano: true } },
    },
  })
  if (!usuario) { res.status(404).json({ erro: "Usuário não encontrado" }); return }

  const limite = limiteVisoes((usuario.assinatura?.plano.recursos ?? {}) as Record<string, unknown>)

  res.json({
    visoes: usuario.visoes,
    limite,
    restantes: limite === -1 ? null : Math.max(0, limite - usuario.visoes.length),
  })
})

// ─── POST /api/visoes ─────────────────────────────────────────────────────────

const CriarSchema = z.object({
  email:  z.string().email(),
  nome:   z.string().min(1).max(60),
  filtros: z.object({
    estado:          z.string().optional(),
    subtipo:         z.string().optional(),
    aj_id:           z.string().optional(),
    incluir_antigos: z.boolean().optional(),
  }),
})

vioesRouter.post("/", async (req, res): Promise<void> => {
  const parsed = CriarSchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ erro: parsed.error.flatten().fieldErrors }); return }

  const { email, nome, filtros } = parsed.data

  const usuario = await prisma.usuario.findUnique({
    where: { email },
    include: {
      visoes: true,
      assinatura: { include: { plano: true } },
    },
  })
  if (!usuario) { res.status(404).json({ erro: "Usuário não encontrado" }); return }

  const limite = limiteVisoes((usuario.assinatura?.plano.recursos ?? {}) as Record<string, unknown>)
  if (limite !== -1 && usuario.visoes.length >= limite) {
    res.status(403).json({
      erro: `Limite de ${limite} visão${limite !== 1 ? "ões" : ""} atingido no seu plano.`,
      limite,
      atual: usuario.visoes.length,
    })
    return
  }

  const visao = await prisma.visaoSalva.create({
    data: { usuarioId: usuario.id, nome, filtros },
  })

  res.status(201).json(visao)
})

// ─── DELETE /api/visoes/:id ───────────────────────────────────────────────────

vioesRouter.delete("/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] ?? "")
  if (isNaN(id)) { res.status(400).json({ erro: "ID inválido" }); return }

  const q = QueryEmail.safeParse(req.query)
  if (!q.success) { res.status(400).json({ erro: "email obrigatório" }); return }

  const usuario = await prisma.usuario.findUnique({ where: { email: q.data.email } })
  if (!usuario) { res.status(404).json({ erro: "Usuário não encontrado" }); return }

  const visao = await prisma.visaoSalva.findFirst({ where: { id, usuarioId: usuario.id } })
  if (!visao) { res.status(404).json({ erro: "Visão não encontrada" }); return }

  await prisma.visaoSalva.delete({ where: { id } })
  res.status(204).end()
})
