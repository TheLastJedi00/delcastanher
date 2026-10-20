-- Spec 027: o pacote passa a ter preco unico, R$ 989,00, e os lotes da
-- Spec 019 sao encerrados (decisoes 1 e 2).
--
-- Tudo filtrado pelo slug do pacote, e idempotente: rodar de novo chega ao
-- mesmo estado. A regra de lote vigente (`pickTier`) nao muda — com um unico
-- lote aberto e sem limite, ela sempre o escolhe.
--
--   1. LOTES ANTERIORES COM PEDIDO (o Fundador): fechados com as vagas que ja
--      venderam de forma definitiva, `PAID` ou `REFUNDED`. Pendente nao entra:
--      contado, ele deixaria uma vaga sobrando ao vencer, e o lote reabriria
--      pelo preco de lancamento. Pendente que for pago depois e honrado, e o
--      lote fica com mais vendas que vagas — o `pickTier` o pula igual.
--   2. LOTES ANTERIORES SEM PEDIDO NENHUM (2o e 3o lote): apagados. Lote com
--      pedido, mesmo cancelado, fica: e historico, e o `Restrict` do pedido
--      recusaria.
--   3. ULTIMO LOTE: "Preco unico", R$ 989,00, sem limite.
--   4. PACOTE: o titulo novo. Pedidos antigos guardam o titulo antigo no
--      snapshot.

DO $$
DECLARE
  pack_id   TEXT;
  last_ord  INTEGER;
  closed    INTEGER;
  removed   INTEGER;
BEGIN
  SELECT "id" INTO pack_id FROM "bundles" WHERE "slug" = 'imersao-rh-lancamento';

  IF pack_id IS NULL THEN
    RAISE NOTICE 'Spec 027: pacote imersao-rh-lancamento nao existe; nada a fazer.';
    RETURN;
  END IF;

  SELECT MAX("order") INTO last_ord FROM "bundle_tiers" WHERE "bundleId" = pack_id;

  IF last_ord IS NULL THEN
    RAISE NOTICE 'Spec 027: pacote sem lote; o seed cria o preco unico.';
    RETURN;
  END IF;

  -- 1. Lotes anteriores com pedido: fechados pela venda definitiva.
  UPDATE "bundle_tiers" AS t
  SET "capacity" = (
        SELECT COUNT(*)::INTEGER
        FROM "orders" AS o
        WHERE o."bundleTierId" = t."id"
          AND o."status"::TEXT IN ('PAID', 'REFUNDED')
      ),
      "updatedAt" = CURRENT_TIMESTAMP
  WHERE t."bundleId" = pack_id
    AND t."order" < last_ord
    AND EXISTS (SELECT 1 FROM "orders" AS o WHERE o."bundleTierId" = t."id");

  GET DIAGNOSTICS closed = ROW_COUNT;

  -- 2. Lotes anteriores que nunca tiveram pedido.
  DELETE FROM "bundle_tiers" AS t
  WHERE t."bundleId" = pack_id
    AND t."order" < last_ord
    AND NOT EXISTS (SELECT 1 FROM "orders" AS o WHERE o."bundleTierId" = t."id");

  GET DIAGNOSTICS removed = ROW_COUNT;

  -- 3. Preco unico.
  UPDATE "bundle_tiers"
  SET "name" = 'Preço único', "priceCents" = 98900, "capacity" = NULL, "updatedAt" = CURRENT_TIMESTAMP
  WHERE "bundleId" = pack_id AND "order" = last_ord;

  -- 4. Titulo do pacote.
  UPDATE "bundles"
  SET "title" = 'Imersão RH Estratégico — Pacote completo', "updatedAt" = CURRENT_TIMESTAMP
  WHERE "id" = pack_id;

  RAISE NOTICE 'Spec 027: % lote(s) encerrado(s), % apagado(s); preco unico de R$ 989,00 no lote de ordem %.',
    closed, removed, last_ord;
END $$;
