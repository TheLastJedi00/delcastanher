import { INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthService } from '../auth/auth.service';
import { AuthUser, Role } from '../auth/auth.types';
import { AuthenticatedRequest, FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { PrismaService } from '../prisma/prisma.service';
import { AdminBundlesController } from './admin-bundles.controller';
import { BundlesService } from './bundles.service';

const NOW = new Date('2026-09-25T12:00:00.000Z');

/** Pacote com os quatro lotes da Spec 019. */
function bundleRow() {
  return {
    id: 'b1',
    slug: 'imersao-rh-lancamento',
    title: 'Pacote de Lançamento — Imersão RH Estratégico',
    active: true,
    tiers: [
      { id: 't1', order: 1, name: 'Lote Fundador', priceCents: 59000, capacity: 20 },
      { id: 't2', order: 2, name: '2º Lote', priceCents: 79700, capacity: 30 },
      { id: 't3', order: 3, name: '3º Lote', priceCents: 99700, capacity: 50 },
      { id: 't4', order: 4, name: 'Preço oficial', priceCents: 149700, capacity: null },
    ],
  };
}

/**
 * Double de Prisma com as vagas ocupadas por lote. O `$transaction` so executa:
 * o isolamento de verdade e do teste de concorrencia contra o banco.
 */
function prismaWith(occupied: Record<string, number> = { t1: 12 }) {
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    bundle: { findUnique: jest.fn().mockResolvedValue(bundleRow()) },
    bundleTier: {
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: object }) => ({
        ...bundleRow().tiers.find((tier) => tier.id === where.id),
        ...data,
      })),
    },
    order: {
      groupBy: jest.fn().mockResolvedValue(
        Object.entries(occupied).map(([bundleTierId, count]) => ({ bundleTierId, _count: { _all: count } })),
      ),
    },
  };

  return { ...tx, $transaction: jest.fn(async (fn: (client: unknown) => unknown) => fn(tx)), tx };
}

async function buildApp(role: Role | null = 'admin', prisma = prismaWith()) {
  const moduleRef = await Test.createTestingModule({
    controllers: [AdminBundlesController],
    providers: [
      Reflector,
      RolesGuard,
      BundlesService,
      { provide: PrismaService, useValue: prisma },
      { provide: AuthService, useValue: { verify: jest.fn() } },
    ],
  })
    .overrideGuard(FirebaseAuthGuard)
    .useValue({
      canActivate: (context: { switchToHttp: () => { getRequest: () => AuthenticatedRequest } }) => {
        if (!role) {
          throw new UnauthorizedException();
        }

        const user: AuthUser = { uid: 'uid-1', email: 'admin@delcastanher.com', name: 'Admin', role };
        context.switchToHttp().getRequest().user = user;

        return true;
      },
    })
    .compile();

  const app = moduleRef.createNestApplication();

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, stopAtFirstError: true }),
  );
  await app.init();

  return { app, prisma };
}

const BASE = '/admin/bundles/imersao-rh-lancamento';

/** Spec 019, decisoes 3 e 13; Spec 027, decisao 4. */
describe('Admin — pacote e lotes (HTTP)', () => {
  let app: INestApplication;

  beforeAll(() => jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate'] }));
  afterAll(() => jest.useRealTimers());
  afterEach(async () => {
    await app?.close();
  });

  describe('autorizacao', () => {
    it('recusa sem sessao e com papel aluno, nas duas rotas', async () => {
      ({ app } = await buildApp(null));
      await request(app.getHttpServer()).get(BASE).expect(401);
      await request(app.getHttpServer()).patch(`${BASE}/tiers/t1`).send({ priceCents: 98900 }).expect(401);
      await app.close();

      ({ app } = await buildApp('aluno'));
      await request(app.getHttpServer()).get(BASE).expect(403);
      await request(app.getHttpServer()).patch(`${BASE}/tiers/t1`).send({ priceCents: 98900 }).expect(403);
    });
  });

  describe('GET /admin/bundles/:slug', () => {
    it('lista os lotes com vagas ocupadas e o vigente marcado', async () => {
      ({ app } = await buildApp('admin', prismaWith({ t1: 20, t2: 4 })));

      const response = await request(app.getHttpServer()).get(BASE).expect(200);

      expect(response.body.tiers.map((tier: { occupied: number }) => tier.occupied)).toEqual([20, 4, 0, 0]);
      expect(response.body.tiers.map((tier: { current: boolean }) => tier.current)).toEqual([
        false,
        true,
        false,
        false,
      ]);
    });
  });

  describe('PATCH /admin/bundles/:slug/tiers/:tierId', () => {
    it('altera o preco do ultimo lote, com o pacote travado', async () => {
      const prisma = prismaWith();
      ({ app } = await buildApp('admin', prisma));

      await request(app.getHttpServer()).patch(`${BASE}/tiers/t4`).send({ priceCents: 98900 }).expect(200);

      expect(prisma.tx.bundleTier.update).toHaveBeenCalledWith({
        where: { id: 't4' },
        data: { priceCents: 98900 },
      });
      expect(prisma.tx.$queryRaw).toHaveBeenCalled();
    });

    // Spec 027, decisao 4: so o ultimo lote vende; os outros sao historico.
    it('recusa editar lote encerrado', async () => {
      const prisma = prismaWith();
      ({ app } = await buildApp('admin', prisma));

      const response = await request(app.getHttpServer())
        .patch(`${BASE}/tiers/t1`)
        .send({ priceCents: 64000 })
        .expect(400);

      expect(response.body.message).toBe('Este lote foi encerrado e não pode ser editado.');
      expect(prisma.tx.bundleTier.update).not.toHaveBeenCalled();
    });

    // Spec 027, decisao 4: vagas recriariam a escassez e, esgotadas, tirariam o pacote da loja.
    it('vagas nao sao mais editaveis, nem no ultimo lote', async () => {
      ({ app } = await buildApp());

      for (const capacity of [25, null]) {
        await request(app.getHttpServer()).patch(`${BASE}/tiers/t4`).send({ capacity }).expect(400);
      }
    });

    it('recusa preco nulo, zero ou negativo', async () => {
      ({ app } = await buildApp());

      for (const priceCents of [null, 0, -100]) {
        await request(app.getHttpServer()).patch(`${BASE}/tiers/t4`).send({ priceCents }).expect(400);
      }
    });

    it('nome e ordem nao sao editaveis', async () => {
      ({ app } = await buildApp());

      await request(app.getHttpServer()).patch(`${BASE}/tiers/t4`).send({ name: 'Outro' }).expect(400);
      await request(app.getHttpServer()).patch(`${BASE}/tiers/t4`).send({ order: 9 }).expect(400);
    });

    it('lote de outro pacote e 404', async () => {
      ({ app } = await buildApp());

      await request(app.getHttpServer()).patch(`${BASE}/tiers/t-outro`).send({ priceCents: 98900 }).expect(404);
    });
  });
});
