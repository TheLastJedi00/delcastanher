import { Test } from '@nestjs/testing';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { GatewayFeesService, feeOf } from './gateway-fees.service';

const ADMIN: AuthUser = {
  uid: 'uid-admin',
  email: 'admin@delcastanher.com',
  name: 'Admin',
  role: 'admin',
};

/** Vigencia corrente do PIX: 0,99% sem parcela fixa. */
const PIX_ATUAL = {
  id: 'fee-pix-1',
  method: 'PIX' as const,
  percentBasisPoints: 99,
  fixedCents: 0,
  validFrom: new Date('2026-01-01T00:00:00Z'),
  validTo: null,
  createdById: ADMIN.uid,
  createdByEmail: ADMIN.email,
  note: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
};

/** Vigencia corrente do cartao: 4,99% mais R$ 0,40 por transacao. */
const CARTAO_ATUAL = {
  ...PIX_ATUAL,
  id: 'fee-card-1',
  method: 'CREDIT_CARD' as const,
  percentBasisPoints: 499,
  fixedCents: 40,
};

/** Vigencia ja encerrada do cartao: valeu o segundo semestre e fechou. */
const CARTAO_ANTIGA = {
  ...CARTAO_ATUAL,
  id: 'fee-card-0',
  percentBasisPoints: 399,
  validFrom: new Date('2025-07-01T00:00:00Z'),
  validTo: new Date('2026-01-01T00:00:00Z'),
};

function build(rows: unknown[] = [PIX_ATUAL, CARTAO_ATUAL]) {
  const prisma = {
    gatewayFeeRate: {
      findMany: jest.fn().mockResolvedValue(rows),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'fee-nova',
        validTo: null,
        note: null,
        createdAt: new Date(),
        ...data,
      })),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)),
  };

  return Test.createTestingModule({
    providers: [GatewayFeesService, { provide: PrismaService, useValue: prisma }],
  })
    .compile()
    .then((moduleRef) => ({ service: moduleRef.get(GatewayFeesService), prisma }));
}

describe('GatewayFeesService', () => {
  describe('leitura — a vigencia que valia (Task 2.1)', () => {
    it('devolve a vigencia corrente de cada metodo', async () => {
      const { service } = await build();

      const current = await service.current();

      expect(current.PIX?.percentBasisPoints).toBe(99);
      expect(current.CREDIT_CARD?.percentBasisPoints).toBe(499);
    });

    it('devolve nulo para o metodo que ainda nao tem vigencia cadastrada', async () => {
      const { service } = await build([PIX_ATUAL]);

      const current = await service.current();

      expect(current.CREDIT_CARD).toBeNull();
    });

    it('lista o historico da mais recente para a mais antiga', async () => {
      const { service, prisma } = await build([CARTAO_ATUAL, CARTAO_ANTIGA]);

      const history = await service.history();

      expect(history.map((rate) => rate.id)).toEqual(['fee-card-1', 'fee-card-0']);
      expect(prisma.gatewayFeeRate.findMany.mock.calls[0][0].orderBy).toEqual([
        { validFrom: 'desc' },
        { createdAt: 'desc' },
      ]);
    });

    // Decisao 4: `validFrom` inclusivo, `validTo` exclusivo. O instante do
    // corte pertence a vigencia nova, e nao as duas.
    it('resolve a taxa do dia do pagamento, com validFrom inclusivo', async () => {
      const { service } = await build();

      const rate = service.rateAt(
        [CARTAO_ANTIGA, CARTAO_ATUAL],
        'CREDIT_CARD',
        new Date('2026-01-01T00:00:00Z'),
      );

      expect(rate?.id).toBe('fee-card-1');
    });

    it('resolve a taxa antiga para pagamento anterior ao corte, com validTo exclusivo', async () => {
      const { service } = await build();

      const rate = service.rateAt(
        [CARTAO_ANTIGA, CARTAO_ATUAL],
        'CREDIT_CARD',
        new Date('2025-12-31T23:59:59Z'),
      );

      expect(rate?.id).toBe('fee-card-0');
    });

    // Decisao 5: ausencia de dado e uma afirmacao diferente de zero. Um zero
    // aqui produziria um liquido inflado e crivel.
    it('devolve nulo — e nunca uma taxa zerada — quando nenhuma vigencia cobre a data', async () => {
      const { service } = await build();

      const rate = service.rateAt(
        [CARTAO_ANTIGA, CARTAO_ATUAL],
        'CREDIT_CARD',
        new Date('2025-01-01T00:00:00Z'),
      );

      expect(rate).toBeNull();
    });

    it('nao devolve a vigencia de outro metodo', async () => {
      const { service } = await build();

      const rate = service.rateAt([PIX_ATUAL], 'CREDIT_CARD', new Date('2026-06-01T00:00:00Z'));

      expect(rate).toBeNull();
    });
  });

  describe('cadastro — append-only e com autoria (Task 2.2)', () => {
    it('encerra a vigencia anterior do mesmo metodo com o validFrom da nova', async () => {
      const { service, prisma } = await build([PIX_ATUAL]);

      await service.create(ADMIN, {
        method: 'PIX',
        percentBasisPoints: 119,
        fixedCents: 0,
        validFrom: '2026-09-01T00:00:00.000Z',
      });

      const [call] = prisma.gatewayFeeRate.updateMany.mock.calls;

      expect(call[0].where).toMatchObject({ method: 'PIX', validTo: null });
      expect(call[0].data.validTo).toEqual(new Date('2026-09-01T00:00:00.000Z'));
    });

    it('grava a vigencia nova sem tocar em nenhum valor da anterior', async () => {
      const { service, prisma } = await build([PIX_ATUAL]);

      await service.create(ADMIN, {
        method: 'PIX',
        percentBasisPoints: 119,
        fixedCents: 0,
        validFrom: '2026-09-01T00:00:00.000Z',
      });

      expect(Object.keys(prisma.gatewayFeeRate.updateMany.mock.calls[0][0].data)).toEqual([
        'validTo',
      ]);
      expect(prisma.gatewayFeeRate.create).toHaveBeenCalled();
    });

    it('recusa validFrom que cai dentro de uma vigencia ja encerrada', async () => {
      const { service } = await build([CARTAO_ANTIGA, CARTAO_ATUAL]);

      await expect(
        service.create(ADMIN, {
          method: 'CREDIT_CARD',
          percentBasisPoints: 450,
          fixedCents: 40,
          validFrom: '2025-09-01T00:00:00.000Z',
        }),
      ).rejects.toMatchObject({ status: 400 });
    });

    // Vigencias do mesmo metodo nao se sobrepoem, e isso e garantido no
    // cadastro: sem a recusa, a nova fecharia a anterior com um `validTo`
    // anterior ao proprio `validFrom` dela.
    it('recusa validFrom anterior ao inicio da vigencia corrente', async () => {
      const { service } = await build([PIX_ATUAL]);

      await expect(
        service.create(ADMIN, {
          method: 'PIX',
          percentBasisPoints: 119,
          fixedCents: 0,
          validFrom: '2025-06-01T00:00:00.000Z',
        }),
      ).rejects.toMatchObject({ status: 400 });
    });

    it('nao interfere no outro metodo', async () => {
      const { service, prisma } = await build([PIX_ATUAL, CARTAO_ATUAL]);

      await service.create(ADMIN, {
        method: 'PIX',
        percentBasisPoints: 119,
        fixedCents: 0,
        validFrom: '2026-09-01T00:00:00.000Z',
      });

      expect(prisma.gatewayFeeRate.updateMany.mock.calls[0][0].where.method).toBe('PIX');
    });

    // Decisao 7: a autoria e do token. Autoria que o cliente declara nao e
    // autoria.
    it('grava o autor a partir do usuario autenticado', async () => {
      const { service, prisma } = await build([]);

      await service.create(ADMIN, {
        method: 'PIX',
        percentBasisPoints: 119,
        fixedCents: 0,
        validFrom: '2026-09-01T00:00:00.000Z',
      });

      expect(prisma.gatewayFeeRate.create.mock.calls[0][0].data).toMatchObject({
        createdById: ADMIN.uid,
        createdByEmail: ADMIN.email,
      });
    });

    it('nao expoe nenhuma operacao de edicao ou remocao', async () => {
      const { service } = await build();
      const api = service as unknown as Record<string, unknown>;

      expect(api.update).toBeUndefined();
      expect(api.remove).toBeUndefined();
      expect(api.delete).toBeUndefined();
    });
  });

  describe('calculo — por pedido, meio para cima (Task 2.3)', () => {
    it('aplica percentual mais parcela fixa', () => {
      // 19900 x 4,99% = 993,01 -> 993, mais 40 de parcela fixa.
      expect(feeOf(19900, { percentBasisPoints: 499, fixedCents: 40 })).toBe(1033);
    });

    it('arredonda meio para cima', () => {
      // 100 x 0,5% = 0,5 exato: o meio sobe.
      expect(feeOf(100, { percentBasisPoints: 50, fixedCents: 0 })).toBe(1);
    });

    it('nao cobra fixo quando a vigencia nao tem parcela fixa', () => {
      expect(feeOf(19900, { percentBasisPoints: 99, fixedCents: 0 })).toBe(197);
    });

    /**
     * A prova de que a ordem importa. Tres pedidos de 19900 com a mesma taxa:
     * somar as taxas por linha nao da o mesmo que aplicar o percentual sobre o
     * total do periodo — e e a soma por linha que a primeira conferencia
     * manual encontra.
     */
    it('soma taxa por pedido, e nao percentual sobre o total do periodo', () => {
      const rate = { percentBasisPoints: 499, fixedCents: 40 };
      const porPedido = [19900, 19900, 19900].reduce(
        (total, amount) => total + feeOf(amount, rate),
        0,
      );
      const sobreOTotal = feeOf(19900 * 3, rate);

      expect(porPedido).toBe(3099);
      expect(sobreOTotal).toBe(3019);
      expect(porPedido).not.toBe(sobreOTotal);
    });
  });
});
