# Tasks: Spec 009 - SEO, Analytics e Conformidade (LGPD)

Spec front-only, em `front/` (Angular 20 standalone + signals + Tailwind), seguindo o Design System da Spec 002 e os componentes de `front/src/app/shared/ui/`. As fases estão na ordem imposta pela decisão 3 do `context.md` — **SSR → Conformidade → Analytics → SEO/Metadados** — e devem ser executadas nessa sequência: a Fase 4 depende do HTML prerenderizado da Fase 1, e a Fase 3 depende do portão de consentimento da Fase 2. As decisões referenciadas abaixo estão no `context.md`.

## Fase 1: Renderização Indexável (pré-requisito)
- [x] **Task 1.1:** Habilitar SSR no `front/` via `ng add @angular/ssr`, mantendo a configuração de build existente e o `provideRouter` atual de `app.config.ts` (decisão 1).
- [x] **Task 1.2:** Configurar **prerender das rotas públicas** — `/`, `/planos`, `/cursos/:slug` (alimentado pelos slugs de `core/mocks/courses.mock.ts`), `/login`, `/certificado/verificar`, as três rotas legais e a 404 — e garantir que `/ava`, `/admin`, `/onboarding` e `/checkout/**` fiquem **fora** do prerender, em CSR puro (decisões 2 e 8).
- [x] **Task 1.3:** Atualizar o `vercel.json` (`outputDirectory` e demais campos afetados pela nova estrutura de `dist/`) e confirmar que o deploy continua servindo o SPA nas rotas não prerenderizadas.
- [x] **Task 1.4:** Auditar o código existente quanto a acesso direto a `window`, `document` e `localStorage` fora de guarda de plataforma (`isPlatformBrowser` / `afterNextRender`), corrigindo o que quebrar no build de servidor — inclusive o `window.print()` do certificado (Spec 008) e o `authInterceptor`.
- [x] **Task 1.5:** Verificar o resultado: rodar o build de produção e conferir com `curl`/leitura do HTML gerado que `/` e `/cursos/:slug` chegam com conteúdo e `<head>` preenchidos **antes** de qualquer JavaScript rodar.

## Fase 2: Conformidade Legal e Consentimento (LGPD)
- [ ] **Task 2.1:** Criar `core/services/consent.service.ts` (`providedIn: 'root'`, estado em signals) persistindo em `localStorage` a escolha (`accepted` / `rejected`), o **timestamp** e a **versão da política** vigente, com constante de versão exportada; consentimento de versão anterior é tratado como inexistente (decisão 9).
- [ ] **Task 2.2:** Expor no serviço os `computed()` de que a Fase 3 depende — `hasDecision`, `analyticsAllowed` — e os métodos `accept()`, `reject()` e `reopen()`, além do acesso seguro ao `localStorage` sob `isPlatformBrowser` (decisão 10 e Task 1.4).
- [ ] **Task 2.3:** Criar o componente de banner de consentimento em `shared/ui/`, com as ações **Aceitar** e **Recusar**, link para a "Política de Cookies" e acessibilidade de diálogo (foco, `role`, dispensa por teclado) — sem `ngClass`/`ngStyle`, usando `class`/`style` bindings (decisão 9).
- [ ] **Task 2.4:** Montar o banner uma única vez em `app.ts`, acima do `router-outlet`, exibindo-o apenas quando não houver decisão válida registrada, para que sobreviva à navegação entre rotas.
- [ ] **Task 2.5:** Criar as três rotas públicas com texto placeholder em `features/legal/`: `/termos-de-uso`, `/politica-de-privacidade` e `/politica-de-cookies`, lazy e fora dos guards, irmãs de `/planos` em `app.routes.ts`.
- [ ] **Task 2.6:** Estruturar as três páginas com um único `<h1>`, seções em `<h2>` e o corpo em `ui-placeholder-text` marcado como pendente de revisão jurídica; a Política de Privacidade inclui a seção de **Encarregado/DPO e canal do titular**, também em placeholder (decisão 11).
- [ ] **Task 2.7:** Adicionar no `shared/ui/footer` os links para as três páginas legais e o acionador permanente **"Preferências de cookies"**, que reabre o banner via `reopen()` (decisão 10).
- [ ] **Task 2.8:** Decidir e aplicar a exibição do rodapé (ou de um bloco equivalente de links legais) nos layouts de aluno e admin, que hoje não renderizam `ui-footer` — as páginas legais precisam ser alcançáveis de dentro da área logada.
- [ ] **Task 2.9:** Escrever o `.spec.ts` do `ConsentService`: primeira visita sem decisão, aceite persistido com data e versão, recusa persistida, consentimento de versão antiga invalidado e revogação após aceite.

## Fase 3: Analytics Data Layer
- [ ] **Task 3.1:** Adicionar `gtmId: ''` e `ga4Id: ''` em `environment.ts` e `environment.development.ts`, documentando no próprio arquivo que valor vazio significa no-op silencioso e que estes campos não são segredo (decisão 5).
- [ ] **Task 3.2:** Criar `core/services/analytics.service.ts` com a API de disparo tipada (nome do evento + payload), inicializando `window.dataLayer` e **injetando o container apenas** quando houver ID configurado **e** consentimento aceito; com ID vazio, apenas `console.debug` em desenvolvimento (decisões 4 e 5).
- [ ] **Task 3.3:** Implementar o portão de consentimento dentro do serviço: **pendente** → enfileira em memória; **aceito** → carrega o container e libera a fila; **recusado** → descarta a fila e vira no-op permanente na sessão (decisão 4).
- [ ] **Task 3.4:** Disparar `page_view` a cada `NavigationEnd` do `Router`, com a URL e o título resolvido da rota — sem isso, uma SPA registra apenas a primeira página da sessão.
- [ ] **Task 3.5:** Instrumentar `view_course` em `features/course-detail` (slug e nome do curso) e `begin_checkout` na entrada de `features/checkout`, reaproveitando os dados que os componentes já carregam.
- [ ] **Task 3.6:** Instrumentar `purchase` em `features/checkout/checkout-success`, com `transaction_id` sintético e comentário no código declarando que o checkout é mockado e o valor não representa receita real (decisão 6).
- [ ] **Task 3.7:** Instrumentar `generate_lead` na submissão bem-sucedida dos formulários de captura do funil e `lesson_started` na abertura de módulo em `features/student/trilha` — não no `shared/ui/video-player`, que é componente de apresentação reutilizável.
- [ ] **Task 3.8:** Escrever o `.spec.ts` do `AnalyticsService`: nenhum script injetado com ID vazio, nenhum evento no `dataLayer` sem consentimento, fila liberada na ordem correta após o aceite e fila descartada na recusa.

## Fase 4: Arquitetura SEO e Metadados
- [ ] **Task 4.1:** Criar `core/services/seo.service.ts` usando `Title` e `Meta` do `@angular/platform-browser`, com um método único que recebe título, descrição, imagem e flag de indexação e aplica title, `description`, Open Graph (`og:title`, `og:description`, `og:image`, `og:url`, `og:type`), Twitter Card e `<link rel="canonical">` (decisão 12).
- [ ] **Task 4.2:** Alimentar o serviço a partir do `data` das rotas em `app.routes.ts` e aplicá-lo em um único ponto por `NavigationEnd`, evitando um bloco de metadados espalhado por componente; rotas privadas declaram `noindex, nofollow` (decisão 8).
- [ ] **Task 4.3:** Definir os metadados dinâmicos de `/cursos/:slug` a partir do `courses.mock.ts` (título, descrição e imagem do curso), confirmando via HTML prerenderizado que as tags chegam prontas ao crawler (decisões 1 e 2).
- [ ] **Task 4.4:** Criar `public/robots.txt` com `Disallow` para `/ava`, `/admin`, `/onboarding` e `/checkout`, e a referência ao `sitemap.xml` (decisão 8).
- [ ] **Task 4.5:** Gerar `sitemap.xml` cobrindo exatamente as rotas públicas prerenderizadas da Task 1.2 — incluindo as três páginas legais e excluindo a 404 — como arquivo em `public/` ou passo de build.
- [ ] **Task 4.6:** Substituir `{ path: '**', redirectTo: '' }` por uma feature de 404 com `<h1>` próprio, `noindex`, e CTAs de volta para a landing e para os planos; aplicar o mesmo `noindex` aos dois desvios de slug inexistente já existentes em `course-detail.html` e `checkout.html`, que **permanecem inalterados** no restante (decisão 7).
- [ ] **Task 4.7:** Criar o serviço de injeção de JSON-LD (`<script type="application/ld+json">` via `DOCUMENT`), removendo o bloco anterior a cada troca de rota para não acumular schemas órfãos (decisão 12).
- [ ] **Task 4.8:** Emitir o schema `Course` em `/cursos/:slug` e o `FAQPage` a partir do `faqItems()` que o `course-detail` já monta para o `ui-accordion`, validando o resultado no Rich Results Test sobre o HTML prerenderizado.
- [ ] **Task 4.9:** Corrigir a hierarquia de cabeçalhos de `features/landing/landing.html`, que hoje tem `<h1>` e pula direto para três `<h3>` sem nenhum `<h2>` — as seções passam a `<h2>`, com `<h3>` apenas para subitens reais.
- [ ] **Task 4.10:** Adicionar o `<h1>` ausente nas telas que hoje começam em `<h2>`: `features/student/hub/hub.ts`, `features/student/trilha`, `features/student/certificado` e `features/certificado-verificar`.
- [ ] **Task 4.11:** Confirmar que os pares de `<h1>` de `course-detail.html` e `checkout.html` estão em branches `@if`/`@else` mutuamente exclusivos (estado normal vs. slug fora do catálogo) e **não** alterá-los — a duplicidade é aparente, nunca renderizam juntos.
- [ ] **Task 4.12:** Revisar `src/index.html` para que o `<head>` estático sirva de fallback coerente (title, description e OG genéricos da marca), já que ele é o que responde por qualquer rota não prerenderizada.

## Fase 5: Verificação
- [ ] **Task 5.1:** Rodar `npm test` no `front/` e corrigir regressões nas suítes existentes (`course-detail.spec.ts`, `auth.service.spec.ts`, `user.service.spec.ts` e as da Spec 008).
- [ ] **Task 5.2:** Validar o HTML de produção de `/`, `/planos` e `/cursos/:slug` fora do navegador (`curl` ou leitura do arquivo gerado), conferindo title, description, OG, canonical e JSON-LD presentes sem execução de JavaScript.
- [ ] **Task 5.3:** Validar o fluxo de consentimento ponta a ponta em produção local: primeira visita sem nenhum script de terceiro carregado, aceite liberando a fila de eventos, revogação pelo rodapé interrompendo os disparos e bump de versão da política reabrindo o banner.
- [ ] **Task 5.4:** Conferir `robots.txt` e `sitemap.xml` servidos na raiz do domínio e verificar que nenhuma rota privada aparece no sitemap nem sem `noindex`.
