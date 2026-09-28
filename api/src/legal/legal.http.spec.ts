import { INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthService } from '../auth/auth.service';
import { AuthUser, Role } from '../auth/auth.types';
import { AuthenticatedRequest, FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { AdminLegalController } from './admin-legal.controller';
import { LegalController } from './legal.controller';
import { LegalDocumentsService } from './legal-documents.service';

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

function fakeService() {
  return {
    current: jest.fn(async (kind: string) => (kind === 'PRIVACY' ? PRIVACY : null)),
    policyVersion: jest.fn().mockResolvedValue('2026-09-13'),
    published: jest.fn().mockResolvedValue(['PRIVACY', 'COOKIES']),
    adminList: jest.fn().mockResolvedValue({ policyVersion: '2026-09-13', documents: [] }),
    versions: jest.fn().mockResolvedValue([]),
    saveDraft: jest.fn(async (_user: AuthUser, _kind: string, content: string) => ({
      content,
      updatedAt: new Date(),
      updatedByEmail: 'admin@delcastanher.com',
    })),
    discardDraft: jest.fn().mockResolvedValue(undefined),
    publish: jest.fn().mockResolvedValue({ ...PRIVACY, id: 'v2', changeKind: 'CORRECTION' }),
  };
}

async function buildApp(role: Role | null = 'admin', service = fakeService()) {
  const moduleRef = await Test.createTestingModule({
    controllers: [LegalController, AdminLegalController],
    providers: [
      Reflector,
      RolesGuard,
      { provide: LegalDocumentsService, useValue: service },
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

  return { app, service };
}

const ADMIN = '/admin/legal/documents';

/** Spec 022: rotas dos documentos legais. */
describe('Documentos legais (HTTP)', () => {
  let app: INestApplication;

  afterEach(async () => {
    await app?.close();
  });

  describe('rotas publicas', () => {
    it('devolvem o documento vigente sem sessao', async () => {
      ({ app } = await buildApp(null));

      const response = await request(app.getHttpServer()).get('/legal/documents/privacy').expect(200);

      expect(response.body).toEqual({
        kind: 'PRIVACY',
        content: PRIVACY.content,
        policyVersion: '2026-09-13',
        publishedAt: PRIVACY.publishedAt.toISOString(),
      });
    });

    it('nao expoem o autor da publicacao', async () => {
      ({ app } = await buildApp(null));

      const response = await request(app.getHttpServer()).get('/legal/documents/privacy').expect(200);

      expect(response.body).not.toHaveProperty('publishedById');
      expect(response.body).not.toHaveProperty('publishedByEmail');
    });

    it('404 para os Termos sem publicacao', async () => {
      ({ app } = await buildApp(null));

      await request(app.getHttpServer()).get('/legal/documents/terms').expect(404);
    });

    it('recusa kind invalido', async () => {
      ({ app } = await buildApp(null));

      await request(app.getHttpServer()).get('/legal/documents/contrato').expect(400);
      await request(app.getHttpServer()).get('/legal/documents/PRIVACY').expect(400);
    });

    it('devolvem a versao da politica vigente e os documentos publicados, sem sessao', async () => {
      ({ app } = await buildApp(null));

      const response = await request(app.getHttpServer()).get('/legal/policy-version').expect(200);

      // `published` monta o rotulo do aceite no onboarding (decisao 6) sem
      // baixar o texto dos tres documentos.
      expect(response.body).toEqual({ version: '2026-09-13', published: ['PRIVACY', 'COOKIES'] });
    });
  });

  describe('autorizacao das rotas admin', () => {
    // Uma funcao por rota: o supertest abre a conexao quando a chamada e
    // criada, e criar todas antes de esperar a primeira as derruba.
    const routes = (server: ReturnType<INestApplication['getHttpServer']>) => [
      () => request(server).get(ADMIN),
      () => request(server).put(`${ADMIN}/privacy/draft`).send({ content: 'x' }),
      () => request(server).delete(`${ADMIN}/privacy/draft`),
      () => request(server).post(`${ADMIN}/privacy/publish`).send({ changeKind: 'CORRECTION' }),
      () => request(server).get(`${ADMIN}/privacy/versions`),
    ];

    it('401 sem sessao', async () => {
      ({ app } = await buildApp(null));

      for (const call of routes(app.getHttpServer())) {
        await call().expect(401);
      }
    });

    it('403 com papel aluno', async () => {
      ({ app } = await buildApp('aluno'));

      for (const call of routes(app.getHttpServer())) {
        await call().expect(403);
      }
    });
  });

  describe('rotas admin', () => {
    it('lista os documentos', async () => {
      let service: ReturnType<typeof fakeService>;
      ({ app, service } = await buildApp());

      await request(app.getHttpServer()).get(ADMIN).expect(200);

      expect(service.adminList).toHaveBeenCalled();
    });

    it('salva o rascunho com o autor do token, e nao do corpo', async () => {
      let service: ReturnType<typeof fakeService>;
      ({ app, service } = await buildApp());

      await request(app.getHttpServer())
        .put(`${ADMIN}/terms/draft`)
        .send({ content: '## 1. Aceitação\n\nTexto.' })
        .expect(200);

      expect(service.saveDraft).toHaveBeenCalledWith(
        expect.objectContaining({ uid: 'uid-1', email: 'admin@delcastanher.com' }),
        'TERMS',
        '## 1. Aceitação\n\nTexto.',
      );

      await request(app.getHttpServer())
        .put(`${ADMIN}/terms/draft`)
        .send({ content: 'x', updatedByEmail: 'outro@x.com' })
        .expect(400);
    });

    it('recusa rascunho sem texto', async () => {
      ({ app } = await buildApp());

      await request(app.getHttpServer()).put(`${ADMIN}/terms/draft`).send({}).expect(400);
      await request(app.getHttpServer()).put(`${ADMIN}/terms/draft`).send({ content: 42 }).expect(400);
    });

    it('descarta o rascunho', async () => {
      let service: ReturnType<typeof fakeService>;
      ({ app, service } = await buildApp());

      await request(app.getHttpServer()).delete(`${ADMIN}/cookies/draft`).expect(204);

      expect(service.discardDraft).toHaveBeenCalledWith('COOKIES');
    });

    it('publica com o tipo da mudanca', async () => {
      let service: ReturnType<typeof fakeService>;
      ({ app, service } = await buildApp());

      await request(app.getHttpServer())
        .post(`${ADMIN}/privacy/publish`)
        .send({ changeKind: 'CORRECTION' })
        .expect(201);

      expect(service.publish).toHaveBeenCalledWith(expect.objectContaining({ uid: 'uid-1' }), 'PRIVACY', 'CORRECTION');
    });

    it('recusa publicar como carga inicial ou tipo desconhecido', async () => {
      ({ app } = await buildApp());

      for (const changeKind of ['INITIAL', 'QUALQUER', undefined]) {
        await request(app.getHttpServer()).post(`${ADMIN}/privacy/publish`).send({ changeKind }).expect(400);
      }
    });

    it('recusa kind invalido', async () => {
      ({ app } = await buildApp());

      await request(app.getHttpServer()).get(`${ADMIN}/contrato/versions`).expect(400);
    });

    it('lista o historico', async () => {
      let service: ReturnType<typeof fakeService>;
      ({ app, service } = await buildApp());

      await request(app.getHttpServer()).get(`${ADMIN}/privacy/versions`).expect(200);

      expect(service.versions).toHaveBeenCalledWith('PRIVACY');
    });

    // Decisao 2: versao publicada nao se altera nem se apaga, por rota nenhuma.
    it('nao tem rota que altere ou apague versao publicada', async () => {
      ({ app } = await buildApp());
      const server = app.getHttpServer();

      await request(server).patch(`${ADMIN}/privacy`).send({ content: 'x' }).expect(404);
      await request(server).put(`${ADMIN}/privacy`).send({ content: 'x' }).expect(404);
      await request(server).delete(`${ADMIN}/privacy`).expect(404);
      await request(server).patch(`${ADMIN}/privacy/versions/v1`).send({ content: 'x' }).expect(404);
      await request(server).delete(`${ADMIN}/privacy/versions/v1`).expect(404);
      await request(server).delete(`${ADMIN}/privacy/versions`).expect(404);
    });
  });
});
