# Spec 029: Ambiente de Preview

**Projeto:** Plataforma E-learning "Imersão RH Estratégico"
**Baseada em:** Spec 017 (Domínio Próprio), Spec 020 (Recebimento na Conta do Vendedor) e o registro da fase 1 da Spec 028
**Escopo técnico:** infraestrutura — projetos `delcastanher` (front) e `delcastanher-api` na Vercel, Neon, Registro.br, Firebase e Mercado Pago sandbox. Pouco ou nenhum código: `api/vercel.json` (build) e, se preciso, `front/scripts/apply-env.mjs`.

## Objetivo
Ter um ambiente de preview completo e isolado de produção: o front em `https://preview.delcastanher.srv.br` falando com a API em `https://api-preview.delcastanher.srv.br`, com banco próprio e Mercado Pago em sandbox. É nele que as próximas specs testam ao vivo, inclusive pagamento com cartão, sem gravar pedido de teste no financeiro de produção e sem precisar subir a API local, como na Spec 028.

## Situação atual (lida em 22/10/2026, só leitura)

| Item | Hoje |
|---|---|
| Domínio do front | `preview.delcastanher.srv.br` já configurado pelo usuário no projeto `delcastanher`, verificado, ligado à branch `preview` do Git (CNAME para `vercel-dns-017.com`) |
| `API_URL` do front em Preview | `https://api.delcastanher.srv.br` — **todo preview do front chama a API de produção** (lido no bundle publicado `delcastanher-9wf0fzwkc-leno.vercel.app`) |
| `SITE_ORIGIN` do front em Preview | `https://delcastanher.vercel.app` |
| Preview da API pelo Git | **nenhum** nos últimos 40 deploys. O projeto tem "pular deploy quando a pasta não mudou" (`enableAffectedProjectsDeployments: true`), e o último commit de cada push nosso é de documentação, fora de `api/`. Só o merge na `main` dispara a API |
| Domínio da API de preview | `api-preview.delcastanher.srv.br` registrado pelo usuário em 22/10/2026 no projeto `delcastanher-api`, verificado e ligado à branch `preview`. Responde 302 até a branch ter deploy da API |
| Branch `preview` no Git | É a `main` da Spec 026: 84 commits atrás da `main` atual e nenhum à frente. Pode ser sobrescrita |
| Banco do Preview | `DATABASE_URL` e as demais variáveis do Neon valem para **Production e Preview** com os mesmos valores: o Preview grava no banco de produção |
| Conexão sandbox do Mercado Pago | `TESTUSER8605452672838458141`, gravada pelo script `mp-vendedor-sandbox` com a `MP_TOKEN_ENCRYPTION_KEY` do `.env` local. A API publicada não consegue decifrá-la (500 "Unsupported state or unable to authenticate data", Spec 028) |
| Proteção de deploy | Vercel Authentication nos dois projetos, em tudo menos domínio próprio (`all_except_custom_domains`) |
| DNS de `delcastanher.srv.br` | Registro.br (`a.sec.dns.br`, `c.sec.dns.br`), não a Vercel |
| E-mail no Preview | `RESEND_API_KEY` só em Production: o Preview não manda e-mail |
| Nota fiscal no Preview | `NOTAAS_*` e `NFSE_ENV` próprios do Preview (homologação) |

## Escopo

- Fechar já o risco de o preview do front chamar a API de produção.
- Domínio `api-preview.delcastanher.srv.br` no projeto da API, ligado à branch `preview`.
- A API passa a gerar preview pela branch `preview`, mesmo quando o commit não toca em `api/`.
- Banco de preview numa branch do Neon, com as migrations aplicadas no deploy.
- Variáveis de Preview de front e API apontando um para o outro.
- Mercado Pago sandbox funcionando no preview: conexão do vendedor de teste legível pela API de preview.
- Firebase e Storage aceitando o domínio de preview.
- Roteiro de uso: como uma spec sobe código para o preview e testa.

## Fora de escopo

- **Preview por branch de feature** (uma URL e um banco por PR). O ambiente é um só, fixo, na branch `preview`. Previews de outras branches continuam existindo nos endereços `*.vercel.app`, protegidos, e passam a apontar para a API de preview (decisão 1), mas sem garantia de funcionar.
- **Webhook do Mercado Pago no preview.** A tela do pedido reconsulta o Mercado Pago sozinha (Spec 014, decisão 14), e o webhook de produção continua só em produção.
- **E-mail no preview.** Continua desligado.
- **Mudar a proteção de deploy da Vercel.** O domínio próprio já fica de fora dela.

## Mudanças decididas na execução (22/10/2026)

O plano abaixo partiu de duas suposições que o primeiro deploy desmentiu:

- **A proteção da Vercel cobre os domínios de preview.** O `all_except_custom_domains` só libera os domínios próprios de **produção**. `preview.` e `api-preview.delcastanher.srv.br` pediam o login da Vercel. Por decisão do usuário, a Vercel Authentication foi **desligada só no projeto da API**. O front de preview continua visível só para quem está logado na Vercel; a API de preview é pública, com banco isolado e Mercado Pago em sandbox.
- **A integração do Neon injeta o banco de preview.** A integração `neon-rose-engine` cria uma branch do Neon por branch do Git e a injeta no deploy, por cima das variáveis do projeto. O branch `preview` do Git já tinha a sua desde 16/09 (branch `preview` do Neon, cópia de antes do lançamento: 7 contas de teste e do usuário, nenhum pedido). O primeiro deploy aplicou as migrations nela. Ficou assim:
  - **o banco de preview é a branch `preview` do Neon**, e as variáveis de banco de Preview também apontam para ela, para valerem com ou sem a injeção. A branch `ambiente-preview`, criada só com o esquema (resposta 1), ficou sem uso e foi apagada;
  - **a API só publica da `main` e da branch `preview`** (`commandForIgnoringBuildStep`). Sem isso, com o deploy em todo push (resposta 2), cada branch nova do Git ganharia um preview da API e uma cópia do banco de produção, agora com dados reais. É o que o usuário esperava: "só vai para preview a branch preview". Isso substitui a decisão 3, e o "pular quando a pasta não mudou" continua desligado.
- **Conexão sandbox copiada, e não recriada pelo script.** O `mp-vendedor-sandbox` nunca entrou na `main`. A conexão sandbox ativa da produção foi decifrada com a chave local e cifrada de novo com a chave do Preview na branch `preview` do Neon (ida e volta conferida antes de gravar).
- **`STORAGE_CORS_ORIGINS` não vai para a Vercel:** só o script `storage:cors` a usa. A origem de preview foi somada direto no bucket.

## Decisões técnicas desta spec

1. **Nenhum preview do front chama a API de produção.**
   O `API_URL` do front passa a valer `https://api-preview.delcastanher.srv.br` para **todo** o ambiente Preview, e não só para a branch `preview`. Um preview de qualquer branch que chame a produção grava em banco real e cobra em conta real. Esta é a primeira task, antes de a API de preview existir: um preview sem API funcionando é melhor do que um preview em produção.

2. **Domínios irmãos em `delcastanher.srv.br`.**
   `preview.delcastanher.srv.br` (front) e `api-preview.delcastanher.srv.br` (API) são o mesmo site para o navegador, como `www.` e `api.` em produção (Spec 017). Por isso:
   - o cookie `__Secure-refresh` (`SameSite=Strict`, sem `Domain`, Spec 017, decisão 13) funciona sem mudar o código. Com dois endereços `*.vercel.app` não funcionaria, porque `vercel.app` é sufixo público;
   - o CORS é uma lista fixa (`CORS_ORIGINS`), sem padrão no código;
   - os dois domínios ficam fora da Vercel Authentication (`all_except_custom_domains`), sem bypass nem token.
   O domínio da API já está ligado à branch `preview` no projeto `delcastanher-api` (feito pelo usuário).

3. **A API faz deploy de toda push na branch `preview`.**
   Com o "pular quando a pasta não mudou" ligado, o domínio da API de preview ficaria preso a um deploy velho sempre que o último commit fosse de documentação. Desligar a opção no projeto da API (`enableAffectedProjectsDeployments: false`) vale também para as outras branches; o custo é um build a mais da API por push, que é pequeno (~40 s).

4. **Banco de preview numa branch fixa do Neon.**
   Uma branch `preview` no projeto Neon da integração (`neon-rose-engine`), e não uma por deploy: o ambiente é um só (fora de escopo), e uma branch fixa guarda os dados de teste entre um deploy e outro.
   - As variáveis do banco (`DATABASE_URL`, `DATABASE_URL_UNPOOLED` e as `POSTGRES_*`/`PG*` que a integração criou) passam a ter um valor de **Preview** apontando para a branch. Production não muda.
   - **Migrations no deploy de preview:** o build da API roda `prisma migrate deploy` só quando `VERCEL_ENV=preview`. Em produção a migration continua manual e com autorização (Spec 027, decisão 8).
   - **A branch nasce só com o esquema** (resposta 1): criada vazia, recebe as migrations e o `db:seed`. Nenhum dado de produção é copiado. Como o seed só cria o que não existe, rodá-lo de novo não apaga o que foi testado.

5. **Mercado Pago sandbox com chave própria do preview.**
   A `MP_TOKEN_ENCRYPTION_KEY` hoje vale para Preview e Production juntas. Ela é separada: Production fica com a atual, e o Preview ganha uma chave nova, gerada direto na Vercel (memória `vercel-env-secrets`: segredo gerado na Vercel quando autorizado).
   - Com a chave do preview, a conexão do vendedor de teste é recriada **na branch do Neon** pelo script `mp-vendedor-sandbox` (`create`), rodado com o `DATABASE_URL` da branch e a chave nova. A conexão da branch de produção não é tocada.
   - `MP_SANDBOX=true`, `MP_ACCESS_TOKEN` e `MP_PUBLIC_KEY` do Preview continuam as do vendedor de teste (`APP_USR-`). Conferir que a chave pública do Preview é da mesma aplicação do token da conexão, senão o token do cartão não vale na order.
   - A chave nova não sai da Vercel: o script recebe a chave por variável de ambiente na hora, sem gravar em arquivo. Se a Vercel não deixar ler o valor (variável sensível), a chave é gerada localmente, usada no script e enviada à Vercel pela entrada padrão, sem ser impressa.

6. **Variáveis de configuração do Preview.**
   | Projeto | Variável | Valor de Preview |
   |---|---|---|
   | front | `API_URL` | `https://api-preview.delcastanher.srv.br` |
   | front | `SITE_ORIGIN` | `https://preview.delcastanher.srv.br` |
   | API | `CORS_ORIGINS` | `https://preview.delcastanher.srv.br,http://localhost:4200` |
   | API | `FRONTEND_URL` | `https://preview.delcastanher.srv.br` |
   | API | `STORAGE_CORS_ORIGINS` | o valor atual somado a `https://preview.delcastanher.srv.br`, e o `storage:cors` rodado para o bucket aceitar a origem |
   | API | `API_PUBLIC_URL` | `https://api-preview.delcastanher.srv.br`, se o código a usar fora de Production |
   São configuração, e não segredo: Claude as grava pela CLI e faz o redeploy (memória `vercel-env-secrets`).

7. **Firebase aceita o domínio de preview.**
   `preview.delcastanher.srv.br` entra nos domínios autorizados do Firebase Authentication, porque o link de redefinição de senha leva o `FRONTEND_URL` como `continueUrl` (Spec 017). Sem isso, o "esqueci a senha" falha no preview com a mensagem do `AuthService`.

8. **Como uma spec usa o preview.**
   A branch `preview` recebe a release da spec (`git push origin release/<spec>:preview --force-with-lease`). Front e API publicam sozinhos nos dois domínios, e as migrations da release entram na branch do Neon. O teste ao vivo das specs passa a ser no preview, e não na API local. A branch `preview` não é protegida nem tem PR: é descartável, e quem manda nela é a release em teste.

## Respostas do usuário (22/10/2026)

1. **Branch do Neon só com o esquema**, sem dados de produção. O preview nasce com o `db:seed`: catálogo, preços e pacote, sem aulas nem vídeos da Mux. A trilha fica vazia, e isso é aceito: o preview é para loja, pagamento e painel. Nenhum dado de aluno real sai da produção.
2. **A API publica em todo push, como na `main`.** Claude desliga o "pular deploy quando a pasta não mudou" no projeto da API (decisão 3).
3. **Chave nova do Mercado Pago no Preview autorizada.** Claude gera a `MP_TOKEN_ENCRYPTION_KEY` do Preview e a envia à Vercel (decisão 5).
4. **Firebase já configurado pelo usuário no console:** `preview.delcastanher.srv.br` está nos domínios autorizados (decisão 7).

## Critérios de aceite

- Nenhum preview do front tem `apiUrl` de produção no bundle.
- `https://preview.delcastanher.srv.br` abre sem login da Vercel, faz login, recarrega a página e continua logado.
- `https://api-preview.delcastanher.srv.br` responde, e o preflight de `https://preview.delcastanher.srv.br` passa.
- Um pedido criado no preview aparece na branch do Neon e **não** no banco de produção.
- No preview, os cartões de teste do Mercado Pago são aprovados e recusados como na matriz da Spec 028.
- Um push na branch `preview` só com documentação também publica a API.
- O roteiro da decisão 8 está no `README` ou num arquivo da spec, e a memória do projeto é atualizada.
