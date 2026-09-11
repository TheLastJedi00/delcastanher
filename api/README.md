# API — Imersão RH Estratégico

Backend NestJS responsável pela autenticação via Firebase.

## Requisitos

**Node.js >= 20.**

> **Nota sobre o `overrides` do `package.json`.** O `firebase-admin` puxa
> `jwks-rsa@4`, que faz `require('jose')` no topo de `src/utils.js`. O `jose@6`
> (o que o `jwks-rsa` pede) é somente-ESM, e `require()` de ESM não funciona em
> Node < 22.12 **nem no runtime serverless da Vercel**, que usa um loader
> próprio sem esse suporte — de onde vinha o `[ERR_REQUIRE_ESM]` em produção.
> O `overrides` fixa `jose@^5.10.0` **apenas para o `jwks-rsa`**: a v5 publica
> build CJS e ESM, então o `require()` resolve em qualquer loader. As quatro
> funções que o `jwks-rsa` usa (`importJWK`, `exportSPKI`, `decodeJwt`,
> `decodeProtectedHeader`) existem igual na v5. Só remova o `overrides` quando o
> `jwks-rsa` passar a usar `import()` dinâmico.

## Configuração

```bash
npm install
cp .env.example .env   # preencha as credenciais do Firebase
```

As variáveis estão documentadas no `.env.example`. Uma delas muda de
comportamento entre ambientes: **`CORS_ORIGINS`** (lista de origens do front,
separadas por vírgula) é opcional em desenvolvimento — assume
`http://localhost:4200` — e **obrigatória em produção**. Sem ela a API falha na
subida, de propósito: cair no `localhost` silenciosamente deixaria o front
publicado bloqueado pelo navegador, um sintoma bem mais caro de diagnosticar.

## Rodando

```bash
npm run start:dev      # http://localhost:3000
npm test               # suíte unitária
```

## Vídeo e materiais (Storage + Mux)

O arquivo de vídeo **nunca passa pelo servidor**: a API roda como função
serverless na Vercel, onde o corpo de uma request é limitado a poucos megabytes.
O fluxo tem três passos — o admin pede uma URL assinada de escrita, o navegador
faz o `PUT` direto no bucket e só então confirma na API, que grava a referência.

O Storage é a fonte e o backup; o **Mux** é a distribuição. Na confirmação do
vídeo a API gera uma URL assinada de *leitura* e a entrega ao Mux como `input`,
que puxa o arquivo por conta própria: um upload, dois destinos. A ingestão é
assíncrona, e o estado (`PENDING` → `PROCESSING` → `READY` / `ERRORED`) chega
por webhook em `POST /webhooks/mux` — a única rota pública desta parte, separada
das demais por verificação de assinatura.

Os assets têm policy `signed`, porque toda a plataforma é paga: o `playbackId`
sozinho não reproduz nada, e `GET /modules/:moduleId/playback-token` só emite o
JWT curto para uma sessão autenticada.

As variáveis `FIREBASE_STORAGE_BUCKET`, `MUX_TOKEN_ID`, `MUX_TOKEN_SECRET`,
`MUX_SIGNING_KEY_ID`, `MUX_SIGNING_PRIVATE_KEY` e `MUX_WEBHOOK_SECRET` estão
documentadas no `.env.example` e vivem **apenas no backend** — nenhuma delas
entra no `environment.ts` do front. O bucket vai pelo nome, sem `gs://`.

> A integração Mux do marketplace da Vercel injeta o token como
> `MUX_VIDEO_MUX_TOKEN_ID` / `MUX_VIDEO_MUX_TOKEN_SECRET`. A API aceita os dois
> nomes, com precedência para os da spec, para não exigir segredo duplicado no
> painel.

### CORS do bucket (passo obrigatório)

O upload vai **do navegador direto para o bucket**, então o bucket precisa
aceitar a origem do front. Um bucket sem CORS aceita o `PUT` vindo do servidor
e recusa o mesmo `PUT` vindo de uma página — e o navegador esconde a resposta,
de modo que o painel só mostra "não foi possível falar com o servidor".

```bash
npm run storage:cors            # aplica as origens de CORS_ORIGINS ao bucket
npm run storage:cors -- --show  # mostra a política atual
```

Rode uma vez por bucket, e de novo sempre que `CORS_ORIGINS` mudar (domínio
novo do front, preview da Vercel que precise subir arquivo).

### Endpoints

| Rota | Quem acessa |
| --- | --- |
| `POST /admin/modules/:moduleId/video/upload-url` | admin |
| `POST /admin/modules/:moduleId/video` | admin (confirmação) |
| `GET /admin/modules/:moduleId/video` | admin (estado da ingestão) |
| `POST /admin/modules/:moduleId/materials/upload-url` | admin |
| `POST /admin/modules/:moduleId/materials` | admin (confirmação) |
| `DELETE /admin/materials/:id` | admin |
| `GET /modules/:moduleId/materials` | aluno autenticado |
| `GET /modules/:moduleId/playback-token` | aluno autenticado |
| `POST /webhooks/mux` | público, com assinatura |

## Gerenciando o perfil de um usuário

O perfil de acesso vem da custom claim `role` do Firebase — quem não tem a claim
é tratado como `aluno`. Para promover ou rebaixar alguém:

```bash
npm run role -- --promote usuario@exemplo.com   # torna admin
npm run role -- --revoke  usuario@exemplo.com   # volta a ser aluno
```

O script atua apenas sobre contas **já existentes**: não cria usuário nem altera
senha. Contas novas nascem pelo fluxo "Criar nova conta" da tela de login
(`POST /auth/account`), que envia o link de definição de senha por e-mail.

> A claim só passa a valer no próximo token. Quem já estiver logado mantém o
> perfil antigo até a sessão expirar — peça para sair e entrar de novo.

---

<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ npm install
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
