# Spec 027: Preço Único do Pacote

**Projeto:** Plataforma E-learning "Imersão RH Estratégico"
**Baseada em:** Spec 019 (Preços, Pacote e Lotes), Spec 014 (Checkout) e Spec 016 (Painel de Finanças)
**Escopo técnico:** full-stack — `api/` (NestJS + Prisma) e `front/` (Angular standalone + signals + Tailwind), com uma migration de dados. O backend é escrito com TDD: a suíte vem antes da implementação (`.claude/RULES.md`).

## Objetivo
A promoção de lançamento acabou. O pacote com os 12 módulos deixa de ser vendido em lotes — Lote Fundador, 2º Lote, 3º Lote e Preço oficial, com vagas que viram sozinhas — e passa a ter **um preço só: R$ 989,00**, sem vagas e sem escassez.

Saem da vitrine o selo do lote com emoji, a faixa "Restam X vagas no 🔥 Lote Fundador — depois, R$ 797" e o nome "Pacote de Lançamento". O pacote continua sendo um item da loja, com os mesmos 12 módulos, o mesmo acesso de 6 meses e o mesmo parcelamento.

## Situação em produção (lida em 20/10/2026, só leitura)

| Lote | `order` | Preço | Vagas | Pedidos |
|---|---|---|---|---|
| Lote Fundador | 1 | R$ 590,00 | 20 | **3 `PAID`**, 5 `CANCELLED` |
| 2º Lote | 2 | R$ 797,00 | 30 | nenhum |
| 3º Lote | 3 | R$ 997,00 | 50 | nenhum |
| Preço oficial | 4 | R$ 1.497,00 | sem limite | nenhum |

- Pacote `imersao-rh-lancamento`, título "Pacote de Lançamento — Imersão RH Estratégico", ativo, com os 12 módulos.
- Módulos avulsos com os preços da Spec 019 (soma R$ 2.564,00). Não mudam.

## Escopo

- **Encerrar os lotes:** o Fundador fecha com as vagas que já vendeu; 2º e 3º lote, que nunca venderam, saem do banco.
- **Preço único:** o último lote passa a se chamar "Preço único", custa R$ 989,00 e fica sem limite de vagas.
- **Novo nome da oferta:** "Imersão RH Estratégico — Pacote completo". O slug `imersao-rh-lancamento` não muda.
- **Seed** que não recria lotes.
- **Painel:** só o preço do pacote é editável. O Fundador aparece como histórico, sem edição.
- **Vitrine e loja** sem lote, sem emoji, sem vagas e sem "depois, R$ …".

## Fora de escopo

- **Tirar o conceito de lote do código e do schema.** Os pedidos do Fundador guardam `bundleTierId` e `tierNameSnapshot`, que são lidos pelo recibo, pela tela do pedido e pelo financeiro. A engrenagem de lote fica, com um lote vigente só (decisão 1).
- **Trocar o slug** `imersao-rh-lancamento`. Ele está em links já publicados (`/loja?pacote=…`), no `LAUNCH_BUNDLE_COPY` e no seed.
- **Mudar o preço dos módulos avulsos, o parcelamento (12x) ou o acesso de 6 meses.**
- **Comunicar a mudança aos 3 compradores do Fundador.** Nada muda para eles: o pedido, o acesso e o recibo continuam como estão.

## Decisões técnicas desta spec

1. **Os lotes são encerrados nos dados. A regra de lote vigente continua no código.**
   O `pickTier` da Spec 019 (decisão 3) escolhe o primeiro lote com vaga. Com um único lote aberto e sem limite, ele sempre devolve esse lote: `remaining` vem nulo e `nextTier` vem nulo. O resto da cadeia — pedido, rateio, recibo, financeiro e estorno — continua igual.
   - **Por que não apagar a coluna de lote.** O pedido grava `bundleTierId`, e o recibo diz "Lote Fundador" pelo `tierNameSnapshot`. Tirar o lote do schema seria migrar esses pedidos e reescrever o `BundlesService`, o `OrdersService`, o financeiro e o painel por uma mudança que os dados resolvem.
   - **Voltar a ter lotes** no futuro seria uma spec própria: o painel desta spec não cria nem reabre lote (decisão 4).

2. **A migration fecha o Fundador pela venda definitiva, apaga os lotes vazios e põe o preço único no último.**
   Uma migration de dados (`<timestamp>_preco_unico_do_pacote`), idempotente, filtrada pelo slug do pacote:
   - **Fundador e qualquer lote que não seja o último com pedido:** `capacity` = número de pedidos `PAID` ou `REFUNDED` do lote. Hoje são 3.
   - **Pendente não entra na conta.** Se um PIX do Fundador estiver no prazo durante a migration e vencer depois, a capacidade calculada com ele deixaria uma vaga sobrando, e o Fundador reabriria a R$ 590. Pago e estornado nunca devolvem vaga (Spec 019, decisão 3), então a capacidade fica fechada para sempre. Se esse pendente for pago, ele é honrado a R$ 590, e o lote fica com mais vendas que vagas — o `pickTier` o pula do mesmo jeito.
   - **Lotes que não são o último e não têm pedido nenhum** (2º e 3º lote): `DELETE`. Eles nunca existiram para um comprador, e mantê-los com zero vagas só poluiria o painel. Lote com pedido, mesmo cancelado, não é apagado: o `onDelete: Restrict` do `Order.bundleTier` recusaria, e ele é histórico.
   - **Último lote** (`order` máximo): `name = 'Preço único'`, `priceCents = 98900`, `capacity = NULL`.
   - **Pacote:** `title = 'Imersão RH Estratégico — Pacote completo'`.
   - A migration registra com `RAISE NOTICE` quantos lotes fechou, quantos apagou e o preço gravado, como a da Spec 019.

3. **O seed não cria lote em pacote que já tem lote.**
   Hoje o seed faz `upsert` dos 4 lotes por `(bundleId, order)`. Depois da decisão 2, rodar o `db:seed` recriaria o 2º e o 3º lote **com vagas**, e o pacote voltaria a ser vendido a R$ 797.
   - O seed passa a conhecer **um** lote, `{ order: 1, name: 'Preço único', priceCents: 98900, capacity: null }`, e só o cria quando o pacote não tem lote nenhum (banco novo).
   - Banco existente não é tocado, pela mesma regra da Spec 019 (decisão 1): preço é do painel depois de criado.
   - O título do pacote no seed passa a ser o novo, e vale só na criação (o `update` continua vazio).

4. **O painel edita só o preço do lote vigente. Lote encerrado é histórico.**
   A tela de lotes da Spec 019 (decisão 13) edita preço e vagas de qualquer lote. Agora:
   - **`PATCH /admin/bundles/:slug/tiers/:tierId` só aceita o último lote.** Em outro lote, 400 "Este lote foi encerrado e não pode ser editado." Sem isso, subir as vagas do Fundador o reabriria a R$ 590.
   - **O DTO perde `capacity`.** Com o `forbidNonWhitelisted` do `main.ts`, mandar `capacity` passa a ser 400. Uma capacidade no último lote recriaria a escassez e, esgotada, deixaria o pacote sem lote e fora da loja.
   - **Na tela:** o bloco passa a se chamar "Pacote completo" e mostra o preço único com o botão "Editar preço". Abaixo, "Lotes encerrados", em tabela só de leitura com nome, preço e vendidos ("Lote Fundador · R$ 590,00 · 3 vendidos"). Sai o texto que explica a virada de lote e sai a coluna "Vagas".
   - O `GET` do painel não muda de formato. Na tela, editável é o **último lote na ordem**, o mesmo critério do servidor. O `current` não serve para isso: antes da migration, o vigente ainda é o Fundador.

5. **A rota pública `GET /store/offer` não muda.**
   Ela continua devolvendo `tier` (com `remaining: null`) e `nextTier` (nulo). Mudar o formato obrigaria a ajustar testes e tipos dos dois lados sem mudar nada do que a página mostra, e o front deixa de ler `remaining` e `nextTier` (decisão 6).

6. **A vitrine e a loja vendem o pacote sem lote.**
   - **`ui-bundle-price`:** sai o selo do lote. Ficam a âncora "Valor dos módulos separadamente: ~~R$ 2.564,00~~", o preço e "ou em até 12x no cartão". A âncora continua porque não é promoção: é a soma real dos preços avulsos (Spec 019, decisão 4).
   - **`/planos`:** sai a faixa de escassez e o esqueleto que reservava o lugar dela. O CTA "Garantir minha vaga" vira "Quero o pacote completo", porque já não há vaga a garantir. A meta description perde "Veja o lote vigente".
   - **Página do curso (`/cursos/:slug`):** sai a faixa de escassez, e "Pacote de Lançamento: os 12 módulos…" vira "Pacote completo: os 12 módulos…".
   - **Loja:** sai "Restam N vagas neste lote — depois, R$ …". No resumo, "🔥 Lote Fundador · 12 módulos" vira "12 módulos". A oferta de troca (Spec 019, decisão 12) continua — três ou mais avulsos com soma acima do pacote —, sem o "no {lote}" no texto. Com R$ 989 ela aparece a partir do quinto módulo de R$ 197.
   - **Pagamento:** o aviso de preço que mudou entre a loja e o pagamento continua, porque o admin pode mudar o preço no painel. O texto deixa de falar em vagas e lote: "O preço do pacote mudou enquanto você escolhia. Agora ele sai por R$ X (antes, R$ Y). Confira o valor e clique de novo para continuar."
   - **`LAUNCH_BUNDLE_COPY`:** `overline` = "Pacote completo — Imersão RH Estratégico". O nome da constante fica; renomeá-la só mexe em imports.
   - **Código que fica sem uso sai:** `tierLabel` com o `TIER_EMOJI`, `bundleScarcity` e o componente `ui-scarcity-banner`, que só o `/planos` e a página do curso usavam. O `placeholders.seats` também sai se ficar sem uso.

7. **Recibo, tela do pedido, e-mail de compra e financeiro não mudam de código.**
   Eles mostram `{título} · {lote}` dos snapshots do pedido. Os 3 pedidos do Fundador continuam dizendo "Pacote de Lançamento — Imersão RH Estratégico · Lote Fundador". Um pedido novo diz "Imersão RH Estratégico — Pacote completo · Preço único".

8. **A migration roda em produção só com autorização, e antes do deploy do front.**
   O banco é um só e é o de produção (memória `banco-unico-producao`), e há venda real. Ordem:
   1. merge na `main` (a API e o front publicam sozinhos pela Vercel);
   2. `prisma migrate deploy`, **com aprovação explícita** do usuário na hora.

   Entre o deploy e a migration, o site mostra o lote vigente antigo: com o Fundador ainda com vaga, R$ 590. Por isso a migration roda logo depois do merge, e a conferência vem em seguida (task 4.3).
   - Front publicado com banco ainda antigo mostra o preço do Fundador, sem selo e sem escassez. Banco migrado com front antigo mostra "💎 Preço único" a R$ 989, sem faixa (o `remaining` é nulo). As duas janelas são aceitáveis e curtas.

## Critérios de aceite

- `GET /store/offer` devolve o pacote com `tier.priceCents = 98900`, `tier.name = 'Preço único'`, `remaining = null` e `nextTier = null`.
- Um pedido de pacote novo sai a R$ 989,00, com itens rateados pelo peso que somam 98900.
- `/planos`, a página do curso e a loja não mostram lote, emoji, vagas nem "depois, R$ …".
- O painel mostra o preço único editável e o Lote Fundador como encerrado, com 3 vendidos.
- `PATCH` em lote encerrado, ou com `capacity`, devolve 400.
- `npm run db:seed` num banco já migrado não cria lote.
- Os 3 pedidos do Fundador continuam com o mesmo recibo, acesso e valor no financeiro.
