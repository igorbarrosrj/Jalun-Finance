import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const AJS = [
  {
    nome: 'AJ Ruiz Administracao Judicial',
    urlBase: 'https://www.ajruiz.com.br',
    urlIndice: 'https://www.ajruiz.com.br/processos',
    estado: 'SP',
    ativo: true,
  },
  {
    nome: 'R4C Administracao Judicial',
    urlBase: 'https://www.r4c.com.br',
    urlIndice: null as string | null,
    estado: 'SP',
    ativo: false,
  },
  {
    nome: 'Diligence Administracao Judicial',
    urlBase: 'https://www.diligence.com.br',
    urlIndice: null as string | null,
    estado: 'SP',
    ativo: false,
  },
  {
    nome: 'Credibilita Administracao Judicial',
    urlBase: 'https://www.credibilita.com.br',
    urlIndice: null as string | null,
    estado: 'SP',
    ativo: false,
  },
  {
    nome: 'Cury Administracao Judicial',
    urlBase: 'https://www.curyadministracao.com.br',
    urlIndice: null as string | null,
    estado: 'SP',
    ativo: false,
  },
]

async function main() {
  for (const data of AJS) {
    const existing = await prisma.administradorJudicial.findFirst({ where: { urlBase: data.urlBase } })
    if (existing) {
      await prisma.administradorJudicial.update({ where: { id: existing.id }, data: { nome: data.nome, ativo: data.ativo } })
      console.log(`~ AJ: ${data.nome} (id=${existing.id}, updated)`)
    } else {
      const created = await prisma.administradorJudicial.create({ data })
      console.log(`+ AJ: ${data.nome} (id=${created.id}, created)`)
    }
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
