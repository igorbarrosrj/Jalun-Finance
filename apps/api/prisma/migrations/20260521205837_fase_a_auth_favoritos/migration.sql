-- AlterTable
ALTER TABLE "credores" ADD COLUMN     "cessivel" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "listas_credores" ADD COLUMN     "qualidade_baixa" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "processos" ADD COLUMN     "subtipo" TEXT;

-- CreateTable
CREATE TABLE "usuarios" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "senha_hash" TEXT NOT NULL,
    "papel" TEXT NOT NULL DEFAULT 'viewer',
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimo_login" TIMESTAMP(3),

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credores_favoritos" (
    "id" SERIAL NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "credor_id" INTEGER NOT NULL,
    "notas" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credores_favoritos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alertas_config" (
    "id" SERIAL NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "score_minimo" DECIMAL(4,2),
    "valor_minimo" DECIMAL(15,2),
    "valor_maximo" DECIMAL(15,2),
    "classes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "estados" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "canal" TEXT NOT NULL DEFAULT 'email',
    "webhook_url" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alertas_config_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE UNIQUE INDEX "credores_favoritos_usuario_id_credor_id_key" ON "credores_favoritos"("usuario_id", "credor_id");

-- CreateIndex
CREATE INDEX "credores_cessivel_idx" ON "credores"("cessivel");

-- AddForeignKey
ALTER TABLE "credores_favoritos" ADD CONSTRAINT "credores_favoritos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credores_favoritos" ADD CONSTRAINT "credores_favoritos_credor_id_fkey" FOREIGN KEY ("credor_id") REFERENCES "credores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alertas_config" ADD CONSTRAINT "alertas_config_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
