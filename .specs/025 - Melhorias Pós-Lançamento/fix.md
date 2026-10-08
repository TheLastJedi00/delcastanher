# Relatório de Bug: campos do cartão vazios e sem como digitar

> **Status: corrigido em 2026-10-08, na branch `fix/checkout-campos-cartao`.** Falta conferir ao vivo, em celular Android e iPhone (ver "Conferir ao vivo").

## Descrição
Em alguns aparelhos, a etapa de pagamento (`/loja/pagamento`) mostrava as caixas de **número do cartão**, **validade** e **código de segurança** vazias, e não dava para digitar nelas. Nenhum erro aparecia na tela. Com PIX, o pagamento funcionava normalmente.

Os três campos são **Secure Fields**: iframes do próprio Mercado Pago, montados pelo SDK (`sdk.mercadopago.com/js/v2`) dentro de `<div id="cardNumber">`, `<div id="expirationDate">` e `<div id="securityCode">` (Spec 014, decisão 8).

## Causa
O `mount()` do SDK **não lança erro** quando o contêiner não existe. Ele só escreve um aviso no console e segue. Trecho do SDK:

```js
mount(e){ … try { const t=document.getElementById(e); if(!t) throw new Error("Container not found"); … }
          catch(t){ console.warn(`MercadoPago.js - Error when mounting field ${e}: …`) } }
```

Por isso o `try/catch` de `mountCardFields()` nunca via a falha, o componente marcava `fieldsMounted = true` e não tentava montar de novo. Três caminhos levavam a isso:

| # | Caminho | Por que falhava | Quem pega |
| - | - | - | - |
| 1 | PIX → Cartão → PIX → Cartão | Os campos ficavam dentro de `@if (method() === 'PIX') … @else`. Voltar ao PIX tirava o bloco do DOM com os iframes; ao voltar ao Cartão, `fieldsMounted` já era `true` e nada era montado | Todo aparelho. No celular as pessoas tocam nas duas opções antes de decidir |
| 2 | SDK já carregado na sessão (ir à loja e voltar ao pagamento) | O `MercadoPagoLoader` é global: `mp.load()` respondia em uma microtask, e o `mount()` rodava **antes** de o Angular desenhar o `@else`. O `eventCoalescing: true` atrasa o desenho para o próximo quadro | Todo aparelho, a partir da segunda visita |
| 3 | Primeira visita com o SDK no cache do navegador | O `load` do script podia chegar antes do próximo quadro, e o `mount()` acontecia antes de os contêineres existirem | **Alguns aparelhos**: os que redesenham a tela com menos frequência, como o iPhone em modo de economia de energia (30 quadros por segundo). Este caso foi deduzido do código, sem reprodução |

## Outros problemas nos campos de pagamento
Encontrados na mesma investigação e corrigidos junto:

1. **Falha de carregamento guardada para sempre** (`mercado-pago.service.ts`). Se o SDK falhava uma vez (rede ruim, bloqueador de anúncios, navegador do Instagram), a promise rejeitada ficava em `this.loading`, e todas as novas tentativas falhavam até recarregar a página. A tag `<script>` com erro também ficava no `<head>`, e a próxima tentativa esperava um `load` que nunca vinha.
2. **Área de toque de ~22px.** O iframe do Mercado Pago ocupa 100% do contêiner, mas o contêiner tinha o padding do `.input` (`py-2.5` numa caixa de `h-11`). Tocar na borda da caixa não abria o teclado.
3. **Fonte abaixo de 16px dentro do iframe.** Nenhum `style` era passado ao SDK. Abaixo de 16px, o iOS dá zoom ao tocar no campo, e a página fica deslocada.
4. **CPF com máscara recusado.** O validador era `/^\d{11}$/`, mas o campo aceita 14 caracteres. Quem digitava `123.456.789-00`, ou o preenchimento automático do celular, via "Informe um CPF válido" e o botão de pagar desabilitado. O CPF também não tinha conferência dos dígitos verificadores, e o Mercado Pago recusava o token depois.
5. **Nome do cartão sem validação.** O campo `cardholderName` não tinha `Validators.required`. Vazio, o `createCardToken` era recusado e o comprador via só "Não foi possível concluir o pagamento".
6. **Bandeira não reconhecida passava adiante.** Se o `binChange` falhava ou o BIN não era reconhecido, `paymentMethodId` ficava vazio, e a API recusava o pedido (`Meio de pagamento do cartao ausente.`) com a mesma mensagem genérica. O erro do `binChange` também ficava sem tratamento (promise rejeitada solta).
7. **Campos não se ajustavam à bandeira.** Os campos não recebiam as regras da bandeira (`settings` do `getPaymentMethods`). Para a American Express (15 dígitos, CVV de 4), a recomendação do Mercado Pago é chamar `update({ settings })` nos campos de número e CVV.
8. **Recusa do token sem dizer o campo.** O `createCardToken` rejeita com a lista de causas do Mercado Pago (`[{ code, message }]`), e a tela mostrava a mensagem genérica.
9. **Sem `autocomplete` nos dados do comprador** (`given-name`, `family-name`, `email`, `cc-name`). O celular não sugeria o preenchimento.
10. **Sem rótulo para leitor de tela nos campos do cartão.** O `<span>` acima de cada campo não fica associado a um `<div>`. O SDK aceita `srLabel` e `ariaRequired`, que vão para dentro do iframe.

## Correção
`front/src/app/features/loja/pagamento.ts`:
- O bloco do cartão entra no DOM no primeiro clique em "Cartão" (`cardOpened`) e depois só é **escondido** (`[class.hidden]`) quando PIX é escolhido. Os iframes não saem mais do DOM.
- A montagem roda em `afterNextRender`, depois que o Angular desenha os contêineres.
- Depois do `mount()`, o componente confere se cada contêiner tem um `<iframe>`. Se falta algum, mostra "Não foi possível carregar o formulário de cartão" e **não** marca como montado: o próximo clique em "Cartão" tenta de novo.
- `.secure-field`: caixa de `h-12` sem padding, com o anel de foco em `focus-within`. O espaçamento vai no `style` do campo (`padding: 0 12px`, `fontSize: 16px`).
- Erro por campo: o `validityChange` de cada Secure Field marca o campo inválido, e a mensagem aparece depois do `blur` ("Confira o número do cartão.", "Confira a validade (MM/AA).", "Confira o código de segurança.").
- O nome do cartão é obrigatório, vem preenchido com o nome do comprador em maiúsculas e pode ser corrigido.
- Antes de cobrar no cartão, `cardReady()` confere o que o `createCardToken` e a API exigem (campos montados e válidos, nome e bandeira) e diz o que falta, sem chamar o Mercado Pago.
- No `binChange`: erro tratado, bandeira limpa quando o BIN some, parcela 1 selecionada e `update({ settings })` nos campos de número e CVV.
- `cardTokenMessage()` traduz os códigos de recusa do token no campo a corrigir (número, validade, CVV, nome ou CPF).
- CPF aceito com ou sem pontos e traço, conferido pelos dígitos verificadores. A API e o `createCardToken` recebem só os dígitos (a API continua exigindo `^\d{11}$`).
- `autocomplete` nos campos do comprador e do nome do cartão.

`front/src/app/core/services/mercado-pago.service.ts`:
- Uma falha no carregamento limpa `this.loading`, e a tag `<script>` com erro é removida. A próxima tentativa carrega de novo.
- Tipos `SecureField`, `SecureFieldEvent` e `PaymentMethodSettings`, com `update()` e os `settings` da bandeira.

## Testes
`pagamento.spec.ts`. O SDK falso agora faz o que o real faz: o `mount()` põe um `<iframe>` no contêiner e, se o contêiner não existe, só segue em frente.

- monta os três campos depois de desenhar os contêineres;
- PIX → Cartão → PIX → Cartão mantém os campos, sem criar de novo;
- avisa quando o SDK não pôs o iframe, e tenta de novo no próximo clique;
- preenche o nome do cartão com o do comprador, e ele é obrigatório;
- mostra o erro do campo depois que o comprador sai dele;
- sem bandeira reconhecida, não cobra e diz o que conferir;
- traduz a recusa do token (`E301`) em "Confira o número do cartão.";
- envia o CPF digitado com máscara só com os dígitos;
- recusa CPF com dígito verificador errado;
- ajusta número e CVV às regras da bandeira (Amex).

Resultado: `pagamento.spec.ts` com 20 de 20, e a suíte do front com 692 de 692. Em uma de quatro rodadas completas, testes do `Plans` (`features/plans`) falharam e passaram nas três seguintes e isolados. É intermitência da ordem aleatória do Jasmine, em arquivo que este fix não toca. `ng build` sem erro.

## Conferir ao vivo
Em produção, num Android (Chrome) e num iPhone (Safari), com cartão de teste do Mercado Pago se o ambiente for sandbox:

- [ ] Abrir o pagamento, tocar em Cartão e digitar nos três campos.
- [ ] PIX → Cartão → PIX → Cartão: os campos continuam funcionando.
- [ ] Ir à loja, voltar ao pagamento, tocar em Cartão: os campos funcionam (caminho 2).
- [ ] Tocar na borda da caixa abre o teclado; no iPhone, a página não dá zoom.
- [ ] O texto dentro dos campos tem 16px, com espaço à esquerda. O `style` vai para dentro do iframe do Mercado Pago, que o valida lá dentro. Se uma chave não for aceita (`padding`, `placeholderColor`), ajustar `SECURE_FIELD_STYLE`.
- [ ] CPF com pontos e traço é aceito.
- [ ] Cartão Amex aceita CVV de 4 dígitos.
