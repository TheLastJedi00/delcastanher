# Spec 020: Recebimento na Conta do Vendedor (OAuth do Mercado Pago)

**Projeto:** Plataforma E-learning "Imersão RH Estratégico"
**Baseada em:** Spec 013 (Painel Administrativo), Spec 014 (Checkout), Spec 016 (Painel de Finanças) e Spec 019 (Preços, Pacote e Lotes)
**Escopo técnico:** full-stack — `api/` (NestJS + Prisma) e `front/` (Angular standalone + signals + Tailwind). O backend é escrito com TDD: a suíte vem antes da implementação (`.claude/RULES.md`).
**Aplicação Mercado Pago:** `Delcastanher` (app id `4932690255162951`), Checkout Transparente pela **Orders API** (Spec 014, decisão 7).

## Objetivo
Hoje toda venda cai na conta dona da aplicação, porque a order é criada com o `MP_ACCESS_TOKEN` da plataforma. Esta spec faz o dinheiro de **todas as vendas** — módulos avulsos e pacote — cair **inteiro** na conta Mercado Pago de um vendedor, conectada pelo painel por OAuth. A plataforma **não retém comissão**: nenhuma `marketplace_fee` é enviada.

O mecanismo é o do **Split de Pagamentos 1:1** do Mercado Pago, sem a parte do split: a order é criada com o `access_token` que o vendedor concedeu à aplicação, e por isso nasce na conta dele. A taxa do Mercado Pago continua sendo descontada do vendedor, como já é hoje da conta da plataforma.

## Escopo

- **Conta recebedora única:** uma conta Mercado Pago vendedora por vez, que recebe 100% de todas as vendas.
- **Conexão por OAuth pelo painel:** o admin gera um link de autorização; quem autoriza é o dono da conta vendedora, no site do Mercado Pago, sem precisar de login na plataforma.
- **Tokens guardados cifrados** no banco, com renovação automática antes do vencimento de 180 dias.
- **Orders criadas com o token do vendedor**, sem `marketplace_fee`.
- **Reconsulta e webhook** consultam a order com o token da conta em que ela nasceu.
- **Pedidos anteriores** continuam legíveis com o token da plataforma.
- **Painel:** estado da conexão, conta conectada, validade do token, reconectar e desconectar.
- **Loja fechada sem vendedor:** sem conta conectada, a loja diz que o pagamento está indisponível em vez de cobrar na conta errada.

## O que a documentação do Mercado Pago diz (consultada pelo MCP em 2026-09-25)

- **Split 1:1** ([visão geral](https://www.mercadopago.com/developers/pt/docs/split-payments/split-1-1/overview), [integração](https://www.mercadopago.com/developers/pt/docs/split-payments/split-1-1/integration-configuration/integrate-marketplace)): o checkout é integrado com o `access_token` **de cada vendedor**, obtido por OAuth, no backend; no frontend vai a `public_key` **da conta integradora**. A comissão do marketplace é opcional (`marketplace_fee` / `application_fee`), e a do Mercado Pago é descontada do vendedor.
- **Orders API:** `marketplace_fee` existe como `string` decimal e é "exclusivo para integrações com OAuth". Enviá-la com token que não veio de OAuth devolve `400 marketplace_not_valid`. `integration_data` carrega `application_id`, `platform_id`, `integrator_id` e `sponsor.id`.
- **OAuth** ([criação](https://www.mercadopago.com/developers/pt/docs/security/oauth/creation), [renovação](https://www.mercadopago.com/developers/pt/docs/security/oauth/renewal)):
  - URL de autorização: `https://auth.mercadopago.com/authorization?client_id=APP_ID&response_type=code&platform_id=mp&state=RANDOM_ID&redirect_uri=URL`, com `code_challenge` e `code_challenge_method` quando o PKCE está ligado na aplicação.
  - `redirect_uri` precisa ser **estática** e igual à cadastrada na aplicação; dado extra vai no `state`.
  - O `code` vale **10 minutos** e é de uso único; o `access_token` vale **180 dias**.
  - Renovação por `grant_type=refresh_token`, que exige o escopo `offline_access`. **Cada renovação devolve um `refresh_token` novo**, que substitui o anterior.
  - Credenciais de teste: `test_token: true` na troca do `code`.
- **Pré-requisitos do vendedor:** conta Mercado Pago com identificação **KYC nível 6**.
- **Reembolso no 1:1:** sai do saldo do vendedor; sem saldo, não há como a plataforma devolver por ele.

## Decisões técnicas desta spec

1. **Uma conta recebedora, e não um vendedor por produto.**
   O produto tem um curso e uma pessoa que recebe por ele. Vendedor por curso ou por módulo exigiria dividir o carrinho em várias orders quando ele misturasse vendedores, e ninguém pediu isso. A tabela nasce com no máximo uma conexão ativa (decisão 3); o dia em que houver dois autores, a relação `Course → conta` é uma coluna a mais, e não uma reescrita.

2. **Sem comissão: a order vai sem `marketplace_fee`.**
   A plataforma não retém nada. Enviar `marketplace_fee: "0"` seria afirmar uma comissão que não existe, e o campo é opcional. A order leva `integration_data.application_id` somente se a Referência de API exigir para order criada por OAuth — o que é conferido na implementação, pela mesma regra de nomes de campo da Spec 014 (decisão 15).
   - **A confirmar em sandbox:** que a Orders API aceita order criada com token OAuth **sem** `marketplace_fee`. A documentação trata o campo como opcional, mas não mostra o caso sem ele. Se recusar, a saída é `marketplace_fee: "0"` com o motivo registrado nesta spec.

3. **A conexão é um registro próprio, e só uma fica ativa.**
   ```
   MercadoPagoConnection  id, mpUserId, nickname?, email?,
                          accessTokenEncrypted, refreshTokenEncrypted,
                          scope, liveMode, expiresAt,
                          connectedAt, connectedById, connectedByEmail,
                          disconnectedAt?, disconnectReason?,
                          lastRefreshedAt?, createdAt, updatedAt
   ```
   - **Ativa** é `disconnectedAt IS NULL`, e há **uma ativa por ambiente**: índice único parcial sobre `liveMode` (`WHERE "disconnectedAt" IS NULL`), criado em SQL na migration — mesmo recurso do diploma de curso (Spec 008). Preview e produção compartilham o banco (decisão 13); sem o recorte por `liveMode`, conectar o vendedor de teste em preview trocaria o recebedor de produção.
   - **Cada ambiente só enxerga a conexão dele:** a conexão ativa é a de `liveMode = !MP_SANDBOX`.
   - **Conectar outra conta desconecta a anterior do mesmo ambiente** na mesma transação. A linha antiga fica: é ela que diz em qual conta nasceram os pedidos antigos (decisão 6).
   - `connectedById` e `connectedByEmail` são do admin que **gerou o link**, tirados do token, com e-mail copiado pela mesma razão do `GatewayFeeRate` (Spec 016): a autoria continua legível depois de a conta sair.
   - `nickname` e `email` vêm de `GET /users/me` com o token recém-obtido, para o painel mostrar **qual** conta está conectada, e não só um número.

4. **Tokens cifrados em repouso, com chave fora do banco.**
   `access_token` e `refresh_token` movimentam dinheiro de outra pessoa. Eles são gravados com AES-256-GCM (IV aleatório por valor, tag de autenticação junto), com a chave em `MP_TOKEN_ENCRYPTION_KEY` (32 bytes em base64). Um vazamento do banco sozinho não entrega os tokens.
   - Um só serviço (`TokenCipher`) cifra e decifra; nenhum outro lugar vê o token em claro, e ele **nunca** sai em resposta de API nem em log.
   - Trocar a chave invalida as conexões gravadas, e isso é aceitável: basta reconectar. Rotação de chave com duas chaves vigentes fica fora de escopo.

5. **O link de conexão é gerado pelo admin e aberto pelo vendedor — que não precisa de conta na plataforma.**
   O dono da conta vendedora não é, necessariamente, quem administra a plataforma. Por isso o fluxo não depende de sessão no retorno:
   1. O admin clica em **"Gerar link de conexão"**. A API cria um `MercadoPagoOAuthState` com `state` aleatório (32 bytes), `codeVerifier` do PKCE, autor e validade de **24 horas**, e devolve a URL de autorização do Mercado Pago.
   2. O admin abre o link ele mesmo, se a conta for dele, ou copia e envia ao vendedor.
   3. O vendedor entra no Mercado Pago e autoriza a aplicação.
   4. O Mercado Pago redireciona para `GET /mercadopago/oauth/callback?code=…&state=…` na **API**. A rota é pública, e o que a autentica é o `state`: precisa existir, estar dentro da validade e não ter sido usado. Ele é consumido na mesma transação que grava a conexão, então um segundo uso falha.
   5. A API troca o `code` (com `code_verifier`) em `POST /oauth/token`, busca `GET /users/me`, grava a conexão (decisão 3) e redireciona para a página pública `/conexao-mercado-pago?resultado=ok` do front. Em erro, `?resultado=erro&motivo=<código>` com códigos fechados (`expirado`, `negado`, `usado`, `falha`), nunca a mensagem crua do Mercado Pago.
   - **Validade de 24 h no `state`, e não 10 min.** Os 10 minutos são do `code`, que o Mercado Pago emite só depois da autorização; o link em si precisa sobreviver ao tempo de o vendedor ler a mensagem.
   - **PKCE ligado.** A documentação recomenda, e com ele um `code` interceptado não serve sem o `codeVerifier`, que nunca sai do banco. Ligar o PKCE na tela da aplicação do Mercado Pago é passo manual (tasks).
   - **`redirect_uri` estática**, em `MP_OAUTH_REDIRECT_URI`, cadastrada na aplicação: `https://<domínio da API>/mercadopago/oauth/callback` (Spec 017 fixou os domínios).
   - A página `/conexao-mercado-pago` é pública, com `noindex`, fora do sitemap e do prerender, e só diz o resultado com texto fixo por código. Ela não lê nada da API.

6. **Cada pedido sabe em qual conta nasceu, e é com o token dela que é consultado.**
   `Order` ganha `mpConnectionId?`. O `OrdersService` grava a conexão ativa no pedido no mesmo `INSERT` em que grava o valor.
   - **Reconsulta e webhook** (`GET /orders/:id` e `applyFromGateway`) acham o pedido pelo `mpOrderId` **no nosso banco** e usam o token da conexão gravada nele. O `user_id` que vem no corpo da notificação não escolhe token nenhum — o corpo continua não sendo fonte de verdade (Spec 014, decisão 12).
   - **Pedido com `mpConnectionId` nulo** é anterior a esta spec e nasceu na conta da plataforma: é consultado com `MP_ACCESS_TOKEN`, que continua configurado **só para isso**.
   - **Order desconhecida no banco** (notificação de uma venda que não é desta plataforma, ou de outra aplicação na mesma conta) recebe 200 e é ignorada, como qualquer evento que não interessa.
   - **Conexão desconectada** continua legível: o token de uma conta desconectada pela troca de vendedor ainda vale até expirar ou ser revogado, e o pedido pendente dela precisa fechar. Se o Mercado Pago recusar o token (`401`), o pedido fica como está e o erro vai para o log; não há como consultar em nome de quem revogou.

7. **Sem conta conectada, não se vende — e não há volta silenciosa para a conta da plataforma.**
   Cair no `MP_ACCESS_TOKEN` quando não há vendedor faria o dinheiro entrar na conta errada sem ninguém perceber, que é exatamente o que esta spec corrige. `paymentsEnabled` passa a exigir conexão ativa com token válido:
   - `GET /store/payment-config` devolve `enabled: false` com o motivo `seller_not_connected`, e a loja mostra "Pagamentos temporariamente indisponíveis" no lugar do botão de pagar. Vitrine, `/planos` e `/loja` continuam visíveis.
   - `POST /orders` responde `503` com a mesma mensagem, pela mesma regra do teto de parcelas (Spec 014, decisão 9): tela que esconde o botão não é trava.

8. **O token é renovado antes de vencer, em dois lugares.**
   O `access_token` vale 180 dias. Deixá-lo vencer fecha a loja.
   - **Na hora do uso.** Antes de criar ou consultar uma order, se `expiresAt` está a menos de **30 dias**, o serviço renova. A renovação trava a linha da conexão (`SELECT … FOR UPDATE`) e relê o `expiresAt` já travado, porque o `refresh_token` troca a cada uso: duas renovações simultâneas com o mesmo `refresh_token` fariam a segunda falhar e poderiam perder o par novo.
   - **Por agendamento.** Uma loja sem venda por cinco meses não passaria pela renovação na hora do uso. Uma rota interna `POST /internal/mercadopago/refresh`, protegida por `CRON_SECRET`, é chamada **diariamente** pelo Vercel Cron e aplica a mesma regra.
   - **Renovação recusada** (`invalid_grant`, vendedor revogou) marca a conexão com `disconnectedAt` e `disconnectReason = 'revoked'`, e a loja fecha pela decisão 7. O painel mostra o motivo.
   - O escopo `offline_access` é conferido na troca do `code`. Sem ele não há renovação, e a conexão é **recusada** com o motivo `sem_offline_access` — melhor falhar na conexão do que 180 dias depois.

9. **A `public_key` do navegador continua sendo a da aplicação.**
   A documentação do Split 1:1 manda usar a `public_key` da conta integradora no frontend e o token do vendedor no backend. `MP_PUBLIC_KEY` e o `GET /store/payment-config` não mudam.

10. **O webhook continua sendo o da aplicação, e é verificado em sandbox.**
    A assinatura é da aplicação (`MP_WEBHOOK_SECRET`), e a URL de notificação é configurada na aplicação (Spec 014, decisão 7). A documentação lida **não** afirma que as orders criadas com token OAuth notificam a URL da aplicação integradora.
    - **A confirmar em sandbox:** que a notificação da order do vendedor chega em `POST /webhooks/mercadopago` com assinatura válida.
    - **Se não chegar**, a venda continua fechando pelo polling da tela do PIX (Spec 014, decisão 14), e o cartão fecha na resposta da criação. O que se perde é o fechamento com a aba fechada; a saída nesse caso é registrada como desvio e vira task própria.

11. **Taxa, reembolso e contestação passam a ser da conta do vendedor.**
    - O painel de finanças (Spec 016) continua calculando bruto, taxa e líquido por `Order.amountCents` e `GatewayFeeRate`. O líquido passa a ser **o que o vendedor recebe**, e as taxas cadastradas precisam ser as da conta dele — o rótulo do bloco diz "Líquido do vendedor".
    - Estorno e contestação são feitos no painel do Mercado Pago **do vendedor**. A reação da plataforma (revogar acesso em `refunded`/`charged_back`, Spec 014, decisão 22) não muda.
    - Sem saldo na conta do vendedor, o estorno não sai. Isso é da relação entre plataforma e vendedor, e não do código.

12. **O painel mostra a conexão e deixa agir sobre ela.**
    Um bloco **"Conta recebedora"** na aba Financeiro do `/admin`:
    - **Conectada:** apelido, e-mail e `user_id` da conta; conectada em, por quem; token válido até; ambiente (produção ou teste, por `liveMode`); botões "Trocar conta" (gera link novo) e "Desconectar".
    - **Não conectada ou revogada:** aviso em destaque de que a loja está fechada, o motivo, e "Gerar link de conexão".
    - **Link gerado:** a URL com botão de copiar e a validade ("vale até 26/09 14:30"). Gerar outro invalida os anteriores ainda não usados.
    - **Aviso de vencimento:** com menos de 15 dias para o `expiresAt` e a renovação falhando, o bloco mostra o aviso.
    - Desconectar pede confirmação e explica que a loja fecha. Não chama o Mercado Pago para revogar: a revogação da autorização é do vendedor, no painel dele.

13. **O ambiente é o da branch, e o token do vendedor acompanha.**
    Quem define o ambiente é a branch: **preview** roda com `MP_SANDBOX=true` e credenciais `TEST-`; **produção**, com `APP_USR-`. A troca do `code` envia `test_token` igual ao `MP_SANDBOX` do ambiente, então o vendedor conectado em preview recebe token de teste, e em produção, token real.
    - Um usuário de teste `seller` autoriza a aplicação pelo link gerado no painel de preview, e um `buyer` de teste compra.
    - O resultado esperado é a order aparecer na conta do `seller` de teste, com o valor cheio menos a taxa, e nada na conta da plataforma.
    - **Risco conhecido:** a Spec 014 (decisão 24) viu a Orders API recusar as chaves `TEST-` da conta da plataforma (`401 invalid_credentials`). Se o token `TEST-` do vendedor tiver a mesma resposta em preview, a verificação da Fase 6 registra o desvio e a saída é decidida com o usuário.
    - A conexão feita em um ambiente vale só nele: preview e produção compartilham o banco (não há banco separado), então a conexão guarda `liveMode`, e o painel mostra em qual ambiente ela foi feita.

## Modelo de dados

```
MercadoPagoConnection   id, mpUserId, nickname?, email?,
                        accessTokenEncrypted, refreshTokenEncrypted,
                        scope, liveMode, expiresAt,
                        connectedAt, connectedById, connectedByEmail,
                        disconnectedAt?, disconnectReason?,
                        lastRefreshedAt?, createdAt, updatedAt
                        índice único parcial: uma linha com disconnected_at nulo

MercadoPagoOAuthState   id, state @unique, codeVerifier,
                        createdById, createdByEmail,
                        expiresAt, usedAt?, createdAt

Order                   + mpConnectionId?   (onDelete: Restrict)
```

- `Order.mpConnection` é `Restrict`: conexão que já vendeu não é apagável, porque é ela que diz com que token consultar o pedido. Desconectar é marcar, não apagar.
- `MercadoPagoOAuthState` é limpo pela rotina diária da decisão 8 (estados vencidos há mais de 7 dias).

## Variáveis de ambiente

| Variável | Tipo | Quem sobe | Uso |
|---|---|---|---|
| `MP_CLIENT_ID` | config | Claude | app id `4932690255162951` |
| `MP_CLIENT_SECRET` | **segredo** | usuário | troca e renovação do token |
| `MP_OAUTH_REDIRECT_URI` | config | Claude | `https://<api>/mercadopago/oauth/callback` |
| `MP_TOKEN_ENCRYPTION_KEY` | **segredo** | usuário | AES-256-GCM dos tokens (decisão 4) |
| `CRON_SECRET` | **segredo** | usuário | rota de renovação diária (decisão 8) |
| `MP_ACCESS_TOKEN` | segredo (já existe) | — | passa a servir **só** para pedidos anteriores (decisão 6) |

## Rotas novas ou alteradas

| Método | Rota | Quem | Mudança |
|---|---|---|---|
| `GET` | `/admin/mercadopago/connection` | admin | nova — estado da conexão, sem token |
| `POST` | `/admin/mercadopago/connection/link` | admin | nova — gera `state` + PKCE e devolve a URL de autorização |
| `DELETE` | `/admin/mercadopago/connection` | admin | nova — desconecta |
| `GET` | `/mercadopago/oauth/callback` | **público**, autenticado pelo `state` | nova — troca o `code` e redireciona ao front |
| `POST` | `/internal/mercadopago/refresh` | Vercel Cron (`CRON_SECRET`) | nova — renovação diária |
| `GET` | `/store/payment-config` | aluno | `enabled: false` sem conexão (decisão 7) |
| `POST` | `/orders` | aluno | order criada com o token do vendedor; `503` sem conexão |
| `GET` | `/orders/:id` | dono | reconsulta com o token da conexão do pedido |
| `POST` | `/webhooks/mercadopago` | público, assinatura | consulta com o token da conexão do pedido |

## Rotas do front

| Rota | Mudança |
|---|---|
| `/conexao-mercado-pago` | nova, pública — resultado da conexão (decisão 5) |
| `/admin` → Financeiro | bloco "Conta recebedora" (decisão 12); rótulo "Líquido do vendedor" |
| `/loja/pagamento` | "Pagamentos temporariamente indisponíveis" sem conexão |

## Integração com o existente
- **`api/prisma/`:** migration com os dois models, a coluna em `Order` e o índice único parcial.
- **`api/src/config/payments.config.ts`:** leitura das variáveis novas; `paymentsEnabled` deixa de ser só "há credencial" e passa a ser consultado com a conexão (decisão 7).
- **`api/src/payments/`:**
  - `TokenCipher` (decisão 4) e `MercadoPagoConnectionService` (conexão ativa, token em claro para uso interno, renovação com trava, desconexão).
  - `MercadoPagoOAuthService` (URL de autorização, PKCE, troca do `code`, `GET /users/me`).
  - `MercadoPagoService.createOrder` e `getOrder` recebem o token de quem chama, em vez de lê-lo do `ConfigService`. O serviço continua sendo o único que fala com a rede (Spec 014, decisão 7).
  - `OrdersService` grava `mpConnectionId` e resolve o token por pedido.
  - Controllers novos: admin da conexão, callback público e rota interna.
- **`api/vercel.json`** (ou o equivalente do projeto da API): o cron diário.
- **`front/`:** página pública `/conexao-mercado-pago`, bloco no `admin-financeiro`, serviço `AdminMercadoPagoService`, e o estado "indisponível" na loja.

## Testes

### Backend (TDD)
- **`TokenCipher`:** cifra e decifra; dois cifrados do mesmo valor são diferentes; texto adulterado ou chave errada falha, em vez de devolver lixo.
- **Link de conexão:** só admin; o `state` é único e vale 24 h; gerar outro invalida os anteriores não usados; a URL leva `client_id`, `redirect_uri` fixa, `state`, `code_challenge` e `code_challenge_method=S256`.
- **Callback:** `state` inexistente, vencido ou usado redireciona com o motivo certo e não chama o Mercado Pago; `state` válido troca o `code` com o `code_verifier`, grava a conexão e consome o `state`; o mesmo `state` duas vezes conecta uma vez só; `error=access_denied` vira `motivo=negado`; token sem `offline_access` é recusado.
- **Conexão única:** conectar uma segunda conta desconecta a primeira na mesma transação; o banco recusa duas ativas.
- **Pedido:** a order é criada com o token do vendedor e **sem** `marketplace_fee`; o pedido grava `mpConnectionId`; sem conexão, `POST /orders` dá `503` e `payment-config` dá `enabled: false`.
- **Consulta:** pedido com conexão usa o token dela, inclusive desconectada; pedido sem conexão usa `MP_ACCESS_TOKEN`; notificação de order desconhecida responde 200 sem consultar o Mercado Pago.
- **Renovação:** com mais de 30 dias não renova; com menos, renova e grava o `refresh_token` novo; duas renovações simultâneas chamam o Mercado Pago uma vez; `invalid_grant` desconecta com `revoked`; a rota interna recusa sem `CRON_SECRET`.
- **Vazamento:** nenhuma resposta das rotas admin contém `access_token` ou `refresh_token`, e o log de erro do Mercado Pago não os inclui.

### Front
- Bloco "Conta recebedora" nos estados conectado, não conectado, revogado e link gerado; copiar o link; confirmação ao desconectar.
- `/conexao-mercado-pago` com cada `resultado` e `motivo`, e texto fixo para motivo desconhecido.
- Loja com `enabled: false`: sem botão de pagar e com o aviso.

### Em sandbox (usuários de teste)
- Seller de teste conecta pelo link gerado no painel; o bloco mostra o apelido dele.
- Buyer de teste compra um módulo por PIX e o pacote por cartão: as orders aparecem na conta do seller, com o valor cheio menos a taxa, e nenhuma na conta da plataforma.
- A notificação da order chega ao webhook com assinatura válida (decisão 10).
- A order é aceita sem `marketplace_fee` (decisão 2).
- Desconectar fecha a loja; reconectar abre.

## Fora de escopo
- Vários vendedores, vendedor por curso ou por produto (decisão 1).
- Comissão da plataforma (`marketplace_fee`) e split para mais de um recebedor (modelo 1:N, que o Mercado Pago só libera para contas atendidas pela equipe comercial).
- Revogar a autorização pelo lado da plataforma; é o vendedor quem revoga, no painel dele.
- Rotação da chave de cifragem com duas chaves vigentes (decisão 4).
- Relatório de vendas com split do Mercado Pago (API de relatórios); o painel de finanças da Spec 016 continua sendo a fonte.
- Onboarding do vendedor dentro da plataforma (cadastro, KYC): a conta Mercado Pago dele já existe, verificada, antes da conexão.
- Log de auditoria além do autor e da data da conexão.
