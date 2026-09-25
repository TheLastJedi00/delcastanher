/**
 * Reserva e liberacao de vaga no Pacote de Lancamento de verdade (Spec 019,
 * decisao 3; Tasks 7.8 e 7.9).
 *
 *   npm run spec019:vagas
 *
 * Com um usuario temporario, grava um pedido de pacote pelo mesmo
 * `BundlesService.placeOrder` do checkout e acompanha a oferta publica:
 *
 * 1. pedido PIX pendente no prazo reserva a vaga (20 -> 19);
 * 2. vencido (`expiresAt` no passado) libera (19 -> 20);
 * 3. pago ocupa, estornado continua ocupando — o lote nao volta;
 * 4. cancelado libera.
 *
 * O Mercado Pago nao participa: e a regra de vaga que esta sob teste. Tudo o
 * que foi criado e apagado no fim, inclusive se algo falhar.
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { BundlesService } from '../src/payments/bundles.service';

const USER = 'spec019-vagas-aluno';
const SLUG = 'imersao-rh-lancamento';

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env['DATABASE_URL_UNPOOLED'] ?? process.env['DATABASE_URL'],
  }),
});
const bundles = new BundlesService(prisma as unknown as PrismaService);

let failures = 0;

async function remaining(): Promise<number | null> {
  return (await bundles.offer())?.tier?.remaining ?? null;
}

async function expect(label: string, expected: number): Promise<void> {
  const value = await remaining();
  const ok = value === expected;

  failures += ok ? 0 : 1;
  console.log(`${ok ? 'ok  ' : 'ERRO'} ${label}: restam ${value} (esperado ${expected})`);
}

async function cleanup(): Promise<void> {
  await prisma.order.deleteMany({ where: { userId: USER } });
  await prisma.user.deleteMany({ where: { id: USER } });
}

async function main(): Promise<void> {
  await cleanup();

  const before = await remaining();

  if (before === null) {
    throw new Error('O lote vigente nao tem limite de vagas; nada a contar.');
  }

  console.log(`Antes: restam ${before} vagas no lote vigente.`);
  await prisma.user.create({ data: { id: USER, email: `${USER}@teste.delcastanher.invalid` } });

  const { order } = await bundles.placeOrder({ slug: SLUG, userId: USER, method: 'PIX', installments: 1 });
  const items = order.items.reduce((sum, item) => sum + item.priceCents, 0);

  console.log(
    `Pedido ${order.id}: ${order.tierNameSnapshot}, ${order.amountCents} centavos, ` +
      `${order.items.length} itens somando ${items}.`,
  );
  failures += items === order.amountCents && order.items.length === 12 ? 0 : 1;

  // O checkout grava o vencimento do PIX quando o Mercado Pago responde.
  await prisma.order.update({
    where: { id: order.id },
    data: { expiresAt: new Date(Date.now() + 30 * 60 * 1000) },
  });
  await expect('PIX pendente no prazo reserva', before - 1);

  await prisma.order.update({ where: { id: order.id }, data: { expiresAt: new Date(Date.now() - 60_000) } });
  await expect('PIX vencido libera', before);

  await prisma.order.update({ where: { id: order.id }, data: { status: 'PAID', paidAt: new Date() } });
  await expect('pago ocupa', before - 1);

  await prisma.order.update({ where: { id: order.id }, data: { status: 'REFUNDED', refundedAt: new Date() } });
  await expect('estornado continua ocupando', before - 1);

  await prisma.order.update({ where: { id: order.id }, data: { status: 'CANCELLED' } });
  await expect('cancelado libera', before);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    failures += 1;
  })
  .finally(async () => {
    await cleanup();
    console.log(`Depois da limpeza: restam ${await remaining()} vagas.`);
    await prisma.$disconnect();
    process.exitCode = failures > 0 ? 1 : 0;
  });
