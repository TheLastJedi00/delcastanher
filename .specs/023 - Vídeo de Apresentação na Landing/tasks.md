# Tasks: Spec 023 - Vídeo de Apresentação na Landing

Spec de `api/` (NestJS + Jest) e `front/` (Angular standalone + signals + Tailwind), com configuração no Mux e na Vercel. No backend a suíte vem **antes** da implementação, conforme `.claude/RULES.md`. Valem o Design System da Spec 002 e os componentes de `front/src/app/shared/ui/`. As decisões referenciadas estão no `context.md`.

Ordem das fases:
1. A rota e a assinatura vêm primeiro, porque é nelas que mora o único risco de segurança (decisão 3).
2. Depois vem a seção da landing, contra a rota já testada.
3. O asset, a restrição e as variáveis mexem no Mux e na Vercel de produção, e ficam para depois do código pronto.
4. A verificação em produção fecha a spec.

## Fase 1: Backend - Rota do Vídeo da Landing (TDD)
- [ ] **Task 1.1:** Estender a suíte do `MuxService`: `signPlayback` com `playback_restriction_id` quando recebe a restrição, e sem ela quando não recebe; o token das aulas continua igual ao de hoje (decisão 3).
- [ ] **Task 1.2:** Implementar o parâmetro opcional em `signPlayback`, e `createPlaybackRestriction` (referrer com a lista de domínios, `allow_no_referrer: true` e user-agent vazio recusado, decisão 2).
- [ ] **Task 1.3:** Escrever a suíte de `GET /landing/intro-video`:
  - token com `sub = MUX_LANDING_PLAYBACK_ID`, `aud: 'v'`, `exp` 1 h à frente e a restrição;
  - `?playbackId=<id de aula>`, corpo e cabeçalhos **não** mudam o `sub`;
  - sem `MUX_LANDING_PLAYBACK_ID`, `404` sem assinar nada;
  - sem `MUX_LANDING_RESTRICTION_ID`, token sem restrição;
  - `Cache-Control` público com `s-maxage=300`, e a mesma resposta com e sem `Authorization`.
- [ ] **Task 1.4:** Implementar o `LandingModule` (controller e serviço), com a leitura das duas variáveis no `media.config.ts`. Se a Spec 022 ainda não tiver criado o `@PublicCache()`, criá-lo aqui, com TTL por parâmetro.
- [ ] **Task 1.5:** Escrever o script `npm run media:landing-video`: sobe o MP4 ao Storage, cria o asset (`signed`, `basic`, legenda gerada em português se o plano permitir, decisão 9) e a restrição, e imprime os dois ids. **Não rodar** nesta fase.
- [ ] **Task 1.6:** Documentar no `api/.env.example` as duas variáveis e o procedimento de desligamento em três níveis (decisão 6).
- [ ] **Task 1.7:** Rodar `npm test` no `api/` e corrigir regressões. `mux.service.ts` é compartilhado com as aulas (Specs 010 e 012).

## Fase 2: Front - Seção "Conheça a Imersão"
- [ ] **Task 2.1:** Extrair um quadro do vídeo como pôster (JPEG ou WebP, 1024×576), salvar em `front/public/assets/` e registrar aqui de que segundo do vídeo ele saiu.
- [ ] **Task 2.2:** Criar o `LandingVideoService`: busca a rota uma vez, no navegador; guarda o token com o vencimento; e renova antes de tocar se o token tiver vencido (decisão 5).
- [ ] **Task 2.3:** Montar a seção entre a hero e "A Mentora" (decisão 8): título, frase, `ui-video-player` com o pôster por `NgOptimizedImage`, e o CTA "Quero me Inscrever Agora" para `/cursos/imersao-rh`. A seção fica em `@if`, e some quando a rota dá `404` ou falha.
- [ ] **Task 2.4:** Conferir que o `ui-video-player` aceita o pôster por `NgOptimizedImage` sem quebrar a trilha do aluno. Se precisar mudar o componente, cobrir os dois usos.
- [ ] **Task 2.5:** Cobrir nos specs:
  - pôster e botão sem `<mux-player>` antes do clique;
  - a rota chamada uma vez;
  - o clique montando o player;
  - o token vencido renovado;
  - a seção ausente no `404` e no erro.
- [ ] **Task 2.6:** Rodar `ng test` e `ng build`, e conferir no HTML pré-renderizado de `/` a seção com o pôster e sem `<mux-player>`.

## Fase 3: Mux e Vercel (produção)
- [ ] **Task 3.1:** Conferir no plano do Mux:
  - a entrega grátis de 100.000 minutos por mês;
  - se há alerta de uso;
  - o preço da legenda gerada.

  Registrar aqui (decisões 7 e 9).
- [ ] **Task 3.2:** **Com autorização do usuário**, rodar `npm run media:landing-video` contra o Mux de produção e registrar aqui o asset, o `playbackId` e a restrição.
- [ ] **Task 3.3:** Criar `MUX_LANDING_PLAYBACK_ID` e `MUX_LANDING_RESTRICTION_ID` na Vercel do projeto `delcastanher-api`, em produção. São config, então sobem pelo Claude.
- [ ] **Task 3.4:** Acrescentar `/landing/*` à regra de rate limit do Vercel Firewall (decisão 4). Se a regra da Spec 022 ainda não existir, criá-la aqui, com autorização do usuário.
- [ ] **Task 3.5:** Configurar o alerta de uso de entrega em 50.000 minutos, se o plano tiver. Se não tiver, anotar aqui a rotina de conferência semanal no primeiro mês (decisão 7).

## Fase 4: Verificação em Produção
- [ ] **Task 4.1:** Tocar o vídeo no Chrome do desktop, no Safari do iPhone e no Chrome do Android. O iPhone é o caso do referrer ausente (decisão 2).
- [ ] **Task 4.2:** Embutir o mesmo `playbackId`, com um token válido, numa página de outro domínio: não toca.
- [ ] **Task 4.3:** Usar o token copiado da rota com o `playbackId` de uma aula: não toca (decisão 3).
- [ ] **Task 4.4:** `curl -I` duas vezes em `/landing/intro-video`: a segunda vem com `x-vercel-cache: HIT`. Um laço acima de 120 req/min recebe `429`.
- [ ] **Task 4.5:** Testar o desligamento do nível 1 (decisão 6): tirar a variável, fazer redeploy e ver a seção sumir; depois devolver a variável.
- [ ] **Task 4.6:** Conferir a navegação por teclado até o botão de reproduzir, e o `aria-label`.
- [ ] **Task 4.7:** Uma semana depois, conferir o uso de entrega do asset no Mux e registrar aqui.
