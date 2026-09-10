# Spec 009: Infraestrutura de Escala — SEO, Analytics e Conformidade (LGPD)

**Projeto:** Plataforma E-learning "Imersão RH Estratégico"
**Baseada em:** Spec 002 (Design System), Spec 006 (Funil de Vendas), Spec 007 (Mockup de Checkout) e Spec 008 (Área do Aluno)
**Escopo técnico:** front-only — `front/` (Angular standalone + signals + Tailwind). Nenhuma alteração em `api/`.

## Objetivo
Preparar o terreno "invisível" da plataforma para indexação no Google, rastreamento de campanhas de tráfego pago e adequação legal à LGPD, sem inserir chaves reais de produção e sem disparar um único evento antes de existir consentimento válido.

## Escopo

- **Renderização indexável:** as rotas públicas passam a ser servidas como HTML pronto, não como casca de SPA — pré-requisito para tudo o mais desta spec.
- **Arquitetura SEO:** meta tags dinâmicas por rota (Title, Description, Open Graph, canonical), hierarquia de cabeçalhos correta, `robots.txt` + `sitemap.xml`, `noindex` nas áreas privadas, página 404 própria e dados estruturados (Schema.org `Course` e `FAQPage`).
- **Camada de eventos (Analytics Data Layer):** serviço central de disparo com `dataLayer`, carregamento condicional do container e os eventos padronizados `page_view`, `view_course`, `begin_checkout`, `purchase`, `generate_lead` e `lesson_started`.
- **Conformidade legal (LGPD):** banner de consentimento de cookies com registro auditável, revogação a qualquer momento e as três páginas legais ("Termos de Uso", "Política de Privacidade", "Política de Cookies") com texto placeholder marcado como pendente de revisão jurídica.

## Decisões técnicas desta spec

1. **SSR/prerender é pré-requisito da spec, não melhoria opcional.**
   Hoje o `front/` não tem `@angular/ssr` nem `platform-server`, e o `vercel.json` publica `dist/delcastanher-front/browser` como SPA estática. Nesse cenário, **meta tags dinâmicas não funcionam para compartilhamento**: os crawlers de WhatsApp, LinkedIn, Facebook e X não executam JavaScript e leem apenas o `<head>` estático de `src/index.html` — todo link colado em qualquer lugar mostraria "Delcastanher | Imersão RH Estratégico", independente da rota. O JSON-LD sofre do mesmo mal em menor grau, ficando refém da fila de renderização do Google. Implementar a camada de metadados antes de resolver isso é escrever código morto, então a habilitação de SSR abre a spec como Fase 1.

2. **Prerender estático (SSG), não SSR sob demanda.**
   Todo o conteúdo público é estático: a landing, os planos, o curso único (`courses.mock.ts`) e as páginas legais não dependem de request. Prerender das rotas públicas em build entrega o mesmo HTML indexável sem introduzir servidor Node em produção, sem custo de função na Vercel e sem risco de divergência entre render do servidor e do cliente nas telas autenticadas. As rotas privadas (`/ava`, `/admin`, `/onboarding`, `/checkout`) continuam CSR puro — não devem ser prerenderizadas nem indexadas (decisão 8).

3. **A ordem das fases é ditada pela LGPD, não pelo título da spec.**
   O `context` original ordenava SEO → Analytics → Legal, o que deixaria a camada de eventos pronta e disparando por um ciclo inteiro antes de existir banner de consentimento. Analytics sem consentimento prévio não é dívida técnica, é não conformidade. A ordem passa a ser **SSR → Conformidade/Consentimento → Analytics → SEO/Metadados**: quando o primeiro evento puder ser disparado, o portão de consentimento já existe.

4. **Nenhum evento sai antes do consentimento; o que acontece antes vai para fila.**
   O `AnalyticsEventService` nunca escreve direto no `dataLayer`. Ele consulta o serviço de consentimento: **aceito** → envia; **pendente** → guarda em fila na memória (a navegação inicial é justamente onde ocorre o `page_view` mais valioso), liberando a fila no aceite; **recusado** → descarta a fila e passa a operar como no-op permanente na sessão. O container de tag também só é carregado após o aceite — script carregado já grava cookie, então carregar "só por precaução" já seria tratamento sem base legal.

5. **IDs de analytics vazios significam no-op silencioso, não erro.**
   `environment.ts` é compilado no bundle e versionado no repositório: nada ali é segredo, e IDs de GA4/GTM são públicos por natureza. A precaução real desta spec é comportamental, não de sigilo — os campos `gtmId`/`ga4Id` nascem como string vazia nos dois arquivos de environment e, com valor vazio, o serviço **não injeta script algum** e apenas registra o evento no console em desenvolvimento. Isso permite validar toda a instrumentação sem poluir uma propriedade real, e a virada para produção é preencher uma string.

6. **O checkout é mock, e o evento `purchase` precisa carregar essa marca.**
   A Spec 007 entregou um mockup: não há cobrança, gateway nem pedido real. O `purchase` dispara no `checkout-success` com dados do mock e `transaction_id` sintético, e isso fica escrito no código e na spec. Sem esse aviso, a primeira pessoa que preencher o `gtmId` de produção contamina o funil do GA4 com receita inexistente.

7. **A página 404 existe, mas os "404 disfarçados" atuais permanecem.**
   `app.routes.ts` hoje resolve `**` com `redirectTo: ''`, o que devolve 200 numa URL inexistente e produz conteúdo duplicado. A rota curinga passa a renderizar um componente próprio, marcado `noindex` — em hospedagem estática o status HTTP continua 200 (soft 404), e a meta tag é o sinal disponível para o Google. Já os dois desvios deliberados de `course-detail.html` e `checkout.html`, que capturam slug fora do catálogo e devolvem o visitante ao funil em vez de mostrar erro seco, **ficam como estão**: são decisão de conversão, estão comentadas no código e recebem apenas o mesmo `noindex`.

8. **Área logada é `noindex`, e isso é tão importante quanto indexar a vitrine.**
   `/ava`, `/admin`, `/onboarding` e `/checkout` não têm nada a ganhar em busca orgânica e têm o que perder: um link vazado indexado expõe estrutura interna e gera resultados inúteis para a marca. Elas entram como `Disallow` no `robots.txt` e recebem `<meta name="robots" content="noindex, nofollow">` pela própria camada de metadados — `robots.txt` impede rastreamento, não indexação por link externo, então os dois sinais são necessários.

9. **Consentimento é tudo-ou-nada, mas auditável.**
   Não há hoje pixel de marketing nem cookie de terceiro além do analytics pretendido, então granularidade por categoria (necessário / analytics / marketing) seria complexidade sem uso — o banner oferece **Aceitar** e **Recusar**. O que não é opcional é a prova: o `localStorage` guarda a escolha, o **timestamp do aceite** e a **versão da política vigente**. Quando o texto legal mudar de versão, o consentimento anterior deixa de valer e o banner reaparece. Sem versão e data, não existe demonstração de consentimento, que é exigência do Art. 8º da LGPD.

10. **Revogar precisa ser tão fácil quanto aceitar.**
    Um banner que só aparece uma vez transforma o "Aceitar" em irreversível na prática. O rodapé ganha um acionador permanente de "Preferências de cookies" que reabre o banner, e recusar depois de ter aceito limpa a fila, para os disparos e registra a nova escolha com novo timestamp.

11. **Os textos legais são placeholder explicitamente jurídico, no padrão da Spec 006.**
    As três páginas entram com estrutura de seções real (inclusive a seção de Encarregado/DPO e canal do titular), mas o corpo usa `ui-placeholder-text`, o mesmo tratamento visual de pendência já usado em `[CARGA HORÁRIA]` e `[ASSINATURA DA COORDENAÇÃO]`. Redigir texto jurídico convincente e deixá-lo indistinguível do definitivo é pior que deixá-lo vazio: alguém publica achando que passou por advogado.

12. **Nenhuma dependência nova entra no bundle.**
    `Title` e `Meta` são do `@angular/platform-browser`; o JSON-LD é um `<script type="application/ld+json">` injetado via `DOCUMENT`; o consentimento usa `localStorage`; o `dataLayer` é `window.dataLayer`. Não entram bibliotecas de SEO, de cookie banner nem SDK de analytics — mesma linha das Specs 007 e 008, que evitaram lib de máscara e de PDF. A única adição é `@angular/ssr`, que é do próprio framework.

## Integração com o existente
A camada de metadados é um serviço `core/services/` no padrão de `user.service.ts` e `progress.service.ts` (`providedIn: 'root'`, `inject()`, signals), alimentado por `data` nas rotas de `app.routes.ts` — não há decorator nem componente novo por página. As páginas legais e a 404 entram como rotas públicas irmãs de `/planos` e `/certificado/verificar`, fora dos guards. O banner de consentimento é montado uma vez no `app.ts`, acima do `router-outlet`, para sobreviver à navegação. Os links legais e o acionador de preferências entram no `shared/ui/footer`, que já existe e hoje lista Planos, o curso, redes sociais e telefone. Os eventos de e-commerce se apoiam nos pontos já construídos: `course-detail` (Spec 006), `checkout` e `checkout-success` (Spec 007), e a trilha (Spec 008).

## Fora de escopo
- Criação de conta em Google Analytics, Google Tag Manager, Search Console ou Meta Ads, e qualquer ID real de produção.
- Redação do conteúdo jurídico definitivo das três páginas legais — esta spec entrega estrutura, não texto revisado.
- Pixels de mídia paga (Meta, TikTok, LinkedIn), remarketing, CAPI/conversões server-side e integração com CRM.
- Blog, área de conteúdo ou qualquer estratégia de produção de páginas para busca orgânica.
- Internacionalização, `hreflang` e domínios alternativos.
- Consentimento granular por categoria de cookie e integração com plataforma de CMP de mercado (decisão 9).
- Otimização de Core Web Vitals, budget de bundle e auditoria de performance.
- Backend de registro de consentimento (a prova vive no `localStorage` do titular nesta fase).
