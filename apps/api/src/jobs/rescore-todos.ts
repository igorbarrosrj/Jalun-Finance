import { scorarTodosV2 } from "../scoring/v2"
import { logger } from "../lib/logger"
import { prisma } from "../lib/db"

scorarTodosV2()
  .then(() => logger.info("score:reprocess finalizado"))
  .catch((e) => { logger.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
