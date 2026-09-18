-- Spec 015: a Politica de Privacidade entra em vigor e o aceite passa a ser
-- registrado.
--
-- Duas colunas novas em `users`:
--
--   `policyAcceptedAt`      instante do aceite, gravado no onboarding — o
--                           primeiro passo autenticado, e o unico lugar onde
--                           existe usuario para gravar (decisao 7).
--   `policyAcceptedVersion` versao vigente naquele momento. Sem ela, "aceitou
--                           em 18/09" nao diz o que foi aceito, e a proxima
--                           revisao do documento tornaria todo aceite anterior
--                           ilegivel.
--
-- **Sem backfill, deliberadamente.** As contas existentes ficam com as duas
-- colunas nulas, e nulo aqui significa "conta anterior a exigencia", nunca
-- "recusou" (decisao 8). Carimbar uma data de aceite em quem nunca viu o
-- checkbox seria fabricar exatamente a prova que a coluna existe para guardar —
-- e um registro de consentimento inventado e pior que registro nenhum, porque
-- o primeiro mente e o segundo apenas falta.
--
-- Esses alunos tambem nao sao barrados: a exigencia incide sobre concluir o
-- onboarding, e quem ja concluiu segue editando o proprio perfil normalmente
-- (decisao 9). Eles registram o aceite quando a plataforma vier a pedi-lo de
-- novo — o que esta spec deixou fora de escopo.
--
-- Migration puramente estrutural: nenhuma linha muda de significado.

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "policyAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "policyAcceptedVersion" TEXT;
