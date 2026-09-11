import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MuxService } from '../mux/mux.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { VideoService } from './video.service';

const MODULE = {
  id: 'mod-1',
  order: 1,
  title: 'Fundamentos',
  courseId: 'course-1',
  videoStoragePath: null,
  videoOriginalName: null,
  videoSizeBytes: null,
  muxAssetId: null,
  muxPlaybackId: null,
  videoStatus: null,
  videoError: null,
};

const COM_VIDEO = {
  ...MODULE,
  videoStoragePath: 'modules/mod-1/video/aula-01.mp4',
  videoOriginalName: 'Aula 01.mp4',
  videoSizeBytes: 1024,
  muxAssetId: 'asset-antigo',
  muxPlaybackId: 'pb-antigo',
  videoStatus: 'READY',
};

interface Mocks {
  findModule: jest.Mock;
  findFirstModule: jest.Mock;
  updateModule: jest.Mock;
  updateManyModules: jest.Mock;
  createUploadUrl: jest.Mock;
  createReadUrl: jest.Mock;
  requireUploaded: jest.Mock;
  removeObject: jest.Mock;
  createAsset: jest.Mock;
  getAsset: jest.Mock;
  deleteAsset: jest.Mock;
  signPlayback: jest.Mock;
}

async function build(overrides: Partial<Mocks> = {}) {
  const mocks: Mocks = {
    findModule: jest.fn().mockResolvedValue(MODULE),
    findFirstModule: jest.fn().mockResolvedValue(MODULE),
    updateModule: jest.fn().mockImplementation(({ data }) => ({ ...MODULE, ...data })),
    updateManyModules: jest.fn().mockResolvedValue({ count: 1 }),
    createUploadUrl: jest.fn().mockResolvedValue({
      storagePath: 'modules/mod-1/video/aula-01.mp4',
      uploadUrl: 'https://storage.googleapis.com/escrita',
      headers: { 'Content-Type': 'video/mp4' },
      expiresAt: '2026-09-11T12:00:00.000Z',
    }),
    createReadUrl: jest.fn().mockResolvedValue({
      url: 'https://storage.googleapis.com/leitura',
      expiresAt: '2026-09-11T12:15:00.000Z',
    }),
    requireUploaded: jest.fn().mockResolvedValue({ sizeBytes: 4096, contentType: 'video/mp4' }),
    removeObject: jest.fn().mockResolvedValue(undefined),
    createAsset: jest
      .fn()
      .mockResolvedValue({ assetId: 'asset-1', playbackId: 'pb-1', status: 'PROCESSING' }),
    getAsset: jest
      .fn()
      .mockResolvedValue({ assetId: 'asset-1', playbackId: 'pb-1', status: 'READY' }),
    deleteAsset: jest.fn().mockResolvedValue(undefined),
    signPlayback: jest
      .fn()
      .mockReturnValue({ token: 'jwt-curto', expiresAt: '2026-09-11T14:00:00.000Z' }),
    ...overrides,
  };

  const moduleRef = await Test.createTestingModule({
    providers: [
      VideoService,
      {
        provide: PrismaService,
        useValue: {
          module: {
            findUnique: mocks.findModule,
            findFirst: mocks.findFirstModule,
            update: mocks.updateModule,
            updateMany: mocks.updateManyModules,
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
        },
      },
      {
        provide: MuxService,
        useValue: {
          createAsset: mocks.createAsset,
          getAsset: mocks.getAsset,
          deleteAsset: mocks.deleteAsset,
          signPlayback: mocks.signPlayback,
        },
      },
    ],
  }).compile();

  return { service: moduleRef.get(VideoService), mocks };
}

describe('VideoService', () => {
  describe('createUploadUrl', () => {
    it('assina a URL de escrita do video do modulo', async () => {
      const { service, mocks } = await build();

      const ticket = await service.createUploadUrl('mod-1', {
        fileName: 'Aula 01.mp4',
        contentType: 'video/mp4',
        sizeBytes: 4096,
      });

      expect(ticket.uploadUrl).toBe('https://storage.googleapis.com/escrita');
      expect(mocks.createUploadUrl).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'video', moduleId: 'mod-1' }),
      );
    });

    it('recusa modulo inexistente antes de assinar', async () => {
      const { service, mocks } = await build({ findModule: jest.fn().mockResolvedValue(null) });

      await expect(
        service.createUploadUrl('nao-existe', {
          fileName: 'Aula.mp4',
          contentType: 'video/mp4',
          sizeBytes: 4096,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(mocks.createUploadUrl).not.toHaveBeenCalled();
    });
  });

  describe('confirmUpload', () => {
    const input = {
      storagePath: 'modules/mod-1/video/aula-01.mp4',
      fileName: 'Aula 01.mp4',
      contentType: 'video/mp4',
    };

    it('entrega ao Mux uma URL assinada de leitura do arquivo ja no bucket', async () => {
      const { service, mocks } = await build();

      await service.confirmUpload('mod-1', input);

      // Um upload, dois destinos: o Mux puxa do Storage em vez de o servidor
      // baixar e reenviar o arquivo (decisao 4).
      expect(mocks.createReadUrl).toHaveBeenCalledWith(input.storagePath, expect.any(Number));
      expect(mocks.createAsset).toHaveBeenCalledWith('https://storage.googleapis.com/leitura');
    });

    it('grava assetId, playbackId e PROCESSING', async () => {
      const { service, mocks } = await build();

      const state = await service.confirmUpload('mod-1', input);

      const { data } = mocks.updateModule.mock.calls[0][0];
      expect(data).toMatchObject({
        muxAssetId: 'asset-1',
        muxPlaybackId: 'pb-1',
        videoStatus: 'PROCESSING',
        videoStoragePath: input.storagePath,
        videoOriginalName: 'Aula 01.mp4',
        videoSizeBytes: 4096,
        videoError: null,
      });
      expect(state.status).toBe('PROCESSING');
    });

    it('substituir o video apaga o asset anterior no Mux', async () => {
      const { service, mocks } = await build({
        findModule: jest.fn().mockResolvedValue(COM_VIDEO),
      });

      await service.confirmUpload('mod-1', input);

      expect(mocks.deleteAsset).toHaveBeenCalledWith('asset-antigo');
    });

    it('substituir por um arquivo de outro nome apaga o objeto antigo do bucket', async () => {
      const { service, mocks } = await build({
        findModule: jest.fn().mockResolvedValue(COM_VIDEO),
      });

      await service.confirmUpload('mod-1', {
        ...input,
        storagePath: 'modules/mod-1/video/aula-01-revisada.mp4',
      });

      expect(mocks.removeObject).toHaveBeenCalledWith(COM_VIDEO.videoStoragePath);
    });

    it('nao apaga o objeto quando o caminho novo e o mesmo do antigo', async () => {
      const { service, mocks } = await build({
        findModule: jest.fn().mockResolvedValue(COM_VIDEO),
      });

      await service.confirmUpload('mod-1', {
        ...input,
        storagePath: COM_VIDEO.videoStoragePath,
      });

      expect(mocks.removeObject).not.toHaveBeenCalled();
    });

    it('recusa um storagePath que nao e da pasta de video do modulo', async () => {
      const { service, mocks } = await build();

      await expect(
        service.confirmUpload('mod-1', {
          ...input,
          storagePath: 'modules/mod-2/video/aula.mp4',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(mocks.createAsset).not.toHaveBeenCalled();
    });

    it('nao chama o Mux quando o arquivo nunca chegou ao bucket', async () => {
      const { service, mocks } = await build({
        requireUploaded: jest.fn().mockRejectedValue(new BadRequestException('nao chegou')),
      });

      await expect(service.confirmUpload('mod-1', input)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(mocks.createAsset).not.toHaveBeenCalled();
    });
  });

  describe('getState', () => {
    it('descreve o modulo sem video', async () => {
      const { service } = await build();

      await expect(service.getState('mod-1')).resolves.toMatchObject({
        hasVideo: false,
        status: null,
        playbackId: null,
      });
    });

    it('devolve o estado gravado sem consultar o Mux quando ja esta READY', async () => {
      const { service, mocks } = await build({
        findModule: jest.fn().mockResolvedValue(COM_VIDEO),
      });

      const state = await service.getState('mod-1');

      expect(state).toMatchObject({ hasVideo: true, status: 'READY', playbackId: 'pb-antigo' });
      expect(mocks.getAsset).not.toHaveBeenCalled();
    });

    it('reconsulta o Mux enquanto o video esta em processamento', async () => {
      const { service, mocks } = await build({
        findModule: jest
          .fn()
          .mockResolvedValue({ ...COM_VIDEO, videoStatus: 'PROCESSING', muxAssetId: 'asset-1' }),
      });

      const state = await service.getState('mod-1');

      // O webhook e a fonte oficial, mas ele nao alcanca um localhost: sem
      // esta reconsulta o painel ficaria preso em PROCESSING no ambiente de
      // desenvolvimento.
      expect(mocks.getAsset).toHaveBeenCalledWith('asset-1');
      expect(state.status).toBe('READY');
      expect(mocks.updateModule).toHaveBeenCalled();
    });

    it('nao derruba a consulta quando o Mux esta indisponivel', async () => {
      const { service } = await build({
        findModule: jest
          .fn()
          .mockResolvedValue({ ...COM_VIDEO, videoStatus: 'PROCESSING', muxAssetId: 'asset-1' }),
        getAsset: jest.fn().mockRejectedValue(new Error('fora do ar')),
      });

      await expect(service.getState('mod-1')).resolves.toMatchObject({ status: 'PROCESSING' });
    });

    it('recusa modulo inexistente', async () => {
      const { service } = await build({ findModule: jest.fn().mockResolvedValue(null) });

      await expect(service.getState('nao-existe')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('createPlaybackToken', () => {
    it('devolve playbackId, token curto e expiracao com o video pronto', async () => {
      const { service, mocks } = await build({
        findModule: jest.fn().mockResolvedValue(COM_VIDEO),
      });

      const playback = await service.createPlaybackToken('mod-1');

      expect(playback).toEqual({
        playbackId: 'pb-antigo',
        token: 'jwt-curto',
        expiresAt: '2026-09-11T14:00:00.000Z',
      });
      expect(mocks.signPlayback).toHaveBeenCalledWith('pb-antigo');
    });

    it('responde 409 enquanto o video ainda processa', async () => {
      const { service } = await build({
        findModule: jest.fn().mockResolvedValue({ ...COM_VIDEO, videoStatus: 'PROCESSING' }),
        getAsset: jest
          .fn()
          .mockResolvedValue({ assetId: 'asset-1', playbackId: 'pb-1', status: 'PROCESSING' }),
      });

      await expect(service.createPlaybackToken('mod-1')).rejects.toBeInstanceOf(ConflictException);
    });

    it('responde 409 para modulo sem video', async () => {
      const { service } = await build();

      await expect(service.createPlaybackToken('mod-1')).rejects.toBeInstanceOf(ConflictException);
    });

    it('recusa modulo inexistente', async () => {
      const { service } = await build({ findModule: jest.fn().mockResolvedValue(null) });

      await expect(service.createPlaybackToken('nao-existe')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('applyWebhookEvent', () => {
    it('marca READY em video.asset.ready, achando o modulo pelo assetId', async () => {
      const { service, mocks } = await build();

      await service.applyWebhookEvent({
        type: 'video.asset.ready',
        data: { id: 'asset-1', playback_ids: [{ id: 'pb-1' }] },
      });

      const call = mocks.updateManyModules.mock.calls[0][0];
      expect(call.where).toEqual({ muxAssetId: 'asset-1' });
      expect(call.data).toMatchObject({ videoStatus: 'READY', videoError: null });
    });

    it('marca ERRORED e guarda a mensagem em video.asset.errored', async () => {
      const { service, mocks } = await build();

      await service.applyWebhookEvent({
        type: 'video.asset.errored',
        data: { id: 'asset-1', errors: { messages: ['formato nao suportado'] } },
      });

      const { data } = mocks.updateManyModules.mock.calls[0][0];
      expect(data).toMatchObject({ videoStatus: 'ERRORED' });
      expect(data.videoError).toContain('formato nao suportado');
    });

    it('ignora evento desconhecido sem tocar no banco', async () => {
      const { service, mocks } = await build();

      await service.applyWebhookEvent({ type: 'video.live_stream.created', data: { id: 'x' } });

      expect(mocks.updateManyModules).not.toHaveBeenCalled();
    });

    it('ignora evento sem id de asset', async () => {
      const { service, mocks } = await build();

      await service.applyWebhookEvent({ type: 'video.asset.ready', data: {} });

      expect(mocks.updateManyModules).not.toHaveBeenCalled();
    });
  });
});
