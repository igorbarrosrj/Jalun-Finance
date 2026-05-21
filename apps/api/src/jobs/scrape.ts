import { Job } from "bullmq"
import { scrapeAjRuiz } from "../scrapers/aj-ruiz"
import { logger } from "../lib/logger"

export const scrapeJobHandler = async (_job: Job): Promise<void> => {
  logger.info("Job scrape: iniciando varredura AJ Ruiz")
  await scrapeAjRuiz()
}
