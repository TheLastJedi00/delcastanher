# Spec 012: Aulas e Trilha de Vídeos — o Módulo como Container

**Projeto:** Plataforma E-learning "Imersão RH Estratégico"
**Baseada em:** Spec 002 (Design System), Spec 004 (Autenticação), Spec 008 (Área do Aluno), Spec 009 (Analytics e Conformidade) e Spec 010 (Storage e CDN)
**Escopo técnico:** full-stack — `api/` (NestJS + Prisma + Mux + Firebase Storage) e `front/` (Angular standalone + signals + Tailwind). O backend é escrito com TDD: a suíte vem antes da implementação (`.claude/RULES.md`).

## Objetivo
Um módulo passa a ser um **container de aulas**, e não uma aula com nome de módulo. Cada aula tem o seu vídeo e os seus materiais complementares; o aluno navega entre módulos na vertical (o `aside` que já existe) e entre as aulas de um módulo numa **trilha enumerada horizontal**, saltando entre os vídeos sem sair da tela. No painel, publicar conteúdo deixa de ser "pendurar um vídeo num módulo" e passa a ser compor a lista de aulas daquele módulo.

## Escopo

- **Nível "aula" no modelo:** novo `Lesson` entre `Module` e o conteúdo. Vídeo e materiais migram do módulo para a aula; o progresso passa a ser por aula e a conclusão do módulo passa a ser **derivada**.
- **Trilha horizontal do módulo:** componente novo de UI com as aulas numeradas, estado (concluída / em foco / em aberto) e duração, acima do player.
- **Deep-link por aula:** `/ava/trilha/:moduleId/:lessonId`, com as duas formas anteriores continuando válidas.
- **Materiais por aula:** cada aula tem N materiais próprios; a central `/ava/materiais` passa a agrupar por módulo → aula.
- **Painel do administrador:** criar, renomear, reordenar e remover aulas de um módulo; criar, renomear e reordenar módulos; o upload de vídeo e de materiais passa a ser da aula.
- **Critério de certificado revisto:** diploma de módulo quando **todas** as aulas daquele módulo estão concluídas; diploma de curso quando todas as aulas de todos os módulos estão.

## Decisões técnicas desta spec

1. **O nível "aula" passa a existir, e isso reverte deliberadamente a Spec 008 (decisão 3) e a Spec 010 (decisão 1).**
   As duas specs recusaram criar `Lesson` com um argumento correto para a época: o custo era migrar progresso, percentual, deep-link e certificado para acomodar **um nome**. O que muda agora não é o nome — é o produto. Um módulo com vários vídeos, cada um com o seu material, não cabe em `Module.muxPlaybackId` (uma coluna, um vídeo) nem em `Material.moduleId` (materiais soltos no módulo, sem dizer a qual vídeo pertencem). Manter "aula" como rótulo de UI só era honesto enquanto módulo e vídeo eram 1:1. A migração que as specs anteriores evitaram é exatamente o trabalho desta spec, e é feita de uma vez, com dados preservados (decisão 3).

2. **`Module` fica sem conteúdo; conteúdo é da aula.**
   Saem de `Module` as colunas `videoStoragePath`, `videoOriginalName`, `videoSizeBytes`, `muxAssetId`, `muxPlaybackId`, `videoStatus` e `videoError`, e entram em `Lesson` — não são duplicadas nos dois níveis. Módulo guarda apenas `order`, `title`, `summary`: o que ele passa a ser é o agrupador com o qual o `aside` trabalha. `Material.moduleId` vira `Material.lessonId`. Um material que valha para o módulo inteiro é pendurado na aula onde ele é usado; criar um segundo dono opcional (`moduleId` **ou** `lessonId`, um nulo) faria toda leitura de materiais ter dois caminhos, e nenhuma tela precisa disso hoje.

3. **A migração converte cada módulo de hoje em um módulo com uma aula, sem perder progresso nem diploma.**
   Existem 12 módulos semeados, com vídeo real no Mux, materiais no bucket, `ModuleProgress` de alunos e certificados emitidos. A migration é SQL com dados, nesta ordem: cria `lessons` e `lesson_progress`; insere **uma** aula por módulo (`order = 1`, título e resumo copiados do módulo) carregando as colunas de vídeo; repontua `materials.lesson_id` para a aula do seu módulo; converte cada linha de `module_progress` na linha equivalente de `lesson_progress`; só então derruba as colunas de vídeo de `modules`, a tabela `module_progress` e `materials.module_id`. No corte, nenhum aluno vê o percentual mudar e nenhum diploma emitido deixa de valer — a conclusão de um módulo de uma aula é a mesma antes e depois.

4. **Os caminhos no bucket passam a ser por aula, e os objetos existentes não se mexem.**
   Objeto novo vai para `lessons/<lessonId>/video/...` e `lessons/<lessonId>/materials/...`, no lugar de `modules/<moduleId>/...`. Os objetos já enviados **permanecem onde estão**: o caminho é dado gravado em `videoStoragePath`/`storagePath`, não algo derivado do id na hora da leitura, então a URL assinada continua sendo emitida corretamente para os dois formatos. Renomear objeto no GCS é copiar e apagar — risco de perder a fonte de um vídeo para arrumar a estética de um prefixo.

5. **Conclusão do módulo é derivada, e a única coisa que o aluno marca é a aula.**
   `ModuleProgress` deixa de existir e `LessonProgress` toma o lugar: "módulo concluído" passa a ser "todas as aulas deste módulo concluídas", calculado na leitura. Guardar as duas coisas criaria o estado impossível — módulo marcado como concluído com aula em aberto — e obrigaria um recálculo a cada mudança de conteúdo. Consequência direta: `PATCH /progress/me/modules/:moduleId` **é removido**, não redirecionado. A Spec 008 (decisão 3) e a Spec 010 (decisão 10) o defenderam como "a única porta da conclusão"; a porta continua única, mas agora é `PATCH /progress/me/lessons/:lessonId`. Manter o endpoint de módulo significaria marcar em cascata todas as aulas de um módulo a partir de um clique que o aluno não deu — inclusive vídeos que ele não assistiu.

6. **O percentual passa a contar aulas, não módulos.**
   `GET /progress/me` mantém o contrato de topo (`percentage`, `completedCount`, `totalCount`, `nextModule`, `completed`), mas os contadores passam a ser de aula, e cada módulo devolve `lessons[]` com o estado de cada uma mais os seus próprios `completedCount`/`totalCount`. É o que a barra do `aside`, o card do Hub e a trilha horizontal precisam para mostrar "3 de 5 aulas" sem cada tela refazer a conta — o mesmo motivo pelo qual a Spec 008 já calculava o percentual no servidor. `nextModule` ganha `nextLesson`: "Próxima aula" no Hub finalmente aponta para uma aula de verdade.

7. **Navegação livre entre as aulas, sem liberação sequencial.**
   Nada na plataforma nunca bloqueou conteúdo: os 12 módulos sempre estiveram todos abertos, e a Spec 010 (decisão 6) definiu que o portão é a sessão autenticada, não o progresso. Uma trilha enumerada horizontal cujos números 3 a 5 estivessem desabilitados seria uma regra de produto nova — *gating* — entrando de carona numa spec de entrega de vídeo. Toda aula é alcançável a qualquer momento; o que a trilha mostra é onde o aluno está e o que já concluiu.

8. **Um eixo de navegação, um componente: vertical para módulos, horizontal para aulas.**
   O `aside` continua sendo a lista de módulos com `ui-module-card` — é a navegação vertical que já existe e que o aluno já conhece. As aulas entram num `ui-lesson-track` novo, horizontal, logo acima do player: pastilhas numeradas com título e duração, `scroll-snap` no mobile, seta do teclado andando entre elas, `aria-current="step"` na aula em foco. O módulo em foco no `aside` **expande** para listar as suas aulas, apontando para as mesmas rotas — não é uma terceira navegação, é o mesmo dado no formato linear de que o leitor de tela e o *drawer* "Ver Trilha" do mobile precisam. Os dois caminhos navegam; nenhum guarda seleção local (decisão 9).

9. **A URL continua sendo a dona da posição do aluno.**
   `/ava/trilha/:moduleId/:lessonId` é a forma completa. `/ava/trilha/:moduleId` abre a primeira aula em aberto daquele módulo (a primeira, se todas concluídas) e `/ava/trilha` continua abrindo a próxima aula do aluno — as duas formas antigas seguem válidas, então link salvo, e-mail e histórico do navegador não quebram. Id inexistente ou aula que não pertence ao módulo da URL caem no primeiro item válido, sem tela quebrada, como a Spec 008 (decisão 4) já fazia.

10. **Playback e materiais passam a ser da aula, e as rotas de módulo saem.**
    `GET /lessons/:lessonId/playback-token` e `GET /lessons/:lessonId/materials` substituem as versões `/modules/:moduleId/...`. A policy `signed` da Spec 010 (decisão 6) e a URL assinada de curta duração (decisão 15) continuam iguais — o que muda é o dono do conteúdo, não a forma de protegê-lo. `GET /materials` (a central) continua existindo e passa a devolver módulo **e** aula em cada item.

11. **`ui-video-player` não muda de responsabilidade.**
    Ele recebe `playbackId`/`playbackToken`/`state` e emite `ended`, e continua sem saber o que é módulo ou aula (Spec 010, decisão 8). A troca de aula é troca de inputs, e o `<mux-player>` precisa ser reinicializado quando o `playbackId` muda no mesmo componente — sem isso o aluno clica na aula 2 e continua vendo o frame da aula 1. A telemetria do Mux segue desligada (Spec 010, decisão 9).

12. **Fim do vídeo conclui a aula, e o avanço automático para a próxima não entra.**
    O gatilho da Spec 010 (decisão 10) continua, agora em `PATCH /progress/me/lessons/:lessonId`, e o botão manual continua como alternativa acessível. O que **não** se faz é encadear reprodução automática: com aulas em sequência, um *autoplay* levaria o aluno para o próximo vídeo sem ele pedir — e a Spec 009 tratou consentimento e controle do usuário como regra, não como detalhe. Concluir a aula revela o botão "Próxima aula"; quem clica é o aluno.

13. **Diploma de módulo exige o módulo inteiro; não existe diploma de aula.**
    O critério da Spec 010 (decisão 11) era "aquele módulo concluído", o que com uma aula por módulo era a mesma coisa. Agora é explicitamente "todas as aulas daquele módulo concluídas" — emitir por aula multiplicaria diplomas por doze e esvaziaria o que o documento atesta. O model `Certificate` não muda: `moduleId` nulo é o diploma do curso, preenchido é o do módulo, e o índice único parcial continua garantindo um só diploma de curso por aluno.

14. **Diploma já emitido não é revogado por conteúdo novo.**
    Se o administrador acrescenta uma aula a um módulo que um aluno já concluiu, aquele módulo volta a aparecer em aberto — corretamente, há conteúdo novo a assistir. O diploma emitido **continua ativo**: ele atesta o que estava publicado na data da emissão, e revogar por iniciativa do sistema tiraria valor de um documento que o aluno pode já ter enviado a um recrutador. A emissão continua idempotente (Spec 008, decisão 11), então concluir a aula nova não gera um segundo código. Revogação segue sendo ato deliberado, sem UI.

15. **Módulo com diploma emitido não pode ser apagado — e hoje ele apagaria o diploma em silêncio.**
    `Certificate.module` está com `onDelete: Cascade`: abrir remoção de módulos no painel, como esta spec faz para aulas, transformaria "excluir módulo" em "excluir os diplomas daquele módulo", sem aviso e sem rastro. A relação passa a `onDelete: Restrict`, e a remoção de módulo fica **fora** desta spec: criar, renomear e reordenar bastam para compor a grade, e apagar um módulo que já certificou gente é decisão de produto, não de painel.

16. **Remover uma aula apaga o progresso dela, e o painel diz isso antes.**
    `Lesson → LessonProgress` e `Lesson → Material` cascateiam: aula removida leva consigo as conclusões e os materiais, mais o asset no Mux e os objetos no bucket (o `DELETE` de material da Spec 010 já faz isso, e a remoção de aula reaproveita o mesmo caminho). Deixar `lesson_progress` apontando para conteúdo inexistente corromperia o percentual de quem já estudou. A confirmação no painel informa quantos alunos concluíram aquela aula antes de executar.

17. **Ordenação é transação, não *update* solto.**
    `@@unique([moduleId, order])` — e o `@@unique([courseId, order])` que já existe em `Module` — fazem qualquer reordenação passar por um estado intermediário em conflito. `PATCH /admin/modules/:moduleId/lessons/order` (e o equivalente de módulos) recebe a lista completa de ids na ordem desejada e grava dentro de uma transação, validando que a lista contém exatamente os itens daquele pai. Nenhuma tela reordena item por item.

18. **Duração da aula vem do Mux, pelo webhook que já existe.**
    A trilha horizontal mostra o tempo de cada vídeo, e essa informação não pode ser digitada pelo administrador — divergiria do arquivo no primeiro reenvio. `video.asset.ready` já traz `duration`; `Lesson.durationSeconds` é gravado no mesmo *handler* que hoje escreve `videoStatus` (Spec 010, decisão 5). Nulo significa "ainda não processado", e a pastilha simplesmente não mostra tempo.

19. **Publicar é criar aula; não há rascunho nem agendamento.**
    Uma aula recém-criada aparece na trilha do aluno imediatamente, com o player no estado "em processamento" ou "indisponível" que a Spec 010 (decisão 5) já modelou. Um campo `published` traria fluxo de publicação, pré-visualização e regra de "o que conta para o certificado" — spec própria. O administrador controla a visibilidade criando a aula quando o vídeo está pronto para subir.

20. **A grade comercial não é gerada a partir das aulas.**
    `core/mocks/courses.mock.ts` promete 12 módulos com três tópicos cada, e esses tópicos **não** são as aulas: são texto de venda. Ligar a landing ao conteúdo real exporia a grade em construção na página de vendas e é decisão comercial. O mock continua hardcoded, como todo o conteúdo de marketing (Spec 011, fora de escopo), e o seed continua sendo a origem dos 12 módulos — o que o painel passa a compor são as aulas dentro deles.

21. **`lesson_started` passa a ser verdade.**
    O evento da Spec 009 é disparado hoje por módulo em foco, porque não havia aula. Ele passa a ser disparado por aula, com `module_id` e `lesson_id`, e continua morando na trilha e não no `ui-video-player` — componente de apresentação não conhece o domínio. Nenhum evento novo e nenhum terceiro novo entram: a decisão 4 da Spec 009 continua valendo.

## Integração com o existente
O `Lesson` entra no `api/prisma/schema.prisma` entre `Module` e `Material`, e os módulos de `content/`, `progress/` e `certificates/` são evoluídos no lugar — nenhum módulo novo do Nest nasce, porque a responsabilidade é a mesma com outro dono. `StorageService`, `MuxService`, `RolesGuard` e o webhook do Mux (Spec 010) continuam intactos; muda o que eles recebem. No `front/`, a trilha (`/ava/trilha`), o Hub (`/ava`), a central de materiais (`/ava/materiais`) e a aba "Gestão de Aulas" (`features/admin/aulas/`) são as mesmas telas, evoluídas; `ui-lesson-track` entra em `shared/ui/` no padrão dos demais (standalone, `OnPush`, `input()`/`output()`, template inline), e `ui-module-card` ganha o contador de aulas e a lista expansível. `content.service.ts`, `progress.service.ts`, `certificate.service.ts` e `admin-content.service.ts` mantêm o padrão de signals já vigente.

## Fora de escopo
- Remoção de módulo pelo painel (decisão 15) e UI de revogação de certificado (segue no model, sem tela, desde a Spec 008).
- Rascunho, agendamento de publicação e pré-visualização de aula (decisão 19).
- Liberação sequencial de aulas, pré-requisito entre módulos e qualquer forma de *gating* por progresso (decisão 7).
- Reprodução automática da próxima aula e retomada no segundo exato em que o aluno parou (o progresso continua sendo binário por aula) — decisão 12.
- Quiz, exercício, entrega avaliada, comentário ou pergunta na aula.
- Diploma por aula (decisão 13).
- Catálogo multi-curso, matrícula ou entitlement ligando pagamento a acesso — segue valendo desde a Spec 008 (decisão 5).
- Sincronizar a grade comercial da landing com as aulas publicadas (decisão 20).
- Legendas, capítulos, DRM, download do vídeo pelo aluno e Mux Data — segue valendo a Spec 010.
- Upload em lote de vídeos e importação de uma grade inteira por planilha.
