-- Spec 016: o painel financeiro passa a existir, e com ele duas coisas que o
-- modelo da Spec 014 nao tinha como responder.
--
--   `orders.refundedAt`   quando o estorno aconteceu (decisao 8). Ate aqui o
--                         estorno era so uma transicao de status: bastava para
--                         trancar o conteudo, e nao bastava para um relatorio.
--                         Sem data propria, um estorno so poderia ser lancado
--                         no mes da VENDA — reabrindo um mes ja fechado — ou
--                         ficar invisivel na serie temporal.
--
--   `gateway_fee_rates`   a taxa do gateway por periodo de vigencia (decisoes
--                         3, 4 e 7). A Orders API nao devolve o custo da
--                         transacao: `fee_details` vive na API de Pagamentos,
--                         outra API. Como as taxas sao fixas por contrato,
--                         elas viram dado da plataforma, e o liquido fecha sem
--                         depender de a rede estar de pe.
--
-- **Sem backfill de `refundedAt`, deliberadamente.** Pedido ja estornado antes
-- desta coluna fica com ela nula, e nulo aqui e ausencia de dado, nunca uma
-- data. O painel soma esses casos no total de estornos do periodo inteiro e os
-- exibe em uma linha propria — "N estornos sem data registrada" —, jamais
-- distribuidos em um mes por chute. Inventar a data reabriria um mes fechado
-- com um lancamento que ninguem fez.
--
-- **Sem backfill de taxa.** A tabela nasce vazia, e periodo sem vigencia
-- cadastrada nao vira zero: o painel exibe bruto e estornos e marca o liquido
-- como NAO APURADO, dizendo quantos pedidos ficaram descobertos (decisao 5).
-- Taxa ausente tratada como 0 produziria um liquido inflado e crivel, que e a
-- pior forma de errar um numero de dinheiro.

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "refundedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "gateway_fee_rates" (
    "id" TEXT NOT NULL,
    "method" "payment_method_kind" NOT NULL,
    "percentBasisPoints" INTEGER NOT NULL,
    "fixedCents" INTEGER NOT NULL DEFAULT 0,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdByEmail" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gateway_fee_rates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- A pergunta e sempre "qual taxa deste metodo valia nesta data".
CREATE INDEX "gateway_fee_rates_method_validFrom_idx" ON "gateway_fee_rates"("method", "validFrom");

-- CreateIndex
-- O relatorio percorre periodo e situacao; o indice existente `(userId,
-- createdAt)` foi desenhado para o historico de um aluno (decisao 12).
CREATE INDEX "orders_status_paidAt_idx" ON "orders"("status", "paidAt");
