import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

export async function DELETE(
  _req: Request,
  { params }: { params: { credorId: string } }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: "Não autenticado" }, { status: 401 })

  const usuarioId = parseInt(session.user.id)
  const credorId = parseInt(params.credorId)

  await prisma.credorFavorito.deleteMany({
    where: { usuarioId, credorId },
  })

  return NextResponse.json({ ok: true })
}
