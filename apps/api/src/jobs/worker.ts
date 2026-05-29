import { Worker } from "bullmq"
import { redisConnection } from "./queue"
import { scrapeJobHandler } from "./scrape"
import { extractJobHandler } from "./extract"
import { scoreJobHandler } from "./score"
import { extracaoPrioritariaJobHandler } from "./extract-prioritario"
import { rescrapeProcessoJobHandler } from "./rescrape-processo"
import { logger } from "../lib/logger"

const workerOpts = {
  connection: redisConnection,
  concurrency: 2,
}

const scrapeWorker = new Worker("scrape", scrapeJobHandler, workerOpts)
const extractWorker = new Worker("extract", extractJobHandler, {
  ...workerOpts,
  concurrency: 1,
})
const scoreWorker = new Worker("score", scoreJobHandler, workerOpts)
// Fila dedicada para extrações sob demanda — processa 1 por vez, tem prioridade sobre a automática
const extracaoPrioritariaWorker = new Worker(
  "extract-prioritaria",
  extracaoPrioritariaJobHandler,
  { connection: redisConnection, concurrency: 1 }
)

// Re-scrape de processo individual (Playwright pesado — 1 por vez)
const rescrapeWorker = new Worker(
  "rescrape-processo",
  rescrapeProcessoJobHandler,
  { connection: redisConnection, concurrency: 1 }
)

for (const worker of [scrapeWorker, extractWorker, scoreWorker, extracaoPrioritariaWorker, rescrapeWorker]) {
  worker.on("completed", (job) => logger.info({ queue: worker.name, jobId: job.id }, "Job concluído"))
  worker.on("failed", (job, err) =>
    logger.error({ queue: worker.name, jobId: job?.id, err: err.message }, "Job falhou")
  )
}

logger.info("Workers iniciados: scrape | extract | score | extract-prioritaria")

const shutdown = async () => {
  logger.info("Encerrando workers...")
  await Promise.all([
    scrapeWorker.close(),
    extractWorker.close(),
    scoreWorker.close(),
    extracaoPrioritariaWorker.close(),
    rescrapeWorker.close(),
  ])
  await redisConnection.quit()
  process.exit(0)
}

process.on("SIGTERM", shutdown)
process.on("SIGINT", shutdown)
