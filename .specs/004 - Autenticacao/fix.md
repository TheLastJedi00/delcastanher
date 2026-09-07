# Relatório de Bug: ERR_REQUIRE_ESM com jwks-rsa e jose

## Descrição
Ao validar tokens (`POST /auth/verify` e qualquer caminho que carregue
`firebase-admin/lib/utils/jwt.js`), a API quebrava com `[ERR_REQUIRE_ESM]`.
A cadeia é `firebase-admin@14` → `jwks-rsa@^4.0.1` → `jose@^6.1.3`.
O `jwks-rsa@4.1.0` importa o `jose` de forma síncrona no topo de
`src/utils.js` (`const jose = require('jose')`), e o `jose@6` é distribuído
**apenas** como ES Module.

## Causa (revisada)
A causa não é o pacote `jwks-rsa` em si — é a **versão do Node.js**.
O suporte a `require()` de módulos ESM (sem top-level await) entrou no Node
**22.12**. Em runtimes anteriores, o `require('jose')` do `jwks-rsa` estoura
`ERR_REQUIRE_ESM`; a partir do 22.12 ele funciona sem nenhuma alteração no
pacote.

Verificação feita neste ambiente (Node **v24.15.0**), com o `node_modules`
restaurado ao conteúdo original publicado no npm:

- `require('jose')` → OK
- `require('firebase-admin/lib/utils/jwt.js')` → OK
- `jwksClient(...).getSigningKeys()` (chama `retrieveSigningKeys`) → OK
- `npm test` → 5 suítes / 49 testes passando
- API de pé em `localhost:3000` e `POST /auth/verify` respondendo `401` de
  token inválido (comportamento esperado), sem `ERR_REQUIRE_ESM`

## Incoerências do relatório anterior (corrigidas)
1. **A correção anterior não era versionável.** A edição foi feita em
   `api/node_modules/jwks-rsa/src/utils.js`, que está no `.gitignore`. Ela se
   perdia em qualquer `npm ci`/`npm install` limpo e não valia para mais
   ninguém do time nem para CI/deploy — ou seja, o bug continuava aberto.
2. **O diagnóstico parava na dependência.** Tratava o `jwks-rsa` como
   defeituoso, quando o pacote está correto para os runtimes que ele suporta;
   o que faltava era o piso de versão do Node.
3. **A conclusão declarava sucesso sem reprodução.** O erro não reproduz no
   Node 24 nem antes nem depois do patch, então o patch não era o que fazia a
   aplicação funcionar.

## Correção aplicada
- [x] Reverter `api/node_modules/jwks-rsa/src/utils.js` ao original do npm
      (nada de patch em `node_modules`)
- [x] Declarar o piso de runtime em `api/package.json`: `engines.node >= 22.12.0`
- [x] Criar `api/.npmrc` com `engine-strict=true`, para o `npm install` falhar
      cedo e com mensagem clara em Node antigo, em vez de quebrar em runtime
- [x] Criar `.nvmrc` na raiz fixando o Node 24 para o time e para CI
- [x] Documentar o requisito e o porquê em `api/README.md`
- [x] Revalidar: `npm test` verde e API respondendo em `localhost:3000`

## Conclusão
A correção passou a viver no repositório, não no `node_modules`. Sobrevive a
instalação limpa, vale para CI/deploy e dispensa `patch-package`. Se no futuro
for necessário rodar em Node < 22.12, o caminho é atualizar o `jwks-rsa` para
uma versão que faça `import()` dinâmico ou fixar `jose@5` (dual CJS/ESM) via
`overrides` — nunca editar `node_modules`.
