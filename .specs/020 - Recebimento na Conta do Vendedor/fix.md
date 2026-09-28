# Relatório de Bug: troca do `code` do OAuth do Mercado Pago recusada

> **Status: corrigido, falta validar.** A primeira conexão da conta recebedora (Task 6.1) ainda não fechou. As quatro falhas tiveram causa encontrada; a última (`invalid_request`) foi o corpo do `POST /oauth/token` em JSON, trocado por formulário.

## Descrição
Ao conectar uma conta do Mercado Pago pelo link do painel, o retorno
`GET /mercadopago/oauth/callback` chega com `code` e `state` válidos, mas a
troca do `code` em `POST https://api.mercadopago.com/oauth/token` é recusada. O
vendedor cai em `/conexao-mercado-pago?resultado=erro&motivo=falha`.

Os testes foram feitos em produção (`api.delcastanher.srv.br`) com a conta do
próprio desenvolvedor, para depois trocar pela da vendedora (a conexão antiga
fica `replaced` ou `manual`, ver decisão 12).

## Linha do tempo (28/09/2026, horário de Brasília)
Os logs da Vercel mostram UTC, 3 horas à frente.

| Hora | Resposta do Mercado Pago | Causa | Situação |
| - | - | - | - |
| 09:45 | `400 invalid_client` | `MP_CLIENT_SECRET` errado na Vercel | Corrigido pelo usuário |
| 10:08 | troca **aceita**, depois `500` da API | `MP_TOKEN_ENCRYPTION_KEY` sem 32 bytes em base64 | Corrigido pelo usuário, com redeploy |
| 10:08 | `400 invalid_grant` | Reenvio do mesmo retorno: o `code` já tinha sido usado | Esperado |
| 10:17 | `400 invalid_request` | Não confirmada | Em aberto |
| 10:36 | `400 invalid_request` (`grant_type is a required parameter`) | Corpo em JSON não lido | Corrigido, falta validar |

### 1. `invalid_client`
O Mercado Pago não aceitou o par `client_id` + `client_secret`. O `client_id`
estava certo, porque a mesma variável montou a URL de autorização e o
consentimento passou. O suspeito era o `MP_CLIENT_SECRET`, e trocá-lo resolveu:
a tentativa seguinte passou da troca.

### 2. `MP_TOKEN_ENCRYPTION_KEY precisa ter 32 bytes em base64.`
A troca deu certo, e a falha veio ao cifrar o token antes de gravar
(`mercadoPagoTokenKey`, `api/src/config/payments.config.ts`). A exceção sobe de
dentro da transação do `MercadoPagoLinkService.complete`, e o navegador recebeu
o JSON cru do `500` em vez da página de resultado.

Correção: gerar a chave com `crypto.randomBytes(32).toString('base64')`
(44 caracteres terminando em `=`), salvar em produção e preview, e fazer
redeploy. A chave não pode mais mudar: ela decifra os tokens gravados.

### 3. `invalid_grant`
O mesmo retorno chegou de novo (recarga da página ou botão voltar). Como a
transação foi desfeita, o `state` continuou sem `usedAt`, e a API tentou trocar
um `code` que o Mercado Pago já tinha consumido.

### 4. `invalid_request`, ainda em aberto
Aconteceu logo depois do redeploy com a chave nova. O log só guardava o campo
`error` da resposta, e `invalid_request` vale para vários parâmetros, então
não dava para saber qual foi recusado.

Hipóteses, ainda sem confirmação:
- reaproveitamento do link ou do retorno antigo, em vez de gerar um link novo;
- `test_token=true` enviado em produção: `MP_SANDBOX` é `true` quando não está
  definida (`mercadoPagoSandbox`), e a conta autorizada é real;
- algum parâmetro do PKCE ou a `redirect_uri` fora do que o Mercado Pago espera.

A tentativa das 10:36 já rodou no deploy com o log novo
(`dpl_8Nyo9XWZKcEA5bCaJQq1mfQF7RVt`, request `8h6mn-1790602581612-60e4460c5e16`).
Ela veio de um link novo e fez só o `POST` do token, sem o `GET /users/me` que
vem depois de uma troca aceita. A linha do log é:

```
Mercado Pago recusou authorization_code com 400: invalid_request (grant_type is a required parameter)
```

O `grant_type` estava no corpo, que ia em JSON. O código era o mesmo das 10:08,
quando a troca foi aceita, então as três hipóteses acima caem: o Mercado Pago
não leu o JSON dessas trocas. Numa sondagem com credenciais falsas, o corpo em
formulário (`application/x-www-form-urlencoded`) foi lido campo a campo. É o
formato que a RFC 6749 pede para o endpoint de token.

## Correção aplicada
- [x] Log com a explicação do Mercado Pago (PR #26, commit `0defdb6`).
  `errorCode` virou `errorDetails` em `mercado-pago-oauth.service.ts` e devolve
  `error` e `message`, com o `message` cortado em 300 caracteres. A linha fica:

  ```
  Mercado Pago recusou authorization_code com 400: invalid_request (<message>)
  ```

  O corpo da requisição (`client_secret`, `code`, `refresh_token`) continua
  fora do log. O teste que garante isso foi mantido, e há um teste novo para o
  `message`. `npx jest src/payments`: 330 testes passando.
- [x] Ler o `message` da tentativa das 10:36: `grant_type is a required
  parameter`, com o campo no corpo JSON.
- [x] Corpo do `POST /oauth/token` em formulário em vez de JSON, na troca e na
  renovação. Teste novo garante o `Content-Type`. `npx jest src/payments`: 331
  testes passando.
- [ ] Corrigir a causa e fechar a primeira conexão (Task 6.1). Conferir junto
  se a resposta traz `offline_access` (Task 0.2).

## Achados paralelos
Não bloqueiam a conexão, mas apareceram no caminho:

1. **O retorno devolve `500` cru quando a gravação falha.** O `complete` promete
   "nunca lança", mas uma exceção dentro da transação (como a da chave) escapa
   e o vendedor vê JSON em vez da página de resultado. Vale capturar e mandar
   para `motivo=falha`.
2. **O `state` não é marcado como usado quando a gravação falha.** A transação é
   desfeita inteira, o link continua válido, e uma recarga reenvia um `code` já
   consumido (o `invalid_grant` das 10:08). É inofensivo, mas confunde o
   diagnóstico.
3. **`tsc --noEmit` acusa dois erros de tipo pré-existentes** em
   `src/auth/auth.controller.spec.ts` e `src/certificates/certificates.service.spec.ts`,
   sem relação com esta spec.

## Como testar de novo
1. No painel, gerar um **link novo**. Links antigos são invalidados.
2. Abrir, autorizar e **não recarregar** a página de retorno.
3. Se falhar, pegar a linha `ERROR [MercadoPagoOAuthService]` do request do
   callback na Vercel. A explicação do Mercado Pago está entre parênteses.
