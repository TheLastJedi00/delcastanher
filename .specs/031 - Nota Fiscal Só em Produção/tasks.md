# Tasks: Spec 031 - Nota Fiscal Só em Produção

Spec de `api/` (NestJS + Jest), com um ajuste no `front/` (Angular standalone + signals) e configuração da Vercel. No backend a suíte vem **antes** da implementação, conforme `.claude/RULES.md`. As decisões referenciadas estão no `context.md`.

Ordem das fases:
1. Primeiro a contenção, que não depende de código: tirar a chave do preview e do `.env`.
2. Depois a API: a emissão só liga em produção, o boot avisa, e o NBS passa a ser obrigatório.
3. Então o front: o painel com a emissão desligada.
4. Por fim, o preview, o PR e a produção.

## Fase 0: Contenção (antes do código)
- [x] **Task 0.1:** **Usuário:** na Vercel, projeto `delcastanher-api`, remover do ambiente **Preview** a `NOTAAS_API_KEY`, a `NOTAAS_WEBHOOK_SECRET` e todas as `NFSE_*`. Redeploy da branch `preview`. O modo automático não deixa o agente remover variáveis da Vercel (memória `vercel-env-secrets`). **Feito em 03/11/2026, de outro jeito (decisão do usuário):** em vez de remover, o usuário trocou a `NOTAAS_API_KEY` e a `NOTAAS_WEBHOOK_SECRET` do Preview por valores aleatórios (11:32 e 11:33). Sem uma chave válida, a Notaas recusa a emissão. As `NFSE_*` do Preview continuam com os valores antigos, que sozinhos não emitem nada. Redeploy feito (`delcastanher-nqdv5xsx8`), com o alias `api-preview.delcastanher.srv.br`, que responde 200.
- [x] **Task 0.2:** Com autorização do usuário, remover a `NOTAAS_API_KEY` do `api/.env` local (a chave continua só na Vercel de Production). **Feito pelo usuário em 03/11/2026:** a chave ficou **comentada** no `api/.env` (decisão do usuário), e não apagada. A API local não a lê.
- [ ] **Task 0.3:** **Usuário:** enviar à contadora o PDF `compras-concluidas-producao-2026-11-02.pdf` e pedir o cancelamento da NFS-e de R$ 989,00 de 22/10/2026 em nome de Leno Borges, que não corresponde a nenhuma venda.
- [ ] **Task 0.4:** **Usuário:** perguntar à contadora se as notas já emitidas sem NBS (as 5 de produção e a do preview) precisam de nota substituta. Registrar a resposta na decisão 7.

## Fase 1: API - Emissão só em produção
- [x] **Task 1.1:** Em `invoice.config.spec.ts` (decisões 1 e 2):
  - `invoicesEnabled` é `true` só com `VERCEL_ENV=production` **e** `NOTAAS_API_KEY`;
  - `false` com a chave e `VERCEL_ENV` igual a `preview`, `development` ou ausente;
  - `false` em produção sem a chave;
  - `nfseEnvironment` é `producao` quando a emissão está ligada e `homologacao` quando não está, e ignora o `NFSE_ENV` (inclusive `NFSE_ENV=producao` no preview).
- [x] **Task 1.2:** Implementar no `invoice.config.ts` e corrigir o comentário do `invoicesEnabled`.
- [x] **Task 1.3:** Em `invoices.service.spec.ts`:
  - com `VERCEL_ENV=preview` e a chave, `onOrderPaid` não cria nota e o gateway não é chamado;
  - `reconcile` não chama o gateway;
  - `reissue` e o cancelamento respondem 409 com "Emissão de nota fiscal desligada neste ambiente.";
  - com `VERCEL_ENV=production`, o fluxo atual continua igual, com `environment = producao`.
- [x] **Task 1.4:** Ajustar o `InvoicesService`: a mensagem do `requireEnabled` e o uso de `invoicesEnabled` em todo caminho que chama a Notaas (emitir, cancelar e sincronizar pelo painel).
- [x] **Task 1.5:** Spec do log de boot (decisão 4): uma linha de "ligada" ou "desligada (VERCEL_ENV=…)", e o `warn` quando houver chave fora da produção. A chave nunca aparece no log. Implementar no `onModuleInit` do `InvoicesService`.
- [x] **Task 1.6:** NBS obrigatório (decisão 7). Em `invoice.config.spec.ts`: sem `NFSE_NBS` → erro com o nome da variável; com `1.1806.40.00` (com pontos), 8 ou 10 dígitos → erro de formato; com `118064000` → `nbs: '118064000'`. Em `nfse-builder.spec.ts`: o `servico.nbs` sai sempre. Em `invoices.service.spec.ts`: sem `NFSE_NBS`, a nota vai para `ERROR` e a Notaas não é chamada.
- [x] **Task 1.7:** Implementar no `fiscalConfig()` (`requiredEnv` e `^\d{9}$`), no tipo `FiscalConfig` e no `nfse-builder`. Atualizar o `api/.env.example` (`NFSE_NBS` entre os obrigatórios, com `118064000`) e a tabela de variáveis da Spec 024.2.
- [x] **Task 1.8:** Rodar `npm test` e `npm run build` da API.

## Fase 2: Front - Painel de notas
- [x] **Task 2.1:** No componente de nota fiscal do Financeiro (`nota-fiscal.ts`), com `enabled: false` vindo do `GET /admin/invoices/config`: mostrar "Emissão desligada neste ambiente" e esconder as ações que chamam a Notaas. O selo "Homologação" continua só nas linhas com `environment = homologacao`. Spec do componente.
- [x] **Task 2.2:** Rodar `ng test` e `ng build` do front.

## Fase 3: Preview e produção
- [x] **Task 3.1:** Fazer o merge das branches de fase na `release/031-nota-fiscal-so-em-producao` e empurrá-la para a branch `preview` (Spec 029).
- [x] **Task 3.2:** No preview, conferir no log do boot a linha "Emissão de NFS-e desligada (VERCEL_ENV=preview)." e, no Financeiro, "Emissão desligada neste ambiente".
- [ ] **Task 3.3:** Pedir ao usuário uma compra com cartão de teste (`APRO`) no preview. Conferir na branch `preview` do Neon que o pedido ficou `PAID` **sem** linha em `invoices`, e pedir ao usuário que confira o portal da NFS-e: nenhuma nota nova.
- [x] **Task 3.4:** Subir `NFSE_NBS=118064000` em **Production** da `delcastanher-api`, antes do merge (decisão 7), e conferir pela listagem da Vercel.
- [x] **Task 3.5:** Abrir o PR da release contra a `main`, com as decisões no topo. **Sem merge**: o merge é do usuário.
- [ ] **Task 3.6:** **Usuário:** remover a `NFSE_ENV` de Production na Vercel, depois do merge (decisão 2). Conferir no log do boot de produção a linha "Emissão de NFS-e ligada (produção)." e, na próxima venda real, a nota autorizada com `environment = producao` e o NBS 1.1806.40.00 no DANFSe.

## Registro da execução

### Execução (03/11/2026)

**Fase 0 (Contenção):** 0.1 e 0.2 feitas de outro jeito, por decisão do usuário (ver as próprias tasks): a chave e o segredo do webhook do Preview foram trocados por valores aleatórios, e a chave do `api/.env` ficou comentada. 0.3 e 0.4 seguem com o usuário e a contadora.

**Fase 1 (API), branch `feat/031-api-emissao-so-em-producao`:**
- `invoicesEnabled()` exige `VERCEL_ENV=production` **e** `NOTAAS_API_KEY` (novo `isProductionDeploy()`), e `nfseEnvironment()` vem dele: o `NFSE_ENV` não é mais lido.
- Com a emissão desligada, além do `onOrderPaid`, do cron e das ações do painel, também o **estorno** (`onOrderRefunded`) e o **aviso do webhook** (`syncByProviderId`) deixam de chamar a Notaas. A spec só citava emissão e cancelamento pelo painel; o estorno cancela pela Notaas, e o webhook reconsulta, então os dois entraram na mesma regra (decisão 1: "nenhuma chamada à Notaas sai").
- As ações do painel respondem 409 com "Emissão de nota fiscal desligada neste ambiente." (`INVOICES_DISABLED_MESSAGE`).
- Log do boot no `onModuleInit`: "ligada (produção)", "desligada (VERCEL_ENV=…)" ou, em produção sem chave, "desligada (sem NOTAAS_API_KEY)", e o `warn` com chave fora da produção.
- `NFSE_NBS` obrigatório, com `^\d{9}$`; o `nfse-builder` manda `servico.nbs` sempre. `.env.example` com `NFSE_NBS=118064000` e sem `NFSE_ENV`; tabela de variáveis da Spec 024.2 atualizada.
- Os testes do `InvoicesService` passaram a rodar como produção (`VERCEL_ENV=production`, ambiente `producao`). O aviso de homologação no e-mail ficou coberto pelo reenvio de uma linha antiga.
- `npm test`: 90 suítes, 1329 testes. `npm run build` ok.

**Fase 2 (Front), branch `feat/031-front-painel-de-notas`:** no `nota-fiscal.ts`, com `enabled: false`, a linha mostra "Emissão desligada neste ambiente" no lugar de "Sem nota", e só ficam "Baixar PDF" e "Reenviar e-mail", que não chamam a Notaas. O selo "Homologação" continua só nas linhas com `environment = homologacao`. O aviso só aparece com a config carregada, para não piscar enquanto ela chega. `ng test`: 735 testes; `ng build` ok.

**Fase 3 (Preview e produção):**
- 3.1: release empurrada para a `preview`; deploy da API `delcastanher-id88sd8pz`, com o alias `api-preview.delcastanher.srv.br`.
- 3.2: no log do boot do preview, "Emissão de NFS-e desligada (VERCEL_ENV=preview)." e o `warn` da chave ignorada (a chave aleatória da Fase 0 ainda está lá). No Financeiro do preview, as duas linhas de R$ 989 mostram "Emissão desligada neste ambiente"; a nota do incidente segue "Processando · Homologação", sem o "Atualizar".
- 3.4: `NFSE_NBS=118064000` criado em Production (03/11, 11:49). A Vercel gravou a variável como **sensível**, então o valor não pode ser lido de volta; ele foi enviado sem quebra de linha. Ela só vale a partir do próximo deploy de produção, que vem com o merge; como a variável já existe, esse deploy não deixa nenhuma venda cair em `ERROR` por falta de NBS.
- 3.5: PR #62 aberto contra a `main`, com as decisões no topo. Sem merge.
