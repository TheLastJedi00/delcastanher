# Spec 026: Limpeza de Contas de Teste

**Projeto:** Plataforma E-learning "Imersão RH Estratégico"
**Baseada em:** Spec 004 (Autenticação), Spec 013 (Painel Administrativo), Spec 014 (Checkout), Spec 016 (Painel de Finanças), Spec 023 e 024.2 (Nota Fiscal)
**Escopo técnico:** só `api/`, com um script único em `api/scripts/`. Não há mudança de código da aplicação, de tela nem de schema, e nenhuma migration.

## Objetivo
O banco Neon é um só e é o de produção (memória `banco-unico-producao`). Desde a Spec 008 ele acumula contas criadas para testes de ponta a ponta, contas pessoais usadas como aluno e pedidos de checkout que nunca foram pagos. Essas linhas aparecem na tabela "Visão Geral e Alunos" e nos KPIs do `/admin`, e as contas continuam podendo entrar.

Esta spec apaga essas contas, no Firebase Auth e no Postgres, e os pedidos de teste que não foram pagos. Os dois pedidos pagos ficam, porque o dinheiro entrou de verdade na conta Mercado Pago conectada.

## Inventário (lido em 06/10/2026, só leitura)

### Contas que ficam

| Conta | Papel | Por que fica |
|---|---|---|
| `lenoborges.dev@gmail.com` | admin | Administrador |
| `lidiane_delcastanher@hotmail.com` | admin | Administradora (cliente) |
| `jediaelborges18@gmail.com` | aluno | É dona do pedido pago de R$ 1, que tem nota fiscal (decisão 2) |

### Contas que saem

| Conta | UID | Onde existe | O que leva junto |
|---|---|---|---|
| `teste-onboarding@delcastanher.com` | `QjNUWVXvRIT0yeScN1Xft75ZZKR2` | Firebase + Postgres | 12 acessos LEGACY |
| `e2e-spec008@delcastanher.test` | `6blK4lHaZbdVHfCP39VM3PrWZTS2` | Firebase + Postgres | 12 acessos LEGACY |
| `e2e-spec010-aluno@delcastanher.test` | `9C6nHY6EMTgu7A6RZRj9AkneS9K2` | Firebase + Postgres | 12 acessos LEGACY |
| `e2e-spec010-admin@delcastanher.test` | `NufuDCSDSdftVYa7K4ZRttsToch2` | Firebase + Postgres (admin) | 12 acessos LEGACY |
| `jediaelborges23@gmail.com` | `SbbVbGskYiXMEwEyESuDmVcQxen2` | Firebase + Postgres | 11 acessos LEGACY, 1 certificado |
| `jediaelborges15@gmail.com` | `Gnwcib5JMFe61VRKPSk91J2kkWs2` | Firebase + Postgres | 3 pedidos não pagos (abaixo) |
| `admin@delcastanher.com` | `MoXhh9a2Q7ND6RuSwijlecYGqqW2` | Só Firebase (admin) | — |
| `aluno@delcastanher.com` | `sdGdI0qwDqVg5Q6wlsrYE276Cgl1` | Só Firebase | — |

### Pedidos

| Pedido | Dono | Situação | Valor | Destino |
|---|---|---|---|---|
| `cmu5ygmu60000i0uao83byzt5` | lenoborges.dev | PENDING, sem order no MP | R$ 199,00 | **Sai** |
| `cmulmj92u000004l3mt1j5m09` | jediaelborges15 | CANCELLED | R$ 5,00 | **Sai** junto com a conta |
| `cmulmjg1m000204l32drdkp9c` | jediaelborges15 | CANCELLED | R$ 5,00 | **Sai** junto com a conta |
| `cmuloq9r7000004kx4vrpikxz` | jediaelborges15 | PENDING, `ORD01M3MTD83FXTGGP72N7YEBC3W2` | R$ 5,00 | **Sai** junto com a conta |
| `cmuva1jb1000004jw5wjxnvia` | lidiane_delcastanher | PAID em 05/10 | R$ 5,00 | Fica |
| `cmuwz46hf000006kze8xebbdw` | jediaelborges18 | PAID em 06/10, nota `ERROR` (homologação) | R$ 1,00 | Fica |

Não existem campanhas de e-mail nem entregas (`email_campaigns` e `email_deliveries` vazias).

## Escopo

- **Script `api/scripts/spec026-limpeza.ts`** (`npm run spec026:limpeza`). Sem argumento, ele só lista o que apagaria. Com `--apply`, apaga.
- **Exclusão das 8 contas** no Firebase Auth e, das 6 que têm linha, no Postgres.
- **Exclusão do pedido `cmu5ygmu60000i0uao83byzt5`**, o PENDING de R$ 199 do admin.
- **Conferência depois da limpeza:** o mesmo inventário de novo e o `/admin` aberto no Chrome.

## Decisões técnicas desta spec

1. **O script recebe uma lista fechada de UIDs e de pedidos. Não é "apagar tudo menos os admins".**
   O site está no ar e qualquer pessoa pode criar conta ou comprar entre o inventário e a execução. Um filtro "todos menos estes" apagaria um aluno real que chegou nesse meio-tempo. A lista desta spec é a do inventário, escrita no script como constante, e uma conta nova nunca entra nela por acidente.

2. **`jediaelborges18` fica inteira, com acessos, progresso e certificados.**
   É dona de um dos pedidos pagos, e decidiu-se que os pagos ficam. `Order.user` é `onDelete: Cascade`: apagar a conta apagaria o pedido. A nota desse pedido é `onDelete: Restrict` e travaria a exclusão. Ficaria um aluno de teste na base, e esse custo foi aceito em troca de não mexer em pedido com dinheiro real.

3. **Os pedidos pagos ficam no banco e o dinheiro não é estornado.**
   Os R$ 5 e o R$ 1 continuam no painel financeiro (Spec 016) como receita, e as orders continuam no Mercado Pago. Estornar e apagar seria uma operação financeira, e esta spec é só de limpeza. A nota `ERROR` do pedido de R$ 1 é da homologação e também fica como está.

4. **O acesso dos admins fica como está.**
   O Leno mantém 11 acessos LEGACY e 1 cortesia. A Lidiane mantém o acesso que veio do pedido pago, que continua existindo. Nada de `module_access` é tocado fora das contas que saem.

5. **No Postgres, a exclusão é pelas cascatas que o schema já declara, numa transação.**
   Ao apagar `users`, o banco apaga sozinho `lesson_progress`, `certificates`, `module_access` e `orders`, e com os pedidos vão `order_items`. Nenhuma das contas que saem tem pedido com nota, então o `Restrict` de `invoices` não dispara. Apagar tabela por tabela à mão repetiria o que o schema já garante e abriria espaço para esquecer uma. O pedido avulso do admin sai na mesma transação. Ou sai tudo, ou nada.

6. **Ordem: Postgres primeiro, Firebase depois, e o script pode rodar de novo.**
   Se o Firebase falhar depois do banco, rodar outra vez termina o serviço: `deleteUsers` trata UID que não existe como já apagado, e a transação não encontra mais nada. Na ordem inversa, uma conta apagada no Firebase com o banco falhando deixaria linhas sem dono, que ninguém consegue mais acessar para conferir. Nenhuma das contas que saem é usada por pessoa real, então a janela entre os dois passos não tem quem a explore.

7. **O script recusa rodar se o banco não bater com o inventário.**
   Antes de apagar, ele confere que nenhum UID da lista tem pedido `PAID` ou `REFUNDED` nem nota fiscal, e que o pedido avulso continua `PENDING`. Se algo mudou desde 06/10, ele para e mostra o quê. A spec se baseia nesse inventário, e não vale apagar sobre um estado diferente dele.

8. **A execução com `--apply` depende de autorização explícita no momento.**
   O banco tem venda real desde 28/09 (memória `banco-unico-producao`). A rodada sem argumento pode ser feita a qualquer momento. A com `--apply` só roda depois que o usuário vê a saída da simulação e aprova.

9. **Sem TDD de suíte Jest.**
   O script roda uma vez, contra produção, e não tem regra de negócio além da decisão 7. A garantia vem da simulação conferida antes e do inventário refeito depois. Uma suíte para isso precisaria de banco de teste, que o projeto não tem. Fica registrado como exceção à regra do `.claude/RULES.md`.

## Integração com o existente
O script segue o padrão de `scripts/spec016-*.ts` e `scripts/manage-role.ts`. Ele sobe o `AppModule` pelo `NestFactory` e usa o `PrismaService` e o `FirebaseService` da própria API, sem segunda leitura de credenciais. Entra no `package.json` como `spec026:limpeza`.

O webhook do Mercado Pago pode receber, no futuro, notificação da order `ORD01M3MTD83FXTGGP72N7YEBC3W2` (o PENDING de `jediaelborges15`), que deixa de existir no banco. A task 1.1 confirma que o handler responde 200 e ignora order desconhecida, em vez de devolver erro e fazer o Mercado Pago repetir a notificação.

## Fora de escopo
- Estorno dos dois PIX pagos e qualquer mudança no Mercado Pago (decisão 3).
- Limpeza da conta `jediaelborges18` e dos dados dela (decisão 2).
- Correção ou cancelamento da nota em `ERROR` do pedido de R$ 1.
- Botão de excluir conta no painel e o direito de eliminação da LGPD pelo produto (Spec 009). Esta spec é uma limpeza única por script.
- Banco separado de desenvolvimento, que evitaria contas de teste em produção daqui para a frente.
