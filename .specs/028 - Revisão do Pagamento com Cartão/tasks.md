# Tasks: Spec 028 - Revisão do Pagamento com Cartão

Spec de `api/` (NestJS + Prisma + Jest) e `front/` (Angular standalone + signals + Tailwind). No backend a suíte vem **antes** da implementação, conforme `.claude/RULES.md`. As decisões referenciadas estão no `context.md`.

Ordem das fases:
1. Primeiro reproduzir, sem mudar código, porque o corpo real do `402` define a decisão 1.
2. Depois o schema: o status `FAILED`, o `attemptId` e a tabela `payment_logs`, de que todas as fases seguintes dependem.
3. Então a API: o desfecho do cartão, os logs e as rotas novas.
4. Então o front: a tela de pagamento e o painel.
5. Por fim, o teste ao vivo de novo no preview e o PR aberto contra a `main`, **sem merge**: o merge é do usuário.

## Fase 1: Reproduzir (sem código)
- [ ] **Task 1.1:** Preparar o ambiente de teste ("Ambiente de teste" do `context.md`):
  - publicar o preview da API a partir da `main` (`git archive` no scratchpad, com o `.vercel/project.json` da API), ou reaproveitar `https://delcastanher-ba5c5o4q2-leno.vercel.app` se a `main` não mudou na API;
  - gerar o `proxy.conf` no scratchpad, com `/preview-api` apontando para o preview e o header `x-vercel-trusted-oidc-idp-token` lido do `VERCEL_OIDC_TOKEN`, sem imprimir o token;
  - trocar o `apiUrl` do `environment.development.ts` para `http://localhost:4200/preview-api`, **sem commit**;
  - subir `ng serve --proxy-config <proxy.conf>` em `localhost:4200` e abrir `vercel logs` do preview.
- [ ] **Task 1.2:** Conferir no Chrome que o login, a loja e o `GET /store/payment-config` funcionam pelo proxy, com o aviso "Ambiente de teste" na tela de pagamento.
- [ ] **Task 1.3:** Rodar a matriz da fase 1 com os cartões de teste. Para cada linha, registrar no fim deste arquivo: o que a tela mostrou, o status do pedido no banco (consulta só de leitura) e a linha do log da Vercel.
- [ ] **Task 1.4:** Registrar no fim deste arquivo o corpo real da resposta `402` do Mercado Pago (sem dados do pagador) e onde estão nele o id da order, o `status` e o `status_detail` da transação. Se algo contradisser a "Causa provável" ou as decisões 1 a 3, ajustar o `context.md` antes da fase 3.
- [ ] **Task 1.5:** Registrar o que mais apareceu fora da causa provável (`deviceId` ausente, parcelas, Elo débito, webhook), cada item com a decisão de corrigir nesta spec ou deixar de fora.

## Fase 2: API - Schema
- [ ] **Task 2.1:** No `schema.prisma`, adicionar `FAILED` ao `OrderStatus`, a coluna opcional `attemptId` em `Order` e o model `PaymentLog` (`@@map("payment_logs")`) com os campos, os enums `PaymentLogSource` e `PaymentLogLevel`, a FK opcional para `Order` com `onDelete: Cascade` e os índices `(orderId, createdAt)` e `(attemptId)` (decisões 5, 7 e 9).
- [ ] **Task 2.2:** Gerar a migration `<timestamp>_logs_de_pagamento` com `prisma migrate dev --create-only`, conferir que o SQL só adiciona (enum, coluna, tabela, índices) e rodar `prisma generate`. **Não** aplicar em produção nesta fase.
- [ ] **Task 2.3:** Incluir os logs de usuário apagado (`orderId` nulo, pelo `userId`) no script de limpeza da Spec 026 (`scripts/spec026-limpeza.ts`), com o caso no spec dele se houver.

## Fase 3: API - Desfecho do cartão
- [ ] **Task 3.1:** Em `mercado-pago.service.spec.ts`, escrever os casos das decisões 1 e 2, com o corpo registrado na Task 1.4:
  - `402` com a order no corpo → devolve `status: failed` e o `status_detail` da transação;
  - `402` sem o id da order → busca por `external_reference` e devolve a order achada;
  - `400`, `401`, `429`, `500` e falha de rede → continuam lançando `503`;
  - `toOrder()` prefere o `status_detail` da transação ao da order.
- [ ] **Task 3.2:** Implementar o `402` no `MercadoPagoService` e o `status_detail` da transação no `toOrder()`.
- [ ] **Task 3.3:** Em `payments.types.spec.ts` (ou onde o `rejectionMessage` já é testado), cobrir as chaves da Orders API da decisão 3, incluindo `card_insufficient_amount` e `3ds_challenge_expired`. Trocar o `REJECTION_MESSAGES`.
- [ ] **Task 3.4:** Em `orders.service.spec.ts`, escrever os casos do `FAILED` (decisão 5):
  - o gateway lança → pedido `FAILED`, e a API responde `503` com o id do pedido;
  - recusa → pedido `REJECTED` com `mpOrderId` e `mpStatusDetail`, resposta 201 com `message`;
  - `FAILED` é terminal: o `findOne` não reconsulta o gateway;
  - webhook com order `processed` para um pedido `FAILED` → `PAID` e acesso concedido;
  - o `attemptId` do DTO é gravado no pedido;
  - `clientError` no lugar de `card` → pedido `FAILED` sem chamar o gateway (decisão 9);
  - um novo pedido continua cancelando só os `PENDING`.
- [ ] **Task 3.5:** Implementar no `OrdersService` e no `CreateOrderDto` (`attemptId` UUID opcional; `clientError` com `stage` e `message` curtos, exclusivo com `card`). Atualizar `TERMINAL` e `allowedFrom`.
- [ ] **Task 3.6:** Linha `info` na Vercel para cada criação de order com cartão (decisão 6): pedido, order, `status`, `status_detail`, bandeira e parcelas, sem token. Cobrir com um spy do `Logger`.

## Fase 4: API - Logs e painel
- [ ] **Task 4.1:** Escrever `payment-log.service.spec.ts` (decisão 7):
  - `record()` grava a linha com os campos e o `environment` do `MP_SANDBOX`;
  - tira `payer.identification`, `payer.email` e qualquer `token`, em qualquer nível do `detail`;
  - corta o `detail` em 10 KB;
  - uma falha do Prisma vira `logger.error` e o `record()` não lança.
- [ ] **Task 4.2:** Implementar o `PaymentLogService` no `PaymentsModule`.
- [ ] **Task 4.3:** Nos specs do `OrdersService` e do webhook, cobrir que gravam log: erro do gateway (`ERROR`, com `httpStatus` e corpo), recusa (`WARNING`), aprovado (`INFO`), erro na consulta do `refresh()` e do webhook (`ERROR`). Um log que falha não muda o pedido nem a resposta. Ligar o `PaymentLogService` nesses pontos; o `MercadoPagoService` passa o status HTTP e o corpo no erro que lança, para o log tê-los.
- [ ] **Task 4.4:** Escrever o `payment-client-logs.http.spec.ts` para `POST /payments/client-logs` (decisão 9): sem token → 401; DTO com campo fora da lista → 400; grava com `source: FRONT` e o `userId` do token; o 21º evento em 10 minutos → 429.
- [ ] **Task 4.5:** Implementar o controller, o DTO e o limite contado na `payment_logs`.
- [ ] **Task 4.6:** Em `admin-finance.http.spec.ts`, cobrir `GET /admin/finance/orders/:id/logs` (decisão 8): não-admin → 403; pedido inexistente → 404; devolve as linhas do pedido e as do navegador com o mesmo `attemptId`, do mais antigo ao mais novo; pedido sem log → lista vazia.
- [ ] **Task 4.7:** Implementar a rota e o método no `AdminFinanceService`. No mesmo service, aceitar `FAILED` no filtro de status e no CSV, e contar `FAILED` ao lado dos recusados no resumo, fora da receita. Ajustar `admin-finance.service.spec.ts`.
- [ ] **Task 4.8:** Rodar `npm test` e `npm run build` da API.

## Fase 5: Front - Pagamento
- [ ] **Task 5.1:** Em `pagamento.spec.ts`, escrever os casos da decisão 4:
  - resposta `REJECTED` → mensagem do pedido acima do botão, seleção mantida, sem navegar;
  - nova tentativa depois da recusa gera token novo e um `attemptId` novo;
  - trocar para PIX limpa a mensagem;
  - `PAID` e `PENDING` continuam limpando a seleção e indo para `/loja/pedido/:id`;
  - `503` com id de pedido → mensagem de erro, seleção mantida.
- [ ] **Task 5.2:** Implementar no `pay()`. O `attemptId` é gerado com `crypto.randomUUID()` a cada clique e vai no payload.
- [ ] **Task 5.3:** Em `pagamento.spec.ts`, cobrir os logs do navegador (decisão 9): falha do SDK, Secure Fields sem iframe, erro de rede na bandeira e nas parcelas, bandeira não reconhecida (`WARNING`) e recusa do `createCardToken` vão para `POST /payments/client-logs` com o `attemptId`; uma falha do envio do log não aparece para o comprador.
- [ ] **Task 5.4:** Em `pagamento.spec.ts`, cobrir a falha do navegador que impede a cobrança: SDK que não carrega e `createCardToken` com erro que não é de digitação → `POST /orders` com `clientError`; erro de digitação (`E301`, `E302`, `205`, `224` etc.) → só o log.
- [ ] **Task 5.5:** Implementar 5.3 e 5.4: um método `clientLog()` no `StoreService` (ou num `PaymentLogClient` pequeno) que nunca lança, e a separação entre erro de digitação e erro do SDK reaproveitando os códigos do `cardTokenMessage()`.
- [ ] **Task 5.6:** Corrigir o comentário "O teto de 6" do `installments()` no `mercado-pago.service.ts` do front: o teto vem do `maxInstallments` (12).

## Fase 6: Front - Painel
- [ ] **Task 6.1:** Adicionar `FAILED` aos tipos de status (`admin-finance.service.ts`, `admin-users.service.ts`, `store.service.ts`) e o rótulo "Erro" (variante `danger`) no `admin-financeiro.ts` e no `admin-dashboard.ts`. Adicionar "Erro" ao filtro de status do financeiro.
- [ ] **Task 6.2:** No `AdminFinanceService` do front, o método `orderLogs(id)` para `GET /admin/finance/orders/:id/logs`.
- [ ] **Task 6.3:** Criar o modal "Logs do pagamento" (`ui-modal`, `lg`) como componente próprio em `features/admin/financeiro/`: linha do tempo com hora, origem (Servidor ou Navegador), etapa, status HTTP, status e motivo do Mercado Pago e mensagem; `detail` em bloco recolhido com JSON formatado; estado de carregando, de erro e "Nenhum log registrado para este pedido."
- [ ] **Task 6.4:** Botão "Ver logs" na linha de todo pedido de cartão da tabela do financeiro, abrindo o modal.
- [ ] **Task 6.5:** Specs do modal e da tabela: rótulo "Erro", filtro, botão só em pedido de cartão, linha do tempo, estado vazio.
- [ ] **Task 6.6:** Rodar `ng test` e `ng build` do front.

## Fase 7: Release e teste ao vivo
- [ ] **Task 7.1:** Fazer o merge das branches de fase na `release/028-revisao-pagamento-cartao`.
- [ ] **Task 7.2:** Com **autorização explícita** (decisão 7), rodar `npx prisma migrate deploy` contra produção e conferir, só lendo, que o enum, a coluna e a tabela existem. Tem de ser antes do teste: o preview grava no mesmo banco.
- [ ] **Task 7.3:** Publicar o preview da API da branch de release (`git archive` da release no scratchpad) e repetir a preparação da Task 1.1 apontando o proxy para ele.
- [ ] **Task 7.4:** Rodar a matriz inteira da fase final no Chrome, incluindo os itens "Só na fase final" (erro forçado do gateway, SDK bloqueado, recusa seguida de aprovação, conferência de que nenhuma linha de `payment_logs` tem token, cartão, CPF ou e-mail). Registrar o resultado de cada linha no fim deste arquivo.
- [ ] **Task 7.5:** Conferir no painel, pelo preview, o "Erro" e o modal dos pedidos de teste da Task 7.4.
- [ ] **Task 7.6:** Desfazer as mudanças locais de teste (`apiUrl` do `environment.development.ts`) e confirmar com `git status` que nada delas foi commitado.

## Fase 8: Pull Request
- [ ] **Task 8.1:** Abrir o PR da release contra a `main`, com as decisões tomadas durante a execução no topo, o resultado da matriz da Task 7.4 e o link do preview usado. **Sem merge:** o PR fica aberto para o usuário revisar e fazer o merge.
- [ ] **Task 8.2:** Deixar no corpo do PR a lista do que conferir em `www.delcastanher.srv.br` depois do merge, sem cobrar: tela de pagamento com cartão carregando os campos e a bandeira de um cartão real digitado sem pagar; painel com o filtro "Erro" e o modal abrindo num pedido antigo ("Nenhum log registrado"). Incluir a sugestão de um pagamento real com cartão, estornado depois pelo painel, como decisão do usuário.

## Registro da execução
