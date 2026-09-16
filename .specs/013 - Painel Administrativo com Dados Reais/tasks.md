# Tasks: Spec 013 - Painel Administrativo com Dados Reais de Usuários

Spec full-stack. No `api/` (NestJS + Prisma + Jest) a suíte de testes vem **antes** da implementação, conforme `.claude/RULES.md`; no `front/` (Angular standalone + signals + Tailwind) valem o Design System da Spec 002 e os componentes de `front/src/app/shared/ui/`. As decisões referenciadas abaixo estão no `context.md`.

Ordem das fases: as colunas novas (`role`, `lastSeenAt`, `blockedAt`) vêm primeiro, porque a listagem inteira depende delas; a leitura vem antes da escrita, para que promover e bloquear já tenham onde se refletir; e o front só entra quando a API devolve a página com KPIs.

## Fase 1: Backend - Modelo e Espelho do Papel (TDD)
- [x] **Task 1.1:** Escrever a suíte do `UsersService` para o espelho: entrada com claim `admin` gravando `role = admin`, entrada com claim ausente gravando `aluno`, claim alterado fora do painel convergindo na entrada seguinte, e `lastSeenAt` avançando a cada `findOrCreate` (decisões 3, 4 e 5).
- [x] **Task 1.2:** Adicionar ao model `User` do `api/prisma/schema.prisma` o enum `Role` (`aluno` | `admin`, default `aluno`), `lastSeenAt DateTime?` e `blockedAt DateTime?`, com índices em `role` e `lastSeenAt` para sustentar filtro e KPI, documentando no comentário que `role` é espelho de leitura e nunca fonte de autorização (decisão 3).
- [x] **Task 1.3:** Escrever a migration correspondente, preenchendo `role = aluno` para as linhas existentes e deixando `lastSeenAt` e `blockedAt` nulos — nulo em `lastSeenAt` significa "nunca acessou depois desta spec", e não "inativo".
- [x] **Task 1.4:** Fazer `UsersService.findOrCreate` gravar `role` e `lastSeenAt` no mesmo upsert que já espelha o e-mail, sem acrescentar consulta nova ao caminho de entrada (decisões 4 e 5).
- [x] **Task 1.5:** Rodar `npm test` no `api/` e conferir que nenhuma suíte de `auth`, `progress` ou `certificates` regrediu com a coluna nova.

## Fase 2: Backend - Listagem e KPIs (TDD)
- [x] **Task 2.1:** Escrever a suíte do `AdminUsersService` para a listagem: paginação, busca por nome e por e-mail (sem diferenciar maiúsculas), filtro por papel e por situação, ordenação por nome, matrícula, último acesso e progresso, e página vazia devolvendo `total` correto.
- [x] **Task 2.2:** Escrever a suíte do progresso na listagem: percentual igual ao que o `ProgressService` devolve para o mesmo aluno, "módulo atual" sendo o módulo da primeira aula em aberto, aluno sem nenhuma conclusão em 0% e aluno com tudo concluído marcado como concluído (decisão 8).
- [x] **Task 2.3:** Escrever a suíte dos três KPIs nas definições da decisão 6, incluindo os casos de borda: base sem nenhum aluno devolvendo 0% em vez de divisão por zero, admin não contando como aluno matriculado (decisão 16) e aluno bloqueado saindo da contagem.
- [x] **Task 2.4:** Criar `users.admin.types.ts` com `AdminUserItem` (id, nome, e-mail, iniciais, papel, situação, `onboardingCompleted`, `createdAt`, `lastSeenAt`, `completedLessons`, `totalLessons`, `percentage`, `currentModuleOrder`, `currentModuleTitle`, `courseCompleted`), `AdminUserListResult` (`items`, `total`, `page`, `pageSize`, `kpis`) e `AdminUsersKpis`.
- [x] **Task 2.5:** Implementar `AdminUsersService.list` com o `groupBy` de `lesson_progress` sobre os ids da página e o `count` de `lessons` feitos **uma vez** por página, sem consulta por linha (decisão 8).
- [x] **Task 2.6:** Criar o `ListAdminUsersDto` validando e normalizando `page`, `pageSize` (máximo 100, default 20), `search`, `role`, `status` e `sort`, recusando valores fora do conjunto em vez de cair no default em silêncio.
- [x] **Task 2.7:** Implementar `GET /admin/users` no `AdminUsersController`, com `FirebaseAuthGuard` + `@Roles('admin')`, registrando o controller no `UsersModule` existente.
- [x] **Task 2.8:** Escrever `users.admin.http.spec.ts` cobrindo admin autorizado, papel `aluno` recebendo 403, requisição sem token recebendo 401 e query inválida recebendo 400.

## Fase 3: Backend - Detalhe, Papel, Bloqueio e Exportação (TDD)
- [ ] **Task 3.1:** Escrever a suíte do detalhe: perfil, aulas concluídas agrupadas por módulo, certificados com código, escopo e status, primeiro e último acesso, e id inexistente devolvendo 404 — sem nenhum campo editável na resposta (decisões 11 e 12).
- [ ] **Task 3.2:** Implementar `GET /admin/users/:id`, reaproveitando o critério de conclusão do `ProgressService` em vez de recalcular o percentual por conta própria.
- [ ] **Task 3.3:** Escrever a suíte da mudança de papel: `setCustomUserClaims` chamado antes da gravação, falha do Firebase **não** gravando a coluna, papel igual ao atual sendo no-op idempotente e admin alvejando o próprio `uid` recebendo 409 (decisões 4 e 10).
- [ ] **Task 3.4:** Implementar `PATCH /admin/users/:id/role` com o `UpdateUserRoleDto`, na ordem Firebase → Postgres.
- [ ] **Task 3.5:** Escrever a suíte do bloqueio: `updateUser({ disabled })` e `revokeRefreshTokens` chamados, `blockedAt` gravado no bloqueio e limpo no desbloqueio, nenhum dado de progresso ou certificado tocado, e admin bloqueando a si mesmo recebendo 409 (decisões 9 e 10).
- [ ] **Task 3.6:** Implementar `PATCH /admin/users/:id/status` com o `UpdateUserStatusDto`.
- [ ] **Task 3.7:** Escrever a suíte da exportação: mesmas linhas da listagem para o mesmo filtro porém sem paginação, cabeçalho e colunas da decisão 13, `bio` e `linkedin` **ausentes** do arquivo, e escape de vírgula, aspas e quebra de linha dentro dos campos.
- [ ] **Task 3.8:** Implementar `GET /admin/users/export` devolvendo `text/csv` com `Content-Disposition` de anexo e nome de arquivo datado.
- [ ] **Task 3.9:** Rodar `npm test` no `api/` e corrigir regressões.

## Fase 4: Front - Serviço e Listagem Real
- [ ] **Task 4.1:** Criar `core/services/admin-users.service.ts` no padrão de signals do `admin-content.service.ts`: estado da consulta (página, busca, filtros, ordenação), carregamento, erro e o resultado com `items` e `kpis`, mais os métodos de detalhe, papel, situação e download do CSV.
- [ ] **Task 4.2:** Trocar os arrays literais `kpis` e `students` do `admin-dashboard.ts` pelo serviço, removendo o `filteredStudents` local — a busca passa a ir ao servidor, com debounce, e a tabela mostra estados de carregando, vazio e erro com repetição da consulta (decisão 7).
- [ ] **Task 4.3:** Remover o card "Vendas / Faturamento" do grid e colocar no lugar os três KPIs da decisão 6, cada `ui-stat-card` com a sua legenda de definição visível (decisões 1 e 6).
- [ ] **Task 4.4:** Evoluir a tabela: selo de papel, selo de situação (ativo / bloqueado), selo "Onboarding pendente" com o e-mail no lugar do nome quando não houver nome (decisão 15), "Concluído" no lugar de "12 / 12" para quem terminou, e coluna de último acesso com "nunca acessou" para o nulo.
- [ ] **Task 4.5:** Implementar os controles de filtro por papel e por situação, a ordenação por coluna e a paginação, refletindo o estado na URL por query param para que a página filtrada seja um link compartilhável e sobreviva ao F5.

## Fase 5: Front - Detalhe e Ações Administrativas
- [ ] **Task 5.1:** Implementar o detalhe do aluno sobre o `ui-modal` já existente: perfil, progresso por módulo, certificados emitidos e as duas datas de acesso, tudo em leitura, com foco preso no modal e devolvido à linha de origem ao fechar (decisão 11).
- [ ] **Task 5.2:** Implementar a mudança de papel com confirmação que explica o efeito ("esta pessoa passa a ter acesso ao painel administrativo"), mantendo o controle desabilitado e com motivo escrito quando o alvo for o próprio administrador logado (decisão 10).
- [ ] **Task 5.3:** Implementar bloquear e desbloquear com confirmação que deixa explícito o que **não** acontece: nada é apagado, e o progresso e os certificados continuam no lugar (decisão 9).
- [ ] **Task 5.4:** Implementar o botão de exportar CSV, disparando o download com o filtro corrente, com estado de carregamento e mensagem de erro — sem montar o arquivo no navegador (decisão 13).
- [ ] **Task 5.5:** Acrescentar o aviso visível de área em construção nas abas "Disparos de E-mail" e "Políticas & Termos", para que não pareçam funcionais ao lado de uma Visão Geral que passou a ser real.
- [ ] **Task 5.6:** Escrever os `.spec.ts` do `admin-users.service.ts` e da aba: busca indo ao servidor com debounce, paginação, ordenação, confirmação antes de promover e antes de bloquear, botão desabilitado para a própria conta, 409 do servidor exibido sem quebrar a tela e erro de rede mantendo a lista anterior visível.

## Fase 6: Revisão e Entrega
- [ ] **Task 6.1:** Revisar responsividade da tabela no mobile (rolagem horizontal ou empilhamento das colunas) e a acessibilidade: `scope` nos cabeçalhos, estado de ordenação anunciado por `aria-sort`, `aria-live` nos resultados da busca e rótulos dos botões de ação dizendo de qual aluno se trata.
- [ ] **Task 6.2:** Conferir que nenhuma rota nova responde a papel `aluno` nem a requisição sem token, e que nenhum dado de outro usuário aparece em resposta fora de `/admin/*`.
- [ ] **Task 6.3:** Conferir que o `RolesGuard` continua decidindo pelo claim do token e que a coluna `role` não é lida em nenhum caminho de autorização (decisão 3).
- [ ] **Task 6.4:** Rodar `npm test` e `npm run build` no `front/` e `npm test` no `api/`, corrigindo regressões.
- [ ] **Task 6.5:** Teste funcional de ponta a ponta com `api/` em `localhost:3000` e `front/` em `localhost:4200`: criar contas de teste em estágios diferentes (sem onboarding, em andamento, curso concluído com diploma), conferir os três KPIs contra o banco, buscar, filtrar, ordenar e paginar, abrir o detalhe de cada uma, promover uma conta a admin e verificar que ela entra no `/admin` depois de renovar a sessão, rebaixá-la de volta, bloquear uma conta e confirmar que o login é recusado, desbloquear, exportar o CSV e conferir as colunas, e verificar que o próprio administrador não consegue se rebaixar nem se bloquear.
- [ ] **Task 6.6:** Entregar conforme `.claude/RULES.md`: uma branch `feat/<>` por fase, um commit por task, merge das feats em `release/013-painel-administrativo-dados-reais` e as decisões desta spec destacadas no topo do PR — com a remoção do KPI de faturamento (decisão 1) e o espelho de `role` no Postgres (decisão 3) em primeiro lugar, por serem a mudança de escopo e a mudança de modelo.
