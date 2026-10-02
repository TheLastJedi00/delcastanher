import { INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthService } from '../auth/auth.service';
import { AuthUser } from '../auth/auth.types';
import { AuthenticatedRequest, FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { AdminCoursesController } from '../courses/admin-courses.controller';
import { CoursesController } from '../courses/courses.controller';
import { CoursesService } from '../courses/courses.service';
import { AdminLegalController } from '../legal/admin-legal.controller';
import { LegalController } from '../legal/legal.controller';
import { LegalDocumentsService } from '../legal/legal-documents.service';
import { PUBLIC_CACHE_CONTROL } from './cache-control.decorator';

const PRIVACY = {
  id: 'v1',
  kind: 'PRIVACY',
  content: '## 1. Objetivo\n\nTexto.',
  policyVersion: '2026-09-13',
  changeKind: 'INITIAL',
  publishedAt: new Date('2026-09-13T12:00:00.000Z'),
  publishedById: null,
  publishedByEmail: null,
};

async function buildApp() {
  const moduleRef = await Test.createTestingModule({
    controllers: [LegalController, AdminLegalController, CoursesController, AdminCoursesController],
    providers: [
      Reflector,
      RolesGuard,
      {
        provide: LegalDocumentsService,
        useValue: {
          current: jest.fn(async (kind: string) => (kind === 'PRIVACY' ? PRIVACY : null)),
          policyVersion: jest.fn().mockResolvedValue('2026-09-13'),
          published: jest.fn().mockResolvedValue(['PRIVACY', 'COOKIES']),
          adminList: jest.fn().mockResolvedValue({ policyVersion: '2026-09-13', documents: [] }),
          versions: jest.fn().mockResolvedValue([]),
        },
      },
      {
        provide: CoursesService,
        useValue: {
          summary: jest.fn(async (slug: string) => {
            if (slug !== 'imersao-rh') {
              const { NotFoundException } = await import('@nestjs/common');
              throw new NotFoundException();
            }

            return { workloadHours: null, accessMonths: 6 };
          }),
          adminView: jest.fn().mockResolvedValue({ slug: 'imersao-rh' }),
        },
      },
      { provide: AuthService, useValue: { verify: jest.fn() } },
    ],
  })
    .overrideGuard(FirebaseAuthGuard)
    .useValue({
      canActivate: (context: { switchToHttp: () => { getRequest: () => AuthenticatedRequest } }) => {
        const req = context.switchToHttp().getRequest();

        if (!req.headers.authorization) {
          throw new UnauthorizedException();
        }

        const user: AuthUser = { uid: 'uid-1', email: 'admin@delcastanher.com', name: 'Admin', role: 'admin' };
        req.user = user;

        return true;
      },
    })
    .compile();

  const app = moduleRef.createNestApplication();

  // O mesmo CORS do `main.ts`: reflete a origem permitida, com credenciais.
  app.enableCors({ origin: ['https://delcastanher.srv.br'], credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, stopAtFirstError: true }),
  );
  await app.init();

  return app;
}

/**
 * Spec 022, decisao 16: as rotas publicas novas ficam na CDN por um minuto, e
 * as admin nunca ficam em cache compartilhado.
 */
describe('Cache das rotas publicas (HTTP)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('usa o cabecalho da decisao 16', () => {
    expect(PUBLIC_CACHE_CONTROL).toBe(
      'public, max-age=60, s-maxage=60, stale-while-revalidate=600, stale-if-error=86400',
    );
  });

  for (const path of ['/legal/documents/privacy', '/legal/policy-version', '/courses/imersao-rh/summary']) {
    it(`${path} responde com cache publico`, async () => {
      const response = await request(app.getHttpServer()).get(path).expect(200);

      expect(response.headers['cache-control']).toBe(PUBLIC_CACHE_CONTROL);
    });

    it(`${path} responde igual com e sem Authorization`, async () => {
      const anonymous = await request(app.getHttpServer()).get(path).expect(200);
      const logged = await request(app.getHttpServer()).get(path).set('Authorization', 'Bearer x').expect(200);

      expect(logged.body).toEqual(anonymous.body);
      expect(logged.headers['cache-control']).toBe(PUBLIC_CACHE_CONTROL);
    });
  }

  // A CDN guarda uma resposta so para todo mundo. Com o CORS por origem, a
  // resposta gravada para o build (sem Origin) seria servida ao navegador sem
  // `Access-Control-Allow-Origin`, e a pagina nao conseguiria le-la.
  it('a resposta publica vale para qualquer origem, sem credenciais', async () => {
    const semOrigem = await request(app.getHttpServer()).get('/legal/policy-version').expect(200);
    const doSite = await request(app.getHttpServer())
      .get('/legal/policy-version')
      .set('Origin', 'https://delcastanher.srv.br')
      .expect(200);

    for (const response of [semOrigem, doSite]) {
      expect(response.headers['access-control-allow-origin']).toBe('*');
      expect(response.headers['access-control-allow-credentials']).toBeUndefined();
    }
  });

  it('as rotas admin mantem o CORS por origem, com credenciais', async () => {
    const response = await request(app.getHttpServer())
      .get('/admin/legal/documents')
      .set('Authorization', 'Bearer x')
      .set('Origin', 'https://delcastanher.srv.br')
      .expect(200);

    expect(response.headers['access-control-allow-origin']).toBe('https://delcastanher.srv.br');
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });

  // Um robo pedindo os Termos em laco bate na CDN, e nao no banco.
  it('o 404 tambem vai para o cache', async () => {
    const terms = await request(app.getHttpServer()).get('/legal/documents/terms').expect(404);
    const course = await request(app.getHttpServer()).get('/courses/outro/summary').expect(404);

    expect(terms.headers['cache-control']).toBe(PUBLIC_CACHE_CONTROL);
    expect(course.headers['cache-control']).toBe(PUBLIC_CACHE_CONTROL);
  });

  for (const path of ['/admin/legal/documents', '/admin/legal/documents/privacy/versions', '/admin/courses/imersao-rh']) {
    it(`${path} responde no-store`, async () => {
      const response = await request(app.getHttpServer()).get(path).set('Authorization', 'Bearer x').expect(200);

      expect(response.headers['cache-control']).toBe('no-store');
    });
  }
});
