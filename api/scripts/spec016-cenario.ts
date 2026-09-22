import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

/**
 * Prepara o cenario do teste funcional da Spec 016: o painel financeiro
 * precisa de pedidos em estados diferentes para ter o que mostrar.
 *
 * Cria pedidos **marcados** com o prefixo `spec016-` no id, para que a
 * remocao seja exata: `npm run spec016:cenario -- --limpar` apaga so o que
 * este script criou, e nunca um pedido de verdade.
 *
 * Os pedidos sao datados dentro dos ultimos 30 dias — a janela default do
 * painel —, e um deles cai as 21h no fuso de Sao Paulo de proposito: e o caso
 * da decisao 11, em que a venda precisa aparecer no dia certo e nao no
 * seguinte.
 *
 * Reverter: `npm run spec016:cenario -- --limpar`.
 */
const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env['DATABASE_URL_UNPOOLED'] ?? process.env['DATABASE_URL'],
  }),
});

const EMAIL = process.argv.find((a) => a.includes('@')) ?? 'jediaelborges23@gmail.com';
const LIMPAR = process.argv.includes('--limpar');

/** Prefixo dos ids criados aqui. E ele que torna a limpeza exata. */
const PREFIXO = 'spec016-';

/** Dias atras, ao meio-dia UTC — bem dentro do dia em Sao Paulo. */
function diasAtras(dias: number, hora = 12): Date {
  const data = new Date();

  data.setUTCDate(data.getUTCDate() - dias);
  data.setUTCHours(hora, 0, 0, 0);

  return data;
}

async function limpar(): Promise<void> {
  await prisma.moduleAccess.deleteMany({ where: { orderId: { startsWith: PREFIXO } } });
  await prisma.orderItem.deleteMany({ where: { orderId: { startsWith: PREFIXO } } });

  const { count } = await prisma.order.deleteMany({ where: { id: { startsWith: PREFIXO } } });

  console.log(`${count} pedido(s) de teste removido(s).`);
}

async function main() {
  const user = await prisma.user.findUnique({ where: { email: EMAIL } });

  if (!user) {
    console.log(`Conta ${EMAIL} nao encontrada.`);

    return;
  }

  if (LIMPAR) {
    await limpar();

    return;
  }

  const modules = await prisma.module.findMany({
    where: { priceCents: { not: null } },
    orderBy: { order: 'asc' },
    take: 2,
  });

  if (modules.length < 2) {
    console.log('Sao necessarios ao menos dois modulos com preco definido.');

    return;
  }

  // Idempotente: rodar duas vezes nao duplica o cenario.
  await limpar();

  const [primeiro, segundo] = modules;

  const pedidos = [
    {
      id: `${PREFIXO}pago-pix`,
      status: 'PAID' as const,
      method: 'PIX' as const,
      installments: 1,
      amountCents: primeiro.priceCents as number,
      createdAt: diasAtras(12),
      paidAt: diasAtras(12),
      refundedAt: null,
      mpOrderId: `${PREFIXO}ORD-1`,
      mpPaymentId: `${PREFIXO}PAY-1`,
      mpStatus: 'processed',
      mpStatusDetail: 'accredited',
      items: [primeiro],
    },
    {
      id: `${PREFIXO}pago-cartao`,
      status: 'PAID' as const,
      method: 'CREDIT_CARD' as const,
      installments: 3,
      amountCents: (primeiro.priceCents as number) + (segundo.priceCents as number),
      createdAt: diasAtras(5),
      // 03:00 UTC do dia seguinte e 00:00 em Sao Paulo: a venda das 21h que a
      // decisao 11 existe para colocar no dia certo.
      paidAt: diasAtras(4, 0),
      refundedAt: null,
      mpOrderId: `${PREFIXO}ORD-2`,
      mpPaymentId: `${PREFIXO}PAY-2`,
      mpStatus: 'processed',
      mpStatusDetail: 'accredited',
      items: [primeiro, segundo],
    },
    {
      id: `${PREFIXO}pendente`,
      status: 'PENDING' as const,
      method: 'PIX' as const,
      installments: 1,
      amountCents: segundo.priceCents as number,
      createdAt: diasAtras(2),
      paidAt: null,
      refundedAt: null,
      mpOrderId: `${PREFIXO}ORD-3`,
      mpPaymentId: null,
      mpStatus: 'action_required',
      mpStatusDetail: 'waiting_transfer',
      items: [segundo],
    },
    {
      id: `${PREFIXO}recusado`,
      status: 'REJECTED' as const,
      method: 'CREDIT_CARD' as const,
      installments: 1,
      amountCents: segundo.priceCents as number,
      createdAt: diasAtras(8),
      paidAt: null,
      refundedAt: null,
      mpOrderId: `${PREFIXO}ORD-4`,
      mpPaymentId: `${PREFIXO}PAY-4`,
      mpStatus: 'failed',
      mpStatusDetail: 'cc_rejected_insufficient_amount',
      items: [segundo],
    },
    {
      id: `${PREFIXO}estornado`,
      status: 'REFUNDED' as const,
      method: 'PIX' as const,
      installments: 1,
      amountCents: primeiro.priceCents as number,
      createdAt: diasAtras(20),
      paidAt: diasAtras(20),
      refundedAt: diasAtras(6),
      mpOrderId: `${PREFIXO}ORD-5`,
      mpPaymentId: `${PREFIXO}PAY-5`,
      mpStatus: 'refunded',
      mpStatusDetail: 'refunded',
      items: [primeiro],
    },
  ];

  for (const pedido of pedidos) {
    const { items, ...dados } = pedido;

    await prisma.order.create({
      data: {
        ...dados,
        userId: user.id,
        items: {
          create: items.map((module) => ({
            moduleId: module.id,
            priceCents: module.priceCents as number,
            titleSnapshot: module.title,
          })),
        },
      },
    });
  }

  // Um acesso de compra, para o recorte de engajamento ter base, e uma
  // cortesia, que precisa aparecer no contador nao monetario e em nenhum
  // numero de dinheiro (decisao 1).
  const seisMeses = new Date();
  seisMeses.setMonth(seisMeses.getMonth() + 6);

  await prisma.moduleAccess.upsert({
    where: { userId_moduleId: { userId: user.id, moduleId: primeiro.id } },
    update: { source: 'PURCHASE', orderId: `${PREFIXO}pago-pix`, expiresAt: seisMeses },
    create: {
      userId: user.id,
      moduleId: primeiro.id,
      source: 'PURCHASE',
      orderId: `${PREFIXO}pago-pix`,
      expiresAt: seisMeses,
    },
  });

  await prisma.moduleAccess.upsert({
    where: { userId_moduleId: { userId: user.id, moduleId: segundo.id } },
    update: { source: 'COURTESY', orderId: null, expiresAt: seisMeses },
    create: {
      userId: user.id,
      moduleId: segundo.id,
      source: 'COURTESY',
      expiresAt: seisMeses,
    },
  });

  console.log(`${pedidos.length} pedidos de teste criados para ${EMAIL}.`);
  console.log('Um acesso de compra e uma cortesia concedidos.');
  console.log('Para remover: npm run spec016:cenario -- --limpar');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
