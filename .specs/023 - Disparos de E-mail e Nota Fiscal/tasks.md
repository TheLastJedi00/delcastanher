# Tasks: Spec 023 - Disparos de E-mail e Nota Fiscal

Spec full-stack: `api/` (NestJS + Prisma + Jest) e `front/` (Angular standalone + signals + Tailwind), com configuração na Notaas (NF-e), no Resend, no DNS e na Vercel.
- No backend a suíte vem **antes** da implementação, conforme `.claude/RULES.md`.
- Valem o Design System da Spec 002 e os componentes de `front/src/app/shared/ui/`.
- As decisões referenciadas (A*, B* e C*) estão no `context.md`.

Ordem das fases:
1. Os dados fiscais e as contas vêm primeiro, porque sem eles nada emite nem envia.
2. O `MailService` vem antes da nota, porque a nota o usa (A8).
3. O vídeo (Fase 7) é independente e pode ir a qualquer momento.
4. Tudo o que toca produção (Fase 6) fica para depois do código pronto.
5. O certificado (Fase 8, Parte D) é independente; a migration dele vai ao banco antes do deploy da API.

## Fase 1: Pré-requisitos (usuário, contador e Notaas)
- [ ] **Task 1.1:** Com o contador, levantar e registrar aqui (Parte A, "Pré-requisitos fiscais"):
  - CNPJ, inscrição estadual, UF e regime (CRT);
  - NCM do livro digital;
  - CFOP interno e interestadual (consumidor final não contribuinte);
  - CSOSN ou CST da operação imune, e CST de PIS e COFINS;
  - se o item leva IBS e CBS em 2026, e com qual `cClassTrib`;
  - natureza da operação e texto de `infCpl` sobre a imunidade;
  - presença do comprador e indicador de intermediador;
  - série e último número de NF-e, se já emite;
  - o documento do **estorno depois de 24 horas** (A7);
  - como emitir a nota dos **pedidos já pagos sem endereço** (A3);
  - a **coerência** entre "livro digital" na nota e o que o checkout, os Termos de Uso e o Mercado Pago descrevem.
- [ ] **Task 1.2:** Decidir o remetente das campanhas e da nota: nome e endereço em `mail.delcastanher.srv.br` (B1).
- [ ] **Task 1.3:** O usuário compra o **certificado digital ICP-Brasil A1** do CNPJ e registra aqui a certificadora e o vencimento (A10).
- [ ] **Task 1.4:** O usuário cria a conta na Notaas com **dois projetos**, homologação e produção. Em cada um:
  - cadastra a empresa;
  - sobe o certificado A1;
  - configura a numeração da NF-e;
  - gera a chave de API.

  Registrar aqui o plano e se a Notaas avisa o vencimento do certificado (A10).
- [ ] **Task 1.5:** Perguntar ao suporte da Notaas e registrar aqui a resposta:
  - se há **chave de idempotência** ou referência externa na emissão de NF-e (A2);
  - se o status `error` deixa número reservado que precise de inutilização.
- [ ] **Task 1.6:** **Sondagem na homologação**, com a chave do projeto de homologação, por script local (`api/scripts/notaas-probe.ts`) que não toca o banco. Registrar aqui os resultados:
  1. emitir uma NF-e de livro digital com os dados da Task 1.1, destinatário CPF com endereço e pagamento PIX;
  2. acompanhar o status até `issued` e receber o webhook num endpoint de teste, conferindo a assinatura HMAC;
  3. baixar o DANFE e o XML;
  4. cancelar e baixar o XML do cancelamento;
  5. emitir uma com dado inválido e registrar como volta o `error`.

  O que a sondagem mostrar corrige o `context.md` antes da Fase 3.
- [ ] **Task 1.7:** O usuário cria a conta no Resend. Conferir se a supressão automática de rejeições e de reclamações vem ligada (B6).
- [ ] **Task 1.8:** Revisar com o contador a classificação da aplicação no painel do Mercado Pago (pendência da Spec 014).

## Fase 2: Backend - Dados e `MailService` (TDD)
- [x] **Task 2.1:** Migration com os campos e tabelas novos:
  - os campos do destinatário no `Order` (CPF, nome e endereço, A3);
  - `User.marketingOptOutAt`;
  - `Invoice`, `EmailCampaign` e `EmailDelivery`, com os enums.

  Gravar os dados do destinatário na criação do pedido, com o CEP, o número e o complemento no `create-order.dto.ts`, com teste de que o CPF não sai em log nem em resposta pública (A3).
- [x] **Task 2.2:** Suíte e implementação do `MailService`:
  - envio unitário e em lote de 100;
  - layout fixo em HTML e em texto;
  - corpo em texto simples escapado (B3);
  - cabeçalhos `List-Unsubscribe` só no e-mail de campanha (B5).
- [x] **Task 2.3:** Suíte e implementação do descadastro (B5):
  - token HMAC;
  - `POST /email/unsubscribe`, com token adulterado → `400`;
  - `marketingOptIn` no `PATCH /users/me`.
- [x] **Task 2.4:** Escrever o script de backfill do CPF e do nome dos pedidos pagos, lendo `payer.identification` no Mercado Pago com a conta da `mpConnectionId` (A3). **Não rodar** nesta fase.

## Fase 3: Backend - Nota Fiscal (TDD)
- [x] **Task 3.1:** Suíte e implementação do `NfeBuilder` (A1):
  - destinatário com CPF, nome e endereço, e `indicadorIE` 9;
  - um item por módulo;
  - CFOP interno ou interestadual pela UF;
  - CSOSN ou CST imune, PIS e COFINS;
  - pagamentos pelo método do pedido;
  - `infCpl`;
  - sem `dest.email`;
  - todo código fiscal vindo da configuração.
- [x] **Task 3.2:** Suíte e implementação do `NotaasClient`, contra um servidor HTTP falso (A1, A2 e A6):
  - `x-api-key`;
  - timeout de 10 s;
  - `202` com `invoiceId`, `400` sem exceção e timeout distinguível;
  - status, cancelamento, DANFE e XML.
- [x] **Task 3.3:** Suíte e implementação do `InvoicesService` (A2, A4, A5, A6, A7 e A8):
  - `providerInvoiceId` gravado no `202`;
  - `UNKNOWN` no timeout, sem reenvio automático;
  - tradução dos status e trava do `tpAmb`;
  - chave substituída se mudar (contingência);
  - XML e PDF no Storage, com a gravação pelo servidor nova no `StorageService`;
  - e-mail com os anexos, uma vez só;
  - cancelamento dentro de 24 horas, e `REFUND_PENDING` fora delas.
- [x] **Task 3.4:** Ligar a nota ao `OrdersService.apply`:
  - emitir depois do acesso;
  - cancelar ou marcar `REFUND_PENDING` depois da revogação.

  Testes de que a falha da nota não muda o pedido nem a resposta do webhook do Mercado Pago (A4 e A7).
- [x] **Task 3.5:** Webhook `POST /webhooks/notaas` (A5):
  - `rawBody: true` no `main.ts`;
  - HMAC do corpo bruto em tempo constante, `401` sem assinatura válida;
  - reconsulta sem confiar no corpo;
  - `invoiceId` desconhecido ignorado.
- [x] **Task 3.6:** Rota `/internal/invoices/reconcile` com `CRON_SECRET`, só do próprio ambiente, e a entrada no `api/vercel.json`. Ela cobre (A5 e A10):
  - reconsulta de `PROCESSING`;
  - reenvio só de `PENDING` sem `providerInvoiceId`;
  - XML e PDF que faltam;
  - aviso de vencimento do certificado.
- [x] **Task 3.7:** Rotas `/admin/invoices/:orderId/issue`, `/link`, `/cancel`, `/email` e `/pdf`, e a situação, o número, a série e a chave da nota na listagem e no CSV do financeiro (A9).
- [x] **Task 3.8:** Documentar as variáveis no `api/.env.example`.
- [x] **Task 3.9:** Rodar `npm test` no `api/` e corrigir regressões. O `orders.service.ts` é o coração do checkout (Specs 014, 019 e 020).

## Fase 4: Backend - Campanhas (TDD)
- [x] **Task 4.1:** Suíte dos segmentos (B2): cada regra, e a exclusão de bloqueados, descadastrados e administradores. Implementar `GET /admin/email/segments` com as contagens.
- [x] **Task 4.2:** Suíte do disparo (B4):
  - teste só para o admin logado, com `[TESTE]`;
  - campanha congelando os destinatários em `EmailDelivery`;
  - lotes de 100;
  - retomada que envia só as entregas sem `resendId`.
- [x] **Task 4.3:** Implementar as rotas `/admin/email/*`, com o guard de admin, e o histórico (B6).
- [x] **Task 4.4:** Rodar `npm test` no `api/`.

## Fase 5: Front
- [x] **Task 5.1:** Aba "Disparos de E-mail" real, sem o aviso de construção:
  - segmentos com contagem, assunto e corpo em formulário reativo;
  - "Enviar teste";
  - confirmação com o número de destinatários antes de "Disparar";
  - "Retomar envio" em campanha parcial;
  - histórico.
- [x] **Task 5.2:** Checkout: CEP, número e complemento no formulário reativo do pagamento (A3):
  - o ViaCEP preenche logradouro, bairro, cidade, UF e código IBGE, e o comprador pode corrigir logradouro e bairro;
  - um CEP inexistente bloqueia o envio com mensagem clara;
  - os dados seguem no pedido.
- [x] **Task 5.3:** Listagem do financeiro (A9 e A10):
  - selo da situação da nota, e de homologação (A6);
  - número;
  - as ações "Emitir de novo", "Vincular nota", "Cancelar", "Reenviar e-mail" e "Baixar PDF", conforme o status;
  - destaque para `UNKNOWN` e `REFUND_PENDING`;
  - aviso do vencimento do certificado quando faltar 30 dias ou menos.
- [x] **Task 5.4:** Página pública `/descadastro`, que só descadastra no clique, e o interruptor "Receber novidades por e-mail" no perfil do aluno (B5).
- [x] **Task 5.5:** Specs dos itens acima, depois `ng test` e `ng build`.

## Fase 6: Produção (com autorização do usuário)
- [ ] **Task 6.1:** Verificar `mail.delcastanher.srv.br` no Resend: criar os registros SPF, DKIM e DMARC no DNS, com autorização, e registrar aqui quando o domínio ficar verificado.
- [ ] **Task 6.2:** Subir as variáveis na Vercel do `delcastanher-api`:
  - As de config sobem pelo Claude.
  - Os segredos sobem pelo usuário: `NOTAAS_API_KEY` e `NOTAAS_WEBHOOK_SECRET` (os de **produção** só em Production, e os de **homologação** em Preview e Development), `RESEND_API_KEY` e `EMAIL_UNSUBSCRIBE_SECRET`.
  - `NFE_ENV=producao` vai **só** em Production (A6).
- [ ] **Task 6.3:** Cadastrar o webhook de NF-e em cada projeto da Notaas, apontando para `/webhooks/notaas` com o secret (A5).
- [ ] **Task 6.4:** Aplicar a migration no banco (o banco é o de produção) e, **com autorização**, rodar o backfill do CPF (A3).
- [ ] **Task 6.5:** No preview, fazer uma compra de teste com endereço e conferir a nota de homologação autorizada, o selo no painel e o e-mail com o DANFE e o XML.
- [ ] **Task 6.6:** Em produção, com a primeira venda real depois do deploy, conferir a NF-e autorizada na consulta pública da Sefaz, os anexos e o e-mail. Os pedidos já pagos antes da spec seguem o que o contador definiu na Task 1.1.
- [ ] **Task 6.7:** Testar o cancelamento: estornar um pedido de teste dentro de 24 horas e ver a nota `CANCELLED`.
- [ ] **Task 6.8:** Mandar um teste de campanha para caixas no Gmail e no Outlook. Conferir que caem na entrada, com SPF, DKIM e DMARC válidos nos cabeçalhos, e que o "Cancelar inscrição" nativo do Gmail descadastra.
- [ ] **Task 6.9:** Conferir se a Política de Privacidade cita a nota fiscal como finalidade do CPF e do endereço (A3) e o e-mail de novidades com oposição (B5). Se não citar, ajustar o texto.

## Fase 7: Vídeo de Apresentação na Landing (Parte C)
- [ ] **Task 7.1:** Com o usuário, decidir o canal e a visibilidade (C1). O usuário sobe a "Chamada módulo 1", confere a legenda no Studio e passa o `id` e a data do upload. Registrar aqui.
- [x] **Task 7.2:** Extrair um quadro como pôster (1024×576) para `front/public/assets/` e registrar de que segundo ele saiu (C4).
- [x] **Task 7.3:** Tirar a regra do YouTube de `media-card.ts` para `shared/ui/`, com a suíte do card passando sem mudança. Criar o `ui-youtube-facade` (C2 e C3).
- [x] **Task 7.4:** Seção "Conheça a Imersão" entre a hero e "A Mentora", em `@if` pela constante do `id`, e o `VideoObject` no `personSchema()` (C5 e C6).
- [x] **Task 7.5:** Specs:
  - pôster sem `<iframe>` antes do clique;
  - clique com o `<iframe>` certo;
  - `id` inválido sem botão;
  - seção ausente com a constante vazia;
  - `VideoObject` no JSON-LD.

  Rodar `ng test` e `ng build`, e conferir o HTML pré-renderizado sem `<iframe>`.
- [ ] **Task 7.6:** Em produção:
  - tocar no Chrome, no Safari do iPhone e no Android;
  - conferir na aba de rede que nada vai ao YouTube antes do clique;
  - registrar se aparece anúncio;
  - validar no Rich Results Test.

## Fase 8: Novo modelo de certificado (Parte D)
- [x] **Task 8.1:** Migration `Module.workloadHours` (D2). Suíte e implementação, com TDD:
  - o diploma de módulo traz a carga e o resumo do próprio módulo;
  - nulo não herda a carga do curso;
  - o diploma do curso traz a carga do curso e o resumo nulo;
  - a verificação pública usa a mesma carga;
  - `PATCH /admin/modules/:moduleId/workload` aceita de 1 a 999 ou nulo, recusa campo a mais e o papel aluno.
- [x] **Task 8.2:** Botão "Carga horária" no painel de aulas, ao lado de "Preço", com o rótulo na linha do módulo (D2).
- [x] **Task 8.3:** Modelo `ui-certificado` em `shared/ui/certificado/`, com entradas, escala por `cqw`, código, hash, rubrica pendente e data por extenso (D1, D3, D4 e D5).
- [x] **Task 8.4:** Ligar o modelo:
  - em `/ava/certificado` (curso);
  - na página nova `/ava/certificado/modulo/:moduleId`;
  - no botão "Ver diploma do módulo" da trilha (D1).
- [x] **Task 8.5:** Specs do modelo, da página de módulo, da trilha e do painel. Rodar `npm test` no `api/`, `ng test` e `ng build`.
- [x] **Task 8.6:** Aplicar a migration `20261005120000_carga_horaria_do_modulo` no Neon (o banco é o de produção), **com autorização**, **antes** do deploy da API. A API nova seleciona a coluna, e sem ela as rotas de certificado falham.
  - **Aplicada em 2026-10-05, com autorização do usuário** (`prisma migrate deploy`; `migrate status`: "Database schema is up to date"). Só adição: a coluna nasce nula em todos os módulos ("a definir"), e a API publicada, que não a lê, segue funcionando.
- [ ] **Task 8.7:** Preencher a carga horária de cada módulo no painel.
- [ ] **Task 8.8:** Em produção:
  - conferir o diploma do curso e o de um módulo na tela;
  - imprimir em "Salvar como PDF" e conferir uma página só, com o gradiente.

## Registro da execução (2026-10-02)

Branches `feat/023-dados-e-mail-service`, `feat/023-nota-fiscal`, `feat/023-campanhas`, `feat/023-front` e `feat/023-video-landing`, reunidas em `release/023-disparos-email-nota-fiscal`.

- API: 1121 testes passando, `nest build` ok e a aplicação sobe com as rotas novas.
- Front: 640 testes passando, `ng build` ok e o `index.html` pré-renderizado sem `<iframe>`.
- **Migration `20261002120000_nota_fiscal_e_disparos` aplicada no Neon em 2026-10-02**, com autorização do usuário. Só adição (colunas nulas e tabelas novas); o site publicado segue funcionando com ela. A parte de migration da Task 6.4 está feita; o **backfill do CPF não foi rodado**.
- Verificação no Chrome (localhost:4200 e :3000, sem chaves do Resend e da Notaas):
  - `/descadastro` não descadastra ao abrir; o botão descadastra; o link adulterado mostra "Link inválido";
  - o `POST` de um clique (`List-Unsubscribe=One-Click`) responde 200 e o sem token, 400;
  - a aba de disparos mostra os segmentos com a contagem real (5 alunos ativos), valida assunto e corpo, o teste mostra "RESEND_API_KEY nao configurada." e a confirmação diz "5 pessoa(s)". **Nenhuma campanha foi disparada**;
  - o financeiro mostra a coluna "Nota fiscal" ("Sem nota", sem ações com a emissão desligada);
  - o perfil do admin não mostra o interruptor de novidades;
  - o ViaCEP responde ao navegador em `localhost` sem bloqueio de CORS.

### Decisões tomadas na execução
1. **Campos da Notaas conferidos na documentação (2026-10-02):** o array de itens é `items` (e não "itens"), o destinatário é `dest` com `endereco.codigoMunicipio` numérico, e o status traz `dataRecebimento` e `cancelledAt`.
2. **Assinatura do webhook:** a documentação de NF-e mostra o HMAC em hex puro; a spec dizia `sha256=` + hex. A rota aceita os dois.
3. **`POST /admin/invoices/:orderId/sync` ("Atualizar situação")**, rota nova: o cron só roda em produção e o webhook do projeto de homologação não alcança a API publicada (a assinatura é de outro secret). Sem ela, a nota de homologação do preview (Task 6.5) ficaria parada.
4. **`GET /admin/invoices/config`**, rota nova: ambiente, prazo de cancelamento e vencimento do certificado para o painel (A6, A7 e A10).
5. **Emissão desligada sem `NOTAAS_API_KEY`:** nenhuma nota é criada (desenvolvimento local, por exemplo). O pedido pago sem nota ganha "Emitir nota" no painel.
6. **Variáveis novas:** `API_PUBLIC_URL` (o `List-Unsubscribe` de um clique aponta para a API) e `NFE_IBSCBS_CST` + `NFE_IBSCBS_CCLASSTRIB` (o grupo IBS/CBS só entra com os dois). Documentadas no `api/.env.example`.
7. **Cancelamento confirmado pela reconsulta:** a nota fica em `CANCELLING` até a Notaas devolver `cancelled`; o cron também reconsulta `CANCELLING`.
8. **Estorno com a nota ainda processando:** quando ela autoriza depois do estorno, é cancelada na hora, sem e-mail.
9. **`rawBody: true`** já existia no `main.ts` desde a Spec 010; só o comentário mudou.
10. **Resend por `fetch`**, sem o SDK: são duas rotas (`/emails` e `/emails/batch`), no mesmo padrão do Mercado Pago. Cada lote leva uma chave de idempotência derivada das entregas dele.
11. **Políticas (Task 6.9):** desde a Spec 022 o texto é publicado pelo painel. A finalidade do CPF e do endereço (nota fiscal) e o e-mail de novidades com oposição são ajuste de texto no painel, e não código.
12. **Vídeo (Parte C):** a constante do id em `landing.ts` está vazia. A seção e o `VideoObject` só aparecem com ela preenchida (Task 7.1).

### Pendências
- Tasks 1.1 a 1.8 (contador, certificado, contas na Notaas e no Resend).
- Task 6.2 (o usuário sobe as variáveis), 6.1, 6.3 e 6.5 a 6.9.
- Task 6.4: rodar `npm run spec023:backfill-cpf` primeiro em leitura e, com autorização, com `-- --apply`.
- Task 7.1: preencher `PRESENTATION` em `front/src/app/features/landing/landing.ts` com o id e a data do upload.
