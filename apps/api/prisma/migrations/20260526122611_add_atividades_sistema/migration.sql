-- CreateTable
CREATE TABLE "atividades_sistema" (
    "id" SERIAL NOT NULL,
    "tipo" TEXT NOT NULL,
    "processo_id" INTEGER,
    "credor_id" INTEGER,
    "metadata" JSONB,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "atividades_sistema_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "atividades_sistema_criado_em_idx" ON "atividades_sistema"("criado_em" DESC);

-- CreateIndex
CREATE INDEX "atividades_sistema_tipo_idx" ON "atividades_sistema"("tipo");
