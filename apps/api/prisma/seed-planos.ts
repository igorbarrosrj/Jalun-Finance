import { PrismaClient, Prisma } from "@prisma/client"

const prisma = new PrismaClient()

const PLANOS: Prisma.PlanoCreateInput[] = [
  {
    slug: "starter",
    nome: "Starter",
    preco: new Prisma.Decimal("1997.00"),
    creditosMes: 15,
    recursos: {
      alertas: false,
      visoes: 3,
      exportacao: "csv",
      api: false,
      suporte: "email",
    },
    ativo: true,
    ordem: 1,
  },
  {
    slug: "pro",
    nome: "Pro",
    preco: new Prisma.Decimal("6997.00"),
    creditosMes: 100,
    recursos: {
      alertas: true,
      visoes: 20,
      exportacao: "xlsx",
      api: true,
      api_requests_mes: 10000,
      suporte: "priority",
    },
    ativo: true,
    ordem: 2,
  },
  {
    slug: "enterprise",
    nome: "Enterprise",
    preco: new Prisma.Decimal("19997.00"),
    creditosMes: 500,
    recursos: {
      alertas: true,
      visoes: -1,
      exportacao: "xlsx",
      api: true,
      api_requests_mes: -1,
      webhook: true,
      suporte: "dedicated",
      sla: true,
      white_label: false,
    },
    ativo: true,
    ordem: 3,
  },
]

async function main() {
  for (const plano of PLANOS) {
    const existing = await prisma.plano.findUnique({ where: { slug: plano.slug as string } })
    if (existing) {
      await prisma.plano.update({ where: { slug: plano.slug as string }, data: plano })
      console.log(`~ Plano: ${plano.nome} (id=${existing.id}, updated)`)
    } else {
      const created = await prisma.plano.create({ data: plano })
      console.log(`+ Plano: ${plano.nome} (id=${created.id}, created)`)
    }
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
