# Spec 002 — Design System & Componentização

**Projeto:** Plataforma E-learning "Imersão RH Estratégico"
**Especialista:** Lidiane Delcastanher
**Autor da Especificação:** Leno Borges
**Baseada em:** Spec 001 — MVP (funcionalidades concluídas)

---

## 1. Visão Geral e Objetivos

Esta especificação tem como objetivo realizar um **redesign completo** da interface da plataforma Delcastanher, elevando o visual do MVP funcional para um **design profissional, moderno e único**. O foco está em:

1. **Padronização Visual** — Criar um Design System coeso com tokens de cor, tipografia, espaçamento e componentes reutilizáveis.
2. **Componentização** — Extrair elementos visuais repetidos (cards, headers, sidebars, iframes, botões, inputs, badges, progress bars) em componentes Angular standalone compartilhados.
3. **Glassmorphism Discreto** — Aplicar efeitos de vidro fosco (`backdrop-blur`, transparências) de forma sutil, sem comprometer legibilidade.
4. **Gradientes Sutis** — Utilizar gradientes baseados na paleta oficial para fundos, overlays e destaques.
5. **Animações e View Transitions** — Implementar transições fluidas entre rotas e micro-animações de entrada/saída nos componentes.
6. **Identidade Visual com a Logo SVG** — Integrar a logo oficial SVG na aplicação e derivar toda a paleta de cores a partir dela.

---

## 2. Paleta de Cores Oficial (Extraída da Logo SVG)

As cores foram extraídas diretamente do arquivo `Logo Delcastanher.svg`:

### 2.1. Cores Primárias

| Token | Hex | Uso |
|---|---|---|
| `navy` | `#244779` | Cor primária principal. Textos de destaque, headers, sidebar admin, footer, títulos. Transmite autoridade e confiança. |
| `teal` | `#168A91` | Cor de ação e acento. CTAs, links ativos, badges, ícones interativos, borda de foco. Transmite inovação e humanização. |

### 2.2. Cores Secundárias (Gradientes da Logo)

| Token | Hex | Uso |
|---|---|---|
| `teal-light` | `#28C3D9` | Gradientes decorativos, hovers de destaque, highlights. Ponto médio do gradiente teal. |
| `steel` | `#5F91AD` | Tom intermediário entre navy e teal. Textos secundários sofisticados, bordas sutis, overlays. |

### 2.3. Gradientes Oficiais

Derivados dos `<linearGradient>` da logo:

| Nome | Composição | Uso |
|---|---|---|
| `gradient-teal` | `#168A91 → #28C3D9 → #168A91` | Backgrounds decorativos, hero overlays, barras de progresso, botões premium. |
| `gradient-navy` | `#244779 → #5F91AD → #244779` | Sidebars, footers, seções escuras, cards de destaque. |
| `gradient-brand` | `#244779 → #168A91` | Diagonal decorativa cross-brand, badges, banners. |
| `gradient-glass` | `rgba(36,71,121,0.05) → rgba(22,138,145,0.05)` | Glassmorphism backgrounds para cards e painéis. |

### 2.4. Cores Neutras (Superfícies e Texto)

| Token | Hex | Uso |
|---|---|---|
| `surface` | `#F8FAFC` | Background principal da aplicação (substituir `#F3F4F6`). |
| `surface-elevated` | `#FFFFFF` | Cards, modais, popovers. |
| `surface-glass` | `rgba(255,255,255,0.70)` | Painéis com glassmorphism. |
| `border-subtle` | `rgba(36,71,121,0.08)` | Bordas delicadas derivadas do navy. |
| `border-default` | `rgba(36,71,121,0.12)` | Bordas padrão. |
| `text-primary` | `#1E293B` | Texto principal (slate-800). |
| `text-secondary` | `#64748B` | Texto auxiliar (slate-500). |
| `text-muted` | `#94A3B8` | Labels, placeholders (slate-400). |

### 2.5. Cores de Estado

| Token | Hex | Uso |
|---|---|---|
| `success` | `#059669` | Módulo concluído, ação positiva. |
| `warning` | `#D97706` | Alertas, pendências. |
| `danger` | `#DC2626` | Erros, ação de sair/excluir. |
| `info` | `#28C3D9` | Reutiliza o teal-light para notificações e dicas. |

---

## 3. Configuração do Tailwind (tokens centralizados)

O arquivo `tailwind.config.js` deve ser reconfigurado com todos os tokens acima para garantir reaproveitamento de classes em toda a aplicação:

```js
// tailwind.config.js
module.exports = {
  content: ["./src/**/*.{html,ts}"],
  theme: {
    extend: {
      colors: {
        brand: {
          navy: '#244779',
          'navy-light': '#2D5A9A',
          teal: '#168A91',
          'teal-light': '#28C3D9',
          steel: '#5F91AD',
          surface: '#F8FAFC',
        },
        state: {
          success: '#059669',
          warning: '#D97706',
          danger: '#DC2626',
          info: '#28C3D9',
        }
      },
      backgroundImage: {
        'gradient-teal': 'linear-gradient(135deg, #168A91, #28C3D9, #168A91)',
        'gradient-navy': 'linear-gradient(135deg, #244779, #5F91AD, #244779)',
        'gradient-brand': 'linear-gradient(135deg, #244779, #168A91)',
        'gradient-glass': 'linear-gradient(135deg, rgba(36,71,121,0.05), rgba(22,138,145,0.05))',
        'gradient-hero': 'linear-gradient(135deg, #244779 0%, #168A91 50%, #28C3D9 100%)',
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', '"Inter"', 'system-ui', '-apple-system', 'sans-serif'],
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
      boxShadow: {
        'glass': '0 8px 32px rgba(36, 71, 121, 0.08)',
        'glass-lg': '0 16px 48px rgba(36, 71, 121, 0.12)',
        'glow-teal': '0 0 20px rgba(22, 138, 145, 0.15)',
        'glow-navy': '0 0 20px rgba(36, 71, 121, 0.15)',
        'card': '0 1px 3px rgba(36, 71, 121, 0.06), 0 1px 2px rgba(36, 71, 121, 0.04)',
        'card-hover': '0 10px 40px rgba(36, 71, 121, 0.10)',
      },
      animation: {
        'fade-in': 'fadeIn 0.6s ease-out',
        'fade-in-up': 'fadeInUp 0.6s ease-out',
        'fade-in-down': 'fadeInDown 0.6s ease-out',
        'slide-in-left': 'slideInLeft 0.4s ease-out',
        'slide-in-right': 'slideInRight 0.4s ease-out',
        'scale-in': 'scaleIn 0.3s ease-out',
        'shimmer': 'shimmer 2s infinite linear',
        'float': 'float 6s ease-in-out infinite',
        'pulse-soft': 'pulseSoft 3s ease-in-out infinite',
        'gradient-shift': 'gradientShift 8s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeInDown: {
          '0%': { opacity: '0', transform: 'translateY(-20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInLeft: {
          '0%': { opacity: '0', transform: 'translateX(-30px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        slideInRight: {
          '0%': { opacity: '0', transform: 'translateX(30px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '0.6' },
          '50%': { opacity: '1' },
        },
        gradientShift: {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
      },
    },
  },
  plugins: [],
}
```

---

## 4. Tipografia

### 4.1. Fonte Primária

Adotar **Plus Jakarta Sans** como fonte principal (Google Fonts). Fallback para Inter e system-ui.

Incluir no `index.html`:
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800&display=swap" rel="stylesheet">
```

### 4.2. Escala Tipográfica

| Elemento | Classe Tailwind | Peso |
|---|---|---|
| Display (Hero) | `text-5xl md:text-7xl` | `font-extrabold` (800) |
| H1 — Título de Página | `text-3xl md:text-4xl` | `font-bold` (700) |
| H2 — Subtítulo de Seção | `text-2xl md:text-3xl` | `font-bold` (700) |
| H3 — Título de Card | `text-lg md:text-xl` | `font-semibold` (600) |
| Body | `text-base` | `font-normal` (400) |
| Caption / Label | `text-xs` | `font-bold` (700) + `uppercase tracking-widest` |
| Overline (tag) | `text-[11px]` | `font-bold` + `uppercase tracking-[0.15em]` |

---

## 5. Glassmorphism — Diretrizes

### 5.1. Princípios

- **Discrição**: O glassmorphism é um realce visual, não o foco. Usar com moderação.
- **Legibilidade**: Todo texto sobre glass deve ter contraste mínimo AA (4.5:1).
- **Consistência**: Mesmos valores de blur e transparência em toda a aplicação.

### 5.2. Receita Base

```scss
// Classe utilitária global — adicionar no styles.scss via @layer
@layer components {
  .glass {
    @apply bg-white/70 backdrop-blur-xl border border-white/20;
    box-shadow: 0 8px 32px rgba(36, 71, 121, 0.08);
  }

  .glass-dark {
    @apply bg-brand-navy/80 backdrop-blur-xl border border-white/10 text-white;
    box-shadow: 0 8px 32px rgba(36, 71, 121, 0.25);
  }

  .glass-teal {
    @apply bg-brand-teal/10 backdrop-blur-lg border border-brand-teal/20;
  }
}
```

### 5.3. Onde Aplicar

| Elemento | Intensidade |
|---|---|
| Navbar/Header (sticky) | `glass` — background translúcido ao scrollar |
| Cards de KPI (Dashboard Admin) | `glass` com borda gradiente sutil |
| Sidebar do AVA | `glass-dark` sobre fundo navy |
| Modais / Overlays | `glass` no backdrop |
| Hero overlay (Landing) | Gradiente com camada glass |
| Cards de módulo (Trilha) | `glass` no estado hover |

---

## 6. Logo — Integração na Aplicação

### 6.1. Arquivo

O arquivo `Logo Delcastanher.svg` deve ser copiado para `src/assets/logo-delcastanher.svg` e utilizado em substituição ao `assets/logo.jpg` em todo o projeto.

### 6.2. Variações de Uso

| Contexto | Tamanho | Tratamento |
|---|---|---|
| Navbar (Landing) | `h-10` | SVG inline ou `<img>`, sem fundo adicional |
| Navbar (AVA/Admin) | `h-8` | SVG compacto |
| Footer | `h-12` | SVG com filtro brightness sobre fundo escuro |
| Login (centralizado) | `h-16 w-16` | SVG centralizado acima do formulário |
| Favicon | 32×32 | Versão simplificada (apenas o ícone central) |

### 6.3. Componente Logo

Criar um componente `LogoComponent` em `shared/ui/logo/` que aceite inputs de tamanho e variação (claro/escuro), renderizando o SVG inline para que herde as cores do contexto.

---

## 7. Componentização — Arquitetura de Componentes Compartilhados

### 7.1. Estrutura de Pastas

```
src/app/shared/
├── ui/
│   ├── logo/
│   │   └── logo.ts                  # Componente da logo SVG
│   ├── card/
│   │   └── card.ts                  # Card com glass, gradiente, variantes
│   ├── glass-card/
│   │   └── glass-card.ts            # Card glassmorphism com borda gradiente
│   ├── stat-card/
│   │   └── stat-card.ts             # KPI card (Dashboard Admin)
│   ├── nav-header/
│   │   └── nav-header.ts            # Header/Navbar reutilizável
│   ├── sidebar/
│   │   └── sidebar.ts               # Sidebar genérica (links, toggle)
│   ├── sidebar-link/
│   │   └── sidebar-link.ts          # Item de navegação da sidebar
│   ├── video-player/
│   │   └── video-player.ts          # Player de vídeo (Mux desde a Spec 010; era wrapper de iframe)
│   ├── progress-bar/
│   │   └── progress-bar.ts          # Barra de progresso com gradiente
│   ├── module-card/
│   │   └── module-card.ts           # Card de módulo (trilha/landing)
│   ├── material-item/
│   │   └── material-item.ts         # Item de material para download
│   ├── article-card/
│   │   └── article-card.ts          # Card de artigo com thumbnail
│   ├── badge/
│   │   └── badge.ts                 # Badge/tag com variantes
│   ├── button/
│   │   └── button.ts                # Botão com variantes (primary, secondary, ghost, danger)
│   ├── input/
│   │   └── input.ts                 # Input com label e estilo padronizado
│   ├── avatar/
│   │   └── avatar.ts                # Avatar circular com iniciais ou imagem
│   ├── section-header/
│   │   └── section-header.ts        # Título de seção com overline
│   ├── back-link/
│   │   └── back-link.ts             # Link "Voltar ao Hub"
│   ├── page-container/
│   │   └── page-container.ts        # Wrapper de página com max-width e padding
│   └── footer/
│       └── footer.ts                # Footer reutilizável
├── layouts/
│   ├── auth-layout/
│   │   └── auth-layout.ts           # Layout da página de login
│   └── admin-layout/
│       └── admin-layout.ts          # Layout do admin com sidebar
└── directives/
    ├── animate-on-scroll.ts          # Diretiva para animações ao entrar no viewport
    └── glass.ts                      # Diretiva para aplicar glassmorphism
```

### 7.2. Especificação dos Componentes Principais

#### `CardComponent`
- **Inputs:** `variant: 'default' | 'glass' | 'elevated' | 'outline'`, `hover: boolean`, `padding: 'sm' | 'md' | 'lg'`
- **Visual:** Cantos `rounded-2xl`, sombra `shadow-card`, transição hover para `shadow-card-hover` e `translateY(-2px)`
- **Glass variant:** `bg-white/70 backdrop-blur-xl border-white/20`

#### `StatCardComponent` (KPI)
- **Inputs:** `label: string`, `value: string`, `icon: TemplateRef`, `trend?: 'up' | 'down'`, `trendValue?: string`
- **Visual:** Glass card com borda superior `gradient-brand`, ícone com fundo teal translúcido
- **Animação:** Valor numérico com `countUp` animation ao entrar no viewport

#### `NavHeaderComponent`
- **Inputs:** `variant: 'landing' | 'app' | 'admin'`, `userName?: string`, `userInitials?: string`
- **Visual:** `glass` quando sticky no scroll, logo SVG à esquerda, navegação ao centro, ações à direita
- **Responsivo:** Menu hamburger no mobile com drawer animado

#### `SidebarComponent`
- **Inputs:** `links: SidebarLink[]`, `expanded: signal<boolean>`, `variant: 'dark' | 'light'`
- **Visual (dark):** `glass-dark` sobre `bg-gradient-navy`, links com hover `bg-white/10`
- **Visual (light):** `glass` sobre `bg-white`, links com hover `bg-brand-teal/5`
- **Animação:** Transição suave de largura (`w-16` ↔ `w-64`) com `duration-300`

#### `VideoPlayerComponent`
- **Inputs:** `src: string`, `poster?: string`, `title: string`, `subtitle?: string`
- **Visual:** Container `aspect-video rounded-2xl overflow-hidden` com overlay gradiente e botão play centralizado
- **Responsivo:** 100% width do container pai
> **Atualizado pela Spec 010 (decisão 8):** o "wrapper de iframe" descrito aqui foi DEPRECATED. O componente passou a embutir `<mux-player>` com playback assinado, e o input `src` deu lugar a `playbackId` + token. O tratamento visual (aspect-video, overlay, poster) foi preservado.

#### `ProgressBarComponent`
- **Inputs:** `value: number` (0-100), `variant: 'teal' | 'brand' | 'gradient'`, `size: 'sm' | 'md'`, `showLabel: boolean`
- **Visual (gradient):** Barra preenchida com `bg-gradient-teal`, track com `bg-brand-navy/5`
- **Animação:** Transição CSS do width ao mudar valor, shimmer effect opcional

#### `ModuleCardComponent`
- **Inputs:** `moduleNumber: number`, `title: string`, `completed: boolean`, `active: boolean`
- **Visual:** Border-left `brand-teal` quando ativo, ícone de check com `gradient-teal` quando completo
- **Hover:** Glass effect sutil com `shadow-glow-teal`

#### `ButtonComponent`
- **Inputs:** `variant: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline'`, `size: 'sm' | 'md' | 'lg'`, `loading: boolean`, `fullWidth: boolean`
- **Primary:** `bg-gradient-brand text-white` com hover `shadow-glow-teal`
- **Secondary:** `bg-brand-navy text-white`
- **Ghost:** `text-brand-teal hover:bg-brand-teal/5`
- **Animação:** `scale(0.98)` no active, spinner ao loading

#### `InputComponent`
- **Inputs:** `label: string`, `placeholder: string`, `type: string`, `error?: string`
- **Visual:** Borda `border-brand-navy/10`, foco com `border-brand-teal ring-2 ring-brand-teal/20`
- **Glass context:** Background `bg-white/80` quando sobre superfície glass

#### `AvatarComponent`
- **Inputs:** `src?: string`, `initials: string`, `size: 'sm' | 'md' | 'lg'`
- **Visual:** Circular com `bg-gradient-brand` quando sem imagem, borda `ring-2 ring-white`

#### `BadgeComponent`
- **Inputs:** `variant: 'teal' | 'navy' | 'success' | 'warning' | 'danger'`, `label: string`
- **Visual:** `rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider`

#### `SectionHeaderComponent`
- **Inputs:** `overline: string`, `title: string`, `align: 'left' | 'center'`
- **Visual:** Overline em `text-brand-teal uppercase tracking-widest text-xs font-bold`, título em `text-brand-navy font-bold`

#### `BackLinkComponent`
- **Inputs:** `routerLink: string`, `label: string` (default: "Voltar ao Hub")
- **Visual:** Ícone seta + label em `text-brand-steel hover:text-brand-teal`

#### `FooterComponent`
- **Inputs:** Nenhum (conteúdo estático da marca)
- **Visual:** `bg-gradient-navy`, logo variação clara, links sociais, gradiente decorativo no topo

---

## 8. Estilos Globais Padronizados (`styles.scss`)

```scss
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  *,
  *::before,
  *::after {
    @apply transition-colors duration-200;
  }

  body {
    @apply bg-brand-surface text-slate-800 antialiased;
    font-family: 'Plus Jakarta Sans', 'Inter', system-ui, -apple-system, sans-serif;
  }

  ::selection {
    @apply bg-brand-teal/20 text-brand-navy;
  }

  /* Scrollbar personalizada */
  ::-webkit-scrollbar {
    @apply w-2;
  }
  ::-webkit-scrollbar-track {
    @apply bg-transparent;
  }
  ::-webkit-scrollbar-thumb {
    @apply bg-brand-navy/15 rounded-full hover:bg-brand-navy/25;
  }
}

@layer components {
  /* Glassmorphism */
  .glass {
    @apply bg-white/70 backdrop-blur-xl;
    border: 1px solid rgba(255, 255, 255, 0.2);
    box-shadow: 0 8px 32px rgba(36, 71, 121, 0.08);
  }

  .glass-dark {
    @apply bg-brand-navy/80 backdrop-blur-xl text-white;
    border: 1px solid rgba(255, 255, 255, 0.1);
    box-shadow: 0 8px 32px rgba(36, 71, 121, 0.25);
  }

  .glass-teal {
    @apply bg-brand-teal/10 backdrop-blur-lg;
    border: 1px solid rgba(22, 138, 145, 0.2);
  }

  /* Gradient borders */
  .border-gradient-brand {
    border-image: linear-gradient(135deg, #244779, #168A91) 1;
  }

  /* Gradient text */
  .text-gradient-brand {
    @apply bg-gradient-brand bg-clip-text text-transparent;
  }

  .text-gradient-teal {
    @apply bg-gradient-teal bg-clip-text text-transparent;
  }

  /* Decorative blobs */
  .blob-teal {
    @apply absolute rounded-full bg-brand-teal/5 blur-3xl pointer-events-none;
  }

  .blob-navy {
    @apply absolute rounded-full bg-brand-navy/5 blur-3xl pointer-events-none;
  }
}
```

---

## 9. Animações e Transições

### 9.1. View Transitions (Angular Router)

Habilitar a API nativa de View Transitions do Angular para transições suaves entre rotas:

```typescript
// app.config.ts
import { provideRouter, withViewTransitions } from '@angular/router';

export const appConfig = {
  providers: [
    provideRouter(routes, withViewTransitions()),
  ]
};
```

CSS complementar para view transitions:

```css
/* styles.scss */
::view-transition-old(root) {
  animation: fade-out 0.25s ease-out;
}

::view-transition-new(root) {
  animation: fade-in 0.25s ease-in;
}

@keyframes fade-out {
  from { opacity: 1; transform: scale(1); }
  to { opacity: 0; transform: scale(0.98); }
}
```

### 9.2. Micro-animações por Componente

| Componente | Animação | Trigger |
|---|---|---|
| Cards | `fade-in-up` + stagger delay via `animation-delay` | Scroll into view |
| Sidebar | `slide-in-left` | Toggle expand |
| Modais | `scale-in` + `fade-in` | Open |
| Botões | `scale(0.98)` → `scale(1)` | Active/Click |
| Barras de progresso | Width transition `duration-700 ease-out` | Valor alterado |
| KPI values | `countUp` (valor numérico incremental) | Viewport entry |
| Hero images | `float` (movimento suave contínuo) | Contínua |
| Gradient backgrounds | `gradient-shift` (background-position) | Contínua |
| Hover em cards | `translateY(-4px) + shadow-card-hover` | Mouse enter |
| Page enter | `fade-in-up` via view transition | Navegação |

### 9.3. Diretiva `animateOnScroll`

Criar uma diretiva Angular que observe a entrada do elemento no viewport via `IntersectionObserver` e aplique uma classe CSS de animação:

```typescript
// shared/directives/animate-on-scroll.ts
@Directive({ selector: '[animateOnScroll]' })
export class AnimateOnScroll implements AfterViewInit {
  animateOnScroll = input<string>('animate-fade-in-up');
  // ... IntersectionObserver logic
}
```

---

## 10. Redesign por Tela

### 10.1. Landing Page

**Mudanças visuais:**
- **Navbar:** Glass effect ao scrollar (`glass` class), logo SVG inline, links com underline animado no hover
- **Hero:** Fundo com `gradient-hero` diagonal, decoração com blobs `blob-teal` e `blob-navy` animados (`float`, `pulse-soft`), tipografia display `text-5xl md:text-7xl font-extrabold`, botão CTA com `bg-gradient-brand` e sombra `glow-teal`
- **Seção Mentora:** Stats com `glass-card` e ícone gradiente
- **Quote Section:** Glassmorphism escuro (`glass-dark`), texto com `text-gradient-teal` no nome
- **Cards de Pilares:** `GlassCardComponent` com hover `shadow-glow-teal`, ícone com transição de cor
- **Grade Curricular:** `ModuleCardComponent` com animação stagger `animateOnScroll`
- **Prova Social:** Logos com grayscale → colorido on hover, carousel suave
- **Footer:** `FooterComponent` com `bg-gradient-navy` e decoração gradiente no topo

### 10.2. Login

**Mudanças visuais:**
- **Background:** Split-screen — metade esquerda com `gradient-hero` + logo SVG grande + blob decorativo, metade direita com formulário
- **Card do formulário:** `glass` com padding generoso, logo `h-16` centralizado acima
- **Inputs:** `InputComponent` padronizado com bordas suaves e foco `ring-brand-teal`
- **Botões:** `ButtonComponent` primary e secondary, sem dois botões "Entrar como X" — substituir por toggle ou select de role
- **Animação:** Card com `scale-in` na entrada

### 10.3. Ambiente Virtual do Aluno (AVA)

**Layout:**
- **Sidebar:** `SidebarComponent` variant `dark` com `glass-dark` sobre gradiente navy. Logo SVG compacta no topo. Links com `SidebarLinkComponent` e indicador ativo com barra lateral `gradient-teal`. Transição suave de collapse/expand.
- **Header:** `NavHeaderComponent` variant `app` com glass effect, breadcrumb contextual, avatar à direita
- **Conteúdo:** `PageContainerComponent` com max-width e padding responsivo

**Hub (Home):**
- Cards de navegação como `GlassCardComponent` com ícone gradiente, hover com `shadow-glow-teal` e `translateY(-4px)`
- Grid responsivo `1 → 2 → 4` colunas
- Mensagem de boas-vindas com `SectionHeaderComponent`

**Trilha:**
- Sidebar de módulos com `ModuleCardComponent`
- Player de vídeo com `VideoPlayerComponent`
- Progresso com `ProgressBarComponent` variant `gradient`
- Materiais com `MaterialItemComponent`

**Perfil / Materiais / Artigos:**
- Usar `PageContainerComponent`, `BackLinkComponent`, `InputComponent`, `CardComponent`, `ArticleCardComponent`
- Animação `fade-in-up` na entrada de cada página

### 10.4. Dashboard Admin

**Layout:**
- Sidebar de navegação em `SidebarComponent` variant `light` com glass sutil
- Header `NavHeaderComponent` variant `admin`

**Visão Geral:**
- KPI cards como `StatCardComponent` com gradiente e glass
- Tabela em card com header sticky, rows com hover `bg-brand-teal/5`
- Barras de progresso na tabela com `ProgressBarComponent`

**Demais abas:** Padronizar inputs, selects, textareas, e botões usando os componentes compartilhados.

---

## 11. Padrões CSS e Reaproveitamento

### 11.1. Regras de Consistência

1. **Nunca usar cores hardcoded** — Todas as cores devem vir dos tokens Tailwind definidos (`brand-navy`, `brand-teal`, etc.)
2. **Nunca duplicar padrões de card** — Usar `CardComponent` ou `GlassCardComponent`
3. **Nunca duplicar headers/footers** — Extrair para componentes compartilhados
4. **Bordas sempre `border-brand-navy/8` ou `/12`** — Nunca `border-slate-200` direto
5. **Raios de canto padronizados** — `rounded-xl` para cards internos, `rounded-2xl` para cards maiores, `rounded-3xl` para hero/feature
6. **Sombras apenas dos tokens** — `shadow-card`, `shadow-glass`, `shadow-card-hover`
7. **Espaçamento interno** — Cards: `p-6 md:p-8`, Seções: `py-20 md:py-28 px-4`, Container: `max-w-6xl mx-auto`

### 11.2. Classes Utilitárias Reutilizáveis (via `@layer components`)

| Classe | Descrição |
|---|---|
| `.glass` | Glassmorphism claro padrão |
| `.glass-dark` | Glassmorphism escuro (sidebar, footer) |
| `.glass-teal` | Glassmorphism com tom teal |
| `.text-gradient-brand` | Texto com gradiente brand |
| `.border-gradient-brand` | Borda com gradiente brand |
| `.blob-teal` / `.blob-navy` | Bolhas decorativas de background |
| `.section-container` | `max-w-6xl mx-auto px-4` |

---

## 12. Responsividade

Manter a abordagem **Mobile First** da Spec 001. Breakpoints Tailwind padrão:

| Breakpoint | Largura | Comportamento |
|---|---|---|
| Default (mobile) | `< 768px` | Sidebar colapsada/drawer, stacking vertical, cards full-width |
| `md` | `≥ 768px` | Grid 2 colunas, sidebar visível, layout lado a lado |
| `lg` | `≥ 1024px` | Grid 3-4 colunas, espaçamentos maiores |
| `xl` | `≥ 1280px` | Max-width containers, margens laterais amplas |

---

## 13. Acessibilidade

- **Contraste**: Todos os textos sobre glass devem manter ratio AA (4.5:1 para texto normal, 3:1 para texto grande)
- **Focus visible**: Manter `ring-2 ring-brand-teal ring-offset-2` em todos os elementos interativos
- **Prefers-reduced-motion**: Desabilitar animações decorativas para usuários que preferem movimento reduzido
- **ARIA labels**: Em todos os botões com ícone e sem texto, sidebar links quando colapsada

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## 14. Stack e Dependências

- **Angular** 20.x (já instalado)
- **Tailwind CSS** 3.x (já instalado)
- **Plus Jakarta Sans** (Google Fonts — adicionar)
- **Nenhuma lib UI externa** — Todos os componentes são customizados

---

## 15. Definição de Pronto (DoD)

Uma task desta spec é considerada concluída quando:

1. O componente está implementado como standalone Angular component em `shared/ui/`
2. Os tokens de cor/sombra/animação do Tailwind estão atualizados
3. O componente é utilizado em todas as telas que possuíam o elemento duplicado
4. O visual é consistente em mobile (`< 768px`), tablet (`md`) e desktop (`lg+`)
5. As animações respeitam `prefers-reduced-motion`
6. O build (`ng build`) passa sem erros
7. A logo SVG substitui o `logo.jpg` em todos os pontos de uso
