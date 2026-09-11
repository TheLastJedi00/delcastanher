# Spec 010: Storage e CDN — Vídeo e Materiais das Aulas

**Projeto:** Plataforma E-learning "Imersão RH Estratégico"
**Baseada em:** Spec 002 (Design System), Spec 004 (Autenticação), Spec 005 (CRUD de Usuários), Spec 008 (Área do Aluno) e Spec 009 (Analytics e Conformidade)
**Escopo técnico:** full-stack — `api/` (NestJS + Prisma + Firebase Admin) e `front/` (Angular standalone + signals + Tailwind). O backend é escrito com TDD: a suíte vem antes da implementação (`.claude/RULES.md`).

## Objetivo
Substituir o conteúdo fictício da trilha por conteúdo real: o administrador envia o vídeo e os materiais de cada módulo, o vídeo é armazenado como fonte/backup no Firebase Storage e distribuído por CDN (Mux) com playback protegido, e o aluno assiste, baixa os materiais, conclui o módulo e emite o certificado correspondente.

## Escopo

- **Armazenamento (Firebase Storage):** materiais complementares e o arquivo original de cada vídeo, sem objeto público — todo acesso é por URL assinada de curta duração emitida pela API.
- **CDN de streaming (Mux):** cada módulo tem um asset no Mux gerado a partir do arquivo já enviado ao Storage, com playback assinado por aluno autenticado.
- **Painel do Administrador:** a aba "Gestão de Aulas", hoje mock, passa a enviar de verdade o vídeo e os materiais de um módulo e a exibir o estado do processamento.
- **Experiência do Aluno:** player real na trilha, lista de materiais para download, conclusão do módulo disparada ao fim do vídeo e certificado do módulo concluído.

## Decisões técnicas desta spec

1. **Vídeo e materiais pertencem ao módulo; não se cria o nível "aula".**
   O `context` original falava em "aulas" dentro de módulos, mas a Spec 008 (decisão 3) decidiu o contrário e o schema reflete isso: existe `Course → Module`, e `ModuleProgress` registra a conclusão por módulo. Criar `Lesson` agora obrigaria a migrar o progresso, o percentual, o deep-link `/ava/trilha/:moduleId` e a regra do certificado — reescrever a Spec 008 inteira para acomodar um nome. Cada módulo passa a ter **um vídeo** e **N materiais**. "Aula" continua sendo rótulo de UI, como já é em "Próxima aula" e "Gestão de Aulas".

2. **O front nunca fala com o Firebase; quem fala é a API.**
   O `front/` não tem `firebase` nem `@angular/fire` no `package.json`, e isso é arquitetura, não lacuna: desde a Spec 004 o login é `POST /auth/login` na API, que detém o Admin SDK e a service account. Instalar o SDK do Firebase no Angular só para o upload criaria um segundo caminho de credencial no cliente, com regras de segurança do bucket a manter em paralelo às regras que já existem nos guards da API. O `StorageService` desta spec vive no **backend**.

3. **O arquivo sobe do navegador direto para o bucket, por URL assinada.**
   A API roda como função serverless na Vercel, onde o corpo de uma request é limitado a poucos megabytes — um vídeo de aula não passa pelo servidor nem como multipart nem como base64. O fluxo é: o admin pede `POST .../upload-url`, a API valida papel, tipo e tamanho e devolve uma **URL assinada v4 de escrita**; o navegador faz o `PUT` direto no Google Cloud Storage; o admin confirma com `POST .../confirm` e só então a API grava a referência no banco. Nenhum objeto do bucket é tornado público em nenhum momento.

4. **O vídeo sobe uma vez só: o Mux ingere a partir do Storage.**
   A task original mandava "enviar o vídeo para o Firebase Storage e solicitar a criação do Asset no Mux", o que no serverless significaria baixar e reenviar o arquivo pelo servidor. Em vez disso, a confirmação do upload gera uma **URL assinada de leitura** e a entrega ao Mux como `input`, que puxa o arquivo por conta própria. Storage é a fonte e o backup; Mux é a distribuição. Um upload, dois destinos.

5. **A ingestão é assíncrona, e o estado disso é dado.**
   Criar o asset devolve `playbackId` na hora, mas o vídeo só é reproduzível quando fica `ready`. O módulo guarda `videoStatus` (`PENDING` → `PROCESSING` → `READY` / `ERRORED`), atualizado por **webhook** do Mux (`video.asset.ready` / `video.asset.errored`) em rota pública com verificação de assinatura, e o painel consulta o estado enquanto espera. Sem isso o admin publicaria um módulo cujo player só falha para o aluno.

6. **Playback assinado, porque a plataforma inteira é paga.**
   Não existe free tier: todo conteúdo dentro da área logada é conteúdo pago. A policy dos assets é `signed` — o `playbackId` sozinho não reproduz nada. `GET /modules/:moduleId/playback-token` exige sessão e devolve um JWT curto assinado com a chave do Mux. Um id vazado em print, DevTools ou grupo de WhatsApp não vira acesso vitalício ao curso. O vínculo entre pagamento e acesso (matrícula/entitlement) continua fora de escopo aqui, como nas Specs 007 e 008: hoje o portão é a sessão autenticada, e quando o modelo de matrícula existir ele entra exatamente neste ponto, na emissão do token.

7. **Segredos do Mux só existem no backend.**
   `MUX_TOKEN_ID`, `MUX_TOKEN_SECRET`, `MUX_SIGNING_KEY_ID`, `MUX_SIGNING_PRIVATE_KEY`, `MUX_WEBHOOK_SECRET` e `FIREBASE_STORAGE_BUCKET` entram pelo `ConfigService` do `api/`, em `.env` local e nas variáveis do projeto na Vercel. Eles **não** entram em `environment.ts`: o padrão da Spec 009 (decisão 5) vale para `gtmId`/`ga4Id`, que são públicos por natureza — uma chave secreta compilada no bundle estaria visível para qualquer visitante. O bucket vai pelo nome (`delcastanher-b9142.firebasestorage.app`), sem o prefixo `gs://`, que o Admin SDK não aceita.

8. **O player evolui o `ui-video-player`, não concorre com ele.**
   O componente já existe em `shared/ui/video-player/`, já é usado pela trilha e tem o input `src` comentado como "reservado para a integracao futura" — esta spec é essa integração. Ele passa a embutir `<mux-player>` (`@mux/mux-player`, web component, com `CUSTOM_ELEMENTS_SCHEMA`), carregado apenas no browser: o prerender da Spec 009 roda no Node, e mesmo com `/ava` sendo CSR o import não pode quebrar o build. Não existe pacote Angular oficial do Mux — a task original citava um `@mux/mux-player-angular` inexistente.

9. **Mux Data desligado: terceiro não grava cookie sem consentimento.**
   O player do Mux traz telemetria de audiência que grava identificador no navegador. A Spec 009 (decisão 4) condicionou todo terceiro ao aceite, e a área logada não tem banner próprio. O player entra com a coleta desabilitada e sem env key de Data. Ligar telemetria de vídeo é decisão de outra spec, com base legal declarada na Política de Cookies.

10. **A conclusão ganha gatilho automático, mas o botão continua existindo.**
    A Spec 008 deixou "marcação automática por tempo assistido" fora de escopo porque não havia player real; com o vídeo em pé, o fim da reprodução passa a marcar o módulo. O que **não** muda é o endpoint: continua `PATCH /progress/me/modules/:moduleId`, a mesma porta que o Hub, a trilha e o certificado já usam. O botão manual permanece como alternativa acessível — vídeo que não carrega não pode deixar o aluno preso sem conseguir concluir o curso.

11. **Certificado de módulo convive com o certificado do curso.**
    O da Spec 008 continua intacto: um diploma por aluno quando o curso chega a 100%. O novo é por módulo, emitido quando aquele módulo é concluído, no mesmo model — `Certificate.moduleId` nulo significa diploma do curso, preenchido significa diploma do módulo. O `@@unique([userId, courseId])` atual precisa cair, porque bloquearia o segundo certificado do mesmo curso; a unicidade passa a ser `unique(userId, moduleId)` para os de módulo mais um **índice único parcial** (`WHERE module_id IS NULL`) em SQL na migration, para manter "um único diploma de curso por aluno".

12. **O portal público passa a mostrar os dois tipos sem vazar nada a mais.**
    `GET /certificates/verify/:code` ganha `scope` (`course` | `module`) e o título do módulo quando houver. Os três estados da Spec 008 (decisão 8) e a regra de PII (decisão 7) valem igual: nem e-mail, nem CPF, nem telefone, nem id interno.

13. **Upload é rota de administrador, e hoje nada garante isso.**
    O claim `role` existe desde a Spec 004 (`aluno` | `admin`), mas a API não tem guard que o leia e `/admin` no `app.routes.ts` só tem `authGuard` + `onboardingGuard`. Publicar endpoints de upload nesse estado deixaria qualquer aluno autenticado pedindo URL de escrita no bucket. Entram nesta spec um `RolesGuard` + `@Roles('admin')` no backend e um `adminGuard` no front — é pré-requisito do upload, não melhoria paralela.

14. **Gestão de Aulas é a aba que já existe.**
    `admin-dashboard` já tem a aba `aulas` e os signals mock `lessonTitle`/`lessonVideoUrl`. Ela é evoluída para o fluxo real, como a Spec 008 fez com o Hub (decisão 1), em vez de nascer uma segunda tela de administração de conteúdo.

15. **Materiais deixam de ser array hardcoded.**
    Hoje `trilha.ts` tem dois materiais fixos no componente e `/ava/materiais` tem outros dois — listas diferentes para o mesmo curso. As duas telas passam a ler da API, e o `ui-material-item` já aceita `downloadUrl`, então nenhum componente novo é necessário. O link de download é URL assinada de leitura, gerada no momento da consulta e de validade curta.

16. **Mux e Storage ficam atrás de uma porta própria, por causa do TDD.**
    `MuxService` e `StorageService` isolam as chamadas de rede para que as suítes de `content`, `certificates` e `progress` rodem sem tocar em Mux nem em GCS, no mesmo espírito do `FirebaseService` já existente.

## Integração com o existente
Os novos módulos do `api/` seguem a estrutura de `users/` e `progress/` (controller + service + dto + types, `PrismaService` injetado) e são registrados no `app.module.ts`. O `FirebaseService` ganha o getter `storage`, irmão do `auth` que já existe. No `front/`, os serviços novos entram em `core/services/` no padrão de `progress.service.ts` (`providedIn: 'root'`, `inject(HttpClient)`, estado em signals) e o `auth.interceptor` já anexa o token nas chamadas autenticadas. A trilha (`/ava/trilha/:moduleId`), o Hub (`/ava`), a central de materiais (`/ava/materiais`), o certificado (`/ava/certificado`) e o portal público (`/certificado/verificar`) são telas existentes — todas evoluem, nenhuma é recriada.

## Fora de escopo
- Catálogo multi-curso, matrícula ou entitlement ligando pagamento a acesso (segue valendo a decisão 5 da Spec 008; a plataforma é integralmente paga, e o modelo de cobrança será tratado em spec própria).
- Legendas, capítulos, múltiplas faixas de áudio, DRM e download do vídeo pelo aluno.
- Mux Data / analytics de retenção de vídeo e qualquer novo evento de terceiro antes de base legal declarada (decisão 9).
- Upload em lote, reordenação de módulos e CRUD de módulos pelo painel — o seed da Spec 008 continua sendo a origem dos 12 módulos.
- UI de revogação de certificado (segue no model, sem tela, como na Spec 008).
- Transcodificação, compressão ou edição de vídeo no servidor.
