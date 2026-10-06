# Pendências contábeis: NFS-e da Imersão RH Estratégico

**Empresa:** Delcastanher Servicos Administrativos e Treinamentos Ltda
**CNPJ:** 58.216.042/0001-44
**Município:** Blumenau/SC (IBGE 4202404), aderente ao Sistema Nacional da NFS-e
**Emissor:** Notaas, pelo Sistema Nacional, com certificado A1 válido até 30/09/2027
**Data:** 06/10/2026

## O que vamos emitir
Uma **NFS-e por venda** da plataforma on-line "Imersão RH Estratégico", seguindo a sugestão de usar NFS-e de treinamentos educacionais.

- **Quem compra:** pessoa física, consumidor final, de qualquer estado. O pagamento é por PIX ou cartão, pelo Mercado Pago.
- **O que se vende:** acesso por 6 meses a módulos de treinamento em vídeo, com materiais e certificado. O aluno pode comprar módulos avulsos ou o pacote com os 12.
- **O que vai na nota:**
  - um único serviço, cuja descrição lista os módulos comprados;
  - o valor total do pedido;
  - o CPF e o nome do comprador, e o endereço quando ele informa.
- **Quando sai:** na aprovação do pagamento, automaticamente.
- **Estorno:** segue a lei. A compra pode ser desfeita em até 7 dias (CDC, art. 49), como dirão os Termos de Uso. No estorno, a plataforma cancela a nota automaticamente, dentro do prazo de cancelamento.

## O que precisamos de vocês
Cada resposta vai para um campo da Notaas ou da plataforma.

### Respondidas em 06/10/2026
| # | Pergunta | Resposta | Onde entra |
|---|---|---|---|
| 1 | Regime tributário | **Simples Nacional, ME** | Cadastro do emitente na Notaas (hoje está "Não Optante") |
| 3 | Alíquota de ISS | **2%** | `NFSE_ALIQUOTA_ISS` |
| 4 | Tributação do ISSQN | **1, tributável** | `NFSE_TRIB_ISSQN` e o padrão do projeto |
| 6 | PIS/COFINS | **Não se aplica:** recolhidos no DAS do Simples | — |
| 8 | Descrição do serviço | **"Treinamento educacional on-line Imersão RH Estratégico: [módulos comprados]."** | `NFSE_DESCRICAO` |
| 10 | Estorno | **Segue a lei: estorno em até 7 dias da compra** (arrependimento, CDC art. 49) | Termos de Uso e prazo de cancelamento da nota |
| 11 | Competência | **Mês do pagamento, no horário de Brasília** | Competência |
| 2 | Código de tributação nacional (cTribNac) | **080201** (item 8.02 da LC 116) | `NFSE_CODIGO_SERVICO` e o padrão do projeto na Notaas |
| 10b | Prazo de cancelamento | **Em Blumenau, a NFS-e não pode ser cancelada direto no sistema depois de 8 dias da emissão.** A plataforma cancela sozinha até 8 dias (192 horas); depois disso, a nota fica marcada para tratar com a contadora | `NFSE_CANCEL_WINDOW_HOURS=192` |
| 12 | Classificação no Mercado Pago | **Não muda:** quem define a natureza legal da venda é a nota | — |
| 9 | Informações complementares | **Nenhuma** | `NFSE_INFORMACOES_COMPLEMENTARES` fica vazia |
| 5 | Inscrição municipal | **176842** (Blumenau) | Cadastro do emitente na Notaas |
| 7 | IBS/CBS e NBS | **Não informar:** numa NFS-e real da empresa (09/2026, Sistema Nacional), o grupo IBS/CBS e o NBS saem vazios | `NFSE_IBSCBS_*` e `NFSE_NBS` ficam sem valor |

Fonte das respostas 5 e 7: NFS-e emitida pela empresa em 09/2026 (`libs/WhatsApp Image 2026-10-06 at 09.43.23.jpeg`). Ela também confirma: **Optante do Simples, ME/EPP**, com **regime de apuração dos tributos federais e municipal pelo Simples Nacional**.

## O que já está pronto
- Conta na Notaas, com o município habilitado no Sistema Nacional.
- Certificado digital A1 do CNPJ, enviado à Notaas.
- Integração da plataforma com a Notaas, pronta para emitir assim que os dados acima forem definidos. Até lá, nenhuma nota é emitida e as vendas seguem normalmente.

## Depois das respostas
1. Os dados entram no cadastro da Notaas e na configuração da plataforma.
2. Fazemos uma venda real de valor baixo, com a nota emitida e depois cancelada pelo painel, para conferir o documento.
3. Enviamos a vocês o PDF e o XML dessa nota de teste para conferência.

---

# Para retomar (interno, não vai para a contadora)
**Atualizado em 06/10/2026.** Este arquivo é o ponto de partida para continuar a Spec 024.2. O detalhe está no `context.md` (decisões N1 a N10) e no `tasks.md` desta pasta.

## Onde estamos
- **Código na `main`:** o **PR #47** (https://github.com/TheLastJedi00/delcastanher/pull/47) teve merge em 06/10, às 15:08 UTC (`1e8b5ed`), e a API foi para produção nesse deploy.
  - API e front testados.
  - A única falha é o `common/cache.http.spec.ts`, em código que o PR não toca.
- **Na Vercel** (`delcastanher-api`):
  - `NFSE_ENV` (Production `producao`, Preview `homologacao`).
  - Só em Production: `NFSE_ALIQUOTA_ISS=2`, `NFSE_TRIB_ISSQN=1`, `NFSE_DESCRICAO`, `NFSE_CANCEL_WINDOW_HOURS=192` e `NFSE_CERT_EXPIRES_AT=2027-09-30`.
  - Também: `NOTAAS_API_KEY`, `NOTAAS_WEBHOOK_SECRET` e a `NFE_ENV` antiga.
- **Emissão ligada em produção** desde o redeploy de 06/10, com a `NFSE_CODIGO_SERVICO=080201`. A próxima venda paga emite NFS-e de verdade.
- **Na Notaas:**
  - certificado A1 ativo até 30/09/2027;
  - projeto único, em **Produção**, no plano Free;
  - regime **Simples Nacional (ME/EPP)**, IM 176842 e cTribNac 080201, desde 06/10.

## Próximos passos, em ordem
- [x] **1. Notaas (Configurações → Editar):** **feito em 06/10 por Claude, pelo painel**, e conferido depois de recarregar:
  - Regime Tributário **Simples Nacional (ME/EPP)**;
  - apuração do ISS no Simples (regApTribSN) **"1, ISS incluído no DAS"**;
  - Inscrição Municipal **176842**;
  - Código de Tributação Padrão **080201**;
  - IBS/CBS, NBS e alíquota DAS em branco;
  - endereço igual ao da NFS-e real, decisão do usuário: complemento **Casa 07 Sala 01** e CEP **89010-904**, no lugar de 89032-457.
- [x] **2. Usuário:** corrigir a URL do webhook `65f90fb1-594e-46a0-8212-6e9c727a2377`. **Feito em 06/10.** Conferido pela API da Notaas: a URL é `https://api.delcastanher.srv.br/webhooks/notaas`, e o webhook está ativo, com os eventos `nfse.*`.
- [x] **3. Usuário:** conferir que a `NOTAAS_API_KEY` na Vercel é só a chave. **Confirmado em 06/10:** o comentário do `api/.env` foi escrito depois que a chave subiu para a Vercel.
- [x] **4. Claude:** subir **`NFSE_CODIGO_SERVICO=080201`** em Production, que liga a emissão. **Feito em 06/10**, depois do passo 1.
- [x] **5. Usuário:** merge do PR #47 na `main`. **Feito em 06/10.**
- [x] **6. Redeploy de produção da `delcastanher-api`:** **feito em 06/10.** O deploy ficou Ready, com alias em `api.delcastanher.srv.br`, que responde 200, e a `NFSE_CODIGO_SERVICO` passou a valer.
  - [ ] A `NFE_ENV` ainda aparecia na `delcastanher-api` (Production e Preview) depois da remoção. O código a ignora, então não segura nada; é só limpeza. O modo automático não deixa o Claude apagar variáveis na Vercel.
- [ ] **7. Usuário e Claude:** **venda real de valor baixo** (Task 3.4):
  - nota autorizada no financeiro, com "NFS-e nº" e código de verificação;
  - e-mail com o PDF e o XML;
  - estorno pelo Mercado Pago dentro dos 7 dias, com a nota cancelada e o XML do cancelamento guardado;
  - PDF e XML enviados à contadora.
- [ ] **8. Usuário:** trocar a senha do certificado A1 e reenviá-lo à Notaas com um nome de arquivo **sem a senha** (hoje ela aparece no nome, na tela de Certificados).
- [ ] **9. Usuário e jurídico:** Termos de Uso com o estorno em até 7 dias, pelo CDC, art. 49 (Spec 024, Task 1.7).
- [ ] **10. Cliente:** publicar os acréscimos da Política de Privacidade (Spec 024, `politica-privacidade-acrescimos.md`, já falando em NFS-e).

## Com a contadora
Nada em aberto desde 06/10/2026. A inscrição municipal (176842) e o IBS/CBS (não informar) saíram de uma NFS-e real da empresa. Se a Notaas recusar a nota por falta de IBS/CBS, a pergunta volta para a contadora.

## Não confirmado
- Se a `referencia` (o id do pedido) faz a Notaas recusar uma segunda nota do mesmo pedido. Por isso o estado `UNKNOWN` continua (N3). Dá para perguntar ao suporte da Notaas.
