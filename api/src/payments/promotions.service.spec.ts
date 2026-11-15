import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { PromotionsService } from './promotions.service';

interface Row {
  id: string;
  name: string;
  percentOff: number;
  startsAt: Date;
  endsAt: Date;
  endedEarlyAt: Date | null;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
}

const at = (iso: string) => new Date(iso);

/** "Agora" dos testes: 20/11/2026, 12h UTC. */
const NOW = at('2026-11-20T12:00:00Z');

function row(overrides: Partial<Row> = {}): Row {
  return {
    id: 'promo-1',
    name: 'Black Friday',
    percentOff: 30,
    startsAt: at('2026-11-27T03:00:00Z'),
    endsAt: at('2026-12-01T03:00:00Z'),
    endedEarlyAt: null,
    createdById: 'uid-admin',
    createdAt: at('2026-11-15T12:00:00Z'),
    updatedAt: at('2026-11-15T12:00:00Z'),
    ...overrides,
  };
}

async function build(initial: Row[] = [], totals: unknown[] = []) {
  let rows = [...initial];
  let seq = 0;

  const promotion = {
    findMany: jest.fn(async () => [...rows]),
    findUnique: jest.fn(async ({ where }: { where: { id: string } }) => rows.find((r) => r.id === where.id) ?? null),
    create: jest.fn(async ({ data }: { data: Omit<Row, 'id' | 'createdAt' | 'updatedAt' | 'endedEarlyAt'> }) => {
      const created = row({ ...data, id: `new-${++seq}`, endedEarlyAt: null });
      rows.push(created);

      return created;
    }),
    update: jest.fn(async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
      rows = rows.map((r) => (r.id === where.id ? { ...r, ...data } : r));

      return rows.find((r) => r.id === where.id) as Row;
    }),
    delete: jest.fn(async ({ where }: { where: { id: string } }) => {
      rows = rows.filter((r) => r.id !== where.id);
    }),
  };
  const order = { groupBy: jest.fn(async () => totals) };
  const tx = { promotion, order, $executeRaw: jest.fn(async () => 0) };
  const prisma = {
    ...tx,
    $transaction: jest.fn(async (work: (client: typeof tx) => Promise<unknown>) => work(tx)),
  };

  const moduleRef = await Test.createTestingModule({
    providers: [PromotionsService, { provide: PrismaService, useValue: prisma }],
  }).compile();

  return { service: moduleRef.get(PromotionsService), prisma, rows: () => rows };
}

const INPUT = {
  name: 'Black Friday',
  percentOff: 30,
  startsAt: at('2026-11-27T03:00:00Z'),
  endsAt: at('2026-12-01T03:00:00Z'),
};

/** Spec 032, decisoes 1 e 2. */
describe('PromotionsService', () => {
  describe('current', () => {
    it('devolve a campanha cujo periodo contem agora', async () => {
      const running = row({ id: 'no-ar', startsAt: at('2026-11-20T00:00:00Z'), endsAt: at('2026-11-21T00:00:00Z') });
      const { service } = await build([row(), running]);

      await expect(service.current(NOW)).resolves.toMatchObject({ id: 'no-ar', percentOff: 30 });
    });

    it('sem campanha no periodo, ou encerrada antes da hora, devolve nulo', async () => {
      const ended = row({
        startsAt: at('2026-11-20T00:00:00Z'),
        endsAt: at('2026-11-21T00:00:00Z'),
        endedEarlyAt: at('2026-11-20T11:00:00Z'),
      });
      const { service } = await build([row(), ended]);

      await expect(service.current(NOW)).resolves.toBeNull();
    });
  });

  describe('create', () => {
    it('grava a campanha com quem criou', async () => {
      const { service, rows } = await build();

      const view = await service.create(INPUT, 'uid-admin', NOW);

      expect(view).toMatchObject({ name: 'Black Friday', percentOff: 30, status: 'SCHEDULED' });
      expect(rows()[0]).toMatchObject({ createdById: 'uid-admin', startsAt: INPUT.startsAt });
    });

    it('trava a tabela durante a checagem de sobreposicao', async () => {
      const { service, prisma } = await build();

      await service.create(INPUT, 'uid-admin', NOW);

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.$executeRaw).toHaveBeenCalled();
    });

    it('recusa porcentagem fora de 1 a 90', async () => {
      const { service } = await build();

      for (const percentOff of [0, 91, 12.5]) {
        await expect(service.create({ ...INPUT, percentOff }, 'uid-admin', NOW)).rejects.toBeInstanceOf(
          BadRequestException,
        );
      }
    });

    it('recusa fim igual ou antes do inicio', async () => {
      const { service } = await build();

      await expect(
        service.create({ ...INPUT, endsAt: INPUT.startsAt }, 'uid-admin', NOW),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('recusa inicio mais de 5 minutos no passado', async () => {
      const { service } = await build();

      await expect(
        service.create({ ...INPUT, startsAt: at('2026-11-20T11:54:00Z') }, 'uid-admin', NOW),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('inicio no minuto atual (ate 5 minutos atras) comeca agora', async () => {
      const { service, rows } = await build();

      const view = await service.create({ ...INPUT, startsAt: at('2026-11-20T11:58:00Z') }, 'uid-admin', NOW);

      expect(rows()[0].startsAt).toEqual(NOW);
      expect(view.status).toBe('RUNNING');
    });

    it('responde 409 quando o periodo cruza o de outra campanha', async () => {
      const { service } = await build([row()]);

      await expect(
        service.create(
          { ...INPUT, startsAt: at('2026-11-30T00:00:00Z'), endsAt: at('2026-12-05T00:00:00Z') },
          'uid-admin',
          NOW,
        ),
      ).rejects.toThrow(new ConflictException('Já existe uma campanha nesse período.'));
    });

    it('aceita periodo encostado no de outra campanha', async () => {
      const { service } = await build([row()]);

      await expect(
        service.create(
          { ...INPUT, startsAt: at('2026-12-01T03:00:00Z'), endsAt: at('2026-12-02T03:00:00Z') },
          'uid-admin',
          NOW,
        ),
      ).resolves.toMatchObject({ status: 'SCHEDULED' });
    });
  });

  describe('update', () => {
    it('campanha agendada pode mudar tudo', async () => {
      const { service } = await build([row()]);

      const view = await service.update(
        'promo-1',
        { name: 'Black Week', percentOff: 40, startsAt: at('2026-11-23T03:00:00Z') },
        NOW,
      );

      expect(view).toMatchObject({ name: 'Black Week', percentOff: 40, startsAt: at('2026-11-23T03:00:00Z') });
    });

    it('nao conta a propria campanha como sobreposicao', async () => {
      const { service } = await build([row()]);

      await expect(
        service.update('promo-1', { endsAt: at('2026-12-02T03:00:00Z') }, NOW),
      ).resolves.toMatchObject({ endsAt: at('2026-12-02T03:00:00Z') });
    });

    it('responde 409 ao cruzar com outra campanha', async () => {
      const other = row({ id: 'promo-2', startsAt: at('2026-12-10T03:00:00Z'), endsAt: at('2026-12-12T03:00:00Z') });
      const { service } = await build([row(), other]);

      await expect(
        service.update('promo-1', { endsAt: at('2026-12-11T03:00:00Z') }, NOW),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    describe('campanha no ar', () => {
      const running = () => row({ startsAt: at('2026-11-20T00:00:00Z'), endsAt: at('2026-11-22T00:00:00Z') });

      it('pode mudar o nome e o fim', async () => {
        const { service } = await build([running()]);

        await expect(
          service.update('promo-1', { name: 'Esquenta', endsAt: at('2026-11-23T00:00:00Z') }, NOW),
        ).resolves.toMatchObject({ name: 'Esquenta', endsAt: at('2026-11-23T00:00:00Z'), status: 'RUNNING' });
      });

      it('mandar a mesma porcentagem e o mesmo inicio nao e mudanca', async () => {
        const { service } = await build([running()]);

        await expect(
          service.update(
            'promo-1',
            { percentOff: 30, startsAt: at('2026-11-20T00:00:00Z'), endsAt: at('2026-11-23T00:00:00Z') },
            NOW,
          ),
        ).resolves.toMatchObject({ status: 'RUNNING' });
      });

      it('responde 409 ao mudar a porcentagem ou o inicio', async () => {
        const { service } = await build([running()]);

        await expect(service.update('promo-1', { percentOff: 40 }, NOW)).rejects.toThrow(
          new ConflictException('Com a campanha no ar, só o nome e o fim podem mudar.'),
        );
        await expect(
          service.update('promo-1', { startsAt: at('2026-11-19T00:00:00Z') }, NOW),
        ).rejects.toBeInstanceOf(ConflictException);
      });

      it('recusa fim no passado: para isso existe o encerrar agora', async () => {
        const { service } = await build([running()]);

        await expect(
          service.update('promo-1', { endsAt: at('2026-11-20T11:00:00Z') }, NOW),
        ).rejects.toBeInstanceOf(BadRequestException);
      });
    });

    it('campanha encerrada nao e editavel', async () => {
      const ended = row({ startsAt: at('2026-11-01T00:00:00Z'), endsAt: at('2026-11-02T00:00:00Z') });
      const { service } = await build([ended]);

      await expect(service.update('promo-1', { name: 'Outra' }, NOW)).rejects.toBeInstanceOf(ConflictException);
    });

    it('campanha inexistente responde 404', async () => {
      const { service } = await build();

      await expect(service.update('nada', { name: 'x' }, NOW)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('remove', () => {
    it('apaga campanha agendada', async () => {
      const { service, rows } = await build([row()]);

      await service.remove('promo-1', NOW);

      expect(rows()).toEqual([]);
    });

    it('campanha que ja comecou nao e apagavel', async () => {
      const running = row({ startsAt: at('2026-11-20T00:00:00Z') });
      const { service, rows } = await build([running]);

      await expect(service.remove('promo-1', NOW)).rejects.toBeInstanceOf(ConflictException);
      expect(rows()).toHaveLength(1);
    });
  });

  describe('endNow', () => {
    it('encerra a campanha no ar, gravando o instante', async () => {
      const running = row({ startsAt: at('2026-11-20T00:00:00Z') });
      const { service, rows } = await build([running]);

      const view = await service.endNow('promo-1', NOW);

      expect(rows()[0].endedEarlyAt).toEqual(NOW);
      expect(view.status).toBe('ENDED');
    });

    it('agendada ou ja encerrada responde 409', async () => {
      const ended = row({ id: 'velha', startsAt: at('2026-11-01T00:00:00Z'), endsAt: at('2026-11-02T00:00:00Z') });
      const { service } = await build([row(), ended]);

      await expect(service.endNow('promo-1', NOW)).rejects.toBeInstanceOf(ConflictException);
      await expect(service.endNow('velha', NOW)).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('list', () => {
    it('lista da mais recente para a mais antiga, com estado e totais dos pedidos pagos', async () => {
      const old = row({ id: 'velha', startsAt: at('2026-11-01T00:00:00Z'), endsAt: at('2026-11-02T00:00:00Z') });
      const { service, prisma } = await build(
        [old, row()],
        [{ promotionId: 'velha', _count: { _all: 2 }, _sum: { amountCents: 138460, listAmountCents: 197800 } }],
      );

      const list = await service.list(NOW);

      expect(prisma.order.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({ where: { promotionId: { in: ['promo-1', 'velha'] }, status: 'PAID' } }),
      );
      expect(list.map((item) => [item.id, item.status])).toEqual([
        ['promo-1', 'SCHEDULED'],
        ['velha', 'ENDED'],
      ]);
      expect(list[1].totals).toEqual({ paidOrders: 2, revenueCents: 138460, discountCents: 59340 });
      expect(list[0].totals).toEqual({ paidOrders: 0, revenueCents: 0, discountCents: 0 });
    });
  });
});
