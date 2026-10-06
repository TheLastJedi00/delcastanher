# Spec 024.2: NFS-e de Treinamento

**Projeto:** Plataforma E-learning "Imersão RH Estratégico"
**Baseada em:**
- Spec 023 (Disparos de E-mail e Nota Fiscal), Parte A
- Spec 024 (Prontidão para o Lançamento), decisão D1
- Sugestão da contadora em 2026-10-06: **NFS-e de treinamentos educacionais**
- Documentação da Notaas (`docs.notaas.com.br`) e painel da conta, conferidos em 2026-10-06

**Escopo técnico:** só API (`api/src/invoices/` e `api/src/config/invoice.config.ts`) e textos do painel financeiro (`front/.../financeiro/nota-fiscal.ts`). Sem migration: a tabela `invoices` serve igual.

## Objetivo
Trocar o documento da nota fiscal de **NF-e (modelo 55) de livro digital** para **NFS-e de treinamento**, emitida pela Notaas no **Sistema Nacional da NFS-e** (SNNFSE).

A troca muda o documento, mas não o fluxo da Spec 023:
- a nota nasce na aprovação do pedido;
- é cancelada no estorno;
- vai ao comprador pelo nosso e-mail;
- fica no painel com as mesmas ações.

Muda o que vai na chamada e o que volta dela.

## Por que a troca
A Spec 023 (Parte A) seguiu o contador de 2026-09-29: NF-e de livro digital, com imunidade de ICMS. Ela própria registrou o ponto fraco: a plataforma entrega **aulas em vídeo, materiais e certificado**, e não um livro. Um documento fiscal que descreve outra coisa é risco numa fiscalização.

**A contadora sugeriu em 2026-10-06 a NFS-e de treinamentos educacionais.** O que se vende passa a ser descrito como é: um serviço de treinamento. A decisão tributária é da contabilidade, e a spec a segue.

## O que a Notaas já tem (painel, 2026-10-06)
- Conta no plano **Free** (50 notas por mês, **um projeto só**). O projeto "Projeto Padrão" está em **Produção**.
- Empresa: Delcastanher Servicos Administrativos e Treinamentos, CNPJ 58.216.042/0001-44, em Blumenau/SC (IBGE 4202404).
- **Blumenau é aderente ao Sistema Nacional da NFS-e**, e a Notaas já habilitou a emissão por ele.
- Certificado A1 ativo, válido até **30/09/2027**.
- Chave de API "Delcastanher Prod", com o escopo `nfse:emit`, já em `NOTAAS_API_KEY` na Vercel (Production).
- **Faltam os dados da contadora** (Task 1.1):
  - regime tributário (hoje "Não Optante", ou seja, regime normal);
  - código de tributação (cTribNac);
  - inscrição municipal;
  - PIS/COFINS;
  - IBS/CBS.

## Decisões

**N1. NFS-e pelo `POST /emitir` da Notaas, atrás da mesma `InvoiceGateway`.**
- O `NfeBuilder` vira `NfseBuilder` (`notaas/nfse-builder.ts`), e o `NotaasClient` troca de rotas. O `InvoicesService` continua falando só com a interface (Spec 023, A1).
- As rotas, todas sob `https://platform.notaas.com.br/api/v1` com `x-api-key`:

| Ação | Rota | Observação |
|---|---|---|
| Emitir | `POST /emitir` | `202` com `invoiceId` (assíncrono) |
| Status | `GET /invoices/{id}/status` | `queued`, `processing`, `issued`, `error` e `cancelled` |
| Cancelar | `POST /cancelar` `{ invoiceId, motivo }` | `motivo` opcional, até 255 caracteres |
| PDF (DANFSe) | `GET /invoices/{id}/pdf` | `302` para o CDN quando já está em cache |
| XML | `GET /invoices/{id}/xml[?type=cancel]` | idem |
| Webhook | `POST /webhooks/endpoints` | eventos `nfse.issued`, `nfse.error`, `nfse.cancelled` e `nfse.documents_ready` |

**N2. Uma NFS-e por pedido, com um serviço só.**

| Campo | Valor |
|---|---|
| `tomador` | `cpf` (ou `cnpj`, se o documento tiver 14 dígitos) e `nome`, os dois obrigatórios |
| `tomador.endereco` | só se o pedido tiver o endereço completo |
| `tomador.email` | **não vai**: o e-mail da nota é nosso (Spec 023, A8), e a Notaas mandaria um segundo |
| `servico.descricao` | `NFSE_DESCRICAO` seguida dos títulos dos módulos do pedido |
| `servico.codigo` | `NFSE_CODIGO_SERVICO` (cTribNac, 6 dígitos) |
| `servico.nbs` | `NFSE_NBS`, quando definido |
| `servico.informacoesComplementares` | `NFSE_INFORMACOES_COMPLEMENTARES`, quando definido |
| `valores.total` | valor do pedido, em reais com duas casas |
| `valores.aliquotaIss` | `NFSE_ALIQUOTA_ISS` |
| `valores.tribISSQN` | `NFSE_TRIB_ISSQN`, quando definido (senão vale o padrão do projeto) |
| `valores.ibscbs` | só com `NFSE_IBSCBS_*` definidos, e então com `consumidorFinal: true` |
| `competencia` | mês do pagamento (`paidAt`) no fuso de São Paulo |
| `referencia` | id do pedido |

- **Sem código fiscal no código** (Spec 023, A1): tudo vem da configuração.
- **`NFSE_CODIGO_SERVICO` e `NFSE_ALIQUOTA_ISS` são obrigatórios na nossa configuração**, embora a Notaas aceite omitir o código e usar o padrão do projeto. Assim **nenhuma nota sai antes de a contadora definir os dois**. Sem eles, a nota vai para `ERROR` sem chamar a Notaas, e o pagamento segue igual.
- **O endereço deixa de ser obrigatório.** A NFS-e só exige documento e nome do tomador. O checkout continua coletando o endereço (Spec 023, A3), que vai na nota quando completo. Pedido sem endereço, como os anteriores à Spec 023, passa a ter nota.

**N3. `referencia` vai sempre, mas o `UNKNOWN` continua (Spec 023, A2).** A Notaas aceita um identificador nosso na emissão (`referencia`), e mandamos o id do pedido. A documentação, porém, **não diz que ele impede uma segunda nota**. Até a sondagem provar que um segundo `POST` com a mesma `referencia` é recusado (Task 1.4), a regra de A2 fica: a chamada sem resposta vai para `UNKNOWN`, e nada a reenvia sozinho. Se a sondagem provar, uma spec futura simplifica o `UNKNOWN`.

**N4. Ambiente conferido pelo `ambiente` da consulta (substitui o `tpAmb` de A6).**
- O status da NFS-e devolve `ambiente`, `"producao"` ou `"homologacao"`, quando a nota sai.
- Ele precisa bater com o ambiente em que a nota nasceu (`NFSE_ENV`). Se não bater, a nota vai para `ERROR` com "chave de API do ambiente errado", e nada é guardado nem enviado. É a mesma regra da Spec 023 com outro campo.
- **A conta tem um projeto só, em Produção.** Por isso não há chave de homologação: o Preview fica **sem `NOTAAS_API_KEY`**, com a emissão desligada. O teste é feito em produção, com uma venda real de valor baixo e o cancelamento logo depois (Task 3.4). Ter homologação exige o plano Dev (R$ 99/mês, até 3 projetos), que é decisão do usuário (Task 1.3).

**N5. A consulta traduzida para os nossos campos.**

| Notaas (status) | `Invoice` |
|---|---|
| `numeroNfe` (ou `nNFSe`) | `number` |
| `chNFSe` | `accessKey` |
| `emittedAt` (ou `issuedAt`) | `issuedAt` |
| `cancelledAt` | `cancelledAt` |
| `errorCode`, `errorMessage` e `errors[]` | `lastError`, crus |
| — | `series` e `protocol` ficam nulos: a NFS-e não tem |

A documentação usa os dois nomes para número e data (`numeroNfe`/`nNFSe` e `emittedAt`/`issuedAt`). O cliente lê os dois.

**N6. Documentos sem vazar a chave para o CDN.** PDF e XML podem responder `302` para o CDN público da Notaas. O cliente segue o redirecionamento **sem** o `x-api-key`: a chave só vai à API.

**N7. Cancelamento.**
- O prazo continua configurável (`NFSE_CANCEL_WINDOW_HOURS`, padrão 24 horas). Fora dele, o estorno vira `REFUND_PENDING` (Spec 023, A7).
- **A contadora confirma** o prazo e o que se faz fora dele (Task 1.1). No Sistema Nacional, o cancelamento depois do prazo do município vira pedido de análise fiscal, que a Notaas não expõe na API.
- Uma recusa da Notaas que fale em prazo também vira `REFUND_PENDING`, e as outras viram `CANCEL_ERROR`, como hoje.

**N8. E-mail ao comprador.** Mesmo fluxo (Spec 023, A8), com o texto da NFS-e:
- "NFS-e nº", e o "código de verificação" no lugar da chave de acesso;
- PDF (DANFSe) e XML em anexo, como `nfse-<chave>.pdf` e `nfse-<chave>.xml`;
- consulta pública em `https://www.nfse.gov.br/consultapublica`.

**N9. Variáveis renomeadas de `NFE_*` para `NFSE_*`.** Nenhuma variável fiscal `NFE_*` chegou à Vercel. A única que existe é `NFE_ENV` (Production e Preview), que vira `NFSE_ENV` no deploy (Task 3.1). As outras saem do `.env.example`, porque a NFS-e não as usa:
- `NFE_NATUREZA_OPERACAO`, `NFE_NCM` e `NFE_CFOP_*`;
- `NFE_CSOSN`, `NFE_CST` e `NFE_CST_PIS`/`NFE_CST_COFINS` (PIS/COFINS ficam no projeto da Notaas);
- `NFE_PRESENCA_COMPRADOR`, `NFE_INDICADOR_INTERMEDIADOR`, `NFE_INF_CPL` e `NFE_EMITENTE_UF`.

| Variável | Tipo | Obrigatória | O que é |
|---|---|---|---|
| `NFSE_ENV` | config | não | `producao` só em Production; o resto é homologação |
| `NFSE_CODIGO_SERVICO` | fiscal | sim | cTribNac, 6 dígitos (ex.: `080201`, a confirmar) |
| `NFSE_ALIQUOTA_ISS` | fiscal | sim | alíquota de ISS em % (ex.: `2`) |
| `NFSE_DESCRICAO` | fiscal | sim | início da descrição do serviço |
| `NFSE_TRIB_ISSQN` | fiscal | não | 1 tributável, 2 imune, 3 exportação, 4 não incidência |
| `NFSE_NBS` | fiscal | não | NBS, 9 dígitos |
| `NFSE_INFORMACOES_COMPLEMENTARES` | fiscal | não | texto livre no DANFSe |
| `NFSE_IBSCBS_CST`, `NFSE_IBSCBS_CCLASSTRIB` e `NFSE_IBSCBS_INDOP` | fiscal | não | grupo IBS/CBS |
| `NFSE_CANCEL_WINDOW_HOURS` | config | não | padrão 24 |
| `NFSE_CERT_EXPIRES_AT` | config | não | `2027-09-30`; a Notaas também avisa |

**N10. Painel.** Só textos: "NFS-e nº 123" no lugar de "NF-e 123 · série 1", o modal de cancelamento sem "Sefaz", e o aviso de duplicidade em "duas NFS-e".

## Perguntas para a contadora (Task 1.1)
1. **Regime tributário:** a empresa é do regime normal ("Não Optante", como está na Notaas) ou do Simples Nacional? Muda PIS/COFINS e a forma do ISS.
2. **Código do serviço:** o item é o **8.02** da LC 116 ("instrução, treinamento, orientação pedagógica e educacional, avaliação de conhecimentos de qualquer natureza"), ou seja, cTribNac **080201**?
3. **Alíquota de ISS** em Blumenau para esse código.
4. **Inscrição municipal** da empresa em Blumenau, se houver.
5. **PIS/COFINS:** CST e alíquotas, se for regime normal.
6. **IBS/CBS:** CST, classificação tributária (cClassTrib), indicador de operação e NBS.
7. **Descrição do serviço** na nota (sugestão: "Treinamento educacional on-line Imersão RH Estratégico").
8. **Cancelamento:** prazo no Sistema Nacional e o que fazer no estorno fora dele.
9. Se a classificação do Mercado Pago e os Termos de Uso precisam passar a dizer "treinamento".

## Fora de escopo
- Simplificar o `UNKNOWN` com a `referencia` (depende da sondagem).
- Emissão em lote (`/emitir/batch`).
- O documento do estorno fora do prazo: segue manual, como na Spec 023.
- Tirar a coleta de endereço do checkout.
