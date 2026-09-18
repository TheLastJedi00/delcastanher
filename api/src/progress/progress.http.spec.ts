import { INestApplication, NotFoundException, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AccessService } from '../payments/access.service';
import request from 'supertest';
import { AuthService } from '../auth/auth.service';
import { AuthUser } from '../auth/auth.types';
import { AuthenticatedRequest, FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { ProgressController } from './progress.controller';
import { ProgressService } from './progress.service';
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


const USER: AuthUser = {
  uid: 'uid-123',
  email: 'aluno@delcastanher.com',
  name: 'Aluno Teste',
  role: 'aluno',
};

const LESSON = {
  id: 'l1',
  order: 1,
  title: 'O papel do RH',
  summary: 'Aula 1',
  completed: false,
  hasVideo: true,
  videoReady: true,
  durationSeconds: 754,
};

const MODULE = {
  id: 'm1',
  order: 1,
  title: 'Fundamentos',
  summary: 'Resumo',
  completed: false,
  lessons: [LESSON],
  completedCount: 0,
  totalCount: 1,
  nextLesson: LESSON,
};

const PROGRESS = {
  course: { slug: 'imersao-rh', title: 'Imersão RH Estratégico', workloadHours: null },
  modules: [MODULE],
  completedCount: 0,
  totalCount: 1,
  percentage: 0,
  nextModule: MODULE,
  nextLesson: LESSON,
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
      { provide: AccessService, useValue: acessoLiberado() },
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

  it('PATCH marca a aula e devolve o progresso recalculado', async () => {
    const updated = { ...PROGRESS, completedCount: 1, percentage: 100, completed: true };
    const setLessonCompletion = jest.fn().mockResolvedValue(updated);
    app = await buildApp({ setLessonCompletion });

    const response = await request(app.getHttpServer())
      .patch('/progress/me/lessons/l1')
      .send({ completed: true })
      .expect(200);

    expect(setLessonCompletion).toHaveBeenCalledWith(USER, 'l1', true);
    expect(response.body).toMatchObject({ percentage: 100 });
  });

  it('PATCH aceita desmarcar a aula', async () => {
    const setLessonCompletion = jest.fn().mockResolvedValue(PROGRESS);
    app = await buildApp({ setLessonCompletion });

    await request(app.getHttpServer())
      .patch('/progress/me/lessons/l1')
      .send({ completed: false })
      .expect(200);

    expect(setLessonCompletion).toHaveBeenCalledWith(USER, 'l1', false);
  });

  it('PATCH responde 400 sem o campo completed', async () => {
    const setLessonCompletion = jest.fn();
    app = await buildApp({ setLessonCompletion });

    const response = await request(app.getHttpServer())
      .patch('/progress/me/lessons/l1')
      .send({})
      .expect(400);

    expect(response.body.message).toEqual(['Informe `completed` como true ou false.']);
    expect(setLessonCompletion).not.toHaveBeenCalled();
  });

  it('PATCH responde 400 quando completed nao e booleano', async () => {
    app = await buildApp({ setLessonCompletion: jest.fn() });

    await request(app.getHttpServer())
      .patch('/progress/me/lessons/l1')
      .send({ completed: 'sim' })
      .expect(400);
  });

  it('PATCH recusa campo desconhecido no corpo', async () => {
    const setLessonCompletion = jest.fn();
    app = await buildApp({ setLessonCompletion });

    // O alvo da escrita vem da sessao e da URL: mandar userId no corpo e recusado.
    await request(app.getHttpServer())
      .patch('/progress/me/lessons/l1')
      .send({ completed: true, userId: 'uid-de-outro' })
      .expect(400);

    expect(setLessonCompletion).not.toHaveBeenCalled();
  });

  it('a rota antiga por modulo nao existe mais', async () => {
    const setLessonCompletion = jest.fn();
    app = await buildApp({ setLessonCompletion });

    // Removida, e nao redirecionada (decisao 5): marcar um modulo concluiria em
    // cascata aulas que o aluno nao assistiu.
    await request(app.getHttpServer())
      .patch('/progress/me/modules/m1')
      .send({ completed: true })
      .expect(404);

    expect(setLessonCompletion).not.toHaveBeenCalled();
  });

  it('PATCH responde 404 para uma aula inexistente', async () => {
    app = await buildApp({
      setLessonCompletion: jest.fn().mockRejectedValue(new NotFoundException('Aula')),
    });

    await request(app.getHttpServer())
      .patch('/progress/me/lessons/nao-existe')
      .send({ completed: true })
      .expect(404);
  });
});
