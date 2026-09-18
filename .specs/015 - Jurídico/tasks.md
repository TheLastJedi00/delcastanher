# Tasks: Spec 015 - Jurídico (Política de Privacidade e Política de Cookies)

Spec majoritariamente de `front/` (Angular standalone + signals + Tailwind), com uma fase de `api/` (NestJS + Prisma + Jest) onde a suíte vem **antes** da implementação, conforme `.claude/RULES.md`. Valem o Design System da Spec 002 e os componentes de `front/src/app/shared/ui/`. As decisões referenciadas estão no `context.md`, e o texto-fonte está em `notas-originais.md`.

Ordem das fases: a casca e as constantes vêm primeiro porque as duas páginas dependem delas; a privacidade vem antes da cookies por ser a que tem texto de terceiro a transcrever; a subida de versão só acontece quando as duas páginas já estão redigidas — elevar `CONSENT_POLICY_VERSION` com página ainda em placeholder reabriria o banner apontando para documento pendente; o backend do aceite é independente e pode correr em paralelo; o onboarding fecha, porque precisa da coluna e da versão nova.

## Fase 1: Front - Casca Redigida e Dados da Controladora
- [ ] **Task 1.1:** Criar `features/legal/company-info.ts` com razão social, CNPJ, cidade/UF, e-mail e telefone da Delcastanher, em um único lugar — o contato aparece em duas seções da política e repetido nos dois arquivos divergiria na primeira atualização (decisão 5). Documentar no comentário que o e-mail é pessoal e deve ser trocado por `privacidade@` no domínio próprio quando a caixa existir.
- [ ] **Task 1.2:** Estender `LegalSection` em `legal-page.ts` para aceitar corpo redigido (`paragraphs: string[]`, com suporte a lista de itens) além dos `topics` já existentes, mantendo as duas formas — a página de Termos de Uso continua pendente e continua precisando do roteiro (decisão 4).
- [ ] **Task 1.3:** Transformar o bloco "Documento pendente de revisão jurídica" em input `pending` da `LegalPage`, com `true` preservando o comportamento atual, e ajustar `termos-de-uso.ts` para passá-lo explicitamente.
- [ ] **Task 1.4:** Substituir, no rodapé da casca, a frase fixa sobre reabertura de consentimento por um texto que só faça sentido na página redigida, e manter a menção de versão vigente nas três.
- [ ] **Task 1.5:** Escrever `legal-page.spec.ts` cobrindo os dois modos: com `pending` verdadeiro, o aviso e o `ui-placeholder-text` aparecem e nenhum parágrafo é renderizado; com `pending` falso e `paragraphs` preenchidos, o aviso some, o marcador some e os parágrafos aparecem na ordem recebida.

## Fase 2: Front - Política de Privacidade
- [ ] **Task 2.1:** Transcrever as seções 1 a 14 de `notas-originais.md` para `politica-de-privacidade.ts` **verbatim**, preservando numeração, títulos e listas, sem reescrever nenhuma frase e sem reaproveitar a estrutura de 10 seções da Spec 009 (decisão 1). O rodapé repetido do PDF ("DELCASTANHER … • Política de Privacidade e Proteção de Dados") não é conteúdo e não entra.
- [ ] **Task 2.2:** Preencher as lacunas da seção 10 com o e-mail e o telefone de `company-info.ts`, e **omitir** a linha de Encarregado em vez de inventar um nome (decisão 5).
- [ ] **Task 2.3:** Puxar razão social, CNPJ e sede das seções 1, 2 e 14 de `company-info.ts`, sem alterar o texto ao redor.
- [ ] **Task 2.4:** Acrescentar a seção "15. Informações específicas desta plataforma", aberta pela linha que declara sua origem (complemento operacional da Delcastanher, fora do documento revisado), cobrindo: dado de cartão digitado em campos do Mercado Pago e nunca recebido, logado ou guardado pela Delcastanher (Spec 014, decisão 8); cookie de medição carregado só após consentimento, com remissão à Política de Cookies (Spec 009, decisão 5); acesso de 6 meses por módulo e dados de pedido guardados como registro fiscal (Spec 014, decisão 5); e certificado emitido mantido após a expiração do acesso, para permitir validação por terceiros (Spec 014, decisão 18).
- [ ] **Task 2.5:** Reproduzir a "Declaração de Ciência" ao final, visualmente distinta das cláusulas, e desligar o `pending` da página.
- [ ] **Task 2.6:** Atualizar o `summary` da página e a `description` da rota em `app.routes.ts`, que hoje descrevem um documento pendente.
- [ ] **Task 2.7:** Escrever `politica-de-privacidade.spec.ts` verificando que as 15 seções são renderizadas na ordem, que o marcador `LEGAL_PLACEHOLDER` **não** aparece em lugar nenhum, que o aviso de pendência sumiu, e que o e-mail e o CNPJ exibidos são os de `company-info.ts`.

## Fase 3: Front - Política de Cookies e Versão da Política
- [ ] **Task 3.1:** Redigir as seis seções de `politica-de-cookies.ts` a partir do comportamento real do `ConsentService` e da Spec 009 (decisão 3), sem placeholder: o que são cookies e a diferença entre próprio e de terceiro; os necessários (sessão do Firebase e o registro da própria escolha) e por que não dependem de consentimento; os de medição de audiência e o fato de só carregarem após o aceite; como gerenciar a escolha; o prazo de validade do consentimento; e o contato.
- [ ] **Task 3.2:** Conferir no `analytics.service.ts` e no `consent.service.ts` **quais** cookies e chaves de armazenamento são de fato gravados, e listar nome, origem, finalidade e prazo na seção 2 e na seção 3 — a página não pode descrever um cookie que o código não grava, nem omitir um que grava.
- [ ] **Task 3.3:** Redigir a seção 5 a partir da regra real de invalidação por versão (`policyVersion !== CONSENT_POLICY_VERSION`), explicando que uma nova versão da política reabre o pedido de consentimento, e desligar o `pending` da página.
- [ ] **Task 3.4:** Subir `CONSENT_POLICY_VERSION` de `2026-09-10` para `2026-09-13`, a data do documento, e atualizar o comentário do arquivo para citar esta spec como a primeira aplicação real do mecanismo (decisão 6).
- [ ] **Task 3.5:** Rodar `consent.service.spec.ts` e conferir que o teste de consentimento gravado sob versão anterior continua passando com a constante nova — se ele tiver a data velha escrita à mão, a suíte é que está errada, não o comportamento.
- [ ] **Task 3.6:** Escrever `politica-de-cookies.spec.ts`: seções redigidas sem marcador, aviso de pendência ausente, bloco de "sua escolha atual" preservado e o botão de rever preferências ainda chamando `consent.reopen()`.
- [ ] **Task 3.7:** Rodar `npm test` no `front/` e corrigir regressões — `legal-page.ts` é casca compartilhada pelas três rotas.

## Fase 4: Backend - Registro do Aceite (TDD)
- [ ] **Task 4.1:** Escrever a suíte do `PATCH /users/me`: conclusão de onboarding recusada sem aceite; conclusão com aceite gravando `policyAcceptedAt` e `policyAcceptedVersion`; atualização de perfil de usuário que **já** concluiu o onboarding aceita sem reenviar aceite (decisão 9); e aceite já registrado não sobrescrito por atualização posterior de perfil.
- [ ] **Task 4.2:** Escrever a suíte do `GET /users/me` e do `GET /admin/users/:id` devolvendo os dois campos, com nulo em conta anterior à spec — nulo é "nunca viu o checkbox", nunca "recusou" (decisão 8).
- [ ] **Task 4.3:** Acrescentar `policyAcceptedAt DateTime?` e `policyAcceptedVersion String?` ao model `User` do `api/prisma/schema.prisma`, documentando no comentário o significado do nulo e por que não há tabela de histórico (decisão 8).
- [ ] **Task 4.4:** Escrever a migration correspondente, **sem** backfill: inventar aceite retroativo para quem nunca viu o checkbox seria fabricar a prova que a coluna existe para guardar.
- [ ] **Task 4.5:** Estender o DTO do `PATCH /users/me` com o aceite e implementar a validação e a gravação no `UsersService`, com a versão aceita vindo do cliente e validada contra o conjunto de versões conhecidas — versão arbitrária vinda do navegador não é registro de nada.
- [ ] **Task 4.6:** Rodar `npm test` no `api/` e corrigir regressões — `PATCH /users/me` já tem suíte da Spec 004 e da Spec 005.

## Fase 5: Front - Aceite no Onboarding e Visibilidade no Admin
- [ ] **Task 5.1:** Criar (ou estender) um controle de checkbox no Design System, no padrão de `shared/ui/input/`, com rótulo, estado de erro e suporte a conteúdo com links — o onboarding é o primeiro formulário da plataforma que precisa de um.
- [ ] **Task 5.2:** Acrescentar o controle `policyAccepted` ao `FormGroup` do `onboarding.ts` com `Validators.requiredTrue`, desmarcado por padrão, com os três documentos linkados abrindo em nova aba (decisão 10), e enviá-lo na mesma requisição do perfil (decisão 7).
- [ ] **Task 5.3:** Exibir a mensagem de erro do aceite no padrão dos demais campos e manter o botão desabilitado enquanto ele não estiver marcado, sem esconder o motivo.
- [ ] **Task 5.4:** Carregar `policyAcceptedAt` e `policyAcceptedVersion` no `UserService` e no tipo de perfil, para o admin consumir.
- [ ] **Task 5.5:** Mostrar o aceite no detalhe do aluno do `/admin`, junto dos acessos e pedidos, como linha de leitura — "aceitou a versão X em DD/MM/AAAA" ou "sem aceite registrado" —, sem nenhuma ação de edição (decisão 11).
- [ ] **Task 5.6:** Atualizar `onboarding.spec.ts`: submissão bloqueada com o checkbox desmarcado, aceite presente no corpo enviado quando marcado, e o checkbox nascendo desmarcado.
- [ ] **Task 5.7:** Rodar `npm test` no `front/` e no `api/` e corrigir regressões.

## Fase 6: Verificação em Navegador
- [ ] **Task 6.1:** Subir o `api/` em `localhost:3000` e o `front/` em `localhost:4200`.
- [ ] **Task 6.2:** Abrir `/politica-de-privacidade` e `/politica-de-cookies` e conferir que não resta nenhum `[TEXTO A SER REDIGIDO PELO JURÍDICO]`, nenhum `[e-mail …]`, `[nome …]` ou `[número]`, e que o aviso de pendência sumiu das duas.
- [ ] **Task 6.3:** Abrir `/termos-de-uso` e confirmar que ela continua pendente, com aviso e roteiro intactos.
- [ ] **Task 6.4:** Com consentimento já gravado sob `2026-09-10` no `localStorage`, recarregar o site e confirmar que o banner reabre (decisão 6); aceitar e conferir que o registro novo sai com `2026-09-13`.
- [ ] **Task 6.5:** Percorrer o onboarding com uma conta nova: submeter sem marcar o aceite e ver o bloqueio, marcar e concluir, e conferir a data e a versão no detalhe do aluno em `/admin`.
- [ ] **Task 6.6:** Entrar com uma conta que já concluiu o onboarding antes da spec, editar o perfil e confirmar que ela não é barrada por não ter aceite (decisão 9).
- [ ] **Task 6.7:** Conferir a hierarquia de cabeçalhos e a navegação por teclado das duas páginas redigidas, incluindo o checkbox do onboarding e seus links.
