# Tasks: Spec 027 - Preço Único do Pacote

Spec de `api/` (NestJS + Prisma + Jest) e `front/` (Angular standalone + signals + Tailwind). No backend a suíte vem **antes** da implementação, conforme `.claude/RULES.md`. As decisões referenciadas estão no `context.md`.

Ordem das fases:
1. Primeiro o backend, com a regra do painel e o seed, porque o front depende de a API recusar edição de lote encerrado.
2. Depois a migration, escrita e conferida, mas **não** aplicada em produção.
3. Então o front.
4. Por fim, a produção: merge, migration com autorização e conferência no Chrome.

## Fase 1: API - Painel e Seed
- [x] **Task 1.1:** Em `bundles.service.spec.ts`, escrever os casos do `updateTier` (decisão 4) e os do preço único na vitrine e no pedido (decisões 1 e 5):
  - lote que não é o último → 400 "Este lote foi encerrado e não pode ser editado.";
  - último lote com `priceCents` → grava e devolve o lote com `current: true`.

  Os casos de capacidade da Spec 019 moravam no `admin-bundles.http.spec.ts` e saem na Task 1.2.
- [x] **Task 1.2:** Em `admin-bundles.http.spec.ts`, cobrir `capacity` no corpo → 400 (DTO com `forbidNonWhitelisted`) e `PATCH` em lote encerrado → 400.
- [x] **Task 1.3:** Tirar `capacity` do `UpdateBundleTierDto` e do `UpdateTierInput`. No `updateTier`, recusar o lote que não é o de `order` máximo e apagar as validações de capacidade.
- [x] **Task 1.4:** No `prisma/seed.ts`, trocar `TIERS` por um lote só (`Preço único`, 98900, sem limite) e criá-lo apenas quando o pacote não tem lote nenhum (decisão 3). Atualizar o título do pacote e a mensagem final do seed.

## Fase 2: API - Migration
- [x] **Task 2.1:** Escrever `prisma/migrations/<timestamp>_preco_unico_do_pacote/migration.sql` (decisão 2): fechar com a contagem de `PAID` + `REFUNDED` os lotes não-últimos que têm pedido, apagar os não-últimos sem pedido, gravar `Preço único` a R$ 989,00 sem limite no último e o título novo no pacote. Usar `RAISE NOTICE` com as contagens. Tudo filtrado por `slug = 'imersao-rh-lancamento'`.
- [x] **Task 2.2:** Conferir a migration contra uma cópia do estado de produção sem gravar no banco de produção — por exemplo, num branch do Neon ou num Postgres local com os dados da tabela de "Situação em produção". Rodar duas vezes para provar que é idempotente.

## Fase 3: Front
- [x] **Task 3.1:** Na `ui-bundle-price`, tirar o selo do lote e o `tierLabel`. Ajustar o spec do componente.
- [x] **Task 3.2:** No `/planos`, tirar a faixa de escassez e o esqueleto dela, trocar o CTA por "Quero o pacote completo" e ajustar a meta description (decisão 6). Ajustar `plans.spec.ts`.
- [x] **Task 3.3:** Na página do curso, tirar a faixa de escassez e trocar "Pacote de Lançamento" por "Pacote completo". Ajustar `course-detail.spec.ts`.
- [x] **Task 3.4:** Na loja, tirar "Restam N vagas…", mostrar "12 módulos" no resumo e tirar o lote do texto da oferta de troca. Ajustar `loja.spec.ts`.
- [x] **Task 3.5:** No pagamento, reescrever o aviso de preço alterado sem vagas e lote, e tirar o lote do resumo. Ajustar o spec.
- [x] **Task 3.6:** No painel (`admin-pacote.ts`), passar a mostrar "Pacote completo" com o preço único e "Editar preço", e "Lotes encerrados" só para leitura, sem a coluna de vagas (decisão 4). Tirar `capacity` do `UpdateTierInput` do `admin-bundles.service.ts`. Ajustar `admin-pacote.spec.ts`.
- [x] **Task 3.7:** Trocar o `overline` do `LAUNCH_BUNDLE_COPY` e apagar `tierLabel`, `TIER_EMOJI`, `bundleScarcity`, o `ui-scarcity-banner` e o `placeholders.seats`, se ficarem sem uso.
- [x] **Task 3.8:** Rodar `ng test` e `ng build` do front e `npm test` da API.

## Fase 4: Produção
- [ ] **Task 4.1:** Abrir o PR e fazer o merge na `main`.
- [ ] **Task 4.2:** Com **autorização explícita** (decisão 8), rodar `npx prisma migrate deploy` contra produção e registrar o resultado das `NOTICE`.
- [ ] **Task 4.3:** Conferir no Chrome, em `www.delcastanher.srv.br`:
  - `/planos`, `/cursos/imersao-rh` e `/loja` com R$ 989,00, a âncora riscada e nada de lote ou vagas;
  - o painel com o preço único editável e o Fundador encerrado com 3 vendidos;
  - o financeiro com os 3 pedidos do Fundador intactos.
- [ ] **Task 4.4:** Rodar o inventário de novo, só leitura, e registrar o estado final no fim deste arquivo.

## Registro da execução

- **Task 2.2 (20/10/2026):** sem Postgres local, a migration rodou no PGlite (Postgres em WASM) com as tabelas `bundles`, `bundle_tiers` e `orders` e o estado de produção da tabela "Situação em produção" (3 `PAID` e 5 `CANCELLED` no Fundador), mais um pedido `PENDING` no Fundador.
  - Primeira e segunda passada: sobram o Lote Fundador (capacidade 3, o pendente não conta) e o Preço único (R$ 989,00, sem limite). O 2º e o 3º lote são apagados, os 10 pedidos ficam e o título do pacote é o novo.
  - Banco sem o pacote: nenhum efeito.
  - Estornado conta como vaga vendida, e um lote com pedido só expirado fica, fechado em 0 vagas.
- **Fase 3 (20/10/2026):**
  - O `overline` do `LAUNCH_BUNDLE_COPY` mudou já na Task 3.2, porque o teste do `/planos` confere que a página não diz "lançamento".
  - O painel decide o lote editável pelo **último na ordem**, e não pelo `current` que a decisão 4 citava: é o mesmo critério do servidor, e ele vale também antes da migration, quando o vigente ainda é o Fundador.
  - A `ui-bundle-price` não tinha spec próprio; ela é coberta pelos specs do `/planos`, da página do curso e da loja.
  - O teste de espaçamento do pagamento (PR #54) falhava às vezes com 5,99997 px contra 6 px, conforme a ordem aleatória dos testes. Ele passou a arredondar para pixel inteiro.
  - `ng test`: 693 de 693 em quatro rodadas seguidas. Uma rodada anterior falhou nos 11 testes do `/planos` de uma vez, no `beforeEach`, e não se repetiu.
  - `ng build`: ok, com 8 rotas prerenderizadas.
  - `npm test` da API: 1179 de 1180. A falha é `cache.http.spec.ts › o 404 tambem vai para o cache` (500 no lugar de 404), que falha igual com o `api/src` da `main` e não tem relação com esta spec.
