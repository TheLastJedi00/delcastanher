# Tasks: Spec 022 - Políticas e Termos pelo Painel

Spec de `api/` (NestJS + Prisma + Jest) e `front/` (Angular standalone + signals + Tailwind). No backend a suíte vem **antes** da implementação, conforme `.claude/RULES.md`. Valem o Design System da Spec 002 e os componentes de `front/src/app/shared/ui/`. As decisões referenciadas estão no `context.md`.

Ordem das fases (definida pelo usuário: **painel pronto antes do CRUD**):
1. O parser e a aba do painel vêm primeiro, como tela completa sobre um serviço com contrato fechado (decisão 11).
2. Depois vem o CRUD no backend, com a carga inicial do texto que está no ar.
3. Em seguida, a ligação da aba, das páginas públicas, do consentimento e do onboarding ao banco. É aqui que os placeholders saem.
4. A publicação dos Termos pela Lidiane e a verificação fecham a spec.

## Fase 1: Front - Formato do Texto e Aba do Painel
- [x] **Task 1.1:** Criar `features/legal/parse-legal-text.ts` (decisão 1): `## ` vira título de seção, `- ` vira item de lista, linhas seguidas viram um parágrafo, e linha em branco separa blocos. A saída é `LegalSection[]` com os `p()` e `ul()` que a `LegalPage` já renderiza. Criar também o caminho inverso (`formatLegalText`), usado na carga inicial (Task 2.6).
- [x] **Task 1.2:** Cobrir o parser: títulos, parágrafos em várias linhas, listas, linhas em branco repetidas, texto sem título, HTML tratado como texto, e ida e volta com `formatLegalText` preservando as seções atuais da Privacidade e da Cookies.
- [x] **Task 1.3:** Definir o contrato do `AdminLegalService` (signals): listar os três documentos, salvar e descartar rascunho, publicar com `changeKind`, e listar versões. Os tipos seguem as rotas do `context.md`. Nesta fase, a implementação chama as rotas que ainda não existem, e os testes usam o serviço simulado.
- [x] **Task 1.4:** Extrair a aba de `admin-dashboard.html` para o componente `admin-politicas`, no padrão do `admin-financeiro`, com `<h1>` no cabeçalho (decisão 11).
- [x] **Task 1.5:** Montar a lista dos três documentos com o estado de cada um: publicado (com versão, data e autor), não publicado, ou com rascunho não publicado.
- [x] **Task 1.6:** Montar o editor: texto monoespaçado, guia curto do formato, pré-visualização ao vivo pela `LegalPage` e o parser. Botões "Salvar rascunho", "Descartar rascunho" e "Publicar", e confirmação ao sair com alteração não salva. Aviso fixo no editor da Política de Cookies (decisão 9).
- [x] **Task 1.7:** Montar o diálogo de publicação (decisão 3): "Nova versão" e "Correção", com o efeito de cada uma escrito, e só "Nova versão" nos Termos ainda não publicados.
- [x] **Task 1.8:** Montar o histórico de versões, com data, tipo, autor e versão da política, e leitura de cada versão.
- [x] **Task 1.9:** Manter os avisos "Área em construção" e "Maquete" até a Fase 3 (decisão 11). Cobrir a aba nos specs com o serviço simulado e rodar `ng test` e `ng build`.
- [x] **Task 1.10:** Na aba "Gestão de Aulas", montar o bloco "Dados do curso" (decisão 12): campo "Carga horária (horas)", soma dos vídeos processados como referência, e confirmação ao mudar um valor já definido, avisando que os certificados emitidos mudam junto. O serviço (`AdminCoursesService`) segue o mesmo esquema da Task 1.3: contrato fechado e simulado nos testes.

## Fase 2: Backend - CRUD dos Documentos (TDD)
- [x] **Task 2.1:** Acrescentar ao `schema.prisma` os enums `LegalDocumentKind` e `LegalChangeKind` e os models `LegalDocumentVersion` e `LegalDocumentDraft`, com comentários no padrão do arquivo (decisão 2).
- [x] **Task 2.2:** Escrever a suíte do `LegalDocumentsService`:
  - vigente por documento e `null` para Termos sem publicação;
  - versão da política pela última publicação de qualquer documento;
  - rascunho salvo, sobrescrito e descartado;
  - publicação `NEW_VERSION` com a data do dia e `.2` na segunda do mesmo dia;
  - `CORRECTION` repetindo a versão vigente;
  - primeira publicação dos Termos sempre `NEW_VERSION`;
  - `400` sem rascunho ou com rascunho vazio;
  - rascunho apagado ao publicar;
  - duas publicações simultâneas sem repetir a versão.
- [x] **Task 2.3:** Implementar o `LegalDocumentsService`, com a publicação numa transação e a leitura da última versão travada (`SELECT … FOR UPDATE` via `$queryRaw`, como na Spec 019).
- [x] **Task 2.4:** Escrever a suíte das rotas públicas e admin: `404` para Termos sem publicação; `401` sem token e `403` com aluno nas rotas admin; `kind` inválido recusado; e nenhuma rota que altere ou apague versão publicada.
- [x] **Task 2.5:** Implementar o `LegalModule` com os dois controllers: o público, fora dos guards, e o admin, com `FirebaseAuthGuard`, `RolesGuard` e `@Roles('admin')` na classe.
- [x] **Task 2.6:** Gerar o texto da carga inicial **por script**, com `formatLegalText` sobre as `LegalSection` atuais de `politica-de-privacidade.ts` e `politica-de-cookies.ts`, com os dados de `company-info.ts` resolvidos (decisão 10). Escrever a migration com os dois `INSERT` (`policyVersion = '2026-09-13'`, `changeKind = INITIAL`). Conferir o texto gerado contra o PDF de `libs/`.
- [x] **Task 2.7:** Aplicar a migration com `prisma migrate deploy` **só com autorização explícita**: o banco é o de produção.
  - Aplicada em 28/09/2026 com autorização do usuário (`20260928120000_documentos_legais` e `20260928120100_carga_inicial_documentos_legais`).
- [x] **Task 2.8:** Escrever a suíte do `PATCH /users/me` com a versão vinda do banco (decisão 7): a vigente grava; uma antiga dá `409` com a vigente; e quem já concluiu o onboarding não é afetado.
- [x] **Task 2.9:** Implementar a validação no `UsersService` pelo `LegalDocumentsService` e remover `policy-versions.ts`.
- [x] **Task 2.10:** Escrever a suíte das rotas do curso (decisões 12 a 14):
  - `GET /courses/:slug/summary` devolve `workloadHours`, nulo ou definido, e `accessMonths = ACCESS_MONTHS`, e `404` para `slug` inexistente;
  - `GET /admin/courses/:id` soma só as aulas com `durationSeconds`;
  - `PATCH /admin/courses/:id` aceita 1 a 999 e `null`, recusa 0, negativo, fração e texto, e dá `401` sem token e `403` com aluno.
- [x] **Task 2.11:** Implementar as três rotas no módulo que já serve cursos. A pública fica fora dos guards; as admin têm `@Roles('admin')` na classe.
- [x] **Task 2.12:** Escrever a suíte do cache (decisão 16): as três rotas públicas respondem com `public, max-age=60, s-maxage=60, stale-while-revalidate=600, stale-if-error=86400`, inclusive no `404`; as rotas admin de documentos e de curso respondem `no-store`; a resposta pública é igual com e sem `Authorization`.
- [x] **Task 2.13:** Implementar o decorator `@PublicCache()` e aplicá-lo às três rotas. O `no-store` das rotas admin vai na classe do controller.
- [x] **Task 2.14:** Rodar `npm test` no `api/` e corrigir regressões. `PATCH /users/me` tem suíte das Specs 004, 005 e 015, e `workloadHours` é lido pelo progresso e pelos certificados.

## Fase 3: Front - Ligação ao Banco e Fim dos Placeholders
- [x] **Task 3.1:** Criar o `LegalDocumentsService` público (`core/services/`), com o documento vigente e a versão da política.
- [x] **Task 3.2:** `LegalPage` sem modo pendente (decisão 5): remover `LEGAL_PLACEHOLDER`, `topics`, o input `pending` e o uso de `ui-placeholder-text`. Sem conteúdo, mostrar "Os Termos de Uso estão em preparação e serão publicados nesta página" com o contato de `company-info.ts`.
- [x] **Task 3.3:** Fazer as três páginas buscarem o texto no build e de novo no navegador, trocando se a versão for outra. Se a API falhar no build, a página sai em estado de carregamento, sem quebrar o build (decisão 4).
- [x] **Task 3.4:** Tirar o texto dos `.ts` das três páginas e o roteiro de `termos-de-uso.ts`. Na Cookies, manter os blocos "sua escolha atual" e "rever preferências" no componente (decisão 9).
- [x] **Task 3.5:** `ConsentService` com a versão da API (decisão 8): sem piscar o banner, reabrindo quando a versão difere, e mantendo o registro se a API falhar. Remover `CONSENT_POLICY_VERSION` e atualizar quem o importa.
- [x] **Task 3.6:** Onboarding (decisões 6 e 7): rótulo do aceite pelos documentos publicados, versão vigente no envio e `409` recarregando o rótulo e pedindo o aceite de novo.
- [x] **Task 3.7:** Ligar a aba do painel às rotas reais e tirar os avisos "Área em construção" e "Maquete".
- [x] **Task 3.8:** Atualizar os specs de `legal-page`, `politica-de-privacidade`, `politica-de-cookies`, `consent.service` e `onboarding`, e acrescentar o de `termos-de-uso`. Nenhum spec pode procurar `[TEXTO A SER REDIGIDO…]` como esperado.
- [x] **Task 3.9:** Hero de `/cursos/imersao-rh` (decisões 13 e 14):
  - carga horária e FAQ pelo `GET /courses/:slug/summary`, no build e no navegador;
  - sem valor, o cartão e a pergunta do FAQ não aparecem;
  - cartão "Início da turma" vira "Acesso: imediato, por N meses", com `accessMonths`;
  - remover `PLACEHOLDER.workload` e `PLACEHOLDER.startDate` de `placeholders.ts` e do mock;
  - ligar o bloco "Dados do curso" às rotas reais.
- [x] **Task 3.10:** Depoimentos (decisão 15):
  - remover as três entradas de `testimonials` do mock e `PLACEHOLDER.videoTestimonial` de `placeholders.ts`;
  - criar o `computed()` `testimonials`, que descarta entrada com nome ou citação placeholder;
  - envolver a seção `#depoimentos` inteira em `@if (testimonials().length > 0)`.
- [x] **Task 3.11:** Aplicar a tabela da decisão 18 em `courses.mock.ts` e `course-detail.html`:
  - cartão "Formato";
  - bônus de mentoria e de comunidade removidos, e o cabeçalho dos bônus;
  - garantia 2, `priceNote`, as duas respostas do FAQ e o fechamento;
  - `metaDescription` e o CTA "Quero começar agora";
  - `@if` na linha de prazo do fechamento e no "Valor" do bônus;
  - grade dos bônus com um só cartão.

  Confirmado pelo usuário em 2026-09-28: não há encontros ao vivo nem comunidade.
- [x] **Task 3.12:** Cobrir nos specs (`course-detail.spec.ts` e o da aba "Gestão de Aulas"): a hero; a seção de depoimentos ausente sem entradas e com entrada placeholder, e presente com entrada real; e o bloco "Dados do curso".
- [x] **Task 3.13:** Rodar `ng test` e `ng build`. Conferir no HTML pré-renderizado:
  - `/politica-de-privacidade` e `/politica-de-cookies` com o mesmo texto de antes da spec;
  - `/cursos/imersao-rh` com a hero sem `[CARGA HORÁRIA]` nem `[DATA DE INÍCIO]`, sem a seção `#depoimentos`, e sem "ao vivo", "comunidade", "mentoria em grupo" ou "turma" fora do texto alternativo das fotos, incluindo a `meta description`.

## Fase 4: Publicação e Verificação
- [x] **Task 4.1:** Subir o `api/` em `localhost:3000` e o `front/` em `localhost:4200`. Buscar no DOM das três páginas: nenhum `[TEXTO A SER REDIGIDO…]`, `[e-mail…]`, `[nome…]` ou `[número]`.
  - 28/09/2026: API local contra o banco, front em 4200. Privacidade (15 seções) e Cookies (6) com o texto do banco; Termos "em preparação"; banner reabre com versão antiga; `/cursos/imersao-rh` sem placeholder na hero.
- [ ] **Task 4.2:** No painel, salvar um rascunho da Privacidade, conferir a pré-visualização e descartar: o site não muda.
- [ ] **Task 4.3:** Publicar uma correção na Privacidade: o texto muda sem deploy e o banner **não** reabre. Publicar de volta o texto original, também como correção. As duas publicações ficam no histórico para sempre (decisão 2), então rodar só com autorização do usuário. A alternativa é fazer a primeira correção real, como a troca de contato, servir de verificação.
- [x] **Task 4.4:** **Não** publicar Termos de teste. O banco é um só, o de produção, e versão publicada não se apaga (decisão 2): um texto de teste ficaria para sempre no histórico e no registro de aceite. O fluxo da primeira publicação dos Termos fica coberto pelos testes das Tasks 2.2 e 3.6, e é verificado de verdade na Task 4.5.
- [ ] **Task 4.5:** **Lidiane:** colar o texto do jurídico nos Termos de Uso pelo painel de produção, conferir a pré-visualização e publicar. Conferir em seguida: `/termos-de-uso` mostra o texto sem deploy, a versão da política sobe, o banner reabre e o onboarding passa a listar os Termos. Registrar aqui a data e a versão.
- [ ] **Task 4.6:** Conferir a navegação por teclado e a hierarquia de cabeçalhos da aba e das três páginas.
- [ ] **Task 4.7:** **Lidiane:** definir a carga horária no bloco "Dados do curso". Conferir em seguida que a hero e o FAQ de `/cursos/imersao-rh` mostram o valor sem deploy, e que o certificado de um aluno e a verificação pública dele mostram o mesmo número. Registrar aqui o valor.
- [x] **Task 4.8:** Criar no Vercel Firewall do projeto `delcastanher-api` a regra de rate limit da decisão 17: `/legal/*` e `/courses/*`, 120 requisições por minuto por IP, resposta `429`. Conferir antes, no plano da conta, quantas regras de rate limit ele permite. A regra muda a produção: criar só com autorização do usuário, e registrar aqui a data e o id.
  - Criada e publicada em 28/09/2026 pelo `vercel firewall`: regra `rule_spec_022_rate_limit_rotas_publicas_zEGx7m` (fixed window, 60 s, 120 por IP, ação `rate_limit`).
- [ ] **Task 4.9:** Depois do deploy, conferir em produção:
  - `curl -I` duas vezes seguidas em `/legal/policy-version` mostra `x-vercel-cache: HIT` na segunda;
  - um laço acima de 120 requisições por minuto recebe `429`;
  - `/admin/legal/documents` responde `no-store`.
- [ ] **Task 4.10:** Atualizar o card "[015] Redigir os Termos de Uso" no Trello (hoje em "Concluído" sem o texto publicado) e o card do `<h1>` do admin, para registrar a parte feita aqui.
