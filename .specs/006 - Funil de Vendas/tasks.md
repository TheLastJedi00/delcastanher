# Tasks: Spec 006 - Funil de Vendas (Página do Curso e Planos)

Stack do projeto (Angular standalone + signals + Tailwind), mantendo o Design System da Spec 002 e os componentes de `front/src/app/shared/ui/`. Spec 100% front-end: `api/` não é alterada.

## Fase 1: Preparação, Mocks e Componentes Base
- [x] **Task 1.1:** Criar os mocks tipados em `front/src/app/core/mocks/`: `courses.mock.ts` (indexado por slug, com promessa, problema, resultados, módulos, bônus, garantias, FAQ, depoimentos) e `plans.mock.ts` (4 pacotes + Mini Curso). Preços, novos cursos, depoimentos em vídeo, garantias e link de checkout entram como placeholders (`[PREÇO]`, `[CURSO A SER CADASTRADO]`, `[LINK DE CHECKOUT]`).
- [x] **Task 1.2:** Criar o componente compartilhado **`ui-accordion`** (`shared/ui/accordion/`) para grade curricular e FAQ — não existe hoje. Standalone, `OnPush`, estado com signals, acessível (`aria-expanded`/`aria-controls`), com `.spec.ts`.
- [x] **Task 1.3:** Criar o componente compartilhado **`ui-plan-card`** (`shared/ui/plan-card/`) para os cards de pacote: título, preço (aceitando placeholder), lista de inclusos, CTA e estados `destaque` e `em-breve`. Baseado no visual de `ui-glass-card`/`ui-card`, com `.spec.ts`.
- [x] **Task 1.4:** Criar o componente compartilhado **`ui-scarcity-banner`** (`shared/ui/scarcity-banner/`): faixa de urgência com textos placeholder (`[TURMA ENCERRA EM]`, `[VAGAS RESTANTES]`). Sem timer funcional nesta spec — ver decisão 2 do `context.md`. Com `.spec.ts`.

## Fase 2: Template de Curso Individual
- [x] **Task 2.1:** Criar `features/course-detail/` e registrar a rota lazy `cursos/:slug` em `app.routes.ts` (fora dos guards, pública). Resolver o curso pelo slug no mock e tratar slug inexistente com fallback amigável.
- [x] **Task 2.2:** Desenvolver a seção **Hero**: Promessa (Headline) em destaque e o "Problema que resolve", reutilizando `ui-nav-header` (variant landing), `bg-gradient-hero` e `ui-button`.
- [x] **Task 2.3:** Desenvolver a seção de **Resultados e Grade Curricular**: capacitações finais + módulos via `ui-accordion` (Task 1.2) e/ou `ui-module-card`.
- [x] **Task 2.4:** Desenvolver a seção de **Oferta (Bônus, Investimento e Garantias)**: aplicar a UI de gatilhos de Tempo e Escassez com `ui-scarcity-banner`, preço em placeholder e CTA apontando para `[LINK DE CHECKOUT]`.
- [x] **Task 2.5:** Desenvolver a seção de **FAQ**: iterar com `@for` sobre o mock de perguntas/respostas do produto usando `ui-accordion`.
- [x] **Task 2.6:** Fechar a página com `ui-footer` e escrever `course-detail.spec.ts` (renderização das seções, resolução por slug, fallback).

## Fase 3: Página de Planos e Soluções
- [ ] **Task 3.1:** Criar `features/plans/` e registrar a rota lazy pública `planos` em `app.routes.ts`.
- [ ] **Task 3.2:** Desenvolver a grid de pacotes com `ui-plan-card`: **Curso Individual, Trilhas, Formação Completa** e **Empresas**, com os inclusos de cada plano claramente comparáveis (mesma ordem de benefícios em todos os cards).
- [ ] **Task 3.3:** Incluir o card do produto de entrada (**Mini Curso**) no estado `em-breve`: badge "Em breve", visual atenuado e CTA desabilitado (`disabled` + `aria-disabled`, sem link).
- [ ] **Task 3.4:** Escrever `plans.spec.ts` (5 cards renderizados, Mini Curso sem CTA ativo).

## Fase 4: Integração no Site e Refinamentos para Conversão (Ads)
- [ ] **Task 4.1:** Ligar as páginas ao site: link **Planos** no `navLinks` da landing, CTA do hero apontando para `/planos`, e links de `/planos` e do curso no `ui-footer`. Cross-link entre as duas páginas novas (card "Curso Individual" → `/cursos/imersao-rh`).
- [ ] **Task 4.2:** Revisar a responsividade de todos os templates (mobile-first: CTA visível sem scroll no mobile, cards empilhados, grade curricular colapsada por padrão).
- [ ] **Task 4.3:** Validar a gestão visual dos placeholders — `[CURSO A SER CADASTRADO]`, `[PREÇO]`, `[LINK DE CHECKOUT]` devem ter estilo próprio (tratamento visual de "pendente"), não quebrar o layout e não parecer erro para o visitante.
- [ ] **Task 4.4:** Definir `title` e `meta description` por rota (`/planos` e `/cursos/:slug`) via `Title`/`Meta` do Angular, para as campanhas de Ads.
- [ ] **Task 4.5:** Rodar `npm test` e `npm run build` no `front/` e corrigir regressões.
