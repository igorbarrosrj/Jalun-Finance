import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Não autenticado" }, { status: 401 })

  const usuarioId = parseInt(session.user.id)

  const favoritos = await prisma.credorFavorito.findMany({
    where: { usuarioId },
    include: {
      credor: {
        include: {
          processo: {
            select: { id: true, numeroProcesso: true, recuperandaRazaoSocial: true, estado: true },
          },
        },
      },
    },
    orderBy: { criadoEm: "desc" },
  })

  return NextResponse.json(favoritos)
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Não autenticado" }, { status: 401 })

  const usuarioId = parseInt(session.user.id)
  const { credorId, notas } = await req.json()
  if (!credorId) return NextResponse.json({ error: "credorId obrigatório" }, { status: 400 })

  const favorito = await prisma.credorFavorito.upsert({
    where: { usuarioId_credorId: { usuarioId, credorId } },
    update: { notas: notas ?? undefined },
    create: { usuarioId, credorId, notas: notas ?? null },
  })

  return NextResponse.json(favorito, { status: 201 })
}
