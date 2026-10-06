# Tasks — Spec 026: Limpeza de Contas de Teste

## Fase 1 — Script
- [x] **Task 1.1:** Confirmar no `mercado-pago-webhook.controller.ts` que uma order desconhecida devolve 200 e é ignorada (Integração com o existente). Se não for assim, parar e perguntar antes de seguir.
  - Confirmado: `OrdersService.applyFromGateway` registra aviso e retorna, e o controller responde 200.
- [x] **Task 1.2:** `api/scripts/spec026-limpeza.ts` com as listas fechadas de UIDs e do pedido avulso (decisão 1), a conferência que recusa rodar (decisão 7), a transação no Postgres (decisão 5) e o `deleteUsers` no Firebase (decisão 6). Sem argumento, só simula.
- [x] **Task 1.3:** `spec026:limpeza` no `package.json`.

## Fase 2 — Execução em produção
- [x] **Task 2.1:** Rodar a simulação e mostrar a saída ao usuário.
- [ ] **Task 2.2:** Com aprovação explícita (decisão 8), rodar com `--apply`.
- [ ] **Task 2.3:** Refazer o inventário. No Firebase devem sobrar 3 contas (os 2 admins e `jediaelborges18`), e no Postgres 3 usuários e 2 pedidos, ambos `PAID`.
- [ ] **Task 2.4:** Abrir o `/admin` no Chrome e conferir a tabela "Visão Geral e Alunos", os KPIs e o painel financeiro com os R$ 6,00 dos dois pedidos pagos.
