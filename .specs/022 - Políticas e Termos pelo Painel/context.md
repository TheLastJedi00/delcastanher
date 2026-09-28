# Spec 022: Políticas e Termos pelo Painel

**Projeto:** Plataforma E-learning "Imersão RH Estratégico"
**Baseada em:** Spec 009 (SEO, Analytics e Conformidade), Spec 013 (Painel Administrativo com Dados Reais) e Spec 015 (Jurídico)
**Escopo técnico:** full-stack — `api/` (NestJS + Prisma) e `front/` (Angular standalone + signals + Tailwind). O backend é escrito com TDD: a suíte vem antes da implementação (`.claude/RULES.md`).
**Fonte do texto:** `libs/Politica_de_Privacidade_LGPD_Delcastanher.pdf`, o mesmo documento de 13/09/2026 que a Spec 015 publicou (`.specs/015 - Jurídico/notas-originais.md`). Os Termos de Uso **não** vêm em arquivo: a Lidiane cola o texto pelo painel.

> O `gateway_fix.md` desta pasta é um relatório de bug do checkout, independente desta spec.

## Objetivo
Três placeholders ainda estão no ar para o visitante:

1. **`/termos-de-uso`**, linkado no rodapé, no AVA e no aceite do onboarding, mostra `[TEXTO A SER REDIGIDO PELO JURÍDICO]` em cada seção, com um roteiro de tópicos e o aviso "Documento pendente de revisão jurídica". A Spec 015 (decisão 3) deixou a página assim de propósito, esperando o texto do advogado.
2. **A aba "Políticas & Termos" do `/admin`** é a maquete da Spec 001: um campo de texto que não salva e um botão desabilitado, com os avisos "Área em construção" e "Maquete" postos pela Spec 013.

3. **A hero de `/cursos/imersao-rh`** mostra, nos cartões de formato, `[CARGA HORÁRIA]` e `[DATA DE INÍCIO]` como selos de "a definir" (Spec 006). Os dois vêm de `core/mocks/courses.mock.ts`.

Esta spec faz a aba do painel funcionar **de verdade** e, por ela, tira os textos jurídicos do código. Os três documentos — Termos de Uso, Política de Privacidade e Política de Cookies — passam a morar no banco, com versões publicadas, e as páginas públicas leem de lá. Privacidade e Cookies entram já publicadas, com o texto que está no ar hoje. Os Termos de Uso são publicados pela Lidiane quando o texto do jurídico chegar, sem depender de deploy.

Na hero, os dois cartões passam a mostrar dado real: a carga horária vem do banco e é definida pelo painel, e o cartão de início diz a regra real de acesso do produto (decisões 12 a 14).

A ordem foi definida pelo usuário: **primeiro a aba do painel pronta como tela, depois o CRUD** que a liga ao banco.

## Escopo

- **Aba "Políticas & Termos" funcional:** lista dos três documentos com estado e versão, editor com pré-visualização, rascunho, publicação e histórico.
- **Documentos no banco**, com versões publicadas imutáveis e um rascunho por documento.
- **Páginas públicas lendo a versão publicada**, sem placeholder nenhum: o `LEGAL_PLACEHOLDER`, o roteiro de tópicos e o aviso de pendência saem do código.
- **Versão da política vinda do banco**, no lugar das constantes `CONSENT_POLICY_VERSION` (front) e `KNOWN_POLICY_VERSIONS` (API).
- **Carga inicial** da Privacidade e da Cookies com o texto atual.
- **Hero de `/cursos/imersao-rh` sem placeholder:** carga horária lida de `Course.workloadHours`, definida no painel, e cartão de início com a regra real de acesso.
- **Seção de depoimentos só com depoimento real**, por `@if`.
- **Fim das promessas falsas na página do curso:** encontros ao vivo, comunidade e turma (decisão 18).
- **Cache na CDN e rate limit no firewall** para as rotas públicas novas.

## Decisões técnicas desta spec

1. **O texto é guardado num formato de marcação mínimo, e nunca como HTML.**
   O editor aceita três construções, que são exatamente as que a casca `LegalPage` já renderiza (`LegalSection` com `p()` e `ul()`, Spec 015):
   ```
   ## 1. Título da seção
   Parágrafo, que pode ocupar várias linhas até uma linha em branco.

   - item de lista
   - outro item
   ```
   - Um parser puro (`parseLegalText`) transforma o texto em `LegalSection[]`, no front, e é o **mesmo** para a pré-visualização do painel e para a página pública: o que a Lidiane vê antes de publicar é o que o aluno vai ver.
   - Texto é sempre renderizado por interpolação, nunca por `innerHTML`. Um `<script>` colado do PDF aparece como texto, e não executa. É o que torna seguro deixar uma pessoa sem conhecimento técnico publicar num domínio com sessão.
   - Linha que não é título nem item vira parágrafo. Não há erro de sintaxe: o pior caso é um parágrafo onde se queria um título, e a pré-visualização mostra.
   - Negrito, links e tabelas ficam fora (ver "Fora de escopo"). O documento do jurídico não usa nada disso.

2. **Versão publicada é imutável; o que se edita é o rascunho.**
   ```
   LegalDocumentVersion  id, kind, content, policyVersion, changeKind,
                         publishedAt, publishedById, publishedByEmail
   LegalDocumentDraft    kind @id, content, updatedAt, updatedById, updatedByEmail
   ```
   - `kind` é o enum `TERMS | PRIVACY | COOKIES`.
   - O aluno aceitou **um texto**, numa data (Spec 015, decisão 8). Se a versão publicada pudesse ser editada, o `policyAcceptedVersion` gravado no `User` passaria a apontar para um texto diferente do que ele leu, e o registro de aceite deixaria de provar alguma coisa. Por isso não há `UPDATE` nem `DELETE` de versão publicada, por nenhuma rota.
   - O rascunho é um só por documento. Salvar sobrescreve, e publicar copia o rascunho para uma versão nova e o apaga.
   - Autor com e-mail copiado, pelo mesmo motivo do `GatewayFeeRate` (Spec 016) e da conexão do Mercado Pago (Spec 020): a autoria continua legível depois de a conta sair.

3. **A versão da política é uma só para os três documentos, e só sobe quando a publicação diz que muda o conteúdo.**
   Hoje uma constante, `2026-09-13`, versiona os três documentos juntos. O banner de cookies reabre quando ela muda, e o aceite do onboarding a grava (Spec 015, decisões 6 e 8). Isso continua: o aceite do onboarding cobre os três documentos de uma vez, então a versão é do conjunto.
   - Ao publicar, o admin escolhe o tipo da mudança:
     - **Nova versão:** a versão da política passa a ser a data da publicação (`AAAA-MM-DD`; uma segunda na mesma data vira `AAAA-MM-DD.2`). O banner reabre para todos, e quem aceitar a partir daí grava a versão nova.
     - **Correção:** para erro de digitação ou formatação. O texto novo vai ao ar e a versão da política **não** muda.
   - O `policyVersion` fica gravado em cada `LegalDocumentVersion`, e o vigente é o da última publicação. Assim, qualquer aceite antigo diz, pelo banco, quais textos estavam em vigor quando foi dado.
   - A confirmação da publicação diz o efeito com todas as letras: "Nova versão reabre o aviso de cookies para todos os visitantes". A escolha é da pessoa, e o sistema não tenta adivinhar se a mudança é relevante.
   - **Publicar os Termos de Uso pela primeira vez é sempre nova versão.** Quem aceitou antes aceitou sem Termos publicados.

4. **As páginas públicas continuam pré-renderizadas, e se atualizam no navegador.**
   O front é `outputMode: 'static'`: as páginas legais saem do build como HTML pronto (Spec 009, decisão 1). Com o texto no banco, o HTML do build fica velho na primeira publicação.
   - **No build**, a página busca a versão publicada na API e sai pré-renderizada com ela, como hoje. Se a API não responder no build, a página sai com o estado de carregamento, e o build **não** falha por isso.
   - **No navegador**, a página busca de novo e troca o conteúdo se a versão for outra. Publicar no painel aparece no site sem deploy, em até um minuto, que é o tempo de cache da CDN (decisão 16).
   - O HTML do build fica velho só para quem não executa JavaScript (robôs de busca), até o próximo deploy. É aceitável para página jurídica, e é o mesmo compromisso da Spec 009 para a vitrine.

5. **Sem versão publicada não há placeholder: há um aviso honesto e nada mais.**
   Enquanto os Termos de Uso não forem publicados, `/termos-de-uso` mostra só: "Os Termos de Uso estão em preparação e serão publicados nesta página", com o contato da controladora (`company-info.ts`). Sai o roteiro de tópicos, sai o marcador e sai o componente de "pendente".
   - A Spec 009 (decisão 11) proibia **texto jurídico plausível** no lugar do definitivo, e isso continua valendo. O roteiro de tópicos era um instrumento para quem fosse redigir. Com o texto sendo colado no painel, ele não tem mais leitor.
   - `LEGAL_PLACEHOLDER`, o campo `topics` de `LegalSection`, o input `pending` e o uso de `ui-placeholder-text` na casca saem do código. O `ui-placeholder-text` continua existindo para as outras telas que o usam (certificado, verificação, resumo do pedido).

6. **O aceite do onboarding lista só o que está publicado.**
   Hoje o checkbox linka os três documentos. Linkar Termos de Uso não publicados pede ao aluno que aceite um texto que não existe. O rótulo passa a ser montado a partir dos documentos publicados. Quando os Termos forem publicados (decisão 3, sempre nova versão), o próximo aluno já os aceita.
   - Quem aceitou antes da publicação dos Termos fica com a versão antiga gravada. **Não** é barrado nem obrigado a aceitar de novo: re-aceite obrigatório continua fora de escopo, como na Spec 015.

7. **A API valida a versão aceita contra o banco, e não contra uma lista fixa.**
   `KNOWN_POLICY_VERSIONS` (`api/src/users/policy-versions.ts`) sai. O `PATCH /users/me` aceita `policyVersion` se ela for a versão **vigente**. Se o admin publicar uma nova versão enquanto alguém está no onboarding, a conclusão recebe `409` com a versão nova, e o front recarrega o rótulo e pede o aceite de novo. Aceitar uma versão que já não está em vigor gravaria um aceite de texto que a pessoa não leu.

8. **O `ConsentService` passa a ler a versão da API, sem piscar o banner.**
   O `CONSENT_POLICY_VERSION` sai. A versão vigente vem de `GET /legal/policy-version`, que é público, pequeno e cacheável.
   - Enquanto a resposta não chega, vale o registro gravado no `localStorage`: quem já decidiu não vê o banner aparecer e sumir. Quando ela chega e difere do registro, o banner reabre, como hoje.
   - Se a API falhar, o registro gravado continua valendo, e quem nunca decidiu vê o banner normalmente. Falha de rede não pode virar "consentimento presumido", nem banner em loop.

9. **A Política de Cookies continua com os blocos interativos no componente.**
   O bloco "sua escolha atual" e o botão de rever preferências são código, e não texto (Spec 015, Task 3.6). O texto das seções vem do banco. Esses dois blocos continuam no componente, depois das seções.
   - A Política de Cookies **descreve o código** (Spec 015, decisão 3): o nome de cada cookie, a finalidade e o prazo. Editá-la pelo painel pode descolar o texto do comportamento real. O editor desse documento mostra um aviso fixo: "Este texto descreve os cookies que o código grava. Mudanças nos cookies exigem revisão técnica antes de publicar."

10. **A carga inicial reproduz o que está no ar, sem reescrever.**
    Uma migration de dados cria a primeira versão da Privacidade e da Cookies com `policyVersion = '2026-09-13'` e `changeKind = INITIAL`, com o texto de hoje convertido para o formato da decisão 1. Os Termos **não** ganham versão.
    - A conversão é feita **uma vez**, por script, a partir das `LegalSection` atuais dos `.ts`, e não à mão. O texto da Privacidade é verbatim do jurídico (Spec 015, decisão 1), e redigitar é o jeito de introduzir erro.
    - A razão social, o CNPJ e o contato que hoje vêm de `company-info.ts` entram como texto literal na versão. Mudar o contato passa a ser uma publicação (**correção**), e não uma linha de código.
    - O teste da migração compara, seção por seção, o `parseLegalText` do conteúdo carregado com as `LegalSection` que estavam no código: nenhuma palavra muda na troca.

11. **A aba do painel é construída primeiro, contra um serviço com contrato fechado.**
    Por definição do usuário, a tela vem antes do CRUD. A Fase 1 entrega a aba completa (lista, editor, pré-visualização, confirmação de publicação e histórico) sobre um `AdminLegalService` com a interface final, coberto por testes com o serviço simulado. A Fase 3 só troca o serviço simulado pelas rotas reais. Assim a tela não é refeita quando a API chegar.
    - A aba ganha `<h1>` no cabeçalho, fechando o card "[013/016] Nenhuma aba do /admin tem H1" **para esta aba**.
    - Os avisos "Área em construção" e "Maquete" saem só quando a Fase 3 ligar a tela ao banco. Até lá, a aba não salva nada, e dizer isso continua sendo verdade.

### Hero de `/cursos/imersao-rh`

A hero tem quatro cartões de formato (`course.format` no mock): "Formato", "Carga horária", "Início da turma" e "Certificado". Os dois do meio são placeholders.

12. **A carga horária é um número só, `Course.workloadHours`, e quem o define é a Lidiane, pelo painel.**
    A coluna já existe e está **nula** em produção (consulta de leitura em 2026-09-28). O schema diz por quê: inventar um número colocaria dado falso num diploma. O mesmo valor aparece em quatro lugares, e hoje os quatro mostram "a definir":
    - a hero e a pergunta "Quanto tempo por semana eu preciso dedicar?" do FAQ (mock, `PLACEHOLDER.workload`);
    - o certificado do aluno (`features/student/certificado/certificado.ts`);
    - a verificação pública do certificado (`certificado-verificar.ts`).

    Por isso a carga horária **não** é somada dos vídeos. Hoje são 12 aulas, 10 com vídeo processado, 51 minutos no total. Carga horária de curso inclui apostila, exercícios e plano de ação, e declarar "1 hora" num diploma de uma imersão de 12 módulos seria dado real e errado ao mesmo tempo. O número é decisão pedagógica e comercial.
    - O painel ganha um bloco **"Dados do curso"** na aba "Gestão de Aulas", ao lado dos preços por módulo (Spec 014), com o campo "Carga horária (horas)". Como **referência** para quem preenche, o bloco mostra a soma da duração dos vídeos processados.
    - Rota `PATCH /admin/courses/:id` com `workloadHours` inteiro entre 1 e 999, e `null` para voltar a "a definir".
    - **O certificado lê o valor do curso na hora, e não uma cópia** (`certificates.service.ts`). Definir a carga horária preenche também os certificados já emitidos, o que é o esperado: eles mostram "a definir" hoje. Já **mudar** um valor definido altera diplomas que alguém já baixou ou compartilhou. O campo pede confirmação quando já havia valor e diz isso ("Os certificados já emitidos passam a mostrar a nova carga horária"). Congelar a carga horária no certificado fica fora de escopo.

13. **A página do curso lê a carga horária da API, no build e no navegador.**
    `/cursos/:slug` é pré-renderizada a partir do mock (Spec 009). O cartão e a resposta do FAQ passam a vir de `GET /courses/:slug/summary` (público: `workloadHours` e `accessMonths`), pelo mesmo caminho da decisão 4 — o HTML do build sai com o valor do momento, e o navegador atualiza.
    - Enquanto `workloadHours` for nulo, o cartão **"Carga horária" não aparece**, em vez de mostrar selo de "a definir", e a pergunta do FAQ sobre tempo também sai. Na vitrine, dado ausente some; o selo de pendente é linguagem de quem está montando a página, e não de quem está comprando.
    - Os outros placeholders da mesma página (preço, garantia, escassez e depoimentos, mais abaixo) **não** são desta spec (ver "Fora de escopo").

14. **"Início da turma" não existe no produto: o cartão diz a regra real de acesso.**
    Não há turma nem data de início. Desde a Spec 014 a venda é por módulo, o acesso é liberado na confirmação do pagamento e vale 6 meses (decisões 1 e 5 daquela spec). O cartão vira **"Acesso: imediato, por 6 meses"**. Os 6 meses vêm de `ACCESS_MONTHS` (`api/src/payments/access.service.ts`), a constante que concede o acesso, devolvida como `accessMonths` pela mesma rota da decisão 13. Não são escritos à mão no front: o dia em que a validade mudar, a vitrine não pode continuar prometendo a antiga.
    - O cartão "Formato" também muda, pela decisão 18.

18. **A página não promete o que o produto não tem: sem encontros ao vivo, sem comunidade e sem turma.**
    Confirmado pelo usuário em 2026-09-28: **não há encontros ao vivo nem comunidade**. O produto é de aulas gravadas por módulo, com acesso de 6 meses, sem turma. A página de `/cursos/imersao-rh`, montada na Spec 006 antes de o produto existir, promete as três coisas em vários pontos. Vender o que não existe é propaganda enganosa (CDC, art. 37) e vira pedido de reembolso, então tudo isso sai junto com a hero.

    | Onde | Hoje | Passa a ser |
    |---|---|---|
    | Hero, cartão "Formato" | "Imersão online ao vivo" | "Aulas gravadas, no seu ritmo" |
    | Hero, cartão "Início da turma" | `[DATA DE INÍCIO]` | "Acesso: imediato, por N meses" (decisão 14) |
    | Bônus 2 | "Encontro de mentoria em grupo", sessão ao vivo | **sai** |
    | Bônus 3 | "Comunidade de alunos" | **sai** |
    | Cabeçalho dos bônus | "Bônus da turma" / "Disponível para quem entra nesta turma." | "Bônus" / "Incluído na compra." |
    | Garantia 2 | "Acesso ao material da turma" / "… durante o período da turma." | "Acesso ao material" / "O material de apoio e as aulas ficam disponíveis na área do aluno durante os N meses de acesso de cada módulo." |
    | Oferta, `priceNote` | "Condição válida para a turma atual." | **sai** |
    | FAQ "As aulas são ao vivo ou gravadas?" | "Os encontros são ao vivo e ficam gravados…" | "As aulas são gravadas e ficam na área do aluno para você assistir no seu ritmo, durante os N meses de acesso de cada módulo." |
    | FAQ "Quanto tempo por semana…" | "…carga horária total da turma… entre encontros ao vivo e atividades práticas." | "A carga horária total é de N horas, entre aulas, material de apoio e atividades práticas, no ritmo que você escolher." Some sem carga horária (decisão 13). |
    | Fechamento | "A próxima turma da … está aberta" / "Inscrições até `[TURMA ENCERRA EM]`" | "A … está com as inscrições abertas". A linha do prazo fica em `@if` e some enquanto o prazo for placeholder. |
    | `metaDescription` (SEO) | "Imersão online e ao vivo… Vagas limitadas por turma." | "Imersão online com Lidiane Delcastanher: processos, cultura e indicadores para transformar o RH em parceiro de resultado. Aulas gravadas, no seu ritmo." |

    - "N meses" vem de `accessMonths` (decisão 14), e não é escrito à mão.
    - **O bônus que sobra** ("Kit de templates do RH Estratégico") fica: as apostilas do curso existem (`.specs/020 - Recebimento na Conta do Vendedor/libs/Apostilas`). A linha "Valor: `[PREÇO]`" dele passa para `@if` e some enquanto o valor for placeholder, pela mesma regra da decisão 13. Com um bônus só, a grade dele deixa de ter três colunas.
    - O CTA "Garantir minha vaga" sugere vaga limitada, que não existe. Ele passa a "Quero começar agora".
    - **Fica como está:** o texto alternativo das fotos ("…conduzindo a imersão para uma turma") descreve a foto de uma palestra real, e não o produto. O "Turma fechada" de `plans.mock.ts` é do plano **in company**, que é outro produto.

15. **Sem depoimento real, a seção de depoimentos não existe.**
    Hoje `course.testimonials` tem três entradas com `[DEPOIMENTO EM VÍDEO]` no nome e na citação, e a seção `#depoimentos` renderiza três cartões de "a definir".
    - As três entradas saem do mock, e `testimonials` fica vazio.
    - A seção inteira, com cabeçalho e fundo, fica dentro de `@if (testimonials().length > 0)`. `testimonials` é um `computed()` que também descarta entrada cujo nome ou citação ainda seja placeholder (`isPlaceholder`), para que um depoimento incompleto nunca volte ao ar por engano.
    - `PLACEHOLDER.videoTestimonial` sai de `placeholders.ts`. Nenhum link aponta para `#depoimentos`, então nada quebra com a seção ausente.
    - Cadastrar depoimentos pelo painel fica fora de escopo. Quando houver depoimento, ele entra no mock e a seção volta sozinha.

### Rotas públicas: cache e rate limit

As rotas novas sem login — `GET /legal/documents/:kind`, `GET /legal/policy-version` e `GET /courses/:slug/summary` — são chamadas por toda visita às páginas públicas e pelo banner de cookies, que aparece em **todas** as páginas. A API roda como função na Vercel e lê o Neon. Sem proteção, cada visita é uma execução de função e uma consulta ao banco, e um robô em laço vira conta de Vercel e de Neon, além de carga no banco que atende o checkout.

16. **Cache na CDN da Vercel, curto, com resposta velha servida enquanto renova.**
    As três rotas respondem com:
    ```
    Cache-Control: public, max-age=60, s-maxage=60, stale-while-revalidate=600, stale-if-error=86400
    ```
    - **`s-maxage=60`** faz a CDN guardar a resposta. Com isso, qualquer volume de acessos vira no máximo **uma execução de função por minuto, por rota e por região**. É isso que corta o custo: requisição servida do cache não executa função nem consulta o banco.
    - **60 segundos** é o atraso aceitável entre publicar no painel e o site mostrar (decisão 4). Um cache mais longo exigiria purgar a CDN a cada publicação, e o curto dispensa isso.
    - **`stale-while-revalidate`** evita que o visitante espere a renovação, e **`stale-if-error`** mantém o site de pé com o último texto bom se a API ou o Neon caírem. Isso também cobre a decisão 8: o banner não entra em loop por falha da API.
    - Nenhuma dessas respostas depende de quem pede. Por isso a rota **não** lê cookie nem `Authorization`: uma resposta pública que variasse por usuário seria servida a outro pelo cache.
    - `404` (Termos não publicados, `slug` inexistente) também vai para o cache, com `s-maxage=60`. Um robô pedindo `/legal/documents/terms` em laço bate na CDN, e não no banco.
    - O cabeçalho é aplicado num lugar só, um decorator `@PublicCache()`, e não repetido em cada rota. É o mesmo `@Header` que `store/offer` já usa.
    - As rotas admin continuam com `Cache-Control: no-store`: rascunho não pode ficar em cache compartilhado.

17. **Rate limit no firewall da Vercel, antes da função, e não dentro da API.**
    - Uma regra de **rate limiting do Vercel Firewall** no projeto da API, para os caminhos `/legal/*` e `/courses/*`: **120 requisições por minuto por IP**, com resposta `429`. O firewall age **antes** da CDN e da função. A requisição bloqueada não executa nada e não é cobrada como execução.
    - Um visitante normal faz duas ou três chamadas por página. 120 por minuto não atrapalha nem uma rede corporativa atrás de um IP só (vários colaboradores de uma empresa cliente lendo a página do curso), e ainda corta um laço de robô.
    - **Por que não um `@nestjs/throttler` na API:** na Vercel cada instância da função tem a própria memória. Um contador em memória conta só o que caiu naquela instância, e um ataque distribuído entre instâncias passa por baixo dele. Um throttler distribuído exigiria Redis, um serviço e uma cobrança a mais para proteger rotas que o cache da decisão 16 já protege. O firewall conta na borda, para todas as instâncias.
    - A regra é configurada pelo painel, pelo CLI `vercel firewall` ou pelo MCP da Vercel, e registrada nesta spec com a data. **Conferir no plano da conta** quantas regras de rate limit ele permite.
    - As rotas públicas antigas (`/store/offer`, `/certificates/verify/:code`, o webhook e o callback do OAuth) **não** entram nesta regra: o webhook recebe rajadas legítimas do Mercado Pago. Revisá-las é trabalho à parte (ver "Fora de escopo").

## Modelo de dados

```
enum LegalDocumentKind  TERMS | PRIVACY | COOKIES
enum LegalChangeKind    INITIAL | NEW_VERSION | CORRECTION

LegalDocumentVersion    id, kind, content (text), policyVersion,
                        changeKind, publishedAt,
                        publishedById?, publishedByEmail?
                        índice (kind, publishedAt desc)

LegalDocumentDraft      kind @id, content (text),
                        updatedAt, updatedById, updatedByEmail
```

- `publishedById`/`publishedByEmail` são nulos só nas versões `INITIAL` da carga (decisão 10).
- Não há `onDelete` a pensar: nenhuma tabela aponta para versão publicada. O `User.policyAcceptedVersion` guarda a **versão da política**, e a relação com os textos é pela coluna `policyVersion`.

## Rotas

| Método | Rota | Quem | O que faz |
|---|---|---|---|
| `GET` | `/legal/documents/:kind` | público | versão publicada vigente (`content`, `publishedAt`, `policyVersion`) ou `404` |
| `GET` | `/legal/policy-version` | público | `{ version }` vigente (decisão 8) |
| `GET` | `/admin/legal/documents` | admin | os três: vigente, rascunho (se houver) e autor |
| `PUT` | `/admin/legal/documents/:kind/draft` | admin | salva o rascunho |
| `DELETE` | `/admin/legal/documents/:kind/draft` | admin | descarta o rascunho |
| `POST` | `/admin/legal/documents/:kind/publish` | admin | `{ changeKind: NEW_VERSION \| CORRECTION }`; publica o rascunho |
| `GET` | `/admin/legal/documents/:kind/versions` | admin | histórico, mais recente primeiro |
| `PATCH` | `/users/me` | aluno | `policyVersion` validada contra a vigente (decisão 7) |
| `GET` | `/courses/:slug/summary` | público | `{ workloadHours, accessMonths }` (decisões 13 e 14) |
| `GET` | `/admin/courses/:id` | admin | `workloadHours` e soma da duração dos vídeos processados (decisão 12) |
| `PATCH` | `/admin/courses/:id` | admin | `{ workloadHours: 1..999 \| null }` (decisão 12) |

- Publicar sem rascunho, ou com rascunho vazio, dá `400`. Os Termos na primeira publicação ignoram `CORRECTION` e publicam como `NEW_VERSION` (decisão 3).
- A publicação roda numa transação: lê o rascunho, calcula a versão (com o sufixo da mesma data, travando a leitura da última versão), grava a versão e apaga o rascunho. Duas publicações simultâneas não geram a mesma `policyVersion`.
- `kind` na URL em minúsculas (`terms`, `privacy`, `cookies`), validado por `ParseEnumPipe` ou equivalente.

## A aba "Políticas & Termos" (`/admin`)

- **Lista:** um cartão por documento, com nome, estado ("Publicado — versão 2026-09-13, em 13/09/2026 por fulano", "Não publicado" ou "Rascunho não publicado") e o botão "Editar".
- **Editor:** texto em fonte monoespaçada (o `ui-input` `multiline` + `mono` que já está na aba), um guia curto do formato da decisão 1 e a pré-visualização ao lado (abaixo, no celular), renderizada pela mesma `LegalPage`.
  - Abrir o editor carrega o rascunho ou, sem rascunho, o texto publicado.
  - Botões "Salvar rascunho", "Descartar rascunho" e "Publicar".
  - Sair com alteração não salva pede confirmação.
- **Publicar:** diálogo com a escolha "Nova versão" ou "Correção", o efeito de cada uma (decisão 3) e o nome do documento. Nos Termos, na primeira publicação, só "Nova versão".
- **Histórico:** lista das versões com data, tipo, autor e versão da política, e cada uma abre em leitura.
- **Aviso fixo** no editor da Política de Cookies (decisão 9).

## Integração com o existente

- **`api/prisma/`:** enums, os dois models e a migration com a carga inicial (decisão 10).
- **`api/src/legal/`** (módulo novo): `LegalDocumentsService` (vigente, versão da política, rascunho, publicação com trava) e dois controllers — o público e o admin, com `FirebaseAuthGuard`, `RolesGuard` e `@Roles('admin')` na classe.
- **`api/src/users/`:** `update-user.dto.ts` e `users.service.ts` validam `policyVersion` pelo `LegalDocumentsService`. `policy-versions.ts` sai.
- **`front/src/app/features/legal/`:**
  - `parse-legal-text.ts` (novo);
  - `legal-page.ts` sem modo pendente, com o estado "em preparação" da decisão 5;
  - as três páginas passam a buscar o texto pelo `LegalDocumentsService` (novo, `core/services/`);
  - `termos-de-uso.ts` perde o roteiro;
  - `company-info.ts` continua, só para o aviso da decisão 5.
- **`front/src/app/core/services/consent.service.ts`:** versão da API (decisão 8).
- **`front/src/app/features/onboarding/onboarding.ts`:** rótulo do aceite pelos documentos publicados e versão vigente (decisões 6 e 7).
- **`front/src/app/features/admin/`:** a aba sai de `admin-dashboard.html` para um componente próprio (`admin-politicas`), como o `admin-financeiro` e o `admin-pacote`, com o `AdminLegalService` (novo). Na aba "Gestão de Aulas", o bloco "Dados do curso" (decisão 12).
- **`api/src/courses/`** (ou o módulo que já serve cursos): `GET /courses/:slug/summary` público e `GET`/`PATCH /admin/courses/:id`, com `accessMonths` lido de `ACCESS_MONTHS`.
- **`front/src/app/features/course-detail/`** e **`core/mocks/courses.mock.ts`:** a hero e o FAQ leem o resumo do curso (decisão 13); o cartão de início muda (decisão 14); `PLACEHOLDER.workload` e `PLACEHOLDER.startDate` saem de `placeholders.ts`.
- **`api/src/common/`** (ou onde já houver utilitários de HTTP): o decorator `@PublicCache()` (decisão 16).
- **Vercel Firewall** do projeto `delcastanher-api`: a regra de rate limit (decisão 17).
- **Certificado e verificação** (`certificado.ts`, `certificado-verificar.ts`): nenhuma mudança de código. Passam a mostrar a carga horária assim que ela for definida.

## Testes

### Backend (TDD)
- **Vigente:** devolve a última versão de cada documento; `404` para Termos sem publicação; versão da política é a da última publicação de qualquer documento.
- **Rascunho:** só admin (`401` sem token, `403` com aluno); salvar sobrescreve; descartar apaga.
- **Publicação:** `NEW_VERSION` gera a data do dia e `.2` na segunda do mesmo dia; `CORRECTION` repete a versão vigente; primeira dos Termos é sempre `NEW_VERSION`; sem rascunho dá `400`; o rascunho é apagado; duas publicações simultâneas não repetem a versão; nenhuma rota altera ou apaga versão publicada.
- **Aceite:** `PATCH /users/me` com a versão vigente grava; com uma versão antiga dá `409` e a vigente; sem publicação nenhuma não quebra quem já concluiu o onboarding.
- **Carga inicial:** o conteúdo carregado, passado pelo parser, é igual às `LegalSection` do código (decisão 10).
- **Curso:** o resumo público devolve `workloadHours` nulo ou definido e `accessMonths = ACCESS_MONTHS`, e `slug` inexistente dá `404`; o `PATCH` admin aceita 1 a 999 e `null`, recusa 0, negativo, fração e texto, dá `401` sem token e `403` com aluno; o `GET` admin soma só aulas com `durationSeconds`.

### Front
- `parseLegalText`: títulos, parágrafos em várias linhas, listas, linhas em branco repetidas, texto sem título, e HTML tratado como texto.
- `LegalPage`: renderiza as seções do parser; sem conteúdo, mostra o "em preparação" com o contato; nenhum `[TEXTO A SER REDIGIDO…]` em página nenhuma.
- Aba do admin: estados de cada cartão; editor com pré-visualização ao vivo; salvar, descartar e publicar chamando o serviço; o diálogo de publicação com as duas opções e só "Nova versão" nos Termos inéditos; histórico; aviso da Cookies; confirmação ao sair com alteração.
- `ConsentService`: sem piscar o banner enquanto a versão não chega; reabre quando ela difere; mantém o registro se a API falhar.
- Onboarding: rótulo sem Termos quando não publicados; `409` recarrega e pede o aceite de novo.
- Hero do curso: com `workloadHours` nulo, sem cartão de carga horária e sem a pergunta do FAQ; com valor, "N horas" nos dois; cartão de acesso com `accessMonths`; nenhum `ui-placeholder-text` pendente na hero.
- Bloco "Dados do curso": mostra a soma dos vídeos como referência, salva e pede confirmação ao mudar um valor já definido.
- Depoimentos: sem entradas, a seção `#depoimentos` não existe no DOM; com uma entrada placeholder, também não; com uma real, aparece.
- Textos da decisão 18: nenhuma ocorrência de "ao vivo", "comunidade", "mentoria em grupo" ou "turma" no DOM de `/cursos/imersao-rh`, fora do texto alternativo das fotos; a linha de prazo do fechamento e o "Valor" do bônus somem enquanto forem placeholder.

### Cache e rate limit
- Backend: as três rotas públicas respondem com o `Cache-Control` da decisão 16, inclusive no `404`; as rotas admin respondem `no-store`; a resposta pública é a mesma com e sem `Authorization`.
- Em produção: `curl -I` duas vezes seguidas na mesma rota mostra `x-vercel-cache: HIT` na segunda; um laço acima de 120 requisições por minuto recebe `429` do firewall.

### Em navegador
- Publicar os Termos pelo painel e ver `/termos-de-uso` mudar sem deploy; o banner reabre; o onboarding passa a listar os Termos.
- Publicar uma correção na Privacidade e ver o texto mudar **sem** o banner reabrir.

## Fora de escopo
- **Redigir os Termos de Uso.** O texto é do jurídico e entra pelo painel (decisão 5, Spec 009, decisão 11).
- Negrito, links, tabelas e imagens no texto dos documentos (decisão 1).
- Re-aceite obrigatório quando a versão muda e aviso por e-mail de nova versão (decisões 3 e 6).
- Página pública de versões anteriores; o histórico fica só no painel.
- Aprovação em duas etapas (quem escreve e quem publica).
- Deploy automático a cada publicação para atualizar o HTML pré-renderizado (decisão 4).
- Links de LinkedIn e Instagram do rodapé, que seguem com `href="#"`.
- Os outros placeholders de `/cursos/imersao-rh`, fora da hero: preço cheio e parcelas da oferta, link de checkout, prazo de garantia e o banner de escassez (prazo e vagas). Os depoimentos (decisão 15), o prazo do fechamento e o valor do bônus (decisão 18) **entram**, e somem por `@if`.
- Reescrever a proposta de valor da página além do que a decisão 18 lista.
- Congelar a carga horária no certificado emitido (decisão 12).
- Cadastro de depoimentos pelo painel (decisão 15).
- Purga da CDN a cada publicação; o cache curto a dispensa (decisão 16).
- Rate limit e cache das rotas públicas que já existiam (`/store/offer`, `/certificates/verify/:code`, webhook e callback do OAuth) e throttler distribuído com Redis (decisão 17).
- Assinatura da coordenação no certificado (`[ASSINATURA DA COORDENAÇÃO]`), que depende da imagem da rubrica.
- Caixa `privacidade@` no domínio próprio. Quando existir, a troca é uma publicação de **correção** na Privacidade e na Cookies.
