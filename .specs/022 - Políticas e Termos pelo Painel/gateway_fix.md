# Relatório de Bug: falhas do checkout na primeira venda real

> **Status: em aberto.** Os bugs 1 a 3 (API) têm causa encontrada no código. O bug 4 (front) tem causas prováveis, a confirmar na reprodução. Falta a correção (TDD) e a validação em produção. A causa do `processing_error` foi **confirmada na conta recebedora** (sem chave Pix) e corrigida lá em 28/09/2026. O PIX volta a ser gerado; o pagamento ainda não foi testado.

> Este relatório é independente da Spec 022 (Políticas e Termos pelo Painel), que só divide a pasta com ele.

## Descrição
Na primeira venda real por PIX em produção, o Mercado Pago criou a order na
conta da vendedora e recusou a transação com `402`. A API respondeu `503`
"Não foi possível falar com o provedor de pagamento", o comprador tentou de
novo, e o pedido local ficou `PENDING` sem `mpOrderId`, sem nada que o feche.

## Ocorrência (28/09/2026, 19:12 de Brasília)
Deploy de produção, `api.delcastanher.srv.br`. Comprador `jediaelborges15@gmail.com`,
conta recebedora `LIDIANEPARISOTTO` (`130465493`), módulo "Fundamentos do RH
Estratégico" a R$ 5,00, PIX.

```
ERROR [MercadoPagoService] Mercado Pago respondeu 402 em /orders:
{"errors":[{"code":"failed","message":"The following transactions failed",
  "details":["PAY01M3MPWQV0DMJW5BM6QKNX82VQ: processing_error"]}],
 "data":{"id":"ORD01M3MPWQTQ37RVKH5VX3034G8Z","status":"failed","status_detail":"failed",
  "external_reference":"cmulmj92u000004l3mt1j5m09", …,
  "transactions":{"payments":[{"id":"PAY01M3MPWQV0DMJW5BM6QKNX82VQ","status":"failed",
   "status_detail":"processing_error","payment_method":{"id":"pix","type":"bank_transfer"}}]}}}
```

Estado no banco (consulta de leitura, mesmo dia):

| Pedido | Estado | `mpOrderId` | Observação |
| - | - | - | - |
| `cmulmj92u000004l3mt1j5m09` | `CANCELLED` | nulo | O do log. Cancelado pela tentativa seguinte (um pendente por vez), e não pela falha. |
| `cmulmjg1m000204l32drdkp9c` | `PENDING` | nulo | Segunda tentativa, 9 s depois. Órfão. |
| `cmu5ygmu60000i0uao83byzt5` | `PENDING` | nulo | De 17/09, anterior à Spec 020. Mesmo sintoma. Órfão. |

## Causa do `processing_error`: conta recebedora sem chave Pix (confirmada)
A order nasceu na conta da vendedora (`ORD01M3…`, com o `application_id` da
aplicação `Delcastanher`). O token e a conexão da Spec 020 funcionaram, e quem
falhou foi a geração do PIX.

A documentação do Mercado Pago (consultada pelo MCP em 28/09/2026) diz que
**o PIX só é oferecido se a conta recebedora tiver chave Pix cadastrada**.
Hipóteses descartadas:

- **Pagar a si mesmo:** o comprador é outra conta, e a recebedora é a da Lidiane.
- **Limite noturno do Banco Central** (R$ 1 mil entre 20h e 6h): foi às 19:12, de R$ 5,00.
- **Credencial ou escopo:** a order foi criada na conta `130465493`, e o escopo
  tem `urn:mp:online:order:payment/read-write`.
- **Corpo da order:** é o mesmo validado na Spec 014. Campo errado daria `400`
  com o erro de validação, e não `402` com a order criada.

Isso não se corrige no código. Nenhuma mudança no corpo da order resolve uma
conta que não pode receber PIX. Esconder o PIX por configuração seria um
remendo para uma conta que precisa estar certa antes de vender.

### Conferência na conta (manual)
- [x] No app do Mercado Pago da Lidiane (conta `130465493`), conferir se há
  **chave Pix cadastrada** em Seu negócio → Pix → Minhas chaves. Sem chave,
  cadastrar uma. É passo da vendedora, porque exige o login dela.
  - A conta **não tinha chave**. A chave foi cadastrada pela vendedora em 28/09/2026.
- [x] ~~Se a chave já existia, procurar restrição ou KYC pendente e abrir
  chamado no suporte.~~ Não foi necessário.
- [x] Registrar aqui a causa confirmada.
  - **Causa:** conta recebedora sem chave Pix. Com a chave cadastrada, o PIX
    seguinte foi gerado: pedido `cmuloq9r7000004kx4vrpikxz`, order
    `ORD01M3MTD83FXTGGP72N7YEBC3W2`, às 20:13 de Brasília, R$ 5,00, com
    `mpStatus = action_required` e `mpStatusDetail = waiting_transfer`, QR
    válido por 30 min (consulta de leitura ao banco).
- [ ] Pagar um PIX gerado e conferir que o pedido vira `PAID` e libera o
  acesso. A geração funciona, mas o **pagamento ainda não foi testado**.

## Bugs

### 1. `402` com order no corpo vira `503`
`MercadoPagoService.request` (`api/src/payments/mercado-pago.service.ts`) lança
`ServiceUnavailableException` para **qualquer** resposta que não seja 2xx. O
`402` da Orders API não é falha de comunicação: a order foi criada e a
transação recusada, com a order inteira em `data`. O comprador recebe "tente
de novo em instantes" para algo que não se resolve tentando de novo.

**Correção:** no `402` com `data`, devolver `toOrder(data)` em vez de lançar.
O `OrdersService.apply` já leva `failed` a `REJECTED` (`ORDER_STATUS_MAP`) e
grava `mpOrderId`, `mpPaymentId`, `mpStatus` e `mpStatusDetail`. O log com o
corpo inteiro continua: é ele que dá os ids para o suporte. `400`, `401` e
`5xx` seguem como `503`.

### 2. O motivo da recusa é lido do lugar errado
`toOrder` usa `response.status_detail`, que no `402` é o genérico `"failed"`.
O motivo real (`processing_error`) está em
`transactions.payments[0].status_detail`. Com isso, `rejectionMessage` cai
sempre no texto genérico de cartão.

**Correção:** `statusDetail` da transação quando existir, e o da order só na
falta dele. O webhook e a reconsulta passam pelo mesmo `toOrder` e ganham a
mesma correção.

Junto: `rejectionMessage` passa a receber o meio. No PIX, `processing_error`
vira "O PIX está indisponível no momento. Tente pagar com cartão ou fale com o
suporte." — a mensagem atual ("Tente de novo em instantes") é de cartão.

### 3. Pedido local órfão em `PENDING`
Em `OrdersService.create` e `createBundleOrder`
(`api/src/payments/orders.service.ts`), o pedido é gravado **antes** de
`gateway.createOrder`. Se o gateway lança, o pedido fica `PENDING` sem
`mpOrderId`. O webhook e a reconsulta procuram pelo `mpOrderId`, então nada o
fecha. No pacote, ele ainda segura vaga de lote por `SEAT_HOLD_MS` (30 min,
Spec 019).

**Correção:**
- **`4xx` sem order no corpo** (o Mercado Pago respondeu e não criou nada):
  pedido local vira `CANCELLED` antes de o `503` subir. A vaga do lote é solta
  na hora.
- **Erro de rede, timeout ou `5xx`:** não se sabe se a order nasceu, e no
  cartão pode ter havido cobrança. O pedido fica `PENDING`, como hoje, com log
  dizendo isso. Reconciliar pelo `external_reference` fica fora de escopo.
- O `MercadoPagoService` precisa dizer qual dos dois casos aconteceu: exceção
  própria (ex.: `GatewayRejectedRequestException`) ou campo na exceção. Decidir
  na implementação e registrar aqui.

### 4. Campos do cartão ficam "desabilitados" ao trocar de PIX para cartão
Em `/loja/pagamento`, ao clicar em **Cartão de crédito** depois de **PIX**, os
campos do cartão aparecem mas não aceitam digitação.

Nada no código desabilita esses campos: não há `disabled`, `fieldset` ou
`pointer-events` na tela. Número, validade e CVV não são `<input>`, e sim
`<div class="input">` onde o SDK monta os **Secure Fields** (iframes do Mercado
Pago). Com a mesma aparência de input e sem o iframe dentro, o contêiner vazio
parece um campo desabilitado. O defeito é o iframe não ser montado.

Causas encontradas em `front/src/app/features/loja/pagamento.ts`
(`setMethod` e `mountCardFields`):

1. **`fieldsMounted` nunca volta a `false`.** O bloco do cartão fica dentro de
   `@if (method() === 'PIX') { … } @else { … }`. Ao voltar para PIX, o `@else`
   é destruído junto com os iframes, mas `fieldsMounted` continua `true`. Na
   volta ao cartão, `mountCardFields` sai na primeira linha e os contêineres
   novos ficam vazios. Reproduz com **Cartão → PIX → Cartão**.
2. **Montagem antes de o contêiner existir.** `setMethod` troca o signal e
   chama `mountCardFields` na mesma hora. Quando o SDK já está carregado (o
   `MercadoPagoLoader` é `providedIn: 'root'` e guarda a instância por sessão,
   então basta ter aberto o cartão uma vez, nesta ou em outra visita à página
   na mesma sessão), `load()` resolve numa microtask, **antes** da detecção de
   mudança renderizar o `@else`. O `mount('cardNumber')` não acha o
   `#cardNumber`, e o `catch` pode nem ser acionado se o SDK falhar em
   silêncio. Reproduz com **PIX → Cartão** depois de uma visita anterior que
   abriu o cartão.
3. **Campos antigos do SDK nunca são desmontados.** As instâncias criadas por
   `sdk.fields.create` continuam vivas quando o `@else` some ou o componente é
   destruído. Criar de novo o mesmo tipo de campo na mesma instância do SDK
   pode ser recusado.

O campo "Nome impresso no cartão" é um `<input>` comum ligado a um
`FormControl` e não deveria ficar travado. **A confirmar na reprodução** se ele
também trava ou se só os três Secure Fields travam.

**Correção:**
- Montar os Secure Fields **depois** de o `@else` renderizar: `afterNextRender`
  (ou `viewChild` do contêiner com `effect`) no lugar da chamada direta em
  `setMethod`.
- Guardar as instâncias de `fields.create` e chamar `unmount()` ao sair do
  cartão e no `ngOnDestroy`, zerando `fieldsMounted` junto.
- Alternativa mais simples: não destruir o bloco do cartão, só escondê-lo
  (`[class.hidden]` em vez de `@if`/`@else`), montando uma vez por instância do
  componente e desmontando no `ngOnDestroy`.
- O `catch` passa a cobrir também contêiner ausente, com a mensagem que já
  existe ("Não foi possível carregar o formulário de cartão…").

## Correção
- [ ] Suíte do `MercadoPagoService`: `402` com `data` devolve a order recusada
  com `paymentId` e `statusDetail = processing_error`; `400`, `401` e `500`
  lançam; `statusDetail` da transação antes do da order.
- [ ] Implementar no `request` e no `toOrder`.
- [ ] Suíte do `OrdersService`, no avulso e no pacote: PIX recusado vira
  `REJECTED` com os ids gravados e a mensagem do PIX; `4xx` sem order vira
  `CANCELLED` + `503` e solta a vaga; erro de rede mantém `PENDING`.
- [ ] Implementar no `OrdersService`, num ponto só para os dois caminhos.
- [ ] `rejectionMessage(statusDetail, method)` com o texto do PIX.
- [ ] Front: PIX com `REJECTED` na resposta cai na tela de recusa com a
  `message`, sem QR, e deixa trocar para cartão. Cobrir no spec do componente.
- [ ] Reproduzir o bug 4 no Chrome e confirmar qual causa ocorre (e se o nome
  impresso também trava). Registrar aqui.
- [ ] Spec do `pagamento.ts` para o bug 4: PIX → Cartão monta os campos; Cartão
  → PIX → Cartão monta de novo; `ngOnDestroy` desmonta. SDK simulado.
- [ ] Corrigir a montagem dos Secure Fields.
- [ ] `npm test` no `api/`, `ng test` e `ng build` no `front/`.
- [ ] Fechar como `CANCELLED`, por script de uma vez, os pedidos órfãos
  (`PENDING` sem `mpOrderId`): `cmu5ygmu60000i0uao83byzt5` e os que surgirem
  até a correção entrar. O `cmulmjg1m000204l32drdkp9c` já foi fechado como
  `CANCELLED` pela tentativa de 20:13, pela regra de um pendente por vez. Rodar
  **depois** do deploy da correção, para não sobrar órfão novo. É escrita no
  banco de produção: só com autorização explícita. Registrar aqui os ids
  fechados.

## Como testar de novo
1. **Não é mais reproduzível em produção:** a conta recebedora já tem chave
   Pix, e o `402` com `processing_error` não volta a acontecer. Os bugs 1 a 3
   ficam verificados pelas suítes do checklist, com a resposta `402` do log
   acima usada como fixture: a tela mostra a mensagem do PIX e oferece cartão,
   e o pedido fica `REJECTED` com `mpOrderId` e
   `mpStatusDetail = processing_error`.
2. Nenhum pedido `PENDING` sem `mpOrderId` sobra no banco depois da limpeza.
3. ~~Depois da chave Pix cadastrada, o mesmo PIX gera o QR normalmente.~~
   Confirmado em 28/09/2026 (ver "Conferência na conta").
4. Em `/loja/pagamento`, alternar PIX → Cartão → PIX → Cartão: nas duas vezes os
   campos do cartão aceitam digitação. Sair para a loja, voltar e repetir.
