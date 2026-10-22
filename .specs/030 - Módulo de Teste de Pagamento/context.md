# Spec 030: Módulo de Teste de Pagamento

**Projeto:** Plataforma E-learning "Imersão RH Estratégico"
**Baseada em:** Spec 014 (Checkout), Spec 016 (Painel de Finanças), Spec 023 (Nota Fiscal), Spec 024 (E-mail de compra), Spec 028 (Revisão do Pagamento com Cartão) e Spec 029 (Ambiente de Preview)
**Escopo técnico:** full-stack — `api/` (NestJS + Prisma) e `front/` (Angular standalone + signals), com uma migration de schema. O backend é escrito com TDD: a suíte vem antes da implementação (`.claude/RULES.md`).

## Objetivo
Permitir que o gestor teste o pagamento **em produção, com cartão real**, sem comprar um módulo de R$ 197 nem o pacote de R$ 989. No Financeiro, o admin liga um **módulo de teste de R$ 1,00**. Ao ligar, a plataforma gera um **link secreto** (`/loja/teste/<chave>`), e só quem tem o link vê a página do módulo de teste e consegue pagá-lo. Desligar invalida o link.

Isso cobre o que o preview não cobre (Spec 029): o sandbox só aceita cartões de teste. Com o módulo de teste, um cartão real passa pelo banco e pelo antifraude de verdade, e o dinheiro entra na conta da Lidiane, de onde é estornado pelo Mercado Pago.

## Situação atual (lida em 22/10/2026)

- Um pedido sempre tem itens, e cada item aponta para um `Module` (`OrderItem.moduleId`, obrigatório, `onDelete: Restrict`), ou é de pacote (Spec 019).
- `Module` pertence ao curso e entra em todo lugar que lista módulos: trilha e aulas (`LessonsService`), progresso e certificado, loja (`StoreService`), pacote, painel de alunos e financeiro por módulo.
- Na aprovação, o `OrdersService.apply()` libera o acesso a cada item, emite a nota fiscal (`InvoicesService.onOrderPaid`, NFS-e real em produção) e manda o e-mail "Compra confirmada" (`PurchaseEmailService`).
- O financeiro soma todo pedido `PAID` na receita, por data de pagamento.
- O Mercado Pago não documenta um valor mínimo para a Orders API. R$ 1,00 precisa ser confirmado no primeiro pagamento real (decisão 9).

## Escopo

- **Admin:** um cartão "Pagamento de teste" no Financeiro, com o toggle, o preço (R$ 1,00), o link secreto e o botão de copiar.
- **Link secreto:** gerado ao ligar e apagado ao desligar. Religar gera uma chave nova.
- **Página do módulo de teste:** `/loja/teste/<chave>`. Mostra o módulo de teste e leva ao pagamento; com chave errada ou o teste desligado, mostra "página não encontrada".
- **Pagamento:** a mesma tela de pagamento (cartão e PIX), com o resumo "Módulo de teste — R$ 1,00".
- **Pedido de teste:** marcado como teste, sem item de módulo, sem acesso, sem nota fiscal e sem e-mail de compra.
- **Financeiro:** o pedido de teste aparece na lista com a etiqueta "Teste", com logs (Spec 028), e fica **fora** da receita e dos indicadores.

## Fora de escopo

- **Pagar pelo link sem ser admin.** Só contas de admin (resposta 1).

- **Estorno pelo painel.** O estorno continua sendo feito no Mercado Pago. O webhook marca o pedido como `REFUNDED` (Spec 014, decisão 22), como em qualquer pedido.
- **Aulas, vídeos ou material no módulo de teste.** Ele é só um produto de pagamento.
- **Preço editável.** R$ 1,00 fixo no servidor (decisão 9 trata o caso de o Mercado Pago recusar).
- **Mais de um link ativo, ou link com validade.** Um link por vez, válido enquanto o teste estiver ligado.

## Decisões técnicas desta spec

1. **O módulo de teste não é um `Module`.**
   Um `Module` real apareceria na trilha, no progresso e no certificado (o aluno teria 13 módulos para concluir), na loja, no pacote, no painel de alunos e no financeiro por módulo, e cada lugar precisaria de um filtro. Basta um esquecido para um aluno real ver o módulo de teste. O "módulo de teste" é um **produto de pagamento**: nome e preço na tela, e um pedido marcado como teste, sem item.
   - `Order` ganha `testPayment Boolean @default(false)`.
   - O pedido de teste tem **zero itens**. Acesso, nota e e-mail já percorrem os itens ou checam o pedido (decisão 6), e zero itens não libera nada.

2. **Configuração numa tabela própria, com uma linha só.**
   `payment_test_settings` (model `PaymentTestSettings`): `id` fixo (`'default'`), `enabled`, `accessKey` (nulo quando desligado), `enabledAt`, `enabledById`, `updatedAt`. O preço não fica no banco: é a constante `TEST_PAYMENT_CENTS = 100` (fora de escopo, preço editável).

3. **A chave do link.**
   - Gerada ao ligar: 32 bytes aleatórios (`randomBytes(32)`), em base64url (43 caracteres). Impossível de adivinhar.
   - Guardada em texto no banco, e não como hash: o admin precisa ver e copiar o link a qualquer momento, e o que ela protege é uma compra de R$ 1,00 que não libera nada. Ela nunca sai em log (Spec 028, decisão 12).
   - Desligar apaga a chave. Religar gera outra: um link antigo nunca volta a valer.
   - Comparação em tempo constante (`timingSafeEqual`), como a assinatura do webhook.

4. **Rotas.**
   - `GET /admin/finance/test-payment` e `PUT /admin/finance/test-payment` (`{ enabled: boolean }`), na guarda de admin do financeiro. A resposta traz `enabled`, `priceCents`, `accessKey` e `enabledAt`.
   - `GET /store/test-product/:key` → `{ title, summary, priceCents }` quando a chave confere e o teste está ligado; **404** em qualquer outro caso, sem dizer se o teste existe ou se a chave está errada.
   - `POST /orders` aceita `testKey` (exclusivo com `moduleIds` e `bundleSlug`). A API confere a chave de novo no momento da cobrança: desligar o teste com a página aberta impede o pagamento.
   - **Só admin** (resposta 1): `GET /store/test-product/:key` e o `POST /orders` com `testKey` exigem sessão de admin. Sem ela, a resposta é a mesma de chave errada (404).

5. **O pedido de teste no gateway.**
   Valor de `TEST_PAYMENT_CENTS`, decidido no servidor (Spec 014, decisão 2). Um item na order do Mercado Pago, "Pagamento de teste — Imersão RH Estratégico", com `external_code` `test-payment`, para o antifraude e o extrato. O resto do caminho é o mesmo de um pedido normal: cartão ou PIX, recusa na tela (Spec 028), `FAILED`, logs e webhook.

6. **Na aprovação, nada além do status.**
   - **Sem acesso:** o pedido não tem itens.
   - **Sem nota fiscal:** o `InvoicesService.onOrderPaid` não cria nota para `testPayment`. Em produção, a nota de R$ 1,00 seria uma NFS-e real, que depois precisaria ser cancelada.
   - **E-mail curto "Pagamento de teste aprovado"** (resposta 2), no lugar do e-mail de compra.
   - A trava do "um pendente por vez" (Spec 014, decisão 11) vale também para o pedido de teste.

7. **Financeiro.**
   - A lista mostra o pedido de teste com a etiqueta **"Teste"** ao lado da situação, e o "Ver logs" (Spec 028). A coluna Módulos mostra "Módulo de teste".
   - **Fora da receita:** os indicadores do topo, a série, a quebra por meio de pagamento, a quebra por módulo e a conversão ignoram `testPayment`. Um teste de R$ 1,00 não pode virar venda no relatório.
   - O CSV leva uma coluna "Teste" (sim ou não).

8. **Páginas no front.**
   - `/loja/teste/:chave`: lê `GET /store/test-product/:chave`. Mostra "Módulo de teste", o aviso "Este módulo existe para testar o pagamento. Ele não libera aulas, e o valor pode ser estornado pelo Mercado Pago.", o preço e "Pagar R$ 1,00". Com 404, mostra a página de não encontrado do site.
   - Fora do sitemap, com `noindex` e renderização só no cliente (como `/admin`), para a chave não ir a cache nem a buscador.
   - O pagamento usa a tela atual: o `StoreService` ganha uma seleção do tipo `test` com a chave, e o `orderTarget()` devolve `{ testKey }`. O resumo mostra "Módulo de teste — R$ 1,00".
   - Na tela do pedido aprovado: "Pagamento de teste aprovado. Nenhum módulo foi liberado. Para devolver o valor, estorne pelo Mercado Pago."
   - Quem não está logado é levado ao login e volta para o link (`redirect`), como na loja.

9. **R$ 1,00 e o mínimo do Mercado Pago.**
   O Mercado Pago não documenta um valor mínimo para a Orders API. Se o primeiro pagamento real de R$ 1,00 for recusado por valor (o log da Spec 028 mostra o motivo), a constante `TEST_PAYMENT_CENTS` sobe para o mínimo aceito, num commit próprio, e o card do admin mostra o preço que vier dela.

10. **Teste no preview antes da produção.**
   No preview (Spec 029), o admin liga o teste, abre o link e o usuário paga com cartão de teste (`APRO` e `FUND`). Depois, em produção, com a migration autorizada, o usuário paga com cartão real e estorna pelo Mercado Pago, e o pedido aparece como "Teste" e `REFUNDED`, fora da receita.

## Respostas do usuário (22/10/2026)

1. **Só admin paga pelo link.** A página e a compra exigem sessão de admin **e** a chave. Um aluno com o link, ou alguém sem sessão, vê "página não encontrada" (a API responde 404, e não 403, para não confirmar que o teste existe). Sem sessão, a página leva ao login e volta para o link; se a conta não for admin, mostra o "não encontrado".
2. **Com e-mail.** O pagamento de teste aprovado manda um e-mail curto, "Pagamento de teste aprovado", ao comprador: valor, meio de pagamento, id do pedido e "Nenhum módulo foi liberado. Para devolver o valor, estorne pelo Mercado Pago." Não é o e-mail de compra, que fala em módulos e validade de acesso. Ele passa pelo mesmo `PurchaseEmailService`, com a mesma trava do `confirmationEmailedAt` (Spec 024, decisão D6).
3. **PIX também.** O link vale para cartão e PIX. O PIX de R$ 1,00 testa o QR e o webhook de produção, e o estorno também é feito pelo Mercado Pago.

## Critérios de aceite

- O toggle no Financeiro liga e desliga o módulo de teste, e mostra o link com a chave ao ligar.
- Com o teste desligado ou a chave errada, `/loja/teste/<chave>` mostra "página não encontrada", e o `POST /orders` com `testKey` responde 404.
- Religar gera uma chave nova, e o link antigo deixa de funcionar.
- Um pagamento de teste aprovado não libera acesso, não cria nota fiscal e aparece no Financeiro com a etiqueta "Teste", fora da receita e dos indicadores.
- O módulo de teste não aparece na loja, na trilha, no progresso, no certificado nem no pacote.
- No preview, `APRO` aprova e `FUND` recusa com a mensagem de limite. Em produção, um cartão real de R$ 1,00 é aprovado, estornado pelo Mercado Pago e fica `REFUNDED`.
