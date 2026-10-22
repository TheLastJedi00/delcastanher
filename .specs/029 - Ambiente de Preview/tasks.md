# Tasks: Spec 029 - Ambiente de Preview

Spec de infraestrutura: Vercel (projetos `delcastanher` e `delcastanher-api`), Neon, Firebase e Mercado Pago sandbox, com uma mudança pequena no build da API. A única regra de código nova (migration no build de preview) segue a `.claude/RULES.md`: o teste vem antes. As decisões referenciadas estão no `context.md`.

**Estado em 22/10/2026:**
- `api-preview.delcastanher.srv.br` registrado pelo usuário no projeto da API, verificado e ligado à branch `preview`. Responde 302 porque a branch ainda não tem deploy da API.
- A branch `preview` é a `main` da Spec 026 (84 commits atrás, nenhum à frente) e pode ser sobrescrita.

Ordem das fases:
1. Primeiro fechar o risco de o preview do front chamar a API de produção.
2. Depois o banco de preview e as variáveis, antes do primeiro deploy, para a API de preview nunca nascer apontando para produção.
3. Então o Mercado Pago sandbox e o Firebase.
4. Por fim, o primeiro deploy na branch `preview`, a conferência ao vivo e o roteiro.

As respostas às perguntas estão no `context.md` (22/10/2026).

## Fase 1: Fechar o risco de produção
- [ ] **Task 1.1:** No projeto `delcastanher` (front), trocar o `API_URL` do ambiente Preview (todas as branches) para `https://api-preview.delcastanher.srv.br`, e o `SITE_ORIGIN` de Preview para `https://preview.delcastanher.srv.br` (decisões 1 e 6). Production não muda.
- [ ] **Task 1.2:** Fazer o redeploy do preview mais recente do front e conferir no bundle publicado que o `apiUrl` é o de preview, com `vercel curl` nos chunks, como foi lido na investigação.

## Fase 2: Banco de preview
- [ ] **Task 2.1:** Criar a branch `preview` no projeto Neon da integração (`neon-rose-engine`) **só com o esquema**, sem dados de produção (resposta 1). Registrar no fim deste arquivo o nome, o id da branch e de onde ela nasceu.
- [ ] **Task 2.2:** Dar valor de **Preview** às variáveis do banco no projeto da API (`DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `POSTGRES_*`, `PG*`), apontando para a branch. Hoje elas valem para Production e Preview juntas: separar sem mudar o valor de Production, e conferir depois, só lendo, que a produção continua com o host atual.
- [ ] **Task 2.3:** Aplicar as migrations e rodar o `db:seed` contra ela, com o `DATABASE_URL` da branch na linha de comando, sem gravar em `.env`.
- [ ] **Task 2.4:** Escrever o teste do script de build de preview (`scripts/migrate-preview.mjs` ou equivalente): com `VERCEL_ENV=preview` roda `prisma migrate deploy`; com `production` ou sem `VERCEL_ENV`, não roda nada (decisão 4).
- [ ] **Task 2.5:** Implementar o script e ligá-lo ao build da API (`vercel-build` no `api/package.json`, antes do `nest build`).

## Fase 3: API publica toda push e variáveis de configuração
- [ ] **Task 3.1:** Desligar "pular deploy quando a pasta não mudou" no projeto da API (`enableAffectedProjectsDeployments: false`, decisão 3).
- [ ] **Task 3.2:** Gravar as variáveis de Preview da API (decisão 6): `CORS_ORIGINS=https://preview.delcastanher.srv.br,http://localhost:4200`, `FRONTEND_URL=https://preview.delcastanher.srv.br`, `API_PUBLIC_URL=https://api-preview.delcastanher.srv.br`, e `STORAGE_CORS_ORIGINS` com o valor atual somado a `https://preview.delcastanher.srv.br`.
- [ ] **Task 3.3:** Rodar o `storage:cors` em modo de soma, para o bucket aceitar a origem de preview sem tirar as de produção (Spec 017, decisão 9). Conferir a regra gravada no bucket.

## Fase 4: Mercado Pago sandbox e Firebase
- [ ] **Task 4.1:** Separar a `MP_TOKEN_ENCRYPTION_KEY`: Production fica com a atual, e o Preview ganha uma chave nova de 32 bytes, enviada à Vercel pela entrada padrão, sem ser impressa (decisão 5).
- [ ] **Task 4.2:** Conferir, sem ler o valor, que `MP_SANDBOX`, `MP_ACCESS_TOKEN` e `MP_PUBLIC_KEY` de Preview são do vendedor de teste: o `GET /store/payment-config` da API de preview diz `sandbox: true`, e o `/users/me` do Mercado Pago, chamado pelo script, devolve o `TESTUSER8605452672838458141`.
- [ ] **Task 4.3:** Rodar o `mp-vendedor-sandbox create` contra a branch do Neon, com o `DATABASE_URL` da branch e a chave nova do Preview só no ambiente do comando. Se a branch veio de produção com a conexão sandbox antiga, rodar `delete` antes. Conferir que a conexão da branch de produção não mudou.
- [x] **Task 4.4:** Feito pelo usuário no console em 22/10/2026: adicionar `preview.delcastanher.srv.br` aos domínios autorizados do Firebase Authentication (decisão 7).

## Fase 5: Primeiro deploy e conferência
- [ ] **Task 5.1:** Fazer o merge das branches de fase na `release/029-ambiente-de-preview`, e empurrá-la para a branch `preview` (`git push origin release/029-ambiente-de-preview:preview --force-with-lease`).
- [ ] **Task 5.2:** Acompanhar os dois deploys de preview e conferir no log do build da API que o `prisma migrate deploy` rodou contra a branch, e não contra produção.
- [ ] **Task 5.3:** Conferir os critérios de aceite, registrando cada um no fim deste arquivo:
  - `https://api-preview.delcastanher.srv.br/store/offer` responde 200, e o preflight de `https://preview.delcastanher.srv.br` passa;
  - no Chrome, `https://preview.delcastanher.srv.br` abre sem login da Vercel, faz login com uma conta de teste, recarrega e continua logado;
  - um pedido criado no preview aparece na branch do Neon e não no banco de produção (consulta só de leitura nos dois);
  - cartões de teste no preview: `APRO` aprovado, `FUND` recusado com a mensagem certa, como na Spec 028;
  - um push só de documentação na branch `preview` também publica a API.
- [ ] **Task 5.4:** Apagar as contas e os pedidos de teste criados na conferência, só da branch do Neon e do Firebase.

## Fase 6: Roteiro e PR
- [ ] **Task 6.1:** Escrever o roteiro de uso do preview (decisão 8) no `README.md` da raiz: como empurrar uma release para a branch `preview`, o que acontece com o banco, e o que não roda no preview (e-mail, webhook, crons).
- [ ] **Task 6.2:** Atualizar a memória do projeto: `preview-api-sandbox` e `banco-unico-producao` deixam de valer como estão.
- [ ] **Task 6.3:** Abrir o PR da release contra a `main`, com as decisões tomadas durante a execução no topo. **Sem merge:** o merge é do usuário.

## Registro da execução
