# Tasks: Spec 020 - Recebimento na Conta do Vendedor

Spec de `api/` (NestJS + Prisma + Jest) e `front/` (Angular standalone + signals + Tailwind). No backend a suíte vem **antes** da implementação, conforme `.claude/RULES.md`. Valem o Design System da Spec 002 e os componentes de `front/src/app/shared/ui/`. As decisões referenciadas estão no `context.md`.

> **Spec encerrada com pendências de configuração e verificação** (tasks 0.2 e 6.1 a 6.7). O código está entregue e coberto por testes. As pendências estão na seção "Pendências desta spec para a próxima", no fim, e no Trello (quadro Lidiane, coluna "Pendências (specs anteriores)").

Ordem das fases:
1. A preparação no Mercado Pago e na Vercel vem primeiro, porque sem `redirect_uri` cadastrada e sem PKCE ligado nenhum teste de ponta a ponta é possível.
2. Depois vem o modelo e a cifragem, a base de tudo.
3. Em seguida, a conexão por OAuth e a renovação.
4. Então o pagamento com o token do vendedor, que é onde mora o dinheiro.
5. Depois, o front do painel, da página de retorno e da loja.
6. A verificação em sandbox fecha a spec.

## Fase 0: Preparação (manual)
- [x] **Task 0.1:** Na aplicação `Delcastanher` (painel de desenvolvedor do Mercado Pago), cadastrar a URL de redirecionamento `https://<domínio da API>/mercadopago/oauth/callback` e **ligar o PKCE** no fluxo de código de autorização (decisão 5). Passo do usuário: exige login no painel.
  - URL cadastrada pelo usuário em 2026-09-25: `https://api.delcastanher.srv.br/mercadopago/oauth/callback`. PKCE ativado junto, na mesma tela. Com ele ligado, o Mercado Pago passa a **exigir** `code_challenge` e `code_challenge_method` em toda URL de autorização.
- [x] **Task 0.2:** Conferir se a aplicação devolve o escopo `offline_access`. Sem ele não há renovação (decisão 8).
  - Tentada pelo MCP em 2026-09-28, sem resultado: o MCP do Mercado Pago lista a aplicação, mas não mostra os escopos. O escopo só aparece na resposta do `POST /oauth/token`, então a confirmação fica para a primeira conexão (Task 6.1). Se faltar, o callback recusa com `sem_offline_access`. Antes disso, dá para conferir à mão em "Suas integrações > Delcastanher > Detalhes da aplicação" se `offline_access` está marcado.
  - Confirmada em 2026-09-28 na primeira conexão em produção: o callback aceitou a autorização (sem `sem_offline_access`) e o painel mostra acesso válido até 27/03/2027, com renovação automática. Antes dela, a troca do `code` precisou de três correções, registradas no `fix.md`: `MP_CLIENT_SECRET`, `MP_TOKEN_ENCRYPTION_KEY` e o corpo do `POST /oauth/token` em formulário (PR #27).
- [x] **Task 0.3:** Configurar as variáveis na Vercel do projeto da API. `MP_CLIENT_ID` e `MP_OAUTH_REDIRECT_URI` são config e sobem pelo Claude; `MP_CLIENT_SECRET`, `MP_TOKEN_ENCRYPTION_KEY` e `CRON_SECRET` são segredos e sobem pelo usuário. Acrescentar as cinco ao `api/.env.example` com comentário.
  - `MP_CLIENT_ID` e `MP_OAUTH_REDIRECT_URI` criadas em 2026-09-25 no projeto `delcastanher-api`, em produção e preview. Sem redeploy: nenhum código as lê ainda. Faltam os três segredos.
  - Os três segredos foram subidos pelo usuário em 2026-09-28, como `sensitive`, em produção e preview. Redeploy da produção (`dpl_4WG5qFuZHwKYZmE7ggUGBJtLKovG`, commit `fe27389` da `main`) em `READY`. A `main` ainda não tem o código da 020, então as variáveis só passam a ser lidas quando a release entrar.
- [x] **Task 0.4:** Criar pelo MCP do Mercado Pago (`create_test_user`) um usuário de teste `seller` e um `buyer`, e registrar os usuários (sem senha) nas notas da spec. Destrava a Fase 6 e a task 7.8 da Spec 019.
  - Em 2026-09-28 o MCP devolveu os usuários de teste que já existiam desde 2026-08-10, sem criar novos. Site `MLB`, ambos ativos:
    - `seller`: `TESTUSER8605452672838458141` (user id `3605074487`), o mesmo citado na task 7.8 da Spec 019;
    - `buyer`: `TESTUSER5756959365712233679` (user id `3607372792`).
  - As senhas ficam no painel do Mercado Pago, em "Contas de teste".

## Fase 1: Backend - Modelo e Cifragem (TDD)
- [x] **Task 1.1:** Acrescentar ao `schema.prisma` os models `MercadoPagoConnection` e `MercadoPagoOAuthState` e a coluna `mpConnectionId?` em `Order`, com `onDelete: Restrict` e comentários no padrão do arquivo (decisões 3 e 6).
- [x] **Task 1.2:** Gerar a migration e acrescentar à mão o índice único parcial `WHERE disconnected_at IS NULL` (decisão 3). Aplicar com `prisma migrate deploy` **só com autorização explícita**: o banco é o de produção.
  - Migration escrita, com o índice único parcial sobre `liveMode` (uma conexão ativa **por ambiente**; ver desvios no `context.md`). O `migrate deploy` foi bloqueado para o agente pelo classificador de segurança, e o usuário aplicou a migration em 2026-09-25.
- [x] **Task 1.3:** Escrever a suíte do `TokenCipher` (decisão 4): ida e volta; IV diferente a cada cifragem; adulteração e chave errada falham; chave com tamanho errado recusada na inicialização.
- [x] **Task 1.4:** Implementar o `TokenCipher` com `node:crypto` (AES-256-GCM), lendo `MP_TOKEN_ENCRYPTION_KEY` pelo `payments.config.ts`.

## Fase 2: Backend - Conexão por OAuth (TDD)
- [x] **Task 2.1:** Escrever a suíte do `MercadoPagoOAuthService`:
  - URL de autorização com `client_id`, `response_type=code`, `platform_id=mp`, `redirect_uri` fixa, `state`, `code_challenge` e `code_challenge_method=S256`;
  - `code_verifier` com 43–128 caracteres e `code_challenge` = BASE64URL(SHA256(verifier));
  - troca do `code` em `POST /oauth/token` com `grant_type=authorization_code`, `code_verifier` e `test_token` conforme `MP_SANDBOX`;
  - renovação com `grant_type=refresh_token`;
  - `GET /users/me` para apelido e e-mail.
  - O `fetch` é simulado, como no `mercado-pago.service.spec.ts`.
- [x] **Task 2.2:** Implementar o `MercadoPagoOAuthService`. Erros do Mercado Pago vão para o log **sem** corpo de requisição, que contém `client_secret` e `code`.
  - `test_token` segue o `MP_SANDBOX` do ambiente, por definição do usuário (preview = `TEST-`, produção = `APP_USR-`).
- [x] **Task 2.3:** Escrever a suíte do `MercadoPagoConnectionService`:
  - conexão ativa ou nula;
  - conectar desconecta a anterior na mesma transação;
  - token em claro só por método interno, nunca na visão do painel;
  - renovação na janela de 30 dias, com trava e releitura (decisão 8), e duas chamadas simultâneas resultando em **uma** renovação;
  - `invalid_grant` desconecta com `revoked`;
  - desconectar marca `disconnectedAt` e `disconnectReason = 'manual'`.
- [x] **Task 2.4:** Implementar o `MercadoPagoConnectionService`, com a trava por `SELECT … FOR UPDATE` via `$queryRaw`, como no pacote da Spec 019.
- [x] **Task 2.5:** Escrever a suíte das rotas admin (`GET`, `POST …/link`, `DELETE`): 401 sem token, 403 com `aluno`, nenhum token na resposta, e gerar link invalida os anteriores não usados.
- [x] **Task 2.6:** Escrever a suíte do callback `GET /mercadopago/oauth/callback` (decisão 5):
  - `state` inexistente, vencido ou usado → redireciona com `expirado` ou `usado`, sem chamar o Mercado Pago;
  - `error=access_denied` → `negado`;
  - sucesso → conexão gravada, `state` consumido, redireciona com `resultado=ok`;
  - o mesmo `state` duas vezes conecta uma vez só;
  - token sem `offline_access` → recusado com `sem_offline_access`;
  - falha na troca → `falha`, sem a mensagem do Mercado Pago na URL.
- [x] **Task 2.7:** Implementar os controllers: o admin com `FirebaseAuthGuard`, `RolesGuard` e `@Roles('admin')` na classe; o callback público, fora dos guards, como o webhook. O redirecionamento ao front usa a origem do front da Spec 017, e nunca uma URL vinda da query.
- [x] **Task 2.8:** Escrever a suíte e implementar `POST /internal/mercadopago/refresh`: recusa sem `Authorization: Bearer <CRON_SECRET>`; renova na janela; limpa `MercadoPagoOAuthState` vencidos há mais de 7 dias. Configurar o cron diário no projeto da API na Vercel.
  - **Desvio:** a rota é `GET`, porque é o método com que o Vercel Cron chama. Cron em `api/vercel.json`, todo dia às 09:00 UTC.

## Fase 3: Backend - Pagamento na Conta do Vendedor (TDD)
- [x] **Task 3.1:** Alterar a suíte do `MercadoPagoService`: `createOrder` e `getOrder` recebem o token como argumento e o usam no `Authorization`; o corpo da order **não** tem `marketplace_fee` (decisão 2).
- [x] **Task 3.2:** Implementar a mudança. `mercadoPagoAccessToken` deixa de ser lido dentro do serviço. Conferir na Referência da Orders API se order criada por OAuth pede `integration_data.application_id`, e registrar o resultado aqui.
  - `integration_data.application_id` é campo **da resposta** da Orders API, preenchido pelo Mercado Pago a partir do token: não é enviado.
- [x] **Task 3.3:** Escrever a suíte do `OrdersService`:
  - pedido novo grava `mpConnectionId` da conexão ativa e cria a order com o token dela;
  - sem conexão, `503` antes de gravar qualquer pedido (e sem ocupar vaga de lote da Spec 019);
  - reconsulta e `applyFromGateway` usam o token da conexão do pedido, mesmo desconectada;
  - pedido sem `mpConnectionId` usa `MP_ACCESS_TOKEN`;
  - `mpOrderId` desconhecido não chama o Mercado Pago.
- [x] **Task 3.4:** Implementar no `OrdersService`. A escolha do token fica num método só, e o pedido de pacote da Spec 019 passa pelo mesmo caminho.
- [x] **Task 3.5:** `GET /store/payment-config` devolve `enabled` e `reason` (decisão 7). Cobrir no `store.http.spec.ts`.
- [x] **Task 3.6:** Rodar `npm test` no `api/` e corrigir regressões. `orders.service.ts` é compartilhado com as Specs 014, 016 e 019.
  - `npm test`: 823 testes em 57 suítes. O `tsc --noEmit` segue só com os 2 erros que já existiam (`auth.controller.spec` e `certificates.service.spec`).

## Fase 4: Front
- [x] **Task 4.1:** Criar o `AdminMercadoPagoService` (signals) com estado da conexão, gerar link e desconectar.
- [x] **Task 4.2:** Montar o bloco "Conta recebedora" na aba Financeiro (decisão 12): estados conectado, não conectado, revogado e link gerado; botão de copiar; confirmação ao desconectar; aviso de vencimento. Componente próprio, como o `admin-pacote` da Spec 019.
- [x] **Task 4.3:** Trocar o rótulo do líquido no painel de finanças para "Líquido do vendedor" (decisão 11).
- [x] **Task 4.4:** Criar a página pública `/conexao-mercado-pago` com texto fixo por `resultado` e `motivo`, `noindex`, fora do prerender e do sitemap.
- [x] **Task 4.5:** Na loja, com `enabled: false`, trocar o botão de pagar pelo aviso "Pagamentos temporariamente indisponíveis".
- [x] **Task 4.6:** Cobrir nos specs e rodar `ng test` e `ng build`.
  - `ng test`: 475 testes. `ng build` com as mesmas 8 rotas prerenderizadas; `/conexao-mercado-pago` fica fora delas, e portanto fora do sitemap.

## Fase 5: Documentação
- [x] **Task 5.1:** Atualizar o comentário de `payments.config.ts` e o `api/.env.example`: o `MP_ACCESS_TOKEN` passa a servir só para pedidos anteriores (decisão 6).
- [x] **Task 5.2:** Registrar nesta spec os desvios e o resultado das confirmações das decisões 2 e 10.

## Fase 6: Verificação em Sandbox
- [ ] **Task 6.1:** No painel, gerar o link e conectar o `seller` de teste. O bloco mostra o apelido e o ambiente de teste.
  - O fluxo de conexão foi validado em **produção** em 2026-09-28, com a conta do próprio desenvolvedor (`BOJE8328493`): link, autorização, troca do `code`, token cifrado e bloco "Conectada" com selo "Produção". Falta a versão em sandbox com o `seller` de teste, que depende da URL de retorno do preview.
- [ ] **Task 6.2:** Com o `buyer` de teste, comprar um módulo por PIX e o pacote por cartão:
  - a order aparece na conta do `seller`, com o valor cheio menos a taxa;
  - nada entra na conta da plataforma;
  - a Orders API aceita a order sem `marketplace_fee` (decisão 2).
- [ ] **Task 6.3:** Conferir que a notificação da order chega em `POST /webhooks/mercadopago` com assinatura válida (decisão 10). Se não chegar, registrar o desvio e abrir task para o fechamento sem webhook.
- [ ] **Task 6.4:** Estornar o pagamento do cartão no painel do `seller` e conferir que o acesso é revogado.
- [ ] **Task 6.5:** Desconectar no painel: a loja fecha e `POST /orders` dá 503. Reconectar: a loja abre.
- [ ] **Task 6.6:** Abrir um link já usado e um link vencido: a página de retorno mostra `usado` e `expirado`.
- [ ] **Task 6.7:** Antes de produção: conectar a conta real do vendedor (KYC nível 6) e cadastrar no painel de finanças as taxas da conta dele.
  - Em 2026-09-28 a produção ficou conectada à conta do desenvolvedor, que valida o fluxo mas não é a conta que deve receber. Falta trocar pela conta da vendedora ("Trocar conta" no painel; a atual fica `replaced`), cadastrar as taxas dela e fazer a compra real de valor baixo.

## Pendências desta spec para a próxima

- [x] **Subir os segredos na Vercel (task 0.3).** `MP_CLIENT_SECRET`, `MP_TOKEN_ENCRYPTION_KEY` e `CRON_SECRET`, em produção e preview. [Card](https://trello.com/c/bgFBefqp)
- [ ] **URL de retorno do OAuth para o preview da API.** Hoje só a URL de produção está cadastrada, e a conexão feita pelo preview voltaria para a API de produção. Precisa de um domínio fixo de preview, da URL cadastrada na aplicação e do `MP_OAUTH_REDIRECT_URI` do preview. [Card](https://trello.com/c/MMypS7OC)
- [ ] **Verificação em sandbox (tasks 6.1 a 6.6; a 0.2 foi confirmada em produção).** Conexão, `offline_access`, compra por PIX e cartão, order sem `marketplace_fee`, webhook, estorno, desconexão e links usado e vencido. Tem o risco do token `TEST-` na Orders API. [Card](https://trello.com/c/OFOW0gkA)
- [ ] **Conta real em produção (task 6.7).** Depois do deploy da 020, a loja de produção fica fechada até a conta do vendedor ser conectada. [Card](https://trello.com/c/pETrDOmX)
