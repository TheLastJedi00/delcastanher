import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from './access.service';

/**
 * Relogio fixo para toda a suite: acesso e uma conta de datas, e teste de data
 * que depende do instante da execucao falha sozinho em algum dia do mes.
 */
const NOW = new Date('2026-09-17T12:00:00.000Z');

const USER = 'uid-aluno';
const MODULE = 'mod-1';

function access(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'acc-1',
    userId: USER,
    moduleId: MODULE,
    grantedAt: NOW,
    expiresAt: new Date('2027-03-17T12:00:00.000Z'),
    source: 'PURCHASE',
    orderId: 'ord-1',
    ...overrides,
  };
}

async function build(moduleAccess: Record<string, jest.Mock> = {}) {
  const doubles = {
    findUnique: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
    upsert: jest.fn(async ({ create, update }) => ({ ...access(), ...create, ...update })),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    ...moduleAccess,
  };

  const moduleRef = await Test.createTestingModule({
    providers: [AccessService, { provide: PrismaService, useValue: { moduleAccess: doubles } }],
  }).compile();

  return { service: moduleRef.get(AccessService), ...doubles };
}

describe('AccessService', () => {
  beforeAll(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick'] }).setSystemTime(NOW);
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  describe('hasActive', () => {
    it('reconhece o acesso com expiresAt no futuro', async () => {
      const { service } = await build({
        findUnique: jest.fn().mockResolvedValue(access()),
      });

      await expect(service.hasActive(USER, MODULE)).resolves.toBe(true);
    });

    // Decisao 4: acesso expirado nao e "meio acesso" — para o portao do
    // conteudo ele e indistinguivel de nunca ter existido.
    it('trata acesso expirado como ausente', async () => {
      const { service } = await build({
        findUnique: jest
          .fn()
          .mockResolvedValue(access({ expiresAt: new Date('2026-09-16T12:00:00.000Z') })),
      });

      await expect(service.hasActive(USER, MODULE)).resolves.toBe(false);
    });

    it('trata linha inexistente como ausente', async () => {
      const { service } = await build();

      await expect(service.hasActive(USER, MODULE)).resolves.toBe(false);
    });
  });

  describe('activeMap', () => {
    // Decisao 4 e task 1.5: uma consulta por requisicao, nunca uma por modulo —
    // e a trilha inteira le acesso a partir deste mapa.
    it('devolve os acessos ativos do usuario em uma unica consulta', async () => {
      const { service, findMany } = await build({
        findMany: jest
          .fn()
          .mockResolvedValue([access(), access({ moduleId: 'mod-2', id: 'acc-2' })]),
      });

      const map = await service.activeMap(USER);

      expect(findMany).toHaveBeenCalledTimes(1);
      expect(findMany.mock.calls[0][0].where).toEqual({
        userId: USER,
        expiresAt: { gt: NOW },
      });
      expect([...map.keys()]).toEqual(['mod-1', 'mod-2']);
    });
  });

  describe('grant', () => {
    // Decisao 5: seis meses de calendario, e nao 180 dias — e o que a oferta
    // promete e o que o aluno confere no calendario.
    it('concede seis meses de calendario a partir de agora quando nao ha acesso', async () => {
      const { service, upsert } = await build();

      await service.grant({ userId: USER, moduleId: MODULE, source: 'PURCHASE', orderId: 'ord-1' });

      expect(upsert.mock.calls[0][0].create.expiresAt).toEqual(
        new Date('2027-03-17T12:00:00.000Z'),
      );
    });

    // Decisao 5: recomprar um modulo ainda ativo soma ao que resta. Zerar para
    // "agora + 6" encurtaria o acesso de quem comprou de novo mais cedo.
    it('soma seis meses ao que resta quando o acesso ainda esta ativo', async () => {
      const { service, upsert } = await build({
        findUnique: jest
          .fn()
          .mockResolvedValue(access({ expiresAt: new Date('2026-12-17T12:00:00.000Z') })),
      });

      await service.grant({ userId: USER, moduleId: MODULE, source: 'PURCHASE', orderId: 'ord-2' });

      expect(upsert.mock.calls[0][0].update.expiresAt).toEqual(
        new Date('2027-06-17T12:00:00.000Z'),
      );
    });

    // Decisao 5: expirado, o periodo novo comeca agora. Somar sobre a data
    // vencida devolveria um acesso que ja nasce no passado.
    it('recomeca de agora quando o acesso anterior ja expirou', async () => {
      const { service, upsert } = await build({
        findUnique: jest
          .fn()
          .mockResolvedValue(access({ expiresAt: new Date('2026-01-10T12:00:00.000Z') })),
      });

      await service.grant({ userId: USER, moduleId: MODULE, source: 'PURCHASE', orderId: 'ord-3' });

      expect(upsert.mock.calls[0][0].update.expiresAt).toEqual(
        new Date('2027-03-17T12:00:00.000Z'),
      );
    });

    // Decisao 13: webhook e reconsulta podem chegar juntos, e o Mercado Pago
    // reentrega notificacao. Reprocessar o mesmo pedido nao pode somar 6 meses
    // a cada passagem.
    it('e idempotente para o mesmo pedido: nao estende duas vezes', async () => {
      const existing = access({ orderId: 'ord-1' });
      const { service, upsert } = await build({
        findUnique: jest.fn().mockResolvedValue(existing),
      });

      const result = await service.grant({
        userId: USER,
        moduleId: MODULE,
        source: 'PURCHASE',
        orderId: 'ord-1',
      });

      expect(upsert).not.toHaveBeenCalled();
      expect(result).toBe(existing);
    });

    // Decisao 20: cortesia e migracao usam o mesmo caminho da compra, porque
    // acesso ativo e uma pergunta so, seja qual for a origem.
    it('grava a origem do acesso, para cortesia e legado nao virarem compra', async () => {
      const { service, upsert } = await build();

      await service.grant({ userId: USER, moduleId: MODULE, source: 'COURTESY' });

      expect(upsert.mock.calls[0][0].create.source).toBe('COURTESY');
      expect(upsert.mock.calls[0][0].create.orderId).toBeNull();
    });

    // O dia 31 nao existe em todo mes: sem o ajuste, "31/08 + 6 meses" viraria
    // 03/03 por transbordo do mes, dando dois dias a mais de acesso.
    it('ajusta o dia quando o mes de destino e mais curto', async () => {
      jest.setSystemTime(new Date('2026-08-31T12:00:00.000Z'));

      const { service, upsert } = await build();

      await service.grant({ userId: USER, moduleId: MODULE, source: 'PURCHASE', orderId: 'ord-4' });

      expect(upsert.mock.calls[0][0].create.expiresAt).toEqual(
        new Date('2027-02-28T12:00:00.000Z'),
      );

      jest.setSystemTime(NOW);
    });
  });

  describe('revokeByOrder', () => {
    // Decisao 22: dinheiro devolvido nao pode deixar o conteudo liberado.
    it('remove apenas os acessos concedidos pelo pedido estornado', async () => {
      const { service, deleteMany } = await build({
        deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
      });

      await expect(service.revokeByOrder('ord-1')).resolves.toBe(2);
      expect(deleteMany).toHaveBeenCalledWith({ where: { orderId: 'ord-1' } });
    });
  });
});

/**
 * Task 2.1: o portao propriamente dito. `requireFor*` e o que as rotas de
 * conteudo chamam — a UI trancada e consequencia disto, e nao a protecao
 * (decisao 17).
 */
describe('AccessService (portao do conteudo)', () => {
  beforeAll(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick'] }).setSystemTime(NOW);
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  async function buildWithLesson(
    moduleAccessRow: unknown,
    lessonRow: unknown = { id: 'les-1', moduleId: MODULE },
  ) {
    const findUnique = jest.fn().mockResolvedValue(moduleAccessRow);
    const lessonFindUnique = jest.fn().mockResolvedValue(lessonRow);

    const moduleRef = await Test.createTestingModule({
      providers: [
        AccessService,
        {
          provide: PrismaService,
          useValue: {
            moduleAccess: { findUnique, findMany: jest.fn().mockResolvedValue([]) },
            lesson: { findUnique: lessonFindUnique },
          },
        },
      ],
    }).compile();

    return { service: moduleRef.get(AccessService), findUnique, lessonFindUnique };
  }

  it('deixa passar a aula de um modulo com acesso ativo', async () => {
    const { service } = await buildWithLesson(access());

    await expect(service.requireForLesson(USER, 'les-1')).resolves.toBeUndefined();
  });

  it('recusa a aula de um modulo sem acesso', async () => {
    const { service } = await buildWithLesson(null);

    await expect(service.requireForLesson(USER, 'les-1')).rejects.toMatchObject({ status: 403 });
  });

  // Decisao 5: vencido tranca o conteudo. O progresso e o certificado ja
  // emitido continuam no lugar — quem recusa e o portao, nao o apagador.
  it('recusa a aula de um modulo com acesso expirado', async () => {
    const { service } = await buildWithLesson(
      access({ expiresAt: new Date('2026-09-16T12:00:00.000Z') }),
    );

    await expect(service.requireForLesson(USER, 'les-1')).rejects.toMatchObject({ status: 403 });
  });

  // Aula inexistente nao eproblema do portao: quem responde 404 e o servico de
  // conteudo, e trocar esse 404 por 403 esconderia um erro de rota atras de
  // uma mensagem de permissao.
  it('nao opina sobre aula inexistente, deixando o 404 para quem sabe dele', async () => {
    const { service, findUnique } = await buildWithLesson(null, null);

    await expect(service.requireForLesson(USER, 'les-inexistente')).resolves.toBeUndefined();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('recusa o modulo sem acesso ativo', async () => {
    const { service } = await buildWithLesson(null);

    await expect(service.requireForModule(USER, MODULE)).rejects.toMatchObject({ status: 403 });
  });
});
