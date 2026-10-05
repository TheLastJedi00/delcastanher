# Tasks: Spec 025 - Melhorias Pós-Lançamento

Começa **depois** da Task 6.5 da Spec 024 (lançamento). No backend a suíte vem antes da implementação (`.claude/RULES.md`). Os itens (E*) estão no `context.md`.

## Fase 1: Com prazo
- [ ] **Task 1.1:** Tela de acesso expirado (E1), com specs: o 403 de acesso no player e no material vira a mensagem "Seu acesso a este módulo expirou" e um botão para a loja com o módulo marcado. **Prazo:** 6 meses depois da primeira venda real.

## Fase 2: Campanhas e e-mail
- [ ] **Task 2.1:** Decidir e corrigir o segmento `COMPLETED`, com a suíte `segments.spec.ts` (E2).
- [ ] **Task 2.2:** Teste de campanha no Gmail e no Outlook (E3).
- [ ] **Task 2.3:** Lembrete de PIX pendente, com TDD: um envio por pedido, nunca depois de pago ou expirado (E4).

## Fase 3: Acabamento
- [ ] **Task 3.1:** Tipo `ppt` para apresentações (E5), na API, no front e no `ui-material-item`.
- [ ] **Task 3.2:** `level="h1"` no cabeçalho de cada aba do `/admin`, um por tela (E6). Conferir as telas do aluno de passagem.
- [ ] **Task 3.3:** Acessibilidade da loja, do checkout e do `/planos` com teclado e leitor de tela (E7).
- [ ] **Task 3.4:** Logo do Mercado Pago, selos e itens recomendados da avaliação de qualidade (E8).
- [ ] **Task 3.5:** Melhorias de velocidade registradas na Spec 024 (E11).

## Fase 4: Vídeo da landing
- [ ] **Task 4.1:** Subir a "Chamada módulo 1" no YouTube e preencher `PRESENTATION` em `landing.ts` (E9; Spec 023, task 7.1).
- [ ] **Task 4.2:** Verificar em produção: nada vai ao YouTube antes do clique, anúncio e Rich Results (Spec 023, task 7.6).

## Fase 5: Confirmações ao vivo
- [ ] **Task 5.1:** 403 de `/admin/finance` com uma conta de papel aluno (E10).
- [ ] **Task 5.2:** Virar o lote pelo painel e conferir o `/planos` e a loja (E10).
- [ ] **Task 5.3:** Fluxo do aluno com acesso parcial e de conta nova pelo onboarding (E10).
- [ ] **Task 5.4:** Teste de ponta a ponta do painel admin (E10).
