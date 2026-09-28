# Spec 023: Vídeo de Apresentação na Landing

**Projeto:** Plataforma E-learning "Imersão RH Estratégico"
**Baseada em:** Spec 009 (SEO, Analytics e Conformidade), Spec 010 (Storage e CDN), Spec 012 (Aulas e Trilha de Vídeos), Spec 018 (Na Mídia, hero da landing) e Spec 022 (cache e rate limit das rotas públicas)
**Escopo técnico:** full-stack — `api/` (NestJS) e `front/` (Angular standalone + signals + Tailwind), mais configuração no Mux e na Vercel. O backend é escrito com TDD: a suíte vem antes da implementação (`.claude/RULES.md`).
**Fonte:** `.specs/020 - Recebimento na Conta do Vendedor/libs/Vídeos/Chamada módulo 1.mp4` — **60,6 s, 1024×576, ~726 kbps, 5,5 MB** (lido do cabeçalho do MP4 em 2026-09-28). A pasta `libs/` fica fora do git.

## Objetivo
A landing (`/`) apresenta a Imersão só com texto e fotos. A "Chamada módulo 1" é um vídeo curto de apresentação, e esta spec o coloca na landing, logo depois da hero, para o visitante ver a Lidiane falando antes de decidir.

O pedido veio com uma pergunta, que esta spec responde antes de desenhar a tela: **um vídeo público no Mux abre espaço para um ataque de requisições que estoure a cobrança ou exponha o conteúdo pago?**

## A pergunta: custo e segurança de um vídeo público no Mux

### Como o conteúdo pago está protegido hoje
Desde a Spec 010, todo asset do curso é criado com `playback_policies: ['signed']` (`api/src/mux/mux.service.ts`). O `playbackId` sozinho não reproduz nada. O player só toca com um JWT RS256 assinado pela API, com `sub` = o `playbackId` daquela aula e validade curta, emitido em `GET /modules/:moduleId/playback-token` apenas para quem tem acesso ativo (Spec 014).

### Segurança do conteúdo: a landing não abre brecha, se três regras forem seguidas
1. **Asset próprio.** A chamada vira um asset novo no Mux, com `playbackId` próprio. Nenhuma aula é reaproveitada: a "Chamada módulo 1" é um arquivo separado do "Modulo 1 completo".
2. **O token da landing só serve para a chamada.** O JWT do Mux amarra o `sub` a um `playbackId`. Um token emitido para a chamada não toca nenhuma aula, mesmo que a chave de assinatura seja a mesma.
3. **A rota pública assina um id fixo.** Ela assina só o `playbackId` configurado no servidor, e **nunca** um id vindo da requisição. Uma rota que assinasse "o id que o cliente pedir" viraria emissora de token para o curso inteiro. Essa é a única falha de segurança real possível nesta spec, e fica coberta por teste (decisão 3).

### Custo: o risco existe, e o teto é baixo
Tabela do Mux consultada em 2026-09-28 ([pricing](https://www.mux.com/pricing/video)):

| Medidor | Preço | Esta chamada |
|---|---|---|
| Codificação (`basic`) | grátis | — |
| Armazenamento | por minuto guardado | 1 minuto: desprezível |
| **Entrega** | **100.000 minutos grátis por mês**, depois US$ 0,001/min (`basic`, até 1080p) | 1 exibição completa ≈ 1 minuto |

- **Uso legítimo não sai do grátis.** 100.000 minutos são cerca de 100 mil exibições completas por mês, e esses minutos são divididos com as aulas.
- **Um ataque que estoure isso custa pouco por unidade.** Um robô que "assista" 1 milhão de vezes no mês consome ~1 milhão de minutos: US$ ~900 acima do grátis. Não é catastrófico, mas é dinheiro por nada. **O Mux não tem teto de gasto**, então quem limita o prejuízo é a aplicação.
- **Nada no Mux impede um script de baixar os segmentos em laço.** Um vídeo que o navegador de qualquer visitante toca, um script também toca. As defesas abaixo **não** tornam o ataque impossível: elas o tornam **caro para quem ataca, barato para nós e visível**.

### O que o Mux oferece, e o que cada coisa realmente protege
Documentação consultada em 2026-09-28 ([secure video playback](https://www.mux.com/docs/guides/secure-video-playback)):

| Recurso | O que faz | Limite |
|---|---|---|
| Playback `signed` + JWT com `exp` | o link expira; embutir o vídeo em outro site exige buscar token novo o tempo todo | quem busca o token na nossa rota consegue tocar |
| **Playback restriction** por referrer | recusa reprodução a partir de domínio fora da lista | **só existe com playback `signed`**. `allow_no_referrer` precisa ser `true`, senão quebra o iPhone (o player nativo da Apple não manda referrer), e um script pode simplesmente não mandar |
| Playback restriction por user-agent | recusa agente vazio ou de alto risco | um script pode imitar um navegador |

**Conclusão:** um vídeo **público** (`playback_policies: ['public']`) é o caminho mais simples, mas deixa o `playbackId` embutível em qualquer site para sempre, e sem trava nenhuma. Como a assinatura já existe no projeto, o custo de usar `signed` é pequeno e compra hotlink bloqueado, links que expiram e um botão de desligar. É o desenho das decisões abaixo.

## Escopo

- **Asset do Mux** da chamada, `signed`, com playback restriction por referrer.
- **Rota pública** que devolve `playbackId` e token **só** da chamada, com cache na CDN e rate limit no firewall.
- **Seção na landing** depois da hero, com pôster estático e player carregado só no clique.
- **Desligamento sem deploy de front** e acompanhamento do uso de entrega.

## Decisões técnicas desta spec

1. **Asset próprio, `signed`, `basic`, sem resolução acima da fonte.**
   A chamada sobe como asset novo, pelo mesmo `MuxService.createAsset` (`signed`, `video_quality: 'basic'`), a partir do arquivo enviado ao Storage (Spec 010, decisão 4).
   - A fonte é 576p, e o Mux não gera versão acima dela: cada minuto entregue custa o mínimo da tabela `basic`.
   - O upload é **uma vez só, por script** (`npm run media:landing-video`), e não pelo painel: não há outro vídeo de landing hoje, e uma tela de gestão seria escopo para um dado que muda raramente (ver "Fora de escopo"). O script imprime o `playbackId`, que vai para a variável da decisão 3.

2. **Playback restriction por referrer, com `allow_no_referrer: true`.**
   Uma restrição do Mux com a lista `www.delcastanher.srv.br` e `delcastanher.srv.br`, criada uma vez pelo mesmo script, com o id em `MUX_LANDING_RESTRICTION_ID`.
   - `allow_no_referrer: true` porque a documentação avisa que dispositivos Apple não mandam referrer. Com `false`, o vídeo não tocaria em iPhone. A restrição bloqueia o **hotlink por navegador** (outro site embutindo o vídeo, que é o abuso mais comum) e não um script, o que está dito na seção anterior.
   - User-agent: recusar agente **vazio**. É barato, e navegador de verdade sempre manda.
   - `localhost:4200` **não** entra na lista de produção: em desenvolvimento, a restrição é omitida do token, porque o `.env` local não tem a variável.

3. **Uma rota pública, que assina um id fixo, com validade maior que o cache.**
   `GET /landing/intro-video` → `{ playbackId, token, expiresAt }` ou `404` se o vídeo estiver desligado.
   - O `playbackId` vem de `MUX_LANDING_PLAYBACK_ID`, do servidor. A rota **não tem parâmetro**: não há como pedir token de outro vídeo. Um teste garante que nenhuma query, corpo ou cabeçalho muda o `sub` do token.
   - O token leva `sub`, `aud: 'v'`, `exp`, `kid` e `playback_restriction_id`.
   - **Validade de 1 hora.** A documentação exige `exp` maior que a duração do vídeo (61 s), e a validade precisa sobrar depois do cache (decisão 4): um token servido do cache no fim da janela ainda vale ~55 min.
   - `signPlayback` ganha o parâmetro opcional de restrição. As aulas continuam sem ele e com o TTL de hoje.
   - A rota não lê sessão: o token é o mesmo para todos, e é por isso que pode ir para o cache.

4. **Cache na CDN e rate limit no firewall, como nas rotas públicas da Spec 022.**
   - `@PublicCache()` (Spec 022, decisão 16) com `s-maxage=300`. O token é igual para todos, então um volume qualquer de visitas vira **uma execução de função a cada 5 minutos por região**, e uma assinatura RS256 a cada 5 minutos.
   - A mesma regra do Vercel Firewall ganha o caminho `/landing/*`, a 120 req/min por IP. Isso limita quem busca token em laço. Quem já tem o token baixa os segmentos direto do `stream.mux.com`, fora do nosso firewall, e aí o limite é o do custo (decisão 7).
   - **Dependência:** o `@PublicCache()` e a regra do firewall nascem na Spec 022. Se esta spec for executada antes, ela cria os dois, e a 022 os reaproveita.

5. **Nada toca ou carrega antes do clique.**
   - A seção mostra um **pôster estático** (um quadro do vídeo salvo em `front/public/assets/`, por `NgOptimizedImage`) e o botão de reproduzir do `ui-video-player`, que já existe (Spec 012) e já carrega o `@mux/mux-player` só no clique.
   - **Sem autoplay.** Autoplay gastaria um minuto de entrega a cada visita, inclusive de robôs de busca e de quem rola a página sem olhar, e pioraria o carregamento da landing.
   - **O token é buscado no navegador, depois de a página carregar**, e não no build. É essa resposta que diz se a seção aparece (decisões 6 e 8). Buscar só no clique esconderia a seção depois de a pessoa clicar num vídeo desligado.
     - Isso não custa Mux: buscar o token não entrega vídeo. O que se paga é o minuto **tocado**, que só começa no clique.
     - Não custa função nem banco: a rota está em cache na CDN (decisão 4).
     - Se a pessoa clicar depois de o token vencer (página aberta por mais de ~55 min), o player busca de novo antes de tocar.
   - O pôster é estático, e não a thumbnail do Mux, porque com `signed` a thumbnail também exige token (`aud: 't'`) e seria uma chamada ao Mux por visita. Um arquivo local é servido pela CDN da Vercel junto com a página.
   - `disable-tracking` e `disable-cookies` continuam ligados: a landing é pública, e o Mux Data gravaria identificador no navegador antes do consentimento (Spec 009, decisão 4; Spec 010, decisão 9).

6. **O vídeo pode ser desligado sem deploy do front.**
   Se o uso de entrega disparar, o vídeo sai do ar em três níveis, do mais rápido ao mais definitivo:
   1. **Tirar `MUX_LANDING_PLAYBACK_ID`** da Vercel e fazer redeploy da API: a rota responde `404` e a seção **some** da landing (o front esconde a seção quando a rota não devolve vídeo). Tokens já emitidos ainda valem até 1 h.
   2. **Apagar a playback restriction ou o playback ID no painel do Mux**: todo token emitido para de funcionar na hora.
   3. **Apagar o asset.**

   O procedimento fica escrito no `api/.env.example`, junto da variável.

7. **O custo é acompanhado, não suposto.**
   O Mux não tem teto de gasto. A defesa final é ver cedo:
   - **Alerta de uso** no painel de billing do Mux, se a conta oferecer, em 50.000 minutos de entrega no mês (metade do grátis). **Conferir na conta.** Se não houver alerta, conferir o uso toda semana no primeiro mês.
   - O uso da landing é separável do das aulas pelo asset, na tela de uso do Mux.

8. **O vídeo entra depois da hero, numa seção própria.**
   A hero da Spec 018 tem foto de fundo e texto. Um vídeo dentro dela competiria com a foto e com o CTA. A seção nova, **"Conheça a Imersão"**, fica entre a hero e "A Mentora": título, uma frase, o player em 16:9 e o CTA "Quero me Inscrever Agora" abaixo, levando a `/cursos/imersao-rh` como o da hero.
   - Se a rota devolver `404` (decisão 6) ou falhar, a seção **não aparece**, pela mesma regra de "dado ausente some" da Spec 022.
   - A seção é pré-renderizada com o pôster, e a presença do vídeo é conferida no navegador. No HTML do build, a seção sai com o pôster, e o navegador a esconde se o vídeo estiver desligado.

9. **Acessibilidade e SEO.**
   - Botão de reproduzir com `aria-label` ("Reproduzir: apresentação da Imersão RH Estratégico"), já no `ui-video-player`.
   - **Legenda:** o Mux gera legenda automática em português (`generated_subtitles` na criação do asset). Liga-se na criação, sem custo de codificação no `basic`. **Conferir** o preço e a disponibilidade do recurso no plano antes de ligar.
   - Sem JSON-LD `VideoObject` nesta spec: ele pediria `contentUrl` ou `embedUrl` públicos, que é exatamente o que o `signed` evita.

## Variáveis de ambiente

| Variável | Tipo | Quem sobe | Uso |
|---|---|---|---|
| `MUX_LANDING_PLAYBACK_ID` | config | Claude | id do vídeo da landing; ausente = vídeo desligado (decisão 6) |
| `MUX_LANDING_RESTRICTION_ID` | config | Claude | playback restriction por referrer (decisão 2) |

As chaves de assinatura do Mux já existem (`MUX_SIGNING_KEY_ID` e `MUX_SIGNING_PRIVATE_KEY`, Spec 010). Nenhum segredo novo.

## Rotas

| Método | Rota | Quem | O que faz |
|---|---|---|---|
| `GET` | `/landing/intro-video` | público, cache 5 min, rate limit | `{ playbackId, token, expiresAt }` do vídeo configurado, ou `404` |

## Integração com o existente
- **`api/src/mux/mux.service.ts`:** `signPlayback(playbackId, ttl, restrictionId?)`; `createPlaybackRestriction`; `createAsset` com a opção de legenda gerada.
- **`api/src/landing/`** (módulo novo, pequeno): controller e serviço da rota.
- **`api/scripts/`:** `media:landing-video` sobe o arquivo ao Storage, cria o asset e a restrição e imprime os ids. Ele roda contra o Mux de produção **só com autorização explícita**.
- **`front/src/app/features/landing/`:** seção "Conheça a Imersão" com o `ui-video-player`; serviço `LandingVideoService` que busca o token no navegador e o renova se vencer.
- **`front/public/assets/`:** pôster da chamada.
- **Vercel Firewall:** caminho `/landing/*` na regra de rate limit.

## Testes

### Backend (TDD)
- A rota devolve token com `sub` igual a `MUX_LANDING_PLAYBACK_ID`, `aud: 'v'`, `exp` 1 h à frente e `playback_restriction_id`.
- **Nenhum parâmetro muda o vídeo assinado:** query `?playbackId=<id de aula>`, corpo e cabeçalhos são ignorados, e o `sub` continua o da landing.
- Sem `MUX_LANDING_PLAYBACK_ID`, a rota dá `404` e não assina nada.
- Sem `MUX_LANDING_RESTRICTION_ID`, o token sai sem a restrição, que é o caso de desenvolvimento.
- A resposta tem o `Cache-Control` público com `s-maxage=300`, e é igual com e sem `Authorization`.
- O token das aulas não muda: continua sem restrição e com o TTL de hoje.

### Front
- A seção mostra o pôster e o botão; a rota é chamada uma vez no navegador, e nunca no build; o `<mux-player>` não é carregado antes do clique.
- O clique monta o player com o token já buscado; com o token vencido, o clique busca de novo antes de tocar.
- A rota com `404` ou com erro esconde a seção.
- Nenhum `<mux-player>` no HTML pré-renderizado.

### Em produção
- O vídeo toca no Chrome, no Safari do iPhone (com referrer ausente) e no Android.
- O mesmo `playbackId` embutido numa página de outro domínio não toca.
- O token copiado da rota não toca o `playbackId` de uma aula.
- A segunda chamada à rota vem da CDN (`x-vercel-cache: HIT`).
- Um laço acima de 120 req/min recebe `429`.

## Fora de escopo
- Troca do vídeo da landing pelo painel. Hoje, trocar exige rodar o script e mudar a variável.
- Autoplay, vídeo de fundo na hero e vídeo em `/cursos/imersao-rh`.
- Mux Data e analytics de exibição, que dependem de base legal na Política de Cookies.
- `VideoObject` em JSON-LD (decisão 9).
- DRM, marca d'água e proteção contra download: não se aplicam a um vídeo de divulgação.
- Proxy dos segmentos pela nossa API, para contar e limitar a entrega por IP. Custaria mais em banda da Vercel do que o ataque que evitaria.
