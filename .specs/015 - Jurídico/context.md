# Spec 015: Jurídico — Publicação da Política de Privacidade e da Política de Cookies

**Projeto:** Plataforma E-learning "Imersão RH Estratégico"
**Baseada em:** Spec 009 (SEO, Analytics e Conformidade), Spec 013 (Painel Administrativo) e Spec 014 (Checkout com Mercado Pago)
**Escopo técnico:** majoritariamente `front/` (Angular standalone + signals + Tailwind), com uma incursão pequena e bem delimitada no `api/` (NestJS + Prisma) para registrar o aceite. O backend é escrito com TDD: a suíte vem antes da implementação (`.claude/RULES.md`).
**Fonte do texto:** documento entregue pelo jurídico em 13/09/2026, reproduzido sem alteração em `notas-originais.md`.

## Objetivo

A Spec 009 montou o esqueleto jurídico da plataforma — três rotas públicas, a casca `LegalPage`, os links no rodapé e no AVA, o banner de consentimento e o `ConsentService` — e deliberadamente **não** escreveu o texto: cada cláusula ficou como título, lista de tópicos a cobrir e o marcador `[TEXTO A SER REDIGIDO PELO JURÍDICO]`, sob um aviso de que nada ali estava em vigor. A decisão 11 daquela spec foi explícita: texto jurídico plausível e indistinguível do definitivo é pior que texto ausente, porque alguém publica achando que passou por advogado.

O texto chegou. Esta spec troca o placeholder pelo documento real na **Política de Privacidade**, redige a **Política de Cookies** — que é descritiva do que o código faz, não contratual —, remove o aviso de pendência dessas duas páginas e passa a registrar, no primeiro passo autenticado do aluno, o aceite com data e versão. Os **Termos de Uso** continuam como estão, com o aviso intacto, porque ainda não existe texto de advogado para eles.

É a spec que faz a plataforma parar de dizer "não leia isto como termo em vigor" nas duas páginas que a LGPD efetivamente cobra.

## Escopo

- **Política de Privacidade publicada verbatim:** as 14 seções e a declaração de ciência do documento recebido, sem uma vírgula alterada.
- **Complemento operacional:** uma seção final, claramente identificada como da plataforma e não do jurídico, cobrindo o que o documento genérico não alcança (cartão via Mercado Pago, banner de cookies, 6 meses de acesso, certificado retido).
- **Política de Cookies redigida:** texto descritivo do que o `ConsentService` de fato faz, com a tabela dos cookies usados.
- **Casca `LegalPage` com dois modos:** corpo redigido e corpo pendente — o aviso de revisão jurídica passa a ser por página.
- **Canal de LGPD preenchido:** as lacunas da seção 10 do documento resolvidas com o contato da seção 14.
- **Versão da política elevada:** `CONSENT_POLICY_VERSION` sobe para a data do documento, reabrindo o consentimento de cookies.
- **Aceite registrado no onboarding:** checkbox obrigatório, persistido no `User` com data e versão aceita.
- **Visibilidade do aceite no `/admin`:** a data e a versão aparecem no detalhe do aluno, para o suporte.

## Decisões técnicas desta spec

1. **O texto do advogado entra literal; o que é nosso entra separado e identificado.**
   As 14 seções do documento são publicadas exatamente como recebidas, incluindo a numeração, os títulos em caixa alta convertidos para a tipografia do Design System e a "Declaração de Ciência" final. Encaixá-las nas 10 seções que a Spec 009 desenhou daria uma página mais bem organizada — e significaria a plataforma editando texto jurídico revisado, que é precisamente o que a decisão 11 daquela spec quis impedir. A estrutura antiga era um **roteiro para quem fosse redigir**, e cumpriu esse papel: agora que o texto existe, ele manda.

   O que a plataforma precisa dizer e o documento não diz vira a seção **"15. Informações específicas desta plataforma"**, aberta por uma linha que declara sua origem: complemento operacional da Delcastanher, não parte do documento revisado. O leitor consegue saber, olhando a página, o que passou por advogado e o que não passou — e uma futura revisão jurídica sabe exatamente o que precisa absorver.

2. **O complemento existe porque a Spec 014 fez promessas que o documento genérico não cobre.**
   Três fatos estão no código e não no texto recebido: dado de cartão **nunca** toca a Delcastanher (os campos são iframes do Mercado Pago — Spec 014, decisão 8), cookie de medição só carrega **depois** do consentimento (Spec 009, decisão 5) e o certificado emitido continua guardado **depois** de o acesso de 6 meses expirar, para permitir validação por terceiros (Spec 014, decisão 18). Publicar só o documento deixaria a página em conformidade formal e em dívida com o que a plataforma anda dizendo em outras telas. A seção 15 é onde essa dívida é paga, com o `[e-mail]` de contato do próprio documento como canal.

3. **A Política de Cookies é redigida aqui, e isso não contradiz a Spec 009.**
   O que a decisão 11 da Spec 009 protegia era **cláusula contratual** — obrigação, prazo, reembolso, foro —, que depende de advogado. A Política de Cookies não é disso: ela descreve quais cookies o site grava, com que finalidade e por quanto tempo, e essa resposta está no `ConsentService` e na Spec 009, não em jurisprudência. Descrever o próprio comportamento do sistema é trabalho de quem escreveu o sistema. Por isso ela sai do placeholder junto com a privacidade, e os **Termos de Uso não saem**: lá há arrependimento, reembolso e foro, e inventar isso seria exatamente o erro que a Spec 009 antecipou.

4. **O aviso de pendência vira propriedade da página, não da casca.**
   Hoje o bloco "Documento pendente de revisão jurídica" é fixo no `legal-page.ts` e aparece nas três rotas. Com duas páginas redigidas e uma não, ele passa a ser um input (`pending`), e a casca ganha um segundo modo de corpo: em vez de `ui-placeholder-text` + "a cláusula deve cobrir", ela renderiza os parágrafos reais. As duas formas convivem no mesmo componente porque a página pendente continua existindo e continua precisando do roteiro — apagar o modo antigo deixaria os Termos de Uso sem nada para mostrar.

5. **As lacunas da seção 10 são preenchidas com o contato da seção 14, e a fragilidade fica registrada.**
   O documento chegou com `[e-mail para assuntos de privacidade/LGPD]`, `[nome, se aplicável]` e `[número]` não preenchidos na seção 10, mas com contato real na seção 14. Publicar a lacuna visível seria pior que repetir o contato: a LGPD exige canal de atendimento ao titular, e um marcador no lugar dele é ausência de canal. Então a seção 10 recebe `lidiane_delcastanher@hotmail.com` e `47-992908953`, e o campo de Encarregado é **omitido** em vez de inventado — indicar encarregado é ato da controladora (Art. 41), não escolha de implementação.

   Fica registrado que um e-mail pessoal de provedor gratuito como canal oficial de LGPD é frágil: ele não sobrevive à troca de pessoa, não tem caixa compartilhada e mistura assunto de titular com correspondência particular. Trocar por `privacidade@` no domínio próprio é uma linha de constante quando a caixa existir — por isso o contato mora em **um único módulo de constantes**, e não repetido nas duas seções da página.

6. **A versão da política sobe para `2026-09-13`, e o banner de cookies reabre para todo mundo.**
   `CONSENT_POLICY_VERSION` está em `2026-09-10`, data em que as páginas eram placeholder. O documento diz "última atualização 13/09/2026", e o `ConsentService` já invalida, por desenho, todo consentimento gravado sob versão anterior (`parsed.policyVersion !== CONSENT_POLICY_VERSION`). Trocar placeholder por política real é a mudança relevante que esse mecanismo existe para capturar: quem aceitou cookies olhando uma página que dizia "nada aqui está em vigor" não aceitou esta política. O banner reaparecer para a base inteira é o comportamento correto, não um efeito colateral a mitigar.

7. **O aceite é gravado no onboarding, porque é o primeiro momento em que existe usuário para gravá-lo.**
   O caminho natural seria o cadastro — mas o "cadastro" da plataforma é um modal que recebe um e-mail e pede ao Firebase o link de definição de senha: não há sessão, não há `User` no banco, não há onde persistir. O primeiro passo autenticado é o onboarding, que já preenche o perfil com `PATCH /users/me` e já é obrigatório para todos pelo `onboardingGuard` — inclusive para quem existia no Firebase antes do banco. O checkbox entra ali, no mesmo formulário e na mesma requisição que o resto do perfil: um aceite que viajasse em requisição própria poderia falhar sozinho e deixar perfil completo sem aceite.

8. **O aceite é coluna do `User`, não tabela de histórico.**
   Entram `policyAcceptedAt DateTime?` e `policyAcceptedVersion String?`. A pergunta que o suporte e a própria LGPD fazem é "este titular aceitou, quando, e qual versão" — uma linha por usuário responde. Uma tabela de histórico de aceites responderia "quantas vezes aceitou ao longo do tempo", pergunta que ninguém faz hoje e que nenhuma tela desta plataforma consome. Nulo significa **conta anterior a esta spec**, não recusa: a migration não inventa aceite retroativo para quem nunca viu o checkbox.

9. **O checkbox é obrigatório no cliente e validado no servidor.**
   O controle é `Validators.requiredTrue` e o botão fica desabilitado sem ele, no padrão dos demais campos do onboarding. Mas o `PATCH /users/me` também recusa concluir onboarding sem aceite — teto de UI que o servidor não valida não é teto, e é a mesma regra que a Spec 014 (decisão 9) aplicou ao limite de parcelas. Quem já concluiu o onboarding antes desta spec **não é barrado**: a validação incide sobre a conclusão, não sobre toda atualização de perfil, senão o aluno legado ficaria preso ao editar o próprio telefone.

10. **O aceite não é marcado por padrão e não fica escondido em texto corrido.**
    O checkbox nasce desmarcado, com os três documentos linkados abrindo em nova aba — a leitura não pode custar o formulário já preenchido. Caixa pré-marcada não é consentimento livre e inequívoco, e essa é a crítica mais comum a aceite de política; a plataforma não vai nascer com ela.

11. **A data de aceite aparece no `/admin`, junto dos acessos e pedidos.**
    O detalhe do aluno já reúne o que o suporte precisa (Spec 013, e Spec 014 decisão 23). O aceite entra no mesmo bloco, como linha de leitura: "aceitou a versão 2026-09-13 em 18/09/2026" ou "sem aceite registrado". É informação de atendimento — não há ação de administrador sobre ela, e nenhuma rota para alterá-la: aceite que o administrador edita não é prova de nada.

## Modelo de dados

Duas colunas novas em `User`, ambas opcionais:

| Coluna | Tipo | Significado |
|---|---|---|
| `policyAcceptedAt` | `DateTime?` | Instante do aceite. Nulo = conta anterior à spec, nunca recusa. |
| `policyAcceptedVersion` | `String?` | Versão vigente no momento do aceite (ex.: `2026-09-13`). |

Guardar a versão junto da data é o que dá sentido ao registro: sem ela, "aceitou em 18/09" não diz **o que** foi aceito, e a próxima revisão do documento tornaria todo aceite anterior ilegível. É a mesma razão pela qual o `ConsentRecord` do `ConsentService` já carrega `policyVersion` no `localStorage`.

## Conteúdo das páginas

**Política de Privacidade** — seções 1 a 14 do documento recebido, verbatim, mais a Declaração de Ciência e a seção 15 de complemento da plataforma (decisões 1 e 2). A seção 10 sai com o contato da decisão 5.

**Política de Cookies** — seis seções já desenhadas na Spec 009, agora redigidas a partir do comportamento real: o que são cookies, os necessários (sessão do Firebase e o próprio registro de consentimento, que não dependem de aceite), os de medição de audiência (carregados só após consentimento), como gerenciar a escolha (o botão que já existe na página e o item "Preferências de cookies" do rodapé), o prazo de validade do consentimento e o contato. O controle de revogação que já vive na página continua onde está.

**Termos de Uso** — inalterada. Mantém os 10 títulos, os tópicos e o aviso de pendência.

## Integração com o existente

No `front/`, o `legal-page.ts` ganha o modo de corpo redigido e o input `pending`; `politica-de-privacidade.ts` e `politica-de-cookies.ts` passam a fornecer texto em vez de tópicos; `termos-de-uso.ts` não muda. Entra um módulo de constantes com os dados da controladora (razão social, CNPJ, e-mail, telefone), consumido pelas páginas — CNPJ e contato repetidos em dois arquivos divergem na primeira atualização. `CONSENT_POLICY_VERSION` sobe, e nada mais no `ConsentService` muda: o mecanismo de invalidação por versão já estava pronto para este dia. O `onboarding.ts` ganha o checkbox no `FormGroup` existente, e o `UserService` carrega os dois campos novos.

No `api/`, o `UsersModule` recebe a validação no `PATCH /users/me` e os dois campos no `GET /users/me` e no `GET /admin/users/:id`. Nenhum módulo novo, nenhum guard novo, nenhuma rota nova.

## Fora de escopo

- **Texto dos Termos de Uso** — depende de advogado (decisão 3); a página segue com o aviso de pendência.
- **Indicação formal de Encarregado/DPO** (Art. 41 da LGPD) — ato da controladora, não implementação (decisão 5).
- **Caixa de e-mail própria para privacidade** (`privacidade@` no domínio) — registrada como dívida na decisão 5.
- **Histórico de aceites** e re-aceite obrigatório quando a política mudar: a versão é gravada, mas ninguém é barrado por ter aceitado versão antiga (decisão 8).
- **Fluxo de exercício de direitos do titular** (acesso, correção, portabilidade, eliminação) pela plataforma — o canal desta spec é o e-mail do documento; automatizar é spec própria, e a Spec 013 (decisão 9) já registrou que exclusão de conta não existe.
- **Versionamento e arquivo público de versões anteriores** da política.
- **Aceite no checkout** — a Spec 014 já exige onboarding concluído para comprar (decisão 21), então quem paga já aceitou.
- Tradução das páginas, registro do documento em cartório e selo de conformidade.
