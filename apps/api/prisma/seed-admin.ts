import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

const prisma = new PrismaClient()

async function main() {
  const email = process.env.ADMIN_EMAIL ?? "admin@jalun.com.br"
  const senha = process.env.ADMIN_PASSWORD ?? "Admin@2026"
  const nome = process.env.ADMIN_NOME ?? "Administrador"

  const senhaHash = await bcrypt.hash(senha, 12)

  const usuario = await prisma.usuario.upsert({
    where: { email },
    update: { senhaHash, ativo: true },
    create: { email, nome, senhaHash, papel: "admin" },
  })

  console.log(`✓ Admin criado/atualizado: ${usuario.email} (id=${usuario.id})`)
  console.log(`  Senha: ${senha}`)
  console.log(`  Troque a senha após o primeiro login.`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
