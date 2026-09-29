# Spec 023: Disparos de E-mail e Nota Fiscal

**Projeto:** Plataforma E-learning "Imersão RH Estratégico"
**Baseada em:**
- Spec 009 (SEO, Analytics e Conformidade)
- Spec 013 (Painel Administrativo com Dados Reais)
- Spec 014 (Checkout, decisão 25)
- Spec 015 (Jurídico)
- Spec 016 (Painel de Finanças)
- Spec 018 (Na Mídia, fachada do YouTube)
- Spec 020 (Recebimento na Conta do Vendedor)

**Escopo técnico:** full-stack.
- `api/` (NestJS + Prisma), escrito com TDD: a suíte vem antes da implementação (`.claude/RULES.md`).
- `front/` (Angular standalone + signals + Tailwind).
- Integração direta com a API da **Sefin Nacional** (Sistema Nacional da NFS-e), mais configuração no Resend, no DNS e na Vercel.

## Objetivo
Esta spec tem três entregas:
1. **Nota fiscal de serviço (NFS-e) emitida pela API gratuita da Sefin Nacional** a cada venda aprovada, cancelada no estorno e enviada ao comprador por e-mail.
2. **A aba "Disparos de E-mail" do `/admin` funcionando.** Hoje ela é a maquete da Spec 001, com o aviso de "Área em construção" da Spec 013. Ela passa a mandar campanhas de verdade para segmentos de alunos, com descadastro.
3. **O vídeo de apresentação na landing**, pelo YouTube. É uma fase pequena, só de front (seção própria no fim deste documento).

As duas primeiras dividem a mesma peça, que ainda não existe: **um provedor de e-mail na API**. Hoje a API não manda e-mail nenhum. O único e-mail da plataforma é o link de login, e quem o envia é o Firebase.

## Estado atual
- **Nota fiscal:** não existe. A Spec 014 (decisão 25) verificou que o Mercado Pago não emite o documento e registrou que:
  - a obrigação é da Delcastanher;
  - o documento é **NFS-e**, e não NF-e, porque o que se vende é acesso a conteúdo digital, que é serviço.
- **CPF do comprador:** o checkout exige o CPF (`create-order.dto.ts`) e o repassa ao Mercado Pago em `payer.identification`, mas **não o grava**. O `Order` não tem o dado. Sem ele não há tomador na nota.
- **Transições do pedido:** `OrdersService.apply` já é o ponto único onde o pedido vira `PAID` (concede acesso) ou `REFUNDED` (revoga acesso). Webhook e polling passam por ele, e só a chamada que muda o estado age. É o gancho natural para emitir e cancelar a nota.
- **Aba de disparos:** tem um `<select>` com três segmentos fixos, assunto, corpo e dois botões desabilitados. Nada é salvo nem enviado.

## Parte A: Nota fiscal pela Sefin Nacional

### Por que a Sefin Nacional, e qual a alternativa
O Sistema Nacional da NFS-e foi desenvolvido pela Receita Federal, pela Abrasf e pelo Serpro. Ele tem uma API para o contribuinte emitir direto, **sem cobrança pelo uso**. Consultado em 2026-09-29:
- [notícia do Serpro](https://www.serpro.gov.br/menu/noticias/noticias-2022/RFB-lanca-NFSe);
- [documentação técnica no gov.br](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual);
- [manual do Emissor Público API, v1.2, out-2025](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual/manual-contribuintes-emissor-publico-api-sistema-nacional-nfs-e-v1-2-out2025.pdf).

As APIs comerciais da loja do Serpro são outra coisa, pagas, e não entram aqui.

**O preço de ir direto:** o trabalho que um intermediário faria passa a ser nosso:
- montar o XML da DPS e assiná-lo (XMLDSIG);
- compactar (GZip + Base64);
- conectar com o certificado A1 (mTLS);
- baixar o PDF;
- acompanhar as mudanças de layout, como os grupos de IBS e CBS da reforma.

**Condição:** o município do prestador precisa emitir pela Sefin Nacional. Onde a prefeitura mantém sistema próprio, a API nacional não emite, e o caminho é o sistema dela.

**Alternativa: Focus NFe (paga).** Se o município não estiver na Sefin Nacional, ou se a assinatura e a homologação travarem, a emissão passa para a Focus NFe. A versão anterior desta spec (commit `253ab5f`) tem esse desenho. Ele muda só o cliente e a forma de receber o desfecho: a Focus tem webhook, e o PDF vem por link. O modelo de dados, os status, o painel e o e-mail continuam iguais (decisão A1).

### Pré-requisitos fiscais (do usuário e da contabilidade)
Nada disto é decisão de código, e a Fase 1 não emite em produção sem os dados:
- CNPJ, inscrição municipal e município (código IBGE) do prestador.
- **Se o município emite pela Sefin Nacional** e aceita emissão por API. Confere-se com a contabilidade e na API de parametrização municipal do Sistema Nacional (decisão A1).
- Regime tributário e opção pelo Simples Nacional.
- **Código de tributação nacional do ISS** para o serviço, e a alíquota.
- Se a DPS de 2026 já precisa do grupo de IBS e CBS para este CNPJ, e com que valores.
- Texto padrão da descrição do serviço.
- **Certificado digital ICP-Brasil A1** do CNPJ, em arquivo `.pfx`, com a senha. É pago à certificadora e renovado todo ano. O A3 (token ou cartão) não serve, porque a API roda sem ninguém por perto.
- A série da DPS que a emissão por API vai usar. **Conferir** no manual se há faixa reservada.
- Correção da classificação da aplicação no Mercado Pago, de "Produto físico" para serviço. Está pendente desde a Spec 014 e é feita junto.

### Decisões

**A1. Um cliente só para a Sefin Nacional, com o formato isolado.**
Todo o conhecimento do Sistema Nacional fica em três peças, em `api/src/invoices/sefin/`:
- **`DpsBuilder`:** `order → XML da DPS`, no layout do Sistema Nacional (`http://www.sped.fazenda.gov.br/nfse`).
- **`XmlSigner`:** assinatura XMLDSIG envelopada do `infDPS` e do `infPedReg`, com o certificado A1. Usa a biblioteca `xml-crypto`. O algoritmo e a canonicalização seguem o manual, e ficam **conferidos na Task 3.1**: relatos de integradores dizem que SHA-1 é aceito, mas o que vale é o manual vigente.
- **`SefinClient`:** as chamadas HTTP com mTLS. O `https.Agent` do Node recebe o `pfx` e a senha, e o XML segue em GZip + Base64 no corpo JSON.

O resto do sistema fala com uma interface `InvoiceGateway`: `emit`, `findByDps`, `cancel` e `downloadPdf`. Trocar pela Focus (a alternativa acima) é escrever outra implementação dela.

Rotas usadas. O host de produção é `https://sefin.nfse.gov.br/SefinNacional`, e o de produção restrita é `https://sefin.producaorestrita.nfse.gov.br/SefinNacional`. Os paths e os hosts do ADN são **conferidos no Swagger** na Task 3.1.

| Uso | Chamada |
|---|---|
| Emitir | `POST /nfse`, corpo `{ dpsXmlGZipB64 }`. É **síncrona**: devolve a chave de acesso (50 posições) e o XML da NFS-e, ou a lista de erros |
| Recuperar pela DPS | `GET /dps/{idDps}` devolve a chave de acesso da NFS-e gerada com aquela DPS |
| Cancelar | `POST /nfse/{chaveAcesso}/eventos`, corpo `{ pedidoRegistroEventoXmlGZipB64 }`, com o evento `e101101` |
| PDF (DANFSe) | API DANFSe do ADN, pela chave de acesso, também com mTLS |

**A2. A DPS tem número próprio, reservado antes do envio, e é ela que impede nota duplicada.**
O Sistema Nacional não tem um "`ref`" livre como o de um intermediário. A identidade da nota é o **Id da DPS**, montado com:
- o município emissor;
- o CNPJ do prestador;
- a série;
- o número da DPS.

O formato exato é **conferido no manual** (Task 3.1). A mesma DPS não gera duas notas.
- O número vem de uma **sequência no Postgres** (`invoice_dps_number_seq`). Ele é gravado na `Invoice` **antes** do primeiro envio e nunca muda.
- Toda nova tentativa (cron, "Emitir de novo", timeout) reenvia **a mesma DPS**. Antes de reenviar uma nota em estado incerto, consulta-se `GET /dps/{idDps}`: se a nota já existe, só se grava a chave.
- **Um pedido, uma `Invoice`, um número de DPS** (`orderId @unique`).
- A sequência é por ambiente (A6). Produção restrita e produção não disputam números.

**A3. Gravar o CPF e o nome do comprador no pedido.**
O `Order` ganha `payerDocument` (CPF, só dígitos) e `payerName`, gravados na criação a partir do que o checkout já recebe.
- **Base legal (LGPD):** cumprimento de obrigação legal, porque a nota exige o tomador. O dado não sai em nenhuma resposta além da do próprio comprador e do painel financeiro, e nunca em log.
- **Pedidos já pagos antes da migration** (a primeira venda real, Spec 022): o CPF é lido do pagamento no Mercado Pago (`payer.identification`), por um script único de backfill, com a conta da `mpConnectionId` de cada pedido.
- A Política de Privacidade precisa citar a nota fiscal como finalidade do CPF. **Conferir** o texto publicado (Spec 015 ou 022).

**A4. Emissão disparada pela aprovação, sem travar o pagamento.**
Quando `apply` tira o pedido de pendente para `PAID`, depois de conceder o acesso:
1. cria-se a `Invoice` em `PENDING`, com o número da DPS reservado (A2);
2. monta-se, assina-se e envia-se a DPS;
3. conforme a resposta:
   - **nota gerada:** `AUTHORIZED`, com a chave de acesso, o número e o XML;
   - **rejeição:** `DENIED`, com a lista de erros crua;
   - **timeout ou erro de rede:** `UNKNOWN`. A DPS pode ter chegado, e só a consulta pela DPS responde.

A regra central é que **uma falha da Sefin nunca desfaz nem atrasa o pagamento**:
- a chamada é protegida por `try/catch`;
- o webhook do Mercado Pago continua respondendo `200`;
- a nota é assunto do painel, não do comprador.

Para não segurar a resposta do webhook do Mercado Pago, a emissão tem **timeout curto** (10 s). O que não couber nele vira `UNKNOWN` e fica para o cron.

**A5. Sem webhook: o cron diário é a rede.**
O Sistema Nacional não avisa ninguém, porque a emissão é síncrona. O que fica pendente é resolvido pelo cron diário que já existe na API (`vercel.json`, Spec 020), com uma segunda rota, `/internal/invoices/reconcile`. Ela trata as notas paradas há mais de 1 hora:
- `UNKNOWN`: consulta `GET /dps/{idDps}`. Se a nota existe, grava a chave e segue como `AUTHORIZED`. Se não existe, reenvia a mesma DPS.
- `PENDING` e `ERROR` (falha antes do envio, como certificado ilegível): reenvia.
- `AUTHORIZED` sem PDF guardado: baixa o PDF de novo (A8).

`DENIED` **não** é reenviado sozinho: a mesma DPS seria rejeitada de novo. Ele espera a correção e o "Emitir de novo" do painel (A9).

**A6. Ambiente fiscal amarrado ao ambiente da Vercel, porque o banco é um só.**
Preview e produção usam o mesmo banco, como já tratado na Spec 020 com o `liveMode`.
- `NFSE_ENV` é `producao` (`tpAmb` 1) **só** no ambiente Production da Vercel. Em preview e em desenvolvimento é `producao_restrita` (`tpAmb` 2), no host de produção restrita, que é o ambiente de testes do Sistema Nacional.
- A `Invoice` grava o `environment` em que nasceu. O painel mostra as notas de produção restrita com um selo, e o cron só reconcilia as do seu próprio ambiente.
- Uma venda de teste feita no preview **nunca** gera nota com valor fiscal.

**A7. Estorno cancela a nota automaticamente, e o painel mostra quando não der.**
Quando `apply` leva o pedido a `REFUNDED`, depois de revogar o acesso, e a nota está `AUTHORIZED`:
- envia-se o evento de cancelamento `e101101`, com `cMotivo` 2 ("Serviço não prestado") e `xMotivo` "Pagamento estornado ao tomador";
- o `infPedReg` é assinado como a DPS;
- a resposta é síncrona:
  - evento registrado → `CANCELLED`;
  - rejeição → `CANCEL_ERROR`, com os erros.

O prazo e as condições do cancelamento são do município e do Sistema Nacional. Fora deles, o cancelamento pode exigir análise fiscal da prefeitura. Nesse caso a correção é com a contabilidade, e **não é automatizada**: o painel mostra o status, e o pedido estornado continua estornado.

**A8. PDF e XML guardados por nós, e a nota enviada por e-mail com o PDF anexo.**
O DANFSe do ADN também exige mTLS, então **não há link público** que o comprador possa abrir. Por isso:
- Assim que a nota é autorizada, a API guarda os dois arquivos no Storage da Spec 010, em `invoices/{environment}/{chaveAcesso}.xml` e `.pdf`:
  - o **XML** da NFS-e, que é o documento fiscal e precisa ser guardado;
  - o **PDF**, baixado da API DANFSe.
- O `StorageService` ganha um método de gravação pelo servidor (hoje ele só emite URL de upload para o navegador).
- A API manda pelo Resend (Parte B, decisão B1) o e-mail transacional "Sua nota fiscal", com:
  - o número;
  - o **PDF em anexo**;
  - o link da consulta pública do portal nacional (`nfse.gov.br`), onde a chave de acesso confere a nota.
- O e-mail só sai quando o PDF está guardado. Se o download falhar, o cron tenta de novo (A5), e o e-mail sai depois.
- O e-mail transacional **ignora o descadastro de marketing** (decisão B5), porque é documento da compra.

**A9. O painel financeiro mostra a nota de cada pedido.**
A listagem de pedidos da Spec 016 (`GET /admin/finance/orders`) ganha a situação e o número da nota. Cada pedido tem três ações:
- **Emitir de novo:** para `DENIED` ou `ERROR`, depois de corrigir a causa (dado fiscal, CPF, certificado).
  - Num `ERROR`, a DPS nunca chegou, e o reenvio é da mesma DPS.
  - Num `DENIED`, a DPS foi rejeitada e seu número é descartado. Reserva-se um número novo, e o antigo fica registrado em `lastError`.
- **Reenviar e-mail:** para `AUTHORIZED`.
- **Baixar PDF:** para `AUTHORIZED`, por URL assinada de leitura do Storage, como os materiais das aulas.

O CSV de exportação da Spec 016 ganha as colunas de número, chave de acesso e situação da nota.

**A10. O certificado A1 fica na Vercel, como segredo.**
- O `.pfx` sobe em Base64 em `NFSE_CERT_PFX_BASE64`, com a senha em `NFSE_CERT_PASSWORD`. Os dois são segredos e sobem pelo usuário.
- O arquivo tem poucos KB e cabe no limite de variáveis da Vercel.
- O certificado vence todo ano. A rota do cron registra em log, e o painel financeiro mostra, um aviso **30 dias antes** do vencimento, lido do próprio `.pfx`. Certificado vencido faz toda emissão falhar.

### Modelo de dados (Parte A)
```prisma
model Invoice {
  id          String        @id @default(cuid())
  orderId     String        @unique
  status      InvoiceStatus @default(PENDING)
  environment String                     // 'producao' | 'producao_restrita' (A6)
  amountCents Int                        // copia do pedido na emissao

  /// Numero da DPS, reservado antes do primeiro envio e fixo nas novas
  /// tentativas (A2). Troca so no "Emitir de novo" de uma DPS rejeitada.
  dpsSeries   String
  dpsNumber   Int
  dpsId       String        @unique      // Id da DPS, no formato do manual

  accessKey   String?       @unique      // chave de acesso da NFS-e (50 posicoes)
  number      String?                    // numero da NFS-e
  xmlPath     String?                    // Storage (A8)
  pdfPath     String?                    // Storage (A8)
  /// Resposta crua da Sefin no ultimo erro, sem traducao (mesma regra do `mpStatusDetail`).
  lastError   String?

  issuedAt    DateTime?
  cancelledAt DateTime?
  emailedAt   DateTime?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  order Order @relation(fields: [orderId], references: [id], onDelete: Restrict)

  @@unique([environment, dpsSeries, dpsNumber])
  @@index([status, environment, updatedAt])   // o cron de reconciliacao (A5)
  @@map("invoices")
}

enum InvoiceStatus { PENDING UNKNOWN AUTHORIZED DENIED ERROR CANCELLED CANCEL_ERROR }
```
- O `Order` ganha `payerDocument String?` e `payerName String?` (A3). Os dois são nulos até o backfill.
- A sequência do número da DPS é criada à mão na migration, uma por ambiente, porque o Prisma não declara sequência avulsa.

## Parte B: Disparos de e-mail

### Decisões

**B1. Resend como provedor, com domínio próprio verificado.**
O Resend tem API simples, envio em lote de até 100 mensagens por chamada e SDK para Node.
- O remetente usa um subdomínio próprio (`mail.delcastanher.srv.br`), com SPF, DKIM e DMARC no DNS. O endereço de envio e o nome ("Lidiane Delcastanher" ou "Delcastanher") são decididos na Task 1.2.
- O subdomínio separa a reputação de envio do domínio principal.
- Um `MailService` único na API serve os dois usos: o e-mail da nota (A8) e as campanhas.

**B2. Três segmentos fixos, calculados no servidor.**
São os mesmos da maquete, agora com dados reais:

| Segmento | Regra |
|---|---|
| Todos os alunos ativos | ao menos um `ModuleAccess` com `expiresAt` no futuro |
| Alunos que não acessam há 7 dias | ativos, com `lastSeenAt` anterior a 7 dias ou nulo |
| Alunos que concluíram o curso | ao menos um `Certificate` `ACTIVE` |

Em todos, ficam fora:
- contas bloqueadas (`blockedAt`);
- quem se descadastrou (B5);
- administradores.

O front manda só o **nome** do segmento, e nunca uma lista de e-mails ou um filtro livre. Antes do disparo, a tela mostra quantas pessoas vão receber (`GET /admin/email/segments`).

**B3. Corpo em texto simples, escapado, e nunca HTML digitado.**
O corpo é texto. Na montagem do e-mail:
- parágrafos viram `<p>`;
- URLs viram links;
- todo o resto é escapado.

É a mesma regra da Spec 022 (decisão 1) para os termos. Se o formato de marcação da 022 já existir quando esta spec for executada, ele é reaproveitado. O e-mail sai com um layout fixo da marca (cabeçalho, corpo e rodapé com descadastro), em HTML e em texto puro.

**B4. Fluxo de envio: teste, confirmação e envio em lotes idempotentes.**
1. **Enviar teste:** manda a campanha só para o e-mail do administrador logado, com o assunto prefixado por `[TESTE]`. Não grava campanha.
2. **Disparar campanha:** abre uma confirmação com o segmento e o número de destinatários. Só depois dela o `POST` sai.
3. A API grava o `EmailCampaign` e uma linha `EmailDelivery` por destinatário, congelando a lista naquele instante. Depois envia em lotes de 100 pelo `batch` do Resend e grava o id do Resend em cada entrega.
4. Se a função cair no meio, "Retomar envio" envia só as entregas sem id. **Ninguém recebe duas vezes.**

Com o público atual, um disparo cabe numa execução. Fila fica fora de escopo até o número de alunos pedir.

**B5. Descadastro em um clique, válido para campanhas.**
- `User` ganha `marketingOptOutAt DateTime?`.
- Todo e-mail de campanha leva no rodapé um link para `/descadastro?token=…`, com token HMAC do `userId` (`EMAIL_UNSUBSCRIBE_SECRET`), sem validade e sem login.
- Leva também os cabeçalhos `List-Unsubscribe` e `List-Unsubscribe-Post: List-Unsubscribe=One-Click`, que o Gmail e o Yahoo exigem de remetente em volume. O `POST` de um clique vai direto à API.
- A página `/descadastro` pede **confirmação por botão**, porque um `GET` que descadastra seria disparado por antivírus que abrem links de e-mail.
- O aluno pode se recadastrar pelo perfil, com um interruptor "Receber novidades por e-mail".
- **Base legal:** legítimo interesse, para comunicação com quem já é aluno, com oposição a qualquer momento. A Política de Privacidade precisa dizer isso. **Conferir** o texto publicado.

**B6. Histórico de campanhas na própria aba.**
Abaixo do formulário aparece a lista das campanhas, com:
- data, assunto e segmento;
- quem disparou;
- destinatários, enviados e com falha.

Rejeições e reclamações de spam ficam na lista de supressão automática do Resend. **Conferir** se ela vem ligada na conta. Webhook de entrega, abertura e clique ficam fora de escopo.

### Modelo de dados (Parte B)
```prisma
model EmailCampaign {
  id          String        @id @default(cuid())
  subject     String
  body        String                      // texto simples (B3)
  segment     EmailSegment
  createdById String                      // admin que disparou
  status      CampaignStatus @default(SENDING)
  recipientCount Int
  createdAt   DateTime @default(now())
  finishedAt  DateTime?

  deliveries EmailDelivery[]
  @@map("email_campaigns")
}

model EmailDelivery {
  id         String  @id @default(cuid())
  campaignId String
  userId     String
  email      String                        // copia no instante do disparo
  resendId   String?                       // nulo = ainda nao enviado (B4)
  error      String?
  sentAt     DateTime?

  campaign EmailCampaign @relation(fields: [campaignId], references: [id], onDelete: Cascade)
  @@unique([campaignId, userId])
  @@map("email_deliveries")
}

enum EmailSegment   { ALL_ACTIVE INACTIVE_7D COMPLETED }
enum CampaignStatus { SENDING SENT PARTIAL }
```
`User` ganha `marketingOptOutAt DateTime?` (B5).

## Rotas

| Método | Rota | Quem | O que faz |
|---|---|---|---|
| `GET` | `/internal/invoices/reconcile` | cron da Vercel (`CRON_SECRET`) | consulta pela DPS, reenvia pendências, baixa PDFs e avisa o vencimento do certificado (A5 e A10) |
| `POST` | `/admin/invoices/:orderId/issue` | admin | emite de novo: mesma DPS no `ERROR`, número novo no `DENIED` (A9) |
| `POST` | `/admin/invoices/:orderId/email` | admin | reenvia o e-mail da nota (A9) |
| `GET` | `/admin/invoices/:orderId/pdf` | admin | URL assinada de leitura do PDF (A9) |
| `GET` | `/admin/email/segments` | admin | segmentos com a contagem de destinatários (B2) |
| `POST` | `/admin/email/test` | admin | envia o teste ao próprio admin (B4) |
| `POST` | `/admin/email/campaigns` | admin | cria e dispara a campanha (B4) |
| `POST` | `/admin/email/campaigns/:id/resume` | admin | retoma as entregas sem id (B4) |
| `GET` | `/admin/email/campaigns` | admin | histórico (B6) |
| `POST` | `/email/unsubscribe` | público, token HMAC | descadastro, pela página ou em um clique (B5) |
| `PATCH` | `/users/me` | aluno | passa a aceitar `marketingOptIn` (B5) |

## Variáveis de ambiente

| Variável | Tipo | Quem sobe | Uso |
|---|---|---|---|
| `NFSE_ENV` | config | Claude | `producao` só em Production; `producao_restrita` no resto (A6) |
| `NFSE_CERT_PFX_BASE64` | segredo | usuário | certificado A1 do CNPJ, em Base64 (A10) |
| `NFSE_CERT_PASSWORD` | segredo | usuário | senha do certificado (A10) |
| `NFSE_PRESTADOR_CNPJ`, `NFSE_INSCRICAO_MUNICIPAL`, `NFSE_MUNICIPIO_IBGE`, `NFSE_CODIGO_TRIBUTACAO`, `NFSE_ALIQUOTA_ISS`, `NFSE_REGIME`, `NFSE_DPS_SERIE`, `NFSE_DESCRICAO` | config | Claude | dados fiscais da contabilidade |
| `RESEND_API_KEY` | segredo | usuário | envio de e-mail (B1) |
| `EMAIL_FROM` | config | Claude | remetente, ex.: `Lidiane Delcastanher <contato@mail.delcastanher.srv.br>` |
| `EMAIL_UNSUBSCRIBE_SECRET` | segredo | usuário | HMAC do link de descadastro (B5) |

## Integração com o existente
- **`api/src/payments/orders.service.ts`:** em `apply`, emitir depois do acesso (A4) e cancelar depois da revogação (A7). A criação do pedido grava `payerDocument` e `payerName` (A3).
- **`api/src/invoices/`** (módulo novo): a interface `InvoiceGateway`, a implementação em `sefin/` (`DpsBuilder`, `XmlSigner`, `SefinClient`), o `InvoicesService` e a rota do cron. Dependência nova: `xml-crypto`.
- **`api/src/storage/storage.service.ts`:** gravação de arquivo pelo servidor, para o XML e o PDF (A8).
- **`api/src/mail/`** (módulo novo): `MailService` (Resend), layout, e-mail da nota e campanhas.
- **`api/src/payments/admin-finance.*`:** situação e número da nota na listagem e no CSV (A9).
- **`api/vercel.json`:** a segunda rota no cron diário.
- **`api/scripts/`:** backfill do CPF dos pedidos pagos (A3). Roda contra produção **só com autorização explícita**.
- **`front/src/app/features/admin/dashboard/`:** a aba "Disparos de E-mail" real, sem o aviso de construção.
- **`front/src/app/features/admin/financeiro/`:** coluna e ações da nota.
- **`front/src/app/features/`:** página pública `/descadastro` e o interruptor no perfil do aluno.

## Testes

### Backend (TDD)
**Nota fiscal**
- O `DpsBuilder` monta a DPS com o CPF e o nome do tomador, o valor do pedido, a competência em `paidAt`, o `tpAmb` do ambiente e os dados fiscais. O XML valida contra o XSD oficial do Sistema Nacional, versionado nos fixtures de teste.
- O `XmlSigner` gera assinatura que o próprio `xml-crypto` valida com o certificado de teste. Um XML alterado depois da assinatura não valida.
- O `SefinClient` manda o XML em GZip + Base64, com o `pfx` no agente. Os testes usam um servidor HTTP falso, e nunca a Sefin.
- `apply` → `PAID` cria a `Invoice` com o número da DPS reservado e emite uma vez. Um segundo `apply` do mesmo pedido não emite de novo.
- Uma falha da Sefin ou um timeout **não** muda o pedido, o acesso nem a resposta do webhook do Mercado Pago. O timeout deixa a nota em `UNKNOWN`.
- `UNKNOWN` com a nota já existente na consulta pela DPS grava a chave **sem reenviar**. Sem a nota, reenvia a **mesma** DPS.
- Rejeição vira `DENIED` com os erros crus, e o cron não a reenvia.
- "Emitir de novo" reusa o número no `ERROR` e reserva um novo no `DENIED`.
- A nota autorizada guarda XML e PDF no Storage, e o e-mail sai uma vez só, com o PDF anexo e só depois de o PDF estar guardado.
- `apply` → `REFUNDED` com nota `AUTHORIZED` envia o `e101101` com `cMotivo` 2. A rejeição vira `CANCEL_ERROR` sem desfazer o estorno.
- O cron reconcilia só o próprio ambiente, e só o que está parado há mais de 1 hora.
- O aviso de vencimento do certificado aparece a 30 dias.
- O CPF, o `pfx` e a senha não aparecem em log nem em resposta.

**E-mail**
- Cada segmento devolve só quem cumpre a regra, sem bloqueados, descadastrados e administradores.
- O corpo com `<script>` sai escapado no HTML.
- O disparo grava uma entrega por destinatário. Retomar envia só as sem `resendId`.
- O e-mail de campanha tem o link e os cabeçalhos de descadastro. O e-mail da nota não tem, e chega a quem se descadastrou.
- O token de descadastro adulterado dá `400`. O válido grava `marketingOptOutAt`.
- As rotas `/admin/email/*` e `/admin/invoices/*` recusam quem não é admin.

### Front
- A aba mostra os segmentos com a contagem, e o disparo só sai depois da confirmação.
- O histórico lista as campanhas com os totais.
- A listagem financeira mostra a situação da nota e as ações certas para cada status.
- `/descadastro` só descadastra no clique do botão.

### Em produção
- Uma venda real gera a nota autorizada, confere na consulta pública do `nfse.gov.br`, o e-mail chega com o PDF anexo, e o estorno de teste a cancela.
- Uma venda no preview gera nota de **produção restrita**, com o selo no painel.
- Um disparo de teste chega na caixa de entrada do Gmail e do Outlook, e não no spam, com SPF, DKIM e DMARC válidos.
- O "Cancelar inscrição" nativo do Gmail descadastra.

## Parte C: Vídeo de apresentação na landing (fase simples)
A versão anterior desta spec (commits `82cabe0` e `4086077`) comparou o Mux e o YouTube. A escolha foi o **YouTube**, pelos dois riscos que o Mux traria:
- **Cobrança:** no Mux quem paga a entrega somos nós, sem teto de gasto. No YouTube a entrega é dele, e um robô assistindo em laço não custa nada.
- **Conteúdo pago:** o vídeo da landing não tem ligação com a conta, a chave de assinatura ou as rotas das aulas.

O preço aceito:
- o logo do YouTube no player;
- possíveis anúncios;
- sugestões no fim do vídeo (`rel=0` só as limita ao mesmo canal);
- tirar a seção da landing exige deploy do front.

**Fonte:** `.specs/020 - Recebimento na Conta do Vendedor/libs/Vídeos/Chamada módulo 1.mp4`, com 60,6 s e 1024×576. A pasta `libs/` fica fora do git.

**C1. Canal e visibilidade: decisão do usuário.** Não listado é o padrão sugerido.

**C2. Fachada: nada vai ao YouTube antes do clique.** É o padrão da Spec 018 (decisão 5):
- antes do clique, só o pôster local por `NgOptimizedImage`;
- depois do clique, o `<iframe>` de `youtube-nocookie.com/embed/<id>?autoplay=1&rel=0`;
- o `id` é validado por `^[\w-]{11}$`;
- o `<iframe>` nunca sai no HTML pré-renderizado.

**C3. Um componente compartilhado.** A regra do YouTube (formato do `id` e URL do embed) sai de `EMBEDS` em `media-card.ts` para um arquivo próprio em `shared/ui/`. Nasce um `ui-youtube-facade` em 16:9, com entradas `id`, `title` e `poster`. O `ui-media-card` importa a mesma regra.

**C4. Pôster local**, um quadro do vídeo em `front/public/assets/`, e não a thumbnail do `ytimg`, que seria requisição ao Google antes do clique. **Sem autoplay.**

**C5. Seção "Conheça a Imersão"**, entre a hero e "A Mentora", com:
- título e uma frase;
- o player;
- o CTA "Quero me Inscrever Agora", para `/cursos/imersao-rh`.

O `id` fica numa constante em `landing.ts`, e a seção só aparece com ela preenchida.

**C6. Acessibilidade e SEO.**
- O botão tem `aria-label` "Reproduzir: apresentação da Imersão RH Estratégico", e o `<iframe>` tem `title`.
- A legenda automática do YouTube é conferida no Studio.
- A chamada entra como `VideoObject` no `subjectOf` do `personSchema()`, com `embedUrl`. O `url` do YouTube só entra se o vídeo for público.
- A Política de Cookies precisa citar o YouTube, como no card da Spec 018.

## Fora de escopo
- Emissão de NF-e (mercadoria) e de notas de outros serviços que não a venda na plataforma.
- Nota fiscal de venda com valor parcial estornado. O estorno parcial já não é representável (Spec 016, decisão 9).
- Correção fiscal de nota que não pôde ser cancelada no prazo (A7), que é trabalho da contabilidade.
- Editor visual de e-mail, imagens no corpo, anexos e agendamento de campanha.
- Segmentos livres ou por filtro montado no painel.
- Métricas de abertura e clique, e webhook de entrega do Resend.
- Fila de envio, enquanto o público couber numa execução (B4).
- E-mails transacionais além da nota fiscal, como a confirmação de compra e o lembrete de PIX. O `MailService` desta spec é a base deles.
- Vídeo no Mux, autoplay, vídeo na hero e vídeo em `/cursos/imersao-rh`.
