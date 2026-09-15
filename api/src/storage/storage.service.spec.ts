import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FirebaseService } from '../firebase/firebase.service';
import { MAX_MATERIAL_BYTES, MAX_VIDEO_BYTES, StorageService } from './storage.service';

const BUCKET = 'delcastanher-b9142.firebasestorage.app';

interface FileMock {
  getSignedUrl: jest.Mock;
  delete: jest.Mock;
  exists: jest.Mock;
  getMetadata: jest.Mock;
}

function build() {
  const file: FileMock = {
    getSignedUrl: jest.fn().mockResolvedValue(['https://storage.googleapis.com/assinada']),
    delete: jest.fn().mockResolvedValue(undefined),
    exists: jest.fn().mockResolvedValue([true]),
    getMetadata: jest.fn().mockResolvedValue([{ size: '1024', contentType: 'video/mp4' }]),
  };

  const bucket = jest.fn().mockReturnValue({ file: jest.fn().mockReturnValue(file) });
  const firebase = { storage: { bucket } } as unknown as FirebaseService;
  const config = {
    get: (key: string) => (key === 'FIREBASE_STORAGE_BUCKET' ? BUCKET : undefined),
  } as unknown as ConfigService;

  return { service: new StorageService(firebase, config), file, bucket };
}

describe('StorageService', () => {
  describe('caminho do objeto', () => {
    it('usa um caminho deterministico por aula e por tipo', () => {
      const { service } = build();

      expect(service.videoPath('les-1', 'Aula 01.mp4')).toBe('lessons/les-1/video/aula-01.mp4');
      expect(service.materialPath('les-1', 'Checklist Final.pdf')).toBe(
        'lessons/les-1/materials/checklist-final.pdf',
      );
    });

    it('normaliza acentos, espacos e caracteres de caminho no nome do arquivo', () => {
      const { service } = build();

      // Sem isso um nome com `../` escaparia da pasta do modulo dentro do bucket.
      expect(service.materialPath('les-1', '../../Diagnostico Organizacional!.xlsx')).toBe(
        'lessons/les-1/materials/diagnostico-organizacional.xlsx',
      );
    });

    it('recusa um nome de arquivo que nao sobrevive a normalizacao', () => {
      const { service } = build();

      expect(() => service.materialPath('les-1', '   ')).toThrow(BadRequestException);
    });

    it('assina a leitura de um objeto no formato antigo, por modulo', async () => {
      const { service, file } = build();

      // Os objetos enviados antes da Spec 012 continuam gravados com o prefixo
      // `modules/<moduleId>/` (decisao 4): o caminho e dado, nao algo derivado
      // do id na hora da leitura. Renomear objeto no GCS e copiar e apagar —
      // risco de perder a fonte de um video para arrumar um prefixo.
      const result = await service.createReadUrl('modules/mod-1/video/aula-01.mp4');

      expect(file.getSignedUrl).toHaveBeenCalled();
      expect(result.url).toBe('https://storage.googleapis.com/assinada');
    });
  });

  describe('createUploadUrl', () => {
    it('assina uma URL v4 de escrita para o video e devolve o caminho gravado', async () => {
      const { service, file, bucket } = build();

      const result = await service.createUploadUrl({
        kind: 'video',
        lessonId: 'les-1',
        fileName: 'aula-01.mp4',
        contentType: 'video/mp4',
        sizeBytes: 50 * 1024 * 1024,
      });

      expect(bucket).toHaveBeenCalledWith(BUCKET);
      expect(result.storagePath).toBe('lessons/les-1/video/aula-01.mp4');
      expect(result.uploadUrl).toBe('https://storage.googleapis.com/assinada');
      expect(result.headers).toEqual({ 'Content-Type': 'video/mp4' });
      expect(new Date(result.expiresAt).getTime()).toBeGreaterThan(Date.now());

      const [options] = file.getSignedUrl.mock.calls[0];
      expect(options).toMatchObject({ version: 'v4', action: 'write', contentType: 'video/mp4' });
    });

    it('assina a URL de escrita de um material', async () => {
      const { service, file } = build();

      const result = await service.createUploadUrl({
        kind: 'material',
        lessonId: 'les-1',
        fileName: 'checklist.pdf',
        contentType: 'application/pdf',
        sizeBytes: 1024,
      });

      expect(result.storagePath).toBe('lessons/les-1/materials/checklist.pdf');
      expect(file.getSignedUrl.mock.calls[0][0]).toMatchObject({ action: 'write' });
    });

    it('recusa um MIME que nao e de video no upload de video', async () => {
      const { service, file } = build();

      await expect(
        service.createUploadUrl({
          kind: 'video',
          lessonId: 'les-1',
          fileName: 'planilha.xlsx',
          contentType: 'application/vnd.ms-excel',
          sizeBytes: 1024,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(file.getSignedUrl).not.toHaveBeenCalled();
    });

    it('recusa um executavel disfarcado de material', async () => {
      const { service, file } = build();

      await expect(
        service.createUploadUrl({
          kind: 'material',
          lessonId: 'les-1',
          fileName: 'instalador.exe',
          contentType: 'application/x-msdownload',
          sizeBytes: 1024,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(file.getSignedUrl).not.toHaveBeenCalled();
    });

    it('recusa um video acima do limite de tamanho', async () => {
      const { service, file } = build();

      await expect(
        service.createUploadUrl({
          kind: 'video',
          lessonId: 'les-1',
          fileName: 'aula.mp4',
          contentType: 'video/mp4',
          sizeBytes: MAX_VIDEO_BYTES + 1,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(file.getSignedUrl).not.toHaveBeenCalled();
    });

    it('recusa um material acima do limite de tamanho', async () => {
      const { service } = build();

      await expect(
        service.createUploadUrl({
          kind: 'material',
          lessonId: 'les-1',
          fileName: 'apostila.pdf',
          contentType: 'application/pdf',
          sizeBytes: MAX_MATERIAL_BYTES + 1,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('recusa tamanho zero ou negativo', async () => {
      const { service } = build();

      await expect(
        service.createUploadUrl({
          kind: 'material',
          lessonId: 'les-1',
          fileName: 'vazio.pdf',
          contentType: 'application/pdf',
          sizeBytes: 0,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('createReadUrl', () => {
    it('assina uma URL v4 de leitura de validade curta', async () => {
      const { service, file } = build();

      const result = await service.createReadUrl('lessons/les-1/materials/checklist.pdf');

      const [options] = file.getSignedUrl.mock.calls[0];
      expect(options).toMatchObject({ version: 'v4', action: 'read' });

      // Curta o bastante para que um link copiado de um print nao valha amanha.
      const ttl = (options.expires as number) - Date.now();
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(60 * 60 * 1000);
      expect(result.url).toBe('https://storage.googleapis.com/assinada');
    });

    it('aceita uma validade menor sob medida para o ingest do Mux', async () => {
      const { service, file } = build();

      await service.createReadUrl('lessons/les-1/video/aula.mp4', 120);

      const [options] = file.getSignedUrl.mock.calls[0];
      expect((options.expires as number) - Date.now()).toBeLessThanOrEqual(120 * 1000);
    });
  });

  describe('remove', () => {
    it('apaga o objeto do bucket', async () => {
      const { service, file } = build();

      await service.remove('lessons/les-1/materials/checklist.pdf');

      expect(file.delete).toHaveBeenCalled();
    });

    it('trata objeto ja inexistente como sucesso', async () => {
      const { service, file } = build();
      file.delete.mockRejectedValue(Object.assign(new Error('No such object'), { code: 404 }));

      // Apagar o que ja nao esta la e o resultado desejado, nao um erro a
      // propagar para o admin.
      await expect(service.remove('lessons/les-1/materials/sumiu.pdf')).resolves.toBeUndefined();
    });
  });

  describe('requireUploaded', () => {
    it('devolve o tamanho gravado quando o objeto existe', async () => {
      const { service } = build();

      await expect(service.requireUploaded('lessons/les-1/video/aula.mp4')).resolves.toMatchObject({
        sizeBytes: 1024,
      });
    });

    it('recusa a confirmacao de um upload que nunca chegou ao bucket', async () => {
      const { service, file } = build();
      file.exists.mockResolvedValue([false]);

      await expect(service.requireUploaded('lessons/les-1/video/aula.mp4')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });
});
