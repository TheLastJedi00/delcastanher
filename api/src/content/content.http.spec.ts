import { INestApplication, NotFoundException, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthService } from '../auth/auth.service';
import { AuthUser, Role } from '../auth/auth.types';
import { AuthenticatedRequest, FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { AdminContentController } from './admin-content.controller';
import { ContentController } from './content.controller';
import { ContentService } from './content.service';

function userWith(role: Role): AuthUser {
  return { uid: 'uid-123', email: 'pessoa@delcastanher.com', name: 'Pessoa', role };
}

const TICKET = {
  storagePath: 'modules/mod-1/materials/checklist.pdf',
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
  moduleId: 'mod-1',
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
      Reflector,
      RolesGuard,
      { provide: ContentService, useValue: content },
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
        .post('/admin/modules/mod-1/materials/upload-url')
        .send({ fileName: 'Checklist.pdf', contentType: 'application/pdf', sizeBytes: 2048 })
        .expect(201);

      expect(response.body).toEqual(TICKET);
      expect(createMaterialUploadUrl).toHaveBeenCalledWith('mod-1', {
        fileName: 'Checklist.pdf',
        contentType: 'application/pdf',
        sizeBytes: 2048,
      });
    });

    it('POST upload-url responde 403 para um usuario aluno', async () => {
      const createMaterialUploadUrl = jest.fn();
      app = await buildApp({ createMaterialUploadUrl }, 'aluno');

      await request(app.getHttpServer())
        .post('/admin/modules/mod-1/materials/upload-url')
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
        .post('/admin/modules/mod-1/materials/upload-url')
        .send({ fileName: 'Checklist.pdf', contentType: 'application/pdf' })
        .expect(400);

      expect(createMaterialUploadUrl).not.toHaveBeenCalled();
    });

    it('POST upload-url recusa campo desconhecido no corpo', async () => {
      const createMaterialUploadUrl = jest.fn();
      app = await buildApp({ createMaterialUploadUrl });

      // O modulo alvo vem da URL: mandar moduleId no corpo e recusado.
      await request(app.getHttpServer())
        .post('/admin/modules/mod-1/materials/upload-url')
        .send({
          fileName: 'Checklist.pdf',
          contentType: 'application/pdf',
          sizeBytes: 2048,
          moduleId: 'mod-2',
        })
        .expect(400);

      expect(createMaterialUploadUrl).not.toHaveBeenCalled();
    });

    it('POST upload-url responde 404 para um moduleId inexistente', async () => {
      app = await buildApp({
        createMaterialUploadUrl: jest.fn().mockRejectedValue(new NotFoundException('Modulo')),
      });

      await request(app.getHttpServer())
        .post('/admin/modules/nao-existe/materials/upload-url')
        .send({ fileName: 'Checklist.pdf', contentType: 'application/pdf', sizeBytes: 2048 })
        .expect(404);
    });

    it('POST de confirmacao grava o material e devolve o item pronto', async () => {
      const confirmMaterial = jest.fn().mockResolvedValue(MATERIAL);
      app = await buildApp({ confirmMaterial });

      const response = await request(app.getHttpServer())
        .post('/admin/modules/mod-1/materials')
        .send({
          storagePath: TICKET.storagePath,
          fileName: 'Checklist.pdf',
          contentType: 'application/pdf',
        })
        .expect(201);

      expect(response.body).toEqual(MATERIAL);
      expect(confirmMaterial).toHaveBeenCalledWith('mod-1', {
        storagePath: TICKET.storagePath,
        fileName: 'Checklist.pdf',
        contentType: 'application/pdf',
      });
    });

    it('POST de confirmacao responde 400 sem o storagePath', async () => {
      const confirmMaterial = jest.fn();
      app = await buildApp({ confirmMaterial });

      await request(app.getHttpServer())
        .post('/admin/modules/mod-1/materials')
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

    it('GET lista os materiais do modulo para o painel', async () => {
      const listForModule = jest.fn().mockResolvedValue([MATERIAL]);
      app = await buildApp({ listForModule });

      const response = await request(app.getHttpServer())
        .get('/admin/modules/mod-1/materials')
        .expect(200);

      expect(response.body).toEqual([MATERIAL]);
    });
  });

  describe('aluno', () => {
    it('GET /modules/:moduleId/materials devolve a lista com URL assinada', async () => {
      const listForModule = jest.fn().mockResolvedValue([MATERIAL]);
      app = await buildApp({ listForModule }, 'aluno');

      const response = await request(app.getHttpServer())
        .get('/modules/mod-1/materials')
        .expect(200);

      expect(response.body[0]).toMatchObject({ downloadUrl: MATERIAL.downloadUrl });
      // O caminho do bucket nunca sai da API.
      expect(JSON.stringify(response.body)).not.toContain('modules/mod-1/materials/');
    });

    it('GET /materials devolve a central de materiais do curso', async () => {
      const listForCourse = jest.fn().mockResolvedValue([MATERIAL]);
      app = await buildApp({ listForCourse }, 'aluno');

      const response = await request(app.getHttpServer()).get('/materials').expect(200);

      expect(response.body).toHaveLength(1);
      expect(listForCourse).toHaveBeenCalled();
    });

    it('GET de modulo inexistente responde 404', async () => {
      app = await buildApp(
        { listForModule: jest.fn().mockRejectedValue(new NotFoundException('Modulo')) },
        'aluno',
      );

      await request(app.getHttpServer()).get('/modules/nao-existe/materials').expect(404);
    });
  });
});
