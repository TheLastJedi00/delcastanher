# Plano de Tarefas - Especificação 005: CRUD de Usuários e Onboarding

> Backend em TDD: em cada task de API, o `*.spec.ts` é escrito antes da implementação.
> Uma branch `feat/<fase>` por fase, um commit por task, merge final em `release/005-crud-usuarios`.

## Fase 1: Prisma + Neon (`feat/prisma-neon`)
- [x] **Task 1.1:** Instalar `prisma` (dev) e `@prisma/client` na `api`, rodar `prisma init` apontando o datasource para `env("DATABASE_URL")` (já presente no `api/.env` e na Vercel) e adicionar o script `postinstall: prisma generate` ao `package.json` para garantir o client no build da Vercel.
- [x] **Task 1.2:** Modelar o `User` em `prisma/schema.prisma`: `id` (String, PK, igual ao UID do Firebase), `email` (único), `name`, `bio`, `phone`, `linkedin` (opcional), `onboardingCompleted` (Boolean, default `false`), `createdAt`, `updatedAt`.
- [x] **Task 1.3:** Gerar o Prisma Client e executar a migration inicial (`prisma migrate dev --name init_user`) contra o Neon, versionando a pasta `prisma/migrations`.
- [x] **Task 1.4:** Criar `PrismaService` (spec antes: conexão no `onModuleInit`, desconexão no `onModuleDestroy`) e o `PrismaModule` marcado como `@Global()`, importado no `AppModule`.

## Fase 2: Módulo de Usuários na API (`feat/users-module`)
- [x] **Task 2.1:** Criar o `FirebaseAuthGuard` (spec antes: token ausente/ inválido → 401; token válido → popula `request.user`), reaproveitando `AuthService.verify` para validar o header `Authorization: Bearer <idToken>`.
- [x] **Task 2.2:** Criar `UsersModule`, `UsersService` e o `UpdateUserDto` (`class-validator`: `name`, `bio` e `phone` obrigatórios no onboarding; `linkedin` opcional e validado como URL). Spec do service cobrindo `findOrCreate` (upsert pelo UID do Firebase no primeiro acesso) e `update`.
- [x] **Task 2.3:** Implementar o `UsersController` com `GET /users/me` protegido pelo guard, retornando o registro do banco (criando-o via upsert quando o usuário do Firebase ainda não existir no Neon) com `onboardingCompleted`. Spec de controller antes.
- [x] **Task 2.4:** Implementar `PATCH /users/me`, que atualiza os dados de perfil e marca `onboardingCompleted: true` quando os campos obrigatórios estiverem preenchidos. Spec antes, cobrindo payload inválido (400) e sucesso.
- [x] **Task 2.5:** Rodar `npm test` na `api`, subir em `localhost:3000` e validar as duas rotas com um idToken real.

## Fase 3: Sessão e Estado do Usuário no Front (`feat/user-profile-state`)
- [x] **Task 3.1:** Criar o `authInterceptor` (functional interceptor registrado em `app.config.ts`) que anexa o `idToken` da sessão às requisições para `environment.apiUrl`.
- [x] **Task 3.2:** Criar `UserService` (`providedIn: 'root'`) com o `profile` em signal, `loadProfile()` (`GET /users/me`) e `updateProfile()` (`PATCH /users/me`), expondo `onboardingCompleted` como `computed`.
- [x] **Task 3.3:** Sincronizar o perfil após o login: ao concluir a validação no Firebase, o front busca o registro no backend antes de redirecionar, e o `AuthService.logout()` limpa também o estado do `UserService`.

## Fase 4: Onboarding (`feat/onboarding`)
- [x] **Task 4.1:** Criar a rota `/onboarding` e o componente de Onboarding com Reactive Form (Nome Completo, Bio, Telefone obrigatórios; LinkedIn opcional), usando os componentes `ui-*` existentes e mantendo a identidade visual da plataforma.
- [x] **Task 4.2:** Integrar a submissão do formulário com `UserService.updateProfile()`, com estado de carregamento (`ui-loading-overlay`), tratamento de erro e redirecionamento para `auth.homeUrl()` em caso de sucesso.
- [x] **Task 4.3:** Criar o `onboardingGuard` e aplicá-lo às rotas internas (`/ava` e `/admin`): sem `onboardingCompleted: true`, redireciona para `/onboarding`; a própria rota `/onboarding` faz o caminho inverso quando o onboarding já está concluído.
- [x] **Task 4.4:** Garantir a resiliência do guard em reload direto de URL, carregando o perfil quando o estado ainda não estiver em memória antes de decidir a liberação da rota.

## Fase 5: Leitura dos Dados nas Telas (`feat/perfil-dinamico`)
- [x] **Task 5.1:** Substituir os dados fixos do Hub/Dashboard pela saudação com o nome vindo do banco (`Bem-vindo(a), {{ nome }}`), incluindo as iniciais do avatar.
- [x] **Task 5.2:** Alimentar a tela **Meu Perfil** com os dados persistidos (nome, e-mail, bio, telefone, LinkedIn), migrando o formulário para Reactive Forms.
- [x] **Task 5.3:** Ligar o botão "Salvar Alterações" do Meu Perfil ao `PATCH /users/me`, com feedback de sucesso/erro e atualização do estado global.

## Fase 6: Integração e Validação (`release/005-crud-usuarios`)
- [x] **Task 6.1:** Fazer o merge das branches de fase em `release/005-crud-usuarios` e rodar `npm test` (api) e `npm run build` (front e api).
- [x] **Task 6.2:** Subir a API em `localhost:3000` e o front em `localhost:4200` e validar no Chrome: primeiro acesso → bloqueio pelo guard → onboarding → hub personalizado → edição no Meu Perfil → reload mantendo os dados.
- [x] **Task 6.3:** Abrir o PR contra a `main` destacando no topo as decisões tomadas.

## Fase 7: Meu Perfil editável para aluno e admin (`feat/perfil-compartilhado`)
- [ ] **Task 7.1:** Mover o componente `Perfil` de `features/student/perfil` para `features/perfil` (junto com o spec), sem mudança de comportamento: ele deixa de ser uma tela do aluno para ser a tela de conta de qualquer perfil. Ajustar os imports e a rota `/ava/perfil`.
- [ ] **Task 7.2:** Reestruturar a rota `/admin` para uma rota com filhos (`''` → `AdminDashboard`, `perfil` → nova tela) e criar o `/admin/perfil`, que renderiza o mesmo componente `Perfil` dentro do `AdminLayout`, preservando a identidade visual de cada área.
- [ ] **Task 7.3:** Dar acesso à tela pelo painel administrativo: entrada "Meu Perfil" no menu do admin (sidebar e/ou cabeçalho), mantendo os caminhos que o aluno já usa (card do Hub e sidebar).
- [ ] **Task 7.4:** Spec de API antes da implementação, fixando que `PATCH /users/me` grava sempre sobre o usuário da sessão — inclusive quando a `role` é `admin` — e que não existe rota para editar o cadastro de terceiros. Só implementar se o spec apontar alguma lacuna; a expectativa é que o backend atual já atenda.
- [ ] **Task 7.5:** Rodar `npm test` (api) e `ng test` (front), subir os dois projetos e validar no Chrome com uma conta `aluno` e uma conta `admin` (usar `npm run role -- --promote <email>` para promover a conta de teste): editar os dados, ver o cabeçalho refletir a alteração e recarregar a URL direto mantendo o que foi salvo.

## Decisões tomadas (discrepâncias do context.md)
- **Autenticação das rotas de usuário:** o `context.md` fala em "usuário autenticado no momento", mas a API ainda não tinha nenhum guard — só o endpoint `POST /auth/verify`. Foi definida a criação de um `FirebaseAuthGuard` reaproveitando o `AuthService.verify`, mais um interceptor no front para enviar o `idToken`.
- **Criação do registro no Neon:** usuários já existentes no Firebase não têm linha no banco. O `GET /users/me` faz upsert pelo UID, o que garante o requisito de que "inclusive usuários pré-existentes" passem pelo onboarding sem depender de migração de dados.
- **Verbo de atualização:** escolhido `PATCH` (atualização parcial) em vez de `PUT`, atendendo tanto ao onboarding quanto à edição pontual no Meu Perfil.
- **Tela de Dashboard:** o projeto não tem uma tela chamada "Dashboard" para o aluno; a leitura dinâmica foi aplicada ao **Hub** (`/ava`), que é a tela inicial equivalente.
- **Meu Perfil compartilhado entre os perfis:** a tela nasceu dentro da área do aluno (`/ava/perfil`), mas o requisito de edição vale para aluno e admin. Em vez de duplicar o componente, ele sobe para `features/perfil` e é montado nos dois shells — cada área mantém sua navegação e sua identidade visual, e existe um único formulário de perfil na plataforma.
- **Backend sem mudança para a Fase 7:** `PATCH /users/me` já opera sobre o usuário da sessão, seja qual for a `role`. A fase entra com um spec que fixa essa garantia, não com código novo de API.
