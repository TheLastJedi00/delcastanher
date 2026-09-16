# Spec 013: Painel Administrativo com Dados Reais de Usuários

**Projeto:** Plataforma E-learning "Imersão RH Estratégico"
**Baseada em:** Spec 004 (Autenticação), Spec 005 (CRUD de Usuários), Spec 008 (Área do Aluno), Spec 009 (Conformidade) e Spec 012 (Aulas e Trilha)
**Escopo técnico:** full-stack — `api/` (NestJS + Prisma + Firebase Admin SDK) e `front/` (Angular standalone + signals + Tailwind). O backend é escrito com TDD: a suíte vem antes da implementação (`.claude/RULES.md`).

## Objetivo
A aba "Visão Geral e Alunos" do `/admin` é a última tela inteiramente de maquete da plataforma: os três KPIs e os quatro alunos da tabela estão escritos à mão em `admin-dashboard.ts`. Ela passa a ler o banco. O administrador vê quem são os alunos de verdade, quanto cada um andou na trilha, quando acessou pela última vez, abre o detalhe de um deles, muda o papel de uma conta, bloqueia o acesso de quem precisa ser bloqueado e leva a lista para uma planilha.

## Escopo

- **Listagem real de usuários:** `GET /admin/users` com busca, filtro, ordenação e paginação no servidor, devolvendo progresso e último acesso já calculados.
- **KPIs derivados do banco:** alunos matriculados, alunos ativos e taxa de engajamento, cada um com a sua definição visível na tela.
- **Detalhe do aluno:** perfil, aulas concluídas por módulo, certificados emitidos, primeiro e último acesso — somente leitura.
- **Gestão de papel:** promover a `admin` e rebaixar a `aluno`, escrevendo no Firebase e espelhando no Postgres.
- **Bloqueio de conta:** desabilitar e reabilitar o acesso sem apagar nada.
- **Exportação CSV:** a mesma consulta da tela, gerada no servidor.
- **Carimbo de último acesso:** `User.lastSeenAt`, gravado na entrada da plataforma.

## Decisões técnicas desta spec

1. **O financeiro fica fora, e o KPI de faturamento sai da tela.**
   O pedido original desta spec incluía "dados reais de financeiro", e não há de onde tirá-los: não existe `Order`, `Payment`, `Enrollment` nem gateway em nenhum ponto do projeto; o checkout da Spec 007 é mockup declarado (decisão 7 daquela spec) e o preço em `plans.mock.ts` é `PLACEHOLDER` porque a Spec 006 (decisão 3) recusou inventar dado comercial. O card "Vendas / Faturamento — R$ 145.000" **é removido** do grid, e não substituído por zero nem por "pendente": um zero afirma que não houve venda, e a plataforma simplesmente não sabe. O grid passa a ter três KPIs que o banco sustenta (decisão 6). Financeiro é spec própria e depende de duas decisões comerciais que ainda não foram tomadas — qual gateway e qual preço.

2. **Não entra matrícula, e o acesso ao AVA continua sendo a sessão autenticada.**
   A Spec 007 (decisão 2) e a Spec 008 (decisão 5) deixaram `Enrollment` fora por não existir pagamento; a Spec 010 (decisão 6) e a Spec 012 (decisão 7) firmaram que o portão do conteúdo é a sessão, não o progresso nem a compra. Nada nesta spec muda isso: o painel **lê** quem são os usuários, e não passa a controlar quem entra. A única forma de tirar alguém de dentro continua sendo o bloqueio da conta (decisão 9), que é ato administrativo e não regra de produto.

3. **O papel do usuário passa a ser espelhado no Postgres, com o Firebase continuando dono.**
   Hoje `role` existe apenas como custom claim do token (`auth.service.ts`, `toRole(claims.role)`), e o banco não sabe quem é admin. Uma listagem com filtro por papel, ordenação e paginação sobre o claim exigiria uma chamada ao Admin SDK por linha, ou um `listUsers` paginado por cursor que não busca por nome, não ordena e não se junta ao progresso — as duas saídas quebram a tela. `User.role` entra no schema como **espelho de leitura**, com default `aluno`. A autorização não muda de fonte: `FirebaseAuthGuard` e `RolesGuard` continuam decidindo pelo claim do token, e a coluna nunca é consultada para autorizar. Ela serve para listar, filtrar e contar.

4. **A escrita do papel é Firebase primeiro, banco depois; a leitura reconcilia o espelho a cada entrada.**
   `PATCH /admin/users/:id/role` chama `setCustomUserClaims` e só grava a coluna com a chamada bem-sucedida — o contrário deixaria o painel exibindo um admin que o token não reconhece. Como o claim pode ser mudado fora do painel (console do Firebase, script), `UsersService.findOrCreate` — que o front já chama em toda entrada pelo `ensureProfile()` — passa a gravar o papel que veio no token junto com o e-mail que ele já espelha. O espelho converge sozinho, sem job de sincronização.

5. **`lastSeenAt` é gravado em `GET /users/me`, e não a cada requisição autenticada.**
   "Aluno ativo" precisa de um carimbo, e não existe nenhum na plataforma. Escrever em todo request transformaria cada chamada autenticada — playback token, materiais, progresso — em um `UPDATE` no caminho quente. `GET /users/me` já é o upsert de entrada do `ensureProfile()`, chamado uma vez quando a pessoa abre a plataforma: é exatamente o evento "o aluno voltou". A granularidade passa a ser de sessão, não de clique, e é isso que a coluna promete.

6. **Os três KPIs têm definição fixa, e a definição aparece junto do número.**
   *Alunos matriculados* é a contagem de usuários com papel `aluno` não bloqueados. *Alunos ativos* é quem tem `lastSeenAt` nos últimos 30 dias. *Taxa de engajamento* é a fração de alunos que concluiu ao menos uma aula nos últimos 30 dias. Os três são calculados no servidor, na mesma chamada da listagem. Um percentual sem critério escrito vira enfeite — e "82%" no mock de hoje não quer dizer nada —, então cada card carrega a sua legenda ("acessaram nos últimos 30 dias"), sem tooltip escondido.

7. **A listagem é paginada, buscada e ordenada no servidor.**
   `filteredStudents` filtra hoje um array de quatro elementos no navegador. Com a base real, manter o filtro no cliente significa baixar a tabela inteira de usuários para digitar num campo de busca — e ainda expor no tráfego de rede o cadastro completo para uma tela que mostra vinte linhas. `GET /admin/users` recebe `page`, `pageSize` (20), `search` (nome ou e-mail), `role`, `status` e `sort`, e devolve `{ items, total, page, pageSize }` mais o bloco de KPIs.

8. **O progresso de cada linha é calculado uma vez para a página inteira, não por aluno.**
   O percentual é aulas concluídas ÷ total de aulas do curso, o mesmo critério que a Spec 012 (decisão 6) fixou para o aluno. Calcular por linha seria um N+1 de vinte consultas; a listagem faz um `groupBy` de `lesson_progress` sobre os ids da página e um `count` de `lessons`. "Módulo atual" é o módulo da primeira aula em aberto — o mesmo `nextLesson` que o Hub já usa, para que o painel não invente um segundo conceito de "onde o aluno está". Quem concluiu tudo aparece como "Concluído", e não como "12 / 12".

9. **Bloquear é `disabled` no Firebase espelhado no banco, e nunca apagar.**
   `PATCH /admin/users/:id/status` chama `updateUser({ disabled })` e `revokeRefreshTokens`, grava `User.blockedAt` e mantém todo o dado no lugar: exclusão de conta é o direito de eliminação da Spec 009, com prazo, confirmação e efeito sobre certificado emitido — outro fluxo, outra spec. O `idToken` que a pessoa já tem em mãos continua válido até expirar (no máximo uma hora), e isso é aceito de propósito: fechar essa janela exigiria `verifyIdToken(token, true)`, um round-trip ao Firebase em **toda** requisição autenticada da plataforma, para encurtar em minutos o efeito de um ato raro. A revogação do refresh token garante que a sessão não se renove.

10. **O administrador não muda o próprio papel nem se bloqueia.**
    Um admin que se rebaixa perde no mesmo clique a tela onde reverteria, e um que se bloqueia perde a conta. A regra é do servidor — `uid` do token igual ao alvo responde 409 —, e a UI desabilita o botão com o motivo escrito, em vez de deixar o erro aparecer só depois. Não se tenta a regra mais forte ("não rebaixar o último admin"): contá-los pelo espelho arriscaria bloquear uma ação legítima por dado defasado, e o problema que ela evita já está coberto pela regra de si mesmo.

11. **O detalhe do aluno é leitura, e não edita perfil de terceiro.**
    O painel mostra o perfil vindo do onboarding, as aulas concluídas agrupadas por módulo, os certificados emitidos com código e status, o primeiro acesso (`createdAt`) e o último (`lastSeenAt`). Não há formulário: o onboarding é declaração do próprio aluno (Spec 005), e um administrador reescrevendo bio, telefone e LinkedIn de outra pessoa abre um caminho de alteração de dado pessoal sem rastro, justo no ponto em que a Spec 009 pede o contrário. Corrigir cadastro é pedido do titular, na tela dele.

12. **Certificado aparece no detalhe, e revogar continua sem tela.**
    A Spec 008 (decisão 8) manteve `REVOKED` no modelo sem UI, e a Spec 012 (decisão 14) reforçou que revogação é ato deliberado. O detalhe **exibe** código, escopo e status; não oferece o botão. Revogar diploma pelo mesmo painel onde se navega uma lista é um clique de distância de um erro irreversível para o aluno.

13. **O CSV é gerado no servidor e repete o filtro da tela.**
    `GET /admin/users/export` roda a mesma consulta sem paginação e devolve `text/csv`. Montar no cliente exigiria varrer todas as páginas com N requisições para produzir um arquivo. Vão as colunas operacionais — nome, e-mail, telefone, papel, situação, data de matrícula, último acesso, aulas concluídas e percentual — e **não** vão `bio` nem `linkedin`: é dado pessoal que nenhuma planilha de acompanhamento usa, e todo campo exportado é um campo que sai do controle da plataforma.

14. **Não entra log de auditoria, e isso é omissão consciente.**
    Mudança de papel e bloqueio são atos sensíveis, e o que esta spec registra é o **resultado** (`role`, `blockedAt`, `updatedAt`), não o autor nem o valor anterior. Um log de verdade é tabela própria, política de retenção e tela de consulta — e serviria a muito mais do que estas duas ações, incluindo as da Spec 012. Fazê-lo aqui em meia medida, cobrindo só duas rotas, criaria a impressão de rastreabilidade que a plataforma não tem.

15. **Quem não concluiu o onboarding aparece na lista.**
    Conta criada que nunca preencheu o perfil não tem `name`, e escondê-la faria a tabela discordar do KPI logo acima dela. A linha mostra o e-mail no lugar do nome e um selo "Onboarding pendente" — que é, inclusive, a informação acionável: alguém entrou e parou no cadastro.

16. **A tabela lista usuários, e não só alunos.**
    O administrador também é um registro em `users`, e escondê-lo tornaria impossível ver quem tem acesso ao painel — justamente o que a gestão de papel desta spec existe para controlar. Ele aparece com o selo de papel, e o filtro por papel dá a visão de alunos quando ela for a desejada. Os KPIs, esses, contam apenas `aluno` (decisão 6): administrador não é aluno matriculado.

## Integração com o existente
No `api/`, `UsersModule` ganha o `AdminUsersController` e o `AdminUsersService` ao lado do que já existe — nenhum módulo novo do Nest nasce, porque a entidade é a mesma com outro leitor. A consulta de progresso reaproveita o critério do `ProgressService` (Spec 012) em vez de reimplementá-lo, e o `FirebaseService.auth` já expõe o Admin SDK de que a gestão de papel e o bloqueio precisam. `FirebaseAuthGuard` e `RolesGuard` seguem intactos. No `front/`, a aba "Visão Geral" do `admin-dashboard` deixa de carregar arrays literais e passa a consumir um `AdminUsersService` novo em `core/services/`, no mesmo padrão de signals do `admin-content.service.ts`; o detalhe usa o `ui-modal` já existente, e `ui-stat-card`, `ui-progress-bar`, `ui-badge`, `ui-avatar` e `ui-input` continuam sendo os mesmos componentes da Spec 002. A rota `/admin` segue protegida por `authGuard + adminGuard + onboardingGuard`.

## Fora de escopo
- Faturamento, pedido, pagamento, gateway e conciliação (decisão 1).
- Matrícula, entitlement e qualquer bloqueio de conteúdo por compra (decisão 2).
- As abas "Disparos de E-mail" e "Políticas & Termos", que seguem como maquete — passam a exibir um aviso visível de área em construção, para não prometerem o que não fazem.
- Edição do perfil de outro usuário e exclusão de conta (decisões 11 e 9).
- Revogação de certificado por tela (decisão 12).
- Log de auditoria das ações administrativas (decisão 14).
- Convite de usuário por e-mail, criação de conta pelo painel e redefinição de senha de terceiro.
- Gráficos de série temporal, coorte, funil e relatório agendado.
