# Tasks: Spec 030 - Módulo de Teste de Pagamento

Spec de `api/` (NestJS + Prisma + Jest) e `front/` (Angular standalone + signals + Tailwind). No backend a suíte vem **antes** da implementação, conforme `.claude/RULES.md`. As decisões referenciadas estão no `context.md`.

Ordem das fases:
1. Primeiro o schema: `Order.testPayment` e a tabela `payment_test_settings`.
2. Depois a API: configuração e chave, produto de teste, pedido de teste, nota e e-mail, financeiro.
3. Então o front: o cartão do admin, a página do link e o pagamento.
4. Por fim, o teste no preview, a produção com autorização e o PR.

As respostas às perguntas estão no `context.md` (22/10/2026): só admin, com e-mail curto, cartão e PIX.

## Fase 1: API - Schema
- [ ] **Task 1.1:** No `schema.prisma`, adicionar `testPayment Boolean @default(false)` em `Order` e o model `PaymentTestSettings` (`@@map("payment_test_settings")`): `id` (`'default'`), `enabled`, `accessKey String?`, `enabledAt DateTime?`, `enabledById String?`, `updatedAt` (decisões 1 e 2).
- [ ] **Task 1.2:** Gerar a migration `<timestamp>_modulo_de_teste_de_pagamento` com `prisma migrate diff` entre o schema antigo e o novo (offline, como na Spec 028), conferir que ela só adiciona, e rodar `prisma generate`. **Não** aplicar em produção nesta fase.

## Fase 2: API - Configuração e chave
- [ ] **Task 2.1:** Escrever `payment-test.service.spec.ts` (decisões 2 e 3):
  - ligar gera uma chave de 43 caracteres base64url e grava `enabled`, `enabledAt` e `enabledById`;
  - desligar apaga a chave;
  - religar gera uma chave **diferente**;
  - `resolve(key)` devolve o produto com a chave certa e o teste ligado, e `null` com chave errada, chave de outro tamanho ou teste desligado;
  - sem linha na tabela, o teste conta como desligado.
- [ ] **Task 2.2:** Implementar o `PaymentTestService` e a constante `TEST_PAYMENT_CENTS = 100`, com a comparação em tempo constante.
- [ ] **Task 2.3:** Escrever `admin-test-payment.http.spec.ts`: `GET` e `PUT /admin/finance/test-payment` com admin; aluno → 403; sem sessão → 401; `PUT` com campo fora da lista → 400.
- [ ] **Task 2.4:** Implementar as rotas do admin (decisão 4).
- [ ] **Task 2.5:** Escrever `store.http.spec.ts` (ou o spec da loja) para `GET /store/test-product/:key`: chave certa → título, resumo e preço; chave errada ou teste desligado → 404 com a mesma resposta. Sem sessão de admin, ou com conta de aluno → 404 também (resposta 1).
- [ ] **Task 2.6:** Implementar a rota da loja.

## Fase 3: API - Pedido de teste
- [ ] **Task 3.1:** Em `orders.service.spec.ts` e `create-order.dto.spec.ts`, cobrir (decisões 4, 5 e 6):
  - `testKey` válido → pedido com `testPayment: true`, `amountCents: 100` e zero itens, e o gateway recebe um item "Pagamento de teste — Imersão RH Estratégico" de R$ 1,00;
  - `testKey` inválido ou teste desligado → 404, sem gravar pedido;
  - `testKey` junto com `moduleIds` ou `bundleSlug` → 400;
  - aprovado → `PAID`, sem `access.grant`;
  - o pedido de teste cancela os pendentes do aluno, como os outros;
  - PIX com `testKey` aceito, com o QR de R$ 1,00 (resposta 3);
  - `testKey` com sessão de aluno → 404 (resposta 1).
- [ ] **Task 3.2:** Implementar no `OrdersService`, no `CreateOrderDto` e no `MercadoPagoService.toItems`.
- [ ] **Task 3.3:** Em `invoices.service.spec.ts`, `onOrderPaid` de um pedido de teste não cria nota. Implementar.
- [ ] **Task 3.4:** Em `purchase-email.service.spec.ts`: o pedido de teste aprovado manda o e-mail curto "Pagamento de teste aprovado" (valor, meio, id do pedido e o aviso do estorno), e não o e-mail de compra; a trava do `confirmationEmailedAt` vale igual (resposta 2). Implementar o template e o envio.

## Fase 4: API - Financeiro
- [ ] **Task 4.1:** Em `admin-finance.service.spec.ts` e `admin-finance.orders.spec.ts` (decisão 7):
  - um pedido de teste `PAID` não entra no bruto, na série, na quebra por meio de pagamento, na quebra por módulo, na conversão nem na contagem de pagos;
  - na lista, o pedido de teste vem com `testPayment: true` e "Módulo de teste" nos módulos;
  - o CSV traz a coluna "Teste".
- [ ] **Task 4.2:** Implementar no `AdminFinanceService` e nos tipos.
- [ ] **Task 4.3:** Rodar `npm test` e `npm run build` da API.

## Fase 5: Front - Admin
- [ ] **Task 5.1:** No `AdminFinanceService` do front: `testPayment()` e `setTestPayment(enabled)`, e `testPayment` no `FinanceOrderItem`.
- [ ] **Task 5.2:** Componente `app-pagamento-teste` no Financeiro: toggle, "R$ 1,00", e, ligado, o link completo (`<origem>/loja/teste/<chave>`) com "Copiar link" e o aviso "Quem tiver este link consegue pagar o módulo de teste. Desligue para invalidar." Spec do componente: ligar mostra o link, desligar esconde, erro da API aparece.
- [ ] **Task 5.3:** Etiqueta "Teste" na linha do pedido de teste da tabela, e "Módulo de teste" na coluna Módulos. Spec.

## Fase 6: Front - Página e pagamento
- [ ] **Task 6.1:** Rota `/loja/teste/:chave` (lazy), fora do sitemap, com `noindex` e renderização só no cliente em `app.routes.server.ts` (decisão 8). Componente da página: carrega o produto; sem sessão → login com `redirect`; conta de aluno, chave errada ou teste desligado → página de não encontrado (resposta 1). Spec.
- [ ] **Task 6.2:** `StoreService`: seleção do tipo `test` com a chave, `orderTarget()` com `testKey`, e o total de R$ 1,00. Tela de pagamento: resumo "Módulo de teste — R$ 1,00" e sem o texto de "6 meses de acesso". Specs da loja e do pagamento.
- [ ] **Task 6.3:** Tela do pedido: aprovado de teste mostra "Pagamento de teste aprovado. Nenhum módulo foi liberado. Para devolver o valor, estorne pelo Mercado Pago." O `OrderView` da API ganha `testPayment`. Spec.
- [ ] **Task 6.4:** Rodar `ng test` e `ng build` do front.

## Fase 7: Preview e produção
- [ ] **Task 7.1:** Fazer o merge das branches de fase na `release/030-modulo-de-teste-de-pagamento` e empurrá-la para a branch `preview` (Spec 029). As migrations entram na branch `preview` do Neon pelo build.
- [ ] **Task 7.2:** No preview, com uma conta de admin de teste: ligar o teste no Financeiro, conferir o link, desligar e conferir que o link antigo dá "não encontrado", religar.
- [ ] **Task 7.3:** Pedir ao usuário o pagamento no link do preview, logado como admin: cartão de teste `APRO` e `FUND`, e um PIX. Conferir na branch `preview` do Neon: pedido `testPayment`, `PAID` e `REJECTED`, sem acesso e sem nota; no Financeiro do preview, etiqueta "Teste" e fora da receita.
- [ ] **Task 7.4:** Abrir o PR da release contra a `main`, com as decisões tomadas no topo. **Sem merge**: o merge é do usuário.
- [ ] **Task 7.5:** Depois do merge, com **autorização explícita**, rodar `npx prisma migrate deploy` em produção e conferir só lendo.
- [ ] **Task 7.6:** Em produção: o usuário liga o teste, paga R$ 1,00 com cartão real (e, se quiser, com PIX), confere o e-mail "Pagamento de teste aprovado" e estorna pelo Mercado Pago. Conferir pedido `PAID` e depois `REFUNDED`, fora da receita, sem nota fiscal, e os logs no modal. Se o Mercado Pago recusar por valor mínimo, aplicar a decisão 9.

## Registro da execução
