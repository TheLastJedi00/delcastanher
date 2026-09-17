import { ForbiddenException, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthUser } from '../auth/auth.types';
import { AuthenticatedRequest, FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { AccessService } from '../payments/access.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { ProgressController } from './progress.controller';
import { ProgressService } from './progress.service';

const ALUNO: AuthUser = {
  uid: 'uid-aluno',
  email: 'aluno@delcastanher.com',
  name: 'Aluno',
  role: 'aluno',
};

const EXPIRES = new Date('2027-03-17T12:00:00.000Z');

/**
 * Curso com dois modulos, um comprado e outro nao: e o caso que a spec precisa
 * enxergar, porque e o estado normal de quem compra por modulo.
 */
function courseRow() {
  return {
    id: 'course-1',
    slug: 'imersao-rh',
    title: 'Imersao RH Estrategico',
    workloadHours: null,
    modules: [
      {
        id: 'mod-1',
        order: 1,
        title: 'Fundamentos',
        summary: 'Resumo',
        priceCents: 19900,
        lessons: [
          {
            id: 'les-1',
            order: 1,
            title: 'Aula 1',
            summary: '',
            videoStoragePath: 'p',
            videoStatus: 'READY',
            durationSeconds: 600,
          },
        ],
      },
      {
        id: 'mod-2',
        order: 2,
        title: 'Pratica',
        summary: 'Resumo',
        priceCents: 19900,
        lessons: [
          {
            id: 'les-2',
            order: 1,
            title: 'Aula 2',
            summary: '',
            videoStoragePath: 'p',
            videoStatus: 'READY',
            durationSeconds: 600,
          },
        ],
      },
    ],
  };
}

function buildService(activeMap: Map<string, Date>) {
  const prisma = {
    course: { findUnique: jest.fn().mockResolvedValue(courseRow()) },
    lessonProgress: {
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
    lesson: { findUnique: jest.fn().mockResolvedValue({ id: 'les-1', moduleId: 'mod-1' }) },
  };

  const access = {
    activeMap: jest.fn().mockResolvedValue(activeMap),
    requireForLesson: jest.fn().mockResolvedValue(undefined),
  };

  return { prisma, access };
}

async function buildApp(activeMap: Map<string, Date>) {
  const { prisma, access } = buildService(activeMap);

  const moduleRef = await Test.createTestingModule({
    controllers: [ProgressController],
    providers: [
      ProgressService,
      { provide: PrismaService, useValue: prisma },
      { provide: UsersService, useValue: { findOrCreate: jest.fn() } },
      { provide: AccessService, useValue: access },
    ],
  })
    .overrideGuard(FirebaseAuthGuard)
    .useValue({
      canActivate: (context: { switchToHttp: () => { getRequest: () => AuthenticatedRequest } }) => {
        context.switchToHttp().getRequest().user = ALUNO;

        return true;
      },
    })
    .compile();

  const app: INestApplication = moduleRef.createNestApplication();

  await app.init();

  return { app, prisma, access };
}

describe('Progresso sob o portao de acesso', () => {
  /**
   * Decisao 17: a trilha continua inteira. O aluno precisa **ver** o que existe
   * para decidir comprar — esconder o modulo nao comprado transformaria a loja
   * em um catalogo cego e a trilha em uma mentira sobre o tamanho do curso.
   */
  describe('GET /progress/me', () => {
    it('devolve todos os modulos, com o estado de acesso de cada um', async () => {
      const { app } = await buildApp(new Map([['mod-1', EXPIRES]]));

      const response = await request(app.getHttpServer()).get('/progress/me').expect(200);

      expect(response.body.modules).toHaveLength(2);
      expect(response.body.modules[0].access).toEqual({
        unlocked: true,
        expiresAt: EXPIRES.toISOString(),
        priceCents: 19900,
      });
      expect(response.body.modules[1].access).toEqual({
        unlocked: false,
        expiresAt: null,
        priceCents: 19900,
      });

      await app.close();
    });

    // Task 1.5 e decisao 4: uma consulta de acesso por requisicao. Um `hasActive`
    // por modulo transformaria a trilha em um N+1 que cresce com o catalogo.
    it('consulta o acesso uma unica vez para a trilha inteira', async () => {
      const { app, access } = await buildApp(new Map([['mod-1', EXPIRES]]));

      await request(app.getHttpServer()).get('/progress/me').expect(200);

      expect(access.activeMap).toHaveBeenCalledTimes(1);

      await app.close();
    });
  });

  describe('PATCH /progress/me/lessons/:lessonId', () => {
    it('marca a aula de um modulo com acesso ativo', async () => {
      const { app, prisma } = await buildApp(new Map([['mod-1', EXPIRES]]));

      await request(app.getHttpServer())
        .patch('/progress/me/lessons/les-1')
        .send({ completed: true })
        .expect(200);

      expect(prisma.lessonProgress.upsert).toHaveBeenCalled();

      await app.close();
    });

    // Sem esta guarda, quem nao comprou poderia "concluir" a trilha inteira por
    // requisicao direta e sacar o diploma sem assistir — nem pagar.
    it('recusa com 403 e nao grava progresso sem acesso ao modulo da aula', async () => {
      const { prisma, access } = buildService(new Map());

      access.requireForLesson = jest.fn().mockRejectedValue(new ForbiddenException('sem acesso'));

      const moduleRef = await Test.createTestingModule({
        controllers: [ProgressController],
        providers: [
          ProgressService,
          { provide: PrismaService, useValue: prisma },
          { provide: UsersService, useValue: { findOrCreate: jest.fn() } },
          { provide: AccessService, useValue: access },
        ],
      })
        .overrideGuard(FirebaseAuthGuard)
        .useValue({
          canActivate: (context: {
            switchToHttp: () => { getRequest: () => AuthenticatedRequest };
          }) => {
            context.switchToHttp().getRequest().user = ALUNO;

            return true;
          },
        })
        .compile();

      const app: INestApplication = moduleRef.createNestApplication();

      await app.init();

      await request(app.getHttpServer())
        .patch('/progress/me/lessons/les-2')
        .send({ completed: true })
        .expect(403);

      expect(prisma.lessonProgress.upsert).not.toHaveBeenCalled();

      await app.close();
    });
  });
});
