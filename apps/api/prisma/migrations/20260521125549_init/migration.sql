-- CreateTable
CREATE TABLE "administradores_judiciais" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "cnpj" TEXT,
    "url_base" TEXT NOT NULL,
    "url_indice" TEXT,
    "estado" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ultima_varredura" TIMESTAMP(3),
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "administradores_judiciais_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processos" (
    "id" SERIAL NOT NULL,
    "aj_id" INTEGER NOT NULL,
    "numero_processo" TEXT NOT NULL,
    "tipo" TEXT,
    "recuperanda_razao_social" TEXT,
    "recuperanda_cnpj" TEXT,
    "vara" TEXT,
    "comarca" TEXT,
    "estado" TEXT,
    "data_distribuicao" TIMESTAMP(3),
    "data_deferimento" TIMESTAMP(3),
    "url_pagina_aj" TEXT,
    "status" TEXT NOT NULL DEFAULT 'novo',
    "raw_html" TEXT,
    "descoberto_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3),

    CONSTRAINT "processos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documentos" (
    "id" SERIAL NOT NULL,
    "processo_id" INTEGER NOT NULL,
    "tipo_documento" TEXT,
    "nome_arquivo" TEXT,
    "url_pdf" TEXT NOT NULL,
    "data_publicacao" TIMESTAMP(3),
    "hash_arquivo" TEXT,
    "caminho_local" TEXT,
    "tamanho_bytes" INTEGER,
    "extraido" BOOLEAN NOT NULL DEFAULT false,
    "erro_extracao" TEXT,
    "baixado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listas_credores" (
    "id" SERIAL NOT NULL,
    "processo_id" INTEGER NOT NULL,
    "documento_id" INTEGER NOT NULL,
    "total_classe_1" DECIMAL(15,2),
    "total_classe_2" DECIMAL(15,2),
    "total_classe_3" DECIMAL(15,2),
    "total_classe_4" DECIMAL(15,2),
    "total_geral" DECIMAL(15,2),
    "qtd_credores" INTEGER,
    "raw_json" JSONB,
    "extraido_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listas_credores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credores" (
    "id" SERIAL NOT NULL,
    "lista_id" INTEGER NOT NULL,
    "processo_id" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "documento" TEXT,
    "tipo_pessoa" TEXT,
    "valor" DECIMAL(15,2) NOT NULL,
    "moeda" TEXT NOT NULL DEFAULT 'BRL',
    "classe" TEXT NOT NULL,
    "posicao_lista" INTEGER,
    "recuperacao_esperada" DECIMAL(15,2),
    "preco_alvo_compra" DECIMAL(15,2),
    "score" DECIMAL(8,4),
    "score_motivos" TEXT,

    CONSTRAINT "credores_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "processos_numero_processo_key" ON "processos"("numero_processo");

-- CreateIndex
CREATE UNIQUE INDEX "documentos_url_pdf_key" ON "documentos"("url_pdf");

-- CreateIndex
CREATE INDEX "credores_score_idx" ON "credores"("score" DESC);

-- CreateIndex
CREATE INDEX "credores_classe_idx" ON "credores"("classe");

-- CreateIndex
CREATE INDEX "credores_valor_idx" ON "credores"("valor" DESC);

-- AddForeignKey
ALTER TABLE "processos" ADD CONSTRAINT "processos_aj_id_fkey" FOREIGN KEY ("aj_id") REFERENCES "administradores_judiciais"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_processo_id_fkey" FOREIGN KEY ("processo_id") REFERENCES "processos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listas_credores" ADD CONSTRAINT "listas_credores_processo_id_fkey" FOREIGN KEY ("processo_id") REFERENCES "processos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listas_credores" ADD CONSTRAINT "listas_credores_documento_id_fkey" FOREIGN KEY ("documento_id") REFERENCES "documentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credores" ADD CONSTRAINT "credores_lista_id_fkey" FOREIGN KEY ("lista_id") REFERENCES "listas_credores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credores" ADD CONSTRAINT "credores_processo_id_fkey" FOREIGN KEY ("processo_id") REFERENCES "processos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
