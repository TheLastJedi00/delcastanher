/**
 * Teste de concorrencia da ultima vaga (Spec 019, decisao 5; Task 3.8).
 *
 *   npm run spec019:concorrencia
 *
 * Roda contra o banco de verdade, porque e o `SELECT ... FOR UPDATE` do
 * Postgres que esta sob teste — um double de Prisma nao trava nada.
 *
 * Nao toca no Pacote de Lancamento: cria um pacote temporario com um lote de
 * **uma** vaga e um segundo lote sem limite, dois usuarios temporarios, e
 * dispara dois pedidos ao mesmo tempo. Com a trava, um entra no lote 1 e o
 * outro no lote 2; sem ela, os dois leriam "falta 1" e entrariam no lote 1.
 * Tudo o que foi criado e apagado no fim, inclusive se o teste falhar.
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { BundlesService } from '../src/payments/bundles.service';

const PREFIX = 'spec019-concorrencia';
const SLUG = `${PREFIX}-pacote`;
const USERS = [`${PREFIX}-a`, `${PREFIX}-b`];

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env['DATABASE_URL_UNPOOLED'] ?? process.env['DATABASE_URL'],
  }),
});

async function cleanup(): Promise<void> {
  await prisma.order.deleteMany({ where: { userId: { in: USERS } } });
  await prisma.bundle.deleteMany({ where: { slug: SLUG } });
  await prisma.user.deleteMany({ where: { id: { in: USERS } } });
}

async function main(): Promise<void> {
  await cleanup();

  const course = await prisma.course.findUniqueOrThrow({ where: { slug: 'imersao-rh' } });
  const modules = await prisma.module.findMany({
    where: { courseId: course.id, order: { in: [1, 2] } },
    select: { id: true },
  });

  for (const id of USERS) {
    await prisma.user.create({ data: { id, email: `${id}@teste.delcastanher.invalid` } });
  }

  await prisma.bundle.create({
    data: {
      slug: SLUG,
      title: 'Pacote temporario do teste de concorrencia',
      courseId: course.id,
      active: true,
      modules: { create: modules.map((module) => ({ moduleId: module.id })) },
      tiers: {
        create: [
          { order: 1, name: 'Lote de uma vaga', priceCents: 1000, capacity: 1 },
          { order: 2, name: 'Lote seguinte', priceCents: 2000, capacity: null },
        ],
      },
    },
  });

  const bundles = new BundlesService(prisma as unknown as PrismaService);

  const results = await Promise.all(
    USERS.map((userId) =>
      bundles.placeOrder({ slug: SLUG, userId, method: 'PIX', installments: 1 }),
    ),
  );

  const tiers = results.map((result) => result.order.tierNameSnapshot).sort();

  console.log(`pedidos: ${results.map((r) => `${r.order.tierNameSnapshot} (${r.order.amountCents})`).join(' | ')}`);

  if (tiers[0] === 'Lote de uma vaga' && tiers[1] === 'Lote seguinte') {
    console.log('OK: a ultima vaga foi para um pedido so, e o outro entrou no lote seguinte.');
  } else {
    console.log('ERRO: os dois pedidos entraram no mesmo lote.');
    process.exitCode = 1;
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await cleanup();
    await prisma.$disconnect();
  });
