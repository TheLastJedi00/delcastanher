# Tasks: Spec 024 - Prontidão para o Lançamento

Cada task diz **quem faz**:
- **Cliente:** decisão comercial, conteúdo, autorização de conta.
- **Usuário:** contas externas, segredos, contador, jurídico.
- **Claude:** código, configuração e verificação.

No backend a suíte vem **antes** da implementação (`.claude/RULES.md`). As decisões (D*) estão no `context.md`.

Ordem: as tasks que dependem de terceiros (Fase 1) começam já, em paralelo ao código (Fases 2 a 4). A verificação (Fase 5) só fecha com tudo pronto, e o lançamento (Fase 6) vem por último.

## Fase 1: Pedidos à cliente e a terceiros (começar hoje)
- [ ] **Task 1.1 · Cliente:** preço definitivo de cada um dos 12 módulos, no painel (D3).
- [x] **Task 1.2 · Cliente:** endereços do LinkedIn e do Instagram (D10). Recebidos em 2026-10-05 e usados sem os parâmetros de rastreamento (`stkn`, `utm_*`).
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
- [x] **Task 2.2:** Rodapé (D10): LinkedIn e Instagram reais e o link `wa.me` ao lado do telefone. Spec sem nenhum `href="#"` no rodapé.
  - WhatsApp no PR #42.
  - LinkedIn (`linkedin.com/in/lidiane-delcastanher-5b2861153/`) e Instagram (`instagram.com/lidianedelcastanher/`) em `feat/024-rodape-redes`, abrindo em nova aba, com a spec de que o rodapé não tem nenhum `#`.
  - O HTML pré-renderizado da landing e do `/planos` saiu sem nenhum `href="#"`.
- [ ] **Task 2.3:** Placeholders (D9): trocar pelo conteúdo da Task 1.6 ou retirar da tela, com specs de que nenhum texto `[...]` aparece na landing, no `/planos` e na página do curso.

## Fase 3: Código - E-mail de confirmação da compra (TDD)
- [x] **Task 3.1:** Migration `Order.confirmationEmailedAt DateTime?` (só adição).
- [x] **Task 3.2:** Suíte e implementação do e-mail "Compra confirmada" no `MailService` (D6):
  - módulos ou pacote, valor, método, validade e botão para `/ava`;
  - transacional: sem `List-Unsubscribe`, chega a quem se descadastrou;
  - HTML e texto puro no layout da marca.
- [x] **Task 3.3:** Ligar ao `OrdersService.apply`:
  - envio na transição para `PAID`, uma vez só;
  - falha do Resend não muda o pedido, o acesso nem a resposta do webhook do Mercado Pago;
  - `confirmationEmailedAt` gravado.
- [x] **Task 3.4:** Financeiro: situação do e-mail na listagem e a ação "Reenviar confirmação".
- [ ] **Task 3.5:** Atualizar o texto da Política de Privacidade (D2): nota fiscal e e-mail transacional. A cliente publica pelo painel.
  - **Rascunho pronto (2026-10-05):** `politica-privacidade-acrescimos.md`, nesta pasta. São três parágrafos para o fim da seção 15. Falta a cliente publicar.

## Fase 4: Código - Certificado (D8)
- [x] **Task 4.1:** Decidir com o usuário onde o PDF é gerado (navegador ou API). **No navegador** (D8).
- [x] **Task 4.2:** Botão "Baixar PDF" em `/ava/certificado` e `/ava/certificado/modulo/:moduleId`, separado de "Imprimir":
  - arquivo `certificado-<codigo>.pdf` em A4 paisagem, uma página;
  - specs de que o botão gera o arquivo e não chama `window.print()`.
- [ ] **Task 4.3:** Rubrica da Task 1.5 no `ui-certificado`, no lugar do placeholder, e retirada de `PLACEHOLDER.signature`.

## Fase 5: Auditorias e verificação
- [ ] **Task 5.1:** Auditoria no celular (D11), em cerca de 390 px e 768 px, nas telas do `context.md`. Corrigir o que quebrar, com o antes e o depois registrados aqui.
  - **Parcial (2026-10-05):** produção auditada no Chrome, com cada página num iframe de mesma origem em 390 px e em 768 px. Para cada uma: largura do documento e lista de elementos que passam da largura sem um ancestral que os corte.
    - **Sem rolagem horizontal e sem elemento vazando** em 9 páginas: landing, `/planos`, `/cursos/imersao-rh`, `/login`, `/cadastro`, `/certificado/verificar`, `/descadastro`, `/termos-de-uso` e `/politica-de-privacidade`.
    - O `/planos` em 390 px também foi conferido no visual. Nada a corrigir.
    - **Falta:** loja, checkout e área do aluno (Hub, trilha, materiais, certificado). O Chrome da verificação está logado como **admin**, e o admin é levado ao `/admin`. É preciso uma conta de aluno, que o usuário cria.
- [x] **Task 5.2:** Varredura de links do site publicado (D10): nenhum 404, nenhum `#`, e WhatsApp e redes abrindo o destino certo.
  - **Parcial (2026-10-05):** 11 páginas lidas do HTML publicado e **104 links únicos conferidos, todos com 200**. Sem 404, e os links externos abrem: WhatsApp (`wa.me`), Instagram, YouTube e a Prospere.
    - Sobram **14 `href="#"`**: são os dois do rodapé (LinkedIn e Instagram) em cada uma das 7 páginas pré-renderizadas. Saem com a Task 1.2.
    - Para o Instagram, a landing já usa o perfil `instagram.com/lidianedelcastanher`. A cliente confirma se é esse o do rodapé.
  - **Concluída (2026-10-05, depois do deploy do PR #45):** **106 links únicos com 200 e zero `href="#"`** nas 11 páginas. LinkedIn, Instagram e WhatsApp do rodapé abrem os perfis certos.
- [x] **Task 5.3:** Lighthouse no celular na landing, no `/planos` e na página do curso (D12):
  - corrigir o que for crítico;
  - registrar os números e o que ficou para a Spec 025.

  Lighthouse 12 em produção, perfil celular, em 2026-10-05:

  | Página | Performance | Acessibilidade | Boas práticas | SEO | LCP | CLS | TBT |
  |---|---|---|---|---|---|---|---|
  | Landing | 97 | 100 | 100 | 100 | 2,2 s | 0 | 20 ms |
  | `/planos` | 97 | 100 | 100 | 100 | 2,3 s | 0,006 | 70 ms |
  | `/cursos/imersao-rh` | 94 | 100 | 100 | 100 | 2,7 s | 0,027 | 110 ms |

  **Nada crítico:** o LCP fica abaixo de 4 s, nenhuma imagem está sem dimensão e o CLS está perto de zero. O que sobrou foi para a Spec 025 (E11).
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

### Fases 3 a 5 (comando Executar, `release/024-prontidao-lancamento`)
Uma branch por fase, com um commit por task:
- `feat/024-email-confirmacao` (Tasks 3.1 a 3.5);
- `feat/024-certificado-pdf` (Tasks 4.1 e 4.2);
- `feat/024-auditorias` (Tasks 5.1 a 5.3).

Juntas na release com a `docs/024-registro-execucao` (PR #43).

- **Testes:** API com 1159 (TDD na Fase 3), front com 675 e `ng build` ok. O pacote inicial ficou igual: o `jspdf` e o `html-to-image` carregam só no clique.
- **Migration `20261005150000_email_confirmacao_compra` aplicada no Neon em 2026-10-05, com autorização do usuário.** Só adiciona uma coluna.
- **Verificação no Chrome, local** (API na 3000 contra o Neon; front na 4300, porque o `ng serve` da 4200 estava com a compilação anterior às dependências novas):
  - financeiro com a coluna "E-mail da compra": o pedido pago mostra "Não enviado" e os outros, "—";
  - "Enviar confirmação" sem `RESEND_API_KEY` mostra "Não foi possível enviar o e-mail: RESEND_API_KEY nao configurada." e o pedido segue "Não enviado". **Nenhum e-mail foi enviado;**
  - "Baixar PDF": PDF de uma página A4 paisagem, com cerca de 365 kB, gerado em 0,3 s. Para não baixar arquivo, conferido pelo `render()` e no visualizador de PDF do Chrome.
- **Decisões tomadas na execução:**
  1. **"Reenviar confirmação" em controller próprio** (`POST /admin/orders/:orderId/confirmation-email`): o `AdminFinanceController` só lê (Spec 016, decisão 20).
  2. **Confirmação com a validade do primeiro acesso a vencer entre os do pedido,** e enviada depois do acesso e da nota.
  3. **Sem reenvio automático por cron.** Pedido pago sem confirmação (Resend fora, chave ausente, pedido anterior à spec) aparece "Não enviado" no painel, que envia na hora.
  4. **PDF pelo `html-to-image`, e não pelo html2canvas.** A verificação visual mostrou o html2canvas deslocando o texto das linhas do título e da assinatura, e deixando uma faixa preta. Do `html-to-image` só se usa o `toSvg`: o `toCanvas` dele espera um `requestAnimationFrame`, que não roda com a aba em segundo plano. Só a fonte latina da marca é embutida (com todas, a captura passava de um minuto).
  5. **jspdf 4.2.1:** a 3.x tem alertas de segurança corrigidos depois da 4.2.0. Os dois alertas que sobram no `npm audit` são do `@angular/platform-server` e do `@angular/router`, e já existiam.
- **Pedido real pago hoje** (R$ 5,00, PIX, 05/10/2026) aparece sem confirmação. Ele é anterior à Fase 3; dá para enviar pelo painel depois do deploy e do Resend.

### Pendências
- Fase 1 inteira (cliente, usuário e terceiros).
- Task 2.3 (placeholders) e Task 4.3 (rubrica): dependem do material da cliente.
- Task 3.5: a cliente publica os acréscimos da Política de Privacidade.
- Task 5.1: loja, checkout e área do aluno, com uma conta de aluno.
- Tasks 5.4 a 5.6 e 6.2 a 6.5.
