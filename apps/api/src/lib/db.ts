import { config } from 'dotenv'
import path from 'path'

// Load .env from monorepo root (works when running from apps/api or repo root)
config({ path: path.resolve(process.cwd(), '../../.env') })
config({ path: path.resolve(process.cwd(), '.env') })

import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env['NODE_ENV'] === 'development'
      ? ['query', 'error', 'warn']
      : ['error'],
  })

if (process.env['NODE_ENV'] !== 'production') {
  globalForPrisma.prisma = prisma
}
