# Tasks: Spec 023 - Disparos de E-mail e Nota Fiscal

Spec full-stack: `api/` (NestJS + Prisma + Jest) e `front/` (Angular standalone + signals + Tailwind), com integração direta à API da Sefin Nacional e configuração no Resend, no DNS e na Vercel.
- No backend a suíte vem **antes** da implementação, conforme `.claude/RULES.md`.
- Valem o Design System da Spec 002 e os componentes de `front/src/app/shared/ui/`.
- As decisões referenciadas (A*, B* e C*) estão no `context.md`.

Ordem das fases:
1. Os dados fiscais e as contas vêm primeiro, porque sem eles nada emite nem envia.
2. O `MailService` vem antes da nota, porque a nota o usa (A8).
3. O vídeo (Fase 7) é independente e pode ir a qualquer momento.
4. Tudo o que toca produção (Fase 6) fica para depois do código pronto.

## Fase 1: Pré-requisitos (usuário e contabilidade)
- [ ] **Task 1.1:** Com a contabilidade, levantar e registrar aqui:
  - CNPJ, inscrição municipal e código IBGE do município;
  - regime e opção pelo Simples;
  - código de tributação nacional do ISS e alíquota;
  - se a DPS precisa do grupo de IBS e CBS, e com que valores;
  - descrição padrão do serviço;
  - **se o município emite pela Sefin Nacional** e aceita emissão por API.

  Se o município não estiver na Sefin Nacional, a spec troca para a alternativa da Focus NFe antes da Fase 3 (Parte A, "Por que a Sefin Nacional").
- [ ] **Task 1.2:** Decidir o remetente das campanhas e da nota: nome e endereço em `mail.delcastanher.srv.br` (B1).
- [ ] **Task 1.3:** O usuário compra o **certificado digital ICP-Brasil A1** do CNPJ e guarda o `.pfx` e a senha fora do repositório. Registrar aqui a certificadora e a data de vencimento (A10).
- [ ] **Task 1.4:** Baixar do gov.br o manual vigente da API do contribuinte, o XSD da DPS e dos eventos e o Swagger da Sefin e do ADN. Registrar aqui as versões, e conferir se há série de DPS reservada para emissão por API.
- [ ] **Task 1.5:** O usuário cria a conta no Resend. Conferir se a supressão automática de rejeições e de reclamações vem ligada (B6).
- [ ] **Task 1.6:** Corrigir a classificação da aplicação no painel do Mercado Pago para serviço digital (pendência da Spec 014).

## Fase 2: Backend - Dados e `MailService` (TDD)
- [ ] **Task 2.1:** Migration com os campos e tabelas novos:
  - `Order.payerDocument` e `Order.payerName`;
  - `User.marketingOptOutAt`;
  - `Invoice`, `EmailCampaign` e `EmailDelivery`, com os enums.

  Gravar CPF e nome na criação do pedido, com teste de que o CPF não sai em log nem em resposta pública (A3).
- [ ] **Task 2.2:** Suíte e implementação do `MailService`:
  - envio unitário e em lote de 100;
  - layout fixo em HTML e em texto;
  - corpo em texto simples escapado (B3);
  - cabeçalhos `List-Unsubscribe` só no e-mail de campanha (B5).
- [ ] **Task 2.3:** Suíte e implementação do descadastro (B5):
  - token HMAC;
  - `POST /email/unsubscribe`, com token adulterado → `400`;
  - `marketingOptIn` no `PATCH /users/me`.
- [ ] **Task 2.4:** Escrever o script de backfill do CPF e do nome dos pedidos pagos, lendo `payer.identification` no Mercado Pago com a conta da `mpConnectionId` (A3). **Não rodar** nesta fase.

## Fase 3: Backend - Nota Fiscal (TDD)
- [ ] **Task 3.1:** Conferir no manual e no Swagger (Task 1.4) e registrar aqui, antes de escrever código:
  - os paths e os hosts da Sefin e do ADN (emitir, consultar pela DPS, eventos, DANFSe);
  - o formato do Id da DPS e do `infPedReg`;
  - o algoritmo de assinatura e a canonicalização;
  - os campos obrigatórios da DPS para este CNPJ (A1 e A2).
- [ ] **Task 3.2:** Suíte e implementação do `DpsBuilder`, validando o XML gerado contra o XSD oficial nos fixtures (A1).
- [ ] **Task 3.3:** Suíte e implementação do `XmlSigner` com `xml-crypto` e um certificado de teste autoassinado (A1).
- [ ] **Task 3.4:** Suíte e implementação do `SefinClient`, contra um servidor HTTP falso (A1 e A6):
  - mTLS com o `pfx`;
  - GZip + Base64;
  - timeout de 10 s;
  - host por `NFSE_ENV`;
  - leitura de sucesso e de erro.
- [ ] **Task 3.5:** Suíte e implementação do `InvoicesService` (A2, A4, A5 e A8):
  - número da DPS reservado pela sequência antes do envio;
  - `UNKNOWN` no timeout;
  - `DENIED` com os erros crus;
  - XML e PDF no Storage, com a gravação pelo servidor nova no `StorageService`;
  - e-mail com o PDF anexo, uma vez só.
- [ ] **Task 3.6:** Ligar a nota ao `OrdersService.apply`:
  - emitir depois do acesso;
  - cancelar depois da revogação.

  Testes de que a falha da nota não muda o pedido nem a resposta do webhook do Mercado Pago (A4 e A7).
- [ ] **Task 3.7:** Rota `/internal/invoices/reconcile` com `CRON_SECRET`, só do próprio ambiente, e a entrada no `api/vercel.json`. Ela cobre (A5, A6 e A10):
  - consulta pela DPS no `UNKNOWN`;
  - reenvio de `PENDING` e `ERROR`;
  - PDF que falta;
  - aviso de vencimento do certificado.
- [ ] **Task 3.8:** Rotas `/admin/invoices/:orderId/issue`, `/email` e `/pdf`, e a situação, o número e a chave de acesso da nota na listagem e no CSV do financeiro (A9).
- [ ] **Task 3.9:** Documentar as variáveis no `api/.env.example`.
- [ ] **Task 3.10:** Rodar `npm test` no `api/` e corrigir regressões. O `orders.service.ts` é o coração do checkout (Specs 014, 019 e 020).

## Fase 4: Backend - Campanhas (TDD)
- [ ] **Task 4.1:** Suíte dos segmentos (B2): cada regra, e a exclusão de bloqueados, descadastrados e administradores. Implementar `GET /admin/email/segments` com as contagens.
- [ ] **Task 4.2:** Suíte do disparo (B4):
  - teste só para o admin logado, com `[TESTE]`;
  - campanha congelando os destinatários em `EmailDelivery`;
  - lotes de 100;
  - retomada que envia só as entregas sem `resendId`.
- [ ] **Task 4.3:** Implementar as rotas `/admin/email/*`, com o guard de admin, e o histórico (B6).
- [ ] **Task 4.4:** Rodar `npm test` no `api/`.

## Fase 5: Front
- [ ] **Task 5.1:** Aba "Disparos de E-mail" real, sem o aviso de construção:
  - segmentos com contagem, assunto e corpo em formulário reativo;
  - "Enviar teste";
  - confirmação com o número de destinatários antes de "Disparar";
  - "Retomar envio" em campanha parcial;
  - histórico.
- [ ] **Task 5.2:** Listagem do financeiro: selo da situação da nota (e de produção restrita, A6), número e as ações "Emitir de novo", "Reenviar e-mail" e "Baixar PDF" conforme o status (A9). Aviso do vencimento do certificado quando faltar 30 dias ou menos (A10).
- [ ] **Task 5.3:** Página pública `/descadastro`, que só descadastra no clique, e o interruptor "Receber novidades por e-mail" no perfil do aluno (B5).
- [ ] **Task 5.4:** Specs dos três itens acima, depois `ng test` e `ng build`.

## Fase 6: Produção (com autorização do usuário)
- [ ] **Task 6.1:** Verificar `mail.delcastanher.srv.br` no Resend: criar os registros SPF, DKIM e DMARC no DNS, com autorização, e registrar aqui quando o domínio ficar verificado.
- [ ] **Task 6.2:** Subir as variáveis na Vercel do `delcastanher-api`. As de config sobem pelo Claude. Os segredos (`NFSE_CERT_PFX_BASE64`, `NFSE_CERT_PASSWORD`, `RESEND_API_KEY` e `EMAIL_UNSUBSCRIBE_SECRET`) sobem pelo usuário. `NFSE_ENV=producao` vai **só** em Production (A6).
- [ ] **Task 6.3:** Rodar uma emissão avulsa em **produção restrita** com o certificado real, por script local, antes de qualquer venda: DPS aceita, consulta pela DPS, PDF baixado e cancelamento. Registrar aqui os erros encontrados e as correções.
- [ ] **Task 6.4:** Aplicar a migration no banco (o banco é o de produção) e, **com autorização**, rodar o backfill do CPF (A3).
- [ ] **Task 6.5:** No preview, fazer uma compra de teste e conferir a nota de produção restrita autorizada, o selo no painel e o e-mail recebido.
- [ ] **Task 6.6:** Em produção, com a primeira venda real depois do deploy, conferir a nota autorizada na consulta pública do `nfse.gov.br`, o PDF anexo e o e-mail. Para os pedidos já pagos antes da spec, emitir pelo "Emitir de novo" depois do backfill, com a contabilidade de acordo sobre a competência.
- [ ] **Task 6.7:** Testar o cancelamento: estornar um pedido de teste e ver a nota `CANCELLED`.
- [ ] **Task 6.8:** Mandar um teste de campanha para caixas no Gmail e no Outlook. Conferir que caem na entrada, com SPF, DKIM e DMARC válidos nos cabeçalhos, e que o "Cancelar inscrição" nativo do Gmail descadastra.
- [ ] **Task 6.9:** Conferir se a Política de Privacidade cita a nota fiscal como finalidade do CPF (A3) e o e-mail de novidades com oposição (B5). Se não citar, ajustar o texto.

## Fase 7: Vídeo de Apresentação na Landing (Parte C)
- [ ] **Task 7.1:** Com o usuário, decidir o canal e a visibilidade (C1). O usuário sobe a "Chamada módulo 1", confere a legenda no Studio e passa o `id` e a data do upload. Registrar aqui.
- [ ] **Task 7.2:** Extrair um quadro como pôster (1024×576) para `front/public/assets/` e registrar de que segundo ele saiu (C4).
- [ ] **Task 7.3:** Tirar a regra do YouTube de `media-card.ts` para `shared/ui/`, com a suíte do card passando sem mudança. Criar o `ui-youtube-facade` (C2 e C3).
- [ ] **Task 7.4:** Seção "Conheça a Imersão" entre a hero e "A Mentora", em `@if` pela constante do `id`, e o `VideoObject` no `personSchema()` (C5 e C6).
- [ ] **Task 7.5:** Specs:
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
