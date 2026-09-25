# Spec 019: Preços Reais, Pacote de Lançamento e Lotes

**Projeto:** Plataforma E-learning "Imersão RH Estratégico"
**Baseada em:** Spec 006 (Funil de Vendas), Spec 013 (Painel Administrativo), Spec 014 (Checkout), Spec 016 (Painel de Finanças) e Spec 017 (Domínio Próprio)
**Escopo técnico:** full-stack — `api/` (NestJS + Prisma) e `front/` (Angular standalone + signals + Tailwind). O backend é escrito com TDD: a suíte vem antes da implementação (`.claude/RULES.md`).

## Objetivo
A plataforma vende com preço de trabalho: todo módulo está em R$ 199,00 desde a migration da Spec 014, e o `/planos` ainda mostra `[PREÇO]` em cinco cards de plano que não existem. Esta spec coloca no banco a tabela comercial real — os 12 módulos avulsos com o preço de cada um e o **Pacote de Lançamento** com os 12 módulos, vendido em lotes que viram sozinhos conforme as vagas acabam.

Na mesma passagem, corrige a navegação que expulsa o aluno do AVA: ao ir comprar, ele cai numa tela sem o menu da área do aluno e, dali, só volta repetindo o login ou digitando a URL.

## Escopo

- **Preços reais dos 12 módulos** no banco, no lugar dos R$ 199,00 provisórios.
- **Pacote de Lançamento:** entidade nova com os 12 módulos, vendida como um item só na loja.
- **Lotes do pacote:** Fundador, 2º, 3º e Preço oficial, com vagas; esgotado um lote, o seguinte entra sem ação manual.
- **Pedido de pacote:** `POST /orders` passa a aceitar o pacote, com o preço do lote vigente calculado no servidor.
- **Parcelamento em até 12x**, com juros do comprador (era 6x).
- **`/planos` com a oferta real:** Pacote de Lançamento em destaque, tabela dos módulos avulsos e o card Empresas. Os placeholders saem.
- **Loja:** o pacote aparece no topo de `/loja`, antes da lista de módulos.
- **Painel:** preço e vagas dos lotes editáveis, com vendidos e vagas restantes.
- **Correção de navegação:** `/loja` dentro do shell do AVA, `/login` que reconhece sessão ativa e retorno ao destino depois do login.

## Tabela comercial

### Módulos avulsos

| Ordem | Módulo | Preço | `priceCents` |
|---|---|---|---|
| 01 | Fundamentos do RH Estratégico | R$ 197,00 | 19700 |
| 02 | Diagnóstico Organizacional | R$ 197,00 | 19700 |
| 03 | Recrutamento e Seleção | R$ 297,00 | 29700 |
| 04 | Onboarding e Integração | R$ 197,00 | 19700 |
| 05 | Desenvolvimento e Trilhas de Aprendizado | R$ 197,00 | 19700 |
| 06 | Gestão de Desempenho | R$ 197,00 | 19700 |
| 07 | Clima e Cultura | R$ 197,00 | 19700 |
| 08 | Cargos, Salários e Reconhecimento | R$ 197,00 | 19700 |
| 09 | Relações Trabalhistas e Compliance | R$ 197,00 | 19700 |
| 10 | Comunicação Interna | R$ 197,00 | 19700 |
| 11 | Indicadores e People Analytics | R$ 247,00 | 24700 |
| 12 | Plano de Ação Final | R$ 247,00 | 24700 |
| | **Soma** | **R$ 2.564,00** | **256400** |

- O casamento com o banco é pela **ordem** do módulo no curso `imersao-rh`, e não pelo título. A tabela recebida chama o módulo 05 de "Desenvolvimento e Trilhas"; o banco e a grade publicada (`courses.mock.ts`) usam "Desenvolvimento e Trilhas de Aprendizado", e o título não muda nesta spec.
- A soma bate com o "Valor dos módulos separadamente: R$ 2.564,00" da oferta, e é **calculada**, não escrita (decisão 4).

### Lotes do Pacote de Lançamento

| Ordem | Lote | Preço | `priceCents` | Vagas |
|---|---|---|---|---|
| 1 | 🔥 Lote Fundador | R$ 590,00 | 59000 | 20 |
| 2 | 🚀 2º Lote | R$ 797,00 | 79700 | 30 |
| 3 | ⭐ 3º Lote | R$ 997,00 | 99700 | 50 |
| 4 | 💎 Preço oficial | R$ 1.497,00 | 149700 | sem limite |

Os emojis são da copy de marketing e ficam no front. O banco guarda o nome sem eles (`Lote Fundador`, `2º Lote`, `3º Lote`, `Preço oficial`), porque o nome também vai para o snapshot do pedido, para o recibo e para o painel de finanças.

### Oferta

- **Nome:** Pacote de Lançamento — Imersão RH Estratégico
- **Chamada:** Estruture o RH da sua empresa — Do Zero ao Estratégico
- **Linha de apoio:** 12 módulos | Método RH 360° | Materiais práticos | Templates | Plano de Ação
- **Âncora:** Valor dos módulos separadamente: R$ 2.564,00 (riscado)
- **Preço:** o do lote vigente, com o nome do lote em selo
- **Parcelamento:** "em até 12x no cartão" (decisão 9)
- **Você recebe:**
  - 12 módulos completos
  - Videoaulas objetivas de 5–8 minutos
  - 12 apostilas práticas
  - Exercícios de aplicação
  - Estudos de caso
  - Templates e ferramentas de RH
  - Checklists
  - Prompts de Inteligência Artificial
  - Método RH 360°
  - Plano de Ação Final
  - Certificado de conclusão

## Decisões técnicas desta spec

1. **Os preços reais entram por migration, e o seed passa a conhecê-los só na criação.**
   A Spec 014 (decisão 1) gravou os R$ 199,00 na própria migration, e este é o mesmo caminho: uma migration de dados atualiza `priceCents` dos 12 módulos do curso `imersao-rh`, casando pela ordem. Ela roda uma vez por ambiente (local, preview, produção) e fica no histórico do Prisma.
   - **Por que não só o seed.** O `db:seed` é idempotente e roda de novo sempre que alguém precisa. Se ele escrevesse `priceCents` no `update` do upsert, cada execução desfaria o reajuste feito no painel — o mesmo motivo pelo qual ele já não sobrescreve o título da aula 1. O seed ganha o preço apenas no `create`: banco novo nasce com a tabela real, e banco existente não é tocado.
   - **A migration só troca o que ainda é provisório.** O `UPDATE` tem `WHERE price_cents = 19900 OR price_cents IS NULL`. Um módulo que o administrador já reajustou no painel fica com o valor dele, e a migration registra quantas linhas mudou.

2. **O pacote é uma entidade própria, e não um módulo a mais.**
   Seriam dois atalhos possíveis, e os dois quebram algo:
   - **Um "módulo 13" com preço de pacote** apareceria na trilha, contaria na conclusão do curso e pediria aula e vídeo.
   - **Um desconto automático ao marcar os 12 módulos** não tem lote, não tem vaga e não tem nome no recibo.

   Entram três tabelas:
   ```
   Bundle         id, slug (único), title, courseId, active, createdAt, updatedAt
   BundleModule   bundleId, moduleId           @@id([bundleId, moduleId])
   BundleTier     id, bundleId, order, name, priceCents, capacity?,
                  createdAt, updatedAt         @@unique([bundleId, order])
   ```
   - O pacote lista os módulos explicitamente em `BundleModule`, e não "todos os módulos do curso". Um módulo 13 criado no painel não entra no pacote de quem já comprou nem muda o que o pacote promete, a não ser que alguém o inclua.
   - `active = false` tira o pacote da loja e do `/planos` sem apagar histórico.
   - `capacity` nulo é "sem limite", e só o último lote (Preço oficial) pode tê-lo nulo (decisão 3).
   - Slug do pacote semeado: `imersao-rh-lancamento`.

3. **O lote vigente é derivado das vendas, nunca gravado.**
   Não existe coluna "lote atual". O lote vigente é o primeiro, na ordem, cujas vagas ocupadas ainda não chegaram à capacidade. Guardar o lote atual numa coluna criaria o estado impossível de uma coluna dizendo "Fundador" com 25 vendas no Fundador — e alguém precisaria virar a chave. Derivado, o lote vira no instante em que a última vaga é ocupada.
   - **O que ocupa uma vaga:** pedido do lote em `PENDING` ainda dentro do prazo, `PAID` ou `REFUNDED`.
   - **Pendente reserva.** Um PIX aberto segura a vaga por até 30 minutos (Spec 014, decisão 10). Sem a reserva, 25 pessoas poderiam gerar QR do Fundador ao mesmo tempo e todas pagarem R$ 590. Expirado, cancelado ou recusado, o pedido libera a vaga.
   - **Estornado não devolve a vaga.** O lote que virou não volta. Um "restam 3 vagas" que vira "restam 4" depois de um estorno desmente a escassez que a página anunciou.
   - **Configuração inválida é recusada no painel:** lote com `capacity` nulo que não seja o último, capacidade menor que as vagas já ocupadas, ou preço nulo.

4. **A âncora "valor dos módulos separadamente" é a soma dos preços do banco.**
   `GET` do pacote devolve `modulesTotalCents`, a soma de `priceCents` dos módulos do pacote. Escrever R$ 2.564,00 na página faria a âncora mentir no primeiro reajuste de um módulo avulso. Se algum módulo do pacote estiver sem preço, a âncora não é exibida — não se soma "a definir".

5. **O preço do pacote é decidido no servidor, dentro de uma transação que trava o pacote.**
   `POST /orders` passa a aceitar **ou** `moduleIds` **ou** `bundleSlug`, nunca os dois (o DTO recusa os dois juntos e nenhum). Com o pacote:
   - O servidor abre uma transação, trava a linha do `Bundle` (`SELECT … FOR UPDATE`), conta as vagas ocupadas, escolhe o lote vigente e grava o pedido já com o lote.
   - A trava existe para a última vaga. Sem ela, dois pedidos simultâneos leriam "falta 1" e os dois entrariam no Fundador. Ela vale só para pedidos do mesmo pacote e só pelo tempo de uma contagem e um `INSERT`.
   - O cliente não envia lote nem preço, pela mesma regra da Spec 014 (decisão 2). O front mostra o lote que a API disse, e o pedido é cobrado pelo lote que a API decidir na hora. Se virou entre a tela e o clique, o resumo do pagamento mostra o preço novo antes de cobrar (decisão 12).
   - O pedido pendente anterior do aluno continua sendo cancelado ao criar outro (Spec 014, decisão 11), e isso libera a vaga que ele segurava.

6. **Pedido de pacote grava o pacote, o lote e um item por módulo, com o preço rateado.**
   `Order` ganha `bundleId?`, `bundleTierId?` e os snapshots `bundleTitleSnapshot?` e `tierNameSnapshot?`, pela mesma razão do snapshot do item (Spec 014, decisão 6): o recibo diz "Lote Fundador" mesmo depois de o lote ser renomeado.
   - **Um `OrderItem` por módulo, e não um item "pacote".** A concessão de acesso, a revogação por estorno (`ModuleAccess.orderId`) e a lista de módulos no painel de finanças já funcionam por item de módulo. Um item único de pacote exigiria reescrever as três.
   - **O preço é rateado pelo peso de cada módulo.** Cada item recebe `priceCents` proporcional ao preço avulso do módulo, e a sobra de centavos do arredondamento vai para o último item. A soma dos itens é **sempre** igual ao `amountCents` do pedido — e é isso que o teste verifica. No Fundador, o módulo 03 (R$ 297) fica com R$ 68,34, e o módulo 01 (R$ 197) com R$ 45,33.
   - Rateio igual (R$ 590 / 12) seria mais simples e deixaria o módulo de R$ 297 valendo o mesmo que o de R$ 197 dentro do pacote. Para receita por módulo, que é a próxima pergunta natural do painel de finanças, o peso é o número que faz sentido.

7. **O pacote libera 6 meses em cada um dos 12 módulos, e a recompra estende.**
   A aprovação do pedido de pacote concede `ModuleAccess` de 6 meses em cada módulo do pacote, com o mesmo upsert da Spec 014 (decisão 5): módulo ainda ativo soma 6 meses ao que resta, módulo vencido abre período novo. O estorno revoga o que aquele pedido liberou, pelo `orderId`, sem mudança.

8. **Quem já tem módulos avulsos paga o pacote pelo preço do lote, sem abatimento.**
   O pacote custa o mesmo para todos. Os módulos que o aluno já tem ativos ganham os 6 meses somados, como em qualquer recompra. Abater o que já foi pago exigiria preço por aluno, rateio de pedido anterior e uma regra de estorno cruzado no financeiro — tudo isso fica em "Fora de escopo".

9. **O parcelamento sobe para 12x, com juros do comprador, para módulos e pacote.**
   `MAX_INSTALLMENTS` passa de 6 para 12 no DTO, e o `maxInstallments` do `GET /store/payment-config` acompanha. A regra continua sendo da plataforma e validada no servidor (Spec 014, decisão 9); o front continua exibindo **só** o que o Mercado Pago devolve em `getInstallments`.
   - **A copy não promete "12x de R$ 49,17".** R$ 49,17 é 590 / 12, sem juros, e o juro é do comprador: a parcela real é maior. A página diz "em até 12x no cartão", e o valor da parcela aparece no checkout, vindo do Mercado Pago.
   - O Mercado Pago tem parcela mínima, então um módulo avulso de R$ 197 pode não chegar a 12x. É comportamento do gateway, e a lista de parcelas mostra o que ele permitir.
   - O valor líquido não muda: o juro é do comprador, e a taxa do vendedor é a mesma em 1x ou 12x (Spec 016, `GatewayFeeRate`). O painel de finanças não precisa de ajuste.

10. **Os preços chegam à vitrine por uma rota pública, lida no navegador.**
    O `/planos` é público e prerenderizado, e o `GET /store/catalog` exige login. Entra `GET /store/offer`, **pública**, que devolve os módulos avulsos (ordem, título, preço) e o pacote ativo (lote vigente, vagas restantes, preço do próximo lote, `modulesTotalCents` e a lista de módulos). Só leitura, sem dado de aluno.
    - **Lida no navegador, e não no build.** O lote vira com a venda. Um preço gravado no HTML do prerender seria o preço do dia do deploy, e mostraria "Lote Fundador" depois de o Fundador esgotar. No HTML do build, a área de preço sai com um esqueleto do mesmo tamanho, sem salto de layout quando o número chega.
    - **Cache curto.** A resposta sai com `Cache-Control: public, max-age=30`. Trinta segundos de atraso na contagem de vagas não vende uma vaga a mais, porque quem decide o lote é o `POST /orders` (decisão 5).
    - **Falha da rota não esconde a oferta.** Sem resposta da API, o card do pacote continua com a lista do que o aluno recebe e o CTA, e a área de preço mostra "Consulte o valor na loja".
    - **Sem `Offer` no JSON-LD.** A Spec 009 tirou o `offers` do `Course` porque o preço não era confirmado. Agora é, mas muda com o lote, e um `Offer` prerenderizado ficaria defasado pela mesma razão do HTML. Continua fora.

11. **O `/planos` passa a vender o que existe.**
    Os cinco cards de `PLANS` eram protótipo da Spec 006: Mini Curso, Curso Individual, Trilhas e Formação Completa não são produtos cadastrados, e todos têm preço `[PREÇO]`.
    - **Sai:** os quatro planos sem produto por trás, a lista comparável `PLAN_BENEFITS` e o aviso "Trilhas aqui é o pacote comercial".
    - **Entra, nesta ordem:**
      1. **Pacote de Lançamento em destaque**, com a oferta da tabela acima, o lote vigente em selo, o preço, a âncora riscada, "em até 12x no cartão" e a escassez pelo `ui-scarcity-banner` ("Restam 7 vagas no Lote Fundador — depois, R$ 797"). A escassez só aparece em lote com `capacity`; no Preço oficial ela some.
      2. **Módulos avulsos:** uma lista dos 12 módulos com título e preço, para quem quer comprar só um tema.
      3. **Empresas:** o card atual, "Sob consulta", com o WhatsApp.
    - **CTA:** "Garantir minha vaga" no pacote e "Comprar este módulo" em cada avulso. Os dois levam à loja com a seleção pronta (`/loja?pacote=imersao-rh-lancamento` ou `/loja?modulo=<ordem>`). A seleção pela ordem, e não pelo id, mantém a URL legível e estável entre ambientes.
    - O componente `ui-plan-card` e o `plans.mock.ts` são reduzidos ao que o card Empresas e os metadados da página usam, e o que sobrar sem uso sai.

12. **Na loja, o pacote vem primeiro e é uma escolha exclusiva.**
    O `/loja` ganha o card do pacote no topo, com o lote vigente, as vagas e a âncora. Marcar o pacote desmarca os módulos avulsos, e marcar um avulso desmarca o pacote: o pedido é um ou outro (decisão 5).
    - **Aviso de economia.** Com três ou mais módulos avulsos marcados e a soma acima do preço do lote vigente, o resumo mostra "O pacote com os 12 módulos sai por R$ 590 no Lote Fundador" com um botão para trocar. Com o Fundador, isso acontece já no terceiro módulo (3 × R$ 197 = R$ 591).
    - **Seleção pela URL.** `?pacote=<slug>` e `?modulo=<ordem>` pré-marcam o item ao abrir, e o parâmetro é removido da URL depois de aplicado, para o voltar do navegador não remarcar.
    - **Lote que virou entre a tela e o pagamento.** O `POST /orders` devolve o lote e o valor que cobrou. Se diferirem do que a loja exibia, a tela de pagamento mostra o valor novo e pede confirmação antes de gerar o PIX ou cobrar o cartão.
    - O `StoreService` passa de "conjunto de módulos marcados" para uma seleção `{ kind: 'modules', ids } | { kind: 'bundle', slug }`, e o `totalCents` vira `computed()` sobre ela.

13. **O painel edita preço e vagas dos lotes, e mostra quanto cada um vendeu.**
    A aba "Gestão de Aulas" já edita o preço de cada módulo (Spec 014, decisão 1). Ela ganha um bloco "Pacote de Lançamento" com os lotes: nome, preço, vagas, vagas ocupadas e qual está vigente.
    - **Editável:** preço e capacidade. Nome e ordem não, porque reordenar lote com venda reescreveria a história do que foi vendido.
    - **Rotas:** `GET /admin/bundles/:slug` e `PATCH /admin/bundles/:slug/tiers/:tierId`, só admin, com as validações da decisão 3.
    - Criar pacote, criar lote e editar a lista de módulos do pacote ficam fora de escopo: o seed cria o pacote desta spec, e o próximo pacote é uma spec própria.

14. **O painel de finanças mostra o pacote e o lote no pedido.**
    A listagem de pedidos da Spec 016 hoje exibe a lista de módulos de cada pedido. Num pedido de pacote, ela passa a mostrar "Pacote de Lançamento · Lote Fundador" no lugar dos 12 títulos. Os totais, as taxas e o líquido não mudam: continuam saindo de `Order.amountCents`.

15. **A loja passa a morar dentro do shell do AVA.**
    **O problema.** `/loja` é uma rota solta, irmã de `/ava`, sem o `StudentLayout`. Quem sai da trilha para comprar (o botão do módulo trancado navega para `/loja`) chega numa página sem sidebar e sem cabeçalho. O único link de saída é "Abrir meu perfil". Para voltar ao painel, o aluno digita `/ava` na barra, ou clica no logo, vai para a landing e cai no caso da decisão 16.

    **A correção.** As rotas da loja passam a ser filhas do mesmo `StudentLayout` do AVA, com o shell completo: sidebar, cabeçalho com nome e avatar, e os links legais no rodapé.
    - A sidebar ganha o item **"Comprar módulos"** (`/loja`), depois de "Artigos". É também o caminho para quem já tem acesso e quer o pacote ou outro módulo, que hoje não existe fora do cadeado da trilha.
    - O `path` continua `/loja` na URL: links antigos, e-mails e o `accessGuard` (que redireciona para `/loja`) não mudam. A mudança é de árvore de rotas, com um pai sem caminho próprio que carrega o layout, e não de endereço.
    - **Cuidado com o `authGuard`.** Ele decide o papel pelo `path` da rota em que está pendurado (`REQUIRED_ROLE`). Se a árvore mudar e o guard passar a ver outro `path`, a rota cai em `homeUrl()`, e o aluno sem acesso entra no laço `/ava` → `/loja` que o comentário do próprio guard descreve. O guard continua no nó cujo `path` é `loja`, e um teste cobre a navegação do aluno sem acesso até a loja.
    - O admin continua podendo abrir `/loja` (Spec 014). Ele vê o shell do aluno, que é o que a tela é.

16. **`/login` reconhece a sessão ativa e manda para a área da pessoa.**
    **O problema.** Todas as páginas públicas (landing, `/planos`, `/cursos/:slug`, páginas legais) têm o botão "Área do Aluno", fixo em `/login`. A tela de login não olha a sessão: um aluno logado que passeou pela vitrine clica em "Área do Aluno" e recebe o formulário de login de novo, mesmo com o cookie de sessão válido.

    **A correção.** Um `guestGuard` no `/login`: com sessão ativa, redireciona para `auth.homeUrl()` (`/ava` para aluno, `/admin` para admin). A sessão já foi restaurada pelo `provideSessionRestore` (Spec 017, decisão 19) antes de o roteamento começar, então o guard lê o `AuthService` sem esperar nada.
    - **Guard no `/login`, e não um link diferente em cada página.** O guard conserta todas as entradas de uma vez: o botão do cabeçalho, o rodapé, o voltar do navegador, o favorito e a URL digitada. Trocar o link do cabeçalho conforme a sessão consertaria só o botão.
    - **O rótulo do botão também muda.** Com sessão ativa, o `ui-nav-header` da vitrine mostra "Ir para o meu painel" em vez de "Área do Aluno", apontando para o mesmo `/login`, que redireciona. O componente recebe o estado por `input()` (`authenticated`), e quem lê o `AuthService` é a página, para o `shared/ui` continuar sem serviço de domínio.
    - **Prerender.** No build não há sessão, então o HTML sai com "Área do Aluno" e o login renderizado. No navegador, o guard e o rótulo corrigem na primeira navegação.

17. **O login devolve a pessoa para onde ela ia.**
    Hoje o `authGuard` manda para `/login` sem guardar o destino, e o login termina sempre em `homeUrl()`. O visitante que clicou em "Garantir minha vaga" no `/planos` (`/loja?pacote=…`), passou pelo login e voltou em `/ava` — ou em `/loja`, via `accessGuard` — perde a seleção que tinha escolhido.
    - O `authGuard` passa a redirecionar para `/login?redirect=<url>`, e o login, depois do sucesso, navega para o `redirect`.
    - **Só caminho interno.** O `redirect` é aceito apenas se começar com `/` e não com `//`, e se não for `/login`. Qualquer outra coisa cai em `homeUrl()`. Sem essa validação, `?redirect=https://site-falso` viraria um redirecionamento aberto com a marca da Delcastanher no meio.
    - **Onboarding primeiro.** Quem ainda não concluiu o onboarding passa por ele antes. O `redirect` é levado adiante e usado ao fim do onboarding, para que o primeiro acesso de quem veio do `/planos` termine na loja com o pacote marcado.
    - O `guestGuard` (decisão 16) também respeita o `redirect`: aluno já logado que abre `/login?redirect=/loja?pacote=…` vai direto para a loja.

## Modelo de dados

```
Module.priceCents   Int?                      // valores reais (decisão 1)

Bundle              id, slug @unique, title, courseId, active,
                    createdAt, updatedAt
BundleModule        bundleId, moduleId        @@id([bundleId, moduleId])
BundleTier          id, bundleId, order, name, priceCents, capacity?,
                    createdAt, updatedAt      @@unique([bundleId, order])

Order               + bundleId?, bundleTierId?,
                      bundleTitleSnapshot?, tierNameSnapshot?
                    @@index([bundleTierId, status])
```

- `BundleModule.module` e `Order.bundleTier` são `onDelete: Restrict`: módulo que está num pacote e lote que já vendeu não são removíveis, pela mesma regra de `OrderItem.module` (Spec 014).
- O índice `(bundleTierId, status)` sustenta a contagem de vagas da decisão 3, feita a cada leitura da oferta e a cada pedido de pacote.

## Rotas novas ou alteradas

| Método | Rota | Quem | Mudança |
|---|---|---|---|
| `GET` | `/store/offer` | **público** | nova — módulos avulsos e pacote ativo com lote vigente (decisão 10) |
| `GET` | `/store/catalog` | aluno | passa a incluir o pacote ativo e o lote vigente |
| `GET` | `/store/payment-config` | aluno | `maxInstallments` = 12 |
| `POST` | `/orders` | aluno | aceita `bundleSlug` ou `moduleIds` (decisão 5) |
| `GET` | `/orders/:id`, `/orders/me` | aluno | devolvem pacote e lote do pedido |
| `GET` | `/admin/bundles/:slug` | admin | nova — lotes com vagas ocupadas e vigente |
| `PATCH` | `/admin/bundles/:slug/tiers/:tierId` | admin | nova — preço e capacidade |
| `GET` | `/admin/finance/orders` | admin | pedidos de pacote com pacote e lote (decisão 14) |

## Rotas do front alteradas

| Rota | Mudança |
|---|---|
| `/login` | `guestGuard`; lê `?redirect=` (decisões 16 e 17) |
| `/loja`, `/loja/pagamento`, `/loja/pedido/:orderId` | dentro do `StudentLayout`; `?pacote=` e `?modulo=` na raiz (decisões 12 e 15) |
| `/onboarding` | repassa `?redirect=` ao concluir (decisão 17) |
| `/planos` | oferta real, lida de `GET /store/offer` (decisão 11) |

## Integração com o existente
- **`api/prisma/`:** migration de schema (`Bundle`, `BundleModule`, `BundleTier`, colunas novas em `Order`); migration de dados com os preços reais (decisão 1), o pacote e os quatro lotes; `seed.ts` com preço no `create` dos módulos e o upsert do pacote e dos lotes por `slug` e `order`, também sem sobrescrever preço e capacidade no `update`.
- **`api/src/payments/`:** `BundlesService` novo (lote vigente, vagas, rateio), consumido por `StoreService`, `OrdersService` e o controller admin. `MercadoPagoService` e o webhook não mudam: a order no gateway continua sendo um valor e uma lista de itens.
- **`api/src/payments/dto/create-order.dto.ts`:** `bundleSlug` opcional, exclusivo com `moduleIds`; `MAX_INSTALLMENTS = 12`.
- **`front/src/app/core/services/store.service.ts`:** seleção como união discriminada (decisão 12) e leitura de `GET /store/offer`.
- **`front/src/app/features/plans/`** e **`core/mocks/plans.mock.ts`:** oferta real (decisão 11).
- **`front/src/app/features/loja/`:** card do pacote, aviso de economia, seleção pela URL e confirmação de valor alterado.
- **`front/src/app/app.routes.ts`:** loja sob o `StudentLayout`; `guestGuard` no `/login`.
- **`front/src/app/core/guards/`:** `guestGuard` novo; `authGuard` com `?redirect=`.
- **`front/src/app/features/student/layout/layout.ts`:** item "Comprar módulos" na sidebar.
- **`front/src/app/shared/ui/nav-header/`:** `input()` `authenticated` para o rótulo do botão.
- **`features/auth/login/`** e **`features/onboarding/`:** consumo do `redirect`.
- **`/admin`:** bloco de lotes na "Gestão de Aulas" e pacote/lote na listagem de finanças.
- `ui-scarcity-banner`, `ui-order-summary`, `JsonLdService` e o fluxo de pagamento do Mercado Pago são reaproveitados.

## Testes

### Backend (TDD)
- **Lote vigente:** sem vendas é o Fundador; com 20 ocupadas é o 2º; pendente vencido não ocupa; `REFUNDED` ocupa; o último lote sem capacidade nunca esgota.
- **Concorrência:** dois pedidos simultâneos pela última vaga do Fundador geram um pedido no Fundador e outro no 2º Lote.
- **Rateio:** a soma dos itens é igual ao `amountCents` em todos os lotes; o módulo de R$ 297 recebe mais que o de R$ 197; a sobra de centavos vai para o último item.
- **`POST /orders`:** recusa `bundleSlug` junto com `moduleIds`, recusa nenhum dos dois, recusa pacote inativo e ignora preço ou lote vindos do corpo.
- **Aprovação:** o pedido de pacote concede 6 meses nos 12 módulos, e o módulo já ativo tem o prazo estendido; o estorno revoga os 12.
- **Parcelas:** 12 é aceito, 13 é recusado.
- **`GET /store/offer`:** responde sem token, não expõe dado de aluno, traz `modulesTotalCents` = 256400 com a tabela desta spec e omite a âncora se algum módulo estiver sem preço.
- **Admin:** recusa capacidade menor que as vagas ocupadas, capacidade nula fora do último lote e acesso sem papel admin.
- **Migration de dados:** atualiza só módulos em 19900 ou nulos, e deixa intocado o módulo com preço reajustado.

### Front
- **`guestGuard`:** aluno logado em `/login` vai para `/ava`, e admin para `/admin`; com `?redirect=/loja`, vai para `/loja`; `redirect` externo (`https://…`, `//…`) é ignorado.
- **`authGuard`:** rota protegida sem sessão vai para `/login?redirect=<url>`.
- **Loja no shell:** `/loja` renderiza a sidebar com "Comprar módulos" ativo; aluno sem acesso chega à loja sem laço de redirecionamento.
- **Loja:** pacote e avulsos são exclusivos; `?pacote=` e `?modulo=` pré-marcam; o aviso de economia aparece com três módulos no Fundador.
- **`/planos`:** esqueleto no lugar do preço até a resposta; lote, preço, âncora e vagas depois dela; sem escassez no Preço oficial; fallback "Consulte o valor na loja" em erro; nenhum `[PREÇO]` na página.
- **`ui-nav-header`:** "Ir para o meu painel" com `authenticated`, "Área do Aluno" sem ele.

### No Chrome
- Aluno com acesso: trilha → módulo trancado → loja com o menu do AVA → volta ao Hub pela sidebar, sem digitar URL.
- Aluno logado: landing → "Ir para o meu painel" → `/ava`, sem formulário de login.
- Visitante: `/planos` → "Garantir minha vaga" → login → loja com o pacote marcado.
- Compra de pacote em sandbox: o pedido sai no Fundador com R$ 590, e a vaga aparece como ocupada na oferta e no painel.

## Desvios registrados na execução

- **Reserva de pendente sem prazo (decisão 3).** Pendente sem `expiresAt` reserva a vaga por no máximo 30 minutos a partir da criação. Um pedido gravado cuja chamada ao Mercado Pago falhou fica pendente e sem prazo; sem o teto, seguraria a vaga do lote para sempre. O estado do pedido não muda.
- **`GET /store/catalog` sem mudança de formato (tabela de rotas).** A loja lê o pacote de `GET /store/offer`. Trocar o array do catálogo por um objeto quebraria o `accessGuard` e a trilha sem ganho.
- **Bloco do pacote no painel (decisão 13)** é um componente próprio (`admin-pacote`), e não mais um bloco dentro do `AdminAulas`.
- **Banco.** Não existe banco separado de desenvolvimento: as migrations desta spec foram aplicadas em produção com `prisma migrate deploy`, com autorização explícita, e o teste de concorrência usa um pacote e usuários temporários, apagados no fim.

## Fora de escopo
- Abatimento no pacote para quem já comprou módulos avulsos (decisão 8).
- Parcelamento sem juros (juros absorvidos pelo vendedor).
- Criar pacote novo, criar lote e editar os módulos de um pacote pelo painel (decisão 13).
- Lote por data de validade, contador regressivo e lote "voltando".
- Cupom de desconto, order bump e upsell.
- `Offer` no JSON-LD de `/planos` e de `/cursos/:slug` (decisão 10).
- Log de auditoria das alterações de preço e de vagas: a mesma ausência registrada na Spec 013 (decisão 14) e na Spec 014.
- Receita por módulo no painel de finanças. O rateio da decisão 6 deixa o dado pronto, mas a tela é spec própria.
- Mudança de título dos módulos para casar com a tabela comercial.
