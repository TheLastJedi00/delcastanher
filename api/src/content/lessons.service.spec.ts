import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { MuxService } from '../mux/mux.service';
import { LessonsService } from './lessons.service';

const MODULE = { id: 'mod-1', order: 1, title: 'Fundamentos', summary: 'Resumo', courseId: 'c1' };

const LESSON = {
  id: 'les-1',
  moduleId: 'mod-1',
  order: 1,
  title: 'O papel do RH',
  summary: 'Aula 1',
  videoStoragePath: null,
  videoOriginalName: null,
  videoSizeBytes: null,
  muxAssetId: null,
  muxPlaybackId: null,
  videoStatus: null,
  videoError: null,
  durationSeconds: null,
};

const COM_VIDEO = {
  ...LESSON,
  id: 'les-2',
  order: 2,
  videoStoragePath: 'lessons/les-2/video/aula.mp4',
  videoOriginalName: 'Aula.mp4',
  videoSizeBytes: 2048,
  muxAssetId: 'asset-1',
  muxPlaybackId: 'pb-1',
  videoStatus: 'READY',
  durationSeconds: 600,
};

interface Mocks {
  findCourse: jest.Mock;
  findModule: jest.Mock;
  findModules: jest.Mock;
  createModule: jest.Mock;
  updateModule: jest.Mock;
  aggregateModule: jest.Mock;
  countCertificates: jest.Mock;
  findLesson: jest.Mock;
  findLessons: jest.Mock;
  createLesson: jest.Mock;
  updateLesson: jest.Mock;
  deleteLesson: jest.Mock;
  aggregateLesson: jest.Mock;
  countMaterials: jest.Mock;
  countProgress: jest.Mock;
  findMaterials: jest.Mock;
  transaction: jest.Mock;
  removeObject: jest.Mock;
  deleteAsset: jest.Mock;
}

async function build(overrides: Partial<Mocks> = {}) {
  const mocks: Mocks = {
    findCourse: jest.fn().mockResolvedValue({ id: 'c1', slug: 'imersao-rh' }),
    findModule: jest.fn().mockResolvedValue(MODULE),
    findModules: jest.fn().mockResolvedValue([MODULE]),
    createModule: jest.fn().mockImplementation(({ data }) => ({ id: 'mod-novo', ...data })),
    updateModule: jest.fn().mockImplementation(({ data }) => ({ ...MODULE, ...data })),
    aggregateModule: jest.fn().mockResolvedValue({ _max: { order: 12 } }),
    countCertificates: jest.fn().mockResolvedValue(0),
    findLesson: jest.fn().mockResolvedValue(LESSON),
    findLessons: jest.fn().mockResolvedValue([LESSON, COM_VIDEO]),
    createLesson: jest.fn().mockImplementation(({ data }) => ({ id: 'les-novo', ...data })),
    updateLesson: jest.fn().mockImplementation(({ data }) => ({ ...LESSON, ...data })),
    deleteLesson: jest.fn().mockResolvedValue(LESSON),
    aggregateLesson: jest.fn().mockResolvedValue({ _max: { order: 3 } }),
    countMaterials: jest.fn().mockResolvedValue(2),
    countProgress: jest.fn().mockResolvedValue(5),
    findMaterials: jest.fn().mockResolvedValue([]),
    transaction: jest.fn().mockResolvedValue([]),
    removeObject: jest.fn().mockResolvedValue(undefined),
    deleteAsset: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };

  const moduleRef = await Test.createTestingModule({
    providers: [
      LessonsService,
      {
        provide: PrismaService,
        useValue: {
          course: { findUnique: mocks.findCourse },
          module: {
            findUnique: mocks.findModule,
            findMany: mocks.findModules,
            create: mocks.createModule,
            update: mocks.updateModule,
            aggregate: mocks.aggregateModule,
          },
          lesson: {
            findUnique: mocks.findLesson,
            findMany: mocks.findLessons,
            create: mocks.createLesson,
            update: mocks.updateLesson,
            delete: mocks.deleteLesson,
            aggregate: mocks.aggregateLesson,
          },
          material: { count: mocks.countMaterials, findMany: mocks.findMaterials },
          lessonProgress: { count: mocks.countProgress },
          certificate: { count: mocks.countCertificates },
          $transaction: mocks.transaction,
        },
      },
      { provide: StorageService, useValue: { remove: mocks.removeObject } },
      { provide: MuxService, useValue: { deleteAsset: mocks.deleteAsset } },
    ],
  }).compile();

  return { service: moduleRef.get(LessonsService), mocks };
}

describe('LessonsService', () => {
  describe('listForModule', () => {
    it('devolve as aulas com estado do video, materiais e quantos alunos concluiram', async () => {
      const { service } = await build();

      const lessons = await service.listForModule('mod-1');

      expect(lessons).toHaveLength(2);
      expect(lessons[0]).toMatchObject({
        id: 'les-1',
        order: 1,
        title: 'O papel do RH',
        materialCount: 2,
        // O painel precisa deste numero antes de oferecer a remocao: apagar a
        // aula apaga o progresso de quem a concluiu (decisao 16).
        completedBy: 5,
      });
      expect(lessons[1].video).toMatchObject({ hasVideo: true, status: 'READY' });
    });

    it('recusa modulo inexistente', async () => {
      const { service } = await build({ findModule: jest.fn().mockResolvedValue(null) });

      await expect(service.listForModule('nao-existe')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('createLesson', () => {
    it('cria no fim da lista do modulo', async () => {
      const { service, mocks } = await build();

      await service.createLesson('mod-1', { title: 'Nova aula', summary: 'Resumo' });

      expect(mocks.createLesson).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { moduleId: 'mod-1', order: 4, title: 'Nova aula', summary: 'Resumo' },
        }),
      );
    });

    it('usa o maior order, e nao a contagem, para nao colidir depois de uma remocao', async () => {
      // Modulo com as aulas 1 e 3 (a 2 foi removida): a contagem daria 2 e
      // bateria no `@@unique([moduleId, order])` da aula 3 ainda existente.
      const { service, mocks } = await build({
        aggregateLesson: jest.fn().mockResolvedValue({ _max: { order: 3 } }),
      });

      await service.createLesson('mod-1', { title: 'Nova', summary: 'R' });

      expect(mocks.createLesson.mock.calls[0][0].data.order).toBe(4);
    });

    it('a primeira aula de um modulo vazio nasce com order 1', async () => {
      const { service, mocks } = await build({
        aggregateLesson: jest.fn().mockResolvedValue({ _max: { order: null } }),
      });

      await service.createLesson('mod-1', { title: 'Nova', summary: 'R' });

      expect(mocks.createLesson.mock.calls[0][0].data.order).toBe(1);
    });

    it('recusa modulo inexistente', async () => {
      const { service, mocks } = await build({ findModule: jest.fn().mockResolvedValue(null) });

      await expect(
        service.createLesson('nao-existe', { title: 'Nova', summary: 'R' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(mocks.createLesson).not.toHaveBeenCalled();
    });
  });

  describe('updateLesson', () => {
    it('renomeia sem tocar no video nem na ordem', async () => {
      const { service, mocks } = await build();

      await service.updateLesson('les-1', { title: 'Outro titulo' });

      const call = mocks.updateLesson.mock.calls[0][0];
      expect(call.where).toEqual({ id: 'les-1' });
      expect(call.data).toEqual({ title: 'Outro titulo' });
    });

    it('recusa aula inexistente', async () => {
      const { service } = await build({ findLesson: jest.fn().mockResolvedValue(null) });

      await expect(service.updateLesson('nao-existe', { title: 'x' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('removeLesson', () => {
    it('apaga o asset no Mux e os objetos do bucket antes da linha', async () => {
      const ordem: string[] = [];
      const { service, mocks } = await build({
        findLesson: jest.fn().mockResolvedValue(COM_VIDEO),
        findMaterials: jest
          .fn()
          .mockResolvedValue([{ storagePath: 'lessons/les-2/materials/checklist.pdf' }]),
      });

      mocks.deleteAsset.mockImplementation(async () => void ordem.push('mux'));
      mocks.removeObject.mockImplementation(async () => void ordem.push('bucket'));
      mocks.deleteLesson.mockImplementation(async () => {
        ordem.push('banco');
        return COM_VIDEO;
      });

      await service.removeLesson('les-2');

      // O banco por ultimo: na ordem inversa, uma falha deixaria arquivo e
      // asset orfaos que ninguem mais sabe que existem.
      expect(ordem[ordem.length - 1]).toBe('banco');
      expect(mocks.deleteAsset).toHaveBeenCalledWith('asset-1');
      expect(mocks.removeObject).toHaveBeenCalledWith('lessons/les-2/video/aula.mp4');
      expect(mocks.removeObject).toHaveBeenCalledWith('lessons/les-2/materials/checklist.pdf');
    });

    it('aula sem video nao chama o Mux', async () => {
      const { service, mocks } = await build();

      await service.removeLesson('les-1');

      expect(mocks.deleteAsset).not.toHaveBeenCalled();
      expect(mocks.deleteLesson).toHaveBeenCalledWith({ where: { id: 'les-1' } });
    });

    it('falha no Mux nao impede a remocao', async () => {
      const { service, mocks } = await build({
        findLesson: jest.fn().mockResolvedValue(COM_VIDEO),
        deleteAsset: jest.fn().mockRejectedValue(new Error('Mux fora do ar')),
      });

      await expect(service.removeLesson('les-2')).resolves.toBeUndefined();
      expect(mocks.deleteLesson).toHaveBeenCalled();
    });

    it('recusa aula inexistente', async () => {
      const { service, mocks } = await build({ findLesson: jest.fn().mockResolvedValue(null) });

      await expect(service.removeLesson('nao-existe')).rejects.toBeInstanceOf(NotFoundException);
      expect(mocks.deleteLesson).not.toHaveBeenCalled();
    });
  });

  describe('reorderLessons', () => {
    it('grava a lista inteira em uma transacao, em dois passos', async () => {
      const { service, mocks } = await build({
        findLessons: jest.fn().mockResolvedValue([
          { ...LESSON, id: 'les-1', order: 1 },
          { ...LESSON, id: 'les-2', order: 2 },
          { ...LESSON, id: 'les-3', order: 3 },
        ]),
      });

      await service.reorderLessons('mod-1', ['les-3', 'les-1', 'les-2']);

      expect(mocks.transaction).toHaveBeenCalledTimes(1);

      // Dois passos: primeiro ordens negativas, depois as definitivas. Sem o
      // passo intermediario, o primeiro UPDATE bateria no
      // `@@unique([moduleId, order])` de uma aula que ainda nao se moveu
      // (decisao 17). As seis chamadas vao juntas para o `$transaction`.
      const updates = mocks.updateLesson.mock.calls.map((call) => [
        call[0].where.id,
        call[0].data.order,
      ]);

      expect(mocks.transaction.mock.calls[0][0]).toHaveLength(6);
      expect(updates).toEqual([
        ['les-3', -1],
        ['les-1', -2],
        ['les-2', -3],
        ['les-3', 1],
        ['les-1', 2],
        ['les-2', 3],
      ]);
    });

    it('recusa lista incompleta', async () => {
      const { service, mocks } = await build();

      // `findLessons` devolve duas aulas; mandar uma so reordenaria metade e
      // deixaria a outra com ordem duplicada.
      await expect(service.reorderLessons('mod-1', ['les-1'])).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(mocks.transaction).not.toHaveBeenCalled();
    });

    it('recusa id repetido', async () => {
      const { service, mocks } = await build();

      await expect(service.reorderLessons('mod-1', ['les-1', 'les-1'])).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(mocks.transaction).not.toHaveBeenCalled();
    });

    it('recusa id de aula de outro modulo', async () => {
      const { service, mocks } = await build();

      await expect(service.reorderLessons('mod-1', ['les-1', 'les-de-outro'])).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(mocks.transaction).not.toHaveBeenCalled();
    });

    it('recusa modulo inexistente', async () => {
      const { service } = await build({ findModule: jest.fn().mockResolvedValue(null) });

      await expect(service.reorderLessons('nao-existe', [])).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('modulos', () => {
    it('lista com contagem de aulas e de diplomas emitidos', async () => {
      const { service } = await build({
        findModules: jest.fn().mockResolvedValue([{ ...MODULE, _count: { lessons: 3 } }]),
        countCertificates: jest.fn().mockResolvedValue(2),
      });

      const modules = await service.listModules();

      expect(modules[0]).toMatchObject({
        id: 'mod-1',
        lessonCount: 3,
        // A UI usa este numero para explicar por que nao existe remocao de
        // modulo (decisao 15).
        certificateCount: 2,
      });
    });

    it('cria o modulo no fim da grade do curso', async () => {
      const { service, mocks } = await build();

      await service.createModule({ title: 'Novo modulo', summary: 'Resumo' });

      expect(mocks.createModule).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { courseId: 'c1', order: 13, title: 'Novo modulo', summary: 'Resumo' },
        }),
      );
    });

    it('falha de forma explicita quando o curso nao foi semeado', async () => {
      const { service } = await build({ findCourse: jest.fn().mockResolvedValue(null) });

      await expect(
        service.createModule({ title: 'Novo', summary: 'R' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('renomeia o modulo', async () => {
      const { service, mocks } = await build();

      await service.updateModule('mod-1', { title: 'Outro' });

      expect(mocks.updateModule.mock.calls[0][0]).toMatchObject({
        where: { id: 'mod-1' },
        data: { title: 'Outro' },
      });
    });

    it('reordena a grade na mesma transacao de dois passos', async () => {
      const { service, mocks } = await build({
        findModules: jest.fn().mockResolvedValue([
          { ...MODULE, id: 'mod-1', order: 1 },
          { ...MODULE, id: 'mod-2', order: 2 },
        ]),
      });

      await service.reorderModules(['mod-2', 'mod-1']);

      const updates = mocks.updateModule.mock.calls.map((call) => [
        call[0].where.id,
        call[0].data.order,
      ]);

      expect(mocks.transaction.mock.calls[0][0]).toHaveLength(4);
      expect(updates).toEqual([
        ['mod-2', -1],
        ['mod-1', -2],
        ['mod-2', 1],
        ['mod-1', 2],
      ]);
    });

    it('recusa reordenacao com a lista incompleta', async () => {
      const { service, mocks } = await build({
        findModules: jest.fn().mockResolvedValue([
          { ...MODULE, id: 'mod-1', order: 1 },
          { ...MODULE, id: 'mod-2', order: 2 },
        ]),
      });

      await expect(service.reorderModules(['mod-1'])).rejects.toBeInstanceOf(BadRequestException);
      expect(mocks.transaction).not.toHaveBeenCalled();
    });
  });
});
