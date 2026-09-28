# Tasks: Spec 021 - Adicionar Administrador pelo Painel

Spec full-stack. No `api/` (NestJS + Prisma + Jest) a suíte de testes vem **antes** da implementação, conforme `.claude/RULES.md`; no `front/` (Angular standalone + signals + Tailwind) valem o Design System da Spec 002 e os componentes de `front/src/app/shared/ui/`. As decisões referenciadas abaixo estão no `context.md`.

Ordem das fases: primeiro a extração do fluxo de conta no `AuthService`, sem mudar comportamento, para que a rota nova nasça reaproveitando-o; depois a rota; o front só entra quando a API devolve o `outcome`.

## Fase 1: Backend - Extração do Fluxo de Conta (TDD)
- [x] **Task 1.1:** Escrever a suíte dos métodos públicos do `AuthService`: `ensureAccount(email)` criando a conta com senha descartável quando o e-mail não existe e devolvendo a conta existente sem recriar quando existe, informando em ambos os casos se houve criação; `sendPasswordSetupEmail(email)` disparando o `PASSWORD_RESET` com `continueUrl` para o `/login` (decisão 2).
- [x] **Task 1.2:** Extrair `ensureAccount` e tornar público `sendPasswordSetupEmail` no `AuthService`, fazendo o `requestAccount` passar a usá-los.
- [x] **Task 1.3:** Rodar as suítes existentes de `auth` e conferir que "Criar nova conta" e "Esqueci minha senha" não mudaram de comportamento — inclusive a resposta idêntica para e-mail com e sem conta (decisão 10).

## Fase 2: Backend - Rota de Adicionar Administrador (TDD)
- [x] **Task 2.1:** Escrever a suíte do `AdminUsersService.addAdmin` para e-mail sem conta: conta criada, `setCustomUserClaims` com `role: 'admin'`, `upsert` no Postgres com `role = admin`, `name` e `lastSeenAt` nulos, e-mail de definição de senha enviado, e `outcome: 'created'` (decisões 2, 4 e 5).
- [x] **Task 2.2:** Escrever a suíte para conta existente: claim gravado preservando os claims anteriores, `upsert` no Postgres (inclusive quando a conta existe no Firebase e ainda não tem linha no banco), **nenhum** e-mail enviado e `outcome: 'promoted'` (decisões 5 e 6).
- [x] **Task 2.3:** Escrever a suíte dos casos de borda: conta que já é admin devolvendo `outcome: 'already-admin'` sem escrita no Firebase (decisão 7); conta com `disabled` recebendo 409 sem tocar claim nem banco (decisão 8); falha do `setCustomUserClaims` **não** gravando o Postgres nem enviando e-mail; falha só do envio de e-mail devolvendo sucesso com `inviteEmailSent: false` (decisão 4); e e-mail com maiúsculas e espaços caindo na mesma conta (decisão 9).
- [x] **Task 2.4:** Criar o `AddAdminDto` com `@IsEmail()` e normalização, e o tipo `AddAdminResult` (`userId`, `email`, `outcome`, `inviteEmailSent`) em `users.admin.types.ts`.
- [x] **Task 2.5:** Implementar `AdminUsersService.addAdmin` na ordem conta → claim → Postgres → e-mail (decisão 4).
- [x] **Task 2.6:** Implementar `POST /admin/users/admins` no `AdminUsersController`, conferindo que o caminho não colide com `GET /admin/users/:id` nem com as rotas de `admin/users` do `AdminAccessController` (Spec 014).
- [x] **Task 2.7:** Estender `users.admin.http.spec.ts`: admin autorizado recebendo 201, papel `aluno` recebendo 403, sem token recebendo 401, e-mail inválido ou ausente recebendo 400 e conta bloqueada recebendo 409.
- [x] **Task 2.8:** Rodar `npm test` no `api/` e corrigir regressões.

## Fase 3: Front - Botão, Modal e Serviço
- [x] **Task 3.1:** Acrescentar `addAdmin(email)` ao `core/services/admin-users.service.ts`, com os tipos `AddAdminResult` e `AddAdminOutcome` espelhando a API.
- [x] **Task 3.2:** Colocar o botão "Adicionar administrador" no cabeçalho da aba "Visão Geral e Alunos", ao lado de "Exportar CSV", abrindo um `ui-modal` com formulário reativo de um campo (`ui-input` de e-mail com `Validators.required` e `Validators.email`) e texto explicando o efeito: a pessoa passa a ter acesso ao painel administrativo.
- [ ] **Task 3.3:** Exibir no modal o resultado conforme o `outcome`: conta criada ("enviamos um e-mail para definir a senha — avise a pessoa"), conta promovida ("o acesso aparece depois que a pessoa sair e entrar de novo"), já era admin, e o aviso de `inviteEmailSent: false` orientando o "Esqueci minha senha" (decisões 3, 4, 6 e 7).
- [ ] **Task 3.4:** Tratar erros sem fechar o modal nem perder o e-mail digitado: 409 de conta bloqueada com a mensagem da decisão 8, 400 de e-mail inválido e erro de rede com opção de tentar de novo; botão de enviar com estado de carregamento e bloqueado contra duplo clique.
- [ ] **Task 3.5:** Recarregar a listagem com a consulta corrente após o sucesso, para que a pessoa adicionada apareça na tabela sem F5 (decisão 5).
- [ ] **Task 3.6:** Garantir acessibilidade: foco no campo ao abrir, foco devolvido ao botão ao fechar, erro do campo associado por `aria-describedby` e resultado anunciado por `aria-live`.
- [ ] **Task 3.7:** Escrever os `.spec.ts` do serviço e da aba: validação do formulário antes do envio, cada `outcome` exibindo a sua mensagem, 409 exibido sem quebrar a tela, recarga da lista após sucesso e nenhuma chamada em duplo clique.

## Fase 4: Revisão e Entrega
- [ ] **Task 4.1:** Conferir que `POST /admin/users/admins` não responde a papel `aluno` nem a requisição sem token, e que o `RolesGuard` continua decidindo pelo claim do token, sem ler a coluna `role` (Spec 013, decisão 3).
- [ ] **Task 4.2:** Rodar `npm test` e `npm run build` no `front/` e `npm test` no `api/`, corrigindo regressões.
- [ ] **Task 4.3:** Teste funcional de ponta a ponta com `api/` em `localhost:3000` e `front/` em `localhost:4200`: adicionar um e-mail sem conta e conferir a linha nova na tabela como admin com "Onboarding pendente", receber o e-mail, definir a senha, fazer onboarding e entrar no `/admin`; adicionar um aluno existente e conferir que ele entra no `/admin` depois de sair e entrar; repetir um e-mail que já é admin; tentar uma conta bloqueada e ver o 409; e rebaixar pela tabela as contas de teste ao final.
- [ ] **Task 4.4:** Entregar conforme `.claude/RULES.md`: uma branch `feat/<>` por fase, um commit por task, merge das feats em `release/021-adicionar-administrador` e as decisões desta spec destacadas no topo do PR — com a rota única por e-mail (decisão 1) e a linha criada no Postgres antes do primeiro login (decisão 5) em primeiro lugar.
