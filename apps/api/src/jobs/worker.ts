import { Worker } from "bullmq"
import { redisConnection } from "./queue"
import { scrapeJobHandler } from "./scrape"
import { extractJobHandler } from "./extract"
import { scoreJobHandler } from "./score"
import { logger } from "../lib/logger"

const workerOpts = {
  connection: redisConnection,
  concurrency: 2,
}

const scrapeWorker = new Worker("scrape", scrapeJobHandler, workerOpts)
const extractWorker = new Worker("extract", extractJobHandler, {
  ...workerOpts,
  concurrency: 1, // 1 por vez para economizar tokens Claude
})
const scoreWorker = new Worker("score", scoreJobHandler, workerOpts)

for (const worker of [scrapeWorker, extractWorker, scoreWorker]) {
  worker.on("completed", (job) => logger.info({ queue: worker.name, jobId: job.id }, "Job concluído"))
  worker.on("failed", (job, err) =>
    logger.error({ queue: worker.name, jobId: job?.id, err: err.message }, "Job falhou")
  )
}

logger.info("Workers iniciados: scrape | extract | score")

const shutdown = async () => {
  logger.info("Encerrando workers...")
  await Promise.all([scrapeWorker.close(), extractWorker.close(), scoreWorker.close()])
  await redisConnection.quit()
  process.exit(0)
}

process.on("SIGTERM", shutdown)
process.on("SIGINT", shutdown)
