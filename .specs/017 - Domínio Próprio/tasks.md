# Tasks: Spec 017 - Domínio Próprio e Refresh Token em Cookie

Spec de `api/` (NestJS + Jest), `front/` (Angular standalone + signals) e configuração de plataforma (DNS, Vercel, Firebase, Mercado Pago, Mux, bucket). No backend a suíte vem **antes** da implementação, conforme `.claude/RULES.md`. As decisões referenciadas estão no `context.md`.

Ordem das fases: primeiro o código que só troca endereço (front e API), que pode ir para produção antes do DNS porque os valores reais vêm das variáveis da Vercel. Em seguida o refresh token, backend antes do front, porque o front consome o contrato novo. Depois a plataforma, na ordem de virada do `context.md`: DNS, Firebase, variáveis, redirects, webhooks. O deploy do cookie só acontece depois que os redirects estiverem no ar (decisão 11). A verificação em navegador fecha a spec.

## Fase 1: Front - Domínio Canônico nos Defaults
- [ ] **Task 1.1:** Trocar o default de `SITE_ORIGIN` para `https://www.delcastanher.srv.br` e o de `API_URL` para `https://api.delcastanher.srv.br` em `front/scripts/apply-env.mjs` (decisões 2 e 4).
- [ ] **Task 1.2:** Trocar o default de `ORIGIN` em `front/scripts/generate-sitemap.mjs` para `https://www.delcastanher.srv.br` (decisão 2).
- [ ] **Task 1.3:** Trocar `siteOrigin` em `front/src/environments/environment.development.ts` para o domínio novo, mantendo o comentário que explica por que ele aponta para produção e não para `localhost`.
- [ ] **Task 1.4:** Trocar `og:url` e `og:image` do `front/src/index.html` e a linha `Sitemap:` do `front/public/robots.txt` para o domínio novo (decisão 3).
- [ ] **Task 1.5:** Atualizar o comentário do `seo.service.ts`, que hoje descreve a migração como futura.
- [ ] **Task 1.6:** Rodar `npm run build` no `front/` sem variáveis de ambiente e conferir, no log e nos arquivos gerados, que `environment.ts`, `sitemap.xml` e `robots.txt` saem com `www.delcastanher.srv.br`. Buscar `vercel.app` em `front/src`, `front/public` e `front/scripts`: nenhuma ocorrência pode sobrar.
- [ ] **Task 1.7:** Rodar `npm test` no `front/` e corrigir regressões — `seo.service.spec.ts` compara contra `SITE_ORIGIN`.

## Fase 2: Backend - Domínio nas Fixtures e na Documentação (TDD)
- [ ] **Task 2.1:** Trocar as fixtures de `cors.config.spec.ts` e de `account.service.spec.ts` para `https://www.delcastanher.srv.br`, mantendo os mesmos casos: é a produção real que os testes passam a descrever.
- [ ] **Task 2.2:** Escrever em `auth.service.spec.ts` o caso do `UNAUTHORIZED_DOMAIN`: o Firebase recusa o `continueUrl`, a API responde erro genérico ao usuário e **loga a causa explícita** — "domínio de `FRONTEND_URL` não autorizado no Firebase". Hoje o erro cai no genérico e ninguém descobre a causa pelo log (decisão 8).
- [ ] **Task 2.3:** Implementar a tradução e o log de `UNAUTHORIZED_DOMAIN` no mapa de erros do `auth.service.ts`.
- [ ] **Task 2.4:** Atualizar `api/.env.example` (`CORS_ORIGINS`, `STORAGE_CORS_ORIGINS`, o exemplo de `FRONTEND_URL`), o comentário de exemplo de `cors.config.ts` e o `api/README.md` para o domínio novo, incluindo o uso de `storage:cors` em modo de substituição (decisão 9).
- [ ] **Task 2.5:** Rodar `npm test` no `api/` e corrigir regressões.

## Fase 3: Backend - Refresh Token em Cookie (TDD)
- [ ] **Task 3.1:** Escrever a suíte do módulo de configuração do cookie: nome `__Secure-refresh`, `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/auth`, **sem** `Domain`, e `Max-Age` a partir de `AUTH_REFRESH_COOKIE_MAX_AGE_DAYS`, com default de 30 e recusa de valor não numérico ou menor que 1 (decisões 12 e 15). As opções de apagar precisam ser as mesmas de gravar, senão o navegador mantém o cookie.
- [ ] **Task 3.2:** Implementar o módulo de configuração do cookie e registrar o `cookie-parser` no `main.ts`.
- [ ] **Task 3.3:** Escrever a suíte do `POST /auth/login`: a resposta traz `idToken`, `expiresIn` e `user`, **não** traz `refreshToken`, e o `Set-Cookie` sai com todos os atributos da Task 3.1 (decisão 13).
- [ ] **Task 3.4:** Escrever a suíte do `AuthService.refresh()`: chamada a `securetoken.googleapis.com/v1/token` com `grant_type=refresh_token`, revalidação do `idToken` pelo Admin SDK trazendo o `role` atual, e devolução do refresh token novo para regravar o cookie. Incluir um caso em que o `role` mudou desde o login — o refresh devolve o papel novo (decisão 14).
- [ ] **Task 3.5:** Escrever a suíte das falhas do refresh: sem cookie, `TOKEN_EXPIRED`, `USER_DISABLED`, `USER_NOT_FOUND` e `INVALID_REFRESH_TOKEN` respondem `401` **e apagam o cookie**; falha de rede com o Firebase responde `503` e **mantém** o cookie, porque o token não foi recusado (decisão 14).
- [ ] **Task 3.6:** Escrever a suíte da conferência de `Origin` nas rotas com cookie: origem em `CORS_ORIGINS` passa; origem ausente ou fora da lista responde `403` sem tocar no Firebase e sem regravar o cookie (decisão 16).
- [ ] **Task 3.7:** Escrever a suíte do `POST /auth/logout`: `204`, `Set-Cookie` expirado com os mesmos `Path` e atributos, resposta igual com ou sem cookie, e **nenhuma** chamada a `revokeRefreshTokens` (decisão 17).
- [ ] **Task 3.8:** Implementar `refresh` e `logout` no `AuthController` e no `AuthService`, e remover `refreshToken` do tipo `AuthSession`.
- [ ] **Task 3.9:** Remover `POST /auth/verify`, o `VerifyDto` e os testes da rota (decisão 21).
- [ ] **Task 3.10:** Acrescentar `AUTH_REFRESH_COOKIE_MAX_AGE_DAYS` ao `.env.example`, com o comentário do porquê dos 30 dias.
- [ ] **Task 3.11:** Rodar `npm test` no `api/` e corrigir regressões — o `FirebaseAuthGuard` não pode ter mudado de comportamento.

## Fase 4: Front - Sessão em Memória e Renovação
- [ ] **Task 4.1:** Reescrever a persistência do `AuthService`: `idToken`, `expiresAt` e `user` só em signal, e no `localStorage` apenas o indicador `delcastanher.has-session`, sem valor de segredo. Na primeira leitura, apagar a chave antiga `delcastanher.session` (decisões 18 e 19).
- [ ] **Task 4.2:** Passar `withCredentials: true` nas chamadas de `login`, `refresh` e `logout`, e ajustar o tipo `AuthSessionResponse` ao contrato novo, sem `refreshToken`.
- [ ] **Task 4.3:** Implementar `refresh()` com uma única requisição em andamento compartilhada entre os chamadores, e o agendamento da renovação para um minuto antes de `expiresAt`, cancelado no logout (decisão 20).
- [ ] **Task 4.4:** Fazer o `logout()` chamar `POST /auth/logout` e limpar o estado local **mesmo se a chamada falhar** (decisão 17).
- [ ] **Task 4.5:** Criar o initializer de sessão em `app.config.ts` com `provideAppInitializer`: só no navegador, só com `delcastanher.has-session` presente, e sem travar a aplicação se a API não responder (decisão 19).
- [ ] **Task 4.6:** Acrescentar ao `authInterceptor` o tratamento de `401` da nossa API: um refresh, uma nova tentativa da requisição original, e logout com redirecionamento para `/login` se o refresh falhar. As rotas `/auth/*` ficam de fora (decisão 20).
- [ ] **Task 4.7:** Reescrever `auth.service.spec.ts`: nenhum token no `localStorage` depois do login; a chave antiga é apagada; refresh concorrente dispara **uma** requisição; o logout limpa o estado mesmo com a API fora do ar.
- [ ] **Task 4.8:** Reescrever `auth.interceptor.spec.ts`: `401` seguido de refresh e nova tentativa; dois `401` simultâneos compartilham um refresh; o `401` de `/auth/refresh` não entra em loop; o token continua sem ir para destino que não é a API.
- [ ] **Task 4.9:** Escrever a suíte do initializer: sem o indicador, nenhuma requisição; com o indicador, o guard só roda depois do refresh; no servidor (prerender), nada acontece.
- [ ] **Task 4.10:** Rodar `npm test` no `front/` e corrigir regressões — os guards leem `isAuthenticated` e `role` e precisam passar sem alteração.

## Fase 5: Plataforma - DNS e Domínios na Vercel
- [ ] **Task 5.1:** Adicionar `www.delcastanher.srv.br` e `delcastanher.srv.br` ao projeto do front e `api.delcastanher.srv.br` ao projeto da API na Vercel, e criar no DNS os registros que a Vercel pedir (`CNAME` para `www` e `api`, `A`/`ALIAS` para o apex).
- [ ] **Task 5.2:** Aguardar a verificação dos três domínios e conferir o certificado HTTPS emitido de cada um com `curl -I`.
- [ ] **Task 5.3:** Conferir que `https://api.delcastanher.srv.br` responde a mesma API que o host `vercel.app` antes de qualquer variável mudar.

## Fase 6: Firebase Auth - Domínio Autorizado e Testes
- [ ] **Task 6.1:** Adicionar `www.delcastanher.srv.br` em *Authentication → Settings → Authorized domains* no console do Firebase, **antes** de qualquer mudança em `FRONTEND_URL` (decisão 8). Não remover `delcastanher.vercel.app` nesta etapa.
- [ ] **Task 6.2:** Criar `api/scripts/spec017-firebase-dominio.ts` e o script `spec017:firebase-dominio` no `package.json`: usa o Admin SDK (`generatePasswordResetLink`) com `continueUrl` em `https://www.delcastanher.srv.br/login` e espera um link gerado. Como controle, repete com um domínio que certamente não está autorizado e espera a recusa `auth/unauthorized-continue-uri` — sem o controle, um "passou" não provaria que o Firebase está conferindo o domínio. O script não envia e-mail.
- [ ] **Task 6.3:** Rodar `npm run spec017:firebase-dominio` contra o projeto do Firebase de produção e registrar a saída nesta task.
- [ ] **Task 6.4:** Depois da Fase 7, pedir "Criar nova conta" em `https://www.delcastanher.srv.br` com um e-mail de teste, abrir o link recebido, definir a senha e conferir que o botão de continuar do Firebase volta para `https://www.delcastanher.srv.br/login`, e não para o `vercel.app`.
- [ ] **Task 6.5:** Repetir o fluxo com "Esqueci minha senha" em uma conta existente e conferir o mesmo retorno.
- [ ] **Task 6.6:** Conferir no log da API da Vercel que nenhuma requisição dos passos anteriores gerou `UNAUTHORIZED_DOMAIN` (Task 2.2).

## Fase 7: Plataforma - Variáveis de Ambiente na Vercel
- [ ] **Task 7.1:** Listar as variáveis atuais dos dois projetos com `vercel env ls` e registrar nesta task os valores de produção que vão mudar, para ter como voltar.
- [ ] **Task 7.2:** No projeto da **API**, em *Production*: `FRONTEND_URL=https://www.delcastanher.srv.br` e `CORS_ORIGINS=https://www.delcastanher.srv.br,https://delcastanher.vercel.app` — o host antigo ainda somado, porque o front continua respondendo nele até o redirect (passo 3 da ordem de virada).
- [ ] **Task 7.3:** Fazer o redeploy de produção da API — variável nova só vale em deploy novo — e conferir no log de inicialização que ela subiu sem o erro de `CORS_ORIGINS` não configurada.
- [ ] **Task 7.4:** No projeto do **front**, em *Production*: `SITE_ORIGIN=https://www.delcastanher.srv.br` e `API_URL=https://api.delcastanher.srv.br`. Em *Preview*, apenas `API_URL`, para os previews continuarem falando com a API de produção pelo host novo.
- [ ] **Task 7.5:** Fazer o redeploy de produção do front e conferir no log de build a linha `environment.ts gerado: siteOrigin=https://www.delcastanher.srv.br`. Conferir no navegador que as chamadas vão para `api.delcastanher.srv.br`, sem erro de CORS.
- [ ] **Task 7.6:** Configurar o redirect 301 de `delcastanher.srv.br` e de `delcastanher.vercel.app` para `www.delcastanher.srv.br` nas configurações de domínio da Vercel (decisão 1), e conferir com `curl -I` que path e query são preservados.
- [ ] **Task 7.7:** Depois do redirect, no projeto da **API**: `CORS_ORIGINS=https://www.delcastanher.srv.br`, `STORAGE_CORS_ORIGINS=https://www.delcastanher.srv.br,http://localhost:4200` e `AUTH_REFRESH_COOKIE_MAX_AGE_DAYS=30`. Fazer o redeploy (decisões 5, 9 e 15).
- [ ] **Task 7.8:** Rodar `npm run storage:cors` em modo de substituição e conferir, na lista impressa, que o `vercel.app` saiu das origens do bucket (decisão 9).
- [ ] **Task 7.9:** Conferir com `vercel env ls` nos dois projetos que nenhuma variável de produção cita `vercel.app`.

## Fase 8: Plataforma - Webhooks e Search Console
- [ ] **Task 8.1:** Registrar nesta task as URLs de webhook cadastradas hoje no Mercado Pago (modo de teste e modo produtivo) e no Mux, para ter como voltar.
- [ ] **Task 8.2:** No painel do Mercado Pago, trocar a URL de notificação do tópico `order` para `https://api.delcastanher.srv.br/webhooks/mercadopago` nos **dois** modos, teste e produtivo, sem regenerar a assinatura (decisão 7).
- [ ] **Task 8.3:** Disparar a notificação de teste do painel do Mercado Pago e conferir no log da API da Vercel que ela chegou no host `api.delcastanher.srv.br` com assinatura válida (`200`, sem `401`).
- [ ] **Task 8.4:** Conferir com um pedido PIX real de baixo valor em produção que o pedido vira `PAID` **pelo webhook**, com a notificação registrada no log do host novo antes do próximo ciclo de polling da tela (decisão 7; Spec 014, decisão 14).
- [ ] **Task 8.5:** No painel do Mux, apontar o webhook para `https://api.delcastanher.srv.br/webhooks/mux`. Se for preciso criar um endpoint novo em vez de editar, copiar o segredo novo para `MUX_WEBHOOK_SECRET` no projeto da API na Vercel e fazer o redeploy **antes** de apagar o endpoint antigo (decisão 7).
- [ ] **Task 8.6:** Subir um vídeo curto pelo `/admin` e conferir que a aula sai de "processando" para pronta pelo webhook, com o evento `video.asset.ready` registrado no log do host novo e assinatura válida.
- [ ] **Task 8.7:** Apagar o endpoint antigo do Mux, se a Task 8.5 criou um novo, e conferir no painel de cada provedor que nenhuma URL de webhook cita `vercel.app`.
- [ ] **Task 8.8:** Registrar nesta task que o host `delcastanher-api-gamma.vercel.app` pode deixar de ser divulgado. Ele **não** é desligado nesta spec (decisão 6).
- [ ] **Task 8.9:** Criar a propriedade de domínio no Google Search Console, enviar o `sitemap.xml` do domínio novo e conferir que as URLs listadas são do `www`.

## Fase 9: Deploy do Refresh Token
- [ ] **Task 9.1:** Confirmar que a Task 7.6 está concluída — com o front ainda em `vercel.app`, o cookie seria de terceiro e o refresh falharia para todo mundo (decisão 11).
- [ ] **Task 9.2:** Fazer o deploy de produção da API e, em seguida, do front, com as Fases 3 e 4. Nessa ordem: o front novo depende de `/auth/refresh`, e o front antigo continua funcionando com a API nova durante o intervalo, porque o login só perde o `refreshToken` que ele nunca usava.

## Fase 10: Verificação em Navegador
- [ ] **Task 10.1:** Subir o `api/` em `localhost:3000` e o `front/` em `localhost:4200`, entrar e conferir no DevTools que o cookie `__Secure-refresh` foi gravado para `localhost:3000` com `HttpOnly`, `Secure`, `SameSite=Strict` e `Path=/auth`, e que `document.cookie` não o mostra (decisões 12 e 22).
- [ ] **Task 10.2:** Conferir no `localStorage` que não há `idToken` nem `refreshToken`, só `delcastanher.has-session`; e que a chave antiga `delcastanher.session`, criada à mão antes do reload, foi apagada (decisões 18 e 19).
- [ ] **Task 10.3:** Recarregar `/ava` e `/admin` e conferir que a sessão volta sem passar por `/login`, com uma única chamada a `/auth/refresh` antes das requisições protegidas.
- [ ] **Task 10.4:** Abrir a landing em aba anônima e conferir que **nenhuma** chamada a `/auth/refresh` é feita (decisão 19).
- [ ] **Task 10.5:** Forçar o `idToken` expirado (ou encurtar o agendamento) e conferir que a renovação acontece sozinha; em seguida invalidar o token em memória e conferir que o `401` dispara um refresh e repete a chamada, sem o aluno perceber (decisão 20).
- [ ] **Task 10.6:** Sair e conferir que o cookie foi apagado, que o indicador sumiu e que voltar para `/ava` leva a `/login`; repetir o logout com a API parada e conferir que o front sai do mesmo jeito (decisão 17).
- [ ] **Task 10.7:** Em produção, repetir as Tasks 10.1, 10.3 e 10.6 em `https://www.delcastanher.srv.br`, conferindo o cookie gravado para `api.delcastanher.srv.br`.
- [ ] **Task 10.8:** Em produção, conferir `view-source` da landing e de `/cursos/:slug`: canonical, `og:url`, `og:image` e JSON-LD com `www.delcastanher.srv.br`; e `https://www.delcastanher.srv.br/robots.txt` apontando para o sitemap do domínio novo (decisões 2 e 3).
- [ ] **Task 10.9:** Em produção, abrir uma aula com vídeo e um material complementar e conferir que o bucket responde sem erro de CORS depois da Task 7.8.
- [ ] **Task 10.10:** Em produção, abrir um link antigo em `delcastanher.vercel.app/cursos/...` e conferir o 301 para a mesma rota no `www`.
- [ ] **Task 10.11:** Com `curl`, chamar `POST https://api.delcastanher.srv.br/auth/refresh` com `Origin` de um domínio qualquer e conferir o `403` sem `Set-Cookie` (decisão 16).
