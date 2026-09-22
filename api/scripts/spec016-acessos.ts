import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

/** Lista os acessos de uma conta, para conferir o estado depois da verificacao. */
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

  const total = await prisma.module.count();
  const accesses = await prisma.moduleAccess.findMany({
    where: { userId: user.id },
    include: { module: { select: { order: true, title: true } } },
    orderBy: { module: { order: 'asc' } },
  });

  console.log(`${accesses.length} de ${total} modulos liberados para ${EMAIL}:`);

  for (const access of accesses) {
    console.log(
      `  ${access.module.order}. ${access.module.title} | ${access.source} | ` +
        `expira ${access.expiresAt.toISOString().slice(0, 10)}`,
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
