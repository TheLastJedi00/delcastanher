# Spec 002 — Tasks: Design System & Componentização

> Plano de execução dividido em **7 fases** progressivas.
> Cada fase gera uma branch `feat/<nome>` e cada task gera um commit.
> Ao final, todas as feats serão mergeadas em `release/002-design-componentizacao`.

---

## Fase 1 — Fundação do Design System

> **Branch:** `feat/design-tokens`
>
> Configura a base de tokens, tipografia, estilos globais e assets. Nenhum componente é criado ainda — apenas a infraestrutura que todos os componentes consumirão.

### Task 1.1 — Atualizar `tailwind.config.js` com tokens da paleta oficial

- Substituir as cores `brand-blue`, `brand-teal`, `brand-light` existentes pela nova estrutura `brand.navy`, `brand.teal`, `brand.teal-light`, `brand.steel`, `brand.surface`, `brand.navy-light`
- Adicionar `state.success`, `state.warning`, `state.danger`, `state.info`
- Adicionar `backgroundImage` com os 5 gradientes oficiais (`gradient-teal`, `gradient-navy`, `gradient-brand`, `gradient-glass`, `gradient-hero`)
- Adicionar `boxShadow` com tokens `glass`, `glass-lg`, `glow-teal`, `glow-navy`, `card`, `card-hover`
- Adicionar `borderRadius` customizados (`2xl: 1rem`, `3xl: 1.5rem`)
- Atualizar `fontFamily.sans` para `Plus Jakarta Sans` como primária
- Expandir `animation` e `keyframes` com todas as animações definidas na spec (fade-in, fade-in-up, fade-in-down, slide-in-left, slide-in-right, scale-in, shimmer, float, pulse-soft, gradient-shift)

### Task 1.2 — Integrar a fonte Plus Jakarta Sans

- Adicionar tags `<link>` de preconnect e font import no `src/index.html`
- Carregar pesos: 300, 400, 500, 600, 700, 800 (regular)
- Confirmar que a font-family já foi definida no Tailwind config (Task 1.1)

### Task 1.3 — Reescrever `styles.scss` com estilos globais padronizados

- Adicionar `@layer base` com: `transition-colors` global, body com `bg-brand-surface antialiased`, `::selection` com `bg-brand-teal/20 text-brand-navy`, scrollbar customizada (`::-webkit-scrollbar`)
- Adicionar `@layer components` com classes utilitárias: `.glass`, `.glass-dark`, `.glass-teal`, `.border-gradient-brand`, `.text-gradient-brand`, `.text-gradient-teal`, `.blob-teal`, `.blob-navy`
- Adicionar View Transition CSS (`::view-transition-old`, `::view-transition-new`, keyframes `fade-out`)
- Adicionar media query `prefers-reduced-motion: reduce`

### Task 1.4 — Copiar logo SVG para assets e substituir referências

- Copiar `.specs/002 - Design e Componentização/Logo Delcastanher.svg` para `src/assets/logo-delcastanher.svg`
- Realizar busca e substituição de `assets/logo.jpg` por `assets/logo-delcastanher.svg` em todos os templates (landing.html, login.html, layout.ts, admin-dashboard.html)
- Remover classes desnecessárias que eram específicas do JPG (ex: `bg-white p-1` no footer)

### Task 1.5 — Habilitar View Transitions no Angular Router

- Editar `app.config.ts`: importar `withViewTransitions` de `@angular/router`
- Adicionar `withViewTransitions()` como argumento do `provideRouter`

### Task 1.6 — Atualizar referências de cores antigas no codebase

- Buscar todas as ocorrências de `brand-blue`, `brand-teal`, `brand-light` nos templates e substituir:
  - `brand-blue` → `brand-navy`
  - `brand-teal` → `brand-teal` (mantém, já é compatível)
  - `brand-light` → `brand-surface`
  - `border-slate-100`, `border-slate-200` → `border-brand-navy/8` ou `border-brand-navy/12`
  - `bg-slate-50` → `bg-brand-surface`
  - `shadow-sm`, `shadow-md`, `shadow-lg` → `shadow-card`, `shadow-glass`, `shadow-card-hover` onde aplicável
- Validar build: `ng build`

---

## Fase 2 — Componentes Primitivos (UI Atoms)

> **Branch:** `feat/ui-primitives`
>
> Cria os componentes atômicos mais simples que servem de base para os compostos.

### Task 2.1 — Criar `LogoComponent` (`shared/ui/logo/logo.ts`)

- Componente standalone com SVG inline da logo
- Inputs: `size: 'sm' | 'md' | 'lg'` (h-8, h-10, h-12), `variant: 'default' | 'light'` (light aplica `brightness(0) invert(1)` para fundo escuro)
- Signal-based inputs (Angular 20)

### Task 2.2 — Criar `ButtonComponent` (`shared/ui/button/button.ts`)

- Componente standalone
- Inputs: `variant: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline'`, `size: 'sm' | 'md' | 'lg'`, `loading: boolean`, `fullWidth: boolean`, `type: 'button' | 'submit'`
- Primary: `bg-gradient-brand text-white hover:shadow-glow-teal`
- Secondary: `bg-brand-navy text-white`
- Ghost: `text-brand-teal hover:bg-brand-teal/5`
- Outline: `border-brand-teal text-brand-teal hover:bg-brand-teal/5`
- Danger: `bg-state-danger text-white`
- Loading: spinner SVG animado, `pointer-events-none opacity-70`
- Active: `scale(0.98)` transition
- Usa `<ng-content>` para conteúdo

### Task 2.3 — Criar `InputComponent` (`shared/ui/input/input.ts`)

- Componente standalone
- Inputs: `label: string`, `placeholder: string`, `type: string` (default 'text'), `error: string`
- Visual: `border-brand-navy/10 rounded-xl`, foco com `border-brand-teal ring-2 ring-brand-teal/20`
- Erro: borda `border-state-danger`, mensagem abaixo em `text-state-danger text-xs`
- Usa `model()` para two-way binding do valor

### Task 2.4 — Criar `BadgeComponent` (`shared/ui/badge/badge.ts`)

- Componente standalone
- Inputs: `variant: 'teal' | 'navy' | 'success' | 'warning' | 'danger'`, `label: string`
- Visual: `rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider`
- Cada variant mapeia para combinação de `bg-*/10 text-*`

### Task 2.5 — Criar `AvatarComponent` (`shared/ui/avatar/avatar.ts`)

- Componente standalone
- Inputs: `src: string` (opcional), `initials: string`, `size: 'sm' | 'md' | 'lg'` (sm=8, md=10, lg=16 em `w-` e `h-`)
- Sem imagem: `bg-gradient-brand text-white` com iniciais centralizadas
- Com imagem: `<img>` com `object-cover rounded-full`
- Borda: `ring-2 ring-white shadow-card`

### Task 2.6 — Criar `ProgressBarComponent` (`shared/ui/progress-bar/progress-bar.ts`)

- Componente standalone
- Inputs: `value: number` (0-100), `variant: 'teal' | 'brand' | 'gradient'`, `size: 'sm' | 'md'`, `showLabel: boolean`
- Track: `bg-brand-navy/5 rounded-full`
- Fill: variant `gradient` usa `bg-gradient-teal`, `teal` usa `bg-brand-teal`, `brand` usa `bg-gradient-brand`
- Transition: `transition-all duration-700 ease-out` no width
- Label: `text-xs font-bold text-brand-steel` ao lado da barra quando `showLabel`

### Task 2.7 — Criar `BackLinkComponent` (`shared/ui/back-link/back-link.ts`)

- Componente standalone
- Inputs: `link: string` (routerLink), `label: string` (default "Voltar ao Hub")
- Visual: ícone seta SVG + label em `text-brand-steel hover:text-brand-teal transition-colors`
- Importa `RouterLink`

### Task 2.8 — Criar `SectionHeaderComponent` (`shared/ui/section-header/section-header.ts`)

- Componente standalone
- Inputs: `overline: string`, `title: string`, `align: 'left' | 'center'` (default 'left')
- Visual: overline em `text-brand-teal text-xs font-bold uppercase tracking-widest mb-2`, título em `text-brand-navy text-3xl md:text-4xl font-bold`
- Alinhamento condicional com `text-center` / `text-left`

### Task 2.9 — Validar build e commit da Fase 2

- Executar `ng build` para garantir que todos os componentes compilam
- Verificar que nenhum componente tem dependência circular

---

## Fase 3 — Componentes Compostos (UI Molecules)

> **Branch:** `feat/ui-molecules`
>
> Cria os componentes compostos que combinam os primitivos e encapsulam padrões visuais complexos.

### Task 3.1 — Criar `CardComponent` (`shared/ui/card/card.ts`)

- Componente standalone
- Inputs: `variant: 'default' | 'glass' | 'elevated' | 'outline'`, `hover: boolean` (default true), `padding: 'sm' | 'md' | 'lg'` (p-4, p-6, p-8)
- Default: `bg-white rounded-2xl shadow-card border border-brand-navy/8`
- Glass: `glass rounded-2xl` (usa classe global)
- Elevated: `bg-white rounded-2xl shadow-glass`
- Outline: `bg-transparent rounded-2xl border border-brand-navy/12`
- Hover (quando true): `hover:shadow-card-hover hover:-translate-y-1 transition-all duration-300`
- Usa `<ng-content>` para conteúdo

### Task 3.2 — Criar `GlassCardComponent` (`shared/ui/glass-card/glass-card.ts`)

- Componente standalone que estende visualmente o Card com glassmorphism
- Visual: `.glass` + borda com gradiente sutil no topo (`border-t-2` com `border-image: gradient-brand`)
- Inputs: `padding: 'sm' | 'md' | 'lg'`, `hover: boolean`
- Hover: `shadow-glow-teal` + `translateY(-4px)`
- Usa `<ng-content>`

### Task 3.3 — Criar `StatCardComponent` (`shared/ui/stat-card/stat-card.ts`)

- Componente standalone
- Inputs: `label: string`, `value: string`, `trend: 'up' | 'down' | undefined`, `trendValue: string`
- Visual: `GlassCard` com borda superior `gradient-brand`, ícone com fundo `bg-brand-teal/10` arredondado
- Trend up: seta verde `text-state-success`, trend down: seta vermelha `text-state-danger`
- Usa `<ng-content>` para projetar ícone SVG customizado
- Valor com `font-extrabold text-3xl text-brand-navy`

### Task 3.4 — Criar `ModuleCardComponent` (`shared/ui/module-card/module-card.ts`)

- Componente standalone
- Inputs: `moduleNumber: number`, `title: string`, `completed: boolean`, `active: boolean`
- Outputs: `selected: EventEmitter<void>`
- Visual: borda esquerda `border-l-3 border-brand-teal` quando ativo, fundo `bg-brand-teal/5` quando ativo
- Ícone: check circular `bg-gradient-teal text-white` quando completo, círculo vazio `border-2 border-brand-navy/20` quando não
- Hover: `glass-teal` sutil, `shadow-glow-teal`
- Label: `MÓDULO X` em overline style

### Task 3.5 — Criar `MaterialItemComponent` (`shared/ui/material-item/material-item.ts`)

- Componente standalone
- Inputs: `fileName: string`, `fileType: 'pdf' | 'xls' | 'doc'`, `fileSize: string`, `moduleLabel: string`, `downloadUrl: string`
- Visual: card inline com ícone de tipo (PDF vermelho, XLS verde, DOC azul), hover com `border-brand-teal`
- Usar `CardComponent` variant `outline` internamente

### Task 3.6 — Criar `ArticleCardComponent` (`shared/ui/article-card/article-card.ts`)

- Componente standalone
- Inputs: `title: string`, `summary: string`, `imageUrl: string`, `readTime: string`, `link: string`
- Visual: card horizontal (mobile: vertical) com thumbnail, título, resumo, badge "Leitura: X min"
- Hover: `shadow-card-hover`, título muda para `text-brand-teal`
- Usar `CardComponent` variant `default` internamente

### Task 3.7 — Criar `VideoPlayerComponent` (`shared/ui/video-player/video-player.ts`)

- Componente standalone
- Inputs: `src: string` (URL de vídeo ou imagem poster), `poster: string`, `title: string`, `subtitle: string`
- Visual: container `aspect-video rounded-2xl overflow-hidden shadow-glass` com overlay gradiente escuro, botão play centralizado `bg-brand-teal/90 hover:scale-110` com ícone SVG
- Title e subtitle sobre o overlay em `text-white`
- ~~Futuramente suportará iframe de Vimeo/YouTube~~ **DEPRECATED pela Spec 010 (decisão 8):** a integração foi feita com Mux (`<mux-player>` + playback assinado), não com iframe de Vimeo/YouTube.

### Task 3.8 — Criar `PageContainerComponent` (`shared/ui/page-container/page-container.ts`)

- Componente standalone
- Inputs: `maxWidth: 'sm' | 'md' | 'lg' | 'xl'` (max-w-3xl, 4xl, 5xl, 6xl), `animate: boolean` (default true)
- Visual: `mx-auto px-4 md:px-6 lg:px-8 py-6 md:py-8 w-full`
- Quando `animate`: aplica `animate-fade-in-up`
- Usa `<ng-content>`

### Task 3.9 — Validar build da Fase 3

- Executar `ng build`
- Verificar imports e que todos os componentes funcionam isoladamente

---

## Fase 4 — Componentes de Layout (Organisms)

> **Branch:** `feat/ui-layouts`
>
> Cria os componentes estruturais: navbar, sidebar, footer, e layouts compartilhados.

### Task 4.1 — Criar `NavHeaderComponent` (`shared/ui/nav-header/nav-header.ts`)

- Componente standalone
- Inputs: `variant: 'landing' | 'app' | 'admin'`, `userName: string`, `userInitials: string`
- Outputs: `menuToggle: EventEmitter<void>`, `logout: EventEmitter<void>`
- Landing: glass ao scrollar (detectar via `HostListener` de scroll ou `signal` reativo), logo `LogoComponent` md, nav links centrais com hover underline animado, botão "Área do Aluno" como `ButtonComponent`
- App: glass fixo, logo sm + label "Ambiente do Aluno", hamburger no mobile, `AvatarComponent` à direita
- Admin: glass fixo, logo sm + label "Administração", `AvatarComponent`, link "Sair" como botão ghost danger
- Sticky: `top-0 z-50`

### Task 4.2 — Criar `SidebarLinkComponent` (`shared/ui/sidebar-link/sidebar-link.ts`)

- Componente standalone
- Inputs: `icon: string` (nome do ícone ou template ref), `label: string`, `link: string`, `active: boolean`, `expanded: boolean`
- Visual: ícone SVG + label (oculto quando `!expanded`), indicador ativo `border-l-3 border-brand-teal` + fundo `bg-white/10` (dark) ou `bg-brand-teal/5` (light)
- Transições suaves no aparecer/desaparecer do label

### Task 4.3 — Criar `SidebarComponent` (`shared/ui/sidebar/sidebar.ts`)

- Componente standalone
- Inputs: `variant: 'dark' | 'light'`, `expanded: model<boolean>`
- Usa `SidebarLinkComponent` para cada link, `LogoComponent` no topo
- Dark: `glass-dark` sobre `bg-gradient-navy`, botão toggle com ícone hamburger
- Light: `glass` sobre `bg-white`, botão toggle
- Mobile: `fixed inset-0 z-50` com overlay `bg-black/50` ao expandir
- Transição: `w-16` ↔ `w-64` com `duration-300`
- Botão "Sair" fixo no bottom com estilo danger
- Content via `<ng-content>` ou input de links array

### Task 4.4 — Criar `FooterComponent` (`shared/ui/footer/footer.ts`)

- Componente standalone
- Visual: `bg-gradient-navy text-white`, decoração gradiente `h-1 bg-gradient-teal` no topo
- `LogoComponent` variant `light` à esquerda
- Tagline: "Serviços Administrativos e Treinamentos"
- Links de redes sociais: LinkedIn, Instagram, Telefone
- `© 2026 Delcastanher` com `text-white/50`

### Task 4.5 — Criar `AdminLayoutComponent` (`shared/layouts/admin-layout/admin-layout.ts`)

- Componente standalone que combina `SidebarComponent` variant `light` + `NavHeaderComponent` variant `admin` + `<router-outlet>`
- Extrair a lógica de layout que está hoje no `admin-dashboard.ts`
- Sidebar com links: Visão Geral, Gestão de Aulas, Disparos de E-mail, Políticas & Termos

### Task 4.6 — Validar build da Fase 4

- Executar `ng build`

---

## Fase 5 — Diretivas e Utilitários

> **Branch:** `feat/directives`
>
> Cria as diretivas auxiliares de animação e glassmorphism.

### Task 5.1 — Criar diretiva `AnimateOnScroll` (`shared/directives/animate-on-scroll.ts`)

- Diretiva standalone com selector `[animateOnScroll]`
- Input: `animateOnScroll: string` (default `'animate-fade-in-up'`) — classe CSS a aplicar
- Input opcional: `animateDelay: number` (delay em ms, para stagger)
- Implementação: `IntersectionObserver` no `afterNextRender` (Angular 20), threshold `0.1`
- Ao entrar no viewport: adicionar a classe ao `nativeElement`, opcionalmente com `animation-delay`
- Ao sair (opcional): remover a classe para re-trigger em scroll reverso
- Destruir observer no `OnDestroy`

### Task 5.2 — Criar diretiva `Glass` (`shared/directives/glass.ts`)

- Diretiva standalone com selector `[glass]`
- Input: `glass: '' | 'dark' | 'teal'` — aplica a classe correspondente (`.glass`, `.glass-dark`, `.glass-teal`)
- Útil para aplicar glassmorphism dinamicamente sem poluir templates

### Task 5.3 — Validar build da Fase 5

- Executar `ng build`

---

## Fase 6 — Redesign das Telas (Integração)

> **Branch:** `feat/redesign-screens`
>
> Aplica os componentes criados nas fases anteriores em cada tela, substituindo o HTML inline duplicado e aplicando o novo design system.

### Task 6.1 — Redesign da Landing Page (`features/landing/`)

- Substituir navbar inline por `NavHeaderComponent` variant `landing`
- Hero: aplicar `bg-gradient-hero`, adicionar blobs decorativos (`blob-teal`, `blob-navy`) com `animate-float` e `animate-pulse-soft`, escala tipográfica display (`text-5xl md:text-7xl font-extrabold`), CTA com `ButtonComponent` variant `primary`, imagem com `animate-float`
- Seção Mentora: stats com `GlassCardComponent`, `SectionHeaderComponent`
- Quote Section: aplicar `glass-dark`, nome com `text-gradient-teal`
- Cards de Pilares: substituir por `GlassCardComponent` com ícones
- Grade Curricular: substituir por `ModuleCardComponent`, adicionar `animateOnScroll` com stagger delay
- Prova Social: estilizar com hover individual (remover grayscale do container, aplicar por item)
- Substituir footer inline por `FooterComponent`
- Substituir `assets/logo.jpg` por `LogoComponent` em navbar e footer

### Task 6.2 — Redesign da Tela de Login (`features/auth/login/`)

- Layout split-screen: lado esquerdo com `bg-gradient-hero` + `LogoComponent` lg centralizado + blobs decorativos, lado direito com formulário
- Card do formulário: aplicar classe `glass` com `animate-scale-in`
- `LogoComponent` md centralizado acima do título
- Inputs: substituir por `InputComponent`
- Botões: substituir por `ButtonComponent` (primary para login principal, outline para alternativo)
- Navbar: simplificar com `BackLinkComponent` ou `NavHeaderComponent` minimalista
- Recuperação de senha: manter modal/card com mesmos componentes

### Task 6.3 — Redesign do Layout AVA (`features/student/layout/`)

- Substituir sidebar inline por `SidebarComponent` variant `dark`
- Substituir header inline por `NavHeaderComponent` variant `app`
- Logo no sidebar e header via `LogoComponent`
- Avatar via `AvatarComponent`
- Manter lógica de toggle com `signal` existente

### Task 6.4 — Redesign do Hub (`features/student/hub/`)

- Envolver em `PageContainerComponent`
- Título com `SectionHeaderComponent` (overline: "Bem-vindo(a)", título: "Hub de Aprendizado")
- Cards de navegação: substituir por `GlassCardComponent` com hover, ícones com fundo `bg-gradient-brand/10`
- Adicionar `animateOnScroll` com stagger nos cards

### Task 6.5 — Redesign da Trilha (`features/student/trilha/`)

- Sidebar de módulos: usar `ModuleCardComponent` no loop `@for`
- `ProgressBarComponent` variant `gradient` no topo da sidebar
- `VideoPlayerComponent` para o player
- Detalhes da aula: `CardComponent` variant `default`, `BadgeComponent` para tag do módulo, `ButtonComponent` para "Marcar como Concluída"
- Materiais: `MaterialItemComponent` para cada item de download
- `BackLinkComponent` para voltar ao hub

### Task 6.6 — Redesign do Perfil (`features/student/perfil/`)

- `PageContainerComponent` com `BackLinkComponent`
- `SectionHeaderComponent` para título
- `CardComponent` para o formulário
- `AvatarComponent` lg com gradiente
- `InputComponent` para cada campo
- `ButtonComponent` primary para "Salvar Alterações"

### Task 6.7 — Redesign dos Materiais (`features/student/materiais/`)

- `PageContainerComponent` com `BackLinkComponent`
- `SectionHeaderComponent` para título
- `CardComponent` para container
- `MaterialItemComponent` para cada material

### Task 6.8 — Redesign dos Artigos (`features/student/artigos/`)

- `PageContainerComponent` com `BackLinkComponent`
- `SectionHeaderComponent` para título
- `ArticleCardComponent` para cada artigo

### Task 6.9 — Redesign do Dashboard Admin (`features/admin/dashboard/`)

- Extrair layout para `AdminLayoutComponent` (sidebar + header + router-outlet)
- Ou refatorar o componente existente para usar `SidebarComponent` variant `light`, `NavHeaderComponent` variant `admin`
- Tab "Visão Geral": KPIs com `StatCardComponent`, tabela com `CardComponent`, `ProgressBarComponent` nas colunas de progresso, `AvatarComponent` inline nos nomes
- Tab "Gestão de Aulas": `InputComponent`, `ButtonComponent`, drop zone estilizada com `CardComponent` variant `outline`
- Tab "Disparos de E-mail": `InputComponent`, `ButtonComponent` primary e outline
- Tab "Políticas & Termos": `InputComponent` (textarea), `ButtonComponent`, `BadgeComponent` para status
- `LogoComponent` na sidebar

### Task 6.10 — Validar build completo

- Executar `ng build`
- Verificar que todas as telas compilam sem erros
- Verificar que não há referências residuais a `brand-blue`, `brand-light`, `logo.jpg`, ou `border-slate-*` hard-coded

---

## Fase 7 — Polimento e Validação Final

> **Branch:** `feat/polish`
>
> Ajustes finais de responsividade, acessibilidade, performance e consistência visual.

### Task 7.1 — Validação de responsividade em todas as telas

- Testar cada tela em 3 breakpoints: mobile (375px), tablet (768px), desktop (1280px)
- Corrigir problemas de overflow, stacking, espaçamento
- Verificar que sidebars funcionam corretamente no mobile (drawer + overlay)
- Verificar que grids colapsam corretamente

### Task 7.2 — Validação de acessibilidade

- Adicionar `aria-label` em todos os botões com ícone e sem texto (sidebar colapsada, hamburger, close)
- Verificar contraste de texto sobre `glass` e `glass-dark` (mínimo AA 4.5:1)
- Verificar `focus-visible` em todos os elementos interativos (`ring-2 ring-brand-teal ring-offset-2`)
- Confirmar que `prefers-reduced-motion` desativa animações corretamente

### Task 7.3 — Limpeza de código legado

- Remover arquivos `.scss` vazios (landing.scss, trilha.scss, login.scss, admin-dashboard.scss, app.scss) se não estiverem sendo usados
- Remover classes Tailwind antigas não utilizadas
- Remover imports não utilizados
- Verificar que a pasta `shared/ui/` está organizada conforme a spec

### Task 7.4 — Build de produção e validação final

- Executar `ng build` no modo produção
- Verificar que o bundle size é razoável
- Confirmar que todas as fontes e assets carregam corretamente
- Verificar que view transitions funcionam entre todas as rotas

---

## Resumo de Fases e Branches

| Fase | Branch | Tasks | Foco |
|---|---|---|---|
| 1 | `feat/design-tokens` | 1.1 – 1.6 | Tailwind, tipografia, styles.scss, logo, view transitions, migração de cores |
| 2 | `feat/ui-primitives` | 2.1 – 2.9 | Logo, Button, Input, Badge, Avatar, ProgressBar, BackLink, SectionHeader |
| 3 | `feat/ui-molecules` | 3.1 – 3.9 | Card, GlassCard, StatCard, ModuleCard, MaterialItem, ArticleCard, VideoPlayer, PageContainer |
| 4 | `feat/ui-layouts` | 4.1 – 4.6 | NavHeader, SidebarLink, Sidebar, Footer, AdminLayout |
| 5 | `feat/directives` | 5.1 – 5.3 | AnimateOnScroll, Glass directive |
| 6 | `feat/redesign-screens` | 6.1 – 6.10 | Landing, Login, AVA Layout, Hub, Trilha, Perfil, Materiais, Artigos, Admin Dashboard |
| 7 | `feat/polish` | 7.1 – 7.4 | Responsividade, acessibilidade, limpeza, build final |

**Total: 7 fases, 38 tasks**

> **Merge final:** Todas as branches `feat/*` serão mergeadas em `release/002-design-componentizacao`
> **Validação:** Subir em `localhost:4200` e verificar todas as rotas
