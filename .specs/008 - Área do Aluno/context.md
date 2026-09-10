# Spec 008: Engajamento e Emissão de Certificados (Área do Aluno)

**Projeto:** Plataforma E-learning "Imersão RH Estratégico"
**Baseada em:** Spec 001 (MVP/AVA), Spec 002 (Design System), Spec 004 (Autenticação) e Spec 005 (CRUD de Usuários)
**Escopo técnico:** full-stack — `api/` (NestJS + Prisma) e `front/` (Angular standalone + signals + Tailwind). O backend é escrito com TDD: a suíte de testes vem antes da implementação (`.claude/RULES.md`).

## Objetivo
Aprimorar o Ambiente Virtual do Aluno para suportar retenção, clareza de progresso e validação de conclusão: o aluno enxerga onde parou e retoma em um clique, conclui o curso e recebe um diploma digital cuja autenticidade um terceiro consegue conferir sozinho.

## Escopo

- **Progresso persistido por aluno:** o avanço na trilha deixa de ser estado de tela e passa a viver no banco, por usuário.
- **Dashboard do Aluno aprimorado:** o Hub de `/ava` passa a destacar o fluxo **"Meu curso → Meu progresso → Próxima aula"**, com retomada direta do módulo em aberto.
- **Geração de certificado:** interface do diploma digital com Nome, Curso, Carga Horária, Data, Assinatura e Hash de validação, emitido pelo backend quando o curso é concluído.
- **Portal de validação pública:** rota pública `/certificado/verificar` onde empresas e recrutadores informam o código do certificado e recebem um dos três estados: **Válido**, **Inválido** ou **Não Encontrado**.

## Decisões técnicas desta spec

1. **"Dashboard do Aluno" é o Hub que já existe, não uma tela nova.**
   A porta de entrada do AVA é `features/student/hub/hub.ts` na rota `/ava`. Esta spec evolui esse componente em vez de criar um `DashboardComponent` concorrente — duas telas iniciais disputando o mesmo papel seria dívida no primeiro dia. Vale também a convenção de nomes do projeto: classes sem sufixo `Component` (`Hub`, `Trilha`, `Checkout`) e arquivos em kebab-case.

2. **Progresso passa a ser dado, não estado de componente.**
   Hoje `features/student/trilha/trilha.ts` carrega 12 módulos hardcoded e um `activeModuleId = 3` fixo, igual para todos os alunos e perdido a cada F5. Sem progresso persistido não existe "retomar de onde parou" nem critério de conclusão para emitir certificado. Os módulos passam a existir como dado (seed) para poderem ser referenciados por id, e o avanço de cada aluno vira registro no banco.

3. **O vocabulário é "módulo".**
   O produto fala em "aula" no texto de marketing, mas a trilha, o `ui-module-card` e o mock trabalham com 12 **módulos**. O código e os models usam `module`; o rótulo "Próxima aula" pode permanecer na UI, apontando para o próximo módulo não concluído. Não se cria um nível "aula" dentro de módulo nesta spec.

4. **Retomada por deep-link.**
   `/ava/trilha` não aceita parâmetro hoje, então o botão "Retomar" só conseguiria levar ao topo genérico da trilha. A rota ganha a forma `/ava/trilha/:moduleId`, com `/ava/trilha` continuando válida (abre o módulo em aberto do aluno). Id inexistente cai no primeiro módulo, sem tela quebrada.

5. **Conclusão = 100% dos módulos concluídos, em um curso único.**
   Não existe matrícula, entitlement ou catálogo real de cursos no código (Spec 007, decisão 2) e esta spec **não** cria esse modelo. O progresso e o certificado pertencem ao curso único da plataforma ("Imersão RH Estratégico"), identificado por uma constante/seed. Quando o modelo de matrícula existir, o vínculo passa a ser por curso sem reescrever a tabela.

6. **Hash e código de validação nascem no backend.**
   O front nunca gera o hash: um certificado cujo identificador é fabricado no cliente não valida nada. A emissão grava `code` (curto, legível, o que a pessoa digita no portal) e `hash` (derivado dos dados do certificado + segredo do servidor, o que garante que o conteúdo não foi adulterado). O front apenas exibe.

7. **A rota de verificação é pública e fica fora do `FirebaseAuthGuard`.**
   Todos os controllers de hoje são guardados por padrão; a verificação precisa ser a exceção explícita — um recrutador não tem conta. Ela devolve apenas o que o diploma já mostra (nome, curso, carga horária, data de emissão, status) e **nunca** e-mail, CPF, telefone ou id interno.

8. **"Inválido" só é alcançável se o certificado puder ser revogado.**
   Com apenas emissão, todo código ou existe (Válido) ou não existe (Não Encontrado) — o terceiro estado do `context` original seria decorativo. O model recebe status (`ACTIVE` / `REVOKED`) com `revokedAt`: **Não Encontrado** = código inexistente; **Inválido** = certificado existente porém revogado ou com hash divergente dos dados atuais.

9. **Download por impressão nativa, sem dependência nova.**
   O certificado é uma página com layout dedicado de `@media print` e um botão que chama `window.print()`; "salvar como PDF" é o próprio navegador. Nenhuma lib de PDF entra no bundle (mesma linha da Spec 007, que evitou dependência nova de máscara).

10. **Carga horária e assinatura são conteúdo do curso, não do aluno — e ambas seguem pendentes.**
    A carga horária vem do curso, onde é nula: no comercial ela ainda é o placeholder `[CARGA HORÁRIA]` da Spec 006, e inventar um número o colocaria dentro de um diploma. A assinatura é a rubrica de uma pessoa real que ainda não foi enviada; desenhar uma "provisória" seria falsificar assinatura em documento. As duas aparecem no diploma com o tratamento visual de pendente (`ui-placeholder-text`), como no resto do funil. Quando a rubrica chegar, ela entra como imagem estática em `public/` com `NgOptimizedImage` — nunca base64 inline, que o `NgOptimizedImage` não suporta. Assinatura digital com validade jurídica (ICP-Brasil) não faz parte desta spec.

11. **Certificado revogado não é reemitido.**
    A emissão é idempotente (chamar de novo devolve o mesmo diploma, porque um código novo invalidaria o que o aluno já mandou para um recrutador), mas um certificado revogado responde 409 com orientação de procurar o suporte: revogar é ato deliberado, e reemitir sob demanda desfaria a revogação.

## Integração com o existente
O Hub (`/ava`) e a Trilha (`/ava/trilha`) já existem desde a Spec 001 e ficam atrás de `authGuard` + `onboardingGuard` (Spec 004); a spec evolui essas telas em vez de duplicá-las. O perfil vindo de `GET /users/me` (`UserService`) é a fonte do nome exibido no diploma — o certificado não guarda uma cópia do nome digitada em outro lugar. O portal `/certificado/verificar` entra em `app.routes.ts` como rota pública, irmã de `/planos` e `/checkout/:productSlug`, fora dos guards. No backend, os novos módulos seguem a estrutura de `users/` (controller + service + dto + types, `PrismaService` injetado).

## Fora de escopo
- Matrícula, entitlement, catálogo com múltiplos cursos ou conteúdo bloqueado por compra.
- Qualquer integração financeira ou vínculo do certificado com pagamento aprovado.
- Emissão automática de certificado por e-mail, notificações ou fila de envio.
- Assinatura digital com validade jurídica (ICP-Brasil), QR Code assinado ou blockchain.
- Player de vídeo real, upload de aulas e marcação automática de conclusão por tempo assistido (a conclusão continua sendo ação explícita do aluno).
- Painel administrativo de certificados emitidos/revogados (a revogação existe no model, mas sem UI nesta spec).
