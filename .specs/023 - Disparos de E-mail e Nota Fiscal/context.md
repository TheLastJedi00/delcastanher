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
- Configuração na Notaas (emissão de NF-e), no Resend, no DNS e na Vercel.

## Objetivo
Esta spec tem três entregas:
1. **NF-e (modelo 55) de livro digital emitida pela Notaas** a cada venda aprovada, cancelada no estorno e enviada ao comprador por e-mail.
2. **A aba "Disparos de E-mail" do `/admin` funcionando.** Hoje ela é a maquete da Spec 001, com o aviso de "Área em construção" da Spec 013. Ela passa a mandar campanhas de verdade para segmentos de alunos, com descadastro.
3. **O vídeo de apresentação na landing**, pelo YouTube. É uma fase pequena, só de front (seção própria no fim deste documento).

As duas primeiras dividem a mesma peça, que ainda não existe: **um provedor de e-mail na API**. Hoje a API não manda e-mail nenhum. O único e-mail da plataforma é o link de login, e quem o envia é o Firebase.

## Estado atual
- **Nota fiscal:** não existe. A Spec 014 (decisão 25) verificou que o Mercado Pago não emite o documento e registrou que:
  - a obrigação é da Delcastanher;
  - o documento seria **NFS-e**. **O contador corrigiu em 2026-09-29: NF-e de livro digital** (Parte A).
- **CPF do comprador:** o checkout exige o CPF (`create-order.dto.ts`) e o repassa ao Mercado Pago em `payer.identification`, mas **não o grava**. O `Order` não tem o dado, e o checkout não pede endereço. Sem os dois não há destinatário na NF-e.
- **Transições do pedido:** `OrdersService.apply` já é o ponto único onde o pedido vira `PAID` (concede acesso) ou `REFUNDED` (revoga acesso). Webhook e polling passam por ele, e só a chamada que muda o estado age. É o gancho natural para emitir e cancelar a nota.
- **Aba de disparos:** tem um `<select>` com três segmentos fixos, assunto, corpo e dois botões desabilitados. Nada é salvo nem enviado.

## Parte A: Nota fiscal (NF-e) pela Notaas

### A decisão fiscal: NF-e de livro digital
**O contador definiu em 2026-09-29: NF-e (modelo 55), com o produto vendido como livro digital.** Isso substitui a leitura da Spec 014 (decisão 25), que registrou NFS-e. A decisão tributária é da contabilidade, e a spec a segue.

O que isso muda em relação às versões anteriores desta spec:
- **NF-e é estadual.** Ela é autorizada pela Sefaz da UF do emitente, com ICMS, NCM, CFOP e inscrição estadual.
- **A Sefin Nacional sai**, porque ela só emite NFS-e. O que foi apurado dela (commit `7482699`) fica no histórico, e a documentação baixada fica em `libs/sefin/`, fora do git, sem uso.
- **Livro, inclusive eletrônico, tem imunidade de ICMS.** O STF estendeu a imunidade do livro ao livro eletrônico. A nota sai com a situação tributária de operação imune que o contador indicar (a Notaas aceita **CSOSN 300 — Imune** no Simples), sem ICMS destacado e sem o grupo de DIFAL, que a Notaas suprime para itens imunes.
- **O cancelamento tem prazo de 24 horas.** Um estorno depois disso não cancela a nota: pede outro documento (decisão A7).
- **A NF-e exige endereço do destinatário** (decisão A3). O checkout passa a pedir.

**Ponto de coerência, registrado para o contador e o usuário:** hoje a plataforma entrega aulas em vídeo, materiais e certificado, com acesso por 6 meses. Se a nota diz "livro digital", o checkout, os Termos de Uso e a classificação no Mercado Pago precisam descrever o mesmo produto. Um documento fiscal que descreve outra coisa pode dar problema numa fiscalização. Isso não é decisão de código (Task 1.1).

### Por que a Notaas
Emitir NF-e direto na Sefaz é gratuito, mas exige:
- SOAP por UF;
- contingência;
- as notas técnicas anuais do leiaute 4.00;
- um DANFE próprio.

Entre os intermediários, **o usuário escolheu a Notaas em 2026-09-29.** Na Focus NFe, a referência que evita nota duplicada é nossa (`ref`). Na Notaas, não (decisão A2).

O que a Notaas oferece, pela [documentação](https://docs.notaas.com.br) consultada em 2026-09-29:
- **Preço:** plano **Free** com 50 notas por mês e R$ 0,50 por nota extra, o que cobre o volume de hoje. O plano Dev custa R$ 99/mês com 500 notas.
- **Documentos:** NF-e, NFC-e e NFS-e na mesma plataforma.
- **Motor fiscal:** calcula ICMS e DIFAL pela UF de destino. Aqui quase tudo é imune, mas os campos de sobreposição ficam disponíveis.
- **Contingência automática:** usa SVC-AN ou SVC-RS quando a Sefaz cai. **A chave de acesso muda na contingência**, e a única fonte da verdade é a chave devolvida no webhook ou na consulta.
- **Arquivos:** DANFE A4 e XML sob demanda, por API.
- **Webhooks:** assinados com HMAC-SHA256.

Contrato, com todas as rotas sob `https://platform.notaas.com.br/api/v1` e o cabeçalho `x-api-key`:

| Uso | Chamada | Resposta |
|---|---|---|
| Emitir | `POST /nfe/emitir` | `202` `{ invoiceId, status: "queued" }`. **Assíncrono.** `400` em erro de validação, antes de enfileirar |
| Status | `GET /nfe/invoices/{id}/status` | `status` ∈ `queued`, `processing`, `issued`, `error`, `cancelled`, `inutilized` (detalhes abaixo) |
| Cancelar | `POST /nfe/cancelar` `{ invoiceId, motivo }` | `202` assíncrono. O `motivo` tem de **15 a 255** caracteres. `422` se o status não é `issued` ou **o prazo de 24 h expirou** |
| Carta de correção | `POST /nfe/invoices/{id}/correcao` | síncrona. Não altera impostos, emitente ou destinatário |
| DANFE (PDF) | `GET /nfe/invoices/{id}/danfe` | PDF A4. Na nota cancelada, sai com a marca d'água "NOTA CANCELADA" |
| XML | `GET /nfe/invoices/{id}/xml[?type=cancel]` | `nfeProc` autorizado, ou `procEventoNFe` do cancelamento |
| Webhook | `POST /webhooks/endpoints` `{ url, events, secret }` | eventos `nfe.issued`, `nfe.error` e `nfe.cancelled` |

Detalhes do status:
- Com `issued` ou `cancelled`, a resposta traz `numero`, `serie`, `chaveAcesso` (44 dígitos), `protocolo`, `codigoStatus`, `motivo`, `tpAmb`, `pdfUrl` e `xmlUrl`.
- Com `error`, traz `codigoStatus` (a rejeição da Sefaz), `motivo` e `errorMessage`.

Mais três pontos do contrato:
- **Ambiente:** o de homologação e o de produção são definidos **por projeto** na Notaas, cada um com a sua chave de API. O status devolve `tpAmb`, que é conferido (A6).
- **Webhook:**
  - traz os cabeçalhos `X-Notaas-Event`, `X-Notaas-Delivery` (id único da entrega) e `X-Notaas-Signature`;
  - a assinatura é `sha256=` + HMAC-SHA256 do corpo **bruto** com o secret;
  - são 5 tentativas (imediata, 1 min, 5 min, 30 min e 2 h), com timeout de 10 s.
- **Arquivos:** não ficam em CDN público. O DANFE e o XML exigem a chave de API para baixar.

### Pré-requisitos fiscais (do usuário e do contador)
Nada disto é decisão de código, e a Fase 1 não emite em produção sem os dados:
- CNPJ, **inscrição estadual**, **UF** e endereço do emitente, no cadastro da empresa na Notaas.
- **Regime (CRT):** 1 (Simples, usa CSOSN), 3 (normal, usa CST) ou 4 (MEI).
- Para o item "livro digital":
  - **NCM**;
  - **CFOP** da venda dentro da UF e para outra UF a consumidor final não contribuinte;
  - **CSOSN ou CST** da operação imune;
  - **CST de PIS e COFINS**;
  - se o item leva o grupo de **IBS e CBS** em 2026, e com qual `cClassTrib`;
  - o **texto de informação complementar** (`infCpl`) citando a imunidade.
- **Natureza da operação** (ex.: "Venda de livro digital").
- **Presença do comprador** 2 (internet) e **indicador de intermediador** 0 (venda no próprio site; o Mercado Pago processa o pagamento e não é marketplace). **Confirmar.**
- **Série** da NF-e e o último número usado, se a empresa já emite NF-e por outro sistema (a Notaas tem configuração de numeração).
- **Estorno depois de 24 horas:** qual documento emitir, em geral uma NF-e de devolução (`finalidade` 4, com `nfesReferenciadas`) (decisão A7).
- **Pedidos já pagos sem endereço:** como emitir a nota deles (decisão A3).
- **Certificado digital ICP-Brasil A1** (e-CNPJ), **enviado à Notaas** no cadastro da empresa, e não à nossa API.
- Dois projetos na Notaas (**homologação** e **produção**), com as chaves de API e o webhook de cada um.
- A classificação da aplicação no Mercado Pago, hoje "Produto físico", revista junto com o contador para o produto que ele definiu. Está pendente desde a Spec 014.

### Decisões

**A1. Um cliente da Notaas atrás de uma interface própria.**
- Tudo da Notaas fica em `api/src/invoices/notaas/`:
  - `NotaasClient`, que faz as chamadas da tabela acima;
  - `NfeBuilder`, que faz `order → corpo de /nfe/emitir`.
- O resto do sistema fala com a interface `InvoiceGateway` (`emit`, `status`, `cancel`, `downloadPdf`, `downloadXml`). Outro emissor seria outra implementação dela.
- O `NfeBuilder` monta:
  - `modelo` 55, `naturezaOperacao`, `finalidade` 1 e `consumidorFinal` 1;
  - `presencaComprador` e `indicadorIntermediador` da configuração fiscal;
  - `transporte.modalidadeFrete` 9 (produto digital, sem frete);
  - `dest`: `cpf`, `nome` e `endereco` (A3), com `indicadorIE` 9 (não contribuinte). **Sem** `dest.email`, porque o e-mail da nota é nosso (A8) e a Notaas mandaria um segundo;
  - **um item por módulo do pedido**, com `descricao`, `codigo` (id do módulo), `ncm`, `cfop` (interno ou interestadual pela UF do destinatário), `csosn` ou `cst`, `cstPis`, `cstCofins` e `valorTotal`;
  - `pagamentos`: `tipoPagamento` 17 (PIX) ou 03 (cartão de crédito), com o valor do pedido;
  - `infCpl` com o texto da imunidade.

  **Nenhum código fiscal fica fixo no código**: todos vêm da configuração (ver "Variáveis de ambiente").

**A2. Nota duplicada: sem referência nossa, o `invoiceId` é gravado antes de qualquer outra coisa, e o timeout não reenvia sozinho.**
A Notaas **não aceita uma referência do cliente** na emissão de NF-e: não achamos `ref` nem chave de idempotência na documentação. Duas chamadas a `/nfe/emitir` para o mesmo pedido geram **duas NF-e válidas**. Por isso:
- **Um pedido, uma `Invoice`** (`orderId @unique`). A linha é criada em `PENDING` **antes** do `POST`.
- O `invoiceId` devolvido no `202` é gravado **na mesma hora** (`providerInvoiceId`). Toda operação seguinte usa ele.
- **Timeout ou erro de rede sem resposta:** a nota pode ter sido enfileirada. A `Invoice` vai para **`UNKNOWN`**, e **nada a reenvia automaticamente**, nem o cron nem o retry. O painel mostra "Verificar no painel da Notaas" com duas saídas:
  - **vincular** o `invoiceId` encontrado lá;
  - **"Emitir de novo"**, com uma confirmação explícita de que não existe nota para o pedido.

  Como a emissão só enfileira e responde `202` na hora, o caso é raro.
- **`400` (validação antes de enfileirar):** nada foi criado. Vai para `ERROR`, e o reenvio é seguro depois da correção.
- **Duplicata que escape:** cancela-se a segunda nota pelo painel dentro de 24 horas (A7).
- **Task 1.5:** perguntar ao suporte da Notaas se há chave de idempotência ou referência externa para NF-e. Se houver, ela entra aqui, e o `UNKNOWN` passa a reenviar com segurança.

**A3. Dados do destinatário no pedido, com endereço, porque a NF-e exige.**
A Notaas marca o destinatário da NF-e como **obrigatório, com CPF e endereço**. Os campos obrigatórios são `logradouro`, `bairro` e `uf`, mais `codigoMunicipio` e `cidade` no Brasil.
- **Checkout:** passa a pedir **CEP, número e complemento**. O logradouro, o bairro, a cidade, a UF e o **código IBGE** vêm do ViaCEP (`https://viacep.com.br/ws/{cep}/json/`), e o comprador pode corrigir o logradouro e o bairro.
- A UF também define o **CFOP** (interno ou interestadual, A1).
- **`Order` ganha:** `payerDocument` (CPF, só dígitos), `payerName`, `payerZip`, `payerStreet`, `payerNumber`, `payerComplement`, `payerDistrict`, `payerCity`, `payerCityIbge` e `payerState`, gravados na criação.
- **Base legal (LGPD):** cumprimento de obrigação legal, porque a nota exige o destinatário. Os dados não saem em nenhuma resposta além da do próprio comprador e do painel financeiro, e nunca em log.
- **Pedidos já pagos antes da migration** (a primeira venda real, Spec 022):
  - o CPF é lido do pagamento no Mercado Pago (`payer.identification`), por um script único de backfill;
  - o **endereço não existe** em lugar nenhum. A nota desses pedidos espera a definição do contador (Task 1.1), que pode ser pedir o endereço ao comprador por e-mail.
- A Política de Privacidade precisa citar a nota fiscal como finalidade do CPF e do endereço. **Conferir** o texto publicado (Spec 015 ou 022).

**A4. Emissão disparada pela aprovação, sem travar o pagamento.**
Quando `apply` tira o pedido de pendente para `PAID`, depois de conceder o acesso:
1. cria-se a `Invoice` em `PENDING`;
2. chama-se `POST /nfe/emitir`, com timeout de 10 s;
3. conforme a resposta:
   - **`202`:** grava o `invoiceId` e passa a `PROCESSING`;
   - **`400`:** `ERROR`, com a mensagem crua;
   - **sem resposta:** `UNKNOWN` (A2).

A regra central é que **uma falha da Notaas nunca desfaz nem atrasa o pagamento**:
- a chamada é protegida por `try/catch`;
- o webhook do Mercado Pago continua respondendo `200`;
- a nota é assunto do painel, não do comprador.

**A5. O desfecho chega por webhook assinado, com reconsulta como rede.**
- **Cadastro:** um endpoint em `POST /webhooks/endpoints`, com os eventos `nfe.issued`, `nfe.error` e `nfe.cancelled` e um `secret`, apontando para `api.delcastanher.srv.br/webhooks/notaas`. Um por projeto, ou seja, por ambiente.
- **Verificação:** a rota confere `X-Notaas-Signature` contra `sha256=` + HMAC-SHA256 do **corpo bruto**, com comparação em tempo constante, e recusa com `401` sem assinatura válida. O NestJS passa a guardar o corpo bruto (`rawBody: true` em `main.ts`) para esta rota.
- **Corpo não confiado:** como no Mercado Pago, a rota lê só o `invoiceId`, acha a `Invoice` por `providerInvoiceId` e **reconsulta** `GET /nfe/invoices/{id}/status`, gravando o que a consulta diz. Um `invoiceId` desconhecido é ignorado com `200`. A reconsulta também torna inofensivas as entregas repetidas (`X-Notaas-Delivery`).
- **Tradução do status:**
  - `queued` e `processing` → `PROCESSING`;
  - `issued` → `AUTHORIZED`, com número, série, chave e protocolo;
  - `error` → `DENIED`, com `codigoStatus`, `motivo` e `errorMessage`;
  - `cancelled` → `CANCELLED`.
- **Rede:** a Notaas desiste depois de 5 tentativas, a última 2 h depois. O cron diário que já existe na API (`vercel.json`, Spec 020) ganha uma segunda rota, `/internal/invoices/reconcile`. Ela trata o que está parado há mais de 1 hora:
  - `PROCESSING`: reconsulta o status;
  - `PENDING` sem `providerInvoiceId`: a chamada nunca saiu, e é reenviada;
  - `AUTHORIZED` sem XML ou PDF guardado: baixa de novo (A8).

  **`UNKNOWN` e `ERROR` nunca são reenviados pelo cron** (A2).

**A6. Ambiente fiscal amarrado ao ambiente da Vercel, porque o banco é um só.**
Preview e produção usam o mesmo banco, como já tratado na Spec 020 com o `liveMode`.
- A chave de API de **produção** (`NOTAAS_API_KEY`) só existe no ambiente Production da Vercel. Em preview e em desenvolvimento, a variável tem a chave do projeto de **homologação**.
- `NFE_ENV` (`producao` ou `homologacao`) diz o que se espera.
- **Trava:** o `tpAmb` devolvido no status precisa bater com o `NFE_ENV`. Se não bater, a `Invoice` vai para `ERROR` com "chave de API do ambiente errado", e o painel alerta.
- Sem `NFE_ENV`, o ambiente é homologação. Uma variável esquecida nunca emite nota real.
- A `Invoice` grava o `environment` em que nasceu. O painel mostra as notas de homologação com um selo, e o cron só reconcilia as do seu próprio ambiente.
- Uma venda de teste feita no preview **nunca** gera nota com valor fiscal.

**A7. Estorno: cancelar dentro de 24 horas, e o documento do contador fora delas.**
Quando `apply` leva o pedido a `REFUNDED`, depois de revogar o acesso, e a nota está `AUTHORIZED`:
- **Dentro de 24 horas da autorização:** `POST /nfe/cancelar` com o `motivo` "Venda desfeita: pagamento estornado ao comprador", que tem entre 15 e 255 caracteres.
  - O `202` leva a `Invoice` a `CANCELLING`.
  - O webhook `nfe.cancelled` ou a reconsulta levam a `CANCELLED`.
- **`422` por prazo expirado, ou mais de 24 horas passadas:** a `Invoice` vai para **`REFUND_PENDING`**, e o painel mostra "estorno fora do prazo de cancelamento". O documento é o que o contador definir, em geral uma **NF-e de devolução** (`finalidade` 4, com `nfesReferenciadas` = chave original), que a Notaas emite pelo mesmo `/nfe/emitir`.
  - **Nesta spec a devolução não é automática.** Ela fica como pendência no painel. Automatizá-la vira a ação "Emitir devolução" assim que o contador fixar o formato, sem mudar o modelo.
- **Outro `422`:** `CANCEL_ERROR`, com a mensagem.

**A8. XML e PDF guardados por nós, e o e-mail é nosso.**
- Assim que a nota é autorizada, a API baixa o XML (`/xml`) e o DANFE (`/danfe`) com a chave de API e os guarda no Storage da Spec 010, em `invoices/{environment}/{chaveAcesso}.xml` e `.pdf`.
  - O **XML** autorizado é o documento fiscal e precisa ser guardado.
  - No cancelamento, guarda-se também o XML do evento (`?type=cancel`).
  - O `StorageService` ganha um método de gravação pelo servidor, porque hoje ele só emite URL de upload para o navegador.
- A API manda pelo Resend (Parte B, decisão B1) o e-mail transacional "Sua nota fiscal", com o número, a chave de acesso e o **DANFE e o XML em anexo**.
- O e-mail só sai quando os arquivos estão guardados. Se o download falhar, o cron tenta de novo (A5).
- O e-mail transacional **ignora o descadastro de marketing** (decisão B5), porque é documento da compra.

**A9. O painel financeiro mostra a nota de cada pedido.**
A listagem de pedidos da Spec 016 (`GET /admin/finance/orders`) ganha a situação e o número da nota. As ações dependem do status:
- **Emitir de novo:**
  - para `ERROR` e `DENIED`, depois de corrigir a causa. Cria uma nota nova na Notaas, e o `invoiceId` anterior fica em `lastError`;
  - para `UNKNOWN`, só com a confirmação da decisão A2.
- **Vincular nota existente:** para `UNKNOWN`, informando o `invoiceId` visto no painel da Notaas.
- **Cancelar:** para `AUTHORIZED` dentro de 24 horas. É a saída para uma duplicata (A2).
- **Reenviar e-mail** e **Baixar PDF:** para `AUTHORIZED`. O PDF sai por URL assinada de leitura do Storage.

Pedidos em `REFUND_PENDING` e `UNKNOWN` aparecem com destaque. O CSV de exportação da Spec 016 ganha as colunas de número, série, chave de acesso e situação da nota.

**A10. O certificado A1 fica na Notaas, e não na nossa API.**
- O `.pfx` e a senha são enviados pelo usuário no painel da Notaas, no cadastro da empresa. A API só guarda a chave de API.
- O vencimento anual do certificado derruba toda emissão. **Conferir** se a Notaas avisa o vencimento. Se não avisar, a data vai em `NFE_CERT_EXPIRES_AT`, e o cron registra em log e o painel mostra um aviso **30 dias antes**.

### Modelo de dados (Parte A)
```prisma
model Invoice {
  id                String        @id @default(cuid())
  orderId           String        @unique
  status            InvoiceStatus @default(PENDING)
  environment       String                     // 'homologacao' | 'producao' (A6)
  amountCents       Int                        // copia do pedido na emissao

  /// `invoiceId` da Notaas, gravado assim que o `202` chega (A2). Nulo em
  /// PENDING (chamada nao saiu) e em UNKNOWN (saiu sem resposta).
  providerInvoiceId String?       @unique

  number            String?                    // `numero`
  series            String?                    // `serie`
  /// `chaveAcesso`, 44 digitos. Pode mudar se a Notaas cair em contingencia:
  /// vale sempre a da ultima consulta.
  accessKey         String?       @unique
  protocol          String?                    // `protocolo`
  xmlPath           String?                    // Storage (A8)
  pdfPath           String?                    // Storage (A8)
  cancelXmlPath     String?                    // Storage (A8)
  /// Resposta crua no ultimo erro (`codigoStatus` + `motivo` + `errorMessage`),
  /// sem traducao (mesma regra do `mpStatusDetail`).
  lastError         String?

  issuedAt          DateTime?
  cancelledAt       DateTime?
  emailedAt         DateTime?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  order Order @relation(fields: [orderId], references: [id], onDelete: Restrict)

  @@index([status, environment, updatedAt])   // o cron de reconciliacao (A5)
  @@map("invoices")
}

enum InvoiceStatus {
  PENDING PROCESSING UNKNOWN AUTHORIZED DENIED ERROR
  CANCELLING CANCELLED CANCEL_ERROR REFUND_PENDING
}
```
O `Order` ganha os campos do destinatário da decisão A3. O CPF e o nome ficam nulos até o backfill, e o endereço fica nulo nos pedidos anteriores à spec.

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
| `POST` | `/webhooks/notaas` | Notaas, assinatura HMAC | lê o `invoiceId` e reconsulta o status (A5) |
| `GET` | `/internal/invoices/reconcile` | cron da Vercel (`CRON_SECRET`) | reconsulta `PROCESSING`, reenvia `PENDING` que nunca saiu, baixa XML e PDF que faltam, e avisa o vencimento do certificado (A5 e A10) |
| `POST` | `/admin/invoices/:orderId/issue` | admin | emite de novo; em `UNKNOWN`, exige confirmação (A2 e A9) |
| `POST` | `/admin/invoices/:orderId/link` | admin | vincula um `invoiceId` existente a uma nota `UNKNOWN` (A9) |
| `POST` | `/admin/invoices/:orderId/cancel` | admin | cancela dentro de 24 horas (A7 e A9) |
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
| `NOTAAS_API_KEY` | segredo | usuário | chave do projeto de **produção** em Production; do de **homologação** em Preview e Development (A6) |
| `NOTAAS_WEBHOOK_SECRET` | segredo | usuário | secret do endpoint de webhook de cada projeto (A5) |
| `NFE_ENV` | config | Claude | `producao` só em Production; `homologacao` no resto (A6) |
| `NFE_NATUREZA_OPERACAO`, `NFE_NCM`, `NFE_CFOP_INTERNO`, `NFE_CFOP_INTERESTADUAL`, `NFE_CSOSN` ou `NFE_CST`, `NFE_CST_PIS`, `NFE_CST_COFINS`, `NFE_PRESENCA_COMPRADOR`, `NFE_INDICADOR_INTERMEDIADOR`, `NFE_INF_CPL`, `NFE_EMITENTE_UF` | config | Claude | dados fiscais do contador (A1) |
| `NFE_CANCEL_WINDOW_HOURS` | config | Claude | prazo de cancelamento, `24` (A7) |
| `NFE_CERT_EXPIRES_AT` | config | Claude | vencimento do A1, se a Notaas não avisar (A10) |
| `RESEND_API_KEY` | segredo | usuário | envio de e-mail (B1) |
| `EMAIL_FROM` | config | Claude | remetente, ex.: `Lidiane Delcastanher <contato@mail.delcastanher.srv.br>` |
| `EMAIL_UNSUBSCRIBE_SECRET` | segredo | usuário | HMAC do link de descadastro (B5) |

## Integração com o existente
- **`api/src/payments/orders.service.ts`:** em `apply`, emitir depois do acesso (A4) e cancelar depois da revogação (A7). A criação do pedido grava `payerDocument` e `payerName` (A3).
- **`api/src/invoices/`** (módulo novo): a interface `InvoiceGateway`, a implementação em `notaas/` (`NotaasClient`, `NfeBuilder`), o `InvoicesService`, o webhook e a rota do cron.
- **`api/src/main.ts`:** `rawBody: true`, para a verificação do HMAC do webhook (A5).
- **`api/src/storage/storage.service.ts`:** gravação de arquivo pelo servidor, para o XML e o PDF (A8).
- **`api/src/payments/dto/create-order.dto.ts` e o checkout do front:** CEP, número e complemento do comprador, com o ViaCEP preenchendo o resto (A3).
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
- O `NfeBuilder` monta o corpo com CPF, nome e endereço do destinatário, um item por módulo, o CFOP interno ou interestadual pela UF, o CSOSN ou CST imune, os pagamentos pelo método do pedido e o `infCpl`, **sem** `dest.email`. Todo código fiscal vem da configuração.
- `apply` → `PAID` cria a `Invoice` e chama `/nfe/emitir` uma vez. Um segundo `apply` do mesmo pedido não emite de novo.
- `202` grava o `providerInvoiceId` na hora. `400` vira `ERROR`. Timeout vira `UNKNOWN`, e **nem o cron nem o retry** o reenviam.
- Uma falha da Notaas **não** muda o pedido, o acesso nem a resposta do webhook do Mercado Pago.
- O webhook com assinatura HMAC inválida ou ausente dá `401`. Com assinatura válida, o status gravado é o da reconsulta, e não o do corpo. `invoiceId` desconhecido dá `200` sem efeito.
- `issued` grava número, série, chave e protocolo, baixa XML e PDF para o Storage e manda o e-mail uma vez só, com os anexos. Uma chave diferente numa consulta posterior (contingência) substitui a gravada.
- O `tpAmb` que não bate com o `NFE_ENV` vira `ERROR` com alerta.
- `apply` → `REFUNDED` com nota `AUTHORIZED` há menos de 24 horas cancela. Com mais de 24 horas, ou com `422` de prazo, vira `REFUND_PENDING`. O estorno nunca é desfeito.
- "Vincular" grava o `invoiceId` informado e reconsulta. "Emitir de novo" em `UNKNOWN` exige a confirmação.
- O cron reconcilia só o próprio ambiente, e só o que está parado há mais de 1 hora.
- CPF, endereço e chave de API não aparecem em log nem em resposta pública.

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
- Uma venda real gera a NF-e autorizada, que confere na consulta pública da Sefaz, o e-mail chega com o DANFE e o XML anexos, e um estorno de teste dentro de 24 horas a cancela.
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
- NFS-e: o contador definiu NF-e de livro digital (Parte A).
- Emissão automática da NF-e de devolução no estorno fora do prazo (A7). Fica como pendência no painel até o contador fixar o formato.
- NFC-e e carta de correção pelo painel.
- Nota fiscal de venda com valor parcial estornado. O estorno parcial já não é representável (Spec 016, decisão 9).
- Correção fiscal de nota que não pôde ser cancelada no prazo (A7), que é trabalho da contabilidade.
- Editor visual de e-mail, imagens no corpo, anexos e agendamento de campanha.
- Segmentos livres ou por filtro montado no painel.
- Métricas de abertura e clique, e webhook de entrega do Resend.
- Fila de envio, enquanto o público couber numa execução (B4).
- E-mails transacionais além da nota fiscal, como a confirmação de compra e o lembrete de PIX. O `MailService` desta spec é a base deles.
- Vídeo no Mux, autoplay, vídeo na hero e vídeo em `/cursos/imersao-rh`.
