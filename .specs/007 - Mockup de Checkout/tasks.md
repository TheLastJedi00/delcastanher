# Tasks: Spec 007 - Mockup de Checkout

Stack do projeto (Angular standalone + signals + Tailwind), mantendo o Design System da Spec 002 e os componentes de `front/src/app/shared/ui/`. Spec 100% front-end: `api/` não é alterada, e o core de autenticação da Spec 004 (`core/services/auth.service.ts`, `core/guards/`) permanece intocado. Nenhuma integração real com gateway de pagamento ocorrerá nesta etapa.

## Fase 1: Componentes e Estrutura Base do Checkout
- [x] **Task 1.1:** Criar a pasta da feature `features/checkout/` e registrar em `app.routes.ts` a rota lazy `checkout/:productSlug` (pública, fora dos guards) com as rotas filhas `senha` e `sucesso` — ver decisão 1 do `context.md`.
- [x] **Task 1.2:** Criar o resolvedor de produto em `core/mocks/checkout.mock.ts`: uma função `findCheckoutProductBySlug` que atende as duas fontes existentes — `courses.mock.ts` (indexado por `slug`) e `plans.mock.ts` (indexado por `id`, usado como slug) — retornando um tipo único de produto de checkout (nome, resumo, preço, nota de preço). Slug inexistente retorna `null` e a página cai em fallback amigável, como em `course-detail.ts`.
- [x] **Task 1.3:** Criar o componente **`ui-order-summary`** (`shared/ui/order-summary/`): exibir nome, resumo e preço do produto por inputs. O preço passa por `isPlaceholder()` / `ui-placeholder-text` (decisão 5) — nunca exibir `[PREÇO]` cru nem valor fabricado. Com `.spec.ts` cobrindo o caso de preço placeholder.
- [x] **Task 1.4:** Criar o componente **`ui-payment-method-selector`** (`shared/ui/payment-method-selector/`): seleção entre PIX e Cartão de Crédito com estado em signals, acessível (`role="radiogroup"` / `aria-checked`), indicando o método ativo. Com `.spec.ts`.
- [x] **Task 1.5:** Completar `core/mocks/checkout.mock.ts` com as respostas simuladas de pagamento (aprovado, recusado, erro de comunicação), incluindo mensagem e código de cada cenário.
- [x] **Task 1.6:** Criar o `CheckoutStateService` (`features/checkout/checkout-state.ts`, `providedIn: 'root'`, signals): guarda produto escolhido, método, dados do comprador (sem dados de cartão — decisão 6) e o resultado da simulação; expõe `reset()` e um sinal de "jornada iniciada" consumido pelas rotas filhas.

## Fase 2: Formulários e Interface Principal do Checkout
- [x] **Task 2.1:** Desenvolver o formulário reativo de **Dados Pessoais/Cadastro Inicial** (Nome, E-mail, CPF, Telefone), reutilizando `ui-input` (já implementa `ControlValueAccessor`). Validação de formato apenas, **sem introduzir dependência nova de máscara**.
- [x] **Task 2.2:** Desenvolver o formulário reativo de **Dados de Pagamento**, visível apenas quando Cartão de Crédito estiver selecionado. Campos puramente visuais: nada vai para a API, nada entra em `localStorage` e nada é carregado para as etapas seguintes (decisão 6); desativar o autofill de cartão do navegador.
- [x] **Task 2.3:** Construir a página principal do Checkout com layout focado em conversão: esconder menus/distrações, formulários na coluna principal e `ui-order-summary` fixo na lateral (desktop) ou no topo/rodapé (mobile). Incluir o aviso permanente de ambiente de demonstração (decisão 7) e marcar a rota como `noindex`.
- [x] **Task 2.4:** Incluir o mockup de pagamento via **PIX**: QR Code estático servido de `public/`/`assets/` com `NgOptimizedImage` (**não** usar base64 inline, que o `NgOptimizedImage` não suporta), chave "Copia e Cola" falsa com botão de copiar, e botão "Simular Pagamento".
- [x] **Task 2.5:** Implementar o **seletor de cenário de simulação** (decisão 4): controle visível, dentro do bloco de demonstração, que define qual resposta do mock (`aprovado` / `recusado` / `erro`) será usada ao finalizar a compra.

## Fase 3: Estados de Transação (Simulação Visual)
- [x] **Task 3.1:** Desenvolver o estado de **"Processando Pagamento"** reutilizando o `ui-loading-overlay` já existente (fullscreen, `aria-busy`, logo animado) — não criar spinner novo. Acionado ao clicar em "Finalizar Compra"/"Simular Pagamento".
- [x] **Task 3.2:** Desenvolver as views de **"Pagamento Recusado"** e **"Erro de Comunicação"**: mensagem clara vinda do mock e CTA para voltar ao checkout e tentar outro método, preservando os dados já preenchidos.
- [x] **Task 3.3:** Desenvolver a view de **"Pagamento Aprovado"**: mensagem de sucesso, detalhes básicos do pedido (produto e método, preço respeitando o placeholder) e instrução clara do próximo passo.
- [x] **Task 3.4:** Escrever os `.spec.ts` das três views de transação: mensagem correta por cenário e presença do CTA de retorno nos casos de falha.

## Fase 4: Handoff Simulado (decisão 1) e Refinamentos
- [x] **Task 4.1:** Implementar a tela mock de **definição de senha** em `checkout/:productSlug/senha`: dois campos (`ui-input`) com validação de igualdade e um submit que **não** chama `AuthService` nem grava sessão — apenas avança para `sucesso`. Visual alinhado ao `features/auth/create-account-modal/`.
- [x] **Task 4.2:** Proteger as rotas filhas contra acesso direto/F5 (decisão 3): com o `CheckoutStateService` vazio, `senha` e `sucesso` redirecionam para o início do checkout, sem exibir pedido inexistente.
- [x] **Task 4.3:** Implementar a tela final `checkout/:productSlug/sucesso`: encerrar com a mensagem verdadeira do fluxo atual — o link de definição de senha chega por e-mail (Firebase) — e CTA "Acessar meu curso" apontando para `/login`. **Não** navegar para `/ava`: sem sessão real os guards devolvem o usuário, e "curso desbloqueado" está fora de escopo (decisão 2).
- [x] **Task 4.4:** Ligar o funil ao checkout: apontar os CTAs de compra de `/planos` (`plans.mock.ts`) e de `/cursos/:slug` (`offer.checkoutUrl` / `checkoutPending` em `course-detail.ts`) para `/checkout/:productSlug`, mantendo `PLACEHOLDER.checkout` no mock como marcador do gateway real ainda indefinido.
- [x] **Task 4.5:** Revisar a responsividade (mobile-first) de toda a jornada: formulários fluidos, overlay de processamento bem dimensionado, resumo do pedido legível no celular e telas de resultado claras.
- [x] **Task 4.6:** Escrever `checkout.spec.ts`: troca de método (PIX vs Cartão) com exibição condicional dos formulários, resolução do produto por slug, fallback de slug inexistente e redirecionamento das rotas filhas sem estado.
- [x] **Task 4.7:** Rodar `npm test` e `npm run build` no `front/` e corrigir possíveis regressões.
