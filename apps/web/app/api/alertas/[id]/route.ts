import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { PrismaClient } from "@prisma/client"
import { z } from "zod"

const prisma = new PrismaClient()

const AlertaUpdateSchema = z.object({
  scoreMinimo: z.number().min(0).max(1).nullable().optional(),
  valorMinimo: z.number().positive().nullable().optional(),
  valorMaximo: z.number().positive().nullable().optional(),
  classes: z.array(z.string()).optional(),
  estados: z.array(z.string()).optional(),
  canal: z.enum(["email", "webhook"]).optional(),
  webhookUrl: z.string().url().nullable().optional(),
  ativo: z.boolean().optional(),
})

async function getAlertaOwned(id: number, usuarioId: number) {
  return prisma.alertaConfig.findFirst({ where: { id, usuarioId } })
}

export async function PUT(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Não autenticado" }, { status: 401 })

  const id = parseInt(params.id)
  const usuarioId = parseInt(session.user.id)
  const existing = await getAlertaOwned(id, usuarioId)
  if (!existing) return NextResponse.json({ error: "Não encontrado" }, { status: 404 })

  const body = await req.json()
  const parsed = AlertaUpdateSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const alerta = await prisma.alertaConfig.update({
    where: { id },
    data: parsed.data,
  })

  return NextResponse.json(alerta)
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Não autenticado" }, { status: 401 })

  const id = parseInt(params.id)
  const usuarioId = parseInt(session.user.id)
  const existing = await getAlertaOwned(id, usuarioId)
  if (!existing) return NextResponse.json({ error: "Não encontrado" }, { status: 404 })

  await prisma.alertaConfig.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
