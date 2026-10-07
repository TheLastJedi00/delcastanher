# Tasks: Spec 025 - Melhorias Pós-Lançamento

A Fase 1 sai **antes** do lançamento. O resto começa depois da Task 6.5 da Spec 024, exceto a Task 3.6 (Artigos), que não depende dele. No backend a suíte vem antes da implementação (`.claude/RULES.md`). Os itens (E*) estão no `context.md`.

## Fase 1: Antes do lançamento
- [ ] **Task 1.1:** Logo do Mercado Pago (E8): adicionar o SVG oficial em `front/public/assets/mercado-pago.svg`, o arquivo que o `ui-payment-trust` já referencia. Conferir no checkout que o logo aparece no lugar da imagem quebrada.
- [ ] **Task 1.2:** Conferir ao vivo a tela de acesso expirado (E1), que já existe: vencer no banco o acesso de uma conta de teste a um módulo, abrir uma aula dele com a aba aberta e ver o aviso e o "Ver na loja" com o módulo marcado. Devolver o acesso no fim.

## Fase 2: Campanhas e e-mail
- [ ] **Task 2.1:** Decidir e corrigir o segmento `COMPLETED`, com a suíte `segments.spec.ts` (E2).
- [ ] **Task 2.2:** Teste de campanha no Gmail e no Outlook (E3).
- [ ] **Task 2.3:** E-mail de PIX expirado, com TDD (E4, novo desenho na revisão de 07/10/2026):
  - migration `Order.expiredEmailedAt DateTime?` (só adição);
  - envio na transição de um pedido PIX para `EXPIRED`, uma vez só, nunca para pedido pago;
  - falha do Resend não muda o pedido nem a resposta do webhook;
  - transacional, no layout da marca, com o caminho de volta à compra.

## Fase 3: Acabamento
- [ ] **Task 3.1:** Tipo `ppt` para apresentações (E5), na API, no front e no `ui-material-item`.
- [ ] **Task 3.2:** `level="h1"` no cabeçalho de cada aba do `/admin`, um por tela (E6). Conferir as telas do aluno de passagem.
- [ ] **Task 3.3:** Acessibilidade da loja, do checkout e do `/planos` com teclado e leitor de tela (E7).
- [ ] **Task 3.4:** Itens recomendados da avaliação de qualidade do Mercado Pago (E8). O logo sai na Task 1.1 e os selos já existem.
- [ ] **Task 3.5:** Melhorias de velocidade registradas na Spec 024 (E11).
- [ ] **Task 3.6:** Remover a tela "Artigos" (E12):
  - a rota, com redirecionamento de `/ava/artigos` para `/ava`;
  - o componente, o `ui-article-card`, o item da sidebar, o ícone `article`, o card do hub e a `aula3.jpeg`;
  - o `layout.spec.ts` ajustado para a loja depois de Materiais.
  - Conferir no navegador: a sidebar e o hub sem Artigos, e `/ava/artigos` caindo no hub.

## Fase 4: Vídeo da landing
- [ ] **Task 4.1:** Subir a "Chamada módulo 1" no YouTube e preencher `PRESENTATION` em `landing.ts` (E9; Spec 023, task 7.1).
- [ ] **Task 4.2:** Verificar em produção: nada vai ao YouTube antes do clique, anúncio e Rich Results (Spec 023, task 7.6).

## Fase 5: Confirmações ao vivo
- [ ] **Task 5.1:** 403 de `/admin/finance` com uma conta de papel aluno (E10).
- [ ] **Task 5.2:** Virar o lote pelo painel e conferir o `/planos` e a loja (E10).
- [ ] **Task 5.3:** Fluxo do aluno com acesso parcial e de conta nova pelo onboarding (E10).
- [ ] **Task 5.4:** Teste de ponta a ponta do painel admin (E10).
