import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { ContentService } from './content.service';

const LESSON = {
  id: 'les-1',
  order: 2,
  title: 'Maturidade de RH',
  moduleId: 'mod-1',
  module: { id: 'mod-1', order: 1, title: 'Fundamentos', courseId: 'course-1' },
};

const MATERIAL = {
  id: 'mat-1',
  lessonId: 'les-1',
  storagePath: 'lessons/les-1/materials/checklist.pdf',
  fileName: 'Checklist.pdf',
  fileType: 'application/pdf',
  sizeBytes: 2048,
  order: 0,
  lesson: LESSON,
};

interface Mocks {
  findLesson: jest.Mock;
  findMaterials: jest.Mock;
  findMaterial: jest.Mock;
  upsertMaterial: jest.Mock;
  deleteMaterial: jest.Mock;
  countMaterials: jest.Mock;
  createUploadUrl: jest.Mock;
  createReadUrl: jest.Mock;
  requireUploaded: jest.Mock;
  removeObject: jest.Mock;
  materialPath: jest.Mock;
}

async function build(overrides: Partial<Mocks> = {}) {
  const mocks: Mocks = {
    findLesson: jest.fn().mockResolvedValue(LESSON),
    findMaterials: jest.fn().mockResolvedValue([MATERIAL]),
    findMaterial: jest.fn().mockResolvedValue(MATERIAL),
    upsertMaterial: jest.fn().mockResolvedValue(MATERIAL),
    deleteMaterial: jest.fn().mockResolvedValue(MATERIAL),
    countMaterials: jest.fn().mockResolvedValue(0),
    createUploadUrl: jest.fn().mockResolvedValue({
      storagePath: 'lessons/les-1/materials/checklist.pdf',
      uploadUrl: 'https://storage.googleapis.com/escrita',
      headers: { 'Content-Type': 'application/pdf' },
      expiresAt: '2026-09-11T12:00:00.000Z',
    }),
    createReadUrl: jest.fn().mockResolvedValue({
      url: 'https://storage.googleapis.com/leitura',
      expiresAt: '2026-09-11T12:15:00.000Z',
    }),
    requireUploaded: jest
      .fn()
      .mockResolvedValue({ sizeBytes: 2048, contentType: 'application/pdf' }),
    removeObject: jest.fn().mockResolvedValue(undefined),
    materialPath: jest.fn().mockReturnValue('lessons/les-1/materials/checklist.pdf'),
    ...overrides,
  };

  const moduleRef = await Test.createTestingModule({
    providers: [
      ContentService,
      {
        provide: PrismaService,
        useValue: {
          lesson: { findUnique: mocks.findLesson },
          material: {
            findMany: mocks.findMaterials,
            findUnique: mocks.findMaterial,
            upsert: mocks.upsertMaterial,
            delete: mocks.deleteMaterial,
            count: mocks.countMaterials,
          },
        },
      },
      {
        provide: StorageService,
        useValue: {
          createUploadUrl: mocks.createUploadUrl,
          createReadUrl: mocks.createReadUrl,
          requireUploaded: mocks.requireUploaded,
          remove: mocks.removeObject,
          materialPath: mocks.materialPath,
        },
      },
    ],
  }).compile();

  return { service: moduleRef.get(ContentService), mocks };
}

describe('ContentService (materiais)', () => {
  describe('createMaterialUploadUrl', () => {
    it('devolve a URL assinada de escrita e o caminho que sera gravado', async () => {
      const { service, mocks } = await build();

      const ticket = await service.createMaterialUploadUrl('les-1', {
        fileName: 'Checklist.pdf',
        contentType: 'application/pdf',
        sizeBytes: 2048,
      });

      expect(ticket).toMatchObject({
        storagePath: 'lessons/les-1/materials/checklist.pdf',
        uploadUrl: 'https://storage.googleapis.com/escrita',
        headers: { 'Content-Type': 'application/pdf' },
      });
      expect(mocks.createUploadUrl).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'material', lessonId: 'les-1' }),
      );
    });

    it('recusa aula inexistente antes de assinar qualquer coisa', async () => {
      const { service, mocks } = await build({ findLesson: jest.fn().mockResolvedValue(null) });

      await expect(
        service.createMaterialUploadUrl('nao-existe', {
          fileName: 'Checklist.pdf',
          contentType: 'application/pdf',
          sizeBytes: 2048,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(mocks.createUploadUrl).not.toHaveBeenCalled();
    });

    it('propaga a recusa de MIME do StorageService', async () => {
      const { service } = await build({
        createUploadUrl: jest.fn().mockRejectedValue(new BadRequestException('Formato')),
      });

      await expect(
        service.createMaterialUploadUrl('les-1', {
          fileName: 'app.exe',
          contentType: 'application/x-msdownload',
          sizeBytes: 2048,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('confirmMaterial', () => {
    it('so grava o registro depois de confirmar o objeto no bucket', async () => {
      const { service, mocks } = await build();

      const material = await service.confirmMaterial('les-1', {
        storagePath: 'lessons/les-1/materials/checklist.pdf',
        fileName: 'Checklist.pdf',
        contentType: 'application/pdf',
      });

      expect(mocks.requireUploaded).toHaveBeenCalledWith(
        'lessons/les-1/materials/checklist.pdf',
      );
      expect(mocks.upsertMaterial).toHaveBeenCalledTimes(1);
      expect(material).toMatchObject({ fileName: 'Checklist.pdf', fileType: 'pdf' });
    });

    it('grava o tamanho medido no bucket, e nao o informado pelo cliente', async () => {
      const { service, mocks } = await build({
        requireUploaded: jest
          .fn()
          .mockResolvedValue({ sizeBytes: 9999, contentType: 'application/pdf' }),
      });

      await service.confirmMaterial('les-1', {
        storagePath: 'lessons/les-1/materials/checklist.pdf',
        fileName: 'Checklist.pdf',
        contentType: 'application/pdf',
      });

      const { create } = mocks.upsertMaterial.mock.calls[0][0];
      expect(create.sizeBytes).toBe(9999);
    });

    it('nao grava nada quando o arquivo nunca chegou ao bucket', async () => {
      const { service, mocks } = await build({
        requireUploaded: jest.fn().mockRejectedValue(new BadRequestException('nao chegou')),
      });

      await expect(
        service.confirmMaterial('les-1', {
          storagePath: 'lessons/les-1/materials/checklist.pdf',
          fileName: 'Checklist.pdf',
          contentType: 'application/pdf',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(mocks.upsertMaterial).not.toHaveBeenCalled();
    });

    it('recusa um storagePath que nao pertence a aula da rota', async () => {
      const { service, mocks } = await build();

      // O caminho vem do passo anterior, mas chega pelo cliente: aceitar
      // qualquer valor deixaria o admin sobrescrever o material de outra aula.
      await expect(
        service.confirmMaterial('les-1', {
          storagePath: 'lessons/les-2/materials/outro.pdf',
          fileName: 'Outro.pdf',
          contentType: 'application/pdf',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(mocks.upsertMaterial).not.toHaveBeenCalled();
    });

    it('recusa aula inexistente', async () => {
      const { service } = await build({ findLesson: jest.fn().mockResolvedValue(null) });

      await expect(
        service.confirmMaterial('nao-existe', {
          storagePath: 'lessons/nao-existe/materials/checklist.pdf',
          fileName: 'Checklist.pdf',
          contentType: 'application/pdf',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('reenviar o mesmo arquivo atualiza o registro em vez de duplicar', async () => {
      const { service, mocks } = await build();

      await service.confirmMaterial('les-1', {
        storagePath: 'lessons/les-1/materials/checklist.pdf',
        fileName: 'Checklist.pdf',
        contentType: 'application/pdf',
      });

      const call = mocks.upsertMaterial.mock.calls[0][0];
      expect(call.where).toEqual({ storagePath: 'lessons/les-1/materials/checklist.pdf' });
    });
  });

  describe('listForLesson', () => {
    it('devolve nome, tipo, tamanho e URL assinada de leitura', async () => {
      const { service, mocks } = await build();

      const materials = await service.listForLesson('les-1');

      expect(materials).toHaveLength(1);
      expect(materials[0]).toMatchObject({
        fileName: 'Checklist.pdf',
        fileType: 'pdf',
        sizeBytes: 2048,
        downloadUrl: 'https://storage.googleapis.com/leitura',
      });
      expect(mocks.createReadUrl).toHaveBeenCalledWith(MATERIAL.storagePath);
    });

    it('nunca expoe o caminho do bucket', async () => {
      const { service } = await build();

      const materials = await service.listForLesson('les-1');

      expect(JSON.stringify(materials)).not.toContain('lessons/les-1/materials');
    });

    it('recusa aula inexistente', async () => {
      const { service } = await build({ findLesson: jest.fn().mockResolvedValue(null) });

      await expect(service.listForLesson('nao-existe')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('devolve lista vazia para um aula sem materiais', async () => {
      const { service } = await build({ findMaterials: jest.fn().mockResolvedValue([]) });

      await expect(service.listForLesson('les-1')).resolves.toEqual([]);
    });
  });

  describe('listForCourse', () => {
    it('reune os materiais de todas as aulas, com o rotulo do modulo e da aula', async () => {
      const { service } = await build();

      const materials = await service.listForCourse();

      expect(materials[0]).toMatchObject({
        moduleOrder: 1,
        moduleTitle: 'Fundamentos',
        lessonId: 'les-1',
        lessonOrder: 2,
        lessonTitle: 'Maturidade de RH',
      });
    });
  });

  describe('removeMaterial', () => {
    it('apaga o objeto do bucket e so depois o registro', async () => {
      const { service, mocks } = await build();
      const ordem: string[] = [];
      mocks.removeObject.mockImplementation(async () => void ordem.push('bucket'));
      mocks.deleteMaterial.mockImplementation(async () => {
        ordem.push('banco');
        return MATERIAL;
      });

      await service.removeMaterial('mat-1');

      expect(ordem).toEqual(['bucket', 'banco']);
      expect(mocks.removeObject).toHaveBeenCalledWith(MATERIAL.storagePath);
    });

    it('recusa material inexistente', async () => {
      const { service, mocks } = await build({ findMaterial: jest.fn().mockResolvedValue(null) });

      await expect(service.removeMaterial('nao-existe')).rejects.toBeInstanceOf(NotFoundException);
      expect(mocks.removeObject).not.toHaveBeenCalled();
    });
  });
});
