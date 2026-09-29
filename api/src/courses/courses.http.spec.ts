import { INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthService } from '../auth/auth.service';
import { AuthUser, Role } from '../auth/auth.types';
import { AuthenticatedRequest, FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { ACCESS_MONTHS } from '../payments/access.service';
import { PrismaService } from '../prisma/prisma.service';
import { AdminCoursesController } from './admin-courses.controller';
import { CoursesController } from './courses.controller';
import { CoursesService } from './courses.service';

const COURSE = { id: 'course-1', slug: 'imersao-rh', title: 'Imersão RH Estratégico', workloadHours: null as number | null };

/** Doze aulas: dez com video processado (51 min no total), duas sem. */
const LESSONS = [
  ...Array.from({ length: 10 }, (_, index) => ({ durationSeconds: index === 0 ? 360 : 300 })),
  { durationSeconds: null },
  { durationSeconds: null },
];

function fakePrisma(course = { ...COURSE }) {
  return {
    course: {
      findUnique: jest.fn(async ({ where }: { where: { slug: string } }) =>
        where.slug === course.slug ? course : null,
      ),
      update: jest.fn(async ({ data }: { data: { workloadHours: number | null } }) => {
        Object.assign(course, data);

        return course;
      }),
    },
    lesson: {
      aggregate: jest.fn(async ({ where }: { where: { durationSeconds?: { not: null } } }) => {
        const rows = where.durationSeconds ? LESSONS.filter((row) => row.durationSeconds !== null) : LESSONS;

        return {
          _count: { _all: rows.length },
          _sum: { durationSeconds: rows.reduce((total, row) => total + (row.durationSeconds ?? 0), 0) },
        };
      }),
      count: jest.fn().mockResolvedValue(LESSONS.length),
    },
  };
}

async function buildApp(role: Role | null = 'admin', prisma = fakePrisma()) {
  const moduleRef = await Test.createTestingModule({
    controllers: [CoursesController, AdminCoursesController],
    providers: [
      Reflector,
      RolesGuard,
      CoursesService,
      { provide: PrismaService, useValue: prisma },
      { provide: AuthService, useValue: { verify: jest.fn() } },
    ],
  })
    .overrideGuard(FirebaseAuthGuard)
    .useValue({
      canActivate: (context: { switchToHttp: () => { getRequest: () => AuthenticatedRequest } }) => {
        if (!role) {
          throw new UnauthorizedException();
        }

        const user: AuthUser = { uid: 'uid-1', email: 'admin@delcastanher.com', name: 'Admin', role };
        context.switchToHttp().getRequest().user = user;

        return true;
      },
    })
    .compile();

  const app = moduleRef.createNestApplication();

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, stopAtFirstError: true }),
  );
  await app.init();

  return { app, prisma };
}

const ADMIN = '/admin/courses/imersao-rh';

/** Spec 022, decisoes 12 a 14. */
describe('Cursos (HTTP)', () => {
  let app: INestApplication;

  afterEach(async () => {
    await app?.close();
  });

  describe('GET /courses/:slug/summary', () => {
    it('devolve a carga horaria nula e os meses de acesso, sem sessao', async () => {
      ({ app } = await buildApp(null));

      const response = await request(app.getHttpServer()).get('/courses/imersao-rh/summary').expect(200);

      expect(response.body).toEqual({ workloadHours: null, accessMonths: ACCESS_MONTHS });
    });

    it('devolve a carga horaria definida', async () => {
      ({ app } = await buildApp(null, fakePrisma({ ...COURSE, workloadHours: 24 })));

      const response = await request(app.getHttpServer()).get('/courses/imersao-rh/summary').expect(200);

      expect(response.body).toEqual({ workloadHours: 24, accessMonths: 6 });
    });

    it('404 para slug inexistente', async () => {
      ({ app } = await buildApp(null));

      await request(app.getHttpServer()).get('/courses/outro/summary').expect(404);
    });
  });

  describe('autorizacao das rotas admin', () => {
    it('401 sem sessao e 403 com aluno, nas duas rotas', async () => {
      ({ app } = await buildApp(null));
      await request(app.getHttpServer()).get(ADMIN).expect(401);
      await request(app.getHttpServer()).patch(ADMIN).send({ workloadHours: 24 }).expect(401);
      await app.close();

      ({ app } = await buildApp('aluno'));
      await request(app.getHttpServer()).get(ADMIN).expect(403);
      await request(app.getHttpServer()).patch(ADMIN).send({ workloadHours: 24 }).expect(403);
    });
  });

  describe('GET /admin/courses/:slug', () => {
    it('soma so as aulas com duracao processada', async () => {
      ({ app } = await buildApp());

      const response = await request(app.getHttpServer()).get(ADMIN).expect(200);

      expect(response.body).toEqual({
        slug: 'imersao-rh',
        title: 'Imersão RH Estratégico',
        workloadHours: null,
        videoSeconds: 360 + 9 * 300,
        videoLessons: 10,
        totalLessons: 12,
      });
    });

    it('404 para slug inexistente', async () => {
      ({ app } = await buildApp());

      await request(app.getHttpServer()).get('/admin/courses/outro').expect(404);
    });
  });

  describe('PATCH /admin/courses/:slug', () => {
    it('aceita de 1 a 999', async () => {
      let prisma: ReturnType<typeof fakePrisma>;
      ({ app, prisma } = await buildApp());

      for (const workloadHours of [1, 24, 999]) {
        const response = await request(app.getHttpServer()).patch(ADMIN).send({ workloadHours }).expect(200);

        expect(response.body.workloadHours).toBe(workloadHours);
      }

      expect(prisma.course.update).toHaveBeenLastCalledWith({
        where: { id: 'course-1' },
        data: { workloadHours: 999 },
      });
    });

    it('aceita nulo para voltar a "a definir"', async () => {
      ({ app } = await buildApp('admin', fakePrisma({ ...COURSE, workloadHours: 24 })));

      const response = await request(app.getHttpServer()).patch(ADMIN).send({ workloadHours: null }).expect(200);

      expect(response.body.workloadHours).toBeNull();
    });

    it('recusa zero, negativo, fracao, acima de 999, texto e ausencia', async () => {
      let prisma: ReturnType<typeof fakePrisma>;
      ({ app, prisma } = await buildApp());

      for (const body of [
        { workloadHours: 0 },
        { workloadHours: -3 },
        { workloadHours: 2.5 },
        { workloadHours: 1000 },
        { workloadHours: '12' },
        { workloadHours: 'doze' },
        {},
      ]) {
        await request(app.getHttpServer()).patch(ADMIN).send(body).expect(400);
      }

      expect(prisma.course.update).not.toHaveBeenCalled();
    });

    it('so a carga horaria e editavel', async () => {
      ({ app } = await buildApp());

      await request(app.getHttpServer()).patch(ADMIN).send({ workloadHours: 24, title: 'Outro' }).expect(400);
    });

    it('404 para slug inexistente', async () => {
      ({ app } = await buildApp());

      await request(app.getHttpServer()).patch('/admin/courses/outro').send({ workloadHours: 24 }).expect(404);
    });
  });
});
