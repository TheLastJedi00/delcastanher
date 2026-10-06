/**
 * Apaga as contas de teste e o pedido nao pago do admin (Spec 026).
 *
 *   npm run spec026:limpeza             # so simula: lista o que apagaria
 *   npm run spec026:limpeza -- --apply  # apaga
 *
 * As listas sao fechadas, tiradas do inventario de 06/10/2026 (decisao 1): o
 * site esta no ar, e "todos menos os admins" apagaria um aluno real que
 * chegasse entre o inventario e a execucao. Antes de apagar, o script confere
 * que o banco ainda bate com o inventario e para se nao bater (decisao 7).
 *
 * Reaproveita o AppModule, como o `manage-role.ts`: mesma leitura de
 * credenciais da API para o Postgres e para o Firebase.
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { FirebaseService } from '../src/firebase/firebase.service';
import { PrismaService } from '../src/prisma/prisma.service';

/** Contas com linha no Postgres: saem do banco e do Firebase. */
const DB_USERS: Readonly<Record<string, string>> = {
  QjNUWVXvRIT0yeScN1Xft75ZZKR2: 'teste-onboarding@delcastanher.com',
  '6blK4lHaZbdVHfCP39VM3PrWZTS2': 'e2e-spec008@delcastanher.test',
  '9C6nHY6EMTgu7A6RZRj9AkneS9K2': 'e2e-spec010-aluno@delcastanher.test',
  NufuDCSDSdftVYa7K4ZRttsToch2: 'e2e-spec010-admin@delcastanher.test',
  SbbVbGskYiXMEwEyESuDmVcQxen2: 'jediaelborges23@gmail.com',
  Gnwcib5JMFe61VRKPSk91J2kkWs2: 'jediaelborges15@gmail.com',
};

/** Contas que so existem no Firebase. */
const FIREBASE_ONLY_USERS: Readonly<Record<string, string>> = {
  MoXhh9a2Q7ND6RuSwijlecYGqqW2: 'admin@delcastanher.com',
  sdGdI0qwDqVg5Q6wlsrYE276Cgl1: 'aluno@delcastanher.com',
};

/** PENDING de R$ 199 do admin, sem order no Mercado Pago. */
const LOOSE_ORDER_ID = 'cmu5ygmu60000i0uao83byzt5';

const DB_UIDS = Object.keys(DB_USERS);
const ALL_UIDS = [...DB_UIDS, ...Object.keys(FIREBASE_ONLY_USERS)];

const reais = (cents: number): string => `R$ ${(cents / 100).toFixed(2)}`;

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });

  try {
    const prisma = app.get(PrismaService);
    const auth = app.get(FirebaseService).auth;

    console.log(
      apply ? '== APLICANDO ==\n' : '== SIMULACAO (nada sera apagado) ==\n',
    );

    const users = await prisma.user.findMany({
      where: { id: { in: DB_UIDS } },
      select: {
        id: true,
        email: true,
        role: true,
        _count: {
          select: {
            orders: true,
            accesses: true,
            progress: true,
            certificates: true,
          },
        },
        orders: {
          select: {
            id: true,
            status: true,
            amountCents: true,
            invoice: { select: { id: true } },
          },
        },
      },
    });
    const looseOrder = await prisma.order.findUnique({
      where: { id: LOOSE_ORDER_ID },
      select: {
        id: true,
        status: true,
        amountCents: true,
        invoice: { select: { id: true } },
      },
    });
    const firebase = await auth.getUsers(ALL_UIDS.map((uid) => ({ uid })));

    // Decisao 7: o estado tem que ser o do inventario.
    const problems: string[] = [];

    for (const user of users) {
      if (DB_USERS[user.id] !== user.email) {
        problems.push(
          `${user.id}: e-mail ${user.email}, esperado ${DB_USERS[user.id]}`,
        );
      }

      for (const order of user.orders) {
        if (
          order.status === 'PAID' ||
          order.status === 'REFUNDED' ||
          order.invoice
        ) {
          problems.push(
            `${user.email}: pedido ${order.id} ${order.status}${order.invoice ? ' com nota' : ''}`,
          );
        }
      }
    }

    for (const record of firebase.users) {
      const expected = DB_USERS[record.uid] ?? FIREBASE_ONLY_USERS[record.uid];

      if (record.email !== expected) {
        problems.push(
          `Firebase ${record.uid}: e-mail ${record.email}, esperado ${expected}`,
        );
      }
    }

    if (looseOrder && (looseOrder.status !== 'PENDING' || looseOrder.invoice)) {
      problems.push(
        `Pedido ${LOOSE_ORDER_ID} esta ${looseOrder.status}${looseOrder.invoice ? ' com nota' : ''}`,
      );
    }

    console.log(
      `Postgres: ${users.length} de ${DB_UIDS.length} contas encontradas`,
    );

    for (const user of users) {
      const c = user._count;

      console.log(
        `  ${user.email} (${user.role}) | ${c.orders} pedidos, ${c.accesses} acessos, ` +
          `${c.progress} progresso, ${c.certificates} certificados`,
      );

      for (const order of user.orders) {
        console.log(
          `      pedido ${order.id} ${order.status} ${reais(order.amountCents)}`,
        );
      }
    }

    console.log(
      `\nPedido avulso: ${
        looseOrder
          ? `${looseOrder.id} ${looseOrder.status} ${reais(looseOrder.amountCents)}`
          : 'ja nao existe'
      }`,
    );

    console.log(
      `\nFirebase: ${firebase.users.length} de ${ALL_UIDS.length} contas encontradas`,
    );

    for (const record of firebase.users) {
      console.log(
        `  ${record.email} (${(record.customClaims?.role as string | undefined) ?? 'sem papel'})`,
      );
    }

    if (problems.length > 0) {
      console.error(
        '\nO banco nao bate com o inventario da Spec 026. Nada foi apagado:',
      );
      problems.forEach((p) => console.error(`  - ${p}`));
      process.exitCode = 1;

      return;
    }

    if (!apply) {
      console.log('\nConferencia ok. Rode com --apply para apagar.');

      return;
    }

    // Decisao 5: as cascatas do schema levam progresso, certificados,
    // acessos, pedidos e itens. Tudo ou nada.
    const [deletedOrders, deletedUsers] = await prisma.$transaction([
      prisma.order.deleteMany({
        where: { id: LOOSE_ORDER_ID, status: 'PENDING' },
      }),
      prisma.user.deleteMany({ where: { id: { in: DB_UIDS } } }),
    ]);

    console.log(
      `\nPostgres: ${deletedUsers.count} contas e ${deletedOrders.count} pedido avulso apagados`,
    );

    // Decisao 6: depois do banco. UID inexistente conta como ja apagado,
    // entao rodar de novo termina o que faltou.
    const result = await auth.deleteUsers(ALL_UIDS);

    console.log(
      `Firebase: ${result.successCount} contas apagadas, ${result.failureCount} falhas`,
    );

    result.errors.forEach((e) =>
      console.error(`  - ${ALL_UIDS[e.index]}: ${e.error.message}`),
    );

    if (result.failureCount > 0) {
      process.exitCode = 1;
    }
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
