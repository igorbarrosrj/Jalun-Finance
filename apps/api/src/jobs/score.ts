import { Job } from "bullmq"
import { scorarCredoresDoProcesso } from "../scoring/v1"
import { logger } from "../lib/logger"

export const scoreJobHandler = async (job: Job<{ processoId: number }>): Promise<void> => {
  const { processoId } = job.data
  logger.info({ processoId }, "Job score: calculando scores")
  await scorarCredoresDoProcesso(processoId)
}
