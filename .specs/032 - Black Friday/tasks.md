# Tasks: Spec 032 - Black Friday

Spec full-stack: `api/` (NestJS + Prisma + Jest), com uma migration de schema, e `front/` (Angular standalone + signals + Tailwind, com SSR). No backend a suíte vem **antes** da implementação, conforme `.claude/RULES.md`. As decisões referenciadas estão no `context.md`.

Prazo: merge em produção até **23/11/2026**, para a campanha da Black Friday (27/11) ser cadastrada e testada com folga.

Ordem das fases:
1. Respostas pendentes do usuário e da contadora.
2. A API: campanha, desconto no pedido e financeiro.
3. O painel do Financeiro.
4. A vitrine: preço riscado na loja, no `/planos` e no pagamento.
5. Os cards animados com contagem regressiva.
6. A seção da mentora.
7. Preview, PR e produção.

## Fase 0: Definições
- [x] **Task 0.1:** **Usuário:** confirmar se o desconto vale para o pacote **e** para os módulos avulsos, ou só para o pacote (decisão 3). **Resposta em 15/11/2026:** vale para todos.
- [x] **Task 0.2:** **Usuário:** definir se a NFS-e de uma venda com desconto sai só com o valor cobrado ou com "desconto incondicional" (decisão 11). **Resposta em 15/11/2026:** valor cobrado.
- [x] **Task 0.3:** **Usuário:** definir os textos da mentora. **Feito em 15/11/2026:** print em `libs/`, transcrito na seção "Textos da mentora" do `context.md`.

## Fase 1: API - Campanha e desconto
- [x] **Task 1.1:** Migration `<timestamp>_campanha_de_desconto`: modelo `Promotion` (decisão 1) e, em `Order`, `promotionId` (FK `Restrict`), `promotionNameSnapshot`, `discountPercentSnapshot` e `listAmountCents`, todos nulos (decisão 5). Índice em `Promotion(startsAt, endsAt)`. Rodar primeiro na branch `preview` do Neon.
- [x] **Task 1.2:** Spec de `promotion.ts` (funções puras): `applyDiscount` (arredondamento, 1% e 90%, R$ 989,00 com 30% = 69230), `isRunning(promotion, now)` (antes do início, no início exato, no fim exato, depois do fim, encerrada antes da hora) e `overlaps`. Implementar.
- [x] **Task 1.3:** Spec do `PromotionsService`: `current(now)`; criar (valida 1–90, fim depois do início, início não no passado, 409 na sobreposição); editar (futura: tudo; vigente: só `endsAt` e `name`, 409 ao mudar `percentOff`/`startsAt`; encerrada: 409); apagar (só futura); encerrar agora (`endedEarlyAt`). Implementar.
- [x] **Task 1.4:** Controller do admin `admin/promotions` (listar com totais, criar, editar, apagar, encerrar, `preview?percentOff=`), protegido como os outros do financeiro. Spec HTTP.
- [x] **Task 1.5:** Spec da oferta pública: `GET /store/offer` e o catálogo devolvem `priceCents` com desconto, `listPriceCents`, e `promotion: { name, percentOff, endsAt, serverNow } | null` (decisões 4 e 7). Fora da campanha, `listPriceCents = priceCents` e `promotion = null`. Implementar no `StoreService` e no `BundlesService.offer`.
- [x] **Task 1.6:** Spec do pedido no `OrdersService`/`BundlesService.placeOrder`: pacote e avulsos com desconto, rateio sobre o valor com desconto (soma dos itens = `amountCents`), snapshots gravados; fora da campanha, colunas nulas; pagamento de teste nunca recebe desconto. Implementar.
- [x] **Task 1.7:** Spec do `expectedAmountCents` (decisão 6): igual → segue; diferente → 409 "O preço mudou. Confira o novo valor antes de pagar." sem chamar o Mercado Pago; ausente → segue (compatível com o front antigo durante o deploy). Implementar no DTO e no `OrdersService`.
- [x] **Task 1.8:** Spec do financeiro (`AdminFinanceService`): "Descontos concedidos" no resumo do período (soma de `listAmountCents - amountCents` dos pagos) e `promotion` em cada pedido da lista. Estornado sai da conta, como na receita. Implementar.
- [x] **Task 1.9:** Recibo e e-mail (decisão 12): a view do pedido devolve `listAmountCents` e a campanha; o e-mail "Compra confirmada" mostra o valor cheio riscado. Ajustar as specs do `purchase-email`.
- [x] **Task 1.10:** NFS-e: spec garantindo que a nota de um pedido com desconto sai com o valor cobrado, sem desconto incondicional (decisão 11). O `nfse-builder` não muda.
- [x] **Task 1.11:** Rodar `npm test` e `npm run build` da API.

## Fase 2: Front - Painel do Financeiro
- [x] **Task 2.1:** `PromotionsService` no front (`core/services`), com os tipos da Fase 1. `formatPrice` reaproveitado.
- [x] **Task 2.2:** Componente `campanha-desconto.ts` em `features/admin/financeiro/` (decisão 10): estados sem campanha, agendada, no ar e histórico; formulário reativo com validações; prévia vinda da API; "Encerrar agora" com confirmação dentro do card. Datas em `America/Sao_Paulo`. Spec do componente.
- [x] **Task 2.3:** Encaixar o card no `admin-financeiro.html`, abaixo do `<app-pagamento-teste>`. No resumo do período, a linha "Descontos concedidos"; na lista de pedidos, o selo da campanha. Ajustar a spec do financeiro.

## Fase 3: Front - Preço riscado
- [x] **Task 3.1:** Componente `ui-sale-price` em `shared/ui/` (decisão 8): `~~de~~` + preço novo + selo "−30%" + "Oferta válida até 27/11 às 23h59", com texto para leitor de tela. Sem campanha, mostra só o preço. Spec.
- [x] **Task 3.2:** `ui-bundle-price`: em campanha, troca a âncora "Valor dos módulos separadamente" pelo preço cheio riscado (decisão 8). Spec.
- [x] **Task 3.3:** Loja (`loja.ts`), `/planos` (`plans.html`) e página do curso: usar o `ui-sale-price` nos módulos e no pacote; resumo do carrinho com o total cheio riscado e o total com desconto.
- [x] **Task 3.4:** Pagamento (`pagamento.ts`): enviar `expectedAmountCents`; no 409, recarregar a oferta e mostrar "O preço mudou" com o valor novo, sem perder o que o comprador preencheu. Spec.
- [x] **Task 3.5:** Pedido (`pedido.ts`): valor cheio riscado e "Black Friday −30%" quando o pedido tem campanha.
- [x] **Task 3.6:** Quando a contagem chega a zero na loja, recarregar a oferta (decisão 7). Spec com relógio falso.

## Fase 4: Front - Cards com contagem regressiva
- [x] **Task 4.1:** Desenho do card com a skill `frontend-design`, na identidade da landing (glass card, gradiente da marca, cor de urgência na última hora).
- [x] **Task 4.2:** Signal de contagem regressiva (`countdown(endsAt, serverNow)`), só no navegador, com intervalo limpo no `DestroyRef`. Spec com relógio falso: dias/horas/minutos/segundos, defasagem do relógio do aparelho, chegada ao zero.
- [x] **Task 4.3:** `ui-promo-card` (decisão 9): variante flutuante (entrada com salto, fechar, `sessionStorage` com try/catch, `prefers-reduced-motion`) e variante em linha. SSR: no servidor, só o card em linha com a data, sem contagem. Spec.
- [x] **Task 4.4:** Encaixar o card flutuante na landing, no `/planos` e na loja (não no pagamento nem no pedido), e o card em linha no preço do `/planos` e no topo da loja.
- [ ] **Task 4.5:** Conferir no navegador, com uma campanha de teste no preview: desktop e celular (360 px), sem cobrir CTA, sem rolagem horizontal, sem erro de hidratação no console.

## Fase 5: Front - Quem será sua Mentora
- [x] **Task 5.1:** Aplicar na seção `#mentora` os textos da seção "Textos da mentora" do `context.md`: os 4 parágrafos no `landing.html`, com os negritos e o itálico; os 4 cards novos em `stats` (`landing.ts`), com `kind: 'number' | 'text'` e `label` opcional; a grade em 2×2 também no desktop. Ajustar `landing.spec.ts` e `landing.presentation.spec.ts`. Conferir no navegador em 360 px e no desktop, comparando com o print de `libs/`.
- [x] **Task 5.2:** Rodar `ng test` e `ng build` do front.

## Fase 6: Preview e produção
- [ ] **Task 6.1:** Merge das branches de fase na `release/032-black-friday` e push para a branch `preview` (Spec 029). A migration roda na branch `preview` do Neon.
- [ ] **Task 6.2:** No painel do preview, criar uma campanha de teste que começa em 5 minutos e dura 30. Conferir: antes, preço normal; no início, preço riscado e cards, sem deploy; ao clicar em "Encerrar agora", tudo volta.
- [ ] **Task 6.3:** **Usuário:** compra de teste no preview (cartão `APRO`, sandbox) durante a campanha de teste. Conferir no Neon `preview` o `amountCents` com desconto, os snapshots e a soma dos itens; e no Financeiro, o selo e os descontos concedidos. A emissão de nota fica desligada no preview (Spec 031).
- [ ] **Task 6.4:** Testar o 409 do `expectedAmountCents`: abrir o pagamento, encerrar a campanha pelo painel e clicar em pagar.
- [ ] **Task 6.5:** Apagar a campanha de teste do preview (ou deixá-la encerrada) e abrir o PR da release contra a `main`, com as decisões no topo. **Sem merge**: o merge é do usuário.
- [ ] **Task 6.6:** **Usuário:** depois do merge, cadastrar a campanha real da Black Friday no Financeiro de produção e conferir na loja, antes do início, que nada mudou ainda.

## Registro da execução

### Fase 1 (API), 15/11/2026, branch `feat/032-api-campanha`

- **1.1:** migration `20261115120000_campanha_de_desconto`. A SQL bate com o `prisma migrate diff` entre o schema da `main` e o novo. Ela ainda não rodou em banco nenhum: roda no Neon `preview` pelo `vercel-build` quando a release subir para o preview (Task 6.1).
- **1.2:** `promotion.ts` com `applyDiscount`, `isRunning`, `effectiveEnd` e `overlaps`. O período é meio-aberto `[início, fim)`: no instante do fim a campanha já acabou, e campanhas encostadas não se cruzam.
- **1.3:** `PromotionsService`. Duas decisões que a spec não fixava:
  - **Início "agora":** o painel trabalha em minutos. Um início até **5 minutos** no passado é gravado como o instante da criação; antes disso, 400.
  - **Corrida entre dois admins:** criar e editar rodam numa transação com `pg_advisory_xact_lock`, para a checagem de sobreposição não deixar passar duas campanhas salvas ao mesmo tempo.
- **1.4 e 1.5 (feitas na ordem 1.5 → 1.4):** a prévia do painel (`GET /admin/promotions/preview?percentOff=`) usa `StoreService.prices`, o mesmo caminho da oferta pública. Assim a conta do painel e a da loja nunca divergem.
  - `GET /store/offer` devolve `promotion: { name, percentOff, endsAt, serverNow }`; `endsAt` já é o fim de fato (o antecipado, quando houver). Lote e módulos trazem `priceCents` (com desconto) e `listPriceCents` (cheio); a âncora `modulesTotalCents` segue a soma cheia.
  - **Cache de 30 s da oferta:** continua. O início e o fim podem aparecer até 30 s depois na vitrine, mas o preço cobrado é sempre o do `POST /orders`, e o 409 da 1.7 protege o comprador. Na Fase 3, o front esconde a campanha pelo `endsAt` corrigido, sem esperar a resposta nova.
- **1.6:** avulso com desconto **por item** (o total é a soma); pacote com desconto no lote e rateio sobre o valor com desconto. As 4 colunas da campanha são nulas fora dela (helper `orderPromotionColumns`). O pagamento de teste nem lê a campanha.
- **1.7:** `expectedAmountCents` opcional. Diferente do calculado → 409 com `code: 'PRICE_CHANGED'` e `amountCents` (o valor novo), para o front distinguir dos outros 409 do pedido e mostrar o preço sem outra consulta. No avulso, a conferência vem antes de cancelar o pendente; no pacote, dentro da transação (o throw desfaz o cancelamento).
- **1.8:** o resumo ganha `discountCents` e `promotionOrders` (pagos da campanha por `paidAt`, sem estornado nem teste, a mesma base do bruto). A linha do pedido traz `promotion`. O CSV ganhou as colunas **Campanha** ("Black Friday -30%") e **Valor cheio (R$)**, no fim; o teste da coluna "Teste" passou a procurá-la pelo nome.
- **1.9:** `OrderView.promotion` (`{ name, percentOff, listAmountCents }`, helper `orderPromotionView`, usado também no financeiro). O e-mail é texto escapado, sem risco: a linha fica "Valor: R$ 692,30 no PIX, com 30% de desconto da Black Friday (de R$ 989,00)."
- **1.10:** o `nfse-builder` já usava `amountCents`; só entrou o teste.
- **1.11:** `npm test`: 93 suítes, 1406 testes. `npm run build` ok. Lint (`--fix`) nos arquivos novos de produção; os erros que sobram nos specs HTTP são os mesmos `any` do supertest dos specs que já existiam.

### Fase 2 (Front, painel), 15/11/2026, branch `feat/032-front-painel-campanha`

- **2.1:** `AdminPromotionsService` e `brasilia-time.ts` (campo `datetime-local` ↔ ISO com `-03:00`, e os textos "27/11 às 23h59"). O deslocamento é fixo, porque o Brasil não tem horário de verão desde 2019; a formatação usa o fuso pelo nome. Os tipos da loja ganharam `listPriceCents`, `PublicPromotion` e `OrderPromotion`, e os fixtures dos specs foram ajustados (`listPriceCents`, `promotion: null`).
- **2.2:** `campanha-desconto.ts`. Diferente do esboço da decisão 10:
  - **"Criar campanha" fica sempre disponível**, e não só sem campanha: dá para agendar a próxima com outra no ar. A API recusa a sobreposição com 409, e o card mostra a mensagem.
  - **Campanha no ar mostra "Termina em …" sem contagem por segundo.** O relógio vivo é da Fase 4 (vitrine); no painel, a data basta.
  - A prévia recalcula com 300 ms de espera depois da última tecla na porcentagem.
- **2.3:** card abaixo do "Pagamento de teste"; linha "Descontos concedidos" no bloco "Estornos e pedidos", só com pedido da campanha no período; selo "Black Friday −30%" na lista de pedidos.
- `ng test`: 750 testes. `ng build` ok.
- **Teste no navegador fica para o preview (Fase 6):** o `api/.env` local aponta para o banco de produção (memória `banco-unico-producao`), e a migration ainda não rodou em banco nenhum. Subir a API local para criar campanha de teste mexeria na loja de produção.

### Fase 3 (Front, preço riscado), 15/11/2026, branch `feat/032-front-preco-riscado`

- **3.1:** `ui-sale-price` (`shared/ui/sale-price`). O riscado é sempre o `listPriceCents` da API. O leitor de tela recebe "Preço anterior: R$ 989,00. Preço com desconto: R$ 692,30, 30% de desconto.", e a parte visual fica com `aria-hidden`.
- **3.2:** `ui-bundle-price` com `promotion`. Em campanha, a âncora "Valor dos módulos separadamente" sai e o riscado é o preço cheio do pacote.
- **3.3:** `StoreService.promotion` e `listTotalCents`. O prazo ("Oferta válida até …") aparece **no pacote e no total do resumo**, e não em cada módulo avulso: doze vezes a mesma data só poluiria a lista.
- **3.4:** o pagamento manda `expectedAmountCents` (exceto o teste de R$ 1,00). O 409 `PRICE_CHANGED` vira `PriceChangedError`. A tela relê a oferta **sem cache** (`loadOffer({ fresh: true })`, um `t=` na URL que passa pelo cache de 30 s) e o catálogo, mostra o valor novo e refaz as parcelas, sem sair da tela nem apagar o formulário. O aviso que já existia para o pacote ("O preço do pacote mudou…") virou geral: "O preço mudou enquanto você escolhia. Agora o total sai por …". O resumo do pagamento ganhou o total cheio riscado.
- **3.5:** no pedido, o rodapé traz o cheio riscado e "Black Friday −30%". Na aprovação, aparece "Você economizou R$ 296,70 com a Black Friday.".
- **3.6:** o `StoreService` agenda a releitura para `endsAt − serverNow + 1 s` (os dois do servidor, sem depender do relógio do aparelho), só no navegador, e guarda `clockOffsetMs` para a contagem da Fase 4. Uma oferta nova cancela o agendamento anterior.
- `ng test`: 768 testes. `ng build` ok.

### Fase 4 (Front, cards), 15/11/2026, branch `feat/032-front-cards-contagem`

- **4.1 (desenho):** o card é escuro, no gradiente navy da marca, sobre o site claro. O destaque é a porcentagem grande com a contagem em quatro blocos de algarismos tabulares, sem animação nos dígitos. Há um único movimento (`promo-bounce-in`, no `tailwind.config.js`), que vira fade com `prefers-reduced-motion`. Na última hora, o fundo fica vermelho e aparece "Acaba em menos de 1 hora". Não há rótulo em caixa alta; o texto é "Black Friday", "−30%", "de desconto em toda a loja" e "Ver a oferta".
- **4.2:** `countdown(endsAt, offsetMs)` (`core/services/countdown.ts`): só no navegador (nulo no SSR) e com o intervalo limpo no `DestroyRef`.
- **4.3:** `ui-promo-card` (`shared/ui/promo-card`), `floating` ou `inline`. "Fechou nesta sessão" é guardado **por campanha** (a chave leva o `endsAt`) e lido quando a campanha chega, porque a oferta pode chegar depois da espera de 2,5 s. No fim da contagem o card some.
- **4.4:** flutuante na landing (com `load`, porque a landing não lê a oferta) e no `/planos`; em linha acima do pacote no `/planos` e no topo da loja. **Diferente da decisão 9: na loja não há flutuante.** O resumo fixo com o botão "Ir para o pagamento" fica no canto direito, onde o flutuante entraria, e a mesma decisão diz que ele não cobre CTA nem resumo.
- **4.5 (parcial, antes do preview):** conferido no `ng serve` local (porta 4300), em 360 px e 1280 px, com uma campanha simulada só no navegador (`ng.getComponent`, sem API). Saíram dois ajustes:
  - no celular, o flutuante e o banner de cookies se sobrepunham no rodapé; agora **o card espera a decisão de cookies** (`ConsentService.bannerVisible`) e entra depois dela;
  - na última hora, o nome "Black Friday" passava de azul-claro para branco, por contraste.
  Sem rolagem horizontal nas duas larguras. Falta a conferência com campanha de verdade no preview (Task 6.2).
- **Teste instável que já existia:** numa rodada da suíte inteira, os 12 testes do `/planos` falharam com uma requisição `GET /legal/policy-version` aberta, vinda do `ConsentService` porque algum teste deixa um consentimento no `localStorage`. Depende da ordem aleatória do Jasmine: isolado, passa; as duas rodadas seguintes passaram 779/779. Não é desta spec e ficou anotado.

### Fase 5 (Front, mentora), 15/11/2026, branch `feat/032-front-mentora`

- **5.1:** os 4 parágrafos e os 4 cards do print, com os negritos e o itálico. O tipo `MentorStat` ganhou `kind: 'number' | 'text'` e `label` opcional. A grade é 2×2 em toda largura. No celular, a legenda dos cards tem espaçamento entre letras menor (0.06em), porque "DESENVOLVIMENTO" com 0.15em encostava na borda do card em 360 px. Conferido em 360 px e no desktop.
- **5.2:** `ng test`: 783 testes. `ng build` ok.
