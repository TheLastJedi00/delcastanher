# Spec 003 — Tasks: Reestruturação para Monorepo

> Plano de execução dividido em **3 fases** sequenciais.
> Cada fase gera uma branch `feat/<nome>` e cada task gera um commit.
> Ao final, todas as feats serão mergeadas em `release/003-monorepo`.

---

## Fase 1 — Movimentação de Arquivos

> **Branch:** `feat/monorepo-structure`
>
> Move todos os arquivos do projeto Angular para `front/` usando `git mv` para preservar histórico. Nenhuma configuração é alterada ainda.

### Task 1.1 — Criar diretório `front/` e mover código-fonte

- Criar o diretório `front/` na raiz
- Executar `git mv` para os seguintes itens:
  - `src/` → `front/src/`
  - `public/` → `front/public/`

### Task 1.2 — Mover arquivos de configuração do Angular

- Executar `git mv` para cada arquivo:
  - `angular.json` → `front/angular.json`
  - `package.json` → `front/package.json`
  - `package-lock.json` → `front/package-lock.json`
  - `tsconfig.json` → `front/tsconfig.json`
  - `tsconfig.app.json` → `front/tsconfig.app.json`
  - `tsconfig.spec.json` → `front/tsconfig.spec.json`
  - `tailwind.config.js` → `front/tailwind.config.js`

### Task 1.3 — Tratar diretórios não-versionados

Estes diretórios são gitignored e **não podem** ser movidos com `git mv`:

- Deletar `node_modules/` da raiz (`rm -rf node_modules`)
- Deletar `dist/` da raiz (`rm -rf dist`)
- Deletar `.angular/` da raiz (`rm -rf .angular`) — será recriado ao rodar `ng serve` ou `ng build` dentro de `front/`
- Verificar que nenhum arquivo solto da raiz ficou para trás (exceto os que devem permanecer)

### Task 1.4 — Verificar integridade do `git status`

- Executar `git status` e validar que:
  - Todos os `renamed:` mostram o par correto (raiz → front/)
  - Não há `deleted:` sem correspondente `renamed:`
  - Os arquivos que devem permanecer na raiz (`.agents/`, `.claude/`, `.gemini/`, `.specs/`, `.vscode/`, `.editorconfig`, `.gitignore`, `README.md`) não foram tocados
- Commit: `refactor: move Angular project to front/ directory`

---

## Fase 2 — Ajuste de Configurações

> **Branch:** `feat/monorepo-config`
>
> Atualiza os arquivos de configuração que referenciam paths antigos e prepara o repositório para funcionar na nova estrutura.

### Task 2.1 — Atualizar `.gitignore`

Reescrever o `.gitignore` da raiz prefixando os paths Angular com `front/` e removendo a redundância `dist/` que existia no final do arquivo:

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

# IDEs and editors
.idea/
.project
.classpath
.c9/
*.launch
.settings/
*.sublime-workspace

# Visual Studio Code
.vscode/*
!.vscode/settings.json
!.vscode/tasks.json
!.vscode/launch.json
!.vscode/extensions.json
.history/*

# Angular CLI cache
front/.angular/cache

# Miscellaneous
.sass-cache/
/connect.lock
/coverage
/libpeerconnection.log
testem.log
/typings
__screenshots__/

# System files
.DS_Store
Thumbs.db
```

- Commit: `chore: update .gitignore for monorepo paths`

### Task 2.2 — Atualizar `.vscode/tasks.json`

O arquivo atual tem duas tasks (`npm: start` e `npm: test`) com `isBackground: true` e `problemMatcher` customizado para TypeScript. Adicionar `"options": { "cwd": "${workspaceFolder}/front" }` em **ambas** as tasks:

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

> **Nota:** O `launch.json` **não precisa de alteração** — suas configurações (`ng serve` e `ng test`) usam `preLaunchTask` referenciando as tasks acima. Com o `cwd` corrigido nas tasks, os launches continuam funcionando.

- Commit: `chore: update VS Code tasks cwd for front/`

### Task 2.3 — Atualizar `README.md`

Reescrever o README (que atualmente é o template padrão do Angular CLI) para refletir o projeto e a nova estrutura monorepo:

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

- Commit: `docs: update README for monorepo structure`

### Task 2.4 — Criar `vercel.json` dentro de `front/`

Criar o arquivo `front/vercel.json` como documentação e configuração de deploy:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "buildCommand": "npm run build",
  "outputDirectory": "dist/delcastanher-front",
  "installCommand": "npm install",
  "framework": "angular"
}
```

> **Nota:** O `rootDirectory` deve ser configurado via dashboard da Vercel (Settings → General → Root Directory = `front`). O `vercel.json` é processado **depois** de a Vercel entrar no Root Directory, por isso ele vai dentro de `front/` e não na raiz.

- Commit: `chore: add vercel.json to front/ workspace`

### Task 2.5 — Commit final das configurações

- Verificar que não ficou nenhum ajuste pendente
- Se tudo estiver num único commit da fase, este passo pode ser omitido
- Caso contrário, commit: `chore: finalize monorepo config adjustments`

---

## Fase 3 — Validação e Deploy

> **Branch:** `feat/monorepo-validation`
>
> Instala dependências na nova localização, valida build, testa a aplicação, e configura o deploy.

### Task 3.1 — Instalar dependências e validar build

- Executar `cd front && npm install`
- Executar `cd front && npm run build`
- Verificar que o build produz output em `front/dist/delcastanher-front/`
- Resolver qualquer erro de path não encontrado

### Task 3.2 — Validar servidor de desenvolvimento

- Executar `cd front && npm start`
- Acessar `http://localhost:4200` e verificar:
  - `/` — Landing Page carrega com todos os assets (`hero.jpeg`, `logo-delcastanher.svg`, fontes Plus Jakarta Sans)
  - `/login` — Tela de login carrega corretamente
  - `/ava` — Hub do aluno carrega (requer auth via `authGuard`)
  - `/ava/trilha` — Página de trilha carrega
  - `/ava/perfil` — Página de perfil carrega
  - `/ava/materiais` — Página de materiais carrega
  - `/ava/artigos` — Página de artigos carrega
  - `/admin` — Dashboard Admin carrega (requer auth via `authGuard`)
- Verificar que Hot Module Replacement (HMR) funciona ao editar um arquivo em `front/src/`

### Task 3.3 — Validar preservação de histórico git

- Executar `git log --follow front/src/app/app.ts` e confirmar que mostra commits anteriores à movimentação
- Executar `git log --follow front/angular.json` e confirmar o mesmo
- Executar `git log --follow front/src/app/app.routes.ts` como verificação adicional
- Se o histórico não foi preservado, revisar se `git mv` foi usado corretamente

### Task 3.4 — Configurar Root Directory na Vercel

- Acessar o dashboard da Vercel → Settings → General
- Alterar **Root Directory** de `.` para `front`
- Salvar e fazer um redeploy
- Verificar nos logs do build que:
  - A Vercel entra em `front/`
  - `npm install` roda com sucesso
  - `npm run build` encontra `angular.json` e compila
  - O output directory `dist/delcastanher-front` é detectado
- Testar o site em produção (todas as rotas da SPA)

### Task 3.5 — Limpeza final

- Remover qualquer arquivo ou diretório órfão que ficou na raiz (exceto os intencionais)
- Verificar que `git status` está limpo (sem untracked files inesperados)
- Commit final: `chore: monorepo validation complete`

---

## Resumo de Fases e Branches

| Fase | Branch | Tasks | Foco |
|---|---|---|---|
| 1 | `feat/monorepo-structure` | 1.1 – 1.4 | `git mv` de todos os arquivos Angular para `front/` |
| 2 | `feat/monorepo-config` | 2.1 – 2.5 | Atualizar `.gitignore`, `.vscode/tasks.json`, `README.md`, `vercel.json` |
| 3 | `feat/monorepo-validation` | 3.1 – 3.5 | `npm install`, build, dev server, histórico git, deploy Vercel |

**Total: 3 fases, 14 tasks**

> **Merge final:** Todas as branches `feat/*` serão mergeadas em `release/003-monorepo`
> **Validação:** `cd front && npm start` em `localhost:4200` + deploy Vercel funcional
