import { INestApplication, NotFoundException, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { AccessService } from '../payments/access.service';
import request from 'supertest';
import { AuthService } from '../auth/auth.service';
import { AuthUser, Role } from '../auth/auth.types';
import { AuthenticatedRequest, FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { AdminContentController } from './admin-content.controller';
import { ContentController } from './content.controller';
import { ContentService } from './content.service';
import { VideoService } from './video.service';
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


function userWith(role: Role): AuthUser {
  return { uid: 'uid-123', email: 'pessoa@delcastanher.com', name: 'Pessoa', role };
}

const TICKET = {
  storagePath: 'lessons/les-1/materials/checklist.pdf',
  uploadUrl: 'https://storage.googleapis.com/escrita',
  headers: { 'Content-Type': 'application/pdf' },
  expiresAt: '2026-09-11T12:00:00.000Z',
};

const MATERIAL = {
  id: 'mat-1',
  fileName: 'Checklist.pdf',
  fileType: 'pdf',
  contentType: 'application/pdf',
  sizeBytes: 2048,
  order: 0,
  lessonId: 'les-1',
  moduleOrder: 1,
  moduleTitle: 'Fundamentos',
  downloadUrl: 'https://storage.googleapis.com/leitura',
  downloadExpiresAt: '2026-09-11T12:15:00.000Z',
};

/**
 * Mesmo arranjo dos demais `*.http.spec.ts`: sobe so os controllers, com o
 * ValidationPipe global do `main.ts`. O `FirebaseAuthGuard` e trocado por um
 * que injeta o usuario do papel pedido — mas o `RolesGuard` e o **real**, que
 * e justamente o que esta sob teste aqui.
 */
async function buildApp(
  content: Partial<Record<keyof ContentService, jest.Mock>>,
  role: Role = 'admin',
) {
  const moduleRef = await Test.createTestingModule({
    controllers: [AdminContentController, ContentController],
    providers: [
      { provide: AccessService, useValue: acessoLiberado() },
      Reflector,
      RolesGuard,
      { provide: ContentService, useValue: content },
      // O video tem suite propria (video.http.spec.ts); aqui ele so precisa
      // existir para os controllers subirem.
      { provide: VideoService, useValue: {} },
      { provide: AuthService, useValue: { verify: jest.fn() } },
    ],
  })
    .overrideGuard(FirebaseAuthGuard)
    .useValue({
      canActivate: (context: { switchToHttp: () => { getRequest: () => AuthenticatedRequest } }) => {
        context.switchToHttp().getRequest().user = userWith(role);

        return true;
      },
    })
    .compile();

  const app = moduleRef.createNestApplication();

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

describe('Content (HTTP)', () => {
  let app: INestApplication;

  afterEach(async () => {
    await app?.close();
  });

  describe('admin', () => {
    it('POST upload-url devolve a URL assinada para o administrador', async () => {
      const createMaterialUploadUrl = jest.fn().mockResolvedValue(TICKET);
      app = await buildApp({ createMaterialUploadUrl });

      const response = await request(app.getHttpServer())
        .post('/admin/lessons/les-1/materials/upload-url')
        .send({ fileName: 'Checklist.pdf', contentType: 'application/pdf', sizeBytes: 2048 })
        .expect(201);

      expect(response.body).toEqual(TICKET);
      expect(createMaterialUploadUrl).toHaveBeenCalledWith('les-1', {
        fileName: 'Checklist.pdf',
        contentType: 'application/pdf',
        sizeBytes: 2048,
      });
    });

    it('POST upload-url responde 403 para um usuario aluno', async () => {
      const createMaterialUploadUrl = jest.fn();
      app = await buildApp({ createMaterialUploadUrl }, 'aluno');

      await request(app.getHttpServer())
        .post('/admin/lessons/les-1/materials/upload-url')
        .send({ fileName: 'Checklist.pdf', contentType: 'application/pdf', sizeBytes: 2048 })
        .expect(403);

      expect(createMaterialUploadUrl).not.toHaveBeenCalled();
    });

    it('DELETE de material responde 403 para um usuario aluno', async () => {
      const removeMaterial = jest.fn();
      app = await buildApp({ removeMaterial }, 'aluno');

      await request(app.getHttpServer()).delete('/admin/materials/mat-1').expect(403);
      expect(removeMaterial).not.toHaveBeenCalled();
    });

    it('POST upload-url responde 400 sem o tamanho do arquivo', async () => {
      const createMaterialUploadUrl = jest.fn();
      app = await buildApp({ createMaterialUploadUrl });

      await request(app.getHttpServer())
        .post('/admin/lessons/les-1/materials/upload-url')
        .send({ fileName: 'Checklist.pdf', contentType: 'application/pdf' })
        .expect(400);

      expect(createMaterialUploadUrl).not.toHaveBeenCalled();
    });

    it('POST upload-url recusa campo desconhecido no corpo', async () => {
      const createMaterialUploadUrl = jest.fn();
      app = await buildApp({ createMaterialUploadUrl });

      // O aula alvo vem da URL: mandar lessonId no corpo e recusado.
      await request(app.getHttpServer())
        .post('/admin/lessons/les-1/materials/upload-url')
        .send({
          fileName: 'Checklist.pdf',
          contentType: 'application/pdf',
          sizeBytes: 2048,
          lessonId: 'mod-2',
        })
        .expect(400);

      expect(createMaterialUploadUrl).not.toHaveBeenCalled();
    });

    it('POST upload-url responde 404 para um lessonId inexistente', async () => {
      app = await buildApp({
        createMaterialUploadUrl: jest.fn().mockRejectedValue(new NotFoundException('Aula')),
      });

      await request(app.getHttpServer())
        .post('/admin/lessons/nao-existe/materials/upload-url')
        .send({ fileName: 'Checklist.pdf', contentType: 'application/pdf', sizeBytes: 2048 })
        .expect(404);
    });

    it('POST de confirmacao grava o material e devolve o item pronto', async () => {
      const confirmMaterial = jest.fn().mockResolvedValue(MATERIAL);
      app = await buildApp({ confirmMaterial });

      const response = await request(app.getHttpServer())
        .post('/admin/lessons/les-1/materials')
        .send({
          storagePath: TICKET.storagePath,
          fileName: 'Checklist.pdf',
          contentType: 'application/pdf',
        })
        .expect(201);

      expect(response.body).toEqual(MATERIAL);
      expect(confirmMaterial).toHaveBeenCalledWith('les-1', {
        storagePath: TICKET.storagePath,
        fileName: 'Checklist.pdf',
        contentType: 'application/pdf',
      });
    });

    it('POST de confirmacao responde 400 sem o storagePath', async () => {
      const confirmMaterial = jest.fn();
      app = await buildApp({ confirmMaterial });

      await request(app.getHttpServer())
        .post('/admin/lessons/les-1/materials')
        .send({ fileName: 'Checklist.pdf', contentType: 'application/pdf' })
        .expect(400);

      expect(confirmMaterial).not.toHaveBeenCalled();
    });

    it('DELETE responde 204 e chama o servico', async () => {
      const removeMaterial = jest.fn().mockResolvedValue(undefined);
      app = await buildApp({ removeMaterial });

      await request(app.getHttpServer()).delete('/admin/materials/mat-1').expect(204);
      expect(removeMaterial).toHaveBeenCalledWith('mat-1');
    });

    it('GET lista os materiais do aula para o painel', async () => {
      const listForLesson = jest.fn().mockResolvedValue([MATERIAL]);
      app = await buildApp({ listForLesson });

      const response = await request(app.getHttpServer())
        .get('/admin/lessons/les-1/materials')
        .expect(200);

      expect(response.body).toEqual([MATERIAL]);
    });
  });

  describe('aluno', () => {
    it('GET /modules/:lessonId/materials devolve a lista com URL assinada', async () => {
      const listForLesson = jest.fn().mockResolvedValue([MATERIAL]);
      app = await buildApp({ listForLesson }, 'aluno');

      const response = await request(app.getHttpServer())
        .get('/lessons/les-1/materials')
        .expect(200);

      expect(response.body[0]).toMatchObject({ downloadUrl: MATERIAL.downloadUrl });
      // O caminho do bucket nunca sai da API.
      expect(JSON.stringify(response.body)).not.toContain('lessons/les-1/materials/');
    });

    it('GET /materials devolve a central de materiais do curso', async () => {
      const listForCourse = jest.fn().mockResolvedValue([MATERIAL]);
      app = await buildApp({ listForCourse }, 'aluno');

      const response = await request(app.getHttpServer()).get('/materials').expect(200);

      expect(response.body).toHaveLength(1);
      expect(listForCourse).toHaveBeenCalled();
    });

    it('GET de aula inexistente responde 404', async () => {
      app = await buildApp(
        { listForLesson: jest.fn().mockRejectedValue(new NotFoundException('Aula')) },
        'aluno',
      );

      await request(app.getHttpServer()).get('/lessons/nao-existe/materials').expect(404);
    });
  });
});
