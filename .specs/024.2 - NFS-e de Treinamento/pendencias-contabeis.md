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

### Ainda em aberto
| # | Pergunta | Sugestão | Onde entra |
|---|---|---|---|
| 2 | **Código de tributação nacional (cTribNac)** do serviço | **080201**: item 8.02 da LC 116 (instrução, treinamento, orientação pedagógica e educacional, avaliação de conhecimentos de qualquer natureza) | `NFSE_CODIGO_SERVICO`. **Sem ele, nenhuma nota é emitida** |
| 5 | **Inscrição municipal** da empresa em Blumenau, e se é exigida no Sistema Nacional | — | Cadastro do emitente |
| 7 | **IBS/CBS** (reforma tributária): se o Simples precisa informar em 2026 e, se sim, CST, classificação tributária (cClassTrib), indicador de operação (cIndOp) e **NBS** | — | Reforma tributária |
| 9 | **Informações complementares** a imprimir na nota, se houver | — | Informações complementares |
| 10b | **Prazo de cancelamento** da NFS-e no Sistema Nacional. Com estorno em até 7 dias, a nota pode precisar ser cancelada até uns 8 dias depois de emitida. Isso cabe no prazo? Se não couber, o que se faz? | A plataforma tenta cancelar até 8 dias depois da emissão. Depois disso, ou se o sistema recusar, a nota fica marcada para tratamento manual | Prazo de cancelamento |
| 12 | A **classificação da atividade** no Mercado Pago precisa passar a dizer "treinamento"? | — | Mercado Pago |

## O que já está pronto
- Conta na Notaas, com o município habilitado no Sistema Nacional.
- Certificado digital A1 do CNPJ, enviado à Notaas.
- Integração da plataforma com a Notaas, pronta para emitir assim que os dados acima forem definidos. Até lá, nenhuma nota é emitida e as vendas seguem normalmente.

## Depois das respostas
1. Os dados entram no cadastro da Notaas e na configuração da plataforma.
2. Fazemos uma venda real de valor baixo, com a nota emitida e depois cancelada pelo painel, para conferir o documento.
3. Enviamos a vocês o PDF e o XML dessa nota de teste para conferência.
