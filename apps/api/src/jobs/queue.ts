import { Queue, QueueOptions } from "bullmq"
import IORedis from "ioredis"

const redisUrl = process.env["REDIS_URL"] ?? "redis://localhost:6379"
const parsed = new URL(redisUrl)

export const redisConnection = new IORedis({
  host: parsed.hostname,
  port: parseInt(parsed.port || "6379"),
  maxRetriesPerRequest: null,
})

const queueOpts: QueueOptions = {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  },
}

export const scrapeQueue              = new Queue("scrape",              queueOpts)
export const extractQueue             = new Queue("extract",             queueOpts)
export const scoreQueue               = new Queue("score",               queueOpts)
export const extracaoPrioritariaQueue = new Queue("extract-prioritaria", {
  ...queueOpts,
  defaultJobOptions: {
    ...queueOpts.defaultJobOptions,
    attempts: 2,
    backoff: { type: "fixed", delay: 10_000 },
  },
})

export const rescrapeQueue = new Queue("rescrape-processo", {
  ...queueOpts,
  defaultJobOptions: {
    ...queueOpts.defaultJobOptions,
    attempts: 2,
    backoff: { type: "fixed", delay: 30_000 },
  },
})
