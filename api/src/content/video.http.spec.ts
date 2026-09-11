import { ConflictException, INestApplication, NotFoundException, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthService } from '../auth/auth.service';
import { AuthUser, Role } from '../auth/auth.types';
import { AuthenticatedRequest, FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { MuxService } from '../mux/mux.service';
import { AdminContentController } from './admin-content.controller';
import { ContentController } from './content.controller';
import { ContentService } from './content.service';
import { MuxWebhookController } from './mux-webhook.controller';
import { VideoService } from './video.service';

function userWith(role: Role): AuthUser {
  return { uid: 'uid-123', email: 'pessoa@delcastanher.com', name: 'Pessoa', role };
}

const STATE = {
  moduleId: 'mod-1',
  hasVideo: true,
  status: 'PROCESSING',
  playbackId: 'pb-1',
  fileName: 'Aula 01.mp4',
  sizeBytes: 4096,
  error: null,
};

async function buildApp(
  video: Partial<Record<keyof VideoService, jest.Mock>>,
  options: { role?: Role; verifySignature?: jest.Mock } = {},
) {
  const moduleRef = await Test.createTestingModule({
    controllers: [AdminContentController, ContentController, MuxWebhookController],
    providers: [
      Reflector,
      RolesGuard,
      { provide: VideoService, useValue: video },
      { provide: ContentService, useValue: {} },
      {
        provide: MuxService,
        useValue: {
          verifyWebhookSignature: options.verifySignature ?? jest.fn().mockReturnValue(true),
        },
      },
      { provide: AuthService, useValue: { verify: jest.fn() } },
    ],
  })
    .overrideGuard(FirebaseAuthGuard)
    .useValue({
      canActivate: (context: { switchToHttp: () => { getRequest: () => AuthenticatedRequest } }) => {
        context.switchToHttp().getRequest().user = userWith(options.role ?? 'admin');

        return true;
      },
    })
    .compile();

  const app = moduleRef.createNestApplication({ rawBody: true });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      stopAtFirstError: true,
    }),
  );
  await app.init();

  return app;
}

describe('Video (HTTP)', () => {
  let app: INestApplication;

  afterEach(async () => {
    await app?.close();
  });

  describe('admin', () => {
    it('POST video/upload-url devolve a URL assinada', async () => {
      const createUploadUrl = jest.fn().mockResolvedValue({
        storagePath: 'modules/mod-1/video/aula-01.mp4',
        uploadUrl: 'https://storage.googleapis.com/escrita',
        headers: { 'Content-Type': 'video/mp4' },
        expiresAt: '2026-09-11T12:00:00.000Z',
      });
      app = await buildApp({ createUploadUrl });

      const response = await request(app.getHttpServer())
        .post('/admin/modules/mod-1/video/upload-url')
        .send({ fileName: 'Aula 01.mp4', contentType: 'video/mp4', sizeBytes: 4096 })
        .expect(201);

      expect(response.body.uploadUrl).toBe('https://storage.googleapis.com/escrita');
    });

    it('POST video/upload-url responde 403 para um aluno', async () => {
      const createUploadUrl = jest.fn();
      app = await buildApp({ createUploadUrl }, { role: 'aluno' });

      await request(app.getHttpServer())
        .post('/admin/modules/mod-1/video/upload-url')
        .send({ fileName: 'Aula 01.mp4', contentType: 'video/mp4', sizeBytes: 4096 })
        .expect(403);

      expect(createUploadUrl).not.toHaveBeenCalled();
    });

    it('POST de confirmacao devolve o estado do processamento', async () => {
      const confirmUpload = jest.fn().mockResolvedValue(STATE);
      app = await buildApp({ confirmUpload });

      const response = await request(app.getHttpServer())
        .post('/admin/modules/mod-1/video')
        .send({
          storagePath: 'modules/mod-1/video/aula-01.mp4',
          fileName: 'Aula 01.mp4',
          contentType: 'video/mp4',
        })
        .expect(201);

      expect(response.body).toEqual(STATE);
    });

    it('POST de confirmacao responde 400 sem o storagePath', async () => {
      const confirmUpload = jest.fn();
      app = await buildApp({ confirmUpload });

      await request(app.getHttpServer())
        .post('/admin/modules/mod-1/video')
        .send({ fileName: 'Aula 01.mp4', contentType: 'video/mp4' })
        .expect(400);

      expect(confirmUpload).not.toHaveBeenCalled();
    });

    it('GET video devolve o estado da ingestao', async () => {
      const getState = jest.fn().mockResolvedValue(STATE);
      app = await buildApp({ getState });

      const response = await request(app.getHttpServer())
        .get('/admin/modules/mod-1/video')
        .expect(200);

      expect(response.body).toMatchObject({ status: 'PROCESSING' });
    });

    it('GET video responde 403 para um aluno', async () => {
      app = await buildApp({ getState: jest.fn() }, { role: 'aluno' });

      await request(app.getHttpServer()).get('/admin/modules/mod-1/video').expect(403);
    });

    it('GET video responde 404 para modulo inexistente', async () => {
      app = await buildApp({
        getState: jest.fn().mockRejectedValue(new NotFoundException('Modulo')),
      });

      await request(app.getHttpServer()).get('/admin/modules/nao-existe/video').expect(404);
    });
  });

  describe('aluno', () => {
    it('GET playback-token devolve playbackId, token e expiracao', async () => {
      const createPlaybackToken = jest.fn().mockResolvedValue({
        playbackId: 'pb-1',
        token: 'jwt-curto',
        expiresAt: '2026-09-11T14:00:00.000Z',
      });
      app = await buildApp({ createPlaybackToken }, { role: 'aluno' });

      const response = await request(app.getHttpServer())
        .get('/modules/mod-1/playback-token')
        .expect(200);

      expect(response.body).toMatchObject({ playbackId: 'pb-1', token: 'jwt-curto' });
    });

    it('GET playback-token responde 409 com o video ainda em processamento', async () => {
      app = await buildApp(
        {
          createPlaybackToken: jest
            .fn()
            .mockRejectedValue(new ConflictException('ainda processando')),
        },
        { role: 'aluno' },
      );

      await request(app.getHttpServer()).get('/modules/mod-1/playback-token').expect(409);
    });
  });

  describe('webhook', () => {
    const event = { type: 'video.asset.ready', data: { id: 'asset-1' } };

    it('aceita o evento com assinatura valida e aplica no banco', async () => {
      const applyWebhookEvent = jest.fn().mockResolvedValue(undefined);
      app = await buildApp({ applyWebhookEvent });

      await request(app.getHttpServer())
        .post('/webhooks/mux')
        .set('mux-signature', 't=1,v1=abc')
        .send(event)
        .expect(200);

      expect(applyWebhookEvent).toHaveBeenCalledWith(expect.objectContaining({ type: event.type }));
    });

    it('responde 401 e nao aplica nada com assinatura invalida', async () => {
      const applyWebhookEvent = jest.fn();
      app = await buildApp(
        { applyWebhookEvent },
        { verifySignature: jest.fn().mockReturnValue(false) },
      );

      await request(app.getHttpServer())
        .post('/webhooks/mux')
        .set('mux-signature', 't=1,v1=forjada')
        .send(event)
        .expect(401);

      expect(applyWebhookEvent).not.toHaveBeenCalled();
    });

    it('verifica a assinatura contra o corpo cru, e nao contra o JSON reserializado', async () => {
      const verifySignature = jest.fn().mockReturnValue(true);
      app = await buildApp({ applyWebhookEvent: jest.fn() }, { verifySignature });

      const raw = '{"type":"video.asset.ready","data":{"id":"asset-1"}}';

      await request(app.getHttpServer())
        .post('/webhooks/mux')
        .set('mux-signature', 't=1,v1=abc')
        .set('Content-Type', 'application/json')
        .send(raw)
        .expect(200);

      expect(verifySignature).toHaveBeenCalledWith(raw, 't=1,v1=abc');
    });

    it('responde 200 para evento desconhecido, para nao provocar reentrega', async () => {
      const applyWebhookEvent = jest.fn().mockResolvedValue(undefined);
      app = await buildApp({ applyWebhookEvent });

      await request(app.getHttpServer())
        .post('/webhooks/mux')
        .set('mux-signature', 't=1,v1=abc')
        .send({ type: 'video.live_stream.created', data: { id: 'x' } })
        .expect(200);
    });

    it('nao exige sessao: a rota fica fora do FirebaseAuthGuard', async () => {
      const applyWebhookEvent = jest.fn().mockResolvedValue(undefined);
      app = await buildApp({ applyWebhookEvent });

      // Sem Authorization: se o guard cobrisse a rota, isto seria 401.
      await request(app.getHttpServer())
        .post('/webhooks/mux')
        .set('mux-signature', 't=1,v1=abc')
        .send(event)
        .expect(200);
    });
  });
});
