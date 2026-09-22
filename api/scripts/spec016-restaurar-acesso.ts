import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

/**
 * Desfaz o unico efeito colateral do cenario da Spec 016 sobre um acesso que
 * ja existia: o modulo 2 foi sobrescrito como `COURTESY` para o painel ter uma
 * concessao para contar, e o backfill original o tinha como `LEGACY`.
 *
 * A data de validade volta para a dos demais acessos da conta, que vieram do
 * mesmo backfill da Spec 014.
 */
const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env['DATABASE_URL_UNPOOLED'] ?? process.env['DATABASE_URL'],
  }),
});

const EMAIL = process.argv.find((a) => a.includes('@')) ?? 'jediaelborges23@gmail.com';

async function main() {
  const user = await prisma.user.findUnique({ where: { email: EMAIL } });

  if (!user) {
    console.log(`Conta ${EMAIL} nao encontrada.`);

    return;
  }

  // A referencia e o proprio backfill: os demais acessos da conta.
  const referencia = await prisma.moduleAccess.findFirst({
    where: { userId: user.id, source: 'LEGACY' },
    orderBy: { expiresAt: 'desc' },
  });

  if (!referencia) {
    console.log('Nenhum acesso LEGACY nesta conta para servir de referencia.');

    return;
  }

  const { count } = await prisma.moduleAccess.updateMany({
    where: { userId: user.id, source: 'COURTESY', orderId: null },
    data: { source: 'LEGACY', expiresAt: referencia.expiresAt },
  });

  console.log(
    `${count} acesso(s) devolvido(s) para LEGACY, expirando em ` +
      `${referencia.expiresAt.toISOString().slice(0, 10)}.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
