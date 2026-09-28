# Spec 021: Adicionar Administrador pelo Painel

**Projeto:** Plataforma E-learning "Imersão RH Estratégico"
**Baseada em:** Spec 004 (Autenticação), Spec 013 (Painel Administrativo com Dados Reais), Spec 014 (Checkout) e Spec 015 (Jurídico)
**Escopo técnico:** full-stack — `api/` (NestJS + Prisma + Firebase Admin SDK) e `front/` (Angular standalone + signals + Tailwind). O backend é escrito com TDD: a suíte vem antes da implementação (`.claude/RULES.md`).

## Objetivo
Hoje só existe um jeito de dar acesso ao `/admin` a quem ainda não é administrador: a pessoa precisa já ter conta, aparecer na tabela da aba "Visão Geral e Alunos" e ser promovida pela linha dela (Spec 013, decisão 4). Para quem nunca entrou na plataforma, o único caminho é o script `npm run role -- --promote <email>`, rodado por quem tem a credencial do Firebase — e o script nem cria a conta. A Spec 013 deixou "criação de conta pelo painel" explicitamente fora de escopo.

Esta spec coloca na tela "Visão Geral e Alunos" um botão **Adicionar administrador**: o administrador informa um e-mail, e a plataforma faz o que for preciso para aquela pessoa virar administradora — promover a conta que já existe ou criar a conta e mandar o link para ela definir a senha.

## Escopo

- **Botão e modal "Adicionar administrador"** no cabeçalho da aba "Visão Geral e Alunos", ao lado de "Exportar CSV", com um único campo de e-mail.
- **`POST /admin/users/admins`**: recebe o e-mail e resolve os dois casos — conta existente é promovida; e-mail sem conta ganha conta nova, papel `admin` e o e-mail de definição de senha.
- **Linha no Postgres desde o convite**, para que a pessoa apareça na tabela logo depois de adicionada, como admin com "Onboarding pendente" e "nunca acessou".
- **Resposta que diz o que aconteceu** (conta criada, conta promovida ou já era admin), exibida no modal em vez de uma confirmação genérica.

## Decisões técnicas desta spec

1. **Uma rota só, por e-mail, cobrindo conta nova e conta existente.**
   Quem administra não sabe — e não deveria precisar saber — se a pessoa já criou conta. Duas telas ("promover existente" e "convidar novo") empurrariam essa pergunta para o usuário e duplicariam o formulário. `POST /admin/users/admins` recebe `{ email }`, procura a conta no Firebase por `getUserByEmail` e segue um dos caminhos. A promoção pela linha da tabela (`PATCH /admin/users/:id/role`) continua existindo e intacta: é o caminho de quem já está na lista.

2. **A conta nova nasce igual à do "Criar nova conta", sem segundo mecanismo de convite.**
   `AuthService.requestAccount` (Spec 004) já cria a conta no Firebase com senha descartável — sem provider de senha o Firebase não aceita o oob code de `PASSWORD_RESET` — e dispara o e-mail de definição de senha que devolve a pessoa ao `/login`. O painel usa **esse** fluxo, extraído para um método público do `AuthService` (`ensureAccount` + `sendPasswordSetupEmail`), e não uma cópia no `AdminUsersService`. Um convite próprio, com token e expiração no banco, seria um segundo sistema de ativação de conta para fazer a mesma coisa que o Firebase já faz.

3. **O e-mail é o template de definição de senha que já existe; não nasce e-mail "você foi convidado".**
   O texto que a pessoa recebe é o mesmo de quem cria conta pela tela de login. Um e-mail próprio de convite pediria template novo, remetente e a infraestrutura de envio fora do Firebase que a plataforma ainda não usa para conta — escopo de outra spec. A consequência é aceita: o administrador avisa a pessoa por fora de que o e-mail vai chegar, e o modal diz isso na mensagem de sucesso.

4. **Ordem da escrita: conta → claim → Postgres → e-mail.**
   É a mesma regra da Spec 013 (decisão 4) — o Firebase é dono do papel e o banco só espelha depois do sucesso. O `setCustomUserClaims` preserva os claims que já existirem (`{ ...customClaims, role: 'admin' }`), como o `setRole` já faz. A linha do Postgres vem por `upsert` sobre o `uid` (decisão 5). O e-mail fica por último porque é o único passo que não altera estado: se ele falhar, a conta já é administradora e a pessoa pode receber o link de novo pelo "Esqueci minha senha" do login, que para conta existente sempre envia. A resposta sai com `inviteEmailSent: false` e o modal diz exatamente isso, em vez de devolver erro e deixar parecer que nada foi feito.

5. **A linha no Postgres é criada no convite, e não só no primeiro login.**
   A tabela da Spec 013 lê `users`, e a linha hoje só nasce no `findOrCreate` do `GET /users/me`. Sem ela, o administrador adiciona alguém e a pessoa não aparece na lista — parece que a ação falhou, e não há como rebaixá-la pelo painel antes do primeiro acesso. O `upsert` grava `id` (uid do Firebase), `email` e `role = admin`, com `name` nulo e `lastSeenAt` nulo: a linha aparece com "Onboarding pendente" (Spec 013, decisão 15) e "nunca acessou", que é a verdade. O `findOrCreate` do primeiro login faz `upsert` sobre a mesma chave e apenas completa o espelho.

6. **Conta existente é promovida sem e-mail.**
   Quem já tem conta já tem senha, e mandar um link de "definir senha" para essa pessoa é, na melhor hipótese, confuso, e na pior parece phishing. A resposta vem com `outcome: 'promoted'`, e o modal avisa que o acesso ao painel aparece depois que a pessoa **sair e entrar de novo** — o claim novo só chega ao token na renovação da sessão, e é esse token que o `RolesGuard` lê (Spec 013, decisão 3).

7. **Já ser administrador é no-op, e não erro.**
   `outcome: 'already-admin'`, sem chamada de escrita ao Firebase nem ao banco além do `upsert` que reconcilia o espelho. Tratar como 409 transformaria um clique repetido em mensagem de falha para uma situação que já é a desejada.

8. **Conta bloqueada não é promovida: 409.**
   Promover uma conta com `disabled` no Firebase produziria um administrador que não consegue entrar, e esconderia o bloqueio atrás de um sucesso. A regra é do servidor; o modal mostra "Esta conta está bloqueada. Desbloqueie-a na tabela antes de torná-la administradora." O desbloqueio continua sendo o da Spec 013 (decisão 9).

9. **O e-mail é validado e normalizado no servidor.**
   `AddAdminDto` valida com `@IsEmail()` e normaliza para minúsculas e sem espaços antes de consultar o Firebase — o mesmo `normalizeEmail` que o `AuthService` já aplica, para que `Fulana@Empresa.com ` e `fulana@empresa.com` não virem duas contas. O formulário do front também valida (Reactive Forms, `Validators.email`), mas só para responder rápido; quem decide é o DTO.

10. **Não há exposição de "e-mail já cadastrado" fora do painel.**
    O `requestAccount` e o "Esqueci minha senha" respondem sempre igual para não permitir enumerar e-mails (Spec 004). Aqui a resposta **diz** se a conta existia, e isso é aceitável só porque a rota está atrás de `FirebaseAuthGuard` + `@Roles('admin')`: quem a chama já enxerga a lista inteira de usuários pela Spec 013. A rota não é reaproveitada por nenhum fluxo público.

11. **O novo administrador passa pelo onboarding como qualquer conta.**
    A rota `/admin` exige `onboardingGuard`, e o onboarding é onde o aceite da Política de Privacidade é registrado (Spec 015, decisão 7). Um administrador também trata dado pessoal — mais do que um aluno —, então nada aqui dispensa esse passo. O primeiro acesso da pessoa é: definir senha → login → onboarding → `/admin`.

12. **Ser administrador não concede acesso aos módulos do curso.**
    Acesso ao conteúdo é `ModuleAccess` (Spec 014); papel é autorização do painel. Misturar os dois faria "adicionar admin" conceder curso sem registro de origem. Se o novo administrador precisar assistir, a cortesia da Spec 014 (decisão 20) continua sendo o caminho, no detalhe do usuário.

13. **Sem log de auditoria, pelo mesmo motivo da Spec 013.**
    Quem adicionou quem não fica registrado — só o resultado (`role`, `createdAt`). A Spec 013 (decisão 14) recusou um log em meia medida cobrindo duas rotas; somar uma terceira não muda o argumento, e o log continua sendo spec própria.

## Integração com o existente
No `api/`, o `AdminUsersController` (Spec 013) ganha `POST /admin/users/admins`, sob os mesmos `FirebaseAuthGuard` + `RolesGuard` + `@Roles('admin')` do controller, e o `AdminUsersService` ganha `addAdmin`. A criação de conta e o envio do e-mail de definição de senha saem de dentro de `AuthService.requestAccount` para métodos públicos do próprio `AuthService`, que o `UsersModule` já importa via `AuthModule` — o `requestAccount` passa a chamá-los, sem mudar de comportamento. O `setCustomUserClaims` segue o formato do `setRole`. Nenhuma coluna nova, nenhuma migration.

No `front/`, o `AdminUsersService` (`core/services/admin-users.service.ts`) ganha `addAdmin(email)`, e a aba "Visão Geral" do `admin-dashboard` ganha o botão ao lado de "Exportar CSV" e um formulário reativo dentro do `ui-modal` já usado pelo detalhe, com `ui-input` e `ui-button` da Spec 002. Depois do sucesso, a listagem é recarregada com a consulta corrente, para que a pessoa adicionada apareça sem F5.

## Fora de escopo
- E-mail próprio de convite, com template e remetente da plataforma (decisão 3).
- Reenvio de convite pelo painel — o "Esqueci minha senha" do login já cobre (decisão 4).
- Convite de **aluno** pelo painel, com ou sem cortesia: esta spec cria apenas administradores.
- Papéis intermediários (editor, financeiro, suporte) e permissões por aba.
- Regra de "não rebaixar o último admin" (Spec 013, decisão 10).
- Log de auditoria (decisão 13).
- Acesso automático aos módulos do curso para administradores (decisão 12).
