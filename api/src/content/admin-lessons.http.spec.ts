import { BadRequestException, INestApplication, NotFoundException, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthService } from '../auth/auth.service';
import { AuthUser, Role } from '../auth/auth.types';
import { AuthenticatedRequest, FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { AdminLessonsController } from './admin-lessons.controller';
import { LessonsService } from './lessons.service';

function userWith(role: Role): AuthUser {
  return { uid: 'uid-123', email: 'pessoa@delcastanher.com', name: 'Pessoa', role };
}

const LESSON = {
  id: 'les-1',
  moduleId: 'mod-1',
  order: 1,
  title: 'O papel do RH',
  summary: 'Aula 1',
  video: {
    lessonId: 'les-1',
    hasVideo: false,
    status: null,
    playbackId: null,
    fileName: null,
    sizeBytes: null,
    error: null,
    durationSeconds: null,
  },
  materialCount: 0,
  completedBy: 0,
};

const MODULE = {
  id: 'mod-1',
  order: 1,
  title: 'Fundamentos',
  summary: 'Resumo',
  lessonCount: 3,
  certificateCount: 1,
};

/**
 * Mesmo arranjo dos demais `*.http.spec.ts`: sobe so o controller, com o
 * ValidationPipe global do `main.ts`. O `FirebaseAuthGuard` e trocado por um
 * que injeta o usuario do papel pedido; o `RolesGuard` e o **real**.
 */
async function buildApp(
  lessons: Partial<Record<keyof LessonsService, jest.Mock>>,
  role: Role = 'admin',
) {
  const moduleRef = await Test.createTestingModule({
    controllers: [AdminLessonsController],
    providers: [
      Reflector,
      RolesGuard,
      { provide: LessonsService, useValue: lessons },
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

describe('Admin — modulos e aulas (HTTP)', () => {
  let app: INestApplication;

  afterEach(async () => {
    await app?.close();
  });

  describe('aulas', () => {
    it('GET lista as aulas do modulo', async () => {
      const listForModule = jest.fn().mockResolvedValue([LESSON]);
      app = await buildApp({ listForModule });

      const response = await request(app.getHttpServer())
        .get('/admin/modules/mod-1/lessons')
        .expect(200);

      expect(listForModule).toHaveBeenCalledWith('mod-1');
      expect(response.body[0]).toMatchObject({ id: 'les-1', completedBy: 0 });
    });

    it('POST cria a aula', async () => {
      const createLesson = jest.fn().mockResolvedValue(LESSON);
      app = await buildApp({ createLesson });

      await request(app.getHttpServer())
        .post('/admin/modules/mod-1/lessons')
        .send({ title: 'Nova aula', summary: 'Resumo da aula' })
        .expect(201);

      expect(createLesson).toHaveBeenCalledWith('mod-1', {
        title: 'Nova aula',
        summary: 'Resumo da aula',
      });
    });

    it('POST recusa titulo curto', async () => {
      const createLesson = jest.fn();
      app = await buildApp({ createLesson });

      await request(app.getHttpServer())
        .post('/admin/modules/mod-1/lessons')
        .send({ title: 'x', summary: 'Resumo da aula' })
        .expect(400);

      expect(createLesson).not.toHaveBeenCalled();
    });

    it('POST recusa a ordem vinda do cliente', async () => {
      const createLesson = jest.fn();
      app = await buildApp({ createLesson });

      // A posicao e do servidor: a aula nasce no fim da lista.
      await request(app.getHttpServer())
        .post('/admin/modules/mod-1/lessons')
        .send({ title: 'Nova aula', summary: 'Resumo da aula', order: 1 })
        .expect(400);

      expect(createLesson).not.toHaveBeenCalled();
    });

    it('PATCH renomeia sem exigir o resumo', async () => {
      const updateLesson = jest.fn().mockResolvedValue(LESSON);
      app = await buildApp({ updateLesson });

      await request(app.getHttpServer())
        .patch('/admin/lessons/les-1')
        .send({ title: 'Outro titulo' })
        .expect(200);

      expect(updateLesson).toHaveBeenCalledWith('les-1', { title: 'Outro titulo' });
    });

    it('DELETE remove a aula', async () => {
      const removeLesson = jest.fn().mockResolvedValue(undefined);
      app = await buildApp({ removeLesson });

      await request(app.getHttpServer()).delete('/admin/lessons/les-1').expect(204);

      expect(removeLesson).toHaveBeenCalledWith('les-1');
    });

    it('DELETE responde 404 para aula inexistente', async () => {
      app = await buildApp({
        removeLesson: jest.fn().mockRejectedValue(new NotFoundException('Aula')),
      });

      await request(app.getHttpServer()).delete('/admin/lessons/nao-existe').expect(404);
    });

    it('PATCH de ordem manda a lista completa de ids', async () => {
      const reorderLessons = jest.fn().mockResolvedValue(undefined);
      app = await buildApp({ reorderLessons });

      await request(app.getHttpServer())
        .patch('/admin/modules/mod-1/lessons/order')
        .send({ ids: ['les-2', 'les-1'] })
        .expect(204);

      expect(reorderLessons).toHaveBeenCalledWith('mod-1', ['les-2', 'les-1']);
    });

    it('PATCH de ordem responde 400 com lista vazia', async () => {
      const reorderLessons = jest.fn();
      app = await buildApp({ reorderLessons });

      await request(app.getHttpServer())
        .patch('/admin/modules/mod-1/lessons/order')
        .send({ ids: [] })
        .expect(400);

      expect(reorderLessons).not.toHaveBeenCalled();
    });

    it('PATCH de ordem propaga o 400 da lista incompleta', async () => {
      app = await buildApp({
        reorderLessons: jest.fn().mockRejectedValue(new BadRequestException('incompleta')),
      });

      await request(app.getHttpServer())
        .patch('/admin/modules/mod-1/lessons/order')
        .send({ ids: ['les-1'] })
        .expect(400);
    });
  });

  describe('modulos', () => {
    it('GET lista a grade com as contagens', async () => {
      const listModules = jest.fn().mockResolvedValue([MODULE]);
      app = await buildApp({ listModules });

      const response = await request(app.getHttpServer()).get('/admin/modules').expect(200);

      expect(response.body[0]).toMatchObject({ lessonCount: 3, certificateCount: 1 });
    });

    it('POST cria o modulo', async () => {
      const createModule = jest.fn().mockResolvedValue(MODULE);
      app = await buildApp({ createModule });

      await request(app.getHttpServer())
        .post('/admin/modules')
        .send({ title: 'Novo modulo', summary: 'Resumo do modulo' })
        .expect(201);

      expect(createModule).toHaveBeenCalledWith({
        title: 'Novo modulo',
        summary: 'Resumo do modulo',
      });
    });

    it('PATCH renomeia o modulo', async () => {
      const updateModule = jest.fn().mockResolvedValue(MODULE);
      app = await buildApp({ updateModule });

      await request(app.getHttpServer())
        .patch('/admin/modules/mod-1')
        .send({ title: 'Outro titulo' })
        .expect(200);

      expect(updateModule).toHaveBeenCalledWith('mod-1', { title: 'Outro titulo' });
    });

    it('PATCH de ordem da grade nao disputa a rota de renomear', async () => {
      const reorderModules = jest.fn().mockResolvedValue(undefined);
      const updateModule = jest.fn();
      app = await buildApp({ reorderModules, updateModule });

      await request(app.getHttpServer())
        .patch('/admin/course/modules/order')
        .send({ ids: ['mod-2', 'mod-1'] })
        .expect(204);

      expect(reorderModules).toHaveBeenCalledWith(['mod-2', 'mod-1']);
      expect(updateModule).not.toHaveBeenCalled();
    });

    it('nao existe rota para apagar modulo', async () => {
      app = await buildApp({});

      // Decisao 15: modulo com diploma emitido nao e removivel pelo painel, e
      // a FK esta em RESTRICT justamente para isso.
      await request(app.getHttpServer()).delete('/admin/modules/mod-1').expect(404);
    });
  });

  describe('papel', () => {
    it('aluno autenticado nao passa pelo RolesGuard', async () => {
      const createLesson = jest.fn();
      app = await buildApp({ createLesson }, 'aluno');

      await request(app.getHttpServer())
        .post('/admin/modules/mod-1/lessons')
        .send({ title: 'Nova aula', summary: 'Resumo da aula' })
        .expect(403);

      expect(createLesson).not.toHaveBeenCalled();
    });

    it('aluno nao lista a grade', async () => {
      const listModules = jest.fn();
      app = await buildApp({ listModules }, 'aluno');

      await request(app.getHttpServer()).get('/admin/modules').expect(403);

      expect(listModules).not.toHaveBeenCalled();
    });
  });
});
