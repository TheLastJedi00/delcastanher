# Tasks: Spec 010 - Storage e CDN (Vídeo e Materiais das Aulas)

Spec full-stack. No `api/` (NestJS + Prisma + Jest) a suíte de testes vem **antes** da implementação, conforme `.claude/RULES.md`; no `front/` (Angular standalone + signals + Tailwind) valem o Design System da Spec 002 e os componentes de `front/src/app/shared/ui/`. As decisões referenciadas abaixo estão no `context.md`.

Ordem das fases: a proteção por papel e o Storage vêm antes de qualquer endpoint de upload (decisão 13), e o front do aluno só entra depois de existir asset reproduzível.

## Fase 1: Backend - Proteção por Papel, Modelagem e Storage (TDD)
- [x] **Task 1.1:** Escrever a suíte de `RolesGuard` + `@Roles()` (admin passa, aluno recebe 403, requisição sem sessão recebe 401) e implementá-los em `api/src/auth/`, lendo o claim `role` que o `FirebaseAuthGuard` já resolve (decisão 13).
- [x] **Task 1.2:** Modelar no `api/prisma/schema.prisma`: `Module` ganha `videoStoragePath`, `videoOriginalName`, `videoSizeBytes`, `muxAssetId`, `muxPlaybackId`, `videoStatus` (enum `PENDING | PROCESSING | READY | ERRORED`) e `videoError`; novo model `Material` (módulo, `storagePath`, `fileName`, `fileType`, `sizeBytes`, `order`) — decisão 1.
- [x] **Task 1.3:** Alterar `Certificate` para o escopo duplo (decisão 11): `moduleId` opcional com relação para `Module`, remoção do `@@unique([userId, courseId])`, `@@unique([userId, moduleId])` e, na migration, o índice único parcial em SQL (`WHERE module_id IS NULL`) que mantém um só diploma de curso por aluno. Gerar a migration e conferir que a suíte atual de certificados continua verde.
- [x] **Task 1.4:** Registrar as variáveis `FIREBASE_STORAGE_BUCKET`, `MUX_TOKEN_ID`, `MUX_TOKEN_SECRET`, `MUX_SIGNING_KEY_ID`, `MUX_SIGNING_PRIVATE_KEY` e `MUX_WEBHOOK_SECRET` no `ConfigService`, documentá-las no `.env` de exemplo e no README do `api/`, com o bucket pelo nome, sem `gs://` (decisão 7).
- [x] **Task 1.5:** Escrever a suíte de `StorageService` antes da implementação: URL assinada de escrita, URL assinada de leitura com validade curta, exclusão de objeto, recusa de MIME e de tamanho fora do permitido e caminho determinístico do objeto (`modules/<moduleId>/video/...`, `modules/<moduleId>/materials/...`).
- [x] **Task 1.6:** Implementar `StorageService` sobre `firebase-admin/storage`, com o getter `storage` no `FirebaseService` ao lado do `auth` já existente (decisão 2).

## Fase 2: Backend - Conteúdo do Módulo (Materiais) (TDD)
- [x] **Task 2.1:** Escrever a suíte do `ContentService` para materiais: gerar URL de upload, confirmar upload gravando o registro, listar materiais de um módulo, excluir material removendo o objeto do bucket e recusar módulo inexistente.
- [x] **Task 2.2:** Implementar `ContentModule` (`content/`: controller, service, dto, types) seguindo a estrutura de `users/`, com `POST /admin/modules/:moduleId/materials/upload-url`, `POST /admin/modules/:moduleId/materials` (confirmação) e `DELETE /admin/materials/:id`, todos com `FirebaseAuthGuard` + `@Roles('admin')`.
- [x] **Task 2.3:** Escrever os testes HTTP do fluxo de materiais (admin autorizado, aluno bloqueado, payload inválido, `moduleId` inexistente) e fazer passar.
- [x] **Task 2.4:** Implementar `GET /modules/:moduleId/materials` para o aluno autenticado, devolvendo nome, tipo, tamanho e **URL assinada de leitura** de curta duração — nunca o caminho do bucket nem objeto público (decisões 3 e 15).

## Fase 3: Backend - Mux (CDN de Streaming) (TDD)
- [x] **Task 3.1:** Escrever a suíte de `MuxService` com HTTP mockado: criar asset a partir de URL de entrada com policy `signed`, consultar o estado do asset, assinar token de playback e apagar asset (decisões 4, 6 e 16).
- [x] **Task 3.2:** Implementar `MuxService` lendo as credenciais do `ConfigService`, sem nenhuma chave alcançável a partir do `front/`.
- [x] **Task 3.3:** Escrever a suíte do fluxo de vídeo do admin e implementar `POST /admin/modules/:moduleId/video/upload-url` e `POST /admin/modules/:moduleId/video` (confirmação): a confirmação gera a URL assinada de leitura do Storage, cria o asset no Mux a partir dela e grava `muxAssetId`, `muxPlaybackId` e `videoStatus = PROCESSING` (decisão 4). Substituir vídeo de um módulo apaga o asset anterior.
- [x] **Task 3.4:** Implementar `POST /webhooks/mux` como rota **pública**, explicitamente fora do `FirebaseAuthGuard`, com verificação da assinatura do webhook, tratando `video.asset.ready` e `video.asset.errored` para atualizar `videoStatus`/`videoError`; testar assinatura válida, inválida e evento desconhecido (decisão 5).
- [x] **Task 3.5:** Implementar `GET /admin/modules/:moduleId/video` (estado do processamento para o painel) e `GET /modules/:moduleId/playback-token` para o aluno autenticado, devolvendo `playbackId`, token curto e expiração — e 409 enquanto o vídeo não estiver `READY` (decisões 5 e 6).
- [x] **Task 3.6:** Incluir o estado do vídeo em `GET /progress/me` (se há vídeo e se está pronto), registrar os módulos novos no `app.module.ts` e rodar `npm test` no `api/`, corrigindo regressões.

## Fase 4: Backend - Certificado por Módulo (TDD)
- [x] **Task 4.1:** Escrever a suíte de `CertificateService` no escopo módulo: emissão bloqueada com o módulo em aberto, emissão idempotente, `code` e `hash` gerados no servidor incluindo o módulo, e certificado revogado respondendo 409 — o certificado de curso da Spec 008 segue intacto (decisão 11).
- [x] **Task 4.2:** Escrever a suíte da verificação pública com os dois escopos, garantindo `scope` e título do módulo na resposta e nenhum vazamento de e-mail, CPF, telefone ou id interno (decisão 12).
- [x] **Task 4.3:** Implementar `POST /certificates/me/modules/:moduleId` e `GET /certificates/me/modules` (autenticados) e estender `GET /certificates/verify/:code` com `scope` e `moduleTitle`, sem quebrar os contratos já consumidos pelo front.
- [x] **Task 4.4:** Rodar `npm test` no `api/` e corrigir regressões nas suítes de `progress` e `certificates`.

## Fase 5: Front - Painel do Administrador (Gestão de Aulas)
- [x] **Task 5.1:** Criar `core/guards/admin.guard.ts` no padrão de `auth.guard.ts`, aplicá-lo à rota `/admin` em `app.routes.ts` e cobrir por teste que um usuário `aluno` não entra (decisão 13).
- [x] **Task 5.2:** Criar `core/services/admin-content.service.ts` (`providedIn: 'root'`, `inject(HttpClient)`, signals) com o fluxo de três passos — pedir URL, `PUT` direto no bucket com `reportProgress` e confirmar na API — para vídeo e para materiais (decisão 3).
- [x] **Task 5.3:** Evoluir a aba "Gestão de Aulas" do `admin-dashboard` (decisão 14): seleção do módulo, upload do vídeo com barra de progresso reutilizando `ui-progress-bar`, e estado do processamento (`PROCESSING` / `READY` / `ERRORED`) consultado enquanto o Mux ingere — no lugar dos signals mock `lessonTitle`/`lessonVideoUrl`.
- [x] **Task 5.4:** Implementar no mesmo painel o envio, a listagem e a remoção de materiais do módulo, com confirmação antes de excluir e feedback de erro legível.
- [x] **Task 5.5:** Escrever os `.spec.ts` do serviço e da aba: sequência dos três passos do upload, progresso exibido, erro no `PUT` sem gravar registro e bloqueio do papel `aluno`.

## Fase 6: Front - Experiência do Aluno (Player e Materiais)
- [x] **Task 6.1:** Adicionar `@mux/mux-player` e evoluir `shared/ui/video-player/` para embuti-lo: `CUSTOM_ELEMENTS_SCHEMA`, carregamento apenas no browser (o prerender da Spec 009 roda no Node), poster e estados de carregando/indisponível preservando o visual atual (decisão 8).
- [x] **Task 6.2:** Configurar o player com telemetria do Mux desabilitada e sem env key de Data, com comentário apontando a decisão 9 e a Spec 009 (decisão 4) — nenhum cookie de terceiro sem consentimento.
- [x] **Task 6.3:** Fazer a trilha buscar o token de playback do módulo em foco e reproduzir pelo `playbackId`, tratando os casos de módulo sem vídeo e de vídeo ainda em processamento sem tela quebrada (decisão 6).
- [x] **Task 6.4:** Substituir os materiais hardcoded da trilha e de `/ava/materiais` pela lista vinda da API, alimentando o `downloadUrl` do `ui-material-item` já existente com a URL assinada (decisão 15).
- [x] **Task 6.5:** Disparar a conclusão do módulo ao fim do vídeo chamando o mesmo `PATCH /progress/me/modules/:moduleId` do `ProgressService`, mantendo o botão manual como alternativa e sem marcar duas vezes o mesmo módulo (decisão 10).
- [x] **Task 6.6:** Escrever os `.spec.ts` da trilha e do `ui-video-player`: token pedido uma vez por módulo, vídeo ausente, vídeo em processamento, conclusão automática no fim e conclusão manual pelo botão.

## Fase 7: Front - Certificado do Módulo
- [x] **Task 7.1:** Estender `core/services/certificate.service.ts` com emissão e consulta dos certificados de módulo, sem duplicar o que já existe para o certificado do curso.
- [x] **Task 7.2:** Liberar na trilha o diploma do módulo assim que ele é concluído, reaproveitando a tela de certificado existente e deixando explícita a diferença entre diploma de módulo e diploma do curso.
- [x] **Task 7.3:** Atualizar o portal público `/certificado/verificar` para exibir os dois escopos (curso e módulo) nos três estados já cobertos, sem exibir dado novo de PII (decisão 12).
- [x] **Task 7.4:** Escrever os `.spec.ts` do fluxo: módulo em aberto sem emissão, módulo concluído com diploma, e verificação pública distinguindo os dois escopos.

## Fase 8: Revisão e Entrega
- [x] **Task 8.1:** Revisar responsividade (mobile-first) do player e do painel de upload, e a acessibilidade do fluxo: rótulos, `aria-live` no progresso e no estado do processamento, e foco preservado ao trocar de módulo.
- [x] **Task 8.2:** Conferir que nenhum segredo do Mux ou do Firebase aparece no bundle do `front/` e que nenhum objeto do bucket ficou público (decisões 2, 3 e 7).
- [x] **Task 8.3:** Rodar `npm test` e `npm run build` no `front/` e `npm test` no `api/`, corrigindo regressões.
- [x] **Task 8.4:** Teste funcional de ponta a ponta com `api/` em `localhost:3000` e `front/` em `localhost:4200`: subir vídeo e materiais pelo painel, acompanhar o processamento até `READY`, assistir como aluno, baixar um material, concluir o módulo pelo fim do vídeo, emitir o certificado do módulo e validá-lo no portal público — mais a tentativa de acesso ao painel com um usuário `aluno`.
- [x] **Task 8.5:** Entregar conforme `.claude/RULES.md`: uma branch `feat/<>` por fase, um commit por task, merge das feats em `release/010-storage-e-cdn` e as decisões desta spec destacadas no topo do PR.

---

## Pendência conhecida (fora do alcance desta execução)

**`MUX_SIGNING_KEY_ID` / `MUX_SIGNING_PRIVATE_KEY` ainda não existem.** Os
assets são criados com policy `signed` (decisão 6) e tudo o mais foi validado
ponta a ponta contra o Mux real — upload, ingestão até `READY`, estado no
painel, materiais e certificado. O que falta é a **chave de assinatura**: o
access token disponível é da integração Mux da Vercel, com permissão apenas de
Mux Video, e `POST /system/v1/signing-keys` responde 403. Criar a chave exige
acesso ao dashboard do Mux (Settings → Signing Keys) ou um token com permissão
de System.

Enquanto as variáveis não existirem, `GET /modules/:moduleId/playback-token`
responde 500 e a trilha mostra "Não foi possível preparar o vídeo desta aula",
com o botão manual de conclusão preservado. Assim que a chave for preenchida no
`.env` e nas variáveis da Vercel, o playback passa a funcionar sem nenhuma
alteração de código.
