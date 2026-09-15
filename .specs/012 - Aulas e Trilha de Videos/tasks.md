# Tasks: Spec 012 - Aulas e Trilha de Vídeos (o Módulo como Container)

Spec full-stack. No `api/` (NestJS + Prisma + Jest) a suíte de testes vem **antes** da implementação, conforme `.claude/RULES.md`; no `front/` (Angular standalone + signals + Tailwind) valem o Design System da Spec 002 e os componentes de `front/src/app/shared/ui/`. As decisões referenciadas abaixo estão no `context.md`.

Ordem das fases: o modelo e a migração de dados vêm antes de tudo (nenhum endpoint pode ser reescrito enquanto `Module` ainda é dono do vídeo), o progresso por aula vem antes do conteúdo (é ele quem define o novo critério de conclusão), e o front só entra quando a API já entrega `lessons[]`.

## Fase 1: Backend - Modelagem e Migração de Dados (TDD)
- [x] **Task 1.1:** Modelar `Lesson` no `api/prisma/schema.prisma` (`moduleId`, `order`, `title`, `summary`, as sete colunas de vídeo migradas de `Module`, `durationSeconds` opcional, `@@unique([moduleId, order])`), remover essas colunas de `Module`, trocar `Material.moduleId` por `Material.lessonId` e substituir `ModuleProgress` por `LessonProgress` com `@@unique([userId, lessonId])` (decisões 1, 2 e 5).
- [x] **Task 1.2:** Trocar a relação `Certificate.module` para `onDelete: Restrict`, para que um módulo com diploma emitido não possa ser apagado em silêncio (decisão 15).
- [x] **Task 1.3:** Escrever a migration com **dados**, na ordem da decisão 3: criar `lessons`/`lesson_progress`, inserir uma aula por módulo (`order = 1`, título e resumo copiados, colunas de vídeo carregadas), repontuar `materials.lesson_id`, converter `module_progress` em `lesson_progress` e só então derrubar as colunas de vídeo de `modules`, `materials.module_id` e a tabela `module_progress`. Preservar o índice único parcial de `certificates` (`WHERE module_id IS NULL`).
- [x] **Task 1.4:** Escrever um teste de migração que, a partir de um banco no estado anterior (módulo com vídeo, materiais, progresso e certificado emitido), verifique após a migration: uma aula por módulo, materiais repontuados, percentual do aluno idêntico ao de antes e certificado ainda `ACTIVE`.
- [x] **Task 1.5:** Atualizar `api/prisma/seed.ts` para semear os 12 módulos **e** uma aula inicial em cada um, mantendo a idempotência (rodar de novo não duplica módulo nem aula e não apaga progresso).
- [x] **Task 1.6:** Ajustar o `StorageService` para os caminhos `lessons/<lessonId>/video/...` e `lessons/<lessonId>/materials/...`, cobrindo por teste que um caminho antigo (`modules/<id>/...`) gravado no banco continua produzindo URL assinada válida (decisão 4).

## Fase 2: Backend - Progresso por Aula (TDD)
- [x] **Task 2.1:** Escrever a suíte do `ProgressService` no novo critério: conclusão gravada por aula, módulo concluído só com todas as aulas concluídas, percentual contando aulas, módulo sem aula não contando como concluído e `nextModule`/`nextLesson` apontando para a primeira aula em aberto (decisões 5 e 6).
- [x] **Task 2.2:** Estender `progress.types.ts` com `ProgressLessonItem` (id, order, título, resumo, `completed`, `hasVideo`, `videoReady`, `durationSeconds`) e fazer `ProgressModuleItem` carregar `lessons[]`, `completedCount`, `totalCount` e `completed` derivado — mantendo os campos de topo de `CourseProgress` que o Hub e a trilha já consomem.
- [x] **Task 2.3:** Implementar `PATCH /progress/me/lessons/:lessonId` e **remover** `PATCH /progress/me/modules/:moduleId`, com teste cobrindo que a rota antiga responde 404 (decisão 5).
- [x] **Task 2.4:** Atualizar os testes HTTP de `progress` (aula inexistente, aula de outro curso, desmarcar apagando o registro) e rodar `npm test` no `api/`.

## Fase 3: Backend - Conteúdo da Aula (Vídeo, Materiais e Mux) (TDD)
- [x] **Task 3.1:** Escrever a suíte do `ContentService` e do `VideoService` com a aula como dono: gerar URL de upload de vídeo e de material por `lessonId`, confirmar upload, listar materiais da aula, recusar `lessonId` inexistente e apagar o asset anterior ao substituir o vídeo de uma aula.
- [x] **Task 3.2:** Repontuar as rotas de administração para a aula — `POST /admin/lessons/:lessonId/video/upload-url`, `POST /admin/lessons/:lessonId/video`, `GET /admin/lessons/:lessonId/video`, `POST /admin/lessons/:lessonId/materials/upload-url`, `POST /admin/lessons/:lessonId/materials` — mantendo `DELETE /admin/materials/:id` e os guards `FirebaseAuthGuard` + `@Roles('admin')` (decisão 10).
- [x] **Task 3.3:** Repontuar as rotas do aluno: `GET /lessons/:lessonId/playback-token` e `GET /lessons/:lessonId/materials`, removendo as versões `/modules/:moduleId/...`, e manter o 409 enquanto o vídeo não estiver `READY` (Spec 010, decisões 5 e 6).
- [x] **Task 3.4:** Fazer `GET /materials` (central) devolver módulo **e** aula em cada item: `MaterialItem` ganha `lessonId`, `lessonOrder` e `lessonTitle` ao lado dos campos de módulo já existentes.
- [x] **Task 3.5:** Gravar `durationSeconds` no handler de `video.asset.ready` do `mux-webhook.controller`, ao lado do `videoStatus` que ele já escreve, com teste de evento sem `duration` não quebrando nada (decisão 18).
- [x] **Task 3.6:** Atualizar `content.http.spec.ts` e `video.http.spec.ts` para as rotas novas (admin autorizado, aluno bloqueado, payload inválido, `lessonId` inexistente) e rodar `npm test` no `api/`.

## Fase 4: Backend - Administração de Módulos e Aulas (TDD)
- [x] **Task 4.1:** Escrever a suíte do CRUD de aulas: criação recebendo `order` no fim da lista do módulo, renomeação, remoção cascateando progresso, materiais, objetos do bucket e asset do Mux, e recusa de aula de módulo inexistente (decisão 16).
- [x] **Task 4.2:** Implementar `POST /admin/modules/:moduleId/lessons`, `PATCH /admin/lessons/:id` e `DELETE /admin/lessons/:id`, com `@Roles('admin')`, mais `GET /admin/modules/:moduleId/lessons` devolvendo a lista com estado do vídeo e contagem de materiais.
- [x] **Task 4.3:** Escrever a suíte de reordenação e implementar `PATCH /admin/modules/:moduleId/lessons/order`: lista completa de ids em transação, recusando lista incompleta, com id repetido ou com id de outro módulo (decisão 17).
- [x] **Task 4.4:** Implementar `POST /admin/modules`, `PATCH /admin/modules/:id` e `PATCH /admin/courses/:courseSlug/modules/order` no mesmo padrão transacional, **sem** rota de remoção de módulo (decisão 15), com teste de que criar módulo sem aula não quebra o progresso de ninguém.
- [x] **Task 4.5:** Incluir em `GET /admin/lessons/:id` (ou na listagem) a contagem de alunos que concluíram a aula, para a confirmação de remoção do painel (decisão 16).
- [x] **Task 4.6:** Rodar `npm test` no `api/` e corrigir regressões.

## Fase 5: Backend - Certificados no Novo Critério (TDD)
- [x] **Task 5.1:** Escrever a suíte do `CertificateService` no critério derivado: emissão de diploma de módulo bloqueada com qualquer aula em aberto, liberada com todas concluídas, idempotente, e diploma de curso exigindo todas as aulas de todos os módulos (decisão 13).
- [x] **Task 5.2:** Cobrir por teste a decisão 14: aula acrescentada a módulo já concluído volta o módulo a "em aberto" e **mantém** o diploma `ACTIVE`, sem emitir código novo quando a aula nova é concluída.
- [x] **Task 5.3:** Ajustar `CertificateService` e a verificação pública mantendo intactos `scope`, `moduleTitle` e a regra de PII da Spec 008 (decisão 7) — nenhum dado de aula novo é exposto no portal público.
- [x] **Task 5.4:** Rodar `npm test` no `api/` e corrigir regressões em `progress`, `content` e `certificates`.

## Fase 6: Front - Trilha do Aluno (Trilha Horizontal e Player)
- [x] **Task 6.1:** Criar `shared/ui/lesson-track/` (`ui-lesson-track`): pastilhas numeradas com título e duração, estados concluída / em foco / em aberto, `scroll-snap` horizontal no mobile, navegação por seta do teclado, `aria-current="step"` na aula em foco e rolagem automática até ela — `input()` para a lista e a aula ativa, `output()` para a seleção (decisão 8).
- [x] **Task 6.2:** Adicionar a rota `/ava/trilha/:moduleId/:lessonId` em `app.routes.ts` mantendo `/ava/trilha/:moduleId` e `/ava/trilha` válidas, e resolver a aula em foco na `Trilha` a partir da URL, com *fallback* para o primeiro item válido (decisão 9).
- [x] **Task 6.3:** Atualizar `progress.service.ts` e `content.service.ts` para os contratos e as rotas novas (`lessons[]` por módulo, `PATCH .../lessons/:lessonId`, `playback`/`materials` por aula).
- [x] **Task 6.4:** Evoluir a `Trilha`: `ui-lesson-track` acima do player, título e resumo da aula em foco no card, materiais da aula e o botão "Próxima aula" aparecendo com a aula concluída — sem reprodução automática (decisão 12).
- [x] **Task 6.5:** Garantir a reinicialização do `<mux-player>` quando o `playbackId` muda no `ui-video-player`, para que trocar de aula não deixe o frame da anterior na tela (decisão 11), com teste cobrindo a troca.
- [x] **Task 6.6:** Evoluir `ui-module-card` com o contador "x de y aulas" e a lista expansível das aulas do módulo em foco, navegando para as mesmas rotas do `ui-lesson-track` (decisão 8).
- [x] **Task 6.7:** Mover o disparo de `lesson_started` para a aula, com `module_id` e `lesson_id`, sem contar o mesmo id duas vezes e sem evento novo (decisão 21).
- [x] **Task 6.8:** Liberar o diploma do módulo na trilha somente quando todas as aulas dele estiverem concluídas, deixando visível o que falta (decisão 13).
- [x] **Task 6.9:** Escrever os `.spec.ts` da `Trilha` e do `ui-lesson-track`: aula vinda da URL, aula inválida caindo no primeiro item, token pedido uma vez por aula, conclusão automática no fim do vídeo, conclusão manual pelo botão e navegação por teclado na trilha horizontal.

## Fase 7: Front - Painel do Administrador (Módulos e Aulas)
- [x] **Task 7.1:** Estender `core/services/admin-content.service.ts` com o CRUD de aulas, o CRUD de módulos (sem remoção) e as duas reordenações, mantendo o fluxo de três passos do upload (pedir URL → `PUT` no bucket → confirmar) agora por aula.
- [x] **Task 7.2:** Evoluir a aba "Gestão de Aulas" (`features/admin/aulas/`) para dois níveis: seleção do módulo, lista das aulas daquele módulo com estado do vídeo e contagem de materiais, e seleção da aula para editar o conteúdo — no lugar do `select` único de módulo de hoje.
- [x] **Task 7.3:** Implementar criar, renomear e reordenar aula (subir/descer, enviando a lista completa), e remover aula com confirmação que informa quantos alunos a concluíram (decisões 16 e 17).
- [x] **Task 7.4:** Repontuar o upload de vídeo e o de materiais para a aula selecionada, preservando a barra de progresso (`ui-progress-bar`), o polling do estado da ingestão e o `aria-live` que a Spec 010 já entregou.
- [x] **Task 7.5:** Implementar criar, renomear e reordenar módulo na mesma aba, deixando explícito na UI que módulo é container e que não há remoção (decisão 15).
- [x] **Task 7.6:** Escrever os `.spec.ts` do serviço e da aba: sequência dos três passos do upload por aula, reordenação enviando a lista completa, confirmação antes de remover aula, erro no `PUT` sem gravar registro e bloqueio do papel `aluno`.

## Fase 8: Front - Hub e Central de Materiais
- [x] **Task 8.1:** Atualizar o Hub (`/ava`) para que "Próxima aula" aponte para `/ava/trilha/:moduleId/:lessonId` com o título da aula, e o card de progresso mostre a contagem de aulas (decisão 6).
- [x] **Task 8.2:** Atualizar `/ava/materiais` para agrupar por módulo → aula, alimentando `ui-material-item` com o rótulo da aula e a URL assinada já existente.
- [x] **Task 8.3:** Escrever/atualizar os `.spec.ts` do Hub e da central de materiais para os contratos novos.

## Fase 9: Revisão e Entrega
- [x] **Task 9.1:** Revisar responsividade (mobile-first) da trilha horizontal e do painel de dois níveis, e a acessibilidade do fluxo: foco preservado ao trocar de aula, `aria-current`, rótulos das pastilhas ("Aula 3, concluída, 12 min") e reduced-motion na rolagem automática.
- [x] **Task 9.2:** Conferir que nenhuma rota `/modules/:moduleId/...` de playback, materiais ou progresso continua sendo chamada pelo `front/`, e que nenhum segredo do Mux ou do Firebase aparece no bundle (Spec 010, decisões 2, 3 e 7).
- [x] **Task 9.3:** Rodar `npm test` e `npm run build` no `front/` e `npm test` no `api/`, corrigindo regressões.
- [x] **Task 9.4:** Teste funcional de ponta a ponta com `api/` em `localhost:3000` e `front/` em `localhost:4200`: rodar a migration sobre um banco com dados antigos e conferir percentual e diploma preservados; criar duas aulas novas num módulo, subir vídeo e material em cada, acompanhar até `READY`; como aluno, saltar entre as aulas pela trilha horizontal e pelo `aside`, concluir todas, emitir o diploma do módulo e validá-lo no portal público; reordenar e remover uma aula pelo painel; e confirmar que um usuário `aluno` não entra no `/admin`.
- [x] **Task 9.5:** Entregar conforme `.claude/RULES.md`: uma branch `feat/<>` por fase, um commit por task, merge das feats em `release/012-aulas-e-trilha-de-videos` e as decisões desta spec destacadas no topo do PR — com a reversão das Specs 008 (decisão 3) e 010 (decisão 1) e a remoção de `PATCH /progress/me/modules/:moduleId` em primeiro lugar, por serem as duas quebras de contrato.
