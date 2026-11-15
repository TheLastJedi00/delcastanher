import { Test } from '@nestjs/testing';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from './access.service';
import { BundlesService } from './bundles.service';
import { PromotionsService } from './promotions.service';
import { StoreService } from './store.service';

const ALUNO: AuthUser = {
  uid: 'uid-aluno',
  email: 'aluno@delcastanher.com',
  name: 'Ana',
  role: 'aluno',
};

const EXPIRES = new Date('2027-03-17T12:00:00.000Z');

/** Tres modulos: um comprado, um a venda e um ainda sem preco. */
const MODULES = [
  {
    id: 'mod-1',
    order: 1,
    title: 'Fundamentos',
    summary: 'O basico de RH estrategico',
    priceCents: 19900,
    _count: { lessons: 4 },
  },
  {
    id: 'mod-2',
    order: 2,
    title: 'Pratica',
    summary: 'Casos reais',
    priceCents: 19900,
    _count: { lessons: 5 },
  },
  {
    id: 'mod-3',
    order: 3,
    title: 'Avancado',
    summary: 'Em preparacao',
    priceCents: null,
    _count: { lessons: 0 },
  },
];

/** Black Friday no ar: 30% ate 01/12, 00h00 de Brasilia. */
const BLACK_FRIDAY = {
  id: 'promo-1',
  name: 'Black Friday',
  percentOff: 30,
  startsAt: new Date('2026-11-27T03:00:00Z'),
  endsAt: new Date('2026-12-01T03:00:00Z'),
  endedEarlyAt: null as Date | null,
};

async function build(promotion: typeof BLACK_FRIDAY | null = null) {
  const prisma = { module: { findMany: jest.fn().mockResolvedValue(MODULES) } };
  const bundles = { offer: jest.fn().mockResolvedValue(null) };
  const promotions = { current: jest.fn().mockResolvedValue(promotion) };
  const access = {
    activeMap: jest.fn().mockResolvedValue(new Map([['mod-1', EXPIRES]])),
  };

  const moduleRef = await Test.createTestingModule({
    providers: [
      StoreService,
      { provide: PrismaService, useValue: prisma },
      { provide: AccessService, useValue: access },
      { provide: BundlesService, useValue: bundles },
      { provide: PromotionsService, useValue: promotions },
    ],
  }).compile();

  return { service: moduleRef.get(StoreService), prisma, access, bundles, promotions };
}

describe('StoreService', () => {
  it('lista os modulos na ordem da trilha, com preco e quantidade de aulas', async () => {
    const { service } = await build();

    const catalog = await service.catalog(ALUNO);

    expect(catalog.map((item) => item.order)).toEqual([1, 2, 3]);
    expect(catalog[1]).toMatchObject({
      id: 'mod-2',
      title: 'Pratica',
      priceCents: 19900,
      lessonCount: 5,
    });
  });

  it('marca o que o aluno ja tem, com a data de validade', async () => {
    const { service } = await build();

    const catalog = await service.catalog(ALUNO);

    expect(catalog[0].access).toEqual({ unlocked: true, expiresAt: EXPIRES.toISOString() });
    expect(catalog[1].access).toEqual({ unlocked: false, expiresAt: null });
  });

  // Decisao 1: modulo sem preco aparece como "em breve", sem botao — e a API
  // recusa qualquer pedido que o inclua (suite do `OrdersService`).
  it('marca como nao vendavel o modulo sem preco definido', async () => {
    const { service } = await build();

    const catalog = await service.catalog(ALUNO);

    expect(catalog[2]).toMatchObject({ priceCents: null, purchasable: false });
    expect(catalog[1].purchasable).toBe(true);
  });

  // Modulo ja comprado nao volta a ser vendavel enquanto o acesso esta ativo:
  // e o mesmo 409 que o pedido devolveria, dito antes do clique.
  it('nao oferece de novo o modulo com acesso ativo', async () => {
    const { service } = await build();

    const catalog = await service.catalog(ALUNO);

    expect(catalog[0].purchasable).toBe(false);
  });

  /**
   * A loja e uma vitrine, e vitrine nao vaza estoque: nada de caminho de
   * arquivo no bucket, id de asset do Mux ou dado de outro usuario.
   */
  it('nao expoe caminho de arquivo, id de video nem dado de outro aluno', async () => {
    const { service } = await build();

    const serialized = JSON.stringify(await service.catalog(ALUNO));

    expect(serialized).not.toMatch(/storagePath|muxAssetId|muxPlaybackId|videoStoragePath/);
    expect(serialized).not.toContain('uid-');
  });

  it('consulta o acesso uma unica vez para o catalogo inteiro', async () => {
    const { service, access } = await build();

    await service.catalog(ALUNO);

    expect(access.activeMap).toHaveBeenCalledTimes(1);
  });

  /** Spec 032, decisoes 4 e 7. */
  describe('com campanha de desconto', () => {
    const NOW = new Date('2026-11-28T15:00:00Z');

    it('o catalogo traz o preco com desconto e o cheio', async () => {
      const { service } = await build(BLACK_FRIDAY);

      const catalog = await service.catalog(ALUNO, NOW);

      expect(catalog[1]).toMatchObject({ priceCents: 13930, listPriceCents: 19900 });
      expect(catalog[2]).toMatchObject({ priceCents: null, listPriceCents: null });
    });

    it('a oferta publica traz a campanha com o relogio do servidor, e passa a porcentagem ao pacote', async () => {
      const { service, bundles } = await build(BLACK_FRIDAY);

      const offer = await service.offer(NOW);

      expect(offer.promotion).toEqual({
        name: 'Black Friday',
        percentOff: 30,
        endsAt: '2026-12-01T03:00:00.000Z',
        serverNow: '2026-11-28T15:00:00.000Z',
      });
      expect(bundles.offer).toHaveBeenCalledWith(NOW, 30);
      expect(offer.modules[1]).toEqual({ order: 2, title: 'Pratica', priceCents: 13930, listPriceCents: 19900 });
    });

    it('a campanha encerrada antes da hora anuncia o fim de fato', async () => {
      const ended = { ...BLACK_FRIDAY, endedEarlyAt: new Date('2026-11-29T00:00:00Z') };
      const { service } = await build(ended);

      expect((await service.offer(NOW)).promotion?.endsAt).toBe('2026-11-29T00:00:00.000Z');
    });

    it('sem campanha, o preco cheio e igual ao cobrado e a campanha e nula', async () => {
      const { service, bundles } = await build(null);

      const offer = await service.offer(NOW);
      const catalog = await service.catalog(ALUNO, NOW);

      expect(offer.promotion).toBeNull();
      expect(bundles.offer).toHaveBeenCalledWith(NOW, null);
      expect(offer.modules[1]).toMatchObject({ priceCents: 19900, listPriceCents: 19900 });
      expect(catalog[1]).toMatchObject({ priceCents: 19900, listPriceCents: 19900 });
    });
  });
});
