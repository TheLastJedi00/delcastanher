# Spec 031: Nota Fiscal Só em Produção

**Projeto:** Plataforma E-learning "Imersão RH Estratégico"
**Baseada em:** Spec 023 (Nota Fiscal), Spec 024.2 (NFS-e de Treinamento), Spec 029 (Ambiente de Preview) e Spec 030 (Módulo de Teste de Pagamento)
**Escopo técnico:** `api/` (NestJS + Jest), um ajuste pequeno no `front/` (painel de notas) e configuração da Vercel. Sem schema e sem migration. O backend é escrito com TDD: a suíte vem antes da implementação (`.claude/RULES.md`).

## Objetivo
Garantir que **só o deploy de produção** emita NFS-e. O preview, o ambiente local e qualquer outro ambiente nunca chamam a Notaas para emitir, mesmo que a chave da API esteja configurada lá por engano.

## O incidente (apurado em 02/11/2026)

- Em 22/10/2026, uma compra de teste do pacote (R$ 989,00), feita no **preview** com cartão de teste do sandbox do Mercado Pago, gerou uma **NFS-e real** em nome de Leno Borges (CPF 023…-25). Ela aparece no portal da NFS-e da empresa (CNPJ 58.216.042/0001-44) ao lado das vendas reais.
- No Financeiro do preview, essa nota aparece como "PROCESSANDO · HOMOLOGAÇÃO". Para a plataforma, era uma nota de teste.
- A venda não existe: não há pedido de R$ 989 no banco de produção. Já se passaram mais de 8 dias da emissão, que é o prazo de cancelamento direto em Blumenau (Spec 024.2, resposta 10b). O cancelamento fica com a contadora.
- O cruzamento das compras concluídas em produção com as notas emitidas bate: as 5 notas autorizadas no banco de produção são de pedidos realmente pagos, e nenhum pedido recusado, cancelado ou expirado tem nota. A única nota indevida é a do preview.

## Causa

1. **O `NFSE_ENV` não chega à Notaas.** Ele só decide o rótulo gravado em `Invoice.environment` (`nfseEnvironment()`, em `api/src/config/invoice.config.ts`). O corpo do `POST /emitir` não leva ambiente nenhum: **quem decide se a nota é real é a chave da API**.
2. **A emissão liga só com a chave.** O `invoicesEnabled()` devolve `true` sempre que existe `NOTAAS_API_KEY`. O comentário diz "no preview nenhuma nota é criada", mas isso só vale se a chave não estiver lá.
3. **O Preview da Vercel tem a `NOTAAS_API_KEY`** desde a Spec 024.2, e ela emite em produção. O `api/.env` local também tem a chave.
4. **A trava da decisão N4 chega tarde e não roda no preview.** O `refresh()` compara o ambiente que a Notaas devolve com o esperado e marca `ERROR`. Mas isso só acontece **depois** da emissão, e no preview nem acontece: o webhook da Notaas aponta para a API de produção, e o cron de reconciliação só roda em produção. Por isso a nota do preview ficou parada em `PROCESSING`.

## Escopo

- **API:** a emissão só liga no deploy de produção, com a chave. O ambiente da nota passa a vir do deploy, e não de uma variável solta.
- **API:** um log no boot diz se a emissão está ligada ou desligada e por quê. Um aviso aparece quando há chave fora da produção.
- **Front:** o painel de notas, com a emissão desligada, mostra "Emissão desligada neste ambiente", e não o selo "Homologação".
- **Vercel e `.env`:** sair a `NOTAAS_API_KEY` e as `NFSE_*` do Preview, e a `NOTAAS_API_KEY` do `api/.env`.
- **Contadora:** o PDF das compras concluídas em produção (gerado em 02/11/2026) e o pedido de cancelamento da nota de R$ 989.
- **NBS na nota fiscal (adendo de 03/11/2026):** toda NFS-e passa a sair com o NBS **1.1806.40.00**, sugerido pela contadora. O `NFSE_NBS` deixa de ser opcional (decisão 7).

## Fora de escopo

- **Emitir nota de homologação de verdade.** A Notaas não recebe o ambiente pelo corpo da emissão, e o projeto não tem uma chave de homologação comprovada. Se for preciso testar a emissão de novo, isso vira uma spec própria, com uma chave de homologação confirmada pela Notaas.
- **Cancelar a nota de R$ 989 pela plataforma.** Está fora do prazo de Blumenau, e o pedido nem existe no banco de produção. Fica com a contadora.
- **A nota de R$ 1,00 de 06/10/2026.** Foi uma venda real, paga e não estornada (teste da 024.2). Ela fica como está.
- **Mudança de schema.** A coluna `Invoice.environment` continua, para as linhas antigas e para o painel.

## Decisões técnicas desta spec

1. **Emissão só no deploy de produção.**
   `invoicesEnabled()` passa a exigir `VERCEL_ENV === 'production'` **e** `NOTAAS_API_KEY`. Em qualquer outro caso (`preview`, `development`, ou sem `VERCEL_ENV`, como no ambiente local), a emissão fica desligada. Com ela desligada:
   - o `onOrderPaid` não cria a linha da nota, e a venda segue normal (como hoje sem chave);
   - o cron de reconciliação não faz nada;
   - as ações do painel ("Emitir de novo", cancelar, sincronizar) respondem 409 com "Emissão de nota fiscal desligada neste ambiente.";
   - nenhuma chamada à Notaas sai, nem de emissão, nem de cancelamento.

2. **O ambiente vem do deploy.**
   `nfseEnvironment()` devolve `producao` quando a emissão está ligada, e `homologacao` quando não está (só para o rótulo de linhas antigas e do painel). A variável `NFSE_ENV` deixa de ser lida e sai da Vercel (Production e Preview). É uma variável a menos para esquecer, e era ela que dava a falsa sensação de "modo de teste".

3. **A trava da decisão N4 continua.**
   O `refresh()` segue comparando o ambiente devolvido pela Notaas com o da linha, como segunda trava. Ela só deixa de ser a única.

4. **Log e aviso no boot.**
   Ao subir, o `InvoicesService` registra uma linha só, sem a chave:
   - `Emissão de NFS-e ligada (produção).`
   - `Emissão de NFS-e desligada (VERCEL_ENV=preview).`
   - Com chave fora da produção: um `warn` dizendo "NOTAAS_API_KEY configurada fora da produção: ignorada. Remova a variável deste ambiente."

5. **Painel.**
   O `GET /admin/invoices/config` já devolve `enabled`. Com `enabled: false`, o painel de notas mostra "Emissão desligada neste ambiente" e esconde as ações que chamam a Notaas. O selo "Homologação" continua só nas linhas antigas cuja `environment` é `homologacao`.

6. **Preview com nota em `PROCESSING`.**
   A linha da nota de R$ 989 no banco `preview` fica como está. Com a emissão desligada, nada mais a toca. Ela serve de registro do incidente.

7. **NBS obrigatório na NFS-e (adendo de 03/11/2026).**
   Na Spec 024.2 (`pendencias-contabeis.md`, resposta 7), o NBS ficou vazio, como na NFS-e que a empresa emitiu em 09/2026. Agora a contadora sugeriu o NBS **1.1806.40.00**, e toda nota deve sair com ele.
   - **As notas já emitidas pela plataforma saíram com o NBS vazio** (confirmado pelo usuário em 03/11/2026): as 5 autorizadas de produção e a nota indevida do preview. Esta spec não mexe nelas. Se precisam de nota substituta ou ficam como estão, é a contadora quem decide (Task 0.4). A plataforma não emite nota substituta: se for preciso, isso vira uma spec própria ou é feito no portal.
   - O valor continua fora do código (Spec 023, decisão A1): vem do `NFSE_NBS`, gravado **sem pontos**, com 9 dígitos: `118064000`.
   - No `fiscalConfig()`, o `NFSE_NBS` passa de `optionalEnv` para `requiredEnv`, com a validação `^\d{9}$`, como o `NFSE_CODIGO_SERVICO`. Sem ele, ou com outro formato, a nota vai para `ERROR` com o nome da variável e a Notaas nem é chamada. Assim, nenhuma nota sai sem NBS.
   - O `FiscalConfig.nbs` passa a ser `string`, e o `nfse-builder` manda `servico.nbs` sempre.
   - O `NFSE_NBS=118064000` é variável de configuração: o Claude sobe só em **Production** da `delcastanher-api` (o Preview fica sem `NFSE_*`, Task 0.1) e faz o redeploy com o merge. A variável sobe **antes** do merge, para nenhuma venda cair em `ERROR` no meio.

## Critérios de aceite

- Com `VERCEL_ENV=preview` e `NOTAAS_API_KEY` configurada, um pedido aprovado **não** cria nota nem chama a Notaas. O log mostra o aviso da decisão 4.
- Sem `VERCEL_ENV` (ambiente local), com a chave, o mesmo.
- Com `VERCEL_ENV=production` e a chave, a emissão segue igual a hoje, com `environment = producao`.
- O `NFSE_ENV` não muda nada em nenhum ambiente.
- No Financeiro do preview, o painel de notas mostra "Emissão desligada neste ambiente".
- A Vercel não tem mais `NOTAAS_API_KEY` nem `NFSE_*` no Preview, nem `NFSE_ENV` em Production. O `api/.env` não tem a `NOTAAS_API_KEY`.
- Uma compra de teste no preview, depois do deploy, não aparece no portal da NFS-e.
- Toda NFS-e emitida sai com o NBS 1.1806.40.00 (`118064000`). Sem o `NFSE_NBS`, ou com formato inválido, a nota vai para `ERROR` com o nome da variável, sem chamar a Notaas.
