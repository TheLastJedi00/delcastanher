-- Spec 019: a tabela comercial real, no lugar do preco de trabalho da Spec 014.
--
-- Dois blocos de dados, os dois idempotentes:
--
--   1. PRECO DOS MODULOS (decisao 1). Os 12 modulos do curso `imersao-rh`,
--      casados pela ORDEM, e nao pelo titulo: a tabela comercial chama o
--      modulo 05 de "Desenvolvimento e Trilhas", e o banco, de "Desenvolvimento
--      e Trilhas de Aprendizado". So muda o que ainda e provisorio — 19900, o
--      valor da migration da Spec 014, ou nulo. Um modulo que o administrador
--      ja reajustou no painel fica com o valor dele.
--
--   2. PACOTE DE LANCAMENTO (decisoes 2 e 3). O pacote, os 12 vinculos e os
--      quatro lotes, com ids fixos e `ON CONFLICT DO NOTHING`: um ambiente que
--      o seed ja tenha semeado nao ganha nada em dobro, e rodar de novo nao
--      reescreve preco nem vagas editados no painel.
--
-- Banco sem o curso (recem-criado, antes do `db:seed`) passa por aqui sem
-- efeito: todo INSERT e UPDATE e filtrado pelo slug do curso, e o seed cria o
-- mesmo conteudo depois.

-- 1. Preco dos modulos --------------------------------------------------------

DO $$
DECLARE
  changed INTEGER;
BEGIN
  UPDATE "modules" AS m
  SET "priceCents" = p.price, "updatedAt" = CURRENT_TIMESTAMP
  FROM "courses" AS c,
       (VALUES
         (1, 19700), (2, 19700), (3, 29700), (4, 19700),
         (5, 19700), (6, 19700), (7, 19700), (8, 19700),
         (9, 19700), (10, 19700), (11, 24700), (12, 24700)
       ) AS p("order", price)
  WHERE m."courseId" = c."id"
    AND c."slug" = 'imersao-rh'
    AND m."order" = p."order"
    AND (m."priceCents" = 19900 OR m."priceCents" IS NULL);

  GET DIAGNOSTICS changed = ROW_COUNT;
  RAISE NOTICE 'Spec 019: % modulo(s) com o preco real aplicado.', changed;
END $$;

-- 2. Pacote de Lancamento -----------------------------------------------------

INSERT INTO "bundles" ("id", "slug", "title", "courseId", "active", "createdAt", "updatedAt")
SELECT 'bundle_imersao_rh_lancamento',
       'imersao-rh-lancamento',
       'Pacote de Lançamento — Imersão RH Estratégico',
       c."id", true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "courses" AS c
WHERE c."slug" = 'imersao-rh'
ON CONFLICT DO NOTHING;

-- Os 12 modulos da tabela comercial, e nao "todos os modulos do curso": um
-- modulo criado depois nao entra no pacote sem alguem decidir (decisao 2).
INSERT INTO "bundle_modules" ("bundleId", "moduleId")
SELECT b."id", m."id"
FROM "bundles" AS b
JOIN "modules" AS m ON m."courseId" = b."courseId"
WHERE b."slug" = 'imersao-rh-lancamento'
  AND m."order" BETWEEN 1 AND 12
ON CONFLICT DO NOTHING;

-- Nomes sem emoji: eles vao para o snapshot do pedido e para o painel.
INSERT INTO "bundle_tiers" ("id", "bundleId", "order", "name", "priceCents", "capacity", "createdAt", "updatedAt")
SELECT t."id", b."id", t."order", t."name", t.price, t.capacity, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "bundles" AS b,
     (VALUES
       ('tier_imersao_rh_lancamento_1', 1, 'Lote Fundador', 59000, 20),
       ('tier_imersao_rh_lancamento_2', 2, '2º Lote', 79700, 30),
       ('tier_imersao_rh_lancamento_3', 3, '3º Lote', 99700, 50),
       ('tier_imersao_rh_lancamento_4', 4, 'Preço oficial', 149700, NULL)
     ) AS t("id", "order", "name", price, capacity)
WHERE b."slug" = 'imersao-rh-lancamento'
ON CONFLICT DO NOTHING;
