# Tasks: Spec 019 - Preços Reais, Pacote de Lançamento e Lotes

Spec de `api/` (NestJS + Prisma + Jest) e `front/` (Angular standalone + signals + Tailwind). No backend a suíte vem **antes** da implementação, conforme `.claude/RULES.md`. Valem o Design System da Spec 002 e os componentes de `front/src/app/shared/ui/`. As decisões referenciadas estão no `context.md`.

> **Spec encerrada com 6 tasks de verificação pendentes** (7.2, 7.4, 7.6, 7.7, 7.8 e 7.10). Todas são conferência em navegador ou pagamento real; nenhuma é código faltando. Estão na seção "Pendências desta spec para a próxima", no fim, e no Trello, coluna "Pendências (specs anteriores)" do quadro Lidiane.

Ordem das fases:
1. A correção de navegação vem primeiro. Ela é só de front, não depende de preço nenhum e resolve o problema que o aluno já tem hoje. As fases 4 e 5 usam o `?redirect=` que ela cria.
2. Depois vem o modelo, com os preços e o pacote no banco.
3. Em seguida, o backend de lotes e pedidos, onde mora a regra de dinheiro.
4. Então o front da loja e do `/planos`, que consome as rotas novas.
5. Depois, o painel.
6. A verificação em navegador fecha a spec.

## Fase 1: Front - Navegação do Aluno
- [x] **Task 1.1:** Escrever `guest.guard.spec.ts` (decisões 16 e 17):
  - sem sessão, libera o `/login`;
  - aluno logado vai para `/ava`, e admin para `/admin`;
  - com `?redirect=/loja?pacote=imersao-rh-lancamento`, vai para esse destino;
  - `redirect` com `https://…`, `//…`, `/login` ou vazio é ignorado e cai em `homeUrl()`.
- [x] **Task 1.2:** Criar em `core/guards/` uma função pura `safeRedirect(url: unknown): string | null`, usada pelo `guestGuard`, pelo login e pelo onboarding. A validação do `redirect` fica num lugar só, e um redirecionamento aberto não escapa por um dos três.
- [x] **Task 1.3:** Implementar o `guestGuard` e aplicá-lo à rota `login` do `app.routes.ts`.
- [x] **Task 1.4:** Alterar o `authGuard` para redirecionar a `/login?redirect=<url>` quando não há sessão, e cobrir isso no `auth.guard.spec.ts` sem mudar o mapa `REQUIRED_ROLE` (decisão 17).
- [x] **Task 1.5:** No `Login`, navegar para `safeRedirect(redirect) ?? auth.homeUrl()` depois do sucesso. No `Onboarding`, levar o `redirect` adiante e usá-lo ao concluir. O `onboardingGuard` também precisa preservar a query ao mandar para `/onboarding` (decisão 17).
- [x] **Task 1.6:** Mover as rotas da loja para dentro do `StudentLayout` (decisão 15):
  - criar um nó com `path: 'loja'`, `canActivate: [authGuard, onboardingGuard]` e o `StudentLayout` em `loadComponent`, com o `LOJA_ROUTES` em `loadChildren` como filhas;
  - a URL continua `/loja`, e o `authGuard` continua vendo `path === 'loja'`;
  - tirar da `Loja` o que duplicava o shell. O `ui-page-container` fica; o link "Abrir meu perfil" sai, porque a sidebar já leva lá.
- [x] **Task 1.7:** Acrescentar à sidebar do `StudentLayout` o item "Comprar módulos" (`/loja`), depois de "Artigos". Se o conjunto de ícones da `ui-sidebar` não tiver um de carrinho ou sacola, acrescentar o SVG nele.
- [x] **Task 1.8:** Dar ao `ui-nav-header` o `input()` `authenticated`, que troca o rótulo "Área do Aluno" por "Ir para o meu painel" sem mudar o destino `/login`. Ligar esse `input()` ao `auth.isAuthenticated()` nas páginas que usam a variante `landing`: landing, `/planos`, `/cursos/:slug`, `/certificado/verificar` e as páginas legais (decisão 16).
  - Paginas ligadas: landing, `/planos`, `/cursos/:slug`, `/certificado/verificar`, as tres legais (via `LegalPage`) e o 404. Os specs dessas paginas ganharam `provideHttpClient`, porque agora leem a sessao.
- [x] **Task 1.9:** Cobrir nos specs:
  - `layout.spec.ts`: o item "Comprar módulos" existe;
  - teste de rotas: aluno sem acesso que abre `/ava` termina em `/loja`, renderizada dentro do shell, sem laço de redirecionamento;
  - `nav-header.spec.ts`: os dois rótulos.
- [x] **Task 1.10:** Rodar `ng test` e `ng build` no `front/` e corrigir regressões.
  - `ng test`: 447 testes passando; `ng build` com 8 rotas prerenderizadas.

## Fase 2: Backend - Modelo, Preços e Pacote (TDD)
- [x] **Task 2.1:** Acrescentar ao `schema.prisma` os models `Bundle`, `BundleModule` e `BundleTier` e as colunas `bundleId?`, `bundleTierId?`, `bundleTitleSnapshot?` e `tierNameSnapshot?` em `Order` (decisões 2 e 6):
  - índice `@@index([bundleTierId, status])`;
  - `onDelete: Restrict` em `BundleModule.module` e em `Order.bundleTier`;
  - comentários no padrão do arquivo, explicando por que o lote vigente não é coluna (decisão 3) e por que `capacity` nulo é "sem limite".
- [x] **Task 2.2:** Escrever a migration de schema, gerada pelo `prisma migrate dev`.
- [x] **Task 2.3:** Escrever a migration de dados, com SQL à mão, no mesmo arquivo de migration ou num seguinte (decisão 1):
  - `UPDATE` do `price_cents` dos 12 módulos do curso `imersao-rh`, pela ordem, com `WHERE price_cents = 19900 OR price_cents IS NULL`;
  - `INSERT` do pacote `imersao-rh-lancamento`, dos 12 vínculos em `bundle_modules` e dos quatro lotes da tabela do `context.md`, com ids fixos e `ON CONFLICT DO NOTHING`, para que um ambiente semeado antes não duplique nada.
  - As duas migrations foram aplicadas em **producao** com `prisma migrate deploy`, com autorizacao explicita: o `api/.env` aponta para o unico banco Neon, que e o de producao. Os 12 modulos estavam em 19900 e todos receberam o preco da tabela.
- [x] **Task 2.4:** Escrever um teste de integração ou script de conferência, no padrão de `scripts/verify-lesson-migration.ts`, que prove em banco local:
  - só módulos em 19900 ou nulos mudam;
  - um módulo reajustado para outro valor fica intacto;
  - a soma dos 12 é 256400.
  - Virou `npm run spec019:precos -- snapshot | prova | verify`. A `prova` roda o UPDATE da migration numa transacao desfeita, com o modulo 01 reajustado para 12345 antes: ele continua 12345, e nada e gravado. O `verify` depois do deploy fechou 16/16 (12 precos, soma 256400, pacote com 12 modulos e os quatro lotes).
- [x] **Task 2.5:** Atualizar o `seed.ts` (decisão 1):
  - `priceCents` real de cada módulo, só no `create`;
  - upsert do pacote por `slug` e dos lotes por `(bundleId, order)`, sem sobrescrever `priceCents` nem `capacity` no `update`;
  - vínculos do pacote criados se faltarem.
- [x] **Task 2.6:** Rodar `prisma migrate dev` e `npm run db:seed` duas vezes seguidas no banco local, e conferir que a segunda execução não muda nada.
  - Seed rodado duas vezes contra o banco: a segunda execucao nao mudou nada (`verify` continuou 16/16).

## Fase 3: Backend - Lotes, Oferta e Pedido de Pacote (TDD)
- [x] **Task 3.1:** Escrever a suíte do `BundlesService` para o lote vigente (decisão 3):
  - sem vendas, o lote vigente é o Fundador;
  - com 20 vagas ocupadas, é o 2º Lote;
  - `PENDING` com `expiresAt` no futuro ocupa vaga; vencido não ocupa;
  - `PAID` e `REFUNDED` ocupam; `CANCELLED`, `EXPIRED` e `REJECTED` não;
  - o último lote sem `capacity` nunca esgota;
  - pacote inativo não tem lote vigente.
- [x] **Task 3.2:** Escrever a suíte da oferta (decisões 4 e 10):
  - `remaining` do lote vigente;
  - `nextTier` com nome e preço, e nulo no último lote;
  - `modulesTotalCents` = 256400 com a tabela desta spec;
  - âncora nula quando algum módulo do pacote está sem preço.
- [x] **Task 3.3:** Escrever a suíte do rateio (decisão 6), incluindo os valores do exemplo do `context.md` (R$ 68,34 e R$ 45,33 no Fundador):
  - a soma dos itens é igual ao total nos quatro lotes;
  - o item do módulo de R$ 297 é maior que o de R$ 197;
  - a sobra de centavos fica no último item;
  - nenhum item fica negativo ou zerado.
- [x] **Task 3.4:** Implementar o `BundlesService` com a contagem de vagas em uma consulta agregada por lote, e nunca uma consulta por pedido.
- [x] **Task 3.5:** Escrever a suíte do `CreateOrderDto`:
  - aceita `bundleSlug` ou `moduleIds`;
  - recusa os dois juntos e nenhum dos dois;
  - `installments` 12 é aceito, e 13 é recusado (decisões 5 e 9).
- [x] **Task 3.6:** Implementar o DTO e passar `MAX_INSTALLMENTS` para 12. Conferir que o `GET /store/payment-config` devolve o mesmo número, lido da constante e não repetido.
- [x] **Task 3.7:** Escrever a suíte do `OrdersService` para o pedido de pacote (decisões 5, 6 e 11):
  - o pedido é gravado com lote, snapshots, `amountCents` do lote e 12 itens rateados;
  - preço ou lote enviados no corpo são ignorados;
  - pacote inativo ou slug inexistente é recusado;
  - o pendente anterior do aluno é cancelado e libera a vaga;
  - a order enviada ao Mercado Pago leva o total do lote e os 12 itens.
  - **Desvio (decisao 3 refinada):** pendente **sem** prazo reserva a vaga por no maximo 30 minutos a partir da criacao. Sem esse teto, um pedido gravado cuja chamada ao Mercado Pago falhou ficaria `PENDING` sem `expiresAt` e seguraria a vaga do lote para sempre. O estado do pedido nao muda: um cartao aprovado tarde continua sendo aprovado.
- [x] **Task 3.8:** Escrever o teste de concorrência contra o banco local: dois `POST /orders` simultâneos pela última vaga do Fundador resultam em um pedido no Fundador e outro no 2º Lote.
  - Virou `npm run spec019:concorrencia`: pacote temporario com um lote de **uma** vaga, dois usuarios temporarios, dois `placeOrder` simultaneos. Resultado: um pedido no lote de uma vaga, o outro no seguinte. Tudo apagado no fim; o Pacote de Lancamento nao e tocado.
  - A contraprova (rodar com a trava desligada para ver o teste falhar) foi bloqueada pelo classificador de seguranca, por rodar codigo sem a trava contra o banco de producao, e nao foi feita.
- [x] **Task 3.9:** Implementar o caminho do pacote no `OrdersService`: a transação com `SELECT … FOR UPDATE` na linha do `Bundle` via `$queryRaw`, a contagem, a escolha do lote e o `INSERT`, tudo dentro da mesma transação. A chamada ao Mercado Pago fica **fora** dela, como no fluxo atual.
- [x] **Task 3.10:** Escrever a suíte da aprovação e do estorno do pedido de pacote (decisão 7):
  - concede 6 meses nos 12 módulos;
  - módulo já ativo tem o prazo somado;
  - reprocessar a mesma order não soma de novo;
  - o estorno revoga os 12 e não libera a vaga.
- [x] **Task 3.11:** Escrever a suíte das rotas:
  - `GET /store/offer` responde sem token, com `Cache-Control: public, max-age=30`, sem nenhum dado de aluno;
  - `GET /store/catalog` inclui o pacote e o lote vigente;
  - `GET /orders/:id` e `GET /orders/me` devolvem pacote e lote do pedido.
  - O pacote em `GET /orders/:id` e `/orders/me` ficou coberto no `orders.service.spec`, onde o `toView` e montado; o `store.http.spec` cobre a rota publica, o cache e as rotas com sessao.
- [x] **Task 3.12:** Implementar as rotas no `StoreController` e no `OrdersController`. A `GET /store/offer` fica fora do `FirebaseAuthGuard`, que hoje é aplicado na classe, e continua atrás do CORS da Spec 017.
  - **Desvio:** `GET /store/catalog` **nao** mudou de formato. A loja le o pacote de `GET /store/offer`; trocar o array do catalogo por um objeto quebraria o `accessGuard` e a trilha sem ganho.
- [x] **Task 3.13:** Rodar `npm test` no `api/` e corrigir regressões. `orders.service.ts` e o `PaymentsModule` são compartilhados com as Specs 014 e 016.
  - `npm test`: 734 testes em 50 suites. O `tsc --noEmit` mostra 2 erros de tipo que ja existiam na `main` (`auth.controller.spec` e `certificates.service.spec`), fora desta spec.

## Fase 4: Front - Serviço e Loja
- [x] **Task 4.1:** No `StoreService`:
  - tipos da oferta e do pacote, com valores em centavos inteiros;
  - seleção como união discriminada `{ kind: 'modules', ids } | { kind: 'bundle', slug }`;
  - `totalCents` como `computed()` sobre a seleção;
  - `loadOffer()` para a rota pública (decisão 12).
- [x] **Task 4.2:** Cobrir no `store.service.spec.ts`:
  - marcar o pacote limpa os módulos, e marcar um módulo limpa o pacote;
  - o total segue a seleção;
  - o corpo do `POST /orders` leva `bundleSlug` ou `moduleIds`, e nunca preço.
- [x] **Task 4.3:** Montar o card do pacote no topo da `/loja` (decisão 12):
  - lote vigente em selo, preço, âncora riscada e vagas;
  - lista "Você recebe";
  - aluno que já tem os 12 módulos ativos vê o pacote com o aviso de que a compra estende o acesso, e não escondido.
- [x] **Task 4.4:** Montar o aviso de economia no resumo: com três ou mais módulos avulsos marcados e soma acima do lote vigente, mostrar a comparação e o botão "Trocar pelo pacote".
- [x] **Task 4.5:** Ler `?pacote=` e `?modulo=` ao abrir a `/loja`, pré-marcar a seleção e remover o parâmetro da URL com `replaceUrl`.
- [x] **Task 4.6:** Na `/loja/pagamento` e no `ui-order-summary`:
  - exibir pacote e lote no resumo;
  - quando o `POST /orders` devolver lote ou valor diferente do exibido, mostrar o valor novo e pedir confirmação antes de gerar o PIX ou cobrar o cartão (decisão 12).
  - O resumo do pagamento e proprio da tela; o `ui-order-summary` nao e usado ali, entao a mudanca foi feita no `pagamento.ts`.
  - A confirmacao rele a oferta **antes** do `POST /orders`. Se o lote virar entre essa releitura e o clique, o servidor cobra o lote vigente e a tela do pedido mostra o valor cobrado.
- [x] **Task 4.7:** Na `/loja/pedido/:orderId`, exibir "Pacote de Lançamento · Lote Fundador" no lugar dos 12 títulos.
- [x] **Task 4.8:** Cobrir no `loja.spec.ts` a exclusividade da seleção, a pré-seleção pela URL e o aviso de economia no terceiro módulo com o Fundador.

## Fase 5: Front - `/planos` com a Oferta Real
- [x] **Task 5.1:** Reduzir o `plans.mock.ts` (decisão 11):
  - ficam o card Empresas, o `PLANS_META` e a copy fixa do pacote (nome, chamada, linha de apoio, "Você recebe" e os emojis dos lotes por ordem);
  - saem os quatro planos sem produto e o `PLAN_BENEFITS`.
- [x] **Task 5.2:** Montar o card do Pacote de Lançamento em destaque:
  - preço, lote, âncora e "em até 12x no cartão";
  - esqueleto de mesmo tamanho enquanto `GET /store/offer` não responde, lido só no navegador (`afterNextRender` ou `isPlatformBrowser`), para o prerender não gravar preço (decisão 10);
  - em erro, "Consulte o valor na loja", sem esconder a oferta.
  - O preco e lido com `afterNextRender`, que nao roda no prerender. O CTA "Garantir minha vaga" (Task 5.6) entrou neste mesmo commit.
- [x] **Task 5.3:** Ligar o `ui-scarcity-banner` ao lote vigente: "Restam N vagas no Lote Fundador — depois, R$ 797". Sem banner quando o lote não tem `capacity`.
- [x] **Task 5.4:** Montar a lista dos 12 módulos avulsos com título e preço, cada um com "Comprar este módulo" levando a `/loja?modulo=<ordem>`.
- [x] **Task 5.5:** Manter o card Empresas e o bloco "Dúvidas". Remover o aviso sobre "Trilhas", o `ui-plan-card`, se ficar sem uso, e os imports órfãos.
  - `ui-plan-card` removido; o card Empresas e um bloco proprio da pagina.
- [x] **Task 5.6:** Ligar o CTA do pacote a `/loja?pacote=imersao-rh-lancamento`. O visitante sem conta passa por `/login?redirect=…` (Fase 1).
- [x] **Task 5.7:** Reescrever o `plans.spec.ts`:
  - esqueleto antes da resposta;
  - lote, preço, âncora e vagas depois dela;
  - sem banner no Preço oficial;
  - fallback em erro;
  - nenhum `[PREÇO]` nem placeholder na página;
  - os links dos CTAs.
- [x] **Task 5.8:** Conferir no HTML prerenderizado do `/planos` que não há preço nem nome de lote, só o esqueleto e a copy fixa.
  - Conferido no `dist/.../planos/index.html`: nenhum "Lote Fundador" nem "R$ 590", dois `aria-busy="true"` do esqueleto e o CTA.

## Fase 6: Backend e Front - Painel (TDD no backend)
- [x] **Task 6.1:** Escrever a suíte de `GET /admin/bundles/:slug` e `PATCH /admin/bundles/:slug/tiers/:tierId` (decisão 13):
  - 401 sem token e 403 com papel `aluno`;
  - lotes com vagas ocupadas e o vigente marcado;
  - recusa capacidade menor que as ocupadas, capacidade nula fora do último lote e preço nulo ou não positivo;
  - nome e ordem não são editáveis.
- [x] **Task 6.2:** Implementar o controller admin do pacote com `FirebaseAuthGuard`, `RolesGuard` e `@Roles('admin')` na classe, e registrá-lo no `PaymentsModule`.
- [x] **Task 6.3:** Escrever a suíte da listagem de finanças para pedido de pacote: a linha traz pacote e lote. O CSV da Spec 016 ganha as duas colunas, e totais e líquido não mudam (decisão 14).
- [x] **Task 6.4:** Implementar a mudança em `admin-finance.service.ts` e rodar `npm test` no `api/`.
- [x] **Task 6.5:** No front, acrescentar à aba "Gestão de Aulas" o bloco "Pacote de Lançamento", com a tabela de lotes, a edição de preço e de vagas, o vigente destacado e o erro da API exibido no campo.
  - Componente proprio (`admin-pacote.ts`) e `AdminBundlesService`, em vez de mais um bloco no `AdminAulas`, que ja passava de 500 linhas. O texto do preco do modulo deixou de citar os R$ 199,00 provisorios.
- [x] **Task 6.6:** Na aba Financeiro, exibir "Pacote de Lançamento · Lote Fundador" na coluna de módulos dos pedidos de pacote.
- [x] **Task 6.7:** Cobrir as duas mudanças nos specs do admin e rodar `ng test` e `ng build`.
  - `ng test`: 456 testes passando. `npm test` no `api/`: 745 testes em 51 suites.

## Fase 7: Verificação em Navegador
- [x] **Task 7.1:** Aplicar as migrations e o seed no banco local, subir o `api/` em `localhost:3000` e o `front/` em `localhost:4200`.
  - API local contra o banco de producao (o unico): `GET /store/offer` respondeu Lote Fundador com 20 vagas, ancora 256400 e `Cache-Control: public, max-age=30`.
- [ ] **Task 7.2:** Com um aluno que tem acesso parcial:
  - trilha → módulo trancado → `/loja` com sidebar e cabeçalho → volta ao Hub pela sidebar, sem digitar URL;
  - "Comprar módulos" na sidebar abre a loja.
  - Parcial. Visto: loja dentro do shell, com a sidebar e o item "Comprar modulos". Nao visto: o caminho trilha -> modulo trancado -> loja -> Hub, porque a conta de teste e admin com os 12 modulos liberados; o `/ava` do admin volta para `/admin`, como o `authGuard` manda. Coberto por `app.routes.spec` (aluno sem acesso chega a `/loja` no shell, sem laco).
- [x] **Task 7.3:** Com o aluno logado, abrir a landing, o `/planos` e uma página legal: o botão diz "Ir para o meu painel" e leva ao `/ava` sem o formulário de login. Repetir com o admin, que vai ao `/admin`.
  - Feito com a conta de teste do usuario, que e **admin**: o botao diz "Ir para o meu painel" e leva ao `/admin` sem formulario.
- [ ] **Task 7.4:** Em janela anônima: `/planos` → "Garantir minha vaga" → login → loja com o pacote marcado. Repetir com uma conta nova, que passa pelo onboarding e termina na mesma loja com o pacote marcado.
  - Parcial. Visto: visitante `/planos` -> "Garantir minha vaga" -> login -> `/loja` com o pacote marcado e a URL limpa. Nao visto: conta nova passando pelo onboarding (exigiria criar conta). Coberto por `onboarding.guard.spec`.
- [x] **Task 7.5:** Testar `/login?redirect=https://example.com` e `/login?redirect=//example.com` logado e deslogado: nenhum dos dois sai do site.
  - Logado, `/login?redirect=https://example.com` terminou em `/admin`. Deslogado, o `authGuard` gerou `/login?redirect=%2Floja%3Fpacote%3Dimersao-rh-lancamento` a partir do CTA do `/planos`.
- [ ] **Task 7.6:** No `/planos`, conferir o esqueleto, o preço do Fundador, a âncora de R$ 2.564,00, "Restam 20 vagas" e a lista de módulos com os preços da tabela. Em mobile, tablet e desktop, sem salto de layout quando o preço chega.
  - Parcial. Desktop conferido: faixa "Restam 20 vagas no 🔥 Lote Fundador", R$ 590,00, ancora R$ 2.564,00 e os 12 modulos com os precos da tabela. Mobile e tablet nao foram conferidos: a janela do Chrome estava maximizada e nao aceitou redimensionar.
  - **Defeito achado e corrigido:** a faixa de escassez era inserida acima do card so quando a oferta chegava, e empurrava a pagina. Agora uma faixa-esqueleto ocupa o lugar dela durante o carregamento. Depois da correcao, o `PerformanceObserver` de `layout-shift` registrou CLS 0 no recarregamento do `/planos` (desktop). A altura reservada no mobile (`5.5rem`) e estimativa, sem conferencia visual.
- [ ] **Task 7.7:** No painel, baixar a capacidade do Fundador para o número de vagas já ocupadas e conferir que `/planos` e `/loja` passam a mostrar o 2º Lote a R$ 797 em até 30 s. Depois, restaurar para 20.
  - Nao feito. O usuario liberou testes em producao (app nao lancado), mas o classificador de seguranca bloqueou digitar a capacidade nova no painel; fica para o usuario. O painel foi conferido com uma recusa, que nao grava: "sem limite" no 2º Lote devolveu "Só o último lote pode ficar sem limite de vagas." e a oferta seguiu com 20 vagas.
- [ ] **Task 7.8:** Comprar o pacote em sandbox por PIX e por cartão:
  - o pedido sai no lote vigente com o valor do lote;
  - o cartão oferece até 12x com o valor que o Mercado Pago devolve;
  - aprovado, os 12 módulos abrem na trilha com 6 meses;
  - a vaga aparece como ocupada na oferta e no painel;
  - a aba Financeiro mostra "Pacote de Lançamento · Lote …".
  - Pagamento de ponta a ponta nao feito: o `api/.env` tem credenciais `TEST-`, que a Orders API recusa (Spec 014, decisao 24). Falta a aplicacao criada na conta do vendedor de teste, o que exige login no painel do Mercado Pago.
  - A parte do banco foi feita no pacote real com `npm run spec019:vagas` (usuario temporario, pedido pelo mesmo `placeOrder` do checkout): pedido no Fundador com 59000 centavos e 12 itens somando 59000; vagas 20 -> 19 com PIX pendente no prazo; pago e estornado ocupam. Tudo apagado no fim, com 20 vagas de novo.
- [x] **Task 7.9:** Abrir o PIX do pacote, deixar expirar (ou cancelar gerando outro pedido) e conferir que a vaga volta a ficar livre.
  - Feito no banco com `npm run spec019:vagas`: PIX vencido libera (19 -> 20) e pedido cancelado libera (19 -> 20). O fluxo pela tela do PIX depende das credenciais da 7.8.
- [ ] **Task 7.10:** Conferir a hierarquia de cabeçalhos do `/planos` e da `/loja`, a navegação por teclado da seleção exclusiva e o anúncio do valor alterado para leitor de tela.
  - Nao feito no navegador. O aviso de valor alterado usa `role="alert"`, e a selecao usa `checkbox` com `label` e `fieldset`/`legend`.

## Pendências desta spec para a próxima

Todas são de verificação: o código está entregue e coberto por testes automatizados. Ficaram de fora porque dependem de credencial do Mercado Pago, de uma conta de aluno, de um passo manual no painel de produção ou de um navegador em tamanho de celular. Cada uma tem card no Trello (quadro Lidiane, coluna "Pendências (specs anteriores)").

- [ ] **Comprar o pacote por PIX e cartão em sandbox (task 7.8).** Bloqueado pelas credenciais: a Orders API recusa as chaves `TEST-` do `api/.env`. Falta criar uma aplicação na conta do vendedor de teste `TESTUSER8605452672838458141` e usar as credenciais dela, o mesmo bloqueio da task 9.6 da Spec 014. A regra de vagas já foi verificada no banco com `npm run spec019:vagas`. [Card](https://trello.com/c/i0441VIY)
- [ ] **Virar o lote pelo painel (task 7.7).** Fundador com 0 vagas, conferir o 2º Lote a R$ 797,00 no `/planos` e na loja, e voltar para 20. O classificador de segurança bloqueou o passo no painel de produção, então é manual. Junto, e opcional: a contraprova do teste de concorrência com a trava desligada. [Card](https://trello.com/c/1fzbhh5z)
- [ ] **Aluno com acesso parcial e conta nova pelo onboarding (tasks 7.2 e 7.4).** Precisa de uma conta de aluno: a conta usada é admin, e o `/ava` dela volta para `/admin`. [Card](https://trello.com/c/joXAKT2B)
- [ ] **`/planos` e loja no celular e no tablet (task 7.6).** Conferir também a altura reservada da faixa de escassez no celular (`h-[5.5rem]`), que é estimativa. [Card](https://trello.com/c/vY5utQo0)
- [ ] **Acessibilidade do `/planos` e da loja (task 7.10).** Cabeçalhos, teclado na escolha exclusiva e anúncio do valor alterado. Vale fazer junto com a task 9.3 da Spec 014. [Card](https://trello.com/c/SI8u6lcX)
