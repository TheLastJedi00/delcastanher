import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { ProgressService } from './progress.service';

const USER: AuthUser = {
  uid: 'uid-123',
  email: 'aluno@delcastanher.com',
  name: 'Aluno Teste',
  role: 'aluno',
};

const COURSE = {
  id: 'course-1',
  slug: 'imersao-rh',
  title: 'Imersão RH Estratégico',
  workloadHours: null,
  modules: [
    { id: 'm1', order: 1, title: 'Fundamentos', summary: 'Resumo 1' },
    { id: 'm2', order: 2, title: 'Diagnóstico', summary: 'Resumo 2' },
    { id: 'm3', order: 3, title: 'Recrutamento', summary: 'Resumo 3' },
    { id: 'm4', order: 4, title: 'Onboarding', summary: 'Resumo 4' },
  ],
};

interface PrismaMocks {
  findCourse: jest.Mock;
  findProgress: jest.Mock;
  findModule: jest.Mock;
  upsertProgress: jest.Mock;
  deleteProgress: jest.Mock;
  findOrCreateUser: jest.Mock;
}

/** Concluidos passados por id de modulo, no formato devolvido pelo Prisma. */
async function build(completed: string[] = [], overrides: Partial<PrismaMocks> = {}) {
  const mocks: PrismaMocks = {
    findCourse: jest.fn().mockResolvedValue(COURSE),
    findProgress: jest.fn().mockResolvedValue(completed.map((moduleId) => ({ moduleId }))),
    findModule: jest.fn().mockResolvedValue({ id: 'm1', courseId: 'course-1' }),
    upsertProgress: jest.fn().mockResolvedValue({}),
    deleteProgress: jest.fn().mockResolvedValue({ count: 1 }),
    findOrCreateUser: jest.fn().mockResolvedValue({ id: USER.uid }),
    ...overrides,
  };

  const moduleRef = await Test.createTestingModule({
    providers: [
      ProgressService,
      {
        provide: PrismaService,
        useValue: {
          course: { findUnique: mocks.findCourse },
          module: { findUnique: mocks.findModule },
          moduleProgress: {
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
    it('devolve os modulos do curso em ordem, marcando os concluidos do aluno', async () => {
      const { service } = await build(['m1', 'm2']);

      const progress = await service.findForUser(USER);

      expect(progress.modules.map((module) => [module.order, module.completed])).toEqual([
        [1, true],
        [2, true],
        [3, false],
        [4, false],
      ]);
    });

    it('so considera o progresso do proprio aluno', async () => {
      const { service, mocks } = await build();

      await service.findForUser(USER);

      expect(mocks.findProgress).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ userId: 'uid-123' }) }),
      );
    });

    it('calcula o percentual concluido arredondado', async () => {
      const { service } = await build(['m1']);

      const progress = await service.findForUser(USER);

      expect(progress).toMatchObject({ completedCount: 1, totalCount: 4, percentage: 25 });
    });

    it('aponta o primeiro modulo em aberto como proximo, mesmo com conclusao fora de ordem', async () => {
      const { service } = await build(['m1', 'm3']);

      const progress = await service.findForUser(USER);

      expect(progress.nextModule).toMatchObject({ id: 'm2', order: 2 });
      expect(progress.completed).toBe(false);
    });

    it('sem nenhum modulo concluido, o proximo e o primeiro da trilha', async () => {
      const { service } = await build();

      await expect(service.findForUser(USER)).resolves.toMatchObject({
        percentage: 0,
        nextModule: expect.objectContaining({ id: 'm1' }),
      });
    });

    it('com a trilha inteira concluida nao ha proximo modulo e o curso conta como completo', async () => {
      const { service } = await build(['m1', 'm2', 'm3', 'm4']);

      const progress = await service.findForUser(USER);

      expect(progress.nextModule).toBeNull();
      expect(progress).toMatchObject({ percentage: 100, completed: true });
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

  describe('setModuleCompletion', () => {
    it('grava a conclusao do modulo para o aluno', async () => {
      const { service, mocks } = await build();

      await service.setModuleCompletion(USER, 'm1', true);

      expect(mocks.upsertProgress).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId_moduleId: { userId: 'uid-123', moduleId: 'm1' } },
          create: { userId: 'uid-123', moduleId: 'm1' },
        }),
      );
    });

    it('marcar duas vezes o mesmo modulo nao duplica registro', async () => {
      const { service, mocks } = await build(['m1']);

      await service.setModuleCompletion(USER, 'm1', true);

      expect(mocks.upsertProgress).toHaveBeenCalledTimes(1);
      expect(mocks.upsertProgress.mock.calls[0][0].update).toEqual({});
    });

    it('desmarcar apaga o registro em vez de guardar um booleano falso', async () => {
      const { service, mocks } = await build(['m1']);

      await service.setModuleCompletion(USER, 'm1', false);

      expect(mocks.deleteProgress).toHaveBeenCalledWith({
        where: { userId: 'uid-123', moduleId: 'm1' },
      });
      expect(mocks.upsertProgress).not.toHaveBeenCalled();
    });

    it('desmarcar um modulo que nunca foi concluido nao quebra', async () => {
      const { service } = await build([], {
        deleteProgress: jest.fn().mockResolvedValue({ count: 0 }),
      });

      await expect(service.setModuleCompletion(USER, 'm1', false)).resolves.toBeDefined();
    });

    it('garante o registro do aluno antes de gravar, para nao esbarrar na FK', async () => {
      const { service, mocks } = await build();

      await service.setModuleCompletion(USER, 'm1', true);

      expect(mocks.findOrCreateUser).toHaveBeenCalledWith(USER);
    });

    it('recusa um moduleId inexistente', async () => {
      const { service, mocks } = await build([], {
        findModule: jest.fn().mockResolvedValue(null),
      });

      await expect(service.setModuleCompletion(USER, 'nao-existe', true)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(mocks.upsertProgress).not.toHaveBeenCalled();
    });

    it('devolve o progresso ja atualizado, para o front nao precisar de outra chamada', async () => {
      const { service, mocks } = await build();

      const progress = await service.setModuleCompletion(USER, 'm1', true);

      expect(mocks.findProgress).toHaveBeenCalled();
      expect(progress).toMatchObject({ totalCount: 4 });
    });
  });
});
