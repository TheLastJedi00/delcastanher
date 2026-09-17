# Spec 014: Checkout com Mercado Pago e Acesso por Módulo

**Projeto:** Plataforma E-learning "Imersão RH Estratégico"
**Baseada em:** Spec 006 (Funil de Vendas), Spec 007 (Mockup de Checkout), Spec 008 (Área do Aluno), Spec 009 (Conformidade), Spec 012 (Aulas e Trilha) e Spec 013 (Painel Administrativo)
**Escopo técnico:** full-stack — `api/` (NestJS + Prisma + SDK do Mercado Pago) e `front/` (Angular standalone + signals + Tailwind + MercadoPago.js v2). O backend é escrito com TDD: a suíte vem antes da implementação (`.claude/RULES.md`).
**Aplicação Mercado Pago:** `Delcastanher` (app id `4932690255162951`), produto **Checkout Transparente**, processado pela **Orders API** (`POST /v1/orders`, modo `automatic`).

## Objetivo
A plataforma passa a cobrar. O aluno termina o onboarding e cai em uma loja de módulos: escolhe um ou vários, paga por PIX ou cartão de crédito sem sair do site, e recebe acesso de 6 meses a cada módulo comprado. Enquanto não comprar nada, a conta existe, o perfil é editável e o conteúdo não abre — a loja é o destino de quem entra sem acesso.

É a primeira spec da plataforma que movimenta dinheiro de verdade. Tudo o que as Specs 006, 007 e 013 deixaram explicitamente em aberto — preço, gateway, matrícula, entitlement — é decidido aqui.

## Escopo

- **Preço por módulo:** `Module.priceCents` no banco, editável na aba "Gestão de Aulas" do `/admin`.
- **Loja de módulos:** `/loja`, pós-login e pós-onboarding, com seleção múltipla e resumo do pedido.
- **Pedido:** `Order` + `OrderItem`, com snapshot de preço e título no instante da compra.
- **Pagamento PIX:** QR Code, Copia e Cola e expiração curta.
- **Pagamento cartão de crédito:** tokenização no navegador (Secure Fields), em até 6x com juros do comprador.
- **Webhook:** `POST /webhooks/mercadopago`, com validação de assinatura e reconsulta do pagamento.
- **Acesso por módulo:** `ModuleAccess` com validade de 6 meses, concedido na aprovação do pagamento.
- **Portão de conteúdo no servidor:** vídeo, materiais, progresso e certificado passam a exigir acesso ativo.
- **Cortesia administrativa:** conceder e revogar acesso sem pagamento, pelo painel.
- **Migração das contas atuais:** quem já existe recebe acesso a todos os módulos.

## Decisões técnicas desta spec

1. **O preço é dado do banco, editável no painel — e módulo sem preço não é vendável.**
   Até aqui todo preço do projeto é placeholder (`[PREÇO]`, Spec 006 decisão 3), e `Module` não tem coluna de valor. Entra `priceCents Int?` no schema, preenchido na aba "Gestão de Aulas" ao lado de título e resumo. **Nulo continua significando "a definir"**: o módulo aparece na loja como "em breve", sem botão, e a API recusa qualquer pedido que o inclua. É o mesmo tratamento que `workloadHours` nulo já recebe — a plataforma prefere dizer que não sabe a inventar um número.

   A migration sobe com **R$ 199,00 (`19900`) em todos os módulos existentes**, valor temporário definido pelo time para destravar a integração. É preço de trabalho, não decisão comercial fechada: por isso mora em coluna editável, e trocá-lo é um campo no painel, não um deploy. Módulo criado depois da migration nasce com `priceCents` nulo — quem cadastra conteúdo novo decide o preço dele conscientemente, em vez de herdar 199 por descuido.

2. **O valor cobrado é calculado no servidor; o cliente manda apenas ids de módulo.**
   `POST /orders` recebe `{ moduleIds, method, ... }` e nunca um preço. O servidor lê `priceCents` de cada módulo, soma, grava no pedido e só então fala com o Mercado Pago. Aceitar valor vindo do navegador seria deixar o comprador escolher quanto pagar — e o front não tem como ser a autoridade de um número que ele recebeu da própria API.

3. **Dinheiro é inteiro em centavos, em todo o caminho.**
   `priceCents`, `amountCents` e o snapshot do item são `Int`. A conversão para o decimal que o Mercado Pago espera (`transaction_amount`) acontece em um único ponto, na borda da integração. Ponto flutuante em valor monetário erra por centavos que ninguém persegue depois.

4. **Quem abre o conteúdo é `ModuleAccess`, e não o pagamento.**
   O pedido registra a transação; o acesso é uma linha própria, com `userId`, `moduleId`, `grantedAt`, `expiresAt`, `source` (`PURCHASE` | `COURTESY` | `LEGACY`) e o pedido de origem quando houver. Ler "existe pagamento aprovado com este módulo" a cada requisição amarraria o portão ao histórico financeiro e deixaria a cortesia e a migração sem lugar. Com a tabela, **acesso ativo é uma pergunta só** — `expiresAt > agora` —, igual para quem comprou, quem ganhou e quem já estava aqui.

5. **São 6 meses de calendário a partir da aprovação, e a recompra estende em vez de duplicar.**
   `expiresAt` é `paidAt + 6 meses` calculado em meses (não 180 dias), porque é o que a oferta promete e o que o aluno confere no calendário. A unicidade é `(userId, moduleId)`: recomprar um módulo ainda ativo soma 6 meses ao que resta, e recomprar um expirado abre um período novo a partir de agora. Duas linhas para o mesmo par transformariam toda leitura de acesso em um `max()` sobre histórico.

6. **O pedido guarda o preço e o título do momento da compra.**
   `OrderItem` copia `priceCents` e o título do módulo. O administrador vai mudar preço — e essa é justamente a funcionalidade da decisão 1 —, e um pedido que lê o preço vigente reescreveria o passado a cada reajuste. Recibo e suporte precisam do que foi cobrado, não do que vale hoje.

7. **A integração é a Orders API (`POST /v1/orders`) em modo `automatic`, e não a API de Pagamentos.**
   As notas originais pediam "API de Pagamentos", que é como o Checkout Transparente sempre foi feito. O Mercado Pago passou a processar o Checkout Transparente por **Orders** e a recomenda para integrações novas — `/v1/payments` tende a virar legado, e nascer nele seria nascer devendo uma migração. A Orders API também é melhor para esta loja em quatro pontos concretos: várias transações por requisição, lista completa de erros de validação em vez de um por vez, notificação configurada na aplicação em vez de `notification_url` repetida a cada requisição, e captura, cancelamento e estorno como operações do mesmo recurso — o que deixa o reembolso da decisão 22 a uma chamada de distância quando ele entrar.

   O modo é `automatic`: a order é criada e processada na mesma chamada, que é exatamente o desenho daqui — no instante da compra já existem comprador, itens e meio de pagamento tokenizado. O modo `manual` (criar agora, processar depois, com `client_token` no navegador) resolveria um problema que esta loja não tem. Como no vídeo (Spec 010, decisão 16), o `MercadoPagoService` isola a rede em um arquivo só: a plataforma inteira fala com ele, e não com o Mercado Pago.

8. **Nenhum dado de cartão toca a API: tokenização no navegador com MercadoPago.js v2.**
   Número, validade e CVV vivem dentro dos **Secure Fields** (iframes do próprio Mercado Pago) e nunca existem como valor no `front/`. O que sai do navegador para a nossa API é o `token`, o `payment_method_id`, o `issuer_id`, o número de parcelas e o `device_id`. Isto é exigência de PCI no checklist de qualidade do Mercado Pago, e é também o que mantém a promessa que a Spec 007 (decisão 6) já fazia quando o checkout era maquete: dado de cartão não passa, não é logado e não é guardado.

9. **Parcelamento em até 6x, com juros do comprador, e as parcelas vêm do Mercado Pago.**
   O front consulta as opções pelo SDK (`getInstallments`) com o valor real do pedido e exibe **o que o Mercado Pago devolve** — valor da parcela e total com juros —, sem calcular nada por conta própria. O limite de 6 é da plataforma: o front só oferece até 6 e a API recusa fora de `1..6`, porque teto de UI que o servidor não valida não é teto. Juros por conta do comprador é o comportamento padrão da conta e aparece escrito no resumo, nunca só no rodapé.

10. **PIX expira em 30 minutos, e o pedido expira junto.**
    `expiration_time: "PT30M"` na transação — o padrão do Mercado Pago é 24 horas, e 30 minutos é o mínimo que ele aceita. Sem prazo curto, um QR de ontem pago hoje libera acesso de um pedido que o aluno já abandonou, e a loja fica com pendências eternas na tela. O mesmo instante é gravado no pedido; vencido, ele vira `EXPIRED` e o aluno recomeça, sem nenhum acesso concedido.

11. **Um pedido pendente por vez, e começar outro cancela o anterior.**
    Dois PIX abertos para os mesmos módulos são duas cobranças possíveis da mesma coisa. Ao criar um pedido novo, o pendente anterior do mesmo usuário é cancelado. Pagamento de cartão não fica pendente por tempo suficiente para cair nesse caso, mas a regra é uma só, por estado, e não por método.

12. **O webhook é público, autenticado por assinatura, e nunca acredita no corpo.**
    `POST /webhooks/mercadopago` escuta o tópico **`order`** e valida o header `x-signature` por HMAC sobre `data.id` + `x-request-id` + `ts`, como `POST /webhooks/mux` já faz com o corpo cru (Spec 010, decisão 5) — e o `main.ts` já sobe com `rawBody: true`. Validada a origem, a notificação é tratada como **um aviso de que algo mudou**: o estado vem de `GET /v1/orders/:id`, consultado com o nosso access token. O corpo do POST só informa qual id consultar. Responde 200 inclusive para evento que não interessa, para o Mercado Pago não reentregar para sempre.

13. **A concessão de acesso é idempotente, e o pedido só sai de pendente uma vez.**
    O Mercado Pago reentrega notificações, e webhook e consulta podem chegar ao mesmo tempo. A transição de estado do pedido acontece em transação, condicionada ao estado anterior; a criação do acesso usa o upsert da decisão 5. Reprocessar a mesma order dez vezes concede acesso uma vez e não soma 60 meses. Do lado do Mercado Pago, o `X-Idempotency-Key` da criação é o id do pedido — obrigatório na Orders API —, então uma retentativa de rede não abre duas cobranças.

14. **Existe polling, e ele não é preguiça: é o caminho que funciona sem webhook.**
    `GET /orders/:id` reconsulta `GET /v1/orders/:id` quando o pedido ainda está pendente e aplica o mesmo tratamento do webhook. Em `localhost` nenhuma notificação chega — o Mercado Pago exige URL pública em HTTPS —, e em produção um webhook perdido deixaria o aluno olhando um QR pago sem resposta. A tela de PIX consulta em intervalo fixo enquanto a aba estiver aberta, até o desfecho ou a expiração.

15. **Os campos do checklist de qualidade entram desde o primeiro pagamento.**
    `external_reference` é o id do pedido (obrigatório na Orders API, e é o que liga a order a este banco); `items` leva título, descrição, quantidade e preço de cada módulo; `payer` vai com e-mail, nome, sobrenome e CPF; o cartão vai com o `token`, o emissor e o identificador de dispositivo gerados pelo SDK; e o backend usa o SDK oficial. Nenhum desses é detalhe estético: são itens obrigatórios da avaliação de qualidade do Mercado Pago e entram na taxa de aprovação do antifraude. O nome exato de cada campo no corpo da order — emissor, identificador de dispositivo e descritor de fatura — é conferido na Referência de API na hora de implementar, porque a Orders API não repete a nomenclatura de `/v1/payments`. O CPF passa a ser pedido no checkout — é dado novo na plataforma, obrigatório para PIX, e por isso aparece na Política de Privacidade (Spec 009).

16. **Credencial só no backend; o front recebe a chave pública por API, não por variável de build.**
    `MP_ACCESS_TOKEN` e `MP_WEBHOOK_SECRET` vivem no `ConfigService` do `api/`, como as chaves do Mux (Spec 010, decisão 7). A `public_key`, que o MercadoPago.js precisa, chega pelo `GET /store/payment-config` junto com o indicador de sandbox. Poderia ser variável de build do `front/`, mas então alternar sandbox e produção exigiria **dois** deploys coordenados; com a chave vindo da API, o ambiente é decidido em um lugar só.

17. **O portão do conteúdo passa a ser o servidor, e a tela trancada é consequência.**
    Até a Spec 012 (decisão 7) o portão era a sessão autenticada. Agora `GET /lessons/:id/playback-token`, `GET /lessons/:id/materials`, `GET /materials`, `PATCH /progress/me/lessons/:id` e a emissão de certificado exigem **acesso ativo ao módulo da aula** e respondem 403 sem ele. O `GET /progress/me` continua devolvendo a trilha inteira, agora com o estado de acesso por módulo — o aluno precisa enxergar o que existe para decidir comprar —, mas sem vídeo, sem material e sem marcar aula. Cadeado desenhado no front não protege nada: protege quem só usa o front.

18. **Certificado de módulo exige ter comprado o módulo; o do curso exige todos.**
    A regra de conclusão das Specs 008 e 012 continua valendo e ganha uma condição: só emite quem tem acesso ativo ao módulo. O diploma do curso inteiro exige acesso a todos os módulos, porque é o que ele afirma. **Diploma emitido não expira com o acesso**: o certificado atesta um fato passado, e revogá-lo por vencimento seria mentir sobre o que aconteceu. Quem concluiu dentro dos 6 meses fica com o documento para sempre.

19. **Sem acesso ativo, a plataforma leva para a loja — menos o perfil.**
    Um `accessGuard` no front redireciona para `/loja` quem não tem nenhum acesso ativo ao tentar o AVA. `/ava/perfil` fica **de fora** do guard: a pessoa precisa poder corrigir os próprios dados e exercer os direitos da Spec 009 sem antes comprar alguma coisa. Quem tem acesso parcial entra normalmente e vê os módulos não comprados trancados, com preço e botão de compra — a trilha vira a própria vitrine.

20. **As contas que já existem recebem acesso, e o administrador tem como conceder cortesia.**
    A migration cria `ModuleAccess` de 6 meses com `source = LEGACY` para todos os usuários existentes em todos os módulos existentes. Ligar um paywall sobre alunos com progresso e certificado seria tirar deles o que já tinham. Para depois disso, o detalhe do aluno no `/admin` (Spec 013, decisão 11) ganha conceder e revogar acesso com `source = COURTESY` — suporte, cortesia e teste sem SQL na mão. **É a única escrita do detalhe do aluno**, e não contradiz a decisão 11 da Spec 013: conceder acesso é ato administrativo sobre a relação comercial, não edição de dado pessoal de terceiro.

21. **O funil público passa a levar para cadastro, e o mockup da Spec 007 sai.**
    Os CTAs de `/planos` e `/cursos/:slug` deixam de apontar para `/checkout/:productSlug` e passam a levar para criação de conta, de onde o caminho é onboarding e loja. A rota do mockup, o `checkout.mock.ts` e o `CheckoutStateService` são **removidos**: manter uma tela de demonstração que simula aprovação ao lado de um checkout que cobra de verdade é confusão com risco. O trabalho visual da Spec 007 não se perde — `ui-order-summary`, `ui-payment-method-selector` e o formulário de cartão migram para a loja, que é onde eles finalmente valem.

22. **Reembolso fica fora, mas a plataforma reage a ele.**
    Estorno e contestação são feitos no painel do Mercado Pago; não há botão de devolução no `/admin` nesta spec — e a Orders API deixa essa porta a uma chamada de distância quando ela for aberta (decisão 7). O que existe é a reação: order em `refunded`, `canceled` ou `charged_back` marca o pedido e **revoga o acesso concedido por ele**. Sem isso, dinheiro devolvido deixaria o conteúdo liberado, e a divergência só apareceria em uma auditoria manual.

23. **Não nasce tela de faturamento, e a decisão 1 da Spec 013 continua de pé.**
    Existem pedidos no banco, mas relatório de vendas, KPI de faturamento e conciliação são spec própria: envolvem taxa do gateway, data de liberação do dinheiro e regime de competência, e nada disso é derivável de `Order.amountCents`. O painel ganha apenas o que o suporte precisa para responder um aluno: no detalhe dele, os acessos com validade e origem, e os pedidos com status, valor e id do pagamento no Mercado Pago.

24. **Entrega em sandbox, com produção a uma variável de distância.**
    O código é o mesmo nos dois ambientes; o que muda é o par de credenciais. O teste de ponta a ponta usa usuários de teste do Mercado Pago, cartões de teste e o webhook apontando para o deploy de preview (única forma de receber notificação — `localhost` não é alcançável). Subir para produção é trocar `MP_ACCESS_TOKEN`, `MP_PUBLIC_KEY` e `MP_WEBHOOK_SECRET`, sem tocar em código.

25. **Nota fiscal fica fora, e o campo do cadastro não muda isso.**
    As notas originais registram "Nota fiscal de Produto físico", que é como a aplicação foi classificada no cadastro do Mercado Pago. O produto vendido aqui é acesso a conteúdo digital, e emissão fiscal é integração com prefeitura ou emissor — outro fornecedor, outra spec. Vale conferir a classificação no painel do Mercado Pago: produto físico costuma puxar exigência de endereço de entrega e prazo de envio que este produto não tem.

## Modelo de dados

```
Module.priceCents  Int?     // nulo = a definir; 19900 nos existentes (decisão 1)

Order              id, userId, status, amountCents, method, installments,
                   mpOrderId, mpPaymentId, mpStatus, mpStatusDetail,
                   paidAt, expiresAt, createdAt, updatedAt
OrderStatus        PENDING | PAID | REJECTED | CANCELLED | EXPIRED | REFUNDED
PaymentMethodKind  PIX | CREDIT_CARD

OrderItem          orderId, moduleId, priceCents, titleSnapshot

ModuleAccess       userId, moduleId, grantedAt, expiresAt, source, orderId?
AccessSource       PURCHASE | COURTESY | LEGACY
                   @@unique([userId, moduleId])
```

`mpOrderId` é o `ORD...` da Orders API e é a chave da reconsulta e do webhook; `mpPaymentId` é o `PAY...` da transação, guardado porque é o número que o aluno vê no extrato e o que o suporte procura no painel do Mercado Pago. `mpStatus` e `mpStatusDetail` guardam o par cru, sem tradução: quando o desfecho não fizer sentido, o que responde é o que o gateway disse, não a nossa interpretação dele.

## Tradução de status

O status do pedido é nosso; o do Mercado Pago é dele. A conversão acontece em um ponto só:

| Order (Mercado Pago) | Pedido | Efeito |
|---|---|---|
| `created`, `processing`, `action_required` | `PENDING` | nenhum — aguarda webhook ou reconsulta |
| `processed` | `PAID` | grava `paidAt` e concede acesso (decisão 5) |
| `failed` | `REJECTED` | nenhum; `status_detail` vira a mensagem ao comprador |
| `canceled` | `CANCELLED` | nenhum |
| `expired` | `EXPIRED` | nenhum |
| `refunded`, `charged_back` | `REFUNDED` | revoga o acesso concedido pelo pedido (decisão 22) |

`status_detail` é o que separa "cartão recusado pelo emissor" de "dados do cartão preenchidos errado" de "limite insuficiente" — três recusas com três saídas diferentes para o comprador, e por isso a mensagem da tela é derivada dele, nunca um "pagamento recusado" genérico. São os mesmos estados que a Spec 007 desenhou como maquete, agora com resposta de verdade por trás.

## Rotas novas

| Método | Rota | Quem |
|---|---|---|
| `GET` | `/store/catalog` | aluno autenticado — módulos, preço e estado de acesso |
| `GET` | `/store/payment-config` | aluno autenticado — `public_key` e flag de sandbox |
| `POST` | `/orders` | aluno autenticado — cria pedido e pagamento |
| `GET` | `/orders/:id` | dono do pedido — status, com reconsulta se pendente |
| `GET` | `/orders/me` | aluno autenticado — histórico |
| `POST` | `/webhooks/mercadopago` | público, autenticado por assinatura |
| `PATCH` | `/admin/modules/:id/price` | admin |
| `GET` | `/admin/users/:id/access` | admin |
| `POST` | `/admin/users/:id/access` | admin — cortesia |
| `DELETE` | `/admin/users/:id/access/:moduleId` | admin — revogar |

## Integração com o existente
No `api/` nasce o `PaymentsModule` (`MercadoPagoService`, `OrdersService`, `AccessService`, controllers e webhook), no mesmo desenho do `MuxModule`: um serviço isola a rede, os demais não sabem que existe um gateway. `ContentModule`, `ProgressModule` e `CertificatesModule` passam a consultar o `AccessService` — e só ele — para decidir o que entregam; `FirebaseAuthGuard` e `RolesGuard` seguem intactos, e nenhum deles aprende nada sobre pagamento. O `UsersModule` ganha as rotas de cortesia ao lado das da Spec 013.

No `front/` nasce a feature `loja/` (catálogo, checkout PIX, checkout cartão, acompanhamento do pedido) com um `StoreService` de signals no padrão de `admin-users.service.ts`, mais o `accessGuard` em `core/guards/`. O MercadoPago.js v2 é carregado sob demanda, só na etapa de pagamento — script de terceiro não entra em toda visita, e a Spec 009 (decisão 5) já firmou esse critério. A trilha e o Hub passam a exibir módulo trancado; o `/admin` ganha o campo de preço na "Gestão de Aulas" e o bloco de acessos no detalhe do aluno.

## Fora de escopo
- Relatório de vendas, KPI de faturamento e conciliação financeira (decisão 23).
- Estorno, devolução parcial e gestão de contestação pela plataforma (decisão 22).
- Nota fiscal e integração fiscal (decisão 25).
- Cupom de desconto, order bump, upsell e preço promocional com data.
- Assinatura recorrente e plano mensal — a venda desta spec é avulsa, por módulo.
- Boleto, cartão de débito, Conta Mercado Pago e carteira digital: PIX e cartão de crédito apenas.
- Cartão salvo para a próxima compra (`customer_id` do Mercado Pago).
- 3DS 2.0 (`three_d_secure_mode`), que exige tela de challenge própria.
- Compra sem conta: pagar exige estar autenticado e com onboarding concluído (decisão 21).
- Log de auditoria das concessões de cortesia — a Spec 013 (decisão 14) já registrou essa ausência, e ela continua.
