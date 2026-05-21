import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const aj = await prisma.administradorJudicial.upsert({
    where: { id: 1 },
    update: {},
    create: {
      nome: 'AJ Ruiz Administracao Judicial',
      cnpj: null,
      urlBase: 'https://www.ajruiz.com.br',
      urlIndice: 'https://www.ajruiz.com.br/processos',
      estado: 'SP',
      ativo: true,
    },
  })

  console.log('AJ Ruiz inserido:', aj)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
