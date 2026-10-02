import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { MercadoPagoConnectionService } from '../src/payments/mercado-pago-connection.service';
import { MERCADO_PAGO_API } from '../src/payments/payments.types';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Backfill do CPF e do nome dos pedidos pagos antes da Spec 023 (decisao A3).
 *
 * Ate a Spec 023 o checkout repassava o CPF ao Mercado Pago sem grava-lo. Este
 * script le `payer.identification` de cada order (`GET /v1/orders/:id`) com o
 * token da conta em que ela nasceu (`mpConnectionId`, Spec 020) e grava
 * `payerDocument` e `payerName`. **O endereco nao existe em lugar nenhum** e
 * nao e preenchido: a nota desses pedidos segue o que o contador definir.
 *
 * O banco e o de producao. Sem `--apply` o script so **lista** o que gravaria;
 * com `--apply`, grava. Rodar so com autorizacao explicita (Task 6.4).
 *
 *   npm run spec023:backfill-cpf            # leitura
 *   npm run spec023:backfill-cpf -- --apply # grava
 *
 * O CPF nunca e impresso inteiro: o log mostra so os dois ultimos digitos.
 */

interface OrderPayer {
  first_name?: string;
  last_name?: string;
  identification?: { type?: string; number?: string };
}

const APPLY = process.argv.includes('--apply');

function masked(cpf: string): string {
  return `***.***.***-${cpf.slice(-2)}`;
}

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const prisma = app.get(PrismaService);
  const connections = app.get(MercadoPagoConnectionService, { strict: false });

  try {
    const orders = await prisma.order.findMany({
      where: {
        status: { in: ['PAID', 'REFUNDED'] },
        payerDocument: null,
        mpOrderId: { not: null },
      },
      select: { id: true, mpOrderId: true, mpConnectionId: true, user: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
    });

    console.log(`${orders.length} pedido(s) pago(s) sem CPF. Modo: ${APPLY ? 'GRAVAR' : 'leitura'}.`);

    let filled = 0;

    for (const order of orders) {
      const token = await connections.accessTokenFor(order.mpConnectionId ?? null);
      const response = await fetch(`${MERCADO_PAGO_API}/orders/${encodeURIComponent(order.mpOrderId as string)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        console.warn(`  ${order.id}: Mercado Pago respondeu ${response.status}; pulado.`);
        continue;
      }

      const payer = ((await response.json()) as { payer?: OrderPayer }).payer;
      const cpf = payer?.identification?.number?.replace(/\D/g, '') ?? '';

      if (payer?.identification?.type !== 'CPF' || cpf.length !== 11) {
        console.warn(`  ${order.id}: order sem CPF do pagador; pulado.`);
        continue;
      }

      const name =
        [payer.first_name, payer.last_name].filter(Boolean).join(' ').trim() || order.user.name || null;

      console.log(`  ${order.id}: CPF ${masked(cpf)}${name ? ', com nome' : ', sem nome'}.`);

      if (APPLY) {
        // Condicionado ao nulo: rodar duas vezes nao sobrescreve o que o
        // checkout ja gravou num pedido novo.
        await prisma.order.updateMany({
          where: { id: order.id, payerDocument: null },
          data: { payerDocument: cpf, payerName: name },
        });
      }

      filled++;
    }

    console.log(`${filled} pedido(s) ${APPLY ? 'gravado(s)' : 'seriam gravados'}.`);
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
