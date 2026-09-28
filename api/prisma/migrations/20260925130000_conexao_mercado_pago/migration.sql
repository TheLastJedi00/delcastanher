-- Spec 020: recebimento na conta do vendedor, por OAuth do Mercado Pago.
--
-- Duas tabelas e uma coluna, sem dado:
--
--   - `mercado_pago_connections`: a conta que recebe as vendas, com os tokens
--     cifrados (decisoes 3 e 4). Nasce vazia: sem conexao, a loja fica fechada
--     ate o admin conectar a conta pelo painel (decisao 7).
--   - `mercado_pago_oauth_states`: as tentativas de conexao, com `state` e o
--     `code_verifier` do PKCE (decisao 5).
--   - `orders.mpConnectionId`: a conta em que a order nasceu (decisao 6). Os
--     pedidos que ja existem ficam com nulo, e nulo quer dizer "conta da
--     plataforma" — nenhum UPDATE e necessario.
-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "mpConnectionId" TEXT;

-- CreateTable
CREATE TABLE "mercado_pago_connections" (
    "id" TEXT NOT NULL,
    "mpUserId" TEXT NOT NULL,
    "nickname" TEXT,
    "email" TEXT,
    "accessTokenEncrypted" TEXT NOT NULL,
    "refreshTokenEncrypted" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "liveMode" BOOLEAN NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "connectedById" TEXT NOT NULL,
    "connectedByEmail" TEXT NOT NULL,
    "disconnectedAt" TIMESTAMP(3),
    "disconnectReason" TEXT,
    "lastRefreshedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mercado_pago_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mercado_pago_oauth_states" (
    "id" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "codeVerifier" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdByEmail" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mercado_pago_oauth_states_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mercado_pago_oauth_states_state_key" ON "mercado_pago_oauth_states"("state");

-- CreateIndex
CREATE INDEX "mercado_pago_oauth_states_expiresAt_idx" ON "mercado_pago_oauth_states"("expiresAt");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_mpConnectionId_fkey" FOREIGN KEY ("mpConnectionId") REFERENCES "mercado_pago_connections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Uma conexao ATIVA por AMBIENTE (decisoes 1 e 13).
--
-- Ativa e `disconnectedAt` nulo. Preview e producao compartilham este banco, e
-- o ambiente e da branch: preview conecta com token de teste (`liveMode`
-- falso), producao com token real. Sem separar por `liveMode`, conectar o
-- vendedor de teste no preview trocaria a conta que recebe as vendas de
-- producao.
--
-- O indice tambem impede que um clique duplo no callback deixe duas contas
-- ativas no mesmo ambiente. O Prisma nao expressa indice parcial no schema,
-- entao ele e escrito aqui e fica fora do `prisma migrate diff`: nao remova ao
-- gerar migrations futuras.
CREATE UNIQUE INDEX "mercado_pago_connections_single_active"
  ON "mercado_pago_connections" ("liveMode")
  WHERE "disconnectedAt" IS NULL;
