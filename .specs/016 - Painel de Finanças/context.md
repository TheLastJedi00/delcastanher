# Spec 016: Painel de Finanças — Faturamento, Estornos e Uso do que Foi Vendido

**Projeto:** Plataforma E-learning "Imersão RH Estratégico"
**Baseada em:** Spec 013 (Painel Administrativo com Dados Reais) e Spec 014 (Checkout com Mercado Pago)
**Escopo técnico:** `api/` (NestJS + Prisma + Jest) e `front/` (Angular standalone + signals + Tailwind). O backend é escrito com TDD: a suíte vem antes da implementação (`.claude/RULES.md`).

## Objetivo

A Spec 013 tirou o card "Vendas / Faturamento — R$ 145.000" do painel porque não havia de onde tirá-lo: não existia `Order`, nem gateway, nem preço que não fosse placeholder (decisão 1 daquela spec). A Spec 014 criou as três coisas — `Order`, `OrderItem`, `ModuleAccess` e a Orders API do Mercado Pago —, mas recusou deliberadamente abrir a tela: relatório de vendas envolve taxa de gateway, data de liberação e regime de competência, e nada disso era derivável de `Order.amountCents` sozinho (decisão 23).

Esta é a spec própria que aquela decisão prometeu. Ela abre a aba **Financeiro** no `/admin` com faturamento no período, estornos, taxa do gateway, quebra por método e por módulo, série temporal com comparação contra o período anterior, e o recorte de engajamento que só interessa aqui: de quem **pagou**, quantos abriram o que compraram.

O que ela resolve de verdade é uma pergunta de preço. Hoje todos os módulos custam R$ 199,00 — valor provisório que a migration da Spec 014 carimbou em todos eles. Sem saber qual módulo vende, em qual método, e quantos compradores nunca abriram o vídeo, qualquer reajuste é palpite.

## Escopo

- **Endpoint de resumo financeiro** sob `FirebaseAuthGuard` + `@Roles('admin')`, no padrão do `AdminUsersService` e do `AdminAccessService`.
- **Indicadores do período:** faturamento bruto, estornos, taxa do gateway, faturamento líquido, ticket médio, pedidos pagos, pendentes e recusados, e taxa de conversão.
- **Quebra por método** (PIX × cartão) **e por módulo**, com receita e quantidade.
- **Série temporal** por dia ou por mês, com filtro de período e comparação contra o período imediatamente anterior.
- **Tabela de taxas do gateway** mantida pelo administrador, vigente por período e auditada.
- **Engajamento do que foi vendido:** de quem comprou acesso, quantos concluíram ao menos uma aula.
- **Lista de pedidos** com status, valor, método, módulos e ids do Mercado Pago, com busca e paginação no servidor.
- **Exportação CSV** no mesmo padrão de `GET /admin/users/export`.
- **Estado vazio honesto** enquanto não houver vendas.

## Decisões técnicas desta spec

1. **Receita sai de `Order`, e nunca de `ModuleAccess`.**
   `ModuleAccess` responde "quem pode assistir", e desde a Spec 014 (decisão 4) é deliberadamente indiferente à origem: compra, cortesia e o backfill `LEGACY` das contas antigas produzem a mesma linha. Contar acesso como venda somaria as cortesias do suporte e as contas que já existiam antes do paywall ao faturamento, e o número cresceria toda vez que um administrador resolvesse um chamado. Todo dinheiro desta spec vem de `Order` e de `OrderItem`; `AccessSource` aparece no painel como **contador separado e não monetário**, exatamente para que o ranking de módulos não seja lido como demanda quando parte dele foi concessão.

2. **Dinheiro continua inteiro em centavos, do banco até o JSON.**
   Reafirma a decisão 3 da Spec 014. Nenhuma resposta desta spec devolve `199.00`, `"R$ 199,00"` ou float: devolve `19900`. A formatação acontece no template, e o CSV é o único lugar onde um valor sai escrito, porque planilha é para ser lida. Percentuais seguem a mesma regra da Spec 013: inteiro de 0 a 100, com a definição escrita ao lado do número.

3. **Líquido é bruto menos estornos menos taxa do gateway, e a taxa vem de uma tabela mantida à mão.**
   A Orders API não devolve o custo da transação: o `OrderResponse` que `mercado-pago.service.ts` lê tem `id`, `status`, `status_detail` e os dados do PIX, e nada de `fee_details` — que vive na API de Pagamentos, outra API. Buscar a taxa por pedido significaria uma chamada externa a mais por venda, e um número de relatório que depende de a rede estar de pé.

   As taxas do Mercado Pago são fixas e conhecidas por contrato. Então elas viram **dado da plataforma**: uma tabela que o administrador preenche, com percentual, valor fixo e período de vigência. O cálculo é nosso, o custo é constante, e o relatório fecha sem depender de terceiro.

4. **A vigência é por período, e a taxa aplicada é a do dia do pagamento.**
   Uma taxa não é um número global: é um número que valeu de uma data até outra. Se o Mercado Pago reajustar amanhã, o administrador cadastra a nova vigência a partir da data do reajuste, e **os meses já fechados continuam calculados com a taxa que valia neles**. Uma coluna única e global reescreveria o histórico inteiro a cada reajuste — o faturamento líquido de março mudaria porque a taxa de setembro mudou, que é o oposto do que um relatório serve para fazer.

   O casamento é por `Order.paidAt`, e não por `createdAt`: o custo nasce quando o dinheiro entra.

5. **Período sem taxa cadastrada não vira zero.**
   Se o intervalo consultado alcança pagamentos que caem fora de qualquer vigência, o painel exibe o bruto e os estornos normalmente e marca o líquido como **não apurado**, dizendo quantos pedidos ficaram descobertos e em qual intervalo. Taxa ausente tratada como `0` produziria um líquido inflado e crível, que é a pior forma de errar um número de dinheiro. É a mesma regra da decisão 15: ausência de dado é uma afirmação diferente de zero.

6. **A taxa é por método de pagamento, e não por número de parcelas.**
   PIX e cartão têm custos diferentes e entram como linhas distintas. Parcela **não** subdivide a taxa porque, desde a decisão 9 da Spec 014, o juro do parcelamento é do comprador: o vendedor recebe o mesmo independentemente de ser 1x ou 6x. Abrir a tabela por faixa de parcela criaria seis linhas para preencher, cinco delas iguais, e cinco oportunidades de digitar errado.

7. **A tabela de taxas é append-only e registra quem mudou — o primeiro dado auditado do projeto.**
   A Spec 013 (decisão 14) registrou que não haveria log de auditoria, e essa omissão continua de pé para papel, bloqueio e cortesia: aquelas ações têm efeito visível na própria tela, e quem as desfaz vê o estado atual. Uma taxa é diferente. Ela é um número que **reescreve receita já reportada**, e alguém vai olhar um líquido estranho de três meses atrás e precisar saber quem digitou aquilo e quando.

   Então: corrigir uma taxa **cria uma linha nova** e encerra a anterior; nada é editado no lugar e nada é apagado. Cada linha guarda o id e o e-mail do administrador que a criou, e o instante. O e-mail é cópia, não relação — o autor precisa continuar legível depois de a conta dele sair.

8. **`Order` ganha `refundedAt`, porque sem ele o estorno não tem mês.**
   Hoje o estorno é só uma transição de status: `orders.service.ts` marca `REFUNDED` e revoga o acesso daquele pedido (Spec 014, decisão 22), preservando o `paidAt`. Isso basta para trancar o conteúdo e não basta para um relatório — sem data própria, um estorno só poderia ser lançado no mês da **venda**, reabrindo um mês já fechado, ou ficar invisível na série.

   Entra `refundedAt`, carimbado na transição para `REFUNDED`. A migration **não** faz backfill: pedido já estornado antes desta coluna entra no total de estornos do período inteiro e aparece em uma linha própria — "N estornos sem data registrada" —, nunca distribuído em um mês por chute.

9. **Estorno é total, e o painel não finge que pode ser parcial.**
   O modelo não tem valor estornado: `Order.amountCents` é o pedido inteiro, e `REFUNDED` é o pedido inteiro devolvido. Estorno parcial feito no painel do Mercado Pago **não** seria representável aqui, e a taxa de reembolso sairia errada sem aviso. Fica registrado como limite conhecido, com a saída pronta quando for preciso: uma coluna `refundedAmountCents` que hoje seria sempre igual ao total e por isso não é criada.

10. **Conversão é medida por pessoa, e não por pedido.**
    A decisão 11 da Spec 014 estabeleceu que existe **um pedido pendente por vez**, e que começar outro cancela o anterior. Quem abre o PIX, desiste e volta para pagar no cartão gera um `CANCELLED` e um `PAID` — e uma conversão calculada como `pagos ÷ criados` leria essa pessoa como meia venda perdida. O número ficaria pior quanto melhor a loja fosse em deixar o comprador trocar de método.

    Então a conversão desta spec é: **pessoas com ao menos um pedido pago ÷ pessoas com ao menos um pedido no período**. É a pergunta que alguém de fato faz — de quem tentou comprar, quantos compraram —, e ela é imune ao desenho de pedido único. A definição aparece escrita ao lado do número, como manda a decisão 6 da Spec 013.

11. **A série temporal é agrupada no fuso de São Paulo, e não em UTC.**
    Uma venda às 21h de terça em Brasília é quarta-feira em UTC. Agrupar a série por `date_trunc` no fuso do banco jogaria três horas de vendas de todo dia para o dia seguinte, e no último dia do mês jogaria para o mês seguinte. O corte é feito com `AT TIME ZONE 'America/Sao_Paulo'`, e o filtro de período é convertido no mesmo fuso, para que "de 01/09 a 30/09" signifique o setembro que o administrador tem em mente.

    Fica registrado que o CSV da Spec 013 formata datas em UTC (`csvDate` usa `getUTCDate`). Esta spec **não** o altera — mexer no arquivo de alunos por causa de um relatório financeiro é escopo se espalhando —, mas a divergência está anotada para quem for unificar.

12. **A agregação é do banco; nada é somado em memória.**
    Os indicadores saem de `groupBy` e `aggregate` do Prisma, e a série temporal sai de `$queryRaw` — `groupBy` não trunca data, e essa é exatamente a operação que precisa acontecer no Postgres. Trazer pedidos linha a linha para somar no Node funcionaria com cem vendas e viraria um problema silencioso com dez mil, que é o cuidado que a decisão 8 da Spec 013 tomou na listagem. O índice `orders(userId, createdAt)` não serve a consulta por período; entra um índice por `status, paidAt`.

13. **A quebra por módulo usa o preço do pedido, e não o preço vigente.**
    `OrderItem` guarda `priceCents` e `titleSnapshot` justamente porque o administrador vai reajustar `Module.priceCents` (Spec 014, decisão 6). O ranking de receita por módulo soma o **snapshot**: ler o preço de hoje reescreveria o faturamento do passado a cada reajuste — o mesmo erro que a decisão 4 evita na taxa. O agrupamento é por `moduleId`, e o título exibido é o atual, para que renomear um módulo não parta a linha em duas.

14. **Engajamento, aqui, é o uso do que foi pago.**
    A Spec 013 já tem um `engagementRate` — fração dos alunos que concluiu ao menos uma aula em 30 dias — e ele continua onde está, na Visão Geral. O painel financeiro não o repete: ele recorta **quem comprou**. De quem tem acesso com `source = PURCHASE`, quantos concluíram ao menos uma aula do módulo comprado e quantos nunca abriram nada.

    É o indicador que antecipa estorno e reclamação, e o único do painel que muda decisão de preço: módulo que vende bem e ninguém assiste é um problema diferente de módulo que ninguém compra. Cortesia e `LEGACY` ficam fora deste recorte de propósito — quem ganhou não tem a mesma expectativa de quem pagou.

15. **Zero é diferente de "ainda não vendemos".**
    Com a base vazia o painel não desenha um gráfico reto no zero nem escreve "R$ 0,00" nos cards: ele diz que ainda não há pedidos no período e oferece ampliar o intervalo. Um zero afirma que houve zero venda em um período em que se vendeu; a ausência de pedido afirma outra coisa. É a mesma distinção que a Spec 013 fez ao remover o card de faturamento em vez de zerá-lo, e que a Spec 015 (decisão 8) fez ao dizer que aceite nulo não é recusa.

16. **O gráfico é SVG escrito aqui, e não Chart.js.**
    A Spec 001 previa Chart.js, e a avaliação pedida pelo escopo mudou a resposta. São dois gráficos, de uma série cada, com no máximo 31 pontos. Contra a biblioteca pesam quatro coisas concretas neste projeto: ela desenha em `<canvas>`, que o SSR já ligado (`@angular/ssr`, `main.server.ts`) entrega em branco e que leitor de tela não lê; ela traz o próprio sistema de cores, fontes e tooltip, que teria de ser reconfigurado inteiro para o Design System da Spec 002; ela seria a primeira dependência de runtime do front desde o `@mux/mux-player`, que entrou porque tocar vídeo protegido não se escreve à mão — desenhar 31 retângulos se escreve; e ela empurra a acessibilidade para um `aria-label` genérico.

    Entra `ui-time-series-chart` em `shared/ui/`, SVG inline, com eixos e grade em elementos, tooltip no padrão do Design System e **uma tabela de dados equivalente** como conteúdo acessível — que é também o que a tela mostra quando a série tem um ponto só. Fica registrado que a conclusão vale para este gráfico: zoom, pan, séries múltiplas ou tempo real justificariam revisitar a biblioteca, e nada disso está aqui.

17. **Nenhum dado de cartão em lugar nenhum, e nenhum CPF — porque nem existem no banco.**
    A Spec 014 (decisão 8) fechou isso com tokenização no navegador: a API nunca recebe número, validade ou CVV. O CPF do pagador **trafega** para o gateway em `mercado-pago.service.ts` e não é persistido em coluna alguma. O painel financeiro não muda isso e não abre exceção: as respostas desta spec expõem `mpOrderId`, `mpPaymentId`, `mpStatus` e `mpStatusDetail` — identificadores e motivo de recusa, que é o que o suporte procura no painel do Mercado Pago — e nada do pagador além do nome e do e-mail que o detalhe do aluno já mostra. O CSV segue a mesma regra.

18. **As rotas novas são de administrador na classe, e não por método.**
    `FirebaseAuthGuard` + `RolesGuard` + `@Roles('admin')` no controller inteiro, como em `AdminUsersController` e `AdminAccessController` — deixar a proteção no método faz da próxima rota um furo por esquecimento (Spec 010, decisão 13). Requisição sem token responde 401 e requisição com papel `aluno` responde 403, em **todas** elas, incluindo a exportação e a escrita de taxa. Quem autoriza é o claim do token, nunca a coluna `role`, que é espelho de leitura (Spec 013, decisão 3).

19. **A comparação com o período anterior usa janela do mesmo tamanho.**
    "Mês anterior" no dia 5 de outubro não é setembro inteiro contra cinco dias de outubro — essa conta sempre mostra queda, todo mês, até o dia 30. O painel compara o período selecionado com o intervalo **imediatamente anterior e de igual duração**, e diz na legenda qual foi: "vs. 01/08 a 31/08". A seta de tendência do `ui-stat-card` só aparece quando o período anterior tem pedido; sem base de comparação ela fica fora, em vez de mostrar "+100%".

20. **Esta spec lê, e só escreve taxa.**
    Não nasce botão de estornar, cancelar, reenviar cobrança ou conceder desconto. A decisão 22 da Spec 014 continua de pé: estorno e contestação são feitos no painel do Mercado Pago, e a plataforma reage a eles. A única escrita que entra é o cadastro de vigência de taxa, que é declaração de um fato contratual externo — e por isso mesmo é a que ganhou autoria (decisão 7).

## Modelo de dados

### Coluna nova em `Order`

| Coluna | Tipo | Significado |
|---|---|---|
| `refundedAt` | `DateTime?` | Instante da transição para `REFUNDED`. Nulo em pedido não estornado e em estorno anterior a esta spec (decisão 8). |

Entra também o índice `@@index([status, paidAt])`, que é o que a consulta de período percorre — o índice existente é `(userId, createdAt)`, desenhado para o histórico de um aluno.

### Tabela nova: `GatewayFeeRate`

Vigência de uma taxa do gateway, mantida pelo administrador (decisões 3, 4 e 7).

| Coluna | Tipo | Significado |
|---|---|---|
| `id` | `String` | `cuid()`. |
| `method` | `PaymentMethodKind` | `PIX` ou `CREDIT_CARD`. Parcela não subdivide (decisão 6). |
| `percentBasisPoints` | `Int` | Percentual em pontos-base: `499` = 4,99%. Inteiro pela mesma razão que o valor é (decisão 2). |
| `fixedCents` | `Int` | Parcela fixa por transação, em centavos. `0` quando não há. |
| `validFrom` | `DateTime` | Início da vigência, inclusivo. |
| `validTo` | `DateTime?` | Fim, exclusivo. Nulo é a vigência corrente. |
| `createdById` | `String` | UID do administrador que cadastrou. |
| `createdByEmail` | `String` | Cópia do e-mail, não relação: o autor precisa continuar legível depois de a conta sair. |
| `note` | `String?` | Por que mudou — "reajuste anunciado em 10/09", "correção de digitação". |
| `createdAt` | `DateTime` | Instante do cadastro. |

Sem `updatedAt` e sem rota de edição ou remoção: a tabela é append-only (decisão 7). Cadastrar uma vigência nova para um método fecha a anterior, gravando `validTo` com o `validFrom` da nova — a única escrita que toca linha existente, e ela não altera nenhum valor de taxa.

**Regra de aplicação.** Para um pedido pago em `paidAt`, vale a linha do mesmo `method` com `validFrom <= paidAt` e (`validTo` nula ou `validTo > paidAt`). Vigências do mesmo método não se sobrepõem, e isso é garantido no cadastro. Sem linha que case, o pedido entra em "não apurado" (decisão 5).

**Arredondamento.** A taxa é calculada **por pedido** — `round(amountCents × percentBasisPoints ÷ 10000) + fixedCents`, meio para cima — e depois somada. Aplicar o percentual sobre a soma do período daria um total que não bate com a soma das linhas, e a primeira conferência manual encontraria a diferença.

## Endpoints

Todos sob `/admin/finance`, com os guards da decisão 18.

| Rota | O que devolve |
|---|---|
| `GET /admin/finance/summary` | Indicadores do período, comparação com o anterior, quebras por método e por módulo, série temporal e o recorte de engajamento. Aceita `from`, `to` e `granularity` (`day` ou `month`). |
| `GET /admin/finance/orders` | Página da lista de pedidos. Aceita `from`, `to`, `status`, `method`, `search`, `page`, `pageSize`, `sort` e `direction`. |
| `GET /admin/finance/orders/export` | A lista inteira do filtro corrente em CSV, montada no servidor, como anexo datado. Declarada **antes** de qualquer rota com parâmetro. |
| `GET /admin/finance/fees` | Histórico de vigências, por método, da mais recente para a mais antiga, com autor e data. |
| `POST /admin/finance/fees` | Cadastra uma vigência e encerra a anterior do mesmo método. Recusa `validFrom` que caia dentro de uma vigência já encerrada. |

Valor fora do conjunto é **recusado**, e não trocado em silêncio pelo default, no mesmo critério do `ListAdminUsersDto`. `from` posterior a `to` é 400. O período default é os últimos 30 dias, mesma janela do `ACTIVITY_WINDOW_DAYS` da Spec 013, para que as duas abas não tenham dois "recente" diferentes.

## Integração com o existente

No `api/`, entram `admin-finance.controller.ts`, `admin-finance.service.ts`, `gateway-fees.service.ts`, os DTOs e os tipos, todos dentro do `PaymentsModule` — é onde `Order`, `OrderItem` e `ModuleAccess` já vivem, e nenhum módulo novo se justifica. `MercadoPagoService` continua não exportado: esta spec não fala com o gateway, e o cálculo de taxa é a razão de ela não precisar. `orders.service.ts` ganha uma linha na transição para `REFUNDED`, carimbando `refundedAt`.

No `front/`, `ADMIN_TABS` recebe `financeiro` entre `visao-geral` e `aulas`, e o componente entra como `features/admin/financeiro/`, no padrão do `AdminAulas` — aba projetada dentro do `AdminLayout`, e não rota própria. Entra `core/services/admin-finance.service.ts`, no padrão do `AdminUsersService`: `HttpClient`, `HttpParams`, signals de carregamento e erro. O filtro de período e a granularidade vivem na URL por query param, como a Spec 013 estabeleceu, para que o recorte vire link compartilhável e sobreviva ao F5. Os indicadores reaproveitam `ui-stat-card` com a `caption` dizendo o critério, e o gráfico entra como `shared/ui/time-series-chart/`.

## Fora de escopo

- **Estornar, cancelar ou reembolsar pela plataforma** — segue no painel do Mercado Pago (Spec 014, decisão 22; decisão 20 desta).
- **Estorno parcial** — não representável no modelo atual, registrado como limite (decisão 9).
- **Captura automática da taxa pela API do Mercado Pago** — a tabela manual é a decisão 3; automatizar exigiria a API de Pagamentos e uma chamada por venda.
- **Conciliação com o extrato do Mercado Pago** e **data de liberação do dinheiro** (D+X) — o painel mostra o que foi cobrado, não o que já caiu na conta. É a diferença entre competência e caixa, e ela merece spec própria.
- **Nota fiscal** — o gateway não emite, e a Spec 014 (decisão 25) já registrou a verificação.
- **Cupom, desconto e preço promocional** — não existem no modelo; o valor é sempre a soma de `Module.priceCents` (Spec 014, decisão 2).
- **LTV, coorte, recompra e projeção de receita** — dependem de mais de um ciclo de 6 meses de acesso, que a plataforma ainda não viveu.
- **Log de auditoria geral** — continua fora (Spec 013, decisão 14). A autoria desta spec é da taxa, e só dela (decisão 7).
- **Alterar o `csvDate` da Spec 013** para o fuso de São Paulo — divergência anotada na decisão 11, não corrigida aqui.
- **Múltiplas moedas, multi-gateway e split de pagamento.**
