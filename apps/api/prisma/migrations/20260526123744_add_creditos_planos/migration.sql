-- CreateTable
CREATE TABLE "planos" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "preco" DECIMAL(10,2) NOT NULL,
    "creditos_mes" INTEGER NOT NULL,
    "recursos" JSONB NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "planos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assinaturas_usuarios" (
    "id" SERIAL NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "plano_id" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'trial',
    "inicio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "proxima_renovacao" TIMESTAMP(3) NOT NULL,
    "cancelamento_em" TIMESTAMP(3),

    CONSTRAINT "assinaturas_usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "creditos_usuarios" (
    "id" SERIAL NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "saldo" INTEGER NOT NULL DEFAULT 0,
    "ultima_recarga" TIMESTAMP(3),

    CONSTRAINT "creditos_usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transacoes_creditos" (
    "id" SERIAL NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "descricao" TEXT,
    "processo_id" INTEGER,
    "metadata" JSONB,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transacoes_creditos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "solicitacoes_extracao" (
    "id" SERIAL NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "processo_id" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'aguardando',
    "creditos_consumidos" INTEGER NOT NULL DEFAULT 1,
    "iniciado_em" TIMESTAMP(3),
    "concluido_em" TIMESTAMP(3),
    "erro_mensagem" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "solicitacoes_extracao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "planos_slug_key" ON "planos"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "assinaturas_usuarios_usuario_id_key" ON "assinaturas_usuarios"("usuario_id");

-- CreateIndex
CREATE UNIQUE INDEX "creditos_usuarios_usuario_id_key" ON "creditos_usuarios"("usuario_id");

-- CreateIndex
CREATE INDEX "transacoes_creditos_usuario_id_criado_em_idx" ON "transacoes_creditos"("usuario_id", "criado_em" DESC);

-- CreateIndex
CREATE INDEX "solicitacoes_extracao_usuario_id_criado_em_idx" ON "solicitacoes_extracao"("usuario_id", "criado_em" DESC);

-- CreateIndex
CREATE INDEX "solicitacoes_extracao_status_idx" ON "solicitacoes_extracao"("status");

-- AddForeignKey
ALTER TABLE "assinaturas_usuarios" ADD CONSTRAINT "assinaturas_usuarios_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assinaturas_usuarios" ADD CONSTRAINT "assinaturas_usuarios_plano_id_fkey" FOREIGN KEY ("plano_id") REFERENCES "planos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creditos_usuarios" ADD CONSTRAINT "creditos_usuarios_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transacoes_creditos" ADD CONSTRAINT "transacoes_creditos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitacoes_extracao" ADD CONSTRAINT "solicitacoes_extracao_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitacoes_extracao" ADD CONSTRAINT "solicitacoes_extracao_processo_id_fkey" FOREIGN KEY ("processo_id") REFERENCES "processos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
