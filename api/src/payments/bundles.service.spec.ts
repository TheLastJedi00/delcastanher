import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { BundlesService, TierRow, occupiesSeat, occupiedWhere, pickTier } from './bundles.service';

const NOW = new Date('2026-09-25T12:00:00.000Z');
const LATER = new Date(NOW.getTime() + 10 * 60 * 1000);
const EARLIER = new Date(NOW.getTime() - 10 * 60 * 1000);

/** Os quatro lotes da Spec 019, fora de ordem de proposito. */
const TIERS: TierRow[] = [
  { id: 't3', order: 3, name: '3º Lote', priceCents: 99700, capacity: 50 },
  { id: 't1', order: 1, name: 'Lote Fundador', priceCents: 59000, capacity: 20 },
  { id: 't4', order: 4, name: 'Preço oficial', priceCents: 149700, capacity: null },
  { id: 't2', order: 2, name: '2º Lote', priceCents: 79700, capacity: 30 },
];

describe('Lote vigente (Spec 019, decisao 3)', () => {
  describe('occupiesSeat — o que ocupa uma vaga', () => {
    it('pago e estornado ocupam: o lote que virou nao volta', () => {
      expect(occupiesSeat({ status: 'PAID', expiresAt: null }, NOW)).toBe(true);
      expect(occupiesSeat({ status: 'REFUNDED', expiresAt: null }, NOW)).toBe(true);
    });

    it('pendente no prazo reserva a vaga; vencido nao', () => {
      expect(occupiesSeat({ status: 'PENDING', expiresAt: LATER }, NOW)).toBe(true);
      expect(occupiesSeat({ status: 'PENDING', expiresAt: EARLIER }, NOW)).toBe(false);
    });

    it('pendente ainda sem prazo (cartao em processamento) reserva a vaga', () => {
      expect(occupiesSeat({ status: 'PENDING', expiresAt: null }, NOW)).toBe(true);
    });

    it('cancelado, expirado e recusado liberam a vaga', () => {
      for (const status of ['CANCELLED', 'EXPIRED', 'REJECTED'] as const) {
        expect(occupiesSeat({ status, expiresAt: LATER }, NOW)).toBe(false);
      }
    });
  });

  describe('pickTier', () => {
    it('sem vendas, e o Fundador', () => {
      expect(pickTier(TIERS, new Map())?.id).toBe('t1');
    });

    it('com as 20 vagas do Fundador ocupadas, e o 2º Lote', () => {
      expect(pickTier(TIERS, new Map([['t1', 20]]))?.id).toBe('t2');
    });

    it('com 19 ocupadas, ainda e o Fundador', () => {
      expect(pickTier(TIERS, new Map([['t1', 19]]))?.id).toBe('t1');
    });

    it('pula os lotes esgotados, na ordem', () => {
      expect(pickTier(TIERS, new Map([['t1', 20], ['t2', 30], ['t3', 50]]))?.id).toBe('t4');
    });

    it('o ultimo lote sem capacidade nunca esgota', () => {
      const occupied = new Map([['t1', 20], ['t2', 30], ['t3', 50], ['t4', 100_000]]);

      expect(pickTier(TIERS, occupied)?.id).toBe('t4');
    });

    it('sem lote com vaga, nao ha vigente', () => {
      const closed = TIERS.map((tier) => ({ ...tier, capacity: tier.capacity ?? 10 }));

      expect(pickTier(closed, new Map([['t1', 20], ['t2', 30], ['t3', 50], ['t4', 10]]))).toBeNull();
    });
  });

  describe('occupiedWhere — a mesma regra, como consulta', () => {
    it('filtra os lotes pedidos e os estados que ocupam vaga', () => {
      expect(occupiedWhere(['t1', 't2'], NOW)).toEqual({
        bundleTierId: { in: ['t1', 't2'] },
        OR: [
          { status: { in: ['PAID', 'REFUNDED'] } },
          { status: 'PENDING', OR: [{ expiresAt: null }, { expiresAt: { gt: NOW } }] },
        ],
      });
    });
  });

  describe('BundlesService.occupied', () => {
    it('conta as vagas de todos os lotes em uma consulta agregada', async () => {
      const groupBy = jest.fn().mockResolvedValue([
        { bundleTierId: 't1', _count: { _all: 20 } },
        { bundleTierId: 't2', _count: { _all: 3 } },
      ]);
      const moduleRef = await Test.createTestingModule({
        providers: [BundlesService, { provide: PrismaService, useValue: { order: { groupBy } } }],
      }).compile();

      const occupied = await moduleRef.get(BundlesService).occupied(['t1', 't2', 't3'], NOW);

      expect(groupBy).toHaveBeenCalledTimes(1);
      expect(groupBy).toHaveBeenCalledWith({
        by: ['bundleTierId'],
        where: occupiedWhere(['t1', 't2', 't3'], NOW),
        _count: { _all: true },
      });
      expect(occupied.get('t1')).toBe(20);
      expect(occupied.get('t2')).toBe(3);
      expect(occupied.get('t3') ?? 0).toBe(0);
    });
  });
});
