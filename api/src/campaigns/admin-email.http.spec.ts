import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthService } from '../auth/auth.service';
import { Role } from '../auth/auth.types';
import { AuthenticatedRequest, FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { AdminEmailController } from './admin-email.controller';
import { CampaignsService } from './campaigns.service';

const DRAFT = { segment: 'ALL_ACTIVE', subject: 'Aula nova', body: 'Ola!' };

async function buildApp(role: Role | null = 'admin') {
  const campaigns = {
    segments: jest.fn().mockResolvedValue([{ id: 'ALL_ACTIVE', label: 'Todos', count: 3 }]),
    sendTest: jest.fn().mockResolvedValue({ sentTo: 'admin@delcastanher.com' }),
    create: jest.fn().mockResolvedValue({ id: 'cmp-1', status: 'SENT' }),
    resume: jest.fn().mockResolvedValue({ id: 'cmp-1', status: 'SENT' }),
    list: jest.fn().mockResolvedValue([]),
  };

  const moduleRef = await Test.createTestingModule({
    controllers: [AdminEmailController],
    providers: [
      Reflector,
      RolesGuard,
      { provide: CampaignsService, useValue: campaigns },
      { provide: AuthService, useValue: { verify: jest.fn() } },
    ],
  })
    .overrideGuard(FirebaseAuthGuard)
    .useValue({
      canActivate: (context: { switchToHttp: () => { getRequest: () => AuthenticatedRequest } }) => {
        if (role) {
          context.switchToHttp().getRequest().user = {
            uid: 'uid-admin',
            email: 'admin@delcastanher.com',
            name: 'Admin',
            role,
          };
        }

        return true;
      },
    })
    .compile();

  const app: INestApplication = moduleRef.createNestApplication();

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, stopAtFirstError: true }),
  );
  await app.init();

  return { app, campaigns };
}

/** Spec 023, decisoes B2, B4 e B6. */
describe('/admin/email', () => {
  it('recusa aluno com 403 e quem nao tem sessao com 401, em todas as rotas', async () => {
    for (const [role, status] of [['aluno', 403], [null, 401]] as const) {
      const { app, campaigns } = await buildApp(role);
      const server = app.getHttpServer();

      await request(server).get('/admin/email/segments').expect(status);
      await request(server).post('/admin/email/test').send(DRAFT).expect(status);
      await request(server).post('/admin/email/campaigns').send(DRAFT).expect(status);
      await request(server).post('/admin/email/campaigns/cmp-1/resume').expect(status);
      await request(server).get('/admin/email/campaigns').expect(status);

      expect(campaigns.create).not.toHaveBeenCalled();
      expect(campaigns.sendTest).not.toHaveBeenCalled();

      await app.close();
    }
  });

  it('lista os segmentos com a contagem', async () => {
    const { app } = await buildApp();

    const response = await request(app.getHttpServer()).get('/admin/email/segments').expect(200);

    expect(response.body).toEqual([{ id: 'ALL_ACTIVE', label: 'Todos', count: 3 }]);

    await app.close();
  });

  it('o teste vai para o admin do token, e nao para um e-mail do corpo', async () => {
    const { app, campaigns } = await buildApp();

    await request(app.getHttpServer())
      .post('/admin/email/test')
      .send({ ...DRAFT, to: 'outra@pessoa.com' })
      .expect(400);

    await request(app.getHttpServer()).post('/admin/email/test').send(DRAFT).expect(200);

    expect(campaigns.sendTest.mock.calls[0][0]).toMatchObject({ uid: 'uid-admin', email: 'admin@delcastanher.com' });

    await app.close();
  });

  // Decisao B2: o front manda o nome do segmento, e nunca uma lista.
  it('recusa segmento fora dos tres e lista de e-mails no corpo', async () => {
    const { app, campaigns } = await buildApp();
    const server = app.getHttpServer();

    await request(server).post('/admin/email/campaigns').send({ ...DRAFT, segment: 'TODOS' }).expect(400);
    await request(server)
      .post('/admin/email/campaigns')
      .send({ ...DRAFT, emails: ['a@b.com'] })
      .expect(400);
    await request(server).post('/admin/email/campaigns').send({ ...DRAFT, subject: ' ' }).expect(400);

    expect(campaigns.create).not.toHaveBeenCalled();

    await app.close();
  });

  it('dispara com o admin do token como autor, e retoma pelo id', async () => {
    const { app, campaigns } = await buildApp();
    const server = app.getHttpServer();

    await request(server).post('/admin/email/campaigns').send(DRAFT).expect(201);
    await request(server).post('/admin/email/campaigns/cmp-1/resume').expect(200);
    await request(server).get('/admin/email/campaigns').expect(200);

    expect(campaigns.create.mock.calls[0][0].uid).toBe('uid-admin');
    expect(campaigns.create.mock.calls[0][1]).toEqual(DRAFT);
    expect(campaigns.resume).toHaveBeenCalledWith('cmp-1');
    expect(campaigns.list).toHaveBeenCalled();

    await app.close();
  });
});
