# Tasks: Spec 024.2 - NFS-e de Treinamento

Cada task diz **quem faz**:
- **Usuário:** contadora, Notaas, segredos.
- **Claude:** código, configuração e verificação.

No backend, a suíte vem **antes** da implementação (`.claude/RULES.md`). As decisões (N*) estão no `context.md`.

O código (Fase 2) não depende da contadora: sem `NFSE_CODIGO_SERVICO` e `NFSE_ALIQUOTA_ISS`, nenhuma nota sai (N2). O deploy e a primeira nota (Fase 3) esperam a Fase 1.

## Fase 1: Contadora e Notaas
- [ ] **Task 1.1 · Usuário:** (parcial, 2026-10-06: Simples Nacional ME, ISS 2%, ISSQN tributável, descrição, competência, estorno em 7 dias; faltam cTribNac, inscrição municipal, IBS/CBS, informações complementares, prazo de cancelamento e Mercado Pago) respostas da contadora às perguntas do `context.md`: regime, cTribNac, alíquota de ISS, inscrição municipal, PIS/COFINS, IBS/CBS, descrição e cancelamento.
- [ ] **Task 1.2 · Usuário:** (**regime: trocar "Não Optante" por Simples Nacional**) preencher no painel da Notaas (Configurações → Editar) o que a contadora definir:
  - regime tributário;
  - inscrição municipal;
  - PIS/COFINS;
  - cTribNac padrão;
  - IBS/CBS padrão.
- [ ] **Task 1.3 · Usuário:** decidir entre o plano Dev da Notaas (R$ 99/mês, com projeto de homologação) e o teste em produção com cancelamento (N4).
- [ ] **Task 1.4 · Usuário e Claude:** conferir com a Notaas (suporte ou sondagem). **Sondagem feita em 2026-10-06** (só leitura, com a chave de produção; resultado abaixo):
  - os escopos que a chave precisa além de `nfse:emit` (status, PDF, XML e cancelamento);
  - se um segundo `POST /emitir` com a mesma `referencia` é recusado (N3);
  - os eventos do webhook já cadastrado, que precisam ser os `nfse.*` (N1).

  Resultado:
  - **Escopos ok:** com só `nfse:emit`, as rotas de status, PDF, XML e cancelamento respondem 404 a uma nota inexistente, e não 403.
  - **Ids da Notaas são UUID.** Um id fora desse formato responde 500 ("invalid input syntax for type uuid"), e não 404.
  - **Webhook:** o endpoint `65f90fb1-…` já tem os eventos `nfse.*`, mas aponta para `https://delcastanher.srv.br/webhooks/notaas`, **sem o `api.`**. Esse host redireciona para o site, então nenhum aviso chega à API. A correção ficou com o usuário (Task 3.3).
  - **`referencia`:** não conferida. Exige emitir duas notas reais (fica para o suporte, ou para a Task 3.4).
  - **Cobertura:** Blumenau ativo, engine `snnfse`, "SNNFSE Nacional".
  - **`api/.env` local:** a chave tem um comentário na mesma linha (`ntaas_… # …`). O `dotenv` ignora o comentário, mas um script que lê a linha crua manda chave inválida (401). **Conferir que o valor na Vercel é só a chave.**
- [ ] **Task 1.5 · Usuário:** trocar a senha do certificado A1 e reenviá-lo com um nome de arquivo sem a senha. Hoje a senha aparece no nome do arquivo, na tela de Certificados.

- [x] **Task 1.6 · Claude:** lista de pendências para a contadora, em `pendencias-contabeis.md`.

## Fase 2: Código (TDD)
- [x] **Task 2.1:** Suíte e implementação de `invoice.config.ts` (N2, N4, N7 e N9):
  - `fiscalConfig` com as variáveis `NFSE_*`, obrigatórias e opcionais;
  - `nfseEnvironment` e `nfseCancelWindowHours`, sem o `tpAmb`.
- [x] **Task 2.2:** Suíte e implementação do `NfseBuilder` (N2): tomador por CPF ou CNPJ, endereço opcional, descrição com os módulos, valores, competência e `referencia`.
- [x] **Task 2.3:** Suíte e implementação do `NotaasClient` contra o servidor falso (N1, N5 e N6): rotas da NFS-e, leitura do status e redirecionamento sem a chave.
- [x] **Task 2.4:** `InvoicesService` (N4 e N8): ambiente pelo `ambiente`, e-mail da NFS-e e mensagens sem "NF-e".
- [x] **Task 2.5:** Webhook e `.env.example`: eventos `nfse.*` e a seção de variáveis nova.
- [x] **Task 2.6:** Painel financeiro (N10): textos da NFS-e, com as specs do componente.

## Fase 3: Deploy e primeira nota (com autorização do usuário)
- [ ] **Task 3.1 · Claude:** (`NFSE_ENV` criada em 2026-10-06, e em Production `NFSE_ALIQUOTA_ISS=2`, `NFSE_TRIB_ISSQN=1`, `NFSE_DESCRICAO`, `NFSE_CANCEL_WINDOW_HOURS=192` e `NFSE_CERT_EXPIRES_AT=2027-09-30`; falta `NFSE_CODIGO_SERVICO`, que liga a emissão, e remover `NFE_ENV` depois do deploy) na Vercel (`delcastanher-api`), criar `NFSE_ENV` (`producao` em Production, `homologacao` em Preview) e remover `NFE_ENV`. Junto, as variáveis fiscais da Task 1.1 em Production.
- [ ] **Task 3.2 · Claude:** PR da `release/024.2-nfse` para a `main`, e deploy.
- [ ] **Task 3.3 · Usuário:** corrigir a URL do webhook `65f90fb1-594e-46a0-8212-6e9c727a2377` para `https://api.delcastanher.srv.br/webhooks/notaas` (`PATCH /webhooks/endpoints/{id}` com `{ "url": … }`). Os eventos já estão certos. Webhook da Notaas com `nfse.issued`, `nfse.error`, `nfse.cancelled` e `nfse.documents_ready`, apontando para `https://api.delcastanher.srv.br/webhooks/notaas` (Task 1.4).
- [ ] **Task 3.4 · Usuário e Claude:** primeira venda real, de valor baixo, com estorno pelo painel do Mercado Pago, dentro dos 7 dias (N7). Substitui a Task 6.4 da Spec 024 no que é nota:
  - NFS-e autorizada, com número e código de verificação no painel;
  - e-mail com PDF e XML;
  - estorno, cancelamento e XML do cancelamento guardado.
- [x] **Task 3.5 · Claude:** atualizar a D1 da Spec 024 e a Política de Privacidade (rascunho da Task 3.5 da 024), onde dizem NF-e.

## Registro da execução (2026-10-06)

Branches `docs/024.2-spec` e `feat/024.2-codigo` (um commit por task), juntas na `release/024.2-nfse`.

- **Testes:** API com 1169 de 1170 passando. Front com 677 passando, `nest build` ok.
  - A falha é o `common/cache.http.spec.ts` ("o 404 também vai para o cache", que responde 500). Ela não vem desta spec, que não toca `common`, `legal` nem `courses`.
- **Sem migration.** A tabela `invoices` serve igual. Na NFS-e, `accessKey` guarda o `chNFSe`, e `series` e `protocol` ficam nulos. O `schema.prisma` só mudou nos comentários.
- **Decisões tomadas na execução:**
  1. **Colunas do CSV do financeiro:** "NF-e", "Serie NF-e" e "Chave de acesso" viraram "NFS-e" e "Codigo de verificacao". Nenhuma nota foi emitida até aqui, então a coluna de série sai sem perda.
  2. **`NFSE_CERT_EXPIRES_AT=2027-09-30`** no `.env.example`, que é o vencimento do certificado no painel da Notaas.
  3. **Documento com até 3 redirecionamentos** para o CDN, sempre sem o `x-api-key` (N6).
  4. **Documento do tomador:** aceito com pontuação, só os dígitos vão à Notaas. 11 dígitos vão como CPF, 14 como CNPJ, e qualquer outro tamanho vira `ERROR` sem chamar a Notaas.
- **Não verificado no navegador:** a única mudança visível é o "NFS-e nº", que só aparece numa nota com número, e ainda não existe nenhuma. Fica para a Task 3.4.
- **Em produção hoje:** `NOTAAS_API_KEY` já está em Production. Com o código atual (NF-e), uma venda gera nota em `ERROR` por falta de `NFE_NCM`, e a Notaas não é chamada. Com esta spec publicada, o comportamento é o mesmo até as variáveis `NFSE_*` da contadora chegarem à Vercel.
