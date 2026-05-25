# Reconhecimento — R4C Empresarial
Data: 2026-05-22

## Arquitetura geral

**Não há páginas individuais de processo.** Tudo está nas páginas de índice.
O botão `a.expandir-processo` é um toggle de accordion Bootstrap (data-target="#processo-content-NNN"),
o href é vazio. O conteúdo dos cards já está no DOM ao carregar a página — sem XHR lazy.

## Índices

| Índice | URL | Total processos |
|--------|-----|----------------|
| Recuperações Judiciais | https://r4cempresarial.com.br/?tipo-de-processo=recuperacoes-judiciais | 83 |
| Falências | https://r4cempresarial.com.br/?tipo-de-processo=falencias | 135 |
| **Total** | | **218** |

Paginação: **não existe**. Toda a listagem está em uma única página por índice.

## Estrutura HTML dos cards

```html
<div class="card mb-1">
  <div class="card-header d-flex justify-content-between align-items-center">
    <h3 class="text-primary my-0 titulo-processo">Abatedouro Água de Pedra Ltda.</h3>
    <a class="expandir-processo" href="" data-toggle="collapse" data-target="#processo-content-NNN">
      <i class="fa fa-angle-down text-secondary"></i>
    </a>
  </div>
  <div class="card-body" id="processo-content-NNN">
    <div class="col-md-8 col-lg-6">
      <dl class="row small">
        <dt class="col-sm-6">Número:</dt>       <dd class="col-sm-6">1004808-43.2024.8.26.0114</dd>
        <dt class="col-sm-6">Status:</dt>        <dd class="col-sm-6">Primeira Instância</dd>
        <dt class="col-sm-6">Vara:</dt>          <dd class="col-sm-6">1ª Vara Regional...</dd>
        <dt class="col-sm-6">Juiz:</dt>          <dd class="col-sm-6">JOSE GUILHERME...</dd>
        <dt class="col-sm-6">Administrador Judicial:</dt> <dd class="col-sm-6">R4C...</dd>
        <!-- RJ tem estes dois: -->
        <dt class="col-sm-6">Data do pedido:</dt>            <dd class="col-sm-6">05/02/2024</dd>
        <dt class="col-sm-6">Data do deferimento / decretação:</dt> <dd class="col-sm-6">06/03/2024</dd>
        <!-- Falência tem apenas: -->
        <!-- <dt>Data do deferimento / decretação:</dt> <dd>31/01/1983</dd> -->
      </dl>
    </div>
    <!-- Seções de documentos (1 a 3 por processo): -->
    <h5 class="text-success mt-5 mb-4">Documentos do Processo</h5>
    <div class="row">
      <div class="col-md-8 col-lg-6">
        <p class="small mb-2">
          <i class="fa fa-file"></i>
          <a class="text-success" href="https://r4cempresarial.com.br/wp-content/uploads/2024/03/ABATEDOURO-02.-Lista-de-Credores.pdf">
            Lista de Credores
          </a>
        </p>
        ...
      </div>
    </div>
    <h5 class="text-success mt-5 mb-4">Relatórios de Atividades</h5>
    <!-- mais PDFs -->
  </div>
</div>
```

## Campos extraídos via dt/dd (por label, não por índice)

| Campo dt | Presente em | Campo Prisma |
|----------|-------------|--------------|
| `Número:` | RJ + Falência | numeroProcesso |
| `Status:` | RJ + Falência | — (ignorar) |
| `Vara:` | RJ + Falência | vara |
| `Juiz:` | RJ + Falência | — (ignorar) |
| `Administrador Judicial:` | RJ + Falência | — (verificação) |
| `Data do pedido:` | **RJ apenas** | dataDistribuicao |
| `Data do deferimento / decretação:` | RJ + Falência | dataDeferimento |

## Amostra de 3 processos RJ

### 1. Abatedouro Água de Pedra Ltda.
- CNJ: 1004808-43.2024.8.26.0114 → SP
- Deferimento: 06/03/2024 → subtipo: recuperacao_judicial_ativa (< 36 meses)
- PDFs: 26 (Lista de Credores, Petição Inicial, Decisão Constatação Prévia...)

### 2. Abengoa Bioenergia Brasil SA e outras
- CNJ: 1001163-43.2017.8.26.0538 → SP
- Deferimento: 02/10/2017 → subtipo: recuperacao_judicial_antiga (> 36 meses)
- PDFs: 30

### 3. Agrotec SP Comércio e Representações Ltda.
- CNJ: 1004209-83.2020.8.26.0037 → SP
- Deferimento: 21/05/2020 → subtipo: recuperacao_judicial_ativa
- PDFs: 53 (inclui Relação Nominal dos Credores → lista_credores)

## Amostra de 1 processo de Falência

### A D Ferian & Cia Ltda Epp
- CNJ: 0003210-23.2012.8.26.0363 → SP
- Deferimento: (não verificado)
- Sem "Data do pedido" no dt/dd

## Seções de documentos observadas

- **Documentos do Processo** — presente em todos (PDFs principais)
- **Relatórios de Atividades** — presente em ~50% dos processos
- **Vídeos do Processo** — raro (observado em Avícola Dacar)

## Caso especial: Fundição (primeiro card RJ)

- h3 está vazio (processo de 2006, provavelmente anterior ao template atual)
- Fallback: usar prefixo do nome do PDF (`FUNDICAO-01.-Peticao-Inicial.pdf` → "FUNDICAO")
- CNJ: 0017046-78.2006.8.26.0038

## Extração de estado via CNJ

Padrão CNJ: `NNNNNNN-DD.AAAA.J.TT.OOOO`
Código do tribunal `TT` → estado (mesma tabela do AJ Ruiz).
Ex: `...8.26.OOOO` → tribunal 26 → SP.

## Decisões de implementação

1. **Uma requisição por índice** (sem paginação, sem subpáginas)
2. **Parse por label de dt** (não por índice de posição) — robusto a campos ausentes
3. **Título do processo**: `h3.titulo-processo.textContent.trim()` — fallback: extrair prefixo do primeiro PDF
4. **Comarca**: extrair de `Vara` via regex `/Comarca\s+de\s+([^/\n,]+)/i`
5. **PDFs**: `a.text-success[href*=".pdf"]` — título = textContent limpo
6. **Seção do PDF**: manter tracking da última `h5` antes de cada link
7. **Delay**: 4s entre os dois índices (só 2 requisições no total)
8. **Batch por padrão**: 10 processos novos por execução (R4C_BATCH_SIZE)
