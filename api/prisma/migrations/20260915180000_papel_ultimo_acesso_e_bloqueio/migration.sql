-- Spec 013: o painel administrativo passa a ler usuarios de verdade.
--
-- Tres colunas novas em `users`, todas a servico da listagem administrativa:
--
--   `role`       espelho de leitura do custom claim do Firebase (decisao 3).
--                A autorizacao NAO muda de fonte: `FirebaseAuthGuard` e
--                `RolesGuard` continuam decidindo pelo token. A coluna existe
--                porque filtrar e contar por papel sobre o claim exigiria uma
--                chamada ao Admin SDK por linha da tabela.
--   `lastSeenAt` carimbo da entrada na plataforma (decisao 5).
--   `blockedAt`  espelho do `disabled` do Firebase (decisao 9).
--
-- Migration puramente estrutural: nenhuma linha muda de significado. As contas
-- existentes recebem `role = aluno` pelo default — quem ja e admin tem o claim
-- no Firebase e converge para `admin` na primeira entrada, pela reconciliacao
-- da decisao 4. `lastSeenAt` e `blockedAt` ficam nulos: nulo em `lastSeenAt`
-- significa "nao acessou desde que a coluna existe", e nao "inativo", e nulo
-- em `blockedAt` e a conta em uso normal.

-- CreateEnum
CREATE TYPE "role" AS ENUM ('aluno', 'admin');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "role" "role" NOT NULL DEFAULT 'aluno',
ADD COLUMN     "lastSeenAt" TIMESTAMP(3),
ADD COLUMN     "blockedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "users_lastSeenAt_idx" ON "users"("lastSeenAt");
