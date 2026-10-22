# Delcastanher

Plataforma e-learning para a **Imersão RH Estratégico** de Lidiane Delcastanher.

## Stack

- Angular 20+
- Tailwind CSS 3
- SCSS
- TypeScript 5.9

## Estrutura do Repositório

```
├── .agents/          # Configuração de agentes IA
├── .specs/           # Especificações do projeto
├── .vscode/          # Configuração do VS Code
├── front/            # Projeto Angular (frontend)
│   ├── src/
│   ├── public/
│   ├── angular.json
│   ├── package.json
│   └── ...
└── README.md
```

## Instalação e Desenvolvimento

```bash
cd front
npm install
npm start          # http://localhost:4200
npm run build      # build de produção
npm test           # testes unitários (Karma)
```

## Ambiente de preview (Spec 029)

| | Produção | Preview |
|---|---|---|
| Front | `https://www.delcastanher.srv.br` | `https://preview.delcastanher.srv.br` (só para quem está logado na Vercel) |
| API | `https://api.delcastanher.srv.br` | `https://api-preview.delcastanher.srv.br` (pública) |
| Banco | Neon, branch `main` | Neon, branch `preview` |
| Mercado Pago | conta real | sandbox, vendedor de teste |
| Branch do Git | `main` | `preview` |

Para testar uma release no preview:

```bash
git push origin release/<spec>:preview --force-with-lease
```

- Front e API publicam sozinhos nos dois domínios. O build da API aplica as migrations da release na branch `preview` do Neon (`vercel-build`); em produção a migration continua manual.
- A API só publica da `main` e da branch `preview`. Outras branches geram preview só do front, que chama a API de preview.
- Pagamento com os cartões de teste do Mercado Pago (nome no cartão `APRO`, `FUND`, `OTHE`...; CPF `12345678909`).
- O Firebase é o mesmo da produção: as contas de login valem nos dois ambientes, mas os dados de aluno ficam em bancos separados.
- Não rodam no preview: e-mail (sem `RESEND_API_KEY`), webhook do Mercado Pago (a tela do pedido reconsulta sozinha) e as rotinas agendadas.

## Documentação

Consulte `.specs/` para especificações detalhadas do projeto.
