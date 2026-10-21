# Spec 028: Revisão do Pagamento com Cartão

**Projeto:** Plataforma E-learning "Imersão RH Estratégico"
**Baseada em:** Spec 014 (Checkout), Spec 016 (Painel de Finanças), Spec 020 (Recebimento na Conta do Vendedor) e os fixes de cartão da Spec 025 (`fix.md` e `fix-bandeira-visa.md`)
**Escopo técnico:** full-stack — `api/` (NestJS + Prisma) e `front/` (Angular standalone + signals), com uma migration de schema. O backend é escrito com TDD: a suíte vem antes da implementação (`.claude/RULES.md`).

## Objetivo
Há relatos de que não dá para pagar com cartão de crédito. Não há detalhe dos relatos: nem mensagem, nem bandeira, nem aparelho. Os fixes da Spec 025 cuidaram do que acontece **antes** de cobrar (campos do cartão e bandeira). Esta spec:

1. revisa o fluxo inteiro do cartão, da digitação até o pedido pago, e testa cada desfecho ao vivo com os cartões de teste do Mercado Pago, com o front local apontado para o preview da API e os logs abertos;
2. mostra a recusa do cartão na própria tela de pagamento, pronta para outro cartão;
3. grava no banco (Neon) todo erro do gateway, do servidor e do navegador;
4. mostra no painel do gestor a compra que falhou por erro como **Erro**, e não como Cancelado, com um modal para ler os logs dela.

## Situação em produção (lida em 21/10/2026, só leitura)

**Nenhum pagamento com cartão foi aprovado até hoje.**

| Método | Status | `mpOrderId` | `mpStatus` | Pedidos | Último |
|---|---|---|---|---|---|
| Cartão | `CANCELLED` | vazio | vazio | 5 | 19/10/2026 |

- Todos os pedidos de cartão terminaram `CANCELLED` sem `mpOrderId`, ou seja, o nosso banco nunca recebeu uma order do Mercado Pago para eles. O pedido nasce `PENDING`, a chamada ao gateway falha e o pedido fica pendente até a próxima tentativa do aluno cancelá-lo (Spec 014, decisão 11: um pendente por vez). No painel, essas falhas aparecem hoje como "Cancelado".
- Os 3 pedidos pagos do Lote Fundador foram por PIX.
- Os logs da Vercel não guardam mais os dias desses pedidos. A resposta exata do Mercado Pago só aparece reproduzindo. É isso que a decisão 7 resolve daqui em diante.
- A Task 9.6 da Spec 014 ("tentar cartão recusado e conferir a mensagem") nunca foi marcada. O caminho de recusa nunca foi testado.

## Causa (confirmada na fase 1, em 21/10/2026)

Reproduzida com o Visa de teste e o nome `FUND`: a tela disse "Não foi possível falar com o provedor de pagamento", o Mercado Pago respondeu `402` com a order recusada (`insufficient_amount` na transação), e o pedido ficou `PENDING` sem `mpOrderId` até a tentativa seguinte o cancelar. O corpo do `402` está no registro do `tasks.md`.

### 1. Cartão recusado vira "não foi possível falar com o provedor"
Na Orders API, um pagamento recusado **não** volta com 200 e `status: failed`. A documentação do Mercado Pago (tabela de erros da criação de order):

> `402` — A order foi criada, mas alguma transação falhou. Verifique o campo de erros da resposta.

O `MercadoPagoService.request()` (`api/src/payments/mercado-pago.service.ts`) trata **qualquer** resposta fora de 2xx como falha de rede:
- lança `503` "Não foi possível falar com o provedor de pagamento. Tente de novo em instantes.";
- o `OrdersService` nunca chega ao `apply()`, então o pedido não grava `mpOrderId`, `mpStatus` nem `mpStatusDetail`, e fica `PENDING`;
- o comprador lê "tente de novo", tenta o mesmo cartão, recebe a mesma recusa, e o pedido anterior vira `CANCELLED`. É exatamente o retrato da tabela acima.

Com isso, a mensagem de recusa (`rejectionMessage`) nunca aparece: "limite insuficiente", "código de segurança errado", "fale com o banco" viram todas a mesma mensagem de rede.

### 2. O motivo da recusa está na transação, não na order
Na Orders API, `status` e `status_detail` existem em dois níveis. Numa recusa, a order vem `failed`/`failed`, e o motivo (`insufficient_amount`, `bad_filled_card_data`...) está em `transactions.payments[].status_detail`. O `toOrder()` lê só o da order, e o `rejectionMessage()` cairia sempre na mensagem genérica.

### 3. Tabela de mensagens com códigos da API antiga
O `REJECTION_MESSAGES` (`api/src/payments/payments.types.ts`) tem `bad_filled_security_code` e `bad_filled_date`, que só existem na Payments API. Na Orders API eles são um só, `bad_filled_card_data`. Falta `card_insufficient_amount`, que é distinto de `insufficient_amount`, e faltam `cc_rejected_3ds_challenge` e `3ds_challenge_expired`.

## Escopo

- **Fase 1 — reproduzir antes de mexer.** Front em `localhost:4200` apontado para o preview da API, `vercel logs` aberto, e a matriz de cartões de teste abaixo. Guardar o corpo real da resposta `402` (e de qualquer outro erro) no `tasks.md`, porque ele define a decisão 1.
- **API — desfecho do cartão:** a recusa vira pedido `REJECTED` com o motivo do Mercado Pago; o erro de verdade vira pedido `FAILED`; o motivo é lido da transação; a tabela de mensagens usa os códigos da Orders API.
- **API — logs:** todo erro do gateway, e o desfecho de cada cartão, gravados na tabela `payment_logs`, no Neon.
- **Front — pagamento:** a recusa aparece na tela de pagamento, com a seleção mantida e os campos prontos para outro cartão. Os erros do SDK no navegador sobem para os logs.
- **Painel:** status "Erro" no financeiro e na ficha do aluno, e o modal "Logs do pagamento" no financeiro.
- **Revisão do resto do fluxo** com o mesmo teste: `deviceId`, parcelas, cartão pendente (`CONT`), webhook do cartão, e-mail de compra e nota depois de um cartão aprovado.

## Fora de escopo

- **3DS 2.0.** Sem `config.online.transaction_security`, a Orders API usa `validation: never`, e nenhuma order nossa volta pedindo desafio. Ligar o 3DS (`on_fraud_risk`) exige iframe do desafio e é uma spec própria. Se a fase 1 ou os logs mostrarem muitas recusas `high_risk`, ela vira a próxima.
- **Trocar a Orders API pela Payments API.** O problema é de tratamento de resposta, não da API.
- **Reclassificar os 5 pedidos `CANCELLED` antigos como `FAILED`.** Eles não têm log nem resposta do Mercado Pago guardada, então não haveria o que mostrar no modal. Ficam como estão, sem cobrança.
- **Logs de PIX com tela própria.** O PIX passa pelo mesmo `MercadoPagoService`, então os erros de gateway dele também são gravados (decisão 7). Mas a revisão e o teste desta spec são do cartão.
- **Retenção e limpeza dos logs.** Sem TTL nesta spec. O volume esperado é pequeno (poucas linhas por tentativa de cartão).
- **Contatar os compradores que desistiram.** Decisão do negócio, fora do código.

## Decisões técnicas desta spec

1. **`402` na criação da order é desfecho, não erro.**
   O `MercadoPagoService.createOrder()` passa a tratar o `402` como uma order recusada: lê a order de `data` (o mesmo formato do `GET /v1/orders/:id`, confirmado na fase 1) e devolve o `MercadoPagoOrder` com `status: failed`, para o `OrdersService.apply()` gravar `REJECTED`, `mpOrderId` e o motivo, como faz com qualquer desfecho.
   - Um `402` sem `data.id` é tratado como erro (`FAILED`, decisão 5): sem a order, não há o que gravar como recusa.
   - **Por que no gateway e não no `OrdersService`:** é o único lugar que conhece o protocolo HTTP do Mercado Pago (Spec 014, decisão 7). O `OrdersService` continua recebendo uma order, aprovada ou recusada, sem saber de status HTTP.

2. **O motivo da recusa vem da transação.**
   `toOrder()` usa `transactions.payments[0].status_detail` quando ele existe, e o da order só como reserva. O que vai para `mpStatusDetail` é o motivo real, e é dele que sai a mensagem e o filtro do financeiro.

3. **Mensagens de recusa com os códigos da Orders API.**
   `REJECTION_MESSAGES` passa a ter as chaves da tabela "Mapear os valores de status_detail de recusa" do Mercado Pago: `bad_filled_card_data`, `required_call_for_authorize`, `card_disabled`, `high_risk`, `insufficient_amount`, `card_insufficient_amount`, `invalid_installments`, `max_attempts_exceeded`, `rejected_by_issuer`, `processing_error`, `cc_rejected_3ds_challenge` e `3ds_challenge_expired`. Saem `bad_filled_security_code` e `bad_filled_date`.

4. **A recusa fica na tela de pagamento.**
   Hoje o `pay()` limpa a seleção e navega para `/loja/pedido/:id` em qualquer resposta 2xx. Numa recusa, o comprador perderia a seleção e teria de escolher de novo.
   - Pedido `REJECTED` ou `FAILED` na resposta do `POST /orders`: o `pay()` **não** limpa a seleção e **não** navega. A `message` do pedido aparece no lugar do erro, acima do botão de pagar.
   - Os Secure Fields continuam montados. O número, a validade e o CVV ficam como estão, porque o comprador pode só corrigir o CVV (`bad_filled_card_data`) ou trocar o cartão inteiro. Um token novo é gerado no próximo clique: o token do Mercado Pago é de uso único.
   - A mensagem diz o próximo passo: outro cartão ou PIX. Trocar para PIX limpa a mensagem.
   - `PAID` e `PENDING` continuam indo para a tela do pedido. O cartão `PENDING` (em análise) é acompanhado lá, como o PIX.
   - O `@case ('REJECTED')` da tela do pedido continua, porque um pedido pendente pode ser recusado depois (webhook ou reconsulta).

5. **Novo status `FAILED`: a compra que não aconteceu por erro.**
   `OrderStatus` ganha `FAILED`, numa migration que só adiciona o valor ao enum.
   - **`FAILED`** é o pedido em que a cobrança não chegou a um desfecho por erro: o Mercado Pago respondeu erro que não é recusa (`400`, `401`, `403`, `409`, `429`, `5xx`), a rede falhou, ou o navegador não conseguiu gerar o token por falha do SDK (decisão 9). O `OrdersService` grava `FAILED` no lugar de deixar o pedido `PENDING`, e a API continua respondendo ao comprador o mesmo `503` de hoje, agora com o id do pedido.
   - **`REJECTED`** continua sendo a recusa do cartão pelo banco ou pelo antifraude. Não é erro do sistema: é o Mercado Pago decidindo. Fica "Recusado" no painel, e também tem logs (decisão 8).
   - **`CANCELLED`** volta a ser só o que o nome diz: o pendente substituído por outra tentativa (Spec 014, decisão 11).
   - `FAILED` é terminal (entra em `TERMINAL`) e não dá acesso. As regras de transição continuam: `FAILED` só sai de `PENDING`. Se o webhook trouxer depois uma order aprovada para um pedido `FAILED` (o Mercado Pago cobrou apesar do erro de rede), `allowedFrom('PAID')` passa a aceitar `FAILED`, para o acesso não ficar preso a um erro nosso.
   - No financeiro, `FAILED` não entra em receita e é contado ao lado dos recusados no resumo.

6. **Log do desfecho de cada cartão na Vercel.**
   Cada criação de order com cartão registra uma linha `info` com o id do nosso pedido, o id da order, `status`, o `status_detail` da transação, a bandeira e as parcelas. Nunca o token. Os erros continuam como `error`, com o corpo da resposta.

7. **Logs de pagamento no banco (Neon).**
   Os logs da Vercel somem em poucos dias, e o gestor não tem acesso a eles. Os erros de pagamento passam a ser gravados numa tabela do mesmo Postgres (Neon) que a API já usa, pelo Prisma. Sem serviço novo e sem credencial nova.
   - **Tabela `payment_logs`** (model `PaymentLog`), criada na mesma migration da decisão 5, uma linha por evento:
     `id`, `orderId` (FK opcional para `orders`, `onDelete: Cascade`), `attemptId`, `userId`, `source` (`API` ou `FRONT`), `stage` (`create_order`, `get_order`, `webhook`, `sdk_load`, `secure_fields`, `payment_method`, `installments`, `tokenize`), `level` (`ERROR`, `WARNING` ou `INFO`), `httpStatus`, `mpOrderId`, `mpStatus`, `mpStatusDetail`, `message`, `detail` (`Json`: corpo da resposta ou do erro), `environment` (`production` ou `sandbox`, pelo `MP_SANDBOX`) e `createdAt`.
     Índices em `(orderId, createdAt)` e `(attemptId)`, que são as duas buscas do modal.
   - **O que é gravado:** todo erro de chamada ao Mercado Pago (criação, consulta, webhook), toda recusa (`REJECTED`, nível `WARNING`) e os erros do navegador (decisão 9). Um cartão aprovado grava só uma linha `INFO`, para o modal mostrar a tentativa inteira quando a primeira falhou e a segunda passou.
   - **O que nunca é gravado:** token do cartão, número, validade, CVV. Do corpo do Mercado Pago saem `payer.identification`, `payer.email` e qualquer `token` antes de gravar, e o `detail` é cortado em 10 KB.
   - **Um `PaymentLogService`** com um método `record()`. Ele nunca lança: uma falha ao gravar o log vira uma linha `error` na Vercel e o pagamento segue, com a mesma trava da nota e do e-mail (Spec 023, decisão A4; Spec 024, decisão D6).
   - **Fora da transação do pedido.** O log é gravado em chamada própria: um log que falha não desfaz o pedido, e um pedido que falha ainda deixa o log.
   - **Limpeza de contas de teste (Spec 026):** com a FK em `Cascade`, apagar um pedido de teste apaga os logs dele. Os logs sem pedido (`orderId` nulo) de um usuário apagado entram no script da Spec 026 pelo `userId`.
   - **A migration roda em produção só com autorização**, como a da Spec 027 (decisão 8): o banco é um só (memória `banco-unico-producao`). Ela só adiciona o valor `FAILED`, a coluna `attemptId` e a tabela nova, sem tocar em linha existente, e roda **antes** do teste no preview, porque o preview grava no mesmo banco.

8. **Painel do gestor: "Erro" e o modal de logs.**
   - **Status:** `FAILED` aparece como **"Erro"** (variante `danger`) na tabela de pedidos do financeiro (`admin-financeiro.ts`) e na lista de pedidos da ficha do aluno (`admin-dashboard.ts`). O filtro de status do financeiro ganha "Erro", e a exportação CSV escreve `FAILED`.
   - **Rota:** `GET /admin/finance/orders/:id/logs`, com a mesma guarda de admin das outras rotas do financeiro. Devolve as linhas do pedido em `payment_logs`, do mais antigo ao mais novo: os que têm o `orderId` e os do navegador com o mesmo `attemptId`.
   - **Modal "Logs do pagamento"** (`ui-modal`, tamanho `lg`): botão "Ver logs" na linha de todo pedido de cartão. Mostra uma linha do tempo com hora, origem (Servidor ou Navegador), etapa, status HTTP, status e motivo do Mercado Pago e a mensagem, com o `detail` num bloco recolhido em JSON formatado. Sem log: "Nenhum log registrado para este pedido." (é o caso dos pedidos anteriores a esta spec).
   - O modal só lê. Não há reprocessar nem estornar daqui.

9. **Erros do navegador sobem para os logs, ligados à tentativa.**
   Parte do caminho do cartão só existe no navegador: carregar o SDK, montar os Secure Fields, achar a bandeira, pedir as parcelas e gerar o token. Uma falha ali nunca chega à API.
   - Cada clique em pagar gera um `attemptId` (UUID) no front. Ele vai no `POST /orders` e fica gravado no pedido (coluna nova `attemptId`, na mesma migration da decisão 5).
   - **`POST /payments/client-logs`**, autenticada pelo `FirebaseAuthGuard`: recebe `attemptId`, `stage`, `message` e `detail` (curto, com DTO em lista branca), e grava com `source: FRONT` e o `userId` do token. Limite de 20 eventos por usuário a cada 10 minutos, contados na própria `payment_logs`, para a rota não virar um depósito.
   - **O que o front manda:** falha ao carregar o SDK, Secure Fields sem iframe, erro de rede ao buscar a bandeira ou as parcelas, e recusa do `createCardToken`. Bandeira não reconhecida também vai, como `warning`, porque foi assim que o caso da Visa apareceu na Spec 025.
   - **Falha do navegador que impede a cobrança:** se o SDK não carrega ou o `createCardToken` falha por erro que não é dado digitado errado, o front chama `POST /orders` com `method: CREDIT_CARD`, o `attemptId` e `clientError` no lugar de `card`. A API cria o pedido já `FAILED`, sem chamar o Mercado Pago, e é assim que ele aparece no painel. Erro de digitação (número, validade, CVV, nome, CPF) só vai para o log: não é falha do sistema, e encheria o painel de "Erro".

10. **Device id pelo `security.js`.**
    A fase 1 mostrou `window.MP_DEVICE_SESSION_ID` indefinido: o SDK v2 não cria o device id, e o `X-meli-session-id` nunca foi enviado. Sem ele, o antifraude decide sem conhecer o aparelho, e um comprador legítimo tem mais chance de cair em `high_risk`.
    - O `MercadoPagoLoader` carrega `https://www.mercadopago.com/v2/security.js` com `view="checkout"` junto com o SDK, só na etapa de pagamento (mesmo critério de script de terceiro da Spec 009, decisão 5).
    - Uma falha do `security.js` (bloqueador) não impede o pagamento: o pedido vai sem device id, como hoje, e a falha vai para o log do navegador (decisão 9).

11. **Cartão pendente tem tela própria.**
    Um cartão em análise (`processing`/`in_process`, nome `CONT` no teste) caía em "Pague com PIX para liberar". O `@case ('PENDING')` de `/loja/pedido/:id` passa a separar o meio:
    - **Cartão:** "Pagamento em análise". Texto: o Mercado Pago está analisando o pagamento, o acesso é liberado assim que ele for aprovado, e o aluno recebe o e-mail de confirmação. Sem QR e sem prazo de 30 minutos.
    - **PIX:** como hoje.

12. **O log da Vercel não grava o token do cartão.**
    O corpo do `402` traz `transactions.payments[].payment_method.token`, e o `logger.error` de hoje o grava inteiro. O token é de uso único, mas não deve ficar em log. A mesma limpeza do `payment_logs` (decisão 7) vale para o `logger.error` do `MercadoPagoService`: sem `token`, `payer.email` e `payer.identification`.

13. **O botão de pagar mostra o parcelado.**
    Com 3x (R$ 219,12 com juros), o botão dizia "Pagar R$ 197,00". Com mais de uma parcela escolhida, o botão passa a dizer "Pagar 3x de R$ 73,04", com o total do Mercado Pago (`totalAmount`) em texto abaixo. Em 1x, continua "Pagar R$ 197,00".

## Ambiente de teste (fase 1 e fase final)

> **Desvio da fase 1:** o preview da Vercel **não cobra em sandbox**. A conexão sandbox ativa foi cifrada pelo script `mp-vendedor-sandbox` com o `MP_TOKEN_ENCRYPTION_KEY` do `.env` local, e o preview usa outra chave (500 "Unsupported state or unable to authenticate data"). A fase 1 e a fase final rodam com a **API local** em `localhost:3000` (`MP_SANDBOX=true`, mesmo banco). Para o preview cobrar, alguém com acesso à chave da Vercel precisa recriar a conexão sandbox com ela. Isso fica fora desta spec.

- **API:** preview da Vercel do projeto `delcastanher-api`. O projeto **não gera preview a partir do Git** (só existe deploy de produção na lista). O preview é publicado pela CLI a partir de uma cópia limpa da branch (`git archive HEAD api` no scratchpad, com o `.vercel/project.json` da API): da raiz do repositório, o `vercel deploy` sobe o `node_modules` e passa do limite de 100 MB.
  - Primeiro preview, com o código de produção, publicado em 21/10/2026: `https://delcastanher-ba5c5o4q2-leno.vercel.app`.
  - No preview, `MP_SANDBOX=true`, e a conta recebedora ativa é a do vendedor de teste (`TESTUSER8605452672838458141`, conexão sandbox criada pelo script `mp-vendedor-sandbox`). O preview grava no banco de produção (memória `banco-unico-producao`); os pedidos de teste ficam presos à conexão sandbox.
- **Acesso ao preview:** o preview tem a proteção de deploy da Vercel (responde 302 para o login). O navegador não manda o header de acesso, então o `ng serve` ganha um proxy **local, sem commit** (`proxy.conf` no scratchpad, passado por `--proxy-config`): `/preview-api/*` vai ao preview com o header `x-vercel-trusted-oidc-idp-token`, lido do `VERCEL_OIDC_TOKEN` de desenvolvimento (`vercel env pull`). O token nunca é impresso nem gravado no repositório. O `apiUrl` do `environment.development.ts` aponta para `http://localhost:4200/preview-api`, também só localmente.
- **CORS:** o preview já libera `http://localhost:4200` (conferido com um preflight de `POST /orders`: `204` e `Access-Control-Allow-Origin: http://localhost:4200`). As rotas com cookie (`/auth/refresh`) conferem o `Origin`, que pelo proxy continua sendo `http://localhost:4200`. Nenhuma variável precisa mudar.
- **Comprador:** a conta usada para comprar precisa de e-mail que o Mercado Pago aceite como pagador em sandbox. Se a order voltar com erro de usuário, usar o comprador de teste `TESTUSER5756959365712233679`.
- **Logs:** `vercel logs` do deploy de preview, acompanhado durante cada tentativa. Depois da implementação, também a tabela `payment_logs` e o modal do painel.

### Cartões de teste (Brasil, Orders API)

| Bandeira | Número | CVV | Validade |
|---|---|---|---|
| Mastercard | `5480 8328 0103 3311` | 123 | 11/30 |
| Visa | `4235 6477 2802 5682` | 123 | 11/30 |
| American Express | `3753 651535 56885` | 1234 | 11/30 |
| Elo (débito) | `5067 7667 8388 8311` | 123 | 11/30 |

O desfecho vem do **nome impresso no cartão** (o campo vem preenchido com o nome do comprador e precisa ser trocado). CPF `12345678909`.

| Nome no cartão | Desfecho esperado |
|---|---|
| `APRO` | Aprovado |
| `OTHE` | Recusado por erro geral |
| `CONT` | Pendente |
| `CALL` | Recusado, pede autorização ao banco |
| `FUND` | Recusado por limite insuficiente |
| `SECU` | Recusado por código de segurança |
| `BLAC` | Recusado (lista negra) |

### Matriz da fase 1 (antes da correção) e da fase final (depois)

- [ ] Visa `APRO` em 1x: pedido `PAID`, acesso liberado, e-mail de compra.
- [ ] Mastercard `APRO` parcelado: parcelas do Mercado Pago na tela, pedido com as parcelas escolhidas.
- [ ] Amex `APRO`: CVV de 4 dígitos aceito.
- [ ] `FUND`, `SECU`, `CALL`, `OTHE`: mensagem certa para cada um na tela de pagamento, sem "falar com o provedor".
- [ ] Recusa seguida de outro cartão `APRO` na mesma tela: paga sem recarregar a página e sem refazer a seleção.
- [ ] `CONT`: pedido pendente, e a tela do pedido fecha quando o Mercado Pago decide.
- [ ] Elo débito: o que o Mercado Pago responde (a conta tem `debelo` habilitado).
- [ ] `deviceId` presente no header `X-meli-session-id` (conferir no log).
- [ ] Webhook de order do cartão chega ao preview e não muda um pedido já fechado.

Só na fase final:

- [ ] Erro forçado do gateway (ex.: conexão sandbox com token inválido num pedido de teste): pedido `FAILED`, "Erro" no painel e o corpo da resposta no modal.
- [ ] SDK bloqueado no navegador (bloquear `sdk.mercadopago.com` no DevTools): pedido `FAILED` com o log do navegador no modal.
- [ ] Recusa `FUND` seguida de `APRO`: o modal do pedido recusado mostra a recusa, e o do aprovado mostra a linha `info`.
- [ ] Nenhuma linha de `payment_logs` tem token, número de cartão, CPF ou e-mail do pagador.

Na fase 1, cada linha registra no `tasks.md` o que a tela mostrou, o status do pedido no banco e a linha do log.

## Critérios de aceite

- Um cartão recusado deixa o pedido `REJECTED`, com `mpOrderId` e o `status_detail` da transação gravados.
- A recusa aparece na tela de pagamento, com o motivo, e o comprador tenta outro cartão ou o PIX sem refazer a seleção.
- Um erro de verdade do Mercado Pago, da rede ou do SDK no navegador deixa o pedido `FAILED`, e não `PENDING` nem `CANCELLED`.
- Todo erro de pagamento, do servidor e do navegador, fica em `payment_logs`, no Neon, sem dado de cartão nem do pagador, e uma falha ao gravar o log não muda o pagamento.
- O painel mostra "Erro" para `FAILED`, e o modal "Logs do pagamento" mostra a linha do tempo da tentativa.
- Visa, Mastercard e Amex de teste aprovam em 1x e parcelado na API local em sandbox, com acesso liberado e e-mail de compra.
- O `X-meli-session-id` vai em toda order com o device id do `security.js`.
- O cartão pendente mostra "Pagamento em análise", e não o texto do PIX.
- Nenhum log, da Vercel ou do banco, tem o token do cartão.
- A matriz da fase final está toda marcada no `tasks.md`.
