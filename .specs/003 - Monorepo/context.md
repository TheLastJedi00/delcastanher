# Spec 003 — Reestruturação para Monorepo

**Projeto:** Plataforma E-learning "Imersão RH Estratégico"
**Especialista:** Lidiane Delcastanher
**Autor da Especificação:** Leno Borges
**Baseada em:** Spec 001 (MVP) e Spec 002 (Design System)

---

## 1. Visão Geral e Objetivos

O repositório atual (`delcastanher-front`) concentra o projeto Angular na raiz, misturando arquivos de configuração do framework com pastas de tooling (`.agents`, `.claude`, `.gemini`, `.specs`, `.vscode`). Esta spec reestrutura o repositório em formato **monorepo**, isolando o código Angular dentro de uma subpasta `front/`, mantendo as pastas de configuração de ferramentas e specs na raiz.

### 1.1. Objetivos

1. **Separação de concerns** — O código Angular fica em `front/`, pronto para futuramente conviver com `api/`, `docs/`, ou outros workspaces.
2. **Raiz limpa** — A raiz contém apenas metadados do repositório (`.git`, `.gitignore`, `README.md`) e pastas de ferramentas/specs.
3. **Deploy funcional** — A Vercel continua fazendo build e deploy sem quebras, apontando para o novo diretório.
4. **Zero downtime** — Nenhuma funcionalidade é perdida. Os caminhos internos do Angular permanecem relativos dentro de `front/`.

---

## 2. Estrutura Atual do Repositório

```
delcastanher-front/             ← raiz do git
├── .agents/                    ← ✅ manter na raiz
│   ├── agy.md
│   └── skills/
│       └── angular-developer/
├── .angular/                   ← 🔽 mover para front/ (cache do Angular CLI)
├── .claude/                    ← ✅ manter na raiz
│   ├── CLAUDE.md
│   └── skills/
│       └── skill-angular-developer.md
├── .editorconfig               ← ✅ manter na raiz (configuração global do editor)
├── .gemini/                    ← ✅ manter na raiz
│   └── GEMINI.md
├── .git/                       ← ✅ manter na raiz (nunca mover)
├── .gitignore                  ← ✅ manter na raiz (atualizar paths)
├── .specs/                     ← ✅ manter na raiz
│   ├── 001 - MVP/
│   ├── 002 - Design e Componentização/
│   └── 003 - Monorepo/
├── .vscode/                    ← ✅ manter na raiz
│   ├── extensions.json
│   ├── launch.json
│   └── tasks.json
├── README.md                   ← ✅ manter na raiz (atualizar conteúdo)
├── angular.json                ← 🔽 mover para front/
├── dist/                       ← 🔽 mover para front/ (output de build)
├── node_modules/               ← 🔽 mover para front/ (dependências)
├── package-lock.json           ← 🔽 mover para front/
├── package.json                ← 🔽 mover para front/
├── public/                     ← 🔽 mover para front/ (assets estáticos)
│   ├── assets/
│   │   ├── aula1.jpeg
│   │   ├── aula2.jpeg
│   │   ├── aula3.jpeg
│   │   ├── autoridade.jpeg
│   │   ├── extra.jpeg
│   │   ├── hero.jpeg
│   │   ├── logo-delcastanher.svg
│   │   └── nova_mentora.jpeg
│   └── favicon.ico
├── src/                        ← 🔽 mover para front/ (código-fonte)
│   ├── app/
│   │   ├── app.ts
│   │   ├── app.config.ts
│   │   ├── app.routes.ts
│   │   ├── app.spec.ts
│   │   ├── core/
│   │   │   ├── guards/
│   │   │   │   └── auth.guard.ts
│   │   │   └── services/
│   │   │       └── mock-data.service.ts
│   │   ├── features/
│   │   │   ├── admin/
│   │   │   │   └── dashboard/
│   │   │   │       └── admin-dashboard/
│   │   │   ├── auth/
│   │   │   │   └── login/
│   │   │   ├── landing/
│   │   │   └── student/
│   │   │       ├── artigos/
│   │   │       ├── hub/
│   │   │       ├── layout/
│   │   │       ├── materiais/
│   │   │       ├── perfil/
│   │   │       └── trilha/
│   │   └── shared/
│   │       ├── directives/
│   │       │   ├── animate-on-scroll.ts
│   │       │   └── glass.ts
│   │       ├── layouts/
│   │       │   └── admin-layout/
│   │       └── ui/
│   │           ├── article-card/
│   │           ├── avatar/
│   │           ├── back-link/
│   │           ├── badge/
│   │           ├── button/
│   │           ├── card/
│   │           ├── footer/
│   │           ├── glass-card/
│   │           ├── input/
│   │           ├── logo/
│   │           ├── material-item/
│   │           ├── module-card/
│   │           ├── nav-header/
│   │           ├── page-container/
│   │           ├── progress-bar/
│   │           ├── section-header/
│   │           ├── sidebar/
│   │           ├── sidebar-link/
│   │           ├── stat-card/
│   │           └── video-player/
│   ├── index.html
│   ├── main.ts
│   └── styles.scss
├── tailwind.config.js          ← 🔽 mover para front/
├── tsconfig.app.json           ← 🔽 mover para front/
├── tsconfig.json               ← 🔽 mover para front/
└── tsconfig.spec.json          ← 🔽 mover para front/
```

---

## 3. Estrutura Alvo (Monorepo)

```
delcastanher-front/             ← raiz do git
├── .agents/                    ← configuração de agentes IA
│   ├── agy.md
│   └── skills/
│       └── angular-developer/
├── .claude/
│   ├── CLAUDE.md
│   └── skills/
├── .editorconfig               ← configuração global do editor
├── .gemini/
│   └── GEMINI.md
├── .git/
├── .gitignore                  ← atualizado com paths front/*
├── .specs/                     ← especificações do projeto
│   ├── 001 - MVP/
│   ├── 002 - Design e Componentização/
│   └── 003 - Monorepo/
├── .vscode/                    ← configuração do VS Code
│   ├── extensions.json
│   ├── launch.json
│   └── tasks.json
├── README.md                   ← documentação geral do repo
│
└── front/                      ← 🆕 workspace Angular
    ├── .angular/               ← cache do Angular CLI (gitignored)
    ├── angular.json
    ├── dist/                   ← output de build (gitignored)
    ├── node_modules/           ← dependências (gitignored)
    ├── package-lock.json
    ├── package.json
    ├── public/
    │   ├── assets/
    │   │   ├── aula1.jpeg
    │   │   ├── aula2.jpeg
    │   │   ├── aula3.jpeg
    │   │   ├── autoridade.jpeg
    │   │   ├── extra.jpeg
    │   │   ├── hero.jpeg
    │   │   ├── logo-delcastanher.svg
    │   │   └── nova_mentora.jpeg
    │   └── favicon.ico
    ├── src/
    │   ├── app/
    │   │   ├── app.ts
    │   │   ├── app.config.ts
    │   │   ├── app.routes.ts
    │   │   ├── core/
    │   │   ├── features/
    │   │   └── shared/
    │   ├── index.html
    │   ├── main.ts
    │   └── styles.scss
    ├── tailwind.config.js
    ├── tsconfig.app.json
    ├── tsconfig.json
    └── tsconfig.spec.json
```

---

## 4. Regra de Classificação — O Que Fica e O Que Move

### 4.1. Fica na Raiz (metadados e tooling do repositório)

| Item | Motivo |
|---|---|
| `.agents/` | Configuração de agentes IA (Antigravity). Independente de workspace. |
| `.claude/` | Configuração do Claude Code (inclui `skills/`). Independente de workspace. |
| `.gemini/` | Configuração do Gemini. Independente de workspace. |
| `.specs/` | Especificações de produto. Independentes da tecnologia. |
| `.vscode/` | Configuração do editor. Aplica-se ao repositório todo. |
| `.git/` | Controle de versão. Nunca mover. |
| `.gitignore` | Regras de ignore. Aplica-se ao repositório todo. Precisa atualização. |
| `.editorconfig` | Formatação global. Aplica-se ao repositório todo. |
| `README.md` | Documentação do repositório. |

### 4.2. Move para `front/` (projeto Angular)

| Item | Motivo |
|---|---|
| `angular.json` | Configuração específica do Angular CLI (`@angular/build:application`). |
| `package.json` | Dependências do projeto Angular (Angular 20, Tailwind v3, Karma, etc.). |
| `package-lock.json` | Lockfile das dependências. |
| `tsconfig.json` | Configuração TypeScript base (references `tsconfig.app.json` e `tsconfig.spec.json`). |
| `tsconfig.app.json` | Config de compilação da app (inclui `src/**/*.ts`). |
| `tsconfig.spec.json` | Config de compilação dos testes (inclui `src/**/*.spec.ts`). |
| `tailwind.config.js` | Configuração do Tailwind CSS v3 (design tokens, cores, animações). |
| `src/` | Código-fonte do Angular (`app.ts`, `app.config.ts`, `app.routes.ts`, features, shared, core). |
| `public/` | Assets estáticos (`assets/`, `favicon.ico`). |
| `dist/` | Output de build (gitignored). |
| `node_modules/` | Dependências instaladas (gitignored). |
| `.angular/` | Cache do Angular CLI (gitignored). |

---

## 5. Arquivos que Precisam de Ajuste de Conteúdo

### 5.1. `.gitignore` (raiz)

O `.gitignore` atual usa paths relativos à raiz com `/` inicial. Após a movimentação, os paths de ignore para `dist/`, `node_modules/`, `.angular/cache` e `out-tsc/` precisam ser prefixados com `front/`.

> **Nota:** O `.gitignore` atual tem uma linha redundante `dist/` no final (sem `/` inicial) que já captura qualquer `dist/` em qualquer nível. Essa redundância deve ser limpa na atualização.

**Antes:**
```gitignore
# Compiled output
/dist
/tmp
/out-tsc
/bazel-out

# Node
/node_modules
npm-debug.log
yarn-error.log

# Miscellaneous
/.angular/cache

*libs
dist/
```

**Depois:**
```gitignore
# Compiled output
front/dist/
front/out-tsc/
/tmp
/bazel-out

# Node
front/node_modules/
npm-debug.log
yarn-error.log

# Angular CLI cache
front/.angular/cache
```

### 5.2. `angular.json` (dentro de `front/`)

O `angular.json` usa o builder `@angular/build:application` com caminhos relativos (`src/main.ts`, `src/styles.scss`, `public/`, `tsconfig.app.json`, `tsconfig.spec.json`). Como será executado a partir de `front/`, **não precisa de alteração nos paths internos**.

Detalhes importantes que permanecem válidos:
- `"$schema": "./node_modules/@angular/cli/lib/config/schema.json"` — `node_modules/` estará dentro de `front/`
- `"browser": "src/main.ts"` — relativo a `front/`
- `"outputPath": "dist/delcastanher-front"` — output relativo a `front/`
- Configuração de `styles`, `assets`, `polyfills` — todos relativos

**Nenhuma alteração necessária no conteúdo do `angular.json`.**

### 5.3. `tsconfig.json`, `tsconfig.app.json`, `tsconfig.spec.json`

Todos usam caminhos relativos (`./`, `src/`). O `tsconfig.json` base referencia os outros via `"references"`:
```json
{
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.spec.json" }
  ]
}
```

Como serão movidos juntos para `front/`, as referências internas permanecem válidas.

**Nenhuma alteração necessária.**

### 5.4. `tailwind.config.js`

O `content` aponta para `"./src/**/*.{html,ts}"` — como estará dentro de `front/`, continua válido.

Este é um arquivo Tailwind v3 completo com design tokens customizados do projeto (cores `brand.*`, `state.*`, fontes, sombras, animações). A configuração permanece auto-contida.

**Nenhuma alteração necessária.**

### 5.5. `package.json` (dentro de `front/`)

Os scripts utilizam o Angular CLI:
```json
{
  "scripts": {
    "ng": "ng",
    "start": "ng serve",
    "build": "ng build",
    "watch": "ng build --watch --configuration development",
    "test": "ng test"
  }
}
```

Todos executam o Angular CLI relativo ao diretório corrente. Como o `package.json` estará em `front/` junto com `node_modules/`, todos os scripts continuam funcionando se executados de dentro de `front/`.

> **Nota:** Há também uma configuração `"prettier"` inline no `package.json` — ela não depende de paths e continua válida.

**Nenhuma alteração necessária no conteúdo.**

### 5.6. `.vscode/tasks.json` e `.vscode/launch.json`

Precisam ser atualizados para que os comandos apontem para `front/` como diretório de trabalho.

**`tasks.json` atual** — possui duas tasks (`npm: start` e `npm: test`) com `isBackground: true` e `problemMatcher` com padrões TypeScript. Após a movimentação, sem ajuste de `cwd`, o VS Code tentará executar os scripts na raiz (onde não haverá `package.json`) e falhará.

Adicionar `"options": { "cwd": "${workspaceFolder}/front" }` em cada task:

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "type": "npm",
      "script": "start",
      "isBackground": true,
      "options": { "cwd": "${workspaceFolder}/front" },
      "problemMatcher": {
        "owner": "typescript",
        "pattern": "$tsc",
        "background": {
          "activeOnStart": true,
          "beginsPattern": { "regexp": "(.*?)" },
          "endsPattern": { "regexp": "bundle generation complete" }
        }
      }
    },
    {
      "type": "npm",
      "script": "test",
      "isBackground": true,
      "options": { "cwd": "${workspaceFolder}/front" },
      "problemMatcher": {
        "owner": "typescript",
        "pattern": "$tsc",
        "background": {
          "activeOnStart": true,
          "beginsPattern": { "regexp": "(.*?)" },
          "endsPattern": { "regexp": "bundle generation complete" }
        }
      }
    }
  ]
}
```

**`launch.json` atual** — possui duas configurações (`ng serve` e `ng test`) com `preLaunchTask` referenciando as tasks acima. Como as tasks dependem do `cwd` já ajustado, as URLs (`http://localhost:4200/` e `http://localhost:9876/debug.html`) continuam válidas.

**Nenhuma alteração necessária no `launch.json`** — ele depende das tasks já corrigidas.

### 5.7. `.claude/CLAUDE.md` e `.gemini/GEMINI.md`

Ambos os arquivos contêm **apenas diretrizes de boas práticas** para Angular/TypeScript (standalone components, signals, OnPush, templates, state management, services). **Não contêm referências a caminhos de arquivos** (`src/`, `angular.json`, `package.json`) nem instruções de execução de comandos (`npm install`, `ng serve`).

**Nenhuma alteração necessária.** A movimentação para monorepo não afeta o conteúdo desses arquivos.

### 5.8. `README.md`

Atualizar instruções de instalação e desenvolvimento para refletir a nova estrutura:

```markdown
# Delcastanher

Plataforma e-learning para a **Imersão RH Estratégico** de Lidiane Delcastanher.

## Stack

- Angular 20+
- Tailwind CSS 3
- SCSS
- TypeScript 5.9

## Estrutura do Repositório

```
├── .agents/          # Configuração de agentes IA
├── .specs/           # Especificações do projeto
├── .vscode/          # Configuração do VS Code
├── front/            # Projeto Angular (frontend)
│   ├── src/
│   ├── public/
│   ├── angular.json
│   ├── package.json
│   └── ...
└── README.md
```

## Instalação e Desenvolvimento

```bash
cd front
npm install
npm start          # http://localhost:4200
npm run build      # build de produção
npm test           # testes unitários (Karma)
```

## Documentação

Consulte `.specs/` para especificações detalhadas do projeto.
```

---

## 6. Deploy — Reconfiguração da Vercel

### 6.1. Problema

A Vercel atualmente trata a raiz do repositório como o diretório do projeto Angular. Com a mudança para monorepo, o código Angular estará em `front/`, e a Vercel precisa ser informada disso.

### 6.2. Solução A — Configuração via Dashboard da Vercel (Obrigatória)

No painel da Vercel (Settings → General):

| Campo | Valor Atual | Novo Valor |
|---|---|---|
| **Root Directory** | `.` (raiz) | `front` |
| **Build Command** | `npm run build` | `npm run build` (mantém) |
| **Output Directory** | `dist/delcastanher-front` | `dist/delcastanher-front` (mantém, é relativo ao Root Directory) |
| **Install Command** | `npm install` | `npm install` (mantém) |

> Ao definir o **Root Directory** como `front`, a Vercel faz `cd front` antes de executar qualquer comando. Todos os caminhos relativos em `package.json`, `angular.json`, etc. continuam funcionando.

### 6.3. Solução B — Arquivo `vercel.json` dentro de `front/` (complemento)

Criar um `vercel.json` dentro de `front/` como documentação e para configuração de rotas SPA:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "buildCommand": "npm run build",
  "outputDirectory": "dist/delcastanher-front",
  "installCommand": "npm install",
  "framework": "angular"
}
```

> **Nota:** O campo `rootDirectory` no `vercel.json` é ignorado pelo Vercel — ele só aceita esse valor via dashboard ou CLI. O `vercel.json` é processado **depois** de entrar no Root Directory. Portanto, a configuração do dashboard (Solução A) é **obrigatória**. O `vercel.json` dentro de `front/` serve para configuração de rotas, headers, e como documentação.

### 6.4. Checklist de Deploy

1. Alterar **Root Directory** para `front` no dashboard da Vercel
2. Fazer push da branch com a nova estrutura
3. Verificar nos logs do deploy que:
   - `npm install` roda dentro de `front/`
   - `npm run build` encontra `angular.json`
   - O output `dist/delcastanher-front` é servido corretamente
4. Validar que todas as rotas da SPA funcionam (landing, login, ava/*, admin)

---

## 7. Impacto em Ferramentas de IA

### 7.1. Antigravity (`.agents/`)

O Antigravity já descobre o workspace pela raiz do repositório. As skills em `.agents/skills/angular-developer/` continuam acessíveis. O `agy.md` contém instruções de automação (Formatar, Tasks, Executar) que referenciam o conceito de front/backend — após a migração, os comandos de subir em `localhost:4200` devem considerar o `cd front` implícito.

**Nenhuma alteração estrutural necessária.** O `agy.md` é genérico o suficiente.

### 7.2. Claude Code (`.claude/`)

O `CLAUDE.md` contém apenas diretrizes de boas práticas de código (TypeScript strict typing, Angular standalone components, signals, OnPush, templates, services). Não referencia caminhos de arquivos nem comandos de build.

A pasta `.claude/skills/` contém `skill-angular-developer.md` que também é independente de paths.

**Nenhuma alteração necessária.**

### 7.3. Gemini (`.gemini/`)

O `GEMINI.md` é idêntico ao `CLAUDE.md` — diretrizes de boas práticas de código sem referências a caminhos.

**Nenhuma alteração necessária.**

---

## 8. Metodologia de Movimentação

### 8.1. Usar `git mv` (Obrigatório)

Todas as movimentações **devem** ser feitas com `git mv` para preservar o histórico de commits dos arquivos. Não usar `mv` ou copiar+deletar.

```bash
git mv src/ front/src/
git mv public/ front/public/
git mv angular.json front/angular.json
git mv package.json front/package.json
git mv package-lock.json front/package-lock.json
git mv tsconfig.json front/tsconfig.json
git mv tsconfig.app.json front/tsconfig.app.json
git mv tsconfig.spec.json front/tsconfig.spec.json
git mv tailwind.config.js front/tailwind.config.js
```

### 8.2. Ordem de Execução

1. Criar a pasta `front/`
2. Mover todos os arquivos Angular com `git mv`
3. Atualizar `.gitignore`
4. Atualizar `.vscode/tasks.json`
5. Atualizar `README.md`
6. Criar `vercel.json` dentro de `front/` (opcional)
7. Apagar `node_modules/` e reinstalar dentro de `front/`
8. Build de validação
9. Atualizar dashboard da Vercel

### 8.3. node_modules

O `node_modules/` **não** é versionado (está no `.gitignore`). Portanto não pode ser movido com `git mv`. O procedimento é:

1. Deletar `node_modules/` da raiz (se existir)
2. Após mover `package.json` e `package-lock.json` para `front/`
3. Rodar `npm install` dentro de `front/`

### 8.4. .angular/ e dist/

Ambos são gitignored e não podem ser movidos com `git mv`:
- `.angular/` — cache do Angular CLI, será recriado automaticamente ao rodar `ng serve` ou `ng build` dentro de `front/`
- `dist/` — output de build, será recriado ao rodar `npm run build` dentro de `front/`

Deletar ambos da raiz antes do commit.

---

## 9. Definição de Pronto (DoD)

A spec é considerada concluída quando:

1. Toda a árvore de diretórios segue a estrutura descrita na Seção 3
2. `cd front && npm install && npm run build` executa sem erros
3. `cd front && npm start` sobe a aplicação em `localhost:4200` sem erros
4. Todas as rotas funcionam:
   - `/` (Landing Page)
   - `/login`
   - `/ava` (Hub — requer auth)
   - `/ava/trilha`
   - `/ava/perfil`
   - `/ava/materiais`
   - `/ava/artigos`
   - `/admin` (Dashboard Admin — requer auth)
5. O deploy da Vercel conclui com sucesso apontando Root Directory = `front`
6. O histórico git dos arquivos movidos é preservado (`git log --follow front/src/app/app.ts` mostra commits anteriores)
7. As ferramentas de IA (`.agents`, `.claude`, `.gemini`) continuam funcionando
8. O `.gitignore` cobre corretamente `front/node_modules/`, `front/dist/`, `front/.angular/cache`, `front/out-tsc/`
9. O `.vscode/tasks.json` executa `npm start` e `npm test` com `cwd` apontando para `front/`
