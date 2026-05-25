-- AlterTable
ALTER TABLE "documentos" ADD COLUMN     "relevante" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "processos" ADD COLUMN     "nome_incerto" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "prioridade" TEXT;
