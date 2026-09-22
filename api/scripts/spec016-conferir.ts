import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

/** Confere o que sobrou no banco depois da verificacao da Spec 016. */
const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env['DATABASE_URL_UNPOOLED'] ?? process.env['DATABASE_URL'],
  }),
});

async function main() {
  const pedidos = await prisma.order.count({ where: { id: { startsWith: 'spec016-' } } });
  const acessos = await prisma.moduleAccess.count({
    where: { orderId: { startsWith: 'spec016-' } },
  });
  const taxas = await prisma.gatewayFeeRate.findMany({ orderBy: { createdAt: 'asc' } });

  console.log(`pedidos de teste restantes: ${pedidos} | acessos ligados a eles: ${acessos}`);

  for (const taxa of taxas) {
    const ate = taxa.validTo ? taxa.validTo.toISOString().slice(0, 10) : 'em diante';

    console.log(
      `${taxa.id} ${taxa.method} ${taxa.percentBasisPoints}bp +${taxa.fixedCents}c ` +
        `de ${taxa.validFrom.toISOString().slice(0, 10)} ate ${ate}`,
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
