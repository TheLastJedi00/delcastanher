# Spec 007: Mockup Funcional do Fluxo de Checkout

**Projeto:** Plataforma E-learning "Imersão RH Estratégico"
**Baseada em:** Spec 002 (Design System), Spec 004 (Autenticação) e Spec 006 (Funil de Vendas)
**Escopo técnico:** exclusivamente front-end (`front/`). Nenhuma alteração em `api/` e **nenhuma alteração no core de autenticação** (`core/services/auth.service.ts`, `core/guards/`).

## Objetivo
Preparar toda a interface e os estados do fluxo de pagamento e a transição de visitante para aluno, sem integrar gatilhos financeiros reais (nenhuma cobrança real ocorrerá nesta etapa).

## Escopo

- **Interface de Checkout:** Telas de pagamento divididas em resumo do pedido, formulário de dados/cadastro inicial e seleção de método (PIX/Cartão).
- **Estados de Transação:** Modelagem visual de "Processando Pagamento", "Pagamento Aprovado", "Pagamento Recusado" e "Erro de Comunicação".
- **Fluxo de Redirecionamento (Handoff):** Simulação da jornada: Clica em Comprar > Preenche Checkout > Simula Aprovação > Tela de definição de senha (mockup) > Encaminhamento para o login real.

## Decisões técnicas desta spec

1. **Handoff simulado em rotas próprias, sem tocar na autenticação.**
   A jornada termina dentro da própria feature de checkout (`checkout/:productSlug/senha` e `checkout/:productSlug/sucesso`), em telas que **não autenticam**: não chamam `AuthService`, não gravam sessão e não passam pelos guards.
   Motivo: no projeto de hoje a senha é definida por link enviado pelo Firebase (`AuthService.requestAccount()` / `features/auth/create-account-modal/`), e `/ava` está atrás de `authGuard` + `onboardingGuard`, que consultam a API real (`users.ensureProfile()`). Encenar uma entrada no AVA exigiria bypass dos guards ou sessão falsa — contaminar o core da Spec 004 por causa de um mockup. A tela final encerra com a mensagem verdadeira do fluxo ("enviamos o link de definição de senha para seu e-mail") e um CTA para `/login`.

2. **"Curso desbloqueado no AVA" está fora do escopo desta spec.**
   Não existe conceito de matrícula, entitlement ou bloqueio de conteúdo em nenhum ponto do código: o hub e a trilha do aluno são mock estático, iguais para todos. Criar esse estado é uma spec própria (modelo de matrícula + API), não um efeito colateral de um mockup de checkout.

3. **Estado da jornada em serviço com signals.**
   As etapas são rotas irmãs, então o resultado da simulação vive em um `CheckoutStateService` (`providedIn: 'root'`, signals). Acesso direto por URL ou F5 em `senha`/`sucesso` encontra o estado vazio e é redirecionado para o início do checkout — sem tela órfã e sem inventar um pedido que não existe.

4. **Cenário de pagamento escolhido de forma determinística.**
   Aprovado / Recusado / Erro de Comunicação não são sorteados: um seletor de simulação visível na tela de pagamento (bloco de demonstração) define qual resposta do mock será usada. Um mockup precisa ser demonstrável sob demanda.

5. **Preço continua sendo placeholder.**
   `courses.mock.ts` e `plans.mock.ts` trazem `PLACEHOLDER.price` (decisão 3 da Spec 006: não inventar dado comercial). O resumo do pedido exibe o preço através de `isPlaceholder()` / `ui-placeholder-text`, com o mesmo tratamento visual de "pendente" das outras telas — nunca um `[PREÇO]` cru nem um valor fabricado.

6. **Nenhum dado sensível é persistido.**
   O formulário de cartão é visual: os campos não vão para a API, não entram em `localStorage` e a jornada não guarda número de cartão em lugar nenhum ao trocar de etapa.

7. **Os CTAs reais do funil apontam para o mockup, com aviso de demonstração.**
   Os CTAs de compra de `/planos` e `/cursos/:slug` passam a apontar para esta rota (ver "Integração" abaixo). Não há risco comercial na troca: não existe gateway, nenhuma cobrança é possível e os preços seguem como placeholder (decisão 5) — não há o que ser cobrado. Ainda assim, o checkout exibe um aviso permanente e visível de ambiente de demonstração: nenhuma tela pode levar um visitante a acreditar que efetuou uma compra.

## Integração com o funil existente
O checkout não pode nascer órfão. Hoje os CTAs de compra apontam para o placeholder `[LINK DE CHECKOUT]` (`plans.mock.ts`, `offer.checkoutUrl` em `courses.mock.ts`, com o estado `checkoutPending` em `course-detail.ts`). Esta spec liga esses CTAs à rota interna `/checkout/:productSlug`, mantendo o aviso de demonstração da decisão 7. O placeholder `PLACEHOLDER.checkout` permanece no mock como marcador do gateway real, que continua indefinido.

## Fora de escopo
- Gateway de pagamento real, cobrança, webhook ou qualquer integração financeira.
- Alterações em `api/`, no `AuthService`, nos guards ou no fluxo real de definição de senha.
- Matrícula, entitlement ou conteúdo desbloqueado no AVA (ver decisão 2).
- Emissão de nota, antifraude, cupom de desconto e order bump.
