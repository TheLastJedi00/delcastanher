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

**Para o Simples Nacional, o padrão nacional deixou de ser opção.** A [Resolução CGSN nº 189/2026](https://cnm.org.br/comunicacao/noticias/cgsn-publica-resolucao-que-torna-obrigatoria-a-nfs-e-nacional-para-empresas-do-simples-a-partir-de-setembro), em vigor desde **2026-09-01**, obriga ME e EPP optantes a emitir a NFS-e pelo Emissor Nacional, pelo portal ou por API. Se o CNPJ da Delcastanher for do Simples, a Sefin Nacional é o caminho obrigatório. A Task 1.1 confirma o regime.

**O preço de ir direto:** o trabalho que um intermediário faria passa a ser nosso:
- montar o XML da DPS e assiná-lo (XMLDSig);
- compactar (GZip + Base64);
- conectar com o certificado A1 (mTLS);
- **gerar o PDF da nota** (decisão A8);
- acompanhar as mudanças de layout, como os grupos de IBS e CBS da reforma.

**Alternativa: Focus NFe (paga).** Ela entra se o CNPJ não for do Simples e o município mantiver sistema próprio, ou se a assinatura e a homologação travarem. A versão da spec do commit `253ab5f` tem esse desenho. Ele muda só o cliente e a forma de receber o desfecho: a Focus tem webhook e entrega o PDF. O modelo de dados, os status, o painel e o e-mail continuam iguais (decisão A1).

### O que já foi apurado da API (2026-09-29)
**A documentação oficial também está atrás do mTLS.**
- Os Swaggers da Sefin e do ADN, listados em [APIs - Prod. Restrita e Produção](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/apis-prod-restrita-e-producao), negam o acesso sem certificado de cliente.
- A Sefin responde `403`, inclusive em `https://sefin.producaorestrita.nfse.gov.br/API/SefinNacional/docs/index`, que é o link oficial de produção restrita.
- O ADN fecha a conexão sem resposta.

Só com o certificado A1 em mãos é possível abrir o Swagger (Task 1.5).

Por isso, o contrato abaixo vem de três integrações abertas que já emitem pela Sefin, e as três concordam entre si:
- [Unimake/DFe](https://github.com/Unimake/DFe), em `Servicos/Config/NFSe/NACIONAL.xml` (.NET);
- [nfewizard-io](https://github.com/nfewizard-org/nfewizard-io), em `packages/shared/src/config/NFSeServicosUrl.json` (Node);
- [nfse-sem-gateway](https://github.com/tarikbc/nfse-sem-gateway) (MIT, 2026-09). É um guia de uma integração Node que fez **emitir → consultar → cancelar** em produção restrita e em produção, com os códigos de rejeição encontrados.

Tudo aqui é **confirmado no Swagger e na produção restrita** antes de virar código de produção.

Hosts, com todos os paths sob `/SefinNacional`:

| | Produção restrita (testes, `tpAmb` 2) | Produção (`tpAmb` 1) |
|---|---|---|
| Sefin | `https://sefin.producaorestrita.nfse.gov.br/SefinNacional` | `https://sefin.nfse.gov.br/SefinNacional` |
| ADN | `https://adn.producaorestrita.nfse.gov.br` | `https://adn.nfse.gov.br` |

Chamadas. Todas usam `Content-Type: application/json` e mTLS, e o XML sempre viaja em GZip + Base64 dentro de um campo JSON:

| Uso | Chamada | Sucesso |
|---|---|---|
| Emitir | `POST /SefinNacional/nfse` `{ dpsXmlGZipB64 }` | `201` `{ chaveAcesso, nfseXmlGZipB64 }`, **síncrono** |
| Recuperar pela DPS | `GET /SefinNacional/dps/{idDps}` | `200` com a `chaveAcesso` da nota gerada por aquela DPS |
| Consultar a nota | `GET /SefinNacional/nfse/{chaveAcesso}` | `200` `{ nfseXmlGZipB64 }` |
| Cancelar | `POST /SefinNacional/nfse/{chaveAcesso}/eventos` `{ pedidoRegistroEventoXmlGZipB64 }` | `201` `{ eventoXmlGZipB64 }` |
| Convênio do município | `GET {ADN}/parametrizacao/{codigoMunicipio}/convenio` | se o município está no Sistema Nacional (Task 1.5) |

Mais três pontos do contrato:
- **Rejeições** chegam como `4xx` com `{ "erros": [{ codigo, mensagem }] }`. O cliente HTTP não pode lançar exceção em não-2xx, porque o corpo é o diagnóstico.
- **O número da nota** (`nNFSe`) só existe **dentro do XML devolvido**, que é descompactado e lido. A `chaveAcesso` (50 dígitos) vem no JSON.
- **Não existe mais API de PDF.** A API do DANFSe no ADN foi **suspensa em 2026-08-03** pela [NT SE/CGNFS-e 008/2026, v1.02](https://www.gov.br/nfse/pt-br/noticias/se-cgnfs-e-publica-nota-tecnica-no-008-2026-com-regras-para-emissao-do-danfse). Desde então, quem emite gera o PDF a partir do XML autorizado (decisão A8).

### Pré-requisitos fiscais (do usuário e da contabilidade)
Nada disto é decisão de código, e a Fase 1 não emite em produção sem os dados:
- CNPJ e município (código IBGE) do prestador.
- **Regime tributário.** No Simples, o padrão nacional é obrigatório (CGSN 189/2026). Fora dele, confirma-se o convênio do município (tabela acima).
- **`cTribNac`**, o código nacional de 6 dígitos do serviço, derivado do item da LC 116. A contabilidade confirma, porque é ele que define o ISS.
- Os campos do perfil tributário (decisão A2) e se a DPS precisa do grupo de IBS e CBS para este CNPJ.
- Texto padrão da descrição do serviço.
- **Certificado digital ICP-Brasil A1** (e-CNPJ) em `.pfx`, com a senha. É pago à certificadora e renovado todo ano. O A3 (token ou cartão) não serve, porque a API roda sem ninguém por perto.
- Se o CNPJ já emitiu nota pelo Emissor Nacional, com a numeração usada na série da API, se houver.
- Correção da classificação da aplicação no Mercado Pago, de "Produto físico" para serviço. Está pendente desde a Spec 014 e é feita junto.

### Decisões

**A1. Módulos pequenos, isolados e testáveis sem rede.**
Tudo do Sistema Nacional fica em `api/src/invoices/sefin/`, na divisão usada pelo guia nfse-sem-gateway:
- **`A1Credential`:** abre o `.pfx` uma vez e guarda em cache (`node-forge`). Entrega:
  - o `pfx` e a senha, para o `https.Agent` do mTLS;
  - a chave e o certificado em PEM, para a assinatura;
  - a data de vencimento (decisão A10).
- **`DpsBuilder`** e **`CancelEventBuilder`:** montam o XML com `xmlbuilder2`, em ordem explícita de elementos, porque **a ordem é validada**.
- **`XmlSigner`:** assinatura envelopada do `infDPS` e do `infPedReg`, com `xml-crypto`:

  | Parâmetro | Valor |
  |---|---|
  | Algoritmo | RSA-SHA256 (`http://www.w3.org/2001/04/xmldsig-more#rsa-sha256`) |
  | Digest | SHA-256 (`http://www.w3.org/2001/04/xmlenc#sha256`) |
  | Canonicalização | C14N (`http://www.w3.org/TR/2001/REC-xml-c14n-20010315`) |
  | Transforms | `enveloped-signature`, depois C14N |
  | Referência | `#<Id>` do elemento assinado |
  | `KeyInfo` | com o `<X509Certificate>` |

  A `<Signature>` entra como **irmã seguinte** do `infDPS`. Depois de assinar, **prefixa-se** `<?xml version="1.0" encoding="UTF-8"?>`: sem o prólogo, a Sefin rejeita com **E1229**, e o prólogo fica fora da parte assinada. O algoritmo fica numa configuração, porque exemplos antigos usam SHA-1.
- **`SefinClient`:** as chamadas da tabela acima, com GZip + Base64 (`node:zlib`) e timeout de 10 s. Lê `erros[]` nas rejeições e o XML devolvido com `fast-xml-parser`.
- **`DanfseRenderer`:** gera o PDF (decisão A8).

O resto do sistema fala com uma interface `InvoiceGateway` (`emit`, `findByDps`, `cancel`). Trocar pela Focus (a alternativa acima) é escrever outra implementação dela.

Os testes de todos os módulos rodam sem rede e sem o certificado real. Usam um certificado autoassinado gerado nos fixtures, o XSD oficial para validar o XML e um servidor HTTP falso para o cliente.

**A2. A DPS tem número próprio, reservado antes do envio, e é ela que impede nota duplicada.**
A identidade da nota é o **Id da DPS**, com 45 caracteres:

```
"DPS" + cLocEmi(7) + tpInsc(1, 2 = CNPJ) + CNPJ(14) + serie(5, com zeros) + nDPS(15, com zeros)
```

Exemplo: `DPS` + `4115200` + `2` + `11222333000181` + `00001` + `000000000000042`.

Uma DPS com o mesmo Id não gera segunda nota.
- **Série `1`** para a API. A série **70000** é do emissor web do portal, com numeração própria. Uma nota digitada à mão no portal nunca colide com as da API, mas também não entra na nossa contagem.
- O `nDPS` vem de uma **sequência no Postgres** por ambiente. Ele é gravado na `Invoice` **antes** do envio (commit antes do `POST`) e nunca muda. Número queimado por rejeição é permitido (lacunas são aceitas). Número reusado numa DPS diferente, não.
- Se o CNPJ já emitiu pela API na série 1 com outro sistema, a sequência começa **depois do último número usado** (Task 1.1).
- **Toda nova tentativa** (cron, timeout) reenvia **a mesma DPS**. Antes de reenviar uma nota em estado incerto, consulta-se `GET /dps/{idDps}`: se a nota existe, só se grava a chave.
- **Um pedido, uma `Invoice`** (`orderId @unique`).

**Por que gravar a `Invoice` antes do envio, contra o conselho do guia.** O nfse-sem-gateway manda **não** pré-gravar linha pendente, porque lá uma linha pendente contava zero numa soma de "quanto já foi faturado" e gerava segunda nota. Aqui a nota é **por pedido** (`orderId @unique`), e não por soma de período. A linha pré-gravada é justamente o que guarda o `nDPS` para a consulta pela DPS. Não existe caminho que emita uma segunda DPS para o mesmo pedido, a não ser o "Emitir de novo" de uma DPS **rejeitada** (A9), que por definição não gerou nota.

Perfil tributário, na **referência** do guia para Simples Nacional (ME/EPP), sem retenção de ISS. Cada valor tem um código de rejeição associado. **A contabilidade confirma antes da produção restrita:**

| Campo | Valor | Se errar |
|---|---|---|
| `tpEmit` | `1` (prestador) | |
| `opSimpNac` | `3` (ME/EPP) | |
| `regApTribSN` | `1` | E0166 se ausente |
| `regEspTrib` | `0` | |
| `tribISSQN` | `1` | |
| `tpRetISSQN` | `1` (ISS não retido, pago no DAS) | |
| alíquota do ISS | **omitida** | E0625 se enviada |
| `IM` do prestador | **omitida** | E0120 onde o município não tem cadastro complementar |
| `vTotTribFed`, `vTotTribEst`, `vTotTribMun` | `0.00` | |
| `dCompet` | data de `paidAt` (mês da prestação) | |
| `dhEmi` | ISO 8601 com `-03:00` | |

O perfil sai de variáveis de configuração, e não do código (ver "Variáveis de ambiente").

**A3. Gravar os dados do tomador no pedido.**
O `Order` ganha `payerDocument` (CPF, só dígitos) e `payerName`, gravados na criação a partir do que o checkout já recebe.
- **Endereço do tomador:** o guia monta o tomador com município (IBGE), CEP e endereço, e registra a rejeição **E1235** por aninhamento errado desses campos. Para tomador pessoa física, **confere-se na produção restrita** se o endereço é obrigatório (Task 1.5).
  - Se for, o checkout passa a pedir o CEP, e o município (IBGE) e o logradouro vêm do ViaCEP (`https://viacep.com.br/ws/{cep}/json/`, campo `ibge`).
  - Se não for, a nota sai só com CPF e nome.
- **Base legal (LGPD):** cumprimento de obrigação legal, porque a nota exige o tomador. O dado não sai em nenhuma resposta além da do próprio comprador e do painel financeiro, e nunca em log.
- **Pedidos já pagos antes da migration** (a primeira venda real, Spec 022): o CPF é lido do pagamento no Mercado Pago (`payer.identification`), por um script único de backfill, com a conta da `mpConnectionId` de cada pedido.
- A Política de Privacidade precisa citar a nota fiscal como finalidade do CPF. **Conferir** o texto publicado (Spec 015 ou 022).

**A4. Emissão disparada pela aprovação, sem travar o pagamento.**
Quando `apply` tira o pedido de pendente para `PAID`, depois de conceder o acesso:
1. cria-se a `Invoice` em `PENDING`, com o número da DPS reservado (A2);
2. monta-se, assina-se e envia-se a DPS;
3. conforme a resposta:
   - **`201`:** `AUTHORIZED`, com a chave de acesso, o `nNFSe` lido do XML e o XML guardado;
   - **`4xx` com `erros[]`:** `DENIED`, com a lista crua;
   - **timeout ou erro de rede:** `UNKNOWN`. A DPS pode ter chegado, e só a consulta pela DPS responde.

A regra central é que **uma falha da Sefin nunca desfaz nem atrasa o pagamento**:
- a chamada é protegida por `try/catch`;
- o webhook do Mercado Pago continua respondendo `200`;
- a nota é assunto do painel, não do comprador.

Para não segurar a resposta do webhook do Mercado Pago, a emissão tem **timeout curto** (10 s). O que não couber nele vira `UNKNOWN` e fica para o cron.

Se a nota foi emitida e o Storage falhar depois, a `Invoice` **continua `AUTHORIZED`**, porque a nota existe no governo. Os arquivos são refeitos pelo cron a partir de `GET /nfse/{chaveAcesso}`.

**A5. Sem webhook: o cron diário é a rede.**
A emissão é síncrona, e o Sistema Nacional não avisa ninguém. O que fica pendente é resolvido pelo cron diário que já existe na API (`vercel.json`, Spec 020), com uma segunda rota, `/internal/invoices/reconcile`. Ela trata as notas paradas há mais de 1 hora:
- `UNKNOWN`: consulta `GET /dps/{idDps}`. Se a nota existe, grava a chave e segue como `AUTHORIZED`. Se não existe, reenvia a mesma DPS.
- `PENDING` e `ERROR` (falha antes do envio, como certificado ilegível): reenvia.
- `AUTHORIZED` sem XML ou sem PDF guardado: consulta a nota, guarda o XML e gera o PDF (A8).

`DENIED` **não** é reenviado sozinho: a mesma DPS seria rejeitada de novo. Ele espera a correção e o "Emitir de novo" do painel (A9).

**A6. Ambiente fiscal amarrado ao ambiente da Vercel, porque o banco é um só.**
Preview e produção usam o mesmo banco, como já tratado na Spec 020 com o `liveMode`.
- `NFSE_ENV` é `producao` (`tpAmb` 1, host de produção) **só** no ambiente Production da Vercel. Em preview, em desenvolvimento e **na ausência da variável** é `producao_restrita` (`tpAmb` 2). Uma variável esquecida nunca emite nota real.
- **Trava:** o cliente se recusa a enviar se `tpAmb` for 1 e o host não for o de produção, e vice-versa.
- A `Invoice` grava o `environment` em que nasceu. O painel mostra as notas de produção restrita com um selo, e o cron só reconcilia as do seu próprio ambiente.
- Uma venda de teste feita no preview **nunca** gera nota com valor fiscal.

**A7. Estorno cancela a nota automaticamente, e o painel mostra quando não der.**
Quando `apply` leva o pedido a `REFUNDED`, depois de revogar o acesso, e a nota está `AUTHORIZED`, envia-se o **Pedido de Registro de Evento** `e101101`:
- raiz `<pedRegEvento versao="1.00">` (e não 1.01, como a DPS), filho `<infPedReg Id="PRE{chaveAcesso}101101">`;
- campos `tpAmb`, `verAplic`, `dhEvento`, `CNPJAutor` e `chNFSe`, e `e101101` com `xDesc`, `cMotivo` 2 ("Serviço não prestado") e `xMotivo` "Pagamento estornado ao tomador";
- o `xMotivo` precisa ter **de 15 a 255 caracteres**, e isso é validado antes do envio;
- o `infPedReg` é assinado como a DPS.

A resposta é síncrona:
- `201` → `CANCELLED`;
- `4xx` → `CANCEL_ERROR`, com os erros.

O cancelamento por evento tem prazo definido pelo município. Fora dele, é preciso substituição ou processo administrativo. Essa correção é com a contabilidade, e **não é automatizada**: o painel mostra o status, e o pedido estornado continua estornado.

**A8. O PDF (DANFSe) é gerado por nós, a partir do XML autorizado.**
Desde a NT 008/2026 não há API de PDF, e quem emite gera o DANFSe.
- O **`DanfseRenderer`** gera uma página A4 no leiaute do **Anexo I da NT 008/2026**, usando `pdfkit` e `qrcode`, com:
  - todos os campos do XML;
  - os tributos aproximados (Lei 12.741/2012) e os grupos de IBS e CBS quando houver;
  - o **QR Code** de no mínimo 1,52 cm × 1,52 cm, apontando para `https://www.nfse.gov.br/ConsultaPublica/?tpc=1&chave={chaveAcesso}`.

  O guia nfse-sem-gateway tem um renderizador de referência em `references/danfse/`, e ele é o ponto de partida. A NT é a regra.
- A API guarda os dois arquivos no Storage da Spec 010, em `invoices/{environment}/{chaveAcesso}.xml` e `.pdf`:
  - o **XML** autorizado é o documento fiscal e precisa ser guardado;
  - o **PDF** é derivado dele e pode ser refeito a qualquer momento.

  O `StorageService` ganha um método de gravação pelo servidor, porque hoje ele só emite URL de upload para o navegador.
- A API manda pelo Resend (Parte B, decisão B1) o e-mail transacional "Sua nota fiscal", com:
  - o número;
  - o **PDF em anexo**;
  - o link da consulta pública com a chave, o mesmo do QR Code.
- O e-mail só sai quando o PDF está guardado. Se a geração falhar, o cron tenta de novo (A5), e o e-mail sai depois.
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
- Nem a senha nem o material da chave aparecem em log, inclusive dentro de mensagens de erro.
- O certificado vence todo ano, e o vencimento derruba **ao mesmo tempo** a assinatura e o mTLS. A rota do cron registra em log, e o painel financeiro mostra, um aviso **30 dias antes**, com a data lida do próprio `.pfx` (`notAfter`).

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
  dpsSeries   String                     // '00001'
  dpsNumber   BigInt
  dpsId       String        @unique      // 45 caracteres (A2)

  accessKey   String?       @unique      // chaveAcesso, 50 digitos
  number      String?                    // nNFSe, lido do XML autorizado
  xmlPath     String?                    // Storage (A8)
  pdfPath     String?                    // Storage (A8)
  /// Resposta crua da Sefin no ultimo erro (`erros[]`), sem traducao (mesma regra do `mpStatusDetail`).
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
- O `Order` ganha `payerDocument String?` e `payerName String?` (A3), nulos até o backfill, e o endereço do tomador se a produção restrita o exigir.
- As sequências do `nDPS` são criadas à mão na migration, uma por ambiente, porque o Prisma não declara sequência avulsa. Elas começam depois do último número já usado (A2).

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
| `GET` | `/internal/invoices/reconcile` | cron da Vercel (`CRON_SECRET`) | consulta pela DPS, reenvia pendências, refaz XML e PDF que faltam e avisa o vencimento do certificado (A5 e A10) |
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
| `NFSE_PRESTADOR_CNPJ`, `NFSE_MUNICIPIO_IBGE`, `NFSE_CTRIBNAC`, `NFSE_OP_SIMP_NAC`, `NFSE_REG_AP_TRIB_SN`, `NFSE_REG_ESP_TRIB`, `NFSE_DPS_SERIE`, `NFSE_DESCRICAO` | config | Claude | dados fiscais e perfil tributário da contabilidade (A2) |
| `NFSE_SIGNATURE_ALGORITHM` | config | Claude | `rsa-sha256` por padrão (A1) |
| `RESEND_API_KEY` | segredo | usuário | envio de e-mail (B1) |
| `EMAIL_FROM` | config | Claude | remetente, ex.: `Lidiane Delcastanher <contato@mail.delcastanher.srv.br>` |
| `EMAIL_UNSUBSCRIBE_SECRET` | segredo | usuário | HMAC do link de descadastro (B5) |

## Integração com o existente
- **`api/src/payments/orders.service.ts`:** em `apply`, emitir depois do acesso (A4) e cancelar depois da revogação (A7). A criação do pedido grava `payerDocument` e `payerName` (A3).
- **`api/src/invoices/`** (módulo novo): a interface `InvoiceGateway`, a implementação em `sefin/` (`A1Credential`, `DpsBuilder`, `CancelEventBuilder`, `XmlSigner`, `SefinClient`, `DanfseRenderer`), o `InvoicesService` e a rota do cron. Dependências novas: `node-forge`, `xmlbuilder2`, `xml-crypto`, `fast-xml-parser`, `pdfkit` e `qrcode`.
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
- O Id da DPS tem 45 caracteres no formato de A2, e o do evento é `PRE` + chave + `101101`.
- O `XmlSigner` gera assinatura RSA-SHA256 que o próprio `xml-crypto` valida com o certificado de teste, com a `<Signature>` depois do `infDPS` e o prólogo UTF-8 no início. Um XML alterado depois da assinatura não valida.
- O `SefinClient` manda o XML em GZip + Base64, com o `pfx` no agente, e lê `erros[]` de um `4xx` sem lançar exceção. Os testes usam um servidor HTTP falso, e nunca a Sefin.
- A trava de ambiente recusa `tpAmb` 1 com host de produção restrita e vice-versa. Sem `NFSE_ENV`, o ambiente é produção restrita.
- O `xMotivo` fora de 15 a 255 caracteres é recusado antes do envio.
- O `DanfseRenderer` gera PDF com o número, a chave e o QR Code da consulta pública.
- `apply` → `PAID` cria a `Invoice` com o número da DPS reservado e emite uma vez. Um segundo `apply` do mesmo pedido não emite de novo.
- Uma falha da Sefin ou um timeout **não** muda o pedido, o acesso nem a resposta do webhook do Mercado Pago. O timeout deixa a nota em `UNKNOWN`.
- `UNKNOWN` com a nota já existente na consulta pela DPS grava a chave **sem reenviar**. Sem a nota, reenvia a **mesma** DPS.
- Rejeição vira `DENIED` com os erros crus, e o cron não a reenvia.
- "Emitir de novo" reusa o número no `ERROR` e reserva um novo no `DENIED`.
- A nota autorizada lê o `nNFSe` do XML devolvido, guarda XML e PDF no Storage (e continua `AUTHORIZED` se o Storage falhar), e o e-mail sai uma vez só, com o PDF anexo e só depois de o PDF estar guardado.
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
