# Tasks: Spec 019 - Preços Reais, Pacote de Lançamento e Lotes

Spec de `api/` (NestJS + Prisma + Jest) e `front/` (Angular standalone + signals + Tailwind). No backend a suíte vem **antes** da implementação, conforme `.claude/RULES.md`. Valem o Design System da Spec 002 e os componentes de `front/src/app/shared/ui/`. As decisões referenciadas estão no `context.md`.

Ordem das fases:
1. A correção de navegação vem primeiro. Ela é só de front, não depende de preço nenhum e resolve o problema que o aluno já tem hoje. As fases 4 e 5 usam o `?redirect=` que ela cria.
2. Depois vem o modelo, com os preços e o pacote no banco.
3. Em seguida, o backend de lotes e pedidos, onde mora a regra de dinheiro.
4. Então o front da loja e do `/planos`, que consome as rotas novas.
5. Depois, o painel.
6. A verificação em navegador fecha a spec.

## Fase 1: Front - Navegação do Aluno
- [ ] **Task 1.1:** Escrever `guest.guard.spec.ts` (decisões 16 e 17):
  - sem sessão, libera o `/login`;
  - aluno logado vai para `/ava`, e admin para `/admin`;
  - com `?redirect=/loja?pacote=imersao-rh-lancamento`, vai para esse destino;
  - `redirect` com `https://…`, `//…`, `/login` ou vazio é ignorado e cai em `homeUrl()`.
- [ ] **Task 1.2:** Criar em `core/guards/` uma função pura `safeRedirect(url: unknown): string | null`, usada pelo `guestGuard`, pelo login e pelo onboarding. A validação do `redirect` fica num lugar só, e um redirecionamento aberto não escapa por um dos três.
- [ ] **Task 1.3:** Implementar o `guestGuard` e aplicá-lo à rota `login` do `app.routes.ts`.
- [ ] **Task 1.4:** Alterar o `authGuard` para redirecionar a `/login?redirect=<url>` quando não há sessão, e cobrir isso no `auth.guard.spec.ts` sem mudar o mapa `REQUIRED_ROLE` (decisão 17).
- [ ] **Task 1.5:** No `Login`, navegar para `safeRedirect(redirect) ?? auth.homeUrl()` depois do sucesso. No `Onboarding`, levar o `redirect` adiante e usá-lo ao concluir. O `onboardingGuard` também precisa preservar a query ao mandar para `/onboarding` (decisão 17).
- [ ] **Task 1.6:** Mover as rotas da loja para dentro do `StudentLayout` (decisão 15):
  - criar um nó com `path: 'loja'`, `canActivate: [authGuard, onboardingGuard]` e o `StudentLayout` em `loadComponent`, com o `LOJA_ROUTES` em `loadChildren` como filhas;
  - a URL continua `/loja`, e o `authGuard` continua vendo `path === 'loja'`;
  - tirar da `Loja` o que duplicava o shell. O `ui-page-container` fica; o link "Abrir meu perfil" sai, porque a sidebar já leva lá.
- [ ] **Task 1.7:** Acrescentar à sidebar do `StudentLayout` o item "Comprar módulos" (`/loja`), depois de "Artigos". Se o conjunto de ícones da `ui-sidebar` não tiver um de carrinho ou sacola, acrescentar o SVG nele.
- [ ] **Task 1.8:** Dar ao `ui-nav-header` o `input()` `authenticated`, que troca o rótulo "Área do Aluno" por "Ir para o meu painel" sem mudar o destino `/login`. Ligar esse `input()` ao `auth.isAuthenticated()` nas páginas que usam a variante `landing`: landing, `/planos`, `/cursos/:slug`, `/certificado/verificar` e as páginas legais (decisão 16).
- [ ] **Task 1.9:** Cobrir nos specs:
  - `layout.spec.ts`: o item "Comprar módulos" existe;
  - teste de rotas: aluno sem acesso que abre `/ava` termina em `/loja`, renderizada dentro do shell, sem laço de redirecionamento;
  - `nav-header.spec.ts`: os dois rótulos.
- [ ] **Task 1.10:** Rodar `ng test` e `ng build` no `front/` e corrigir regressões.

## Fase 2: Backend - Modelo, Preços e Pacote (TDD)
- [ ] **Task 2.1:** Acrescentar ao `schema.prisma` os models `Bundle`, `BundleModule` e `BundleTier` e as colunas `bundleId?`, `bundleTierId?`, `bundleTitleSnapshot?` e `tierNameSnapshot?` em `Order` (decisões 2 e 6):
  - índice `@@index([bundleTierId, status])`;
  - `onDelete: Restrict` em `BundleModule.module` e em `Order.bundleTier`;
  - comentários no padrão do arquivo, explicando por que o lote vigente não é coluna (decisão 3) e por que `capacity` nulo é "sem limite".
- [ ] **Task 2.2:** Escrever a migration de schema, gerada pelo `prisma migrate dev`.
- [ ] **Task 2.3:** Escrever a migration de dados, com SQL à mão, no mesmo arquivo de migration ou num seguinte (decisão 1):
  - `UPDATE` do `price_cents` dos 12 módulos do curso `imersao-rh`, pela ordem, com `WHERE price_cents = 19900 OR price_cents IS NULL`;
  - `INSERT` do pacote `imersao-rh-lancamento`, dos 12 vínculos em `bundle_modules` e dos quatro lotes da tabela do `context.md`, com ids fixos e `ON CONFLICT DO NOTHING`, para que um ambiente semeado antes não duplique nada.
- [ ] **Task 2.4:** Escrever um teste de integração ou script de conferência, no padrão de `scripts/verify-lesson-migration.ts`, que prove em banco local:
  - só módulos em 19900 ou nulos mudam;
  - um módulo reajustado para outro valor fica intacto;
  - a soma dos 12 é 256400.
- [ ] **Task 2.5:** Atualizar o `seed.ts` (decisão 1):
  - `priceCents` real de cada módulo, só no `create`;
  - upsert do pacote por `slug` e dos lotes por `(bundleId, order)`, sem sobrescrever `priceCents` nem `capacity` no `update`;
  - vínculos do pacote criados se faltarem.
- [ ] **Task 2.6:** Rodar `prisma migrate dev` e `npm run db:seed` duas vezes seguidas no banco local, e conferir que a segunda execução não muda nada.

## Fase 3: Backend - Lotes, Oferta e Pedido de Pacote (TDD)
- [ ] **Task 3.1:** Escrever a suíte do `BundlesService` para o lote vigente (decisão 3):
  - sem vendas, o lote vigente é o Fundador;
  - com 20 vagas ocupadas, é o 2º Lote;
  - `PENDING` com `expiresAt` no futuro ocupa vaga; vencido não ocupa;
  - `PAID` e `REFUNDED` ocupam; `CANCELLED`, `EXPIRED` e `REJECTED` não;
  - o último lote sem `capacity` nunca esgota;
  - pacote inativo não tem lote vigente.
- [ ] **Task 3.2:** Escrever a suíte da oferta (decisões 4 e 10):
  - `remaining` do lote vigente;
  - `nextTier` com nome e preço, e nulo no último lote;
  - `modulesTotalCents` = 256400 com a tabela desta spec;
  - âncora nula quando algum módulo do pacote está sem preço.
- [ ] **Task 3.3:** Escrever a suíte do rateio (decisão 6), incluindo os valores do exemplo do `context.md` (R$ 68,34 e R$ 45,33 no Fundador):
  - a soma dos itens é igual ao total nos quatro lotes;
  - o item do módulo de R$ 297 é maior que o de R$ 197;
  - a sobra de centavos fica no último item;
  - nenhum item fica negativo ou zerado.
- [ ] **Task 3.4:** Implementar o `BundlesService` com a contagem de vagas em uma consulta agregada por lote, e nunca uma consulta por pedido.
- [ ] **Task 3.5:** Escrever a suíte do `CreateOrderDto`:
  - aceita `bundleSlug` ou `moduleIds`;
  - recusa os dois juntos e nenhum dos dois;
  - `installments` 12 é aceito, e 13 é recusado (decisões 5 e 9).
- [ ] **Task 3.6:** Implementar o DTO e passar `MAX_INSTALLMENTS` para 12. Conferir que o `GET /store/payment-config` devolve o mesmo número, lido da constante e não repetido.
- [ ] **Task 3.7:** Escrever a suíte do `OrdersService` para o pedido de pacote (decisões 5, 6 e 11):
  - o pedido é gravado com lote, snapshots, `amountCents` do lote e 12 itens rateados;
  - preço ou lote enviados no corpo são ignorados;
  - pacote inativo ou slug inexistente é recusado;
  - o pendente anterior do aluno é cancelado e libera a vaga;
  - a order enviada ao Mercado Pago leva o total do lote e os 12 itens.
- [ ] **Task 3.8:** Escrever o teste de concorrência contra o banco local: dois `POST /orders` simultâneos pela última vaga do Fundador resultam em um pedido no Fundador e outro no 2º Lote.
- [ ] **Task 3.9:** Implementar o caminho do pacote no `OrdersService`: a transação com `SELECT … FOR UPDATE` na linha do `Bundle` via `$queryRaw`, a contagem, a escolha do lote e o `INSERT`, tudo dentro da mesma transação. A chamada ao Mercado Pago fica **fora** dela, como no fluxo atual.
- [ ] **Task 3.10:** Escrever a suíte da aprovação e do estorno do pedido de pacote (decisão 7):
  - concede 6 meses nos 12 módulos;
  - módulo já ativo tem o prazo somado;
  - reprocessar a mesma order não soma de novo;
  - o estorno revoga os 12 e não libera a vaga.
- [ ] **Task 3.11:** Escrever a suíte das rotas:
  - `GET /store/offer` responde sem token, com `Cache-Control: public, max-age=30`, sem nenhum dado de aluno;
  - `GET /store/catalog` inclui o pacote e o lote vigente;
  - `GET /orders/:id` e `GET /orders/me` devolvem pacote e lote do pedido.
- [ ] **Task 3.12:** Implementar as rotas no `StoreController` e no `OrdersController`. A `GET /store/offer` fica fora do `FirebaseAuthGuard`, que hoje é aplicado na classe, e continua atrás do CORS da Spec 017.
- [ ] **Task 3.13:** Rodar `npm test` no `api/` e corrigir regressões. `orders.service.ts` e o `PaymentsModule` são compartilhados com as Specs 014 e 016.

## Fase 4: Front - Serviço e Loja
- [ ] **Task 4.1:** No `StoreService`:
  - tipos da oferta e do pacote, com valores em centavos inteiros;
  - seleção como união discriminada `{ kind: 'modules', ids } | { kind: 'bundle', slug }`;
  - `totalCents` como `computed()` sobre a seleção;
  - `loadOffer()` para a rota pública (decisão 12).
- [ ] **Task 4.2:** Cobrir no `store.service.spec.ts`:
  - marcar o pacote limpa os módulos, e marcar um módulo limpa o pacote;
  - o total segue a seleção;
  - o corpo do `POST /orders` leva `bundleSlug` ou `moduleIds`, e nunca preço.
- [ ] **Task 4.3:** Montar o card do pacote no topo da `/loja` (decisão 12):
  - lote vigente em selo, preço, âncora riscada e vagas;
  - lista "Você recebe";
  - aluno que já tem os 12 módulos ativos vê o pacote com o aviso de que a compra estende o acesso, e não escondido.
- [ ] **Task 4.4:** Montar o aviso de economia no resumo: com três ou mais módulos avulsos marcados e soma acima do lote vigente, mostrar a comparação e o botão "Trocar pelo pacote".
- [ ] **Task 4.5:** Ler `?pacote=` e `?modulo=` ao abrir a `/loja`, pré-marcar a seleção e remover o parâmetro da URL com `replaceUrl`.
- [ ] **Task 4.6:** Na `/loja/pagamento` e no `ui-order-summary`:
  - exibir pacote e lote no resumo;
  - quando o `POST /orders` devolver lote ou valor diferente do exibido, mostrar o valor novo e pedir confirmação antes de gerar o PIX ou cobrar o cartão (decisão 12).
- [ ] **Task 4.7:** Na `/loja/pedido/:orderId`, exibir "Pacote de Lançamento · Lote Fundador" no lugar dos 12 títulos.
- [ ] **Task 4.8:** Cobrir no `loja.spec.ts` a exclusividade da seleção, a pré-seleção pela URL e o aviso de economia no terceiro módulo com o Fundador.

## Fase 5: Front - `/planos` com a Oferta Real
- [ ] **Task 5.1:** Reduzir o `plans.mock.ts` (decisão 11):
  - ficam o card Empresas, o `PLANS_META` e a copy fixa do pacote (nome, chamada, linha de apoio, "Você recebe" e os emojis dos lotes por ordem);
  - saem os quatro planos sem produto e o `PLAN_BENEFITS`.
- [ ] **Task 5.2:** Montar o card do Pacote de Lançamento em destaque:
  - preço, lote, âncora e "em até 12x no cartão";
  - esqueleto de mesmo tamanho enquanto `GET /store/offer` não responde, lido só no navegador (`afterNextRender` ou `isPlatformBrowser`), para o prerender não gravar preço (decisão 10);
  - em erro, "Consulte o valor na loja", sem esconder a oferta.
- [ ] **Task 5.3:** Ligar o `ui-scarcity-banner` ao lote vigente: "Restam N vagas no Lote Fundador — depois, R$ 797". Sem banner quando o lote não tem `capacity`.
- [ ] **Task 5.4:** Montar a lista dos 12 módulos avulsos com título e preço, cada um com "Comprar este módulo" levando a `/loja?modulo=<ordem>`.
- [ ] **Task 5.5:** Manter o card Empresas e o bloco "Dúvidas". Remover o aviso sobre "Trilhas", o `ui-plan-card`, se ficar sem uso, e os imports órfãos.
- [ ] **Task 5.6:** Ligar o CTA do pacote a `/loja?pacote=imersao-rh-lancamento`. O visitante sem conta passa por `/login?redirect=…` (Fase 1).
- [ ] **Task 5.7:** Reescrever o `plans.spec.ts`:
  - esqueleto antes da resposta;
  - lote, preço, âncora e vagas depois dela;
  - sem banner no Preço oficial;
  - fallback em erro;
  - nenhum `[PREÇO]` nem placeholder na página;
  - os links dos CTAs.
- [ ] **Task 5.8:** Conferir no HTML prerenderizado do `/planos` que não há preço nem nome de lote, só o esqueleto e a copy fixa.

## Fase 6: Backend e Front - Painel (TDD no backend)
- [ ] **Task 6.1:** Escrever a suíte de `GET /admin/bundles/:slug` e `PATCH /admin/bundles/:slug/tiers/:tierId` (decisão 13):
  - 401 sem token e 403 com papel `aluno`;
  - lotes com vagas ocupadas e o vigente marcado;
  - recusa capacidade menor que as ocupadas, capacidade nula fora do último lote e preço nulo ou não positivo;
  - nome e ordem não são editáveis.
- [ ] **Task 6.2:** Implementar o controller admin do pacote com `FirebaseAuthGuard`, `RolesGuard` e `@Roles('admin')` na classe, e registrá-lo no `PaymentsModule`.
- [ ] **Task 6.3:** Escrever a suíte da listagem de finanças para pedido de pacote: a linha traz pacote e lote. O CSV da Spec 016 ganha as duas colunas, e totais e líquido não mudam (decisão 14).
- [ ] **Task 6.4:** Implementar a mudança em `admin-finance.service.ts` e rodar `npm test` no `api/`.
- [ ] **Task 6.5:** No front, acrescentar à aba "Gestão de Aulas" o bloco "Pacote de Lançamento", com a tabela de lotes, a edição de preço e de vagas, o vigente destacado e o erro da API exibido no campo.
- [ ] **Task 6.6:** Na aba Financeiro, exibir "Pacote de Lançamento · Lote Fundador" na coluna de módulos dos pedidos de pacote.
- [ ] **Task 6.7:** Cobrir as duas mudanças nos specs do admin e rodar `ng test` e `ng build`.

## Fase 7: Verificação em Navegador
- [ ] **Task 7.1:** Aplicar as migrations e o seed no banco local, subir o `api/` em `localhost:3000` e o `front/` em `localhost:4200`.
- [ ] **Task 7.2:** Com um aluno que tem acesso parcial:
  - trilha → módulo trancado → `/loja` com sidebar e cabeçalho → volta ao Hub pela sidebar, sem digitar URL;
  - "Comprar módulos" na sidebar abre a loja.
- [ ] **Task 7.3:** Com o aluno logado, abrir a landing, o `/planos` e uma página legal: o botão diz "Ir para o meu painel" e leva ao `/ava` sem o formulário de login. Repetir com o admin, que vai ao `/admin`.
- [ ] **Task 7.4:** Em janela anônima: `/planos` → "Garantir minha vaga" → login → loja com o pacote marcado. Repetir com uma conta nova, que passa pelo onboarding e termina na mesma loja com o pacote marcado.
- [ ] **Task 7.5:** Testar `/login?redirect=https://example.com` e `/login?redirect=//example.com` logado e deslogado: nenhum dos dois sai do site.
- [ ] **Task 7.6:** No `/planos`, conferir o esqueleto, o preço do Fundador, a âncora de R$ 2.564,00, "Restam 20 vagas" e a lista de módulos com os preços da tabela. Em mobile, tablet e desktop, sem salto de layout quando o preço chega.
- [ ] **Task 7.7:** No painel, baixar a capacidade do Fundador para o número de vagas já ocupadas e conferir que `/planos` e `/loja` passam a mostrar o 2º Lote a R$ 797 em até 30 s. Depois, restaurar para 20.
- [ ] **Task 7.8:** Comprar o pacote em sandbox por PIX e por cartão:
  - o pedido sai no lote vigente com o valor do lote;
  - o cartão oferece até 12x com o valor que o Mercado Pago devolve;
  - aprovado, os 12 módulos abrem na trilha com 6 meses;
  - a vaga aparece como ocupada na oferta e no painel;
  - a aba Financeiro mostra "Pacote de Lançamento · Lote …".
- [ ] **Task 7.9:** Abrir o PIX do pacote, deixar expirar (ou cancelar gerando outro pedido) e conferir que a vaga volta a ficar livre.
- [ ] **Task 7.10:** Conferir a hierarquia de cabeçalhos do `/planos` e da `/loja`, a navegação por teclado da seleção exclusiva e o anúncio do valor alterado para leitor de tela.
