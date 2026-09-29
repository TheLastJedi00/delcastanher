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
- Configuração na Focus NFe, no Resend, no DNS e na Vercel.

## Objetivo
Esta spec tem três entregas:
1. **Nota fiscal de serviço (NFS-e) emitida pela Focus NFe** a cada venda aprovada, cancelada no estorno e enviada ao comprador por e-mail.
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

## Parte A: Nota fiscal pela Focus NFe

### Pré-requisitos fiscais (do usuário e da contabilidade)
Nada disto é decisão de código, e a Fase 1 não emite em produção sem os dados:
- CNPJ, inscrição municipal e município (código IBGE) do prestador.
- Se o município emite pela **NFS-e Nacional** ou por sistema próprio (decisão A1).
- Regime tributário e opção pelo Simples Nacional.
- **Código de tributação nacional do ISS** para o serviço, e a alíquota.
- Texto padrão da descrição do serviço.
- Certificado digital A1 da empresa, se a Focus exigir para assinar a DPS no município. **Conferir.**
- A conta na Focus NFe, com a empresa cadastrada e os tokens de homologação e de produção.
- Correção da classificação da aplicação no Mercado Pago, de "Produto físico" para serviço. Está pendente desde a Spec 014 e é feita junto.

### Decisões

**A1. NFS-e Nacional como padrão, com o endpoint isolado.**
A Focus tem duas APIs para nota de serviço:
- **NFS-e Nacional:** `/v2/nfsen`, para o ambiente nacional;
- **NFS-e municipal:** `/v2/nfse`, com campos que variam por prefeitura.

A spec é desenhada para a **Nacional**, que é a direção da reforma e tem um só layout. Qual das duas vale depende do município do prestador, e isso é confirmado na Task 1.1.
- Todo o conhecimento do formato fica num **mapeador** (`order → corpo da DPS`) e num cliente (`FocusNfeClient`).
- Se o município for do padrão municipal, só esses dois mudam. O modelo, os status, o painel e o e-mail não mudam.

**A2. A referência da nota é o `id` do pedido.**
O `ref` da Focus é único por empresa, e ela recusa uma segunda DPS com a mesma referência (`422`, "Já existe um DPS com esta referência"). Com `ref = order.id`:
- reemitir nunca gera nota duplicada;
- webhook, polling e o retry do cron podem tentar à vontade.

**A3. Gravar o CPF e o nome do comprador no pedido.**
O `Order` ganha `payerDocument` (CPF, só dígitos) e `payerName`, gravados na criação a partir do que o checkout já recebe.
- **Base legal (LGPD):** cumprimento de obrigação legal, porque a nota exige o tomador. O dado não sai em nenhuma resposta além da do próprio comprador e do painel financeiro, e nunca em log.
- **Pedidos já pagos antes da migration** (a primeira venda real, Spec 022): o CPF é lido do pagamento no Mercado Pago (`payer.identification`), por um script único de backfill, com a conta da `mpConnectionId` de cada pedido.
- A Política de Privacidade precisa citar a nota fiscal como finalidade do CPF. **Conferir** o texto publicado (Spec 015 ou 022).

**A4. Emissão disparada pela aprovação, sem travar o pagamento.**
Quando `apply` tira o pedido de pendente para `PAID`, depois de conceder o acesso:
1. cria-se a linha `Invoice` em `PENDING`;
2. envia-se a DPS à Focus;
3. com o `202`, a linha vai para `PROCESSING`.

A regra central é que **uma falha da Focus nunca desfaz nem atrasa o pagamento**:
- A chamada é protegida por `try/catch`, e o erro vai para a linha (`ERROR`, com a mensagem crua da Focus).
- O webhook do Mercado Pago continua respondendo `200`.
- A nota é assunto do painel, não do comprador.

**A5. O desfecho chega por webhook da Focus, com reconsulta como rede.**
- Um gatilho `nfsen` é cadastrado em `POST /v2/hooks`, apontando para `api.delcastanher.srv.br/webhooks/focusnfe`, com `authorization` e `authorization_header` próprios. A rota recusa chamada sem o cabeçalho certo.
- O corpo do webhook **não é confiado**: como no Mercado Pago, a rota lê só o `ref` e **reconsulta** `GET /v2/nfsen/{ref}`, gravando o que a consulta diz. Um webhook forjado com o cabeçalho certo só provoca uma consulta.
- Status da Focus traduzidos:
  - `processando_autorizacao` → `PROCESSING`;
  - `autorizado` → `AUTHORIZED`;
  - `negado` e `erro_autorizacao` → `DENIED`, com `erros[]` gravado;
  - `cancelado` → `CANCELLED`.
- **Rede:** a Focus tenta o webhook por até 48 h e depois desiste. O cron diário que já existe na API (`vercel.json`, Spec 020) ganha uma segunda rota, `/internal/invoices/reconcile`. Ela:
  - reconsulta as notas em `PROCESSING` há mais de 1 hora;
  - reenvia as que estão em `ERROR` ou `PENDING` há mais de 1 hora.

**A6. Ambiente fiscal amarrado ao ambiente da Vercel, porque o banco é um só.**
Preview e produção usam o mesmo banco, como já tratado na Spec 020 com o `liveMode`.
- `FOCUS_NFE_ENV` é `producao` **só** no ambiente Production da Vercel. Em preview e em desenvolvimento é `homologacao`, com o host e o token de homologação.
- A `Invoice` grava o `environment` em que nasceu. O painel mostra as notas de homologação com um selo, e o cron só reconcilia as do seu próprio ambiente.
- Uma venda de teste feita no preview **nunca** gera nota com valor fiscal.

**A7. Estorno cancela a nota automaticamente, e o painel mostra quando não der.**
Quando `apply` leva o pedido a `REFUNDED`, depois de revogar o acesso:
- se a nota estiver `AUTHORIZED`, chama-se `DELETE /v2/nfsen/{ref}` com a justificativa "Serviço não prestado: pagamento estornado ao tomador";
- a resposta é síncrona: `cancelado` → `CANCELLED`; `erro_cancelamento` → `CANCEL_ERROR`, com a mensagem.

O cancelamento pode ser recusado por prazo (código `V999`). Nesse caso a correção é fiscal, com a contabilidade, e **não é automatizada**: o painel mostra o status, e o pedido estornado continua estornado.

**A8. O comprador recebe a nota por e-mail nosso, e não da Focus.**
Quando a nota vira `AUTHORIZED`, a API manda pelo Resend (Parte B, decisão B1) o e-mail transacional "Sua nota fiscal", com:
- o número;
- o link do PDF (`url_danfse`);
- o link de consulta no portal nacional (`url`).

Assim o remetente, a marca e o registro do envio (`emailedAt`) ficam conosco. A Focus tem `POST /v2/nfsen/{ref}/email`, que fica como alternativa se o nosso envio falhar. O e-mail transacional **ignora o descadastro de marketing** (decisão B5), porque é documento da compra.

**A9. O painel financeiro mostra a nota de cada pedido.**
A listagem de pedidos da Spec 016 (`GET /admin/finance/orders`) ganha a situação da nota e o número. Cada pedido tem três ações:
- **Emitir de novo:** para `ERROR` ou `DENIED`, depois de corrigir a causa. O `ref` é o mesmo (decisão A2), então é seguro repetir.
- **Reenviar e-mail:** para `AUTHORIZED`.
- **Abrir PDF:** para `AUTHORIZED`.

O CSV de exportação da Spec 016 ganha as colunas de número e situação da nota.

### Modelo de dados (Parte A)
```prisma
model Invoice {
  id          String        @id @default(cuid())
  orderId     String        @unique      // tambem e o `ref` da Focus (A2)
  status      InvoiceStatus @default(PENDING)
  environment String                     // 'homologacao' | 'producao' (A6)
  amountCents Int                        // copia do pedido na emissao

  number           String?
  verificationCode String?
  portalUrl        String?               // `url` da Focus
  pdfUrl           String?               // `url_danfse`
  xmlPath          String?               // `caminho_xml_nota_fiscal`
  /// Resposta crua da Focus no ultimo erro, sem traducao (mesma regra do `mpStatusDetail`).
  lastError        String?

  issuedAt    DateTime?
  cancelledAt DateTime?
  emailedAt   DateTime?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  order Order @relation(fields: [orderId], references: [id], onDelete: Restrict)

  @@index([status, environment, updatedAt])   // o cron de reconciliacao (A5)
  @@map("invoices")
}

enum InvoiceStatus { PENDING PROCESSING AUTHORIZED DENIED ERROR CANCELLED CANCEL_ERROR }
```
O `Order` ganha `payerDocument String?` e `payerName String?` (A3). Os dois são nulos até o backfill.

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
| `POST` | `/webhooks/focusnfe` | Focus, cabeçalho próprio | lê o `ref` e reconsulta a nota (A5) |
| `GET` | `/internal/invoices/reconcile` | cron da Vercel (`CRON_SECRET`) | reconsulta e reenvia pendências (A5) |
| `POST` | `/admin/invoices/:orderId/issue` | admin | emite de novo, mesmo `ref` (A9) |
| `POST` | `/admin/invoices/:orderId/email` | admin | reenvia o e-mail da nota (A9) |
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
| `FOCUS_NFE_TOKEN` | segredo | usuário | token da empresa, um por ambiente da Vercel (A6) |
| `FOCUS_NFE_ENV` | config | Claude | `producao` só em Production; `homologacao` no resto (A6) |
| `FOCUS_NFE_WEBHOOK_SECRET` | segredo | usuário | valor do cabeçalho do gatilho (A5) |
| `NFSE_PRESTADOR_CNPJ`, `NFSE_MUNICIPIO_IBGE`, `NFSE_CODIGO_TRIBUTACAO`, `NFSE_ALIQUOTA_ISS`, `NFSE_DESCRICAO` | config | Claude | dados fiscais da contabilidade |
| `RESEND_API_KEY` | segredo | usuário | envio de e-mail (B1) |
| `EMAIL_FROM` | config | Claude | remetente, ex.: `Lidiane Delcastanher <contato@mail.delcastanher.srv.br>` |
| `EMAIL_UNSUBSCRIBE_SECRET` | segredo | usuário | HMAC do link de descadastro (B5) |

## Integração com o existente
- **`api/src/payments/orders.service.ts`:** em `apply`, emitir depois do acesso (A4) e cancelar depois da revogação (A7). A criação do pedido grava `payerDocument` e `payerName` (A3).
- **`api/src/invoices/`** (módulo novo): `FocusNfeClient`, o mapeador da DPS, `InvoicesService`, o webhook e a rota do cron.
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
- O mapeador monta a DPS com o CPF e o nome do tomador, o valor do pedido, a competência em `paidAt` e os dados fiscais do ambiente.
- `apply` → `PAID` cria a `Invoice` e chama a Focus uma vez. Um segundo `apply` do mesmo pedido não emite de novo.
- Uma falha da Focus deixa a `Invoice` em `ERROR` e **não** muda o pedido, o acesso nem a resposta do webhook do Mercado Pago.
- O webhook sem o cabeçalho certo dá `401`. Com o cabeçalho, o status gravado é o da reconsulta, e não o do corpo.
- `autorizado` grava número, links e `issuedAt`, e dispara o e-mail da nota uma vez.
- `apply` → `REFUNDED` com nota `AUTHORIZED` cancela. `erro_cancelamento` vira `CANCEL_ERROR` sem desfazer o estorno.
- O cron reconcilia só o próprio ambiente, e só o que está parado há mais de 1 hora.
- "Emitir de novo" reusa o `ref`.
- O CPF não aparece em log nem em resposta pública.

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
- Uma venda real gera a nota autorizada, o e-mail chega com o PDF, e o estorno de teste a cancela.
- Uma venda no preview gera nota de **homologação**, com o selo no painel.
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
