# Tasks: Spec 016 - Painel de Finanças

Spec de `api/` (NestJS + Prisma + Jest) e `front/` (Angular standalone + signals + Tailwind). No backend a suíte vem **antes** da implementação, conforme `.claude/RULES.md`. Valem o Design System da Spec 002 e os componentes de `front/src/app/shared/ui/`. As decisões referenciadas estão no `context.md`.

Ordem das fases: o modelo vem primeiro porque tudo depende de `refundedAt` e da tabela de taxas; as taxas vêm antes do resumo porque o líquido não existe sem elas; a lista de pedidos e o CSV são independentes do resumo e podem correr em paralelo; no front o gráfico vem antes da aba, porque a aba o consome; a verificação em navegador fecha.

## Fase 1: Backend - Modelo e Estorno Datado (TDD)
- [ ] **Task 1.1:** Escrever a suíte da transição para `REFUNDED` em `orders.service.spec.ts`: o pedido carimba `refundedAt` no instante da transição, `paidAt` continua intacto, e uma segunda chamada sobre pedido já estornado **não** reescreve a data — `transition` já é condicionada ao estado anterior, e o teste existe para que continue sendo.
- [ ] **Task 1.2:** Acrescentar `refundedAt DateTime?` ao model `Order` do `api/prisma/schema.prisma`, documentando no comentário que nulo é "não estornado" **ou** "estorno anterior a esta coluna", e que não há valor parcial (decisões 8 e 9).
- [ ] **Task 1.3:** Acrescentar o model `GatewayFeeRate` ao schema com os campos do `context.md`, documentando no comentário por que é append-only, por que o e-mail do autor é cópia e não relação, e por que não há recorte por parcela (decisões 6 e 7).
- [ ] **Task 1.4:** Acrescentar `@@index([status, paidAt])` a `Order` — a consulta desta spec filtra por período e status, e o índice existente `(userId, createdAt)` foi desenhado para o histórico de um aluno (decisão 12).
- [ ] **Task 1.5:** Escrever a migration correspondente, **sem** backfill de `refundedAt`: inventar data de estorno para pedido já estornado poria um lançamento em um mês por chute (decisão 8).
- [ ] **Task 1.6:** Implementar o carimbo de `refundedAt` em `orders.service.ts`, no mesmo ponto onde `revokeByOrder` já é chamado, e rodar `npm test` no `api/`.

## Fase 2: Backend - Taxas do Gateway (TDD)
- [ ] **Task 2.1:** Escrever a suíte do `GatewayFeesService` para a leitura: vigência corrente por método, histórico ordenado do mais recente para o mais antigo, e resolução da taxa aplicável a uma data — `validFrom` inclusivo, `validTo` exclusivo, e **nulo** (não zero) quando nenhuma vigência cobre a data (decisões 4 e 5).
- [ ] **Task 2.2:** Escrever a suíte do cadastro: uma vigência nova encerra a anterior do mesmo método gravando `validTo`; `validFrom` que cai dentro de uma vigência já encerrada é recusado; métodos diferentes não interferem um no outro; e nenhuma rota edita ou apaga linha existente (decisão 7).
- [ ] **Task 2.3:** Escrever a suíte do cálculo: `round(amountCents × percentBasisPoints ÷ 10000) + fixedCents`, meio para cima, **por pedido** — com um caso em que a soma das taxas por linha difere do percentual aplicado sobre o total do período, provando que a ordem importa.
- [ ] **Task 2.4:** Implementar `gateway-fees.service.ts` com leitura, cadastro e cálculo, e o DTO de cadastro com `method`, `percentBasisPoints`, `fixedCents`, `validFrom` e `note`, recusando valor fora do conjunto em vez de trocar pelo default, no critério do `ListAdminUsersDto`.
- [ ] **Task 2.5:** Escrever a suíte do `GET /admin/finance/fees` e do `POST /admin/finance/fees`: 401 sem token, 403 com papel `aluno`, e o `POST` gravando `createdById` e `createdByEmail` a partir do `@CurrentUser()`, e nunca do corpo da requisição — autoria que o cliente declara não é autoria (decisões 7 e 18).
- [ ] **Task 2.6:** Implementar o `AdminFinanceController` com as duas rotas de taxa, com `FirebaseAuthGuard`, `RolesGuard` e `@Roles('admin')` na **classe**, e registrá-lo no `PaymentsModule`.

## Fase 3: Backend - Resumo Financeiro (TDD)
- [ ] **Task 3.1:** Escrever a suíte dos indicadores do período: bruto (soma de `amountCents` dos pedidos `PAID` por `paidAt`), estornos (por `refundedAt`), taxa, líquido, ticket médio, contagem de pagos, pendentes e recusados. Incluir o caso da decisão 1 — cortesia e `LEGACY` em `ModuleAccess` **não** somam nada ao faturamento.
- [ ] **Task 3.2:** Escrever a suíte do líquido não apurado: período com pedido pago fora de qualquer vigência devolve o líquido como nulo, com a contagem de pedidos descobertos, e **nunca** um líquido igual ao bruto (decisão 5).
- [ ] **Task 3.3:** Escrever a suíte dos estornos sem data: pedido `REFUNDED` com `refundedAt` nulo entra no contador próprio e não aparece em nenhum ponto da série temporal (decisão 8).
- [ ] **Task 3.4:** Escrever a suíte da conversão por pessoa: um comprador que cancelou um PIX e pagou no cartão conta como **uma** pessoa convertida, e não como 50% — é o caso que a decisão 10 existe para cobrir.
- [ ] **Task 3.5:** Escrever a suíte da quebra por método e por módulo: o valor por módulo sai de `OrderItem.priceCents`, e um reajuste em `Module.priceCents` depois da compra **não** muda o faturamento do período (decisão 13); o título exibido é o atual, agrupado por `moduleId`.
- [ ] **Task 3.6:** Escrever a suíte da série temporal com fuso: uma venda às 21h de 30/09 em São Paulo cai em **setembro**, e não em outubro; granularidade `day` e `month`; e dias sem venda aparecem como ponto zero dentro do intervalo, para que o gráfico não invente continuidade entre datas distantes.
- [ ] **Task 3.7:** Escrever a suíte do período anterior: janela de igual duração imediatamente anterior, com as datas devolvidas na resposta; período anterior sem pedido devolve a comparação como nula, e não como alta de 100% (decisão 19).
- [ ] **Task 3.8:** Escrever a suíte do engajamento do que foi vendido: entre os acessos com `source = PURCHASE`, quantos compradores concluíram ao menos uma aula do módulo comprado e quantos nunca abriram nada; cortesia e `LEGACY` ficam fora do recorte (decisão 14).
- [ ] **Task 3.9:** Escrever o DTO do resumo com `from`, `to` e `granularity`, e a suíte de validação: `from` posterior a `to` é 400, granularidade fora de `day`/`month` é 400, e a ausência dos três cai nos últimos 30 dias — a mesma janela do `ACTIVITY_WINDOW_DAYS` da Spec 013.
- [ ] **Task 3.10:** Implementar `admin-finance.service.ts` e a rota `GET /admin/finance/summary`, com os indicadores em `groupBy`/`aggregate` e a série em `$queryRaw` com `AT TIME ZONE 'America/Sao_Paulo'` — nenhuma soma percorrendo pedidos em memória (decisões 11 e 12).
- [ ] **Task 3.11:** Rodar `npm test` no `api/` e corrigir regressões — `orders.service.ts` e o `PaymentsModule` são compartilhados com a Spec 014.

## Fase 4: Backend - Lista de Pedidos e Exportação (TDD)
- [ ] **Task 4.1:** Escrever a suíte da listagem: paginação, ordenação e busca no **servidor** (Spec 013, decisão 7), filtros por período, status e método, e a busca alcançando e-mail do comprador, `mpOrderId` e `mpPaymentId` — são esses três que o suporte tem em mãos quando alguém liga.
- [ ] **Task 4.2:** Escrever a suíte do conteúdo de cada linha: status, valor em centavos, método, parcelas, módulos do pedido e os ids do Mercado Pago — e **nenhum** dado de cartão ou CPF, que nem existem no banco (decisão 17).
- [ ] **Task 4.3:** Implementar `GET /admin/finance/orders`, com o DTO recusando valor fora do conjunto e com teto de `pageSize` no padrão da Spec 013 — quem quer tudo usa a exportação.
- [ ] **Task 4.4:** Escrever a suíte da exportação: o CSV repete o filtro corrente, sai sem paginação, usa `;` como separador (Excel pt-BR), cita campo com separador ou aspas, e não traz nenhuma coluna que a listagem não traz.
- [ ] **Task 4.5:** Implementar `GET /admin/finance/orders/export`, declarada **antes** de qualquer rota com parâmetro na classe, com anexo datado, no padrão de `GET /admin/users/export`.
- [ ] **Task 4.6:** Escrever a suíte de autorização de **todas** as rotas de `/admin/finance`: 401 sem token e 403 com papel `aluno`, uma asserção por rota, incluindo a exportação (decisão 18).
- [ ] **Task 4.7:** Rodar `npm test` no `api/` e corrigir regressões.

## Fase 5: Front - Gráfico e Serviço
- [ ] **Task 5.1:** Criar `shared/ui/time-series-chart/` em SVG inline, com eixos, grade, rótulos e tooltip no Design System, recebendo a série por `input()` e com `ChangeDetectionStrategy.OnPush` — sem dependência nova no `package.json` (decisão 16).
- [ ] **Task 5.2:** Dar ao gráfico o conteúdo acessível: tabela de dados equivalente, `role`/`aria` corretos no SVG e navegação por teclado entre os pontos; a mesma tabela é o que a tela mostra quando a série tem um ponto só.
- [ ] **Task 5.3:** Escrever `time-series-chart.spec.ts`: a série renderiza um elemento por ponto na ordem recebida, a tabela equivalente traz os mesmos valores, série vazia não desenha eixo nem ponto, e valor máximo zero não produz divisão por zero na escala.
- [ ] **Task 5.4:** Criar `core/services/admin-finance.service.ts` no padrão do `AdminUsersService`: `HttpClient`, `HttpParams`, signals de carregamento e erro, e os tipos do resumo, da lista, das taxas e do engajamento — com todo valor monetário tipado como centavos inteiros (decisão 2).
- [ ] **Task 5.5:** Escrever `admin-finance.service.spec.ts` com `HttpTestingController`: os query params montados a partir do filtro, o erro traduzido no padrão do serviço existente, e o download do CSV como blob.

## Fase 6: Front - Aba Financeiro
- [ ] **Task 6.1:** Acrescentar `financeiro` a `ADMIN_TABS` e ao tipo `AdminTab` em `admin-layout.ts`, entre `visao-geral` e `aulas`, e criar `features/admin/financeiro/` no padrão do `AdminAulas` — aba projetada, e não rota própria.
- [ ] **Task 6.2:** Montar o filtro de período e a granularidade com estado na URL por query param, no padrão que a Spec 013 estabeleceu, para que o recorte vire link compartilhável e sobreviva ao F5.
- [ ] **Task 6.3:** Montar os indicadores com `ui-stat-card`, cada um com a `caption` dizendo o critério — "de quem tentou comprar, quantos compraram", "líquido de estornos e da taxa do gateway" — e a seta de tendência só quando o período anterior tem pedido (decisões 10 e 19).
- [ ] **Task 6.4:** Exibir o líquido **não apurado** como estado próprio quando a API o devolver nulo, dizendo quantos pedidos ficaram fora de vigência e oferecendo o atalho para cadastrar a taxa — nunca um número (decisão 5).
- [ ] **Task 6.5:** Montar o gráfico de faturamento no período com o `ui-time-series-chart`, e a quebra por método e por módulo como listas com valor e quantidade, com o contador de cortesias separado e **sem** valor monetário (decisão 1).
- [ ] **Task 6.6:** Montar o bloco de engajamento do que foi vendido, com a definição escrita ao lado do número e a distinção entre "comprou e não abriu" e "comprou e estudou" (decisão 14).
- [ ] **Task 6.7:** Montar a lista de pedidos com busca, paginação servidor-side e o botão de exportar CSV, no padrão da tabela de alunos, exibindo `mpOrderId` e `mpPaymentId` de forma copiável.
- [ ] **Task 6.8:** Escrever o estado vazio: sem pedido no período, a tela diz que ainda não há vendas nesse intervalo e oferece ampliá-lo, sem gráfico reto no zero e sem "R$ 0,00" nos cards (decisão 15).
- [ ] **Task 6.9:** Montar a tela de taxas: histórico por método com autor e data, e o formulário reativo de nova vigência com percentual, valor fixo, data de início e observação — sem nenhum controle de editar ou apagar (decisão 7).
- [ ] **Task 6.10:** Escrever `admin-financeiro.spec.ts`: filtro refletido na URL, líquido não apurado renderizado como estado e não como número, estado vazio distinto do zero, cortesia fora do valor monetário, e a tela de taxas sem ação de edição.
- [ ] **Task 6.11:** Rodar `npm test` no `front/` e corrigir regressões — `admin-layout.ts` é casca compartilhada por todas as abas do painel.

## Fase 7: Verificação em Navegador
- [ ] **Task 7.1:** Subir o `api/` em `localhost:3000` e o `front/` em `localhost:4200`, com pedidos de teste em estados diferentes — pago, pendente, recusado e estornado — e ao menos uma cortesia concedida.
- [ ] **Task 7.2:** Abrir a aba Financeiro sem nenhuma taxa cadastrada e conferir que o líquido aparece como não apurado, com a contagem de pedidos descobertos, e que bruto e estornos continuam exibidos.
- [ ] **Task 7.3:** Cadastrar uma vigência, conferir o líquido calculado e cadastrar uma segunda a partir de uma data posterior: os pedidos anteriores continuam com a taxa antiga, e o histórico mostra as duas linhas com autor e data (decisões 4 e 7).
- [ ] **Task 7.4:** Conferir que a cortesia concedida não aparece em nenhum número monetário, e que ela aparece no contador não monetário (decisão 1).
- [ ] **Task 7.5:** Trocar período e granularidade, recarregar a página e confirmar que o recorte sobrevive pela URL; conferir a legenda do período anterior e que a seta some quando não há base de comparação.
- [ ] **Task 7.6:** Conferir a série com uma venda perto da meia-noite de São Paulo: o ponto cai no dia certo, e não no seguinte (decisão 11).
- [ ] **Task 7.7:** Exportar o CSV, abrir no Excel e conferir que as colunas não colapsam em uma só e que não há dado de cartão nem CPF em nenhuma delas (decisão 17).
- [ ] **Task 7.8:** Entrar com uma conta de papel `aluno` e confirmar que nenhuma rota de `/admin/finance` responde — incluindo a exportação e o `POST` de taxa —, e repetir sem token (decisão 18).
- [ ] **Task 7.9:** Conferir a hierarquia de cabeçalhos, a navegação por teclado da aba inteira e a tabela equivalente do gráfico com leitor de tela.
