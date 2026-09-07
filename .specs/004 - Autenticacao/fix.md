# Relatório de Bug: ERR_REQUIRE_ESM com jwks-rsa e jose

## Descrição
A API quebra ao carregar `firebase-admin/lib/utils/jwt.js` — caminho usado por
`verifyIdToken`, ou seja, `POST /auth/verify`:

```
Error [ERR_REQUIRE_ESM]: require() of ES Module
  /var/task/api/node_modules/jose/dist/webapi/index.js from
  /var/task/api/node_modules/jwks-rsa/src/utils.js not supported.
```

A cadeia é `firebase-admin@14` → `jwks-rsa@^4.0.1` → `jose@^6.1.3`. O
`jwks-rsa@4.1.0` importa o `jose` de forma síncrona no topo de `src/utils.js`
(`const jose = require('jose')`) e o `jose@6` é publicado **apenas** como ESM.

## Causa
`require()` de um módulo ESM só funciona onde o loader implementa esse suporte.
Dois ambientes **não** implementam:

- Node.js **< 22.12** (o suporte a `require(esm)` entrou nessa versão);
- o **runtime serverless da Vercel**, que usa um loader próprio
  (`/opt/rust/nodejs.js`, com cache de bytecode) sem `require(esm)` — **em
  qualquer versão de Node**. É daí que vem o erro em produção.

Por isso o bug some no dev local (Node 24) e permanece no deploy: não é uma
questão de atualizar o Node.

## Correção aplicada
`overrides` no `api/package.json` fixando `jose@^5.10.0` **apenas para o
`jwks-rsa`**:

```json
"overrides": {
  "jwks-rsa": {
    "jose": "^5.10.0"
  }
}
```

O `jose@5` publica build **CJS e ESM** (tem a chave `require` no `exports`),
então o `require('jose')` do `jwks-rsa` resolve em qualquer loader, sem tocar
em `node_modules`. As quatro funções que o `jwks-rsa` usa — `importJWK` e
`exportSPKI` (`src/utils.js`), `decodeJwt` e `decodeProtectedHeader`
(`src/integrations/passport.js`) — têm a mesma assinatura na v5. O `override` é
escopado: nenhum outro pacote muda de versão (o `firebase-admin` não depende de
`jose` direto, só via `jwks-rsa`).

- [x] Reverter o patch manual em `api/node_modules/jwks-rsa/src/utils.js`
- [x] Adicionar o `overrides` escopado e regravar o `package-lock.json`
- [x] Documentar a razão e a condição de remoção em `api/README.md`
- [x] Validar sob um loader sem `require(esm)`

## Validação
O flag `--no-experimental-require-module` desliga o `require(esm)` do Node e
reproduz exatamente o comportamento do loader da Vercel. Antes do `override`,
com `jose@6`, `require('jose')` falha com `ERR_REQUIRE_ESM` — o erro do deploy,
reproduzido localmente. Depois do `override`, com `jose@5.10.0`:

- `require('jose')` → OK
- `require('firebase-admin/lib/utils/jwt.js')` → OK
- `jwksClient(...).getSigningKeys()` → OK, 4 chaves, com o SPKI real gerado
  (exercita `importJWK` + `exportSPKI`, o trecho que estourava)
- `npm run build` → OK; `npm test` → 5 suítes / 49 testes passando
- `node dist/main` com o flag, respondendo em `localhost:3000`:
  `POST /auth/verify` devolve o `401` de token inválido (esperado), sem
  `ERR_REQUIRE_ESM` no log

## Incoerências corrigidas ao longo do fix
1. **Patch em `node_modules` (1ª tentativa).** A edição em
   `api/node_modules/jwks-rsa/src/utils.js` está no `.gitignore`: some em
   qualquer `npm ci`, não vale para CI/deploy nem para o time. Era exatamente
   por isso que a produção continuava quebrada. Revertido.
2. **Piso de versão do Node (2ª tentativa).** `engines.node >= 22.12` +
   `engine-strict` + `.nvmrc` corrigiam o sintoma **só no dev local**. Os logs
   da Vercel mostraram que o loader dela não faz `require(esm)` em versão
   nenhuma, então o piso não resolvia produção — e o `engine-strict` ainda
   adicionava risco de falha de install no deploy. Revertido.
3. **Conclusão sem reprodução.** As duas primeiras tentativas foram dadas como
   resolvidas sem reproduzir o erro. Agora existe um comando que reproduz
   (`node --no-experimental-require-module`) e que valida a correção.
