import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { PrismaClient } from "@prisma/client"
import { z } from "zod"

const prisma = new PrismaClient()

const AlertaSchema = z.object({
  scoreMinimo: z.number().min(0).max(1).nullable().optional(),
  valorMinimo: z.number().positive().nullable().optional(),
  valorMaximo: z.number().positive().nullable().optional(),
  classes: z.array(z.string()).default([]),
  estados: z.array(z.string()).default([]),
  canal: z.enum(["email", "webhook"]).default("email"),
  webhookUrl: z.string().url().nullable().optional(),
  ativo: z.boolean().default(true),
})

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Não autenticado" }, { status: 401 })

  const alertas = await prisma.alertaConfig.findMany({
    where: { usuarioId: parseInt(session.user.id) },
    orderBy: { criadoEm: "desc" },
  })

  return NextResponse.json(alertas)
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Não autenticado" }, { status: 401 })

  const body = await req.json()
  const parsed = AlertaSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const alerta = await prisma.alertaConfig.create({
    data: { ...parsed.data, usuarioId: parseInt(session.user.id) },
  })

  return NextResponse.json(alerta, { status: 201 })
}
