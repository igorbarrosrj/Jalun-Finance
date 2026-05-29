import { prisma } from "./db"
import { logger } from "./logger"

type TipoAtividade = "processo_novo" | "credor_novo" | "plano_atualizado" | "lista_atualizada"

export async function registrarAtividade(
  tipo: TipoAtividade,
  opts: { processoId?: number; credorId?: number; metadata?: object }
): Promise<void> {
  try {
    await prisma.atividadeSistema.create({ data: { tipo, ...opts } })
  } catch (err) {
    logger.warn({ tipo, err: (err as Error).message }, "Falha ao registrar atividade")
  }
}
