# Tasks: Spec 008 - Área do Aluno (Progresso e Certificados)

Spec full-stack. No `api/` (NestJS + Prisma + Jest) a suíte de testes vem **antes** da implementação, conforme `.claude/RULES.md`; no `front/` (Angular standalone + signals + Tailwind) vale o Design System da Spec 002 e os componentes de `front/src/app/shared/ui/`. As decisões referenciadas abaixo estão no `context.md`.

## Fase 1: Backend - Modelagem e Progresso do Aluno (TDD)
- [x] **Task 1.1:** Modelar no `api/prisma/schema.prisma` os models `Module` (id, ordem, título, curso), `ModuleProgress` (usuário + módulo + `completedAt`) e `Certificate` (usuário, curso, `code`, `hash`, `status`, `issuedAt`, `revokedAt`), com as relações para `User` e a migration correspondente — ver decisões 2, 5 e 8.
- [x] **Task 1.2:** Criar o seed dos 12 módulos e dos dados do curso único (nome e carga horária), espelhando a lista que hoje está hardcoded em `features/student/trilha/trilha.ts` (decisão 5).
- [x] **Task 1.3:** Escrever a suíte de `ProgressService` **antes** da implementação: listar módulos com o estado do aluno, marcar/desmarcar módulo concluído, calcular percentual e apontar o próximo módulo em aberto (e o comportamento quando todos estão concluídos).
- [x] **Task 1.4:** Implementar `ProgressModule` (`progress/`: service, controller, dto, types) seguindo a estrutura de `users/`, com `GET /progress/me` e `PATCH /progress/me/modules/:moduleId`, guardados por `FirebaseAuthGuard` e usando `@CurrentUser()`.
- [x] **Task 1.5:** Escrever os testes de controller/HTTP do progresso (autenticado, `moduleId` inexistente, payload inválido) e fazer passar.

## Fase 2: Backend - Emissão e Verificação de Certificado (TDD)
- [x] **Task 2.1:** Escrever a suíte de `CertificateService` antes da implementação: emissão bloqueada com curso incompleto, emissão idempotente (o mesmo aluno concluído não gera dois certificados), geração de `code` e `hash` no servidor (decisão 6) e reemissão de um certificado revogado.
- [x] **Task 2.2:** Escrever a suíte de verificação cobrindo os três estados da decisão 8: **Válido** (código existente, ativo e hash conferindo), **Inválido** (revogado ou hash divergente) e **Não Encontrado** (código inexistente), garantindo que a resposta não vaza e-mail, CPF, telefone nem id interno (decisão 7).
- [x] **Task 2.3:** Implementar `CertificateModule` com `POST /certificates/me` (emitir) e `GET /certificates/me` (consultar o próprio), ambos autenticados.
- [x] **Task 2.4:** Implementar `GET /certificates/verify/:code` como rota **pública**, explicitamente fora do `FirebaseAuthGuard`, e registrar os novos módulos no `app.module.ts`.
- [x] **Task 2.5:** Rodar `npm test` no `api/` e corrigir regressões nas suítes existentes.

## Fase 3: Front - Serviços, Modelos e Rotas
- [x] **Task 3.1:** Tipar em `core/` os modelos consumidos pelo front (`ModuleProgress`, `CourseProgress`, `Certificate`, `CertificateVerification` com o status `valid | invalid | not_found`), espelhando as respostas da API.
- [x] **Task 3.2:** Criar `core/services/progress.service.ts` (`providedIn: 'root'`, `inject(HttpClient)`, estado em signals) no mesmo padrão de `user.service.ts`: carrega o progresso, expõe percentual e próximo módulo como `computed()` e marca módulo concluído.
- [x] **Task 3.3:** Criar `core/services/certificate.service.ts` com emissão, consulta do próprio certificado e verificação pública por código.
- [x] **Task 3.4:** Atualizar `app.routes.ts`: rota pública `certificado/verificar` (lazy, fora dos guards, irmã de `/planos`), rota `ava/certificado` dentro do bloco protegido e a trilha aceitando `ava/trilha/:moduleId` sem quebrar `ava/trilha` (decisão 4).

## Fase 4: Front - Dashboard do Aluno e Retomada
- [x] **Task 4.1:** Evoluir o Hub (`features/student/hub/hub.ts`, rota `/ava`) com o bloco "Meu curso → Meu progresso → Próxima aula" acima dos cards existentes, sem criar tela concorrente (decisão 1).
- [x] **Task 4.2:** Exibir o progresso reutilizando o `ui-progress-bar` já existente: percentual, módulos concluídos sobre o total e título do próximo módulo — nenhum componente de barra novo.
- [x] **Task 4.3:** Implementar o CTA "Retomar curso" apontando para `/ava/trilha/:moduleId` do próximo módulo em aberto, com rótulo alternativo quando o curso está 100% concluído (leva ao certificado).
- [x] **Task 4.4:** Refatorar `features/student/trilha/trilha.ts` para consumir o `ProgressService` no lugar dos módulos hardcoded e do `activeModuleId` fixo, lendo o `:moduleId` da rota e persistindo a conclusão via API (decisões 2 e 4).
- [x] **Task 4.5:** Escrever os `.spec.ts` do Hub e da Trilha: cálculo do percentual, próximo módulo, deep-link com `moduleId` válido e fallback de `moduleId` inexistente.

## Fase 5: Front - Certificado do Aluno
- [x] **Task 5.1:** Criar a feature do certificado (`features/student/certificado/`) na rota `/ava/certificado`, com os dois estados de entrada: curso incompleto (mensagem do que falta, sem emitir) e curso concluído (diploma).
- [x] **Task 5.2:** Renderizar o diploma com as variáveis obrigatórias vindas da API — Nome, Curso, Carga Horária, Data de emissão, Assinatura e Hash/código de validação — sem recalcular nada no cliente (decisão 6).
- [x] **Task 5.3:** Tratar a assinatura como o placeholder `[ASSINATURA DA COORDENAÇÃO]` até a rubrica digitalizada ser enviada, e exibir o código de validação junto do endereço do portal público (decisão 10). Quando o arquivo chegar, ele entra em `public/` renderizado com `NgOptimizedImage` (nunca base64 inline).
- [x] **Task 5.4:** Implementar o download por impressão: botão que chama `window.print()` e layout dedicado de `@media print` (uma página, sem menus, sem sombras), sem adicionar dependência de PDF (decisão 9).
- [x] **Task 5.5:** Escrever o `.spec.ts` do certificado: estado incompleto sem emissão, estado concluído com todas as variáveis presentes e o código de validação visível.

## Fase 6: Front - Portal de Validação Pública
- [x] **Task 6.1:** Criar `features/certificado-verificar/` na rota pública `/certificado/verificar`, com layout próprio para visitante (sem sidebar do AVA) e reaproveitando `ui-page-container` / `ui-section-header`.
- [x] **Task 6.2:** Implementar o formulário reativo de código com `ui-input`, validação de formato e aceite do código com ou sem hífens/maiúsculas; suportar também `?codigo=` na URL para o link impresso no diploma.
- [x] **Task 6.3:** Tratar os três estados de retorno com respostas visuais distintas (decisão 8): **Válido** exibindo nome, curso, carga horária e data; **Inválido** explicando que o certificado foi revogado; **Não Encontrado** explicando que o código não existe. Incluir os estados de carregando e de erro de comunicação.
- [x] **Task 6.4:** Garantir por teste que a rota é pública: nenhum guard, nenhuma chamada autenticada, funciona com o usuário deslogado.
- [x] **Task 6.5:** Escrever o `.spec.ts` do portal cobrindo os três estados e a normalização do código digitado.

## Fase 7: Revisão e Entrega
- [x] **Task 7.1:** Revisar a responsividade (mobile-first) das telas novas, com atenção ao diploma — que precisa continuar legível no celular e correto na impressão.
- [x] **Task 7.2:** Revisar acessibilidade: foco e `aria-live` nos resultados da verificação, rótulos dos formulários e contraste do diploma.
- [x] **Task 7.3:** Rodar `npm test` e `npm run build` no `front/` e `npm test` no `api/`, corrigindo regressões.
- [x] **Task 7.4:** Teste funcional de ponta a ponta com `api/` em `localhost:3000` e `front/` em `localhost:4200`: concluir os módulos, ver o progresso no Hub, retomar pelo deep-link, emitir o certificado e validá-lo no portal público — inclusive com um código inexistente e um certificado revogado.
- [x] **Task 7.5:** Entregar conforme `.claude/RULES.md`: uma branch `feat/<>` por fase, um commit por task, merge das feats em `release/008-area-do-aluno` e as decisões desta spec destacadas no topo do PR.
