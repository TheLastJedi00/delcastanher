# Spec 017: Domínio Próprio — Migração para `delcastanher.srv.br` e Refresh Token em Cookie

**Projeto:** Plataforma E-learning "Imersão RH Estratégico"
**Baseada em:** Spec 003 (Monorepo), Spec 004 (Autenticação), Spec 009 (SEO, Analytics e Conformidade), Spec 010 (Storage e CDN), Spec 011 (Ajustes Simples), Spec 012 (Aulas e Trilha de Vídeos) e Spec 014 (Checkout)
**Escopo técnico:** `front/` (Angular standalone + signals), `api/` (NestJS) e configuração de plataforma (Vercel, DNS, Firebase, Mercado Pago, Mux, bucket de storage). A migração de domínio é configuração e fixtures de teste; o refresh token em cookie é código novo no `AuthModule` e no `AuthService` do front. O backend é escrito com TDD: a suíte vem antes da implementação (`.claude/RULES.md`).

## Objetivo

A plataforma está no ar em dois endereços emprestados da Vercel: `delcastanher.vercel.app` (front) e `delcastanher-api-gamma.vercel.app` (API). Esta spec coloca os dois sob o domínio próprio `delcastanher.srv.br`, com um único endereço canônico para a vitrine, e aposenta o `vercel.app` como endereço público sem quebrar link já compartilhado, sessão de aluno ou pagamento em andamento.

Com front e API sob o mesmo domínio registrável, passa a ser possível guardar o refresh token num cookie `HttpOnly` + `SameSite` emitido pela API. A spec aproveita a migração para tirar os tokens do `localStorage` e dar à sessão uma renovação que hoje não existe: o `refreshToken` é gravado no navegador desde a Spec 004 e **nunca é usado** — o aluno perde a sessão uma hora após o login, quando o `idToken` expira.

## Endereços

| Papel | Endereço | Comportamento |
|---|---|---|
| Front — canônico | `https://www.delcastanher.srv.br` | Serve vitrine, AVA, checkout e `/admin`. |
| Front — apex | `https://delcastanher.srv.br` | Redirect 301 para o `www`, preservando path e query. |
| API | `https://api.delcastanher.srv.br` | Serve a API; destino dos webhooks. |
| Front antigo | `https://delcastanher.vercel.app` | Redirect 301 para o `www`, preservando path e query. |
| API antiga | `https://delcastanher-api-gamma.vercel.app` | Continua respondendo durante a transição (decisão 6). |

## Escopo

- **DNS e Vercel:** os três hostnames apontados e verificados nos projetos da Vercel, com HTTPS emitido.
- **Redirects:** apex e `vercel.app` do front redirecionam em 301 para o `www`.
- **Front:** `SITE_ORIGIN` e `API_URL` apontam para o domínio novo; canonical, `og:url`, `og:image`, JSON-LD, `sitemap.xml` e `robots.txt` passam a sair com ele.
- **API:** `FRONTEND_URL`, `CORS_ORIGINS` e `STORAGE_CORS_ORIGINS` atualizados para o domínio novo.
- **Integrações externas:** domínio autorizado no Firebase, URL de webhook no Mercado Pago e no Mux, CORS do bucket.
- **Defaults e documentação:** fallbacks dos scripts, `.env.example`, READMEs e fixtures de teste deixam de citar `vercel.app` como produção.
- **Refresh token em cookie:** o login passa a gravar o refresh token num cookie `HttpOnly`, `Secure`, `SameSite=Strict` da API, e ele deixa de aparecer no corpo da resposta.
- **Renovação de sessão:** `POST /auth/refresh` troca o cookie por um `idToken` novo; o front renova antes de expirar, ao recarregar a página e ao receber `401`.
- **Logout no servidor:** `POST /auth/logout` apaga o cookie, que o JavaScript não alcança.
- **Tokens fora do `localStorage`:** o `idToken` passa a viver só em memória; a chave `delcastanher.session` é removida.

## Decisões técnicas desta spec

1. **O canônico é o `www`, e o apex redireciona para ele.**
   Um único host canônico é o que evita conteúdo duplicado no buscador: cada página responde em um endereço só, e os outros fazem 301. O `www` foi a escolha da controladora; ele também é o formato que aceita `CNAME` em qualquer provedor de DNS, enquanto o apex depende de registro `A`/`ALIAS`. O redirect é configurado no domínio da Vercel (*Redirect to*), não em `vercel.json`: é regra de host, não de rota da aplicação.

2. **O domínio canônico continua vindo de `SITE_ORIGIN`, não do código.**
   A Spec 009 já deixou o `SeoService`, o JSON-LD do `course-detail`, o `generate-sitemap.mjs` e a reescrita do `robots.txt` lendo uma única variável (`SITE_ORIGIN`, via `apply-env.mjs`). A migração é trocar essa variável no projeto da Vercel — o comentário do `seo.service.ts` previu exatamente este dia. O que muda no código são os **defaults**: `apply-env.mjs`, `generate-sitemap.mjs` e `environment.development.ts` passam a cair em `https://www.delcastanher.srv.br`, porque default apontando para host aposentado geraria canonical errado em qualquer build sem a variável.

3. **O `index.html` e o `robots.txt` versionados também trocam.**
   O `og:url` e o `og:image` do `index.html` estão escritos à mão (a casca da SPA é servida antes do Angular), e o `robots.txt` do repositório tem a linha `Sitemap:` fixa — o build a reescreve, mas o arquivo versionado é o que se lê na revisão. Os três passam a citar o domínio novo, para não sobrar referência ao `vercel.app` fora dos defaults removidos.

4. **A API vai para `api.delcastanher.srv.br`, e o front a encontra por `API_URL`.**
   Subdomínio do mesmo domínio registrável deixa front e API sob a mesma marca e transforma a troca de provedor da API numa mudança de DNS, não numa busca por URL espalhada. `API_URL` no projeto do front aponta para o host novo; o default de `apply-env.mjs` acompanha.

5. **CORS libera só o `www`.**
   Com apex e `vercel.app` redirecionando, nenhum navegador executa a aplicação a partir deles — o 301 acontece antes de qualquer `fetch`. `CORS_ORIGINS` em produção passa a ser `https://www.delcastanher.srv.br`, e o `vercel.app` sai da lista. Liberar origem que não roda a aplicação é superfície sem uso. Previews de branch continuam sendo acrescentados sob demanda, como o `api/README.md` já descreve.

6. **A API antiga não redireciona: ela segue respondendo durante a transição.**
   Redirect 301 em `POST` não é seguido de forma confiável por clientes de webhook, e o Mercado Pago e o Mux guardam a URL cadastrada. Por isso o host `delcastanher-api-gamma.vercel.app` continua servindo a mesma API até as duas integrações estarem apontadas e confirmadas com uma notificação real recebida no host novo. Só então ele deixa de ser divulgado — desligá-lo é passo operacional fora desta spec.

7. **Os dois webhooks passam a apontar para `api.delcastanher.srv.br`, e a troca é feita no painel de cada provedor.**
   A API não envia `notification_url` na criação do pedido nem do upload: as URLs existem só no cadastro de cada painel. Os destinos novos são:

   | Provedor | Rota | URL nova |
   |---|---|---|
   | Mercado Pago (Spec 014) | `POST /webhooks/mercadopago` | `https://api.delcastanher.srv.br/webhooks/mercadopago` |
   | Mux (Specs 010 e 012) | `POST /webhooks/mux` | `https://api.delcastanher.srv.br/webhooks/mux` |

   No Mercado Pago, o segredo de assinatura é da aplicação, e editar a URL não o troca. As URLs de **modo de teste** e de **modo produtivo** são campos separados, e os dois mudam. No Mux, o segredo de assinatura é **do endpoint**: se o painel não permitir editar a URL e for preciso criar um endpoint novo, o segredo muda junto. Nesse caso `MUX_WEBHOOK_SECRET` é atualizado na Vercel e a API ganha um redeploy antes de o endpoint antigo ser apagado. Enquanto os dois coexistirem, as entregas do antigo falham na assinatura e o Mux as reenvia. Isso é inofensivo, porque o evento é idempotente (`updateMany` por `muxAssetId`), mas o endpoint antigo precisa ser apagado assim que o novo for confirmado.

   Um webhook que continuasse no host antigo funcionaria até ele ser desligado e depois pararia sem aviso. Os pagamentos ainda seriam confirmados pelo polling da Spec 014 (decisão 14), mas vídeo nenhum sairia de "processando". Por isso a confirmação é feita com um evento **real** recebido no host novo, e não só com o teste do painel.

8. **`FRONTEND_URL` muda junto, e o domínio precisa estar autorizado no Firebase.**
   O `auth.service.ts` monta o link de definição de senha com `FRONTEND_URL` como destino de retorno. O Firebase recusa `continueUrl` em domínio não autorizado — então `www.delcastanher.srv.br` entra em *Authorized domains* **antes** de a variável mudar, senão o cadastro de aluno quebra silenciosamente no intervalo.

9. **O CORS do bucket é regravado, não acrescentado.**
   `STORAGE_CORS_ORIGINS` passa a ser `https://www.delcastanher.srv.br,http://localhost:4200`, e o `storage:cors` roda em modo de substituição para que o `vercel.app` saia da regra do bucket. O modo padrão do script apenas soma origens, o que deixaria o host antigo liberado indefinidamente.

10. **E-mail no domínio fica fora.**
    O contato de LGPD em `company-info.ts` segue o atual. A dívida registrada na Spec 015 (decisão 5) continua aberta: o domínio agora existe, mas a caixa `privacidade@` não — e trocar o contato por um endereço que não recebe mensagem seria pior do que a dívida.

### Refresh token em cookie

11. **O cookie só é viável porque `www` e `api` passam a ser o mesmo *site*.**
    `srv.br` está na Public Suffix List, então o domínio registrável é `delcastanher.srv.br` e `www.` e `api.` são *same-site*. Um cookie `SameSite=Strict` emitido pela API volta em todo `fetch` do front com `withCredentials`. Hoje isso não funciona: `delcastanher.vercel.app` e `delcastanher-api-gamma.vercel.app` são sites diferentes (`vercel.app` também é sufixo público), e o navegador trataria o cookie como de terceiro. Por isso o cookie entra **nesta** spec, e só vale depois da virada de domínio (passo 9 da ordem de virada).

12. **Atributos do cookie: `__Secure-refresh`, `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/auth`, sem `Domain`.**
    - `HttpOnly`: nenhum script da página lê o token — é o motivo da mudança; um XSS deixa de conseguir levar a sessão para fora do navegador.
    - Sem `Domain`: o cookie fica preso ao host `api.delcastanher.srv.br` e não vaza para o `www` nem para subdomínios futuros.
    - `Path=/auth`: só `/auth/refresh` e `/auth/logout` o recebem; as demais rotas continuam autenticadas pelo `idToken` no header, como hoje.
    - `SameSite=Strict`: basta, porque todo uso do cookie parte do próprio `www`; nenhuma navegação vinda de fora precisa dele.
    - Prefixo `__Secure-`: o navegador recusa o cookie se ele não vier com `Secure` de uma origem HTTPS.

13. **O refresh token sai do corpo da resposta.**
    `POST /auth/login` passa a responder `idToken`, `expiresIn` e `user`, e grava o refresh token só no `Set-Cookie`. Devolvê-lo também no JSON manteria o token ao alcance do JavaScript e anularia o `HttpOnly`. O tipo `AuthSession` perde o campo `refreshToken`.

14. **`POST /auth/refresh` troca o cookie por um `idToken` novo, e a API é quem fala com o Firebase.**
    A rota lê o cookie, chama `securetoken.googleapis.com/v1/token` com `grant_type=refresh_token` (a mesma `FIREBASE_WEB_API_KEY` do login), revalida o `idToken` resultante pelo Admin SDK para trazer o `role` atualizado e responde no mesmo formato do login. O refresh token devolvido pelo Firebase **regrava o cookie**, renovando o `Max-Age`. Sem cookie, ou com token recusado (senha trocada, usuário desativado, token revogado), a resposta é `401` **e o cookie é apagado** — um cookie que já não renova nada só gera `401` em loop.

15. **O cookie dura 30 dias, renovados a cada refresh.**
    O refresh token do Firebase não expira sozinho; quem limita a sessão é o `Max-Age`. Trinta dias corridos sem abrir a plataforma encerram a sessão, e quem usa com frequência não precisa entrar de novo. O valor fica em `AUTH_REFRESH_COOKIE_MAX_AGE_DAYS`, com default de 30.

16. **Proteção contra CSRF: `SameSite=Strict` e conferência de `Origin`.**
    `/auth/refresh` é um `POST` que devolve credencial, então vale a pena proteger mesmo com o `SameSite`. As rotas com cookie recusam requisição cujo `Origin` não esteja em `CORS_ORIGINS`. O CORS já impede outra origem de **ler** a resposta; a conferência impede que ela chegue a disparar a rotação do cookie. Nenhum token anti-CSRF extra: não há formulário nem sessão por cookie nas demais rotas.

17. **`POST /auth/logout` apaga o cookie, sem revogar as outras sessões.**
    Com o token em `HttpOnly`, o `logout()` do front não consegue mais apagá-lo sozinho; a API responde com `Set-Cookie` expirado. A rota não chama `revokeRefreshTokens`: ele derrubaria o aluno em **todos** os dispositivos, e "sair deste navegador" não deve ter esse efeito. O logout do front limpa o estado local mesmo se a chamada falhar — sem rede, o cookie expira no próprio prazo. A Spec 011 deixou o logout no servidor fora de escopo porque a sessão era toda do cliente; com o cookie isso muda.

18. **O `idToken` vive só em memória.**
    O `AuthService` do front mantém `idToken`, `expiresAt` e `user` num signal e deixa de gravá-los no `localStorage`. Ao recarregar a página, a sessão é refeita por `POST /auth/refresh`. Na primeira carga após o deploy, a chave antiga `delcastanher.session` é apagada; quem estiver logado entra de novo uma vez. É o preço de não migrar um refresh token que esteve exposto ao JavaScript.

19. **A retomada de sessão roda antes do roteamento, e só para quem tem sessão.**
    Um `provideAppInitializer` chama `/auth/refresh` antes dos guards, senão `authGuard` e `adminGuard` mandariam para `/login` quem tem sessão válida. Para não atrasar a vitrine de todo visitante anônimo com uma chamada que vai dar `401`, o front grava em `localStorage` um indicador sem valor de segredo (`delcastanher.has-session`) no login e o apaga no logout; o refresh inicial só acontece com ele presente. No prerender (Node), o initializer não faz nada: o servidor continua anônimo, como na Spec 009.

20. **A renovação acontece antes de expirar e, de novo, ao receber `401`.**
    O `AuthService` agenda o refresh um minuto antes de `expiresAt`. O `authInterceptor` cobre o que o timer não cobre (aba suspensa, relógio adiantado): um `401` da nossa API dispara **um** refresh e repete a requisição original uma vez. Requisições que falham juntas compartilham o mesmo refresh em andamento, para não trocar o cookie várias vezes em paralelo. Se o refresh falhar, `logout()` e redirecionamento para `/login`. As próprias rotas `/auth/*` ficam fora dessa lógica, para não entrar em loop.

21. **`POST /auth/verify` sai.**
    Ela existia para "retomada de sessão pelo front" com o `idToken` do `localStorage`, que não existe mais; o `/auth/refresh` ocupa esse papel e ainda devolve um token novo. Nenhum outro consumidor a usa.

22. **Desenvolvimento local continua funcionando, previews de branch não renovam sessão.**
    `localhost:4200` e `localhost:3000` são o mesmo site (a porta não conta), e Chrome e Firefox aceitam `Secure` em `http://localhost`. Um preview em `*.vercel.app` falando com `api.delcastanher.srv.br` é *cross-site*: o cookie não vai, e a sessão do preview dura só a hora do `idToken`. O login funciona e a limitação fica aceita — preview é para conferir tela, não para sessão longa.

23. **A Política de Cookies passa a declarar o cookie de sessão, sem subir a versão do consentimento.**
    A Spec 015 redigiu a política afirmando que a plataforma "não grava nenhum cookie próprio" e listando `delcastanher.session` como item de armazenamento local — as duas afirmações deixam de ser verdade nesta spec. A seção 2 passa a descrever o `__Secure-refresh` (necessário, 30 dias renovados a cada uso, apagado ao sair) e o indicador `delcastanher.has-session`, sem credencial. A `CONSENT_POLICY_VERSION` **não** sobe: o banner pergunta sobre medição de audiência, e isso não mudou; reabrir o consentimento da base inteira por um cookie que não depende de consentimento seria pedir de novo uma decisão que continua valendo.

24. **Na execução, o redirect de `delcastanher.vercel.app` foi descartado, e o endereço saiu do CORS mesmo assim.**
    A decisão 1 previa o 301 do `vercel.app` para o `www`; na virada, o responsável optou por não configurá-lo e por deixar a API e o bucket liberados só para o `www`. O endereço antigo continua servindo o site, mas login, loja e aulas não funcionam por ele. Links já compartilhados abrem uma vitrine sem backend, não um redirecionamento. O apex redireciona para o `www` normalmente (308). Se o redirect voltar a ser desejado, é configuração de domínio na Vercel, sem mudança de código.

## Ordem de virada

A migração tem dependências de ordem; feita fora dela, algum fluxo quebra no intervalo:

1. DNS dos três hostnames e domínios adicionados na Vercel, com certificado emitido.
2. `www.delcastanher.srv.br` em *Authorized domains* no Firebase, confirmado pelo `spec017:firebase-dominio` antes de seguir.
3. API: `CORS_ORIGINS` com o `www` **somado** ao `vercel.app`, `FRONTEND_URL` com o `www`; redeploy.
4. Front: `SITE_ORIGIN` e `API_URL` novos; redeploy.
5. Redirects 301 do apex e do `vercel.app` para o `www`.
6. Webhooks do Mercado Pago e do Mux apontados para `api.delcastanher.srv.br` e confirmados.
7. API: `CORS_ORIGINS` só com o `www`; bucket regravado com `storage:cors`.
8. Sitemap reenviado no Google Search Console com a propriedade do domínio novo.
9. Deploy do refresh token em cookie (API e front juntos), só com o passo 5 concluído — antes disso o front ainda pode estar rodando em `vercel.app`, *cross-site* com a API (decisão 11).

## Variáveis de ambiente na Vercel

Variável nova só passa a valer em deploy novo: cada mudança abaixo é seguida de redeploy do projeto.

| Projeto | Variável | Ambiente | Valor | Quando |
|---|---|---|---|---|
| API | `FRONTEND_URL` | Production | `https://www.delcastanher.srv.br` | Passo 3 |
| API | `CORS_ORIGINS` | Production | `https://www.delcastanher.srv.br,https://delcastanher.vercel.app` | Passo 3 |
| Front | `SITE_ORIGIN` | Production | `https://www.delcastanher.srv.br` | Passo 4 |
| Front | `API_URL` | Production e Preview | `https://api.delcastanher.srv.br` | Passo 4 |
| API | `CORS_ORIGINS` | Production | `https://www.delcastanher.srv.br` | Passo 7 |
| API | `STORAGE_CORS_ORIGINS` | Production | `https://www.delcastanher.srv.br,http://localhost:4200` | Passo 7 |
| API | `AUTH_REFRESH_COOKIE_MAX_AGE_DAYS` | Production | `30` | Passo 7 |
| API | `MUX_WEBHOOK_SECRET` | Production | Segredo do endpoint novo | Passo 6, só se o Mux exigir endpoint novo (decisão 7) |

## Verificação do Firebase Auth

O Firebase só aceita `continueUrl` em domínio autorizado, e a recusa não aparece para o usuário: o e-mail de definição de senha simplesmente não sai. Por isso o domínio é conferido por um script que usa o Admin SDK (`generatePasswordResetLink`) sem enviar e-mail. O script roda uma vez com `https://www.delcastanher.srv.br/login`, esperando sucesso, e outra com um domínio não autorizado, esperando a recusa `auth/unauthorized-continue-uri`. É o controle que prova que o Firebase está de fato conferindo o domínio. Depois do deploy, os fluxos de "Criar nova conta" e "Esqueci minha senha" são refeitos de ponta a ponta no domínio novo, e o `UNAUTHORIZED_DOMAIN` passa a ser logado com a causa explícita, em vez de cair no erro genérico.

## Contrato de autenticação

| Rota | Entrada | Resposta | Cookie |
|---|---|---|---|
| `POST /auth/login` | `{ email, password }` | `{ idToken, expiresIn, user }` | Grava `__Secure-refresh` |
| `POST /auth/refresh` | cookie | `{ idToken, expiresIn, user }` ou `401` | Regrava; apaga no `401` |
| `POST /auth/logout` | cookie | `204` | Apaga |
| `POST /auth/verify` | — | — | Removida (decisão 21) |

O front chama as três rotas com `withCredentials: true`. O CORS da API já sai com `credentials: true` em `main.ts`.

## Integração com o existente

No `front/`, mudam os defaults de `scripts/apply-env.mjs` e `scripts/generate-sitemap.mjs`, o `environment.development.ts`, o `index.html` e o `public/robots.txt`; o `environment.ts` é gerado e segue o que a Vercel mandar. `SeoService`, `course-detail` e o sitemap não mudam — já leem `SITE_ORIGIN`. O `AuthService` troca a persistência em `localStorage` por estado em memória, ganha `refresh()` e o agendamento de renovação, e o `logout()` passa a chamar a API. O `authInterceptor` ganha o tratamento de `401` e o initializer de sessão entra em `app.config.ts`. Os guards não mudam: continuam lendo `isAuthenticated` e `role`.

No `api/`, o `.env.example`, o `README.md`, o exemplo do comentário de `cors.config.ts` e as fixtures de `cors.config.spec.ts` e `account.service.spec.ts` passam a usar o domínio novo, para que a documentação e os testes descrevam a produção real. O `AuthController` ganha `refresh` e `logout`, perde `verify`, e o `AuthService` ganha a troca do refresh token no Firebase. A leitura do cookie usa `cookie-parser` no `main.ts`; a escrita, as opções de `res.cookie()` num único módulo de configuração, para que login, refresh e logout gravem e apaguem exatamente o mesmo cookie. O `FirebaseAuthGuard` não muda.

## Fora de escopo

- **Caixas de e-mail no domínio** (`privacidade@`, `contato@`) e troca do contato LGPD — decisão 10.
- **E-mail transacional com remetente no domínio** (SPF, DKIM, DMARC).
- **Desligamento do host antigo da API** — passo operacional após a confirmação dos webhooks (decisão 6).
- **Domínio próprio para CDN/vídeo** (Mux, bucket) — continuam nos hosts dos provedores.
- Ambientes de homologação em subdomínio (`staging.`), domínios adicionais (`.com.br`) e redirects de marca.
- **"Sair de todos os dispositivos"** e revogação do refresh token pelo administrador — o logout desta spec encerra só o navegador atual (decisão 17).
- **Renovação de sessão em previews de branch** (decisão 22).
- **Sessão por cookie nas demais rotas da API** — elas continuam exigindo o `idToken` no header `Authorization`; o cookie serve só para renovar.
- Guard que impeça usuário autenticado de abrir `/login` (já fora de escopo na Spec 011).
