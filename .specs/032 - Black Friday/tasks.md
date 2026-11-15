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
- [ ] **Task 1.1:** Migration `<timestamp>_campanha_de_desconto`: modelo `Promotion` (decisão 1) e, em `Order`, `promotionId` (FK `Restrict`), `promotionNameSnapshot`, `discountPercentSnapshot` e `listAmountCents`, todos nulos (decisão 5). Índice em `Promotion(startsAt, endsAt)`. Rodar primeiro na branch `preview` do Neon.
- [ ] **Task 1.2:** Spec de `promotion.ts` (funções puras): `applyDiscount` (arredondamento, 1% e 90%, R$ 989,00 com 30% = 69230), `isRunning(promotion, now)` (antes do início, no início exato, no fim exato, depois do fim, encerrada antes da hora) e `overlaps`. Implementar.
- [ ] **Task 1.3:** Spec do `PromotionsService`: `current(now)`; criar (valida 1–90, fim depois do início, início não no passado, 409 na sobreposição); editar (futura: tudo; vigente: só `endsAt` e `name`, 409 ao mudar `percentOff`/`startsAt`; encerrada: 409); apagar (só futura); encerrar agora (`endedEarlyAt`). Implementar.
- [ ] **Task 1.4:** Controller do admin `admin/promotions` (listar com totais, criar, editar, apagar, encerrar, `preview?percentOff=`), protegido como os outros do financeiro. Spec HTTP.
- [ ] **Task 1.5:** Spec da oferta pública: `GET /store/offer` e o catálogo devolvem `priceCents` com desconto, `listPriceCents`, e `promotion: { name, percentOff, endsAt, serverNow } | null` (decisões 4 e 7). Fora da campanha, `listPriceCents = priceCents` e `promotion = null`. Implementar no `StoreService` e no `BundlesService.offer`.
- [ ] **Task 1.6:** Spec do pedido no `OrdersService`/`BundlesService.placeOrder`: pacote e avulsos com desconto, rateio sobre o valor com desconto (soma dos itens = `amountCents`), snapshots gravados; fora da campanha, colunas nulas; pagamento de teste nunca recebe desconto. Implementar.
- [ ] **Task 1.7:** Spec do `expectedAmountCents` (decisão 6): igual → segue; diferente → 409 "O preço mudou. Confira o novo valor antes de pagar." sem chamar o Mercado Pago; ausente → segue (compatível com o front antigo durante o deploy). Implementar no DTO e no `OrdersService`.
- [ ] **Task 1.8:** Spec do financeiro (`AdminFinanceService`): "Descontos concedidos" no resumo do período (soma de `listAmountCents - amountCents` dos pagos) e `promotion` em cada pedido da lista. Estornado sai da conta, como na receita. Implementar.
- [ ] **Task 1.9:** Recibo e e-mail (decisão 12): a view do pedido devolve `listAmountCents` e a campanha; o e-mail "Compra confirmada" mostra o valor cheio riscado. Ajustar as specs do `purchase-email`.
- [ ] **Task 1.10:** NFS-e: spec garantindo que a nota de um pedido com desconto sai com o valor cobrado, sem desconto incondicional (decisão 11). O `nfse-builder` não muda.
- [ ] **Task 1.11:** Rodar `npm test` e `npm run build` da API.

## Fase 2: Front - Painel do Financeiro
- [ ] **Task 2.1:** `PromotionsService` no front (`core/services`), com os tipos da Fase 1. `formatPrice` reaproveitado.
- [ ] **Task 2.2:** Componente `campanha-desconto.ts` em `features/admin/financeiro/` (decisão 10): estados sem campanha, agendada, no ar e histórico; formulário reativo com validações; prévia vinda da API; "Encerrar agora" com confirmação dentro do card. Datas em `America/Sao_Paulo`. Spec do componente.
- [ ] **Task 2.3:** Encaixar o card no `admin-financeiro.html`, abaixo do `<app-pagamento-teste>`. No resumo do período, a linha "Descontos concedidos"; na lista de pedidos, o selo da campanha. Ajustar a spec do financeiro.

## Fase 3: Front - Preço riscado
- [ ] **Task 3.1:** Componente `ui-sale-price` em `shared/ui/` (decisão 8): `~~de~~` + preço novo + selo "−30%" + "Oferta válida até 27/11 às 23h59", com texto para leitor de tela. Sem campanha, mostra só o preço. Spec.
- [ ] **Task 3.2:** `ui-bundle-price`: em campanha, troca a âncora "Valor dos módulos separadamente" pelo preço cheio riscado (decisão 8). Spec.
- [ ] **Task 3.3:** Loja (`loja.ts`), `/planos` (`plans.html`) e página do curso: usar o `ui-sale-price` nos módulos e no pacote; resumo do carrinho com o total cheio riscado e o total com desconto.
- [ ] **Task 3.4:** Pagamento (`pagamento.ts`): enviar `expectedAmountCents`; no 409, recarregar a oferta e mostrar "O preço mudou" com o valor novo, sem perder o que o comprador preencheu. Spec.
- [ ] **Task 3.5:** Pedido (`pedido.ts`): valor cheio riscado e "Black Friday −30%" quando o pedido tem campanha.
- [ ] **Task 3.6:** Quando a contagem chega a zero na loja, recarregar a oferta (decisão 7). Spec com relógio falso.

## Fase 4: Front - Cards com contagem regressiva
- [ ] **Task 4.1:** Desenho do card com a skill `frontend-design`, na identidade da landing (glass card, gradiente da marca, cor de urgência na última hora).
- [ ] **Task 4.2:** Signal de contagem regressiva (`countdown(endsAt, serverNow)`), só no navegador, com intervalo limpo no `DestroyRef`. Spec com relógio falso: dias/horas/minutos/segundos, defasagem do relógio do aparelho, chegada ao zero.
- [ ] **Task 4.3:** `ui-promo-card` (decisão 9): variante flutuante (entrada com salto, fechar, `sessionStorage` com try/catch, `prefers-reduced-motion`) e variante em linha. SSR: no servidor, só o card em linha com a data, sem contagem. Spec.
- [ ] **Task 4.4:** Encaixar o card flutuante na landing, no `/planos` e na loja (não no pagamento nem no pedido), e o card em linha no preço do `/planos` e no topo da loja.
- [ ] **Task 4.5:** Conferir no navegador, com uma campanha de teste no preview: desktop e celular (360 px), sem cobrir CTA, sem rolagem horizontal, sem erro de hidratação no console.

## Fase 5: Front - Quem será sua Mentora
- [ ] **Task 5.1:** Aplicar na seção `#mentora` os textos da seção "Textos da mentora" do `context.md`: os 4 parágrafos no `landing.html`, com os negritos e o itálico; os 4 cards novos em `stats` (`landing.ts`), com `kind: 'number' | 'text'` e `label` opcional; a grade em 2×2 também no desktop. Ajustar `landing.spec.ts` e `landing.presentation.spec.ts`. Conferir no navegador em 360 px e no desktop, comparando com o print de `libs/`.
- [ ] **Task 5.2:** Rodar `ng test` e `ng build` do front.

## Fase 6: Preview e produção
- [ ] **Task 6.1:** Merge das branches de fase na `release/032-black-friday` e push para a branch `preview` (Spec 029). A migration roda na branch `preview` do Neon.
- [ ] **Task 6.2:** No painel do preview, criar uma campanha de teste que começa em 5 minutos e dura 30. Conferir: antes, preço normal; no início, preço riscado e cards, sem deploy; ao clicar em "Encerrar agora", tudo volta.
- [ ] **Task 6.3:** **Usuário:** compra de teste no preview (cartão `APRO`, sandbox) durante a campanha de teste. Conferir no Neon `preview` o `amountCents` com desconto, os snapshots e a soma dos itens; e no Financeiro, o selo e os descontos concedidos. A emissão de nota fica desligada no preview (Spec 031).
- [ ] **Task 6.4:** Testar o 409 do `expectedAmountCents`: abrir o pagamento, encerrar a campanha pelo painel e clicar em pagar.
- [ ] **Task 6.5:** Apagar a campanha de teste do preview (ou deixá-la encerrada) e abrir o PR da release contra a `main`, com as decisões no topo. **Sem merge**: o merge é do usuário.
- [ ] **Task 6.6:** **Usuário:** depois do merge, cadastrar a campanha real da Black Friday no Financeiro de produção e conferir na loja, antes do início, que nada mudou ainda.
