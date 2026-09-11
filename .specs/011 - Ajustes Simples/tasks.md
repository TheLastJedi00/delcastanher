# Tasks: Spec 011 - Ajustes Simples (Logout do Painel e Faixa de Parceiros)

Spec só de front (Angular standalone + signals + Tailwind). Valem o Design System da Spec 002 e os componentes de `front/src/app/shared/ui/`. As decisões referenciadas abaixo estão no `context.md`.

Ordem das fases: o bug de logout é independente e vem primeiro; na landing, os assets e a lista de parceiros entram antes do carrossel, para que a seção esteja correta em conteúdo mesmo antes de mudar de forma.

## Fase 1: Correção do Bug de Logout
- [x] **Task 1.1:** Adicionar `output logout` ao `ui-sidebar` e emiti-lo no clique do item "Sair", mantendo o `routerLink="/login"` e o fechamento do drawer no mobile — o componente avisa o clique, quem encerra a sessão é o shell (decisão 2).
- [x] **Task 1.2:** Ligar `(logout)="auth.logout()"` no `AdminLayout`, tanto no `ui-nav-header` (cujo output já existia e estava desconectado) quanto no `ui-sidebar`, injetando o `AuthService` (decisão 1).
- [x] **Task 1.3:** Ligar `(logout)="auth.logout()"` no `ui-sidebar` do `StudentLayout`, que tem o mesmo defeito (decisão 2).
- [x] **Task 1.4:** Cobrir por `.spec.ts` que o clique em "Sair" chama `AuthService.logout()` e que a sessão não sobrevive no `localStorage`, nos dois shells.
- [x] **Task 1.5:** Validar manualmente no navegador: sair do painel, voltar para `/admin` pela URL e confirmar que o `adminGuard` manda para `/login`.

## Fase 2: Conteúdo da Faixa de Parceiros
- [x] **Task 2.1:** Copiar os oito logos de `.specs/011 - Ajustes Simples/libs/` para `front/public/assets/parceiros/`, renomeando para *kebab-case* sem acento (decisão 7).
- [x] **Task 2.2:** Substituir o array de strings `partners` em `features/landing/landing.ts` por objetos com nome e dimensões intrínsecas do arquivo: fora a Amcom, dentro Vale Automação, Efficienza, RGM Service e Acimatec.
- [x] **Task 2.3:** Manter a Cronus na lista sem logo, renderizada com o nome escrito até o arquivo existir (decisão 3).
- [x] **Task 2.4:** Renderizar os logos com `NgOptimizedImage` em célula de tamanho fixo com `object-contain` e tratamento *grayscale* com cor no `hover`, ainda sem carrossel (decisão 8).

## Fase 3: Carrossel da Faixa de Parceiros
- [x] **Task 3.1:** Criar `shared/ui/logo-marquee/` (standalone, `OnPush`, `input()`, template inline) com o tipo `MarqueePartner` de logo opcional, a trilha duplicada e a cópia marcada `aria-hidden` (decisões 3 e 4).
- [x] **Task 3.2:** Adicionar ao `styles.scss` as classes `.marquee`, `.marquee__track` e `.marquee__group` com o `@keyframes` de `-50%`, o mascaramento das pontas e a pausa no `hover`/`focus-within` (decisões 4 e 5).
- [x] **Task 3.3:** Tratar `prefers-reduced-motion` no bloco que já existe: sem deslize, a cópia decorativa some e a faixa passa a rolar na horizontal (decisão 6).
- [x] **Task 3.4:** Trocar a grade estática da Fase 2 pelo `ui-logo-marquee` na `landing.html`.
- [x] **Task 3.5:** Conferir a responsividade em mobile, tablet e desktop, e que o `ng build` continua prerenderizando a landing sem tocar em `window` (SSR).

## Fase 4: Fechamento
- [x] **Task 4.1:** Rodar `ng build` e `ng test` no `front/` e corrigir regressões.
- [x] **Task 4.2:** Subir em `localhost:4200` e validar no Chrome as três frentes: logout do painel, logout do AVA e a faixa de parceiros.
