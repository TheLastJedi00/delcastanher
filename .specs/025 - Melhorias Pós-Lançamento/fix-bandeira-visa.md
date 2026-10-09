# Relatório de Bug: bandeira Visa não reconhecida

> **Status: corrigido em 2026-10-09, na branch `fix/checkout-bandeira-visa`.** Etapas 1 a 5 implementadas; falta a 6 (conferir ao vivo). `pagamento.spec.ts` com 25 de 25, suíte do front com 697 de 697, `ng build` sem erro.
>
> Ajuste em relação ao plano: o teste do fallback 8 → 6 ficou no `pagamento.spec.ts`, que usa o `paymentMethod()` de verdade do serviço sobre o SDK falso, em vez de um spec separado do serviço. O teste de espaçamento do formulário (`5.99997 >= 6`) falhou em algumas rodadas isoladas, também na `main`: é arredondamento de subpixel do Chrome local, sem relação com este fix.

## Descrição
Na etapa de pagamento (`/loja/pagamento`), com cartão **Visa**, o botão de pagar para em "Confira o número do cartão: não reconhecemos a bandeira." O número está certo e o cartão é aceito pelo Mercado Pago. Com Mastercard o problema quase não aparece.

## Como a bandeira é descoberta hoje
1. O Secure Field `cardNumber` emite `binChange`. O iframe do Mercado Pago (`secure-fields.mercadopago.com`) **só emite o BIN com 8 dígitos** (`b=8`; com menos de 8, emite `null`). Trecho do iframe:
   ```js
   const r = a.length >= b ? a.slice(0, b) : null;   // b = 8
   S !== r && m.sendMessage({ message: "binChange", data: { bin: r } })
   ```
2. `onBinChange()` (`front/src/app/features/loja/pagamento.ts:947`) chama, em `Promise.all`:
   - `sdk.getPaymentMethods({ bin })` → `GET /v1/payment_methods/search?bins=<8 dígitos>`
   - `this.mp.installments(...)` → `GET /v1/payment_methods/installments?bin=<8 dígitos>&payment_type_id=credit_card`
3. `paymentMethodId = methods.results?.[0]?.id ?? ''`. Vazio, o `cardReady()` barra o pagamento com a mensagem acima.

## Causa

### 1. A tabela de BINs do Mercado Pago não reconhece muitos BINs Visa de 8 dígitos (causa principal)
A Visa passou a emitir BINs de 8 dígitos, e a tabela do Mercado Pago tem faixas Visa cadastradas **por 8 dígitos**. Um cartão cujo BIN de 6 dígitos é conhecido pode ter os 8 primeiros dígitos fora da tabela, e aí as duas consultas falham: a busca devolve `results: []` e as parcelas devolvem `404 payment method not found`.

Teste feito em 2026-10-09 contra a API do Mercado Pago, com a chave pública da loja (`MP_PUBLIC_KEY`). Os 8 dígitos são os 6 de um BIN real seguidos de 2 aleatórios:

| BIN (8) | busca (8) | parcelas (8) | busca com os 6 primeiros |
| - | - | - | - |
| `42230395` | vazio | 404 | `visa/credit_card` |
| `41747614` | vazio | 404 | `visa/credit_card` |
| `47633141` | vazio | 404 | `visa/credit_card` |
| `42356449` | vazio | 404 | `visa/credit_card` (é o BIN do cartão de teste Visa do Mercado Pago, `4235 6477…`) |
| `40305173` | vazio | 404 | `visa/prepaid_card` |
| `45841816` | vazio | 404 | `visa/prepaid_card` |
| `42388370` | vazio | 404 | `visa/prepaid_card` |
| `45139708` | vazio | 404 | `visa/prepaid_card` |
| `51339290` | vazio | 404 | `master/credit_card` |

Na amostra, **9 de 23 BINs Visa** (de 6 dígitos conhecidos) falharam com 8 dígitos. Na Mastercard foi **1 de 11**. Por isso o problema aparece como "Visa não funciona". Todos os que falharam com 8 dígitos foram reconhecidos com os 6 primeiros.

O `binChange` nunca entrega 6 dígitos, então o componente nunca chega a fazer a consulta que daria certo.

### 2. Parcelas e bandeira presas no mesmo `Promise.all`
Em `onBinChange()`, se `installments()` falha (404, rede, valor fora da faixa), o `Promise.all` rejeita e o `catch` zera `paymentMethodId`, mesmo que `getPaymentMethods` tenha respondido a bandeira. Uma falha nas parcelas vira "não reconhecemos a bandeira". Com a causa 1, as duas falham juntas; mas, corrigida a 1, a 2 continua podendo derrubar a bandeira sozinha.

### 3. Mensagem que não ajuda o comprador
"Não reconhecemos a bandeira" faz o comprador achar que digitou errado. Quando o Mercado Pago realmente não conhece o cartão (por exemplo, um Visa **só débito**: a conta não tem `debvisa` habilitado, só `visa` crédito/pré-pago, `elo`, `amex`, `master` e `debelo`), a tela precisa dizer que **este cartão** não é aceito e sugerir outro cartão ou o PIX.

### Descartados
- **API da loja**: aceita qualquer `paymentMethodId` (`api/src/payments/dto/create-order.dto.ts`). Não filtra Visa.
- **`settings` da Visa** no `update()`: iguais às da Master (`{ validation: 'standard', length: 16 }`, CVV 3). O `update()` não lança erro.
- **Conta sem Visa**: `GET /v1/payment_methods` lista `visa` crédito e pré-pago como `active`.

## Etapas da correção

### 1. Consultar a bandeira com 8 dígitos e, sem resultado, com 6
Em `front/src/app/core/services/mercado-pago.service.ts`, um método único para descobrir a bandeira:

```ts
/** Bandeira do cartao pelo BIN. A tabela do Mercado Pago tem BINs Visa de 8
 *  digitos que ela nao conhece, mas conhece os 6 primeiros. */
async paymentMethod(bin: string): Promise<{ id: string; bin: string; settings?: PaymentMethodSettings } | null> {
  const sdk = await this.load();

  for (const candidate of [bin.slice(0, 8), bin.slice(0, 6)]) {
    const { results } = await sdk.getPaymentMethods({ bin: candidate });
    const method = results?.[0];

    if (method) {
      return { id: method.id, bin: candidate, settings: method.settings?.[0] };
    }
  }

  return null;
}
```

O BIN que deu certo (`bin`) é o que vai para as parcelas e para o `lastBin`.

### 2. Separar bandeira de parcelas em `onBinChange()`
Em `pagamento.ts`:
- Primeiro a bandeira (`this.mp.paymentMethod(bin)`). Achou: grava `paymentMethodId`, aplica as `settings` nos campos e segue. Não achou: zera e mostra a mensagem da etapa 4.
- Depois as parcelas, com o BIN que funcionou, num `try/catch` próprio. Falhou: `installments = []` e o pagamento segue em 1x, **sem** zerar a bandeira. (A API já trata `installments` ausente como 1.)
- `lastBin` passa a guardar o BIN que funcionou, para o `bundlePriceChanged()` refazer as parcelas com ele.

### 3. Ignorar respostas fora de ordem
Guardar o BIN da chamada e, quando as promessas voltarem, descartar o resultado se `lastBin` já mudou (o comprador apagou e digitou outro cartão). Sem isso, a resposta lenta do cartão antigo pode sobrescrever a do novo.

### 4. Mensagem clara quando o Mercado Pago não conhece o cartão
Trocar, no `cardReady()` e logo no `binChange` (embaixo do campo do número):
> "Este cartão não é aceito pelo Mercado Pago. Tente outro cartão de crédito ou pague com PIX."

Mostrar já no `binChange`, e não só no clique em pagar, para o comprador não preencher validade, CVV e nome à toa.

### 5. Testes (`pagamento.spec.ts`)
O SDK falso (`pagamento.spec.ts:222`) hoje sempre responde `master`. Fazer `getPaymentMethods` responder conforme o `bin` recebido e cobrir:
- BIN de 8 sem resultado e de 6 com `visa` → `paymentMethodId = 'visa'` e parcelas pedidas com os 6 dígitos;
- BIN de 8 com resultado → não consulta com 6;
- bandeira ok e `getInstallments` rejeitando → bandeira mantida, sem parcelas, pagamento em 1x;
- nenhum resultado com 8 nem com 6 → mensagem da etapa 4 e pagamento barrado;
- dois `binChange` seguidos com a resposta do primeiro chegando por último → vale o segundo.

E em `mercado-pago.service.spec.ts` (ou o equivalente), o fallback 8 → 6 isolado.

### 6. Conferir ao vivo
Em produção, com cartão Visa real (estornar depois pelo painel) ou, em sandbox, com o cartão de teste Visa `4235 6477 2802 5682`:
- [ ] Digitar o número: aparecem as parcelas, sem aviso de bandeira.
- [ ] Pagar em 1x e em parcelado: o pedido é criado com `payment_method.id = visa`.
- [ ] Um Visa só débito mostra a mensagem da etapa 4 assim que o número é digitado.
- [ ] Master, Elo e Amex continuam funcionando.

## Arquivos afetados
- `front/src/app/core/services/mercado-pago.service.ts`: `paymentMethod(bin)` com fallback 8 → 6.
- `front/src/app/features/loja/pagamento.ts`: `onBinChange()` separado em bandeira e parcelas; descarte de resposta antiga; mensagem nova.
- `front/src/app/features/loja/pagamento.spec.ts`: SDK falso por BIN e os casos da etapa 5.
