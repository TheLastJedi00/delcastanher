import { INestApplication, NotFoundException, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AuthService } from '../auth/auth.service';
import { AuthUser } from '../auth/auth.types';
import { AuthenticatedRequest, FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { ProgressController } from './progress.controller';
import { ProgressService } from './progress.service';

const USER: AuthUser = {
  uid: 'uid-123',
  email: 'aluno@delcastanher.com',
  name: 'Aluno Teste',
  role: 'aluno',
};

const PROGRESS = {
  course: { slug: 'imersao-rh', title: 'Imersão RH Estratégico', workloadHours: null },
  modules: [{ id: 'm1', order: 1, title: 'Fundamentos', summary: 'Resumo', completed: false }],
  completedCount: 0,
  totalCount: 1,
  percentage: 0,
  nextModule: { id: 'm1', order: 1, title: 'Fundamentos', summary: 'Resumo', completed: false },
  completed: false,
};

/**
 * Mesmo arranjo do `users.http.spec.ts`: sobe somente o controller, com o
 * ValidationPipe global do `main.ts`, e troca o guard por um que injeta um
 * usuario fixo. O que se testa aqui e o contrato HTTP, nao o token.
 */
async function buildApp(progress: Partial<Record<keyof ProgressService, jest.Mock>>) {
  const moduleRef = await Test.createTestingModule({
    controllers: [ProgressController],
    providers: [
      { provide: ProgressService, useValue: progress },
      { provide: AuthService, useValue: { verify: jest.fn() } },
    ],
  })
    .overrideGuard(FirebaseAuthGuard)
    .useValue({
      canActivate: (context: { switchToHttp: () => { getRequest: () => AuthenticatedRequest } }) => {
        context.switchToHttp().getRequest().user = USER;

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

describe('Progress (HTTP)', () => {
  let app: INestApplication;

  afterEach(async () => {
    await app?.close();
  });

  it('GET /progress/me devolve o progresso do usuario da sessao', async () => {
    const findForUser = jest.fn().mockResolvedValue(PROGRESS);
    app = await buildApp({ findForUser });

    const response = await request(app.getHttpServer()).get('/progress/me').expect(200);

    expect(response.body).toEqual(PROGRESS);
    expect(findForUser).toHaveBeenCalledWith(USER);
  });

  it('PATCH marca o modulo e devolve o progresso recalculado', async () => {
    const updated = { ...PROGRESS, completedCount: 1, percentage: 100, completed: true };
    const setModuleCompletion = jest.fn().mockResolvedValue(updated);
    app = await buildApp({ setModuleCompletion });

    const response = await request(app.getHttpServer())
      .patch('/progress/me/modules/m1')
      .send({ completed: true })
      .expect(200);

    expect(setModuleCompletion).toHaveBeenCalledWith(USER, 'm1', true);
    expect(response.body).toMatchObject({ percentage: 100 });
  });

  it('PATCH aceita desmarcar o modulo', async () => {
    const setModuleCompletion = jest.fn().mockResolvedValue(PROGRESS);
    app = await buildApp({ setModuleCompletion });

    await request(app.getHttpServer())
      .patch('/progress/me/modules/m1')
      .send({ completed: false })
      .expect(200);

    expect(setModuleCompletion).toHaveBeenCalledWith(USER, 'm1', false);
  });

  it('PATCH responde 400 sem o campo completed', async () => {
    const setModuleCompletion = jest.fn();
    app = await buildApp({ setModuleCompletion });

    const response = await request(app.getHttpServer())
      .patch('/progress/me/modules/m1')
      .send({})
      .expect(400);

    expect(response.body.message).toEqual(['Informe `completed` como true ou false.']);
    expect(setModuleCompletion).not.toHaveBeenCalled();
  });

  it('PATCH responde 400 quando completed nao e booleano', async () => {
    app = await buildApp({ setModuleCompletion: jest.fn() });

    await request(app.getHttpServer())
      .patch('/progress/me/modules/m1')
      .send({ completed: 'sim' })
      .expect(400);
  });

  it('PATCH recusa campo desconhecido no corpo', async () => {
    const setModuleCompletion = jest.fn();
    app = await buildApp({ setModuleCompletion });

    // O alvo da escrita vem da sessao e da URL: mandar userId no corpo e recusado.
    await request(app.getHttpServer())
      .patch('/progress/me/modules/m1')
      .send({ completed: true, userId: 'uid-de-outro' })
      .expect(400);

    expect(setModuleCompletion).not.toHaveBeenCalled();
  });

  it('PATCH responde 404 para um modulo inexistente', async () => {
    app = await buildApp({
      setModuleCompletion: jest.fn().mockRejectedValue(new NotFoundException('Modulo')),
    });

    await request(app.getHttpServer())
      .patch('/progress/me/modules/nao-existe')
      .send({ completed: true })
      .expect(404);
  });
});
