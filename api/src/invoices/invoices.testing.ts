/**
 * Banco em memoria para a `Invoice`, so para as suites da nota (Spec 023).
 *
 * A nota depende de unicidade (`orderId`, `providerInvoiceId`) e de gravacao
 * condicionada (`emailedAt: null`) — um mock de `jest.fn()` que devolve sempre
 * o mesmo objeto testaria outra coisa. Aqui o filtro e o mesmo que o Prisma
 * aplicaria, no subconjunto que o `InvoicesService` usa.
 */

export interface FakeInvoice {
  id: string;
  orderId: string;
  status: string;
  environment: string;
  amountCents: number;
  providerInvoiceId: string | null;
  number: string | null;
  series: string | null;
  accessKey: string | null;
  protocol: string | null;
  xmlPath: string | null;
  pdfPath: string | null;
  cancelXmlPath: string | null;
  lastError: string | null;
  issuedAt: Date | null;
  cancelledAt: Date | null;
  emailedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface FakeOrder {
  id: string;
  status: string;
  amountCents: number;
  method: string;
  paidAt: Date | null;
  payerDocument: string | null;
  payerName: string | null;
  payerZip: string | null;
  payerStreet: string | null;
  payerNumber: string | null;
  payerComplement: string | null;
  payerDistrict: string | null;
  payerCity: string | null;
  payerCityIbge: string | null;
  payerState: string | null;
  items: { moduleId: string; titleSnapshot: string; priceCents: number }[];
  user: { email: string; name: string | null };
}

type Where = Record<string, unknown>;

function matches(row: Record<string, unknown>, where: Where): boolean {
  return Object.entries(where).every(([key, condition]) => {
    if (key === 'OR') {
      return (condition as Where[]).some((part) => matches(row, part));
    }

    const value = row[key];

    if (condition === null) {
      return value === null || value === undefined;
    }

    if (condition instanceof Date) {
      return value instanceof Date && value.getTime() === condition.getTime();
    }

    if (typeof condition === 'object') {
      const { in: list, lt } = condition as { in?: unknown[]; lt?: Date };

      if (list) {
        return list.includes(value);
      }

      if (lt) {
        return value instanceof Date && value.getTime() < lt.getTime();
      }
    }

    return value === condition;
  });
}

function uniqueError(): Error {
  return Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
}

export function fakeInvoiceDb(orders: FakeOrder[]) {
  const invoices: FakeInvoice[] = [];
  let sequence = 0;

  const assertUnique = (row: FakeInvoice) => {
    for (const other of invoices) {
      if (other.id === row.id) continue;
      if (other.orderId === row.orderId) throw uniqueError();
      if (row.providerInvoiceId && other.providerInvoiceId === row.providerInvoiceId) throw uniqueError();
      if (row.accessKey && other.accessKey === row.accessKey) throw uniqueError();
    }
  };

  const find = (where: Where) => invoices.find((row) => matches(row as never, where));

  const withOrder = (row: FakeInvoice | undefined, include?: { order?: unknown }) => {
    if (!row) return null;

    const copy = { ...row };

    return include?.order
      ? { ...copy, order: { status: orders.find((o) => o.id === row.orderId)?.status } }
      : copy;
  };

  const prisma = {
    invoice: {
      create: jest.fn(async ({ data }: { data: Partial<FakeInvoice> }) => {
        const now = new Date();
        const row = {
          id: `inv-db-${++sequence}`,
          status: 'PENDING',
          providerInvoiceId: null,
          number: null,
          series: null,
          accessKey: null,
          protocol: null,
          xmlPath: null,
          pdfPath: null,
          cancelXmlPath: null,
          lastError: null,
          issuedAt: null,
          cancelledAt: null,
          emailedAt: null,
          createdAt: now,
          updatedAt: now,
          ...(data as Partial<FakeInvoice>),
        } as FakeInvoice;

        assertUnique(row);
        invoices.push(row);

        return { ...row };
      }),
      findUnique: jest.fn(async ({ where, include }: { where: Where; include?: { order?: unknown } }) =>
        withOrder(find(where), include),
      ),
      findMany: jest.fn(async ({ where }: { where: Where }) =>
        invoices.filter((row) => matches(row as never, where)).map((row) => ({ ...row })),
      ),
      update: jest.fn(async ({ where, data }: { where: Where; data: Partial<FakeInvoice> }) => {
        const row = find(where);

        if (!row) throw new Error('Record not found');

        const next = { ...row, ...data, updatedAt: new Date() };

        assertUnique(next);
        Object.assign(row, next);

        return { ...row };
      }),
      updateMany: jest.fn(async ({ where, data }: { where: Where; data: Partial<FakeInvoice> }) => {
        const rows = invoices.filter((row) => matches(row as never, where));

        rows.forEach((row) => Object.assign(row, data, { updatedAt: new Date() }));

        return { count: rows.length };
      }),
    },
    order: {
      findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
        const order = orders.find((o) => o.id === where.id);

        return order
          ? { ...order, invoice: invoices.find((row) => row.orderId === order.id) ?? null }
          : null;
      }),
    },
  };

  /** Envelhece a linha, para o cron a considerar parada. */
  const age = (id: string, ms: number) => {
    const row = invoices.find((invoice) => invoice.id === id) as FakeInvoice;

    row.updatedAt = new Date(row.updatedAt.getTime() - ms);
  };

  return { prisma, invoices, age };
}
