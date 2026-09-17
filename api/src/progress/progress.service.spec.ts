import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AccessService } from '../payments/access.service';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { ProgressService } from './progress.service';
/**
 * Portao de acesso aberto (Spec 014, decisao 17). Esta suite cobre o que ja
 * existia antes do paywall, entao aqui o acesso nunca pode ser o motivo da
 * falha — o portao tem suite propria (`access.service.spec.ts` e os
 * `*.access.*.spec.ts`).
 */
const ACESSO_A_TUDO = {
  get: () => new Date('2099-01-01T00:00:00.000Z'),
  has: () => true,
  keys: () => ['mod-1'][Symbol.iterator](),
} as unknown as Map<string, Date>;

function acessoLiberado() {
  return {
    requireForLesson: jest.fn().mockResolvedValue(undefined),
    requireForModule: jest.fn().mockResolvedValue(undefined),
    hasActive: jest.fn().mockResolvedValue(true),
    activeMap: jest.fn().mockResolvedValue(ACESSO_A_TUDO),
  };
}


const USER: AuthUser = {
  uid: 'uid-123',
  email: 'aluno@delcastanher.com',
  name: 'Aluno Teste',
  role: 'aluno',
};

/**
 * Curso de teste desde a Spec 012: o modulo e container, e o conteudo vive na
 * aula. O modulo 1 tem tres aulas (uma pronta, uma processando, uma sem
 * video), o 2 tem uma, e o 3 nao tem nenhuma — o caso do modulo recem-criado
 * no painel, que existe mas ainda nao entrega conteudo.
 */
const COURSE = {
  id: 'course-1',
  slug: 'imersao-rh',
  title: 'Imersão RH Estratégico',
  workloadHours: null,
  modules: [
    {
      id: 'm1',
      order: 1,
      title: 'Fundamentos',
      summary: 'Resumo 1',
      lessons: [
        {
          id: 'l1',
          order: 1,
          title: 'O papel do RH',
          summary: 'Aula 1',
          videoStoragePath: 'lessons/l1/video/aula.mp4',
          videoStatus: 'READY',
          durationSeconds: 754,
        },
        {
          id: 'l2',
          order: 2,
          title: 'Maturidade de RH',
          summary: 'Aula 2',
          videoStoragePath: 'lessons/l2/video/aula.mp4',
          videoStatus: 'PROCESSING',
          durationSeconds: null,
        },
        {
          id: 'l3',
          order: 3,
          title: 'Conexao com a estrategia',
          summary: 'Aula 3',
          videoStoragePath: null,
          videoStatus: null,
          durationSeconds: null,
        },
      ],
    },
    {
      id: 'm2',
      order: 2,
      title: 'Diagnóstico',
      summary: 'Resumo 2',
      lessons: [
        {
          id: 'l4',
          order: 1,
          title: 'Mapeamento de processos',
          summary: 'Aula 4',
          videoStoragePath: 'lessons/l4/video/aula.mp4',
          videoStatus: 'READY',
          durationSeconds: 300,
        },
      ],
    },
    { id: 'm3', order: 3, title: 'Recrutamento', summary: 'Resumo 3', lessons: [] },
  ],
};

interface PrismaMocks {
  findCourse: jest.Mock;
  findProgress: jest.Mock;
  findLesson: jest.Mock;
  upsertProgress: jest.Mock;
  deleteProgress: jest.Mock;
  findOrCreateUser: jest.Mock;
}

/** Concluidas passadas por id de aula, no formato devolvido pelo Prisma. */
async function build(completed: string[] = [], overrides: Partial<PrismaMocks> = {}) {
  const mocks: PrismaMocks = {
    findCourse: jest.fn().mockResolvedValue(COURSE),
    findProgress: jest.fn().mockResolvedValue(completed.map((lessonId) => ({ lessonId }))),
    findLesson: jest.fn().mockResolvedValue({ id: 'l1', moduleId: 'm1' }),
    upsertProgress: jest.fn().mockResolvedValue({}),
    deleteProgress: jest.fn().mockResolvedValue({ count: 1 }),
    findOrCreateUser: jest.fn().mockResolvedValue({ id: USER.uid }),
    ...overrides,
  };

  const moduleRef = await Test.createTestingModule({
    providers: [
      { provide: AccessService, useValue: acessoLiberado() },
      ProgressService,
      {
        provide: PrismaService,
        useValue: {
          course: { findUnique: mocks.findCourse },
          lesson: { findUnique: mocks.findLesson },
          lessonProgress: {
            findMany: mocks.findProgress,
            upsert: mocks.upsertProgress,
            deleteMany: mocks.deleteProgress,
          },
        },
      },
      { provide: UsersService, useValue: { findOrCreate: mocks.findOrCreateUser } },
    ],
  }).compile();

  return { service: moduleRef.get(ProgressService), mocks };
}

describe('ProgressService', () => {
  describe('findForUser', () => {
    it('devolve as aulas de cada modulo em ordem', async () => {
      const { service } = await build();

      const progress = await service.findForUser(USER);

      expect(progress.modules.map((module) => module.lessons.map((lesson) => lesson.order))).toEqual(
        [[1, 2, 3], [1], []],
      );
    });

    it('diz se a aula tem video e se ele ja esta reproduzivel', async () => {
      const { service } = await build();

      const progress = await service.findForUser(USER);

      // Os tres casos sao distintos: sem video, em processamento e pronto —
      // abrir o player nos dois primeiros mostraria ao aluno um erro que nao e
      // dele. Desde a Spec 012 o dono dessa informacao e a aula, nao o modulo.
      expect(progress.modules[0].lessons.map((l) => [l.hasVideo, l.videoReady])).toEqual([
        [true, true],
        [true, false],
        [false, false],
      ]);
    });

    it('expoe a duracao vinda do Mux, e nula quando ainda nao processou', async () => {
      const { service } = await build();

      const progress = await service.findForUser(USER);

      expect(progress.modules[0].lessons.map((l) => l.durationSeconds)).toEqual([754, null, null]);
    });

    it('marca as aulas concluidas do aluno', async () => {
      const { service } = await build(['l1', 'l4']);

      const progress = await service.findForUser(USER);

      expect(progress.modules[0].lessons.map((l) => l.completed)).toEqual([true, false, false]);
      expect(progress.modules[1].lessons.map((l) => l.completed)).toEqual([true]);
    });

    it('so considera o progresso do proprio aluno', async () => {
      const { service, mocks } = await build();

      await service.findForUser(USER);

      expect(mocks.findProgress).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ userId: 'uid-123' }) }),
      );
    });

    it('conclui o modulo somente quando todas as suas aulas estao concluidas', async () => {
      const { service } = await build(['l1', 'l2', 'l4']);

      const progress = await service.findForUser(USER);

      // O modulo 1 tem tres aulas e duas concluidas: ele nao esta concluido,
      // por mais que o aluno tenha assistido a maior parte. "Modulo concluido"
      // e derivado, nao um registro proprio (decisao 5).
      expect(progress.modules.map((m) => m.completed)).toEqual([false, true, false]);
    });

    it('conta as aulas concluidas por modulo, para a tela nao refazer a soma', async () => {
      const { service } = await build(['l1', 'l2']);

      const progress = await service.findForUser(USER);

      expect(progress.modules.map((m) => [m.completedCount, m.totalCount])).toEqual([
        [2, 3],
        [0, 1],
        [0, 0],
      ]);
    });

    it('modulo sem aula nenhuma nao conta como concluido', async () => {
      const { service } = await build(['l1', 'l2', 'l3', 'l4']);

      const progress = await service.findForUser(USER);

      // Modulo vazio nao tem o que concluir: dizer que ele esta concluido
      // liberaria um diploma de modulo sem nenhuma aula assistida (decisao 13).
      expect(progress.modules[2]).toMatchObject({ completed: false, totalCount: 0 });
    });

    it('o percentual conta aulas, nao modulos', async () => {
      const { service } = await build(['l1']);

      const progress = await service.findForUser(USER);

      // Quatro aulas no curso, uma concluida.
      expect(progress).toMatchObject({ completedCount: 1, totalCount: 4, percentage: 25 });
    });

    it('aponta a primeira aula em aberto como proxima, mesmo com conclusao fora de ordem', async () => {
      const { service } = await build(['l1', 'l3']);

      const progress = await service.findForUser(USER);

      expect(progress.nextLesson).toMatchObject({ id: 'l2', order: 2 });
      expect(progress.nextModule).toMatchObject({ id: 'm1' });
      expect(progress.completed).toBe(false);
    });

    it('a proxima aula pode estar em outro modulo', async () => {
      const { service } = await build(['l1', 'l2', 'l3']);

      const progress = await service.findForUser(USER);

      expect(progress.nextModule).toMatchObject({ id: 'm2' });
      expect(progress.nextLesson).toMatchObject({ id: 'l4' });
    });

    it('cada modulo aponta a propria proxima aula, para a trilha horizontal', async () => {
      const { service } = await build(['l1']);

      const progress = await service.findForUser(USER);

      expect(progress.modules[0].nextLesson).toMatchObject({ id: 'l2' });
      expect(progress.modules[1].nextLesson).toMatchObject({ id: 'l4' });
      expect(progress.modules[2].nextLesson).toBeNull();
    });

    it('sem nenhuma aula concluida, a proxima e a primeira da trilha', async () => {
      const { service } = await build();

      await expect(service.findForUser(USER)).resolves.toMatchObject({
        percentage: 0,
        nextModule: expect.objectContaining({ id: 'm1' }),
        nextLesson: expect.objectContaining({ id: 'l1' }),
      });
    });

    it('com todas as aulas concluidas nao ha proxima e o curso conta como completo', async () => {
      const { service } = await build(['l1', 'l2', 'l3', 'l4']);

      const progress = await service.findForUser(USER);

      expect(progress.nextModule).toBeNull();
      expect(progress.nextLesson).toBeNull();
      expect(progress).toMatchObject({ percentage: 100, completed: true });
    });

    it('curso sem nenhuma aula publicada nao conta como concluido', async () => {
      const { service } = await build([], {
        findCourse: jest.fn().mockResolvedValue({ ...COURSE, modules: [COURSE.modules[2]] }),
      });

      await expect(service.findForUser(USER)).resolves.toMatchObject({
        totalCount: 0,
        percentage: 0,
        completed: false,
      });
    });

    it('expoe a carga horaria nula do curso sem inventar valor', async () => {
      const { service } = await build();

      await expect(service.findForUser(USER)).resolves.toMatchObject({
        course: { slug: 'imersao-rh', workloadHours: null },
      });
    });

    it('falha de forma explicita quando o curso nao foi semeado', async () => {
      const { service } = await build([], { findCourse: jest.fn().mockResolvedValue(null) });

      await expect(service.findForUser(USER)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('setLessonCompletion', () => {
    it('grava a conclusao da aula para o aluno', async () => {
      const { service, mocks } = await build();

      await service.setLessonCompletion(USER, 'l1', true);

      expect(mocks.upsertProgress).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId_lessonId: { userId: 'uid-123', lessonId: 'l1' } },
          create: { userId: 'uid-123', lessonId: 'l1' },
        }),
      );
    });

    it('marcar duas vezes a mesma aula nao duplica registro', async () => {
      const { service, mocks } = await build(['l1']);

      await service.setLessonCompletion(USER, 'l1', true);

      expect(mocks.upsertProgress).toHaveBeenCalledTimes(1);
      expect(mocks.upsertProgress.mock.calls[0][0].update).toEqual({});
    });

    it('desmarcar apaga o registro em vez de guardar um booleano falso', async () => {
      const { service, mocks } = await build(['l1']);

      await service.setLessonCompletion(USER, 'l1', false);

      expect(mocks.deleteProgress).toHaveBeenCalledWith({
        where: { userId: 'uid-123', lessonId: 'l1' },
      });
      expect(mocks.upsertProgress).not.toHaveBeenCalled();
    });

    it('desmarcar uma aula que nunca foi concluida nao quebra', async () => {
      const { service } = await build([], {
        deleteProgress: jest.fn().mockResolvedValue({ count: 0 }),
      });

      await expect(service.setLessonCompletion(USER, 'l1', false)).resolves.toBeDefined();
    });

    it('garante o registro do aluno antes de gravar, para nao esbarrar na FK', async () => {
      const { service, mocks } = await build();

      await service.setLessonCompletion(USER, 'l1', true);

      expect(mocks.findOrCreateUser).toHaveBeenCalledWith(USER);
    });

    it('recusa um lessonId inexistente', async () => {
      const { service, mocks } = await build([], {
        findLesson: jest.fn().mockResolvedValue(null),
      });

      await expect(service.setLessonCompletion(USER, 'nao-existe', true)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(mocks.upsertProgress).not.toHaveBeenCalled();
    });

    it('devolve o progresso ja atualizado, para o front nao precisar de outra chamada', async () => {
      const { service, mocks } = await build();

      const progress = await service.setLessonCompletion(USER, 'l1', true);

      expect(mocks.findProgress).toHaveBeenCalled();
      expect(progress).toMatchObject({ totalCount: 4 });
    });
  });
});
