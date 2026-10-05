# Tasks: Spec 024 - Prontidão para o Lançamento

Cada task diz **quem faz**:
- **Cliente:** decisão comercial, conteúdo, autorização de conta.
- **Usuário:** contas externas, segredos, contador, jurídico.
- **Claude:** código, configuração e verificação.

No backend a suíte vem **antes** da implementação (`.claude/RULES.md`). As decisões (D*) estão no `context.md`.

Ordem: as tasks que dependem de terceiros (Fase 1) começam já, em paralelo ao código (Fases 2 a 4). A verificação (Fase 5) só fecha com tudo pronto, e o lançamento (Fase 6) vem por último.

## Fase 1: Pedidos à cliente e a terceiros (começar hoje)
- [ ] **Task 1.1 · Cliente:** preço definitivo de cada um dos 12 módulos, no painel (D3).
- [ ] **Task 1.2 · Cliente:** endereços do LinkedIn e do Instagram (D10).
- [ ] **Task 1.3 · Cliente:** autorizar a conta recebedora do Mercado Pago pelo link do painel, com a conta em KYC nível 6 (D4, Spec 020, task 6.7).
- [ ] **Task 1.4 · Cliente:** publicar os vídeos e materiais dos 12 módulos pela Gestão de Aulas, **depois da Task 2.1** (D7).
- [ ] **Task 1.5 · Cliente:**
  - rubrica digitalizada (PNG com fundo transparente);
  - carga horária de cada módulo, preenchida no painel (D8; Spec 023, task 8.7).
- [ ] **Task 1.6 · Cliente:** conteúdo comercial para cada placeholder, ou a decisão de retirar: cursos futuros, depoimentos, garantias e logo da Cronus (D9).
- [ ] **Task 1.7 · Usuário e jurídico:** texto dos Termos de Uso, publicado pela cliente no painel (D2).
- [ ] **Task 1.8 · Usuário:** cadeia da nota fiscal (D1), conforme a Spec 023:
  - contador e classificação no Mercado Pago (1.1 e 1.8);
  - certificado A1 (1.3);
  - Notaas (1.4 a 1.6);
  - Resend e DNS (1.2, 1.7 e 6.1);
  - variáveis e webhook (6.2 e 6.3).
- [ ] **Task 1.9 · Usuário:** credenciais de sandbox da Orders API: aplicação criada na conta do vendedor de teste `TESTUSER8605452672838458141` (D5).
- [ ] **Task 1.10 · Usuário:** URL de retorno do OAuth no preview da API (Spec 020) e verificação em sandbox da conta recebedora (D4).

## Fase 2: Código - Painel e conteúdo
- [x] **Task 2.1:** Bugs da Gestão de Aulas (D7), com specs:
  - `lessonsLoading`, com "Carregando aulas…" no lugar do estado vazio;
  - `materialCount` da aula atualizado depois de enviar ou remover material;
  - resposta descartada quando o módulo ou a aula selecionada já mudou.
- [ ] **Task 2.2:** Rodapé (D10): LinkedIn e Instagram reais e o link `wa.me` ao lado do telefone. Spec sem nenhum `href="#"` no rodapé.
  - **Parcial (2026-10-05, PR #42):** WhatsApp no ar. LinkedIn e Instagram seguem em `#` até a Task 1.2; a spec de "nenhum `#`" entra junto com eles.
- [ ] **Task 2.3:** Placeholders (D9): trocar pelo conteúdo da Task 1.6 ou retirar da tela, com specs de que nenhum texto `[...]` aparece na landing, no `/planos` e na página do curso.

## Fase 3: Código - E-mail de confirmação da compra (TDD)
- [ ] **Task 3.1:** Migration `Order.confirmationEmailedAt DateTime?` (só adição).
- [ ] **Task 3.2:** Suíte e implementação do e-mail "Compra confirmada" no `MailService` (D6):
  - módulos ou pacote, valor, método, validade e botão para `/ava`;
  - transacional: sem `List-Unsubscribe`, chega a quem se descadastrou;
  - HTML e texto puro no layout da marca.
- [ ] **Task 3.3:** Ligar ao `OrdersService.apply`:
  - envio na transição para `PAID`, uma vez só;
  - falha do Resend não muda o pedido, o acesso nem a resposta do webhook do Mercado Pago;
  - `confirmationEmailedAt` gravado.
- [ ] **Task 3.4:** Financeiro: situação do e-mail na listagem e a ação "Reenviar confirmação".
- [ ] **Task 3.5:** Atualizar o texto da Política de Privacidade (D2): nota fiscal e e-mail transacional. A cliente publica pelo painel.
  - **Rascunho pronto (2026-10-05):** `politica-privacidade-acrescimos.md`, nesta pasta. São três parágrafos para o fim da seção 15. Falta a cliente publicar.

## Fase 4: Código - Certificado (D8)
- [x] **Task 4.1:** Decidir com o usuário onde o PDF é gerado (navegador ou API). **No navegador** (D8).
- [ ] **Task 4.2:** Botão "Baixar PDF" em `/ava/certificado` e `/ava/certificado/modulo/:moduleId`, separado de "Imprimir":
  - arquivo `certificado-<codigo>.pdf` em A4 paisagem, uma página;
  - specs de que o botão gera o arquivo e não chama `window.print()`.
- [ ] **Task 4.3:** Rubrica da Task 1.5 no `ui-certificado`, no lugar do placeholder, e retirada de `PLACEHOLDER.signature`.

## Fase 5: Auditorias e verificação
- [ ] **Task 5.1:** Auditoria no celular (D11), em cerca de 390 px e 768 px, nas telas do `context.md`. Corrigir o que quebrar, com o antes e o depois registrados aqui.
- [ ] **Task 5.2:** Varredura de links do site publicado (D10): nenhum 404, nenhum `#`, e WhatsApp e redes abrindo o destino certo.
- [ ] **Task 5.3:** Lighthouse no celular na landing, no `/planos` e na página do curso (D12):
  - corrigir o que for crítico;
  - registrar os números e o que ficou para a Spec 025.
- [ ] **Task 5.4:** Teste de ponta a ponta da compra em sandbox (D5), com o roteiro único do `context.md`. Depende das Tasks 1.9, 1.10 e da Fase 3.
- [ ] **Task 5.5:** Nota de homologação no preview (Spec 023, task 6.5).
- [ ] **Task 5.6:** Certificado: conferir na tela e no "Baixar PDF" o do curso e o de um módulo (Spec 023, task 8.8).

## Fase 6: Lançamento (com autorização do usuário)
- [x] **Task 6.1:** PR da `release/023` para a `main` e deploy. As migrations da 023 já estão no Neon.
- [ ] **Task 6.2:** Backfill do CPF dos pedidos pagos (Spec 023, task 6.4).
- [ ] **Task 6.3:** Rodada de validação da cliente com a lista dela, como uma pessoa nova: do site ao acesso, no celular e no computador.
- [ ] **Task 6.4:** Primeira venda real, de valor baixo, com estorno:
  - NF-e autorizada e cancelada (Spec 023, tasks 6.6 e 6.7);
  - e-mail de confirmação recebido;
  - acesso liberado e depois revogado.
- [ ] **Task 6.5:** Limpar os dados de teste (D13), com snapshot do Neon antes e cada lista conferida antes de apagar. É a última task antes de abrir ao público.

## Registro da execução (2026-10-05)

- **PR #42** (`feat/024-gestao-aulas-rodape`): Task 2.1 completa e a parte de WhatsApp da Task 2.2. Front com 661 testes passando e `ng build` ok.
- **Merges, nesta ordem:**
  1. PRs #40, #41 e #42 na `release/023`;
  2. **PR #38 na `main`** (`78324e3`), depois do build da Vercel do novo topo passar.
- **Produção conferida depois do deploy:**
  - WhatsApp no rodapé;
  - `GET /admin/invoices/config` respondendo 401 sem login, ou seja, a rota da 023 está no ar;
  - landing, `/planos`, página do curso, `/login`, `/descadastro`, `/certificado/verificar`, `/termos-de-uso` e `/politica-de-privacidade` com 200, em 0,2 a 0,4 s.
- **Não conferido:**
  - as correções da Gestão de Aulas no navegador de produção (os cartões ficam em "Fase de teste" no Trello até isso);
  - se a conta recebedora está conectada em produção (exige login de admin; Task 1.3).
- **Termos de Uso:** a API de produção responde "Este documento ainda não foi publicado" (`LEGAL_DOCUMENT_UNPUBLISHED`), apesar de o cartão do Trello estar marcado como concluído. A Task 1.7 continua aberta.

### Pendências
- Fase 1 inteira (cliente, usuário e terceiros).
- Task 2.2: LinkedIn e Instagram, assim que a cliente passar os endereços.
- Task 2.3 e Fases 3 a 5.
- Tasks 6.2 a 6.5.
