# Tasks: Spec 028 - Revisão do Pagamento com Cartão

Spec de `api/` (NestJS + Prisma + Jest) e `front/` (Angular standalone + signals + Tailwind). No backend a suíte vem **antes** da implementação, conforme `.claude/RULES.md`. As decisões referenciadas estão no `context.md`.

Ordem das fases:
1. Primeiro reproduzir, sem mudar código, porque o corpo real do `402` define a decisão 1.
2. Depois o schema: o status `FAILED`, o `attemptId` e a tabela `payment_logs`, de que todas as fases seguintes dependem.
3. Então a API: o desfecho do cartão, os logs e as rotas novas.
4. Então o front: a tela de pagamento e o painel.
5. Por fim, o teste ao vivo de novo no preview e o PR aberto contra a `main`, **sem merge**: o merge é do usuário.

## Fase 1: Reproduzir (sem código)
- [x] **Task 1.1:** Preparar o ambiente de teste ("Ambiente de teste" do `context.md`). O proxy até o preview funcionou (login, loja, `payment-config`), mas o preview **não cobra**: ver "Fase 1" no registro. A fase 1 rodou com a API local (`localhost:3000`, `MP_SANDBOX=true`, banco de produção), com o `environment.development.ts` sem mudança.
- [x] **Task 1.2:** Login, loja e pagamento conferidos no Chrome (pelo proxy e depois pela API local).
- [x] **Task 1.3:** Matriz da fase 1 rodada nos casos que separam os caminhos: recusa (`FUND`), aprovado (`APRO`) e pendente (`CONT`, parcelado). `SECU`, `CALL`, `OTHE`, Amex e Elo passam pelo mesmo `402` e ficam para a matriz da fase final. Resultado no registro.
- [x] **Task 1.4:** Corpo do `402` registrado. Confirma as decisões 1 e 2: a order vem inteira em `data`, e o motivo está só na transação.
- [x] **Task 1.5:** Achados fora da causa provável registrados, com as decisões 10 a 13 no `context.md`.

## Fase 2: API - Schema
- [x] **Task 2.1:** No `schema.prisma`, adicionar `FAILED` ao `OrderStatus`, a coluna opcional `attemptId` em `Order` e o model `PaymentLog` (`@@map("payment_logs")`) com os campos, os enums `PaymentLogSource` e `PaymentLogLevel`, a FK opcional para `Order` com `onDelete: Cascade` e os índices `(orderId, createdAt)` e `(attemptId)` (decisões 5, 7 e 9).
- [x] **Task 2.2:** Gerar a migration `<timestamp>_logs_de_pagamento` com `prisma migrate dev --create-only`, conferir que o SQL só adiciona (enum, coluna, tabela, índices) e rodar `prisma generate`. **Não** aplicar em produção nesta fase.
- [x] **Task 2.3:** Incluir os logs de usuário apagado (`orderId` nulo, pelo `userId`) no script de limpeza da Spec 026 (`scripts/spec026-limpeza.ts`), com o caso no spec dele se houver.

## Fase 3: API - Desfecho do cartão
- [x] **Task 3.1:** Em `mercado-pago.service.spec.ts`, escrever os casos das decisões 1 e 2, com o corpo registrado na Task 1.4:
  - `402` com a order no corpo → devolve `status: failed` e o `status_detail` da transação;
  - `402` sem o id da order → busca por `external_reference` e devolve a order achada;
  - `400`, `401`, `429`, `500` e falha de rede → continuam lançando `503`;
  - `toOrder()` prefere o `status_detail` da transação ao da order.
- [x] **Task 3.2:** Implementar o `402` no `MercadoPagoService` e o `status_detail` da transação no `toOrder()`.
- [x] **Task 3.3:** Em `payments.types.spec.ts` (ou onde o `rejectionMessage` já é testado), cobrir as chaves da Orders API da decisão 3, incluindo `card_insufficient_amount` e `3ds_challenge_expired`. Trocar o `REJECTION_MESSAGES`.
- [x] **Task 3.4:** Em `orders.service.spec.ts`, escrever os casos do `FAILED` (decisão 5):
  - o gateway lança → pedido `FAILED`, e a API responde `503` com o id do pedido;
  - recusa → pedido `REJECTED` com `mpOrderId` e `mpStatusDetail`, resposta 201 com `message`;
  - `FAILED` é terminal: o `findOne` não reconsulta o gateway;
  - webhook com order `processed` para um pedido `FAILED` → `PAID` e acesso concedido;
  - o `attemptId` do DTO é gravado no pedido;
  - `clientError` no lugar de `card` → pedido `FAILED` sem chamar o gateway (decisão 9);
  - um novo pedido continua cancelando só os `PENDING`.
- [x] **Task 3.5:** Implementar no `OrdersService` e no `CreateOrderDto` (`attemptId` UUID opcional; `clientError` com `stage` e `message` curtos, exclusivo com `card`). Atualizar `TERMINAL` e `allowedFrom`.
- [x] **Task 3.6:** Linha `info` na Vercel para cada criação de order com cartão (decisão 6): pedido, order, `status`, `status_detail`, bandeira e parcelas, sem token. Cobrir com um spy do `Logger`.
- [x] **Task 3.7:** No spec do `MercadoPagoService`, cobrir que o corpo de erro que vai ao `logger.error` sai sem `token`, `payer.email` e `payer.identification` (decisão 12), e implementar reaproveitando a função de limpeza do `PaymentLogService` (Task 4.2), que passa a morar num arquivo próprio (`payment-log.sanitize.ts`) para os dois usarem.

## Fase 4: API - Logs e painel
- [x] **Task 4.1:** Escrever `payment-log.service.spec.ts` (decisão 7):
  - `record()` grava a linha com os campos e o `environment` do `MP_SANDBOX`;
  - tira `payer.identification`, `payer.email` e qualquer `token`, em qualquer nível do `detail`;
  - corta o `detail` em 10 KB;
  - uma falha do Prisma vira `logger.error` e o `record()` não lança.
- [x] **Task 4.2:** Implementar o `PaymentLogService` no `PaymentsModule`.
- [x] **Task 4.3:** Nos specs do `OrdersService` e do webhook, cobrir que gravam log: erro do gateway (`ERROR`, com `httpStatus` e corpo), recusa (`WARNING`), aprovado (`INFO`), erro na consulta do `refresh()` e do webhook (`ERROR`). Um log que falha não muda o pedido nem a resposta. Ligar o `PaymentLogService` nesses pontos; o `MercadoPagoService` passa o status HTTP e o corpo no erro que lança, para o log tê-los.
- [x] **Task 4.4:** Escrever o `payment-client-logs.http.spec.ts` para `POST /payments/client-logs` (decisão 9): sem token → 401; DTO com campo fora da lista → 400; grava com `source: FRONT` e o `userId` do token; o 21º evento em 10 minutos → 429.
- [x] **Task 4.5:** Implementar o controller, o DTO e o limite contado na `payment_logs`.
- [x] **Task 4.6:** Em `admin-finance.http.spec.ts`, cobrir `GET /admin/finance/orders/:id/logs` (decisão 8): não-admin → 403; pedido inexistente → 404; devolve as linhas do pedido e as do navegador com o mesmo `attemptId`, do mais antigo ao mais novo; pedido sem log → lista vazia.
- [x] **Task 4.7:** Implementar a rota e o método no `AdminFinanceService`. No mesmo service, aceitar `FAILED` no filtro de status e no CSV, e contar `FAILED` ao lado dos recusados no resumo, fora da receita. Ajustar `admin-finance.service.spec.ts`.
- [x] **Task 4.8:** Rodar `npm test` e `npm run build` da API.

## Fase 5: Front - Pagamento
- [x] **Task 5.1:** Em `pagamento.spec.ts`, escrever os casos da decisão 4:
  - resposta `REJECTED` → mensagem do pedido acima do botão, seleção mantida, sem navegar;
  - nova tentativa depois da recusa gera token novo e um `attemptId` novo;
  - trocar para PIX limpa a mensagem;
  - `PAID` e `PENDING` continuam limpando a seleção e indo para `/loja/pedido/:id`;
  - `503` com id de pedido → mensagem de erro, seleção mantida.
- [x] **Task 5.2:** Implementar no `pay()`. O `attemptId` é gerado com `crypto.randomUUID()` a cada clique e vai no payload.
- [x] **Task 5.3:** Em `pagamento.spec.ts`, cobrir os logs do navegador (decisão 9): falha do SDK, Secure Fields sem iframe, erro de rede na bandeira e nas parcelas, bandeira não reconhecida (`WARNING`) e recusa do `createCardToken` vão para `POST /payments/client-logs` com o `attemptId`; uma falha do envio do log não aparece para o comprador.
- [x] **Task 5.4:** Em `pagamento.spec.ts`, cobrir a falha do navegador que impede a cobrança: SDK que não carrega e `createCardToken` com erro que não é de digitação → `POST /orders` com `clientError`; erro de digitação (`E301`, `E302`, `205`, `224` etc.) → só o log.
- [x] **Task 5.5:** Implementar 5.3 e 5.4: um método `clientLog()` no `StoreService` (ou num `PaymentLogClient` pequeno) que nunca lança, e a separação entre erro de digitação e erro do SDK reaproveitando os códigos do `cardTokenMessage()`.
- [x] **Task 5.6:** Corrigir o comentário "O teto de 6" do `installments()` no `mercado-pago.service.ts` do front: o teto vem do `maxInstallments` (12).
- [x] **Task 5.7:** Device id (decisão 10): no `MercadoPagoLoader`, carregar o `security.js` (`view="checkout"`) junto com o SDK, e o `deviceId()` passa a lê-lo. Falha do `security.js` não impede o pagamento, só vai para o log do navegador. Cobrir no spec do serviço.
- [x] **Task 5.8:** Tela do pedido com cartão pendente (decisão 11): título e texto próprios em `pedido.ts`, sem "Pague com PIX". Cobrir no spec da tela (criar `pedido.spec.ts` se não existir).
- [x] **Task 5.9:** Botão com o total parcelado (decisão 13): com uma parcela com juros escolhida, o botão diz "Pagar 3x de R$ 73,04" e o total com juros aparece abaixo. Cobrir no `pagamento.spec.ts`.

## Fase 6: Front - Painel
- [x] **Task 6.1:** Adicionar `FAILED` aos tipos de status (`admin-finance.service.ts`, `admin-users.service.ts`, `store.service.ts`) e o rótulo "Erro" (variante `danger`) no `admin-financeiro.ts` e no `admin-dashboard.ts`. Adicionar "Erro" ao filtro de status do financeiro.
- [x] **Task 6.2:** No `AdminFinanceService` do front, o método `orderLogs(id)` para `GET /admin/finance/orders/:id/logs`.
- [x] **Task 6.3:** Criar o modal "Logs do pagamento" (`ui-modal`, `lg`) como componente próprio em `features/admin/financeiro/`: linha do tempo com hora, origem (Servidor ou Navegador), etapa, status HTTP, status e motivo do Mercado Pago e mensagem; `detail` em bloco recolhido com JSON formatado; estado de carregando, de erro e "Nenhum log registrado para este pedido."
- [x] **Task 6.4:** Botão "Ver logs" na linha de todo pedido de cartão da tabela do financeiro, abrindo o modal.
- [x] **Task 6.5:** Specs do modal e da tabela: rótulo "Erro", filtro, botão só em pedido de cartão, linha do tempo, estado vazio.
- [x] **Task 6.6:** Rodar `ng test` e `ng build` do front.

## Fase 7: Release e teste ao vivo
- [x] **Task 7.1:** Fazer o merge das branches de fase na `release/028-revisao-pagamento-cartao`.
- [x] **Task 7.2:** Com **autorização explícita** (decisão 7), rodar `npx prisma migrate deploy` contra produção e conferir, só lendo, que o enum, a coluna e a tabela existem. Tem de ser antes do teste: o preview grava no mesmo banco.
- [x] **Task 7.3:** Subir a API da release em `localhost:3000` e o front em `localhost:4200`, como na fase 1. O preview da Vercel não cobra em sandbox enquanto a conexão sandbox for cifrada com a chave local (registro da fase 1).
- [x] **Task 7.4:** Rodar a matriz inteira da fase final no Chrome, incluindo os itens "Só na fase final" (erro forçado do gateway, SDK bloqueado, recusa seguida de aprovação, conferência de que nenhuma linha de `payment_logs` tem token, cartão, CPF ou e-mail). Registrar o resultado de cada linha no fim deste arquivo.
- [x] **Task 7.5:** Conferir no painel, pelo preview, o "Erro" e o modal dos pedidos de teste da Task 7.4.
- [x] **Task 7.6:** Desfazer as mudanças locais de teste (`apiUrl` do `environment.development.ts`) e confirmar com `git status` que nada delas foi commitado.

## Fase 8: Pull Request
- [x] **Task 8.1:** Abrir o PR da release contra a `main`, com as decisões tomadas durante a execução no topo, o resultado da matriz da Task 7.4 e o link do preview usado. **Sem merge:** o PR fica aberto para o usuário revisar e fazer o merge.
- [x] **Task 8.2:** Deixar no corpo do PR a lista do que conferir em `www.delcastanher.srv.br` depois do merge, sem cobrar: tela de pagamento com cartão carregando os campos e a bandeira de um cartão real digitado sem pagar; painel com o filtro "Erro" e o modal abrindo num pedido antigo ("Nenhum log registrado"). Incluir a sugestão de um pagamento real com cartão, estornado depois pelo painel, como decisão do usuário.

## Registro da execução

### Fase 1 (21/10/2026)

**Preview da Vercel.** O projeto `delcastanher-api` não tinha nenhum preview. O primeiro foi publicado pela CLI (`https://delcastanher-ba5c5o4q2-leno.vercel.app`), acessado pelo proxy do `ng serve` com o token OIDC de desenvolvimento. Dois ajustes no proxy: o `api/.env.local` local tem um `VERCEL_OIDC_TOKEN` vencido (de 11/09), e o token passou a vir de um `vercel env pull` novo; o cookie de refresh tem `path=/auth`, e o proxy reescreve para `/preview-api/auth`.

No `POST /orders`, o preview respondeu **500** ("Internal server error" na tela):

```
Error: Unsupported state or unable to authenticate data
    at TokenCipher.decrypt (token-cipher.ts:56)
    at MercadoPagoConnectionService.activeCredential (mercado-pago-connection.service.ts:144)
```

A conexão sandbox ativa (`TESTUSER8605452672838458141`) foi gravada pelo script `mp-vendedor-sandbox` com o `MP_TOKEN_ENCRYPTION_KEY` do `.env` local, e o preview usa outra chave. O token decifra com a chave local e é `APP_USR-` (o formato certo para a Orders API). Sem ler a chave do preview (segredo), o preview não tem como cobrar. **A fase 1 seguiu com a API local**, mesmo código e mesmo banco.

**Matriz (API local, sandbox, comprador `e2e-spec028-aluno@delcastanher.test`, Módulo 1 ou 2 a R$ 197,00):**

| Caso | Tela | Pedido no banco | Log da API |
|---|---|---|---|
| Visa `FUND`, 1x | "Não foi possível falar com o provedor de pagamento. Tente de novo em instantes." | `PENDING`, sem `mpOrderId`; virou `CANCELLED` na tentativa seguinte | `Mercado Pago respondeu 402 em /orders` |
| Visa `APRO`, 1x, logo depois, na mesma tela | "Pagamento aprovado", módulo liberado | `PAID`, `processed`/`accredited` | — |
| Mastercard `CONT`, 3x | **"Pague com PIX para liberar"** / "Estamos processando seu pagamento" | `PENDING`, `processing`/`in_process` | — |

O pedido do `FUND` repete exatamente os 5 pedidos de produção: `CANCELLED` sem `mpOrderId`.

**Corpo do `402`** (pagador omitido):

```json
{
  "errors": [{ "code": "failed", "message": "The following transactions failed",
               "details": ["PAY01M5G9SVWEC20D46BTBPNN7YXR: insufficient_amount"] }],
  "data": {
    "id": "ORDTST01M5G9SVW1Z528SJ0X9ENXF17M",
    "external_reference": "cmvip2km300004suahatepoe2",
    "status": "failed", "status_detail": "failed",
    "transactions": { "payments": [{
      "id": "PAY01M5G9SVWEC20D46BTBPNN7YXR",
      "status": "failed", "status_detail": "insufficient_amount",
      "payment_method": { "id": "visa", "type": "credit_card", "token": "<omitido>", "installments": 1 }
    }] }
  }
}
```

- A order inteira vem em `data`, no mesmo formato do `GET /v1/orders/:id`. A busca por `external_reference` da decisão 1 não é necessária.
- O motivo está só em `transactions.payments[0].status_detail` (decisão 2).
- O corpo traz o `token` do cartão, e o `logger.error` de hoje o grava cru no log da Vercel (decisão 12).

**Outros achados:**

- **Device id ausente.** `window.MP_DEVICE_SESSION_ID` é `undefined` na tela de pagamento: o SDK v2 não o cria. A documentação do Mercado Pago pede o `security.js` com `view="checkout"`. Sem ele, o header `X-meli-session-id` nunca vai, e o antifraude decide sem o aparelho → decisão 10.
- **Cartão pendente com texto de PIX.** O `@case ('PENDING')` de `pedido.ts` diz "Pague com PIX para liberar" para qualquer pendente → decisão 11.
- **Botão sem o total parcelado.** Com 3x (R$ 219,12 com juros), o botão continua "Pagar R$ 197,00" → decisão 13.
- **Parcelas e bandeira** funcionaram com Visa e Mastercard (`4235…` e `5480…`).
- **Webhook** não testável com a API local; fica para depois do merge, pelos logs de produção.

### Fases 2 a 6 (21/10/2026)

- **API:** 1258 testes passando (`npm test`) e `nest build` sem erro. Os dois erros de tipo do `tsc --noEmit` são de specs anteriores à spec (`auth.controller.spec.ts` e `certificates.service.spec.ts`), sem relação com ela.
- **Front:** 719 testes passando (`ng test`) e `ng build` sem erro. Os avisos de módulo não ESM são do `jspdf`, já existiam.
- **Decidido na execução:**
  - o `POST /orders` com falha responde 201 com o pedido `FAILED` e a `message`, e não 503 (decisão 5);
  - a função de limpeza dos logs (`payment-log.sanitize.ts`) tira `token`, `email` e `identification` em qualquer nível, e serve ao banco e ao log da Vercel (decisões 7 e 12);
  - os erros de digitação do token (`E301`, `205`, `224`...) vão só para o log como `WARNING`. Outros erros do token, e o SDK que não carrega, viram pedido `FAILED` (decisão 9);
  - o `attemptId` nasce com a tela e é renovado depois de cada clique em pagar: os erros do navegador antes do clique ficam na mesma tentativa do pedido que vem depois.

### Fase 7 (21/10/2026)

- **Migration em produção**, com autorização do usuário: `20261021120000_logs_de_pagamento` aplicada. Conferido só lendo: `order_status` com `FAILED`, coluna `attemptId` em `orders` e `payment_logs` vazia.
- **Ambiente:** API local em `localhost:3000` com o código da release, `MP_SANDBOX=true` e o vendedor de teste; front em `localhost:4200`. Comprador `e2e-spec028-aluno@delcastanher.test`, admin `e2e-spec028-admin@delcastanher.test`.

**Matriz da fase final:**

| Caso | Resultado na tela | Pedido |
|---|---|---|
| Visa `FUND` | "O cartão não tem limite suficiente para este valor. Tente outro cartão ou pague com PIX.", na tela de pagamento | `REJECTED`, `insufficient_amount` |
| Visa `SECU`, na mesma tela | "Confira os dados do cartão: número, validade, código de segurança e nome impresso." | `REJECTED`, `bad_filled_card_data` |
| Visa `CALL`, na mesma tela | "O banco emissor pede autorização para esta compra. Ligue para ele e tente de novo." | `REJECTED`, `required_call_for_authorize` |
| Visa `OTHE`, na mesma tela | "O banco emissor recusou a cobrança. Fale com ele ou tente outro cartão." | `REJECTED`, `rejected_by_issuer` |
| Visa `APRO`, na mesma tela, depois das 4 recusas | "Pagamento aprovado", sem recarregar e sem refazer a seleção | `PAID`, `accredited` |
| Mastercard `APRO`, 3x | Botão "Pagar 3x de R$ 73,04" e "Total no cartão, com os juros do parcelamento: R$ 219,12"; aprovado | `PAID` |
| Amex `APRO` | 15 dígitos e CVV de 4 aceitos; aprovado | `PAID` |
| Visa com a bandeira trocada no navegador (erro forçado) | "Não foi possível falar com o provedor de pagamento. Tente de novo em instantes ou pague com PIX." | `FAILED`; log `ERROR` com HTTP 400 e o corpo `property_value` |
| Visa `CONT`, na mesma tela do erro | "Pagamento em análise" | `PENDING`, `in_process` |
| SDK bloqueado no navegador | "Não foi possível carregar o formulário de cartão…" e, ao pagar, a mensagem de falha | `FAILED`; logs do navegador `sdk_load` na mesma tentativa |

- **Device id:** `MP_DEVICE_SESSION_ID` com 231 caracteres depois do `security.js` (era indefinido na fase 1).
- **Logs:** nenhuma linha de `payment_logs` tem token, e-mail ou CPF (conferido com uma busca no banco).
- **Painel:** filtro "Erro", "Pedidos com erro 2" no resumo, "Ver logs" só nos pedidos de cartão, e o modal com a linha do tempo (as 3 falhas do SDK no navegador; o HTTP 400 com o JSON do Mercado Pago em "Ver detalhe").
- **Achados corrigidos nesta fase** (decisão 14 do `context.md`):
  - o cartão em análise da fase 1 ficou `CANCELLED` quando o comprador comprou outro módulo, e uma aprovação tardia seria ignorada;
  - a reconsulta do cartão em análise gravava um log `INFO` a cada 5 segundos.
- **Fora do teste:**
  - **Elo débito:** a tela vende só "Cartão de crédito", e o pedido vai à Orders API com `type: credit_card`. Débito não é aceito hoje, e não entrou nesta spec;
  - **webhook do cartão:** não chega à API local. Fica para conferir nos logs de produção depois do merge.
- **Dados de teste no banco de produção:** os pedidos sandbox do comprador `e2e-spec028-aluno` (4 `PAID`, 4 `REJECTED`, 2 `FAILED`, 1 `PENDING`, 2 `CANCELLED`) aparecem no financeiro, como os das specs anteriores. As duas contas `e2e-spec028-*` podem entrar no script da Spec 026 quando o usuário decidir limpar.

### Fase 8 (21/10/2026)

- PR #59 aberto contra a `main`, **sem merge**: https://github.com/TheLastJedi00/delcastanher/pull/59
